// TST-24 (update flow, two tabs), TST-24b (precache integrity behind a stale proxy) and a regression test for
// a failed re-install of a build with the same content hash. Written by the test agent.
// Builds three throw-away artifacts with tools/build.mjs (dist-tst-a, dist-tst-a2, dist-tst-b; git-ignored by `dist-*/`).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from '../../tools/serve.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const DIRS = { a: 'dist-tst-a', a2: 'dist-tst-a2', b: 'dist-tst-b' };
const build = (out, version) => execFileSync(process.execPath, ['tools/build.mjs', '--out', out, '--version', version, '--audio', 'off'], { cwd: ROOT, stdio: 'pipe' });
const hashOf = d => JSON.parse(fs.readFileSync(path.join(ROOT, d, 'build.json'), 'utf8')).hash;

let browser, server, BASE;
let current = null;                       // request handler of the build being served
const use = (dir, opts = {}) => { current = createServer(path.join(ROOT, dir), { cacheControl: 'max-age=600', ...opts }).listeners('request')[0]; };

before(async () => {
  build(DIRS.a, '9.0.1');
  await new Promise(r => setTimeout(r, 1100));   // build.json carries the build time
  build(DIRS.a2, '9.0.1');
  build(DIRS.b, '9.0.2');
  server = http.createServer((req, res) => current(req, res));
  await new Promise(r => server.listen(0, r));
  BASE = `http://localhost:${server.address().port}/`;
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close(); server?.close();
  for (const d of Object.values(DIRS)) fs.rmSync(path.join(ROOT, d), { recursive: true, force: true });
});

async function open(ctx, url) {
  const p = await ctx.newPage(); p.loads = 0; p.errors = [];
  p.on('load', () => p.loads++);
  p.on('pageerror', e => p.errors.push(e.message));
  await p.goto(BASE + url); await p.waitForLoadState('networkidle');
  return p;
}
const controlled = p => p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
const swState = p => p.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  return { caches: (await caches.keys()).sort(), waiting: !!reg?.waiting, installing: !!reg?.installing, active: !!reg?.active };
});
const checkUpdate = p => p.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); await reg.update().catch(() => {}); });
const versionSeen = p => p.evaluate(async () => (await (await fetch(new URL('build.json', document.querySelector('link[rel=manifest]').href))).json()).version);
/** Wait until the registration has no installing worker (install finished or failed). */
const installSettled = (p, ms = 30000) => p.waitForFunction(async () => { const r = await navigator.serviceWorker.getRegistration(); return r && !r.installing; }, null, { timeout: ms, polling: 250 });

test('TST-24: build A → build B: toast in both tabs, «حدّث الآن», each tab reloads exactly once, state survives (OFF-10/11, EX-17)', async () => {
  use(DIRS.a);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const t1 = await open(ctx, ''); await controlled(t1);
  const t2 = await open(ctx, 'exam/?id=baqarah-1'); await controlled(t2);
  await t2.click('.rt[data-round="next"]'); await t2.locator('button.g.ok').first().click(); await t2.waitForTimeout(200);
  assert.equal(await versionSeen(t1), '9.0.1');
  assert.deepEqual((await swState(t1)).caches, ['khayr-app-' + hashOf(DIRS.a)]);

  use(DIRS.b);
  const l1 = t1.loads, l2 = t2.loads;
  await checkUpdate(t1);
  await t1.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting, null, { timeout: 30000 });
  // the new worker waits; nothing reloads without a tap
  await t1.waitForTimeout(500);
  assert.equal(t1.loads, l1, 'tab 1 must not reload before the tap'); assert.equal(t2.loads, l2, 'tab 2 must not reload before the tap');
  await t1.getByText('يتوفر تحديث').first().waitFor({ timeout: 5000 });
  await t2.getByText('يتوفر تحديث').first().waitFor({ timeout: 5000 });
  assert.equal(await versionSeen(t2), '9.0.1', 'the old build still serves the open tabs while B waits');

  await t1.getByRole('button', { name: 'حدّث الآن' }).first().click();
  await t1.waitForFunction(() => document.readyState === 'complete' && !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  await t1.waitForTimeout(2500);  // leave room for a second (wrong) reload
  assert.equal(t1.loads, l1 + 1, 'tab 1 reloads exactly once'); assert.equal(t2.loads, l2 + 1, 'tab 2 reloads exactly once');
  assert.equal(await versionSeen(t1), '9.0.2'); assert.equal(await versionSeen(t2), '9.0.2');
  assert.deepEqual((await swState(t1)).caches, ['khayr-app-' + hashOf(DIRS.b)], 'the old app cache is deleted on activate (OFF-11)');
  // the second tab works after the reload and kept its attempt
  await t2.waitForSelector('button.g.ok[aria-pressed="true"]', { timeout: 5000 });
  assert.equal(await t2.locator('button.g[aria-pressed="true"]').count(), 1);
  await t2.locator('button.g.mid').nth(1).click();
  assert.match(await t2.textContent('#score'), /✓ ١ · متردد ١/);
  await ctx.setOffline(true);
  await t2.reload(); await t2.waitForSelector('#score');
  assert.match(await t2.textContent('#score'), /✓ ١ · متردد ١/);
  assert.deepEqual(t1.errors.concat(t2.errors), []);
  await ctx.close();
});

test('TST-24b: a proxy serves one stale file from build A → B does not install, A keeps control online and offline; fixed proxy → B installs (OFF-02a)', async () => {
  use(DIRS.a);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await open(ctx, ''); await controlled(p);
  const cacheA = 'khayr-app-' + hashOf(DIRS.a);
  // B behind a proxy that still returns A's config.json (max-age=600 edge cache)
  let staleHits = 0;
  use(DIRS.b, { intercept: (req, res, u) => {
    if (u.pathname !== '/config.json') return false;
    staleHits++; const body = fs.readFileSync(path.join(ROOT, DIRS.a, 'config.json'));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'max-age=600', 'Content-Length': body.length }); res.end(body); return true;
  } });
  await checkUpdate(p);
  await p.waitForTimeout(7000);          // first attempt + the 5 s retry
  await installSettled(p);
  let s = await swState(p);
  assert.ok(staleHits >= 2, `the stale file is retried once after 5 s (hits: ${staleHits})`);
  assert.equal(s.waiting, false, 'B must not reach the waiting state with a mismatching file');
  assert.deepEqual(s.caches, [cacheA], 'only A\'s cache remains');
  assert.equal(await versionSeen(p), '9.0.1', 'A keeps serving online');
  await ctx.setOffline(true);
  for (const u of ['', 'plan/', 'exam/?id=tuhfa', 'random/', 'history/', 'listen/', 'settings/', 'about/', 'privacy/']) {
    await p.goto(BASE + u); await p.waitForSelector('#footer a');
    const okPage = await p.waitForFunction(() => document.querySelector('#main').innerText.length > 20 && !document.querySelector('#main .banner.warn'), null, { timeout: 8000 }).then(() => true, () => false);
    assert.ok(okPage, `${u} renders offline under A`);
  }
  await ctx.setOffline(false);
  // proxy fixed → next check installs B
  use(DIRS.b);
  await checkUpdate(p);
  await p.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting, null, { timeout: 30000 });
  s = await swState(p);
  assert.deepEqual(s.caches, [cacheA, 'khayr-app-' + hashOf(DIRS.b)].sort());
  await ctx.close();
});

test('OFF-02a.5: a failed install of a re-deploy with the SAME content hash leaves the active cache intact (offline keeps working)', async () => {
  assert.equal(hashOf(DIRS.a), hashOf(DIRS.a2), 'precondition: same content → same BUILD_HASH (only build.json differs)');
  assert.notEqual(fs.readFileSync(path.join(ROOT, DIRS.a, 'sw.js'), 'utf8'), fs.readFileSync(path.join(ROOT, DIRS.a2, 'sw.js'), 'utf8'), 'precondition: sw.js bytes differ, so the browser installs it');
  use(DIRS.a);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await open(ctx, ''); await controlled(p);
  const cacheA = 'khayr-app-' + hashOf(DIRS.a);
  assert.deepEqual((await swState(p)).caches, [cacheA]);
  // the re-deploy is reachable for sw.js, but one asset fails (flaky network during the update)
  use(DIRS.a2, { intercept: (req, res, u) => { if (u.pathname !== '/assets/css/app.css') return false; res.writeHead(503); res.end(); return true; } });
  await checkUpdate(p);
  await p.waitForTimeout(7000);
  await installSettled(p);
  const s = await swState(p);
  assert.equal(s.waiting, false);
  assert.deepEqual(s.caches, [cacheA], 'the cache of the worker that is still in control must not be deleted by the failed install');
  await ctx.setOffline(true);
  await p.goto(BASE + 'plan/').catch(() => {});
  assert.match(await p.title(), /خطة تثبيت البقرة/, 'the controlling worker still serves pages offline');
  await ctx.close();
});

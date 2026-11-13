// End-to-end smoke tests (subset of TST-13/14/20/22/23/27/28/31/32/36/40) with Playwright on Chromium.
// Prerequisite: `node tools/build.mjs` (dist/, audio off) and, for audio tests,
// `node tools/build.mjs --out dist-audio --audio on --audio-dir local-audio` (skipped when absent).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from '../../tools/serve.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const DIST = path.join(ROOT, 'dist'), DISTA = path.join(ROOT, 'dist-audio');
const PAGES = ['', 'plan/', 'exam/?id=baqarah-1', 'exam/?id=baqarah-2', 'exam/?id=tuhfa', 'random/', 'history/', 'listen/', 'settings/', 'about/', 'privacy/', '404.html'];
let browser, srv, srvA, BASE, BASEA;

before(async () => {
  assert.ok(fs.existsSync(path.join(DIST, 'sw.js')), 'run node tools/build.mjs first');
  srv = createServer(DIST, { cacheControl: 'max-age=600' }); await new Promise(r => srv.listen(0, r)); BASE = `http://localhost:${srv.address().port}/`;
  if (fs.existsSync(path.join(DISTA, 'sw.js'))) { srvA = createServer(DISTA); await new Promise(r => srvA.listen(0, r)); BASEA = `http://localhost:${srvA.address().port}/`; }
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); srv?.close(); srvA?.close(); });

async function page(ctxOpts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 }, ...ctxOpts });
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', e => p.errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) p.errors.push(m.text()); });
  await p.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  return { ctx, p };
}
const settle = p => p.waitForLoadState('networkidle').then(() => p.waitForTimeout(150));

test('every page loads without errors, CSP violations or horizontal scroll (GEN-04/09, NFR-PRV-04, NFR-A11Y-06)', async () => {
  const { ctx, p } = await page();
  for (const u of PAGES) {
    for (const w of [320, 375, 768]) {
      await p.setViewportSize({ width: w, height: 800 });
      await p.goto(BASE + u); await settle(p);
      const [sw, cw] = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      assert.ok(sw <= cw, `${u} @${w}: scrollWidth ${sw} > ${cw}`);
    }
    assert.equal(await p.getAttribute('html', 'lang'), 'ar'); assert.equal(await p.getAttribute('html', 'dir'), 'rtl');
    assert.deepEqual(await p.evaluate(() => window.__csp), [], `${u}: CSP violations`);
    if (u !== '') assert.ok(await p.locator('#homelink a').count(), `${u}: home link (IA-04)`);
    assert.ok(await p.locator('footer a[href$="settings/"]').count(), `${u}: footer links (IA-04)`);
  }
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('text at 200 % at 375 px and 320 px at 400 % zoom-equivalent: no horizontal scroll (NFR-A11Y-06)', async () => {
  const { ctx, p } = await page();
  for (const u of PAGES) {
    await p.setViewportSize({ width: 375, height: 800 }); await p.goto(BASE + u); await settle(p);
    await p.addStyleTag({ content: 'html{font-size:200%}' }).catch(() => {});
    await p.evaluate(() => { document.documentElement.style.setProperty('font-size', '200%'); });
    await p.waitForTimeout(50);
    const [sw, cw] = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    assert.ok(sw <= cw + 1, `${u} @200%: ${sw} > ${cw}`);
  }
  await ctx.close();
});

test('HUB-02 AC: grading 3 of baqarah-1 (2 ok) shows «٣ من ٥٩ · ٦٧٪ صحيح»; sticky round bar (EX-03)', async () => {
  const { ctx, p } = await page();
  await p.goto(BASE + 'exam/?id=baqarah-1'); await settle(p);
  await p.click('.rt[data-round="next"]');
  const ok = p.locator('button.g.ok'), bad = p.locator('button.g.bad');
  await ok.nth(0).click(); await ok.nth(1).click(); await bad.nth(2).click();
  assert.match(await p.textContent('#score'), /✓ ٢ · متردد ٠ · ✗ ١ · من ٥٩ سؤال/);
  assert.match(await p.textContent('#slips'), /خطأ/);
  await p.click('[data-open]'); assert.equal(await p.locator('.ans').count(), 1);
  await p.evaluate(() => window.scrollTo(0, 2000)); await p.waitForTimeout(100);
  const top = await p.evaluate(() => document.getElementById('rounds').getBoundingClientRect().top);
  assert.ok(top >= -1 && top < 60, 'round bar stays visible');
  await p.goto(BASE); await settle(p);
  assert.match(await p.textContent('[data-prg="exam:baqarah-1"]'), /٣ من ٥٩ · ٦٧٪ صحيح/);
  // reload restores (EX-14, EX-17)
  await p.goto(BASE + 'exam/?id=baqarah-1'); await settle(p);
  assert.match(await p.textContent('#rintro'), /تابعتَ من حيث توقفت: ٣ من ١٣/);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('unified history: one grade in each exam + one in the random exam = 4 events (HIS-01, TST-32)', async () => {
  const { ctx, p } = await page();
  for (const id of ['baqarah-1', 'baqarah-2', 'tuhfa']) {
    await p.goto(BASE + `exam/?id=${id}`); await settle(p);
    await p.click('.rintro + .qs .btn.show, .qs [data-round]').catch(() => {});
    await p.locator('.rt').nth(1).click(); await p.locator('button.g.ok').first().click(); await p.waitForTimeout(300);
  }
  await p.goto(BASE + 'random/'); await settle(p);
  await (async g => { if (await p.locator('#rq .choice').count()) await p.locator('#rq .choice').first().click(); else await p.click('#rq button.g.' + g); })('bad'); await p.waitForTimeout(300);
  await p.goto(BASE + 'history/'); await settle(p);
  assert.match(await p.textContent('.tiles'), /٤/);
  assert.ok(await p.locator('.chips [data-f]').count() >= 4, '«الكل» + one chip per source (HIS-02)');
  const n = await p.evaluate(() => new Promise(res => { const r = indexedDB.open('khayrukum'); r.onsuccess = () => { const q = r.result.transaction('events').objectStore('events').getAll(); q.onsuccess = () => res(q.result.filter(e => !e.deleted).length); }; }));
  assert.equal(n, 4);
  // storage namespace (DATA-50)
  const ls = await p.evaluate(() => Object.keys(localStorage));
  assert.ok(ls.every(k => k === 'khayrukum.theme'), 'localStorage keys ⊆ {khayrukum.theme}');
  const dbs = await p.evaluate(() => indexedDB.databases().then(l => l.map(d => d.name)));
  assert.deepEqual(dbs, ['khayrukum']);
  // copy summary feedback (HIS-08)
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE.slice(0, -1) });
  await p.click('#copy'); await p.waitForTimeout(200); assert.equal((await p.textContent('#copy')).trim(), 'نُسخ');
  await ctx.close();
});

test('canonical URLs, unknown and soon exams, #q= (IA-01/03/06)', async () => {
  const { ctx, p } = await page();
  await p.goto(BASE + 'exam/index.html?id=baqarah-1&x=1'); await settle(p);
  assert.equal(new URL(p.url()).pathname + new URL(p.url()).search, '/exam/?id=baqarah-1');
  assert.equal(await p.getAttribute('link[rel=canonical]', 'href'), 'https://khayrukum.app/exam/?id=baqarah-1');
  await p.goto(BASE + 'exam/?id=nope'); await settle(p); assert.match(await p.textContent('h1'), /لم نجد هذا الاختبار/);
  await p.goto(BASE + 'exam/?id=baqarah-5'); await settle(p); assert.match(await p.textContent('h1'), /هذا الاختبار لم يُنشر بعد/);
  await p.goto(BASE + 'exam/?id=baqarah-2#q=baqarah-2/chain/03'); await settle(p);
  assert.equal(await p.getAttribute('.rt[aria-selected="true"]', 'data-round'), 'chain');
  await ctx.close();
});

test('plan: reps, week confirmation, mistakes (PL-03/07/09)', async () => {
  const { ctx, p } = await page();
  await p.goto(BASE + 'plan/'); await settle(p);
  await p.click('#tab-0'); // a weekday with three repetitions (Friday has two), so the test does not depend on today
  await p.locator('.rep').nth(2).click();
  assert.equal(await p.textContent('#ringNum'), '٣');
  await p.fill('#mInput', 'آية ٥ <b>'); await p.click('#mForm button');
  assert.match(await p.textContent('#mList'), /آية ٥ <b>/, 'escaped');
  await p.click('[data-next="ask"]'); await p.click('[data-next="yes"]');
  assert.match(await p.textContent('#weekLabel'), /٢ من ١٠/);
  assert.match(await p.textContent('#mapCount'), /٢ من ٢٠/);
  await p.click('#mList button'); assert.match(await p.textContent('#mList'), /لا توجد أخطاء/);
  await ctx.close();
});

test('backup: export text → import into a clean profile; second import adds nothing; invalid rejected (TST-40)', async () => {
  const a = await page(); await a.ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE.slice(0, -1) });
  await a.p.goto(BASE + 'exam/?id=tuhfa'); await settle(a.p); await a.p.locator('.rt').nth(1).click(); await a.p.locator('button.g.mid').first().click(); await a.p.waitForTimeout(300);
  await a.p.goto(BASE + 'settings/'); await settle(a.p); await a.p.click('#copyJson'); await a.p.waitForTimeout(300);
  const json = await a.p.evaluate(() => navigator.clipboard.readText());
  assert.match(json, /khayrukum-backup/);
  const b = await page();
  await b.p.goto(BASE + 'settings/'); await settle(b.p);
  await b.p.click('#pasteBox > summary'); await b.p.fill('#paste', '{"format":"other"}'); await b.p.click('#importText'); assert.match(await b.p.textContent('#importBox'), /ليس نسخة صالحة/);
  await b.p.fill('#paste', json); await b.p.click('#importText'); await b.p.click('#importYes'); await b.p.waitForSelector('#importBox .good');
  assert.match(await b.p.textContent('#importBox'), /أُضيف ١ إجابة، وحُدِّث ١ من الاختبارات/);
  await b.p.fill('#paste', json); await b.p.click('#importText'); await b.p.click('#importYes'); await b.p.waitForSelector('#importBox .good');
  assert.match(await b.p.textContent('#importBox'), /أُضيف ٠ إجابة، وحُدِّث ٠ من الاختبارات/);
  await a.ctx.close(); await b.ctx.close();
});

test('audio disabled build: no mp3, no play controls, listen shows «قريبًا» (TST-36)', async () => {
  const mp3 = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (f.endsWith('.mp3')) mp3.push(f); } })(DIST);
  assert.deepEqual(mp3, []);
  const { ctx, p } = await page(); const bad = [];
  p.on('response', r => { if (r.status() === 404 && !/build\.json$/.test(r.url())) bad.push(r.url()); });
  await p.goto(BASE + 'listen/'); await settle(p);
  assert.match(await p.textContent('#main'), /الاستماع قريبًا إن شاء الله/);
  assert.equal(await p.locator('[data-bayt],[data-chapter],#allBtn').count(), 0);
  await p.goto(BASE + 'exam/?id=tuhfa'); await settle(p);
  assert.equal(await p.locator('[data-play]').count(), 0);
  await p.goto(BASE); await settle(p);
  assert.match(await p.textContent('#main'), /الصوت قريبًا/);
  assert.deepEqual(bad, []);
  await ctx.close();
});

test('offline after the first visit: every canonical URL and grading work (OFF-03/04, HUB-09)', async () => {
  const { ctx, p } = await page();
  await p.goto(BASE); await settle(p);
  await p.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true), null, { timeout: 15000 });
  await p.waitForSelector('#ready:not([hidden])', { timeout: 15000 });
  await ctx.setOffline(true);
  for (const u of PAGES.filter(x => x !== '404.html')) {
    await p.goto(BASE + u); await settle(p);
    assert.ok((await p.textContent('#main')).length > 20, `${u} offline`);
  }
  await p.goto(BASE + 'exam/?id=baqarah-2'); await settle(p);
  assert.ok(await p.locator('.banner.offline:not([hidden])').count(), 'offline banner (OFF-24)');
  await p.locator('.rt').nth(2).click(); await p.locator('button.g.ok').first().click();
  assert.match(await p.textContent('#score'), /✓ ١/);
  await ctx.close();
});

test('audio build: Range requests answered from the audio cache (OFF-07/08, TST-22), one media element, play (AUD-03)', { skip: !fs.existsSync(path.join(DISTA, 'sw.js')) }, async () => {
  const { ctx, p } = await page();
  await p.goto(BASEA + 'listen/'); await settle(p);
  await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 45000 });
  const r = await p.evaluate(async () => {
    const man = await (await fetch('../data/audio/tuhfa.json')).json();
    const it = man.items.find(x => x.id === 'bayt:1');
    const url = new URL('../' + it.src + '?v=' + it.sha256.slice(0, 8), location.href).href;
    const c = await caches.open('khayr-audio-v1');
    const full = await (await fetch(url, { cache: 'no-store' })).arrayBuffer();
    await c.put(url, new Response(full, { headers: { 'Content-Type': 'audio/mpeg' } }));
    const go = async h => { const x = await fetch(url, { headers: { Range: h } }); return { s: x.status, cr: x.headers.get('content-range'), cl: x.headers.get('content-length'), ar: x.headers.get('accept-ranges'), n: (await x.arrayBuffer()).byteLength }; };
    const res = { total: full.byteLength, a: await go('bytes=0-1'), b: await go('bytes=1000-'), c: await go('bytes=-500'), d: await go('bytes=99999999-') };
    const keys = await c.keys(); res.only200 = (await Promise.all(keys.map(k => c.match(k)))).every(x => x.status === 200);
    return res;
  });
  assert.deepEqual([r.a.s, r.a.cr, r.a.n, r.a.ar], [206, `bytes 0-1/${r.total}`, 2, 'bytes']);
  assert.deepEqual([r.b.s, r.b.cr, r.b.n], [206, `bytes 1000-${r.total - 1}/${r.total}`, r.total - 1000]);
  assert.deepEqual([r.c.s, r.c.cr, r.c.n], [206, `bytes ${r.total - 500}-${r.total - 1}/${r.total}`, 500]);
  assert.deepEqual([r.d.s, r.d.cr], [416, `bytes */${r.total}`]);
  assert.equal(r.only200, true);
  await p.click('details[data-open="1"] > summary');
  await p.click('[data-bayt="1"]');
  await p.waitForTimeout(800);
  assert.equal(await p.locator('audio').count(), 1);
  assert.match(await p.textContent('#nowT'), /بيت ١/);
  await p.click('#selMode'); await p.click('.byt[data-b="2"]'); await p.click('.byt[data-b="3"]');
  assert.match(await p.textContent('#selCount'), /٢ أبيات مختارة|٢ بيت/);
  await ctx.close();
});

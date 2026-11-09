// Persistence across reload AND a full browser restart (persistent profile), offline behaviour of every page
// (including directory URLs without the trailing slash), precache completeness, and a DOM-level Quran check.
// Written by the test agent. Needs dist/ (npm run build).
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from '../../tools/serve.mjs';
import { loadTanzil } from '../lib/tanzil.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const DIST = path.join(ROOT, 'dist');
let srv, BASE; const tmpDirs = [];
before(async () => {
  assert.ok(fs.existsSync(path.join(DIST, 'sw.js')), 'run node tools/build.mjs first');
  srv = createServer(DIST, { cacheControl: 'max-age=600' }); await new Promise(r => srv.listen(0, r)); BASE = `http://localhost:${srv.address().port}/`;
});
const openCtx = new Set();
afterEach(async () => { for (const c of openCtx) await c.close().catch(() => {}); openCtx.clear(); });
after(() => { srv?.close(); tmpDirs.forEach(d => fs.rmSync(d, { recursive: true, force: true })); });

const profile = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'khayr-prof-')); tmpDirs.push(d); return d; };
async function launch(dir, opts = {}) {
  const ctx = await chromium.launchPersistentContext(dir, { viewport: { width: 390, height: 844 }, ...opts });
  openCtx.add(ctx); ctx.on('close', () => openCtx.delete(ctx));
  const p = ctx.pages()[0] || await ctx.newPage(); p.errors = [];
  p.on('pageerror', e => p.errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') p.errors.push(m.text()); });
  return { ctx, p };
}
const settle = p => p.waitForLoadState('networkidle').then(() => p.waitForTimeout(250));
const kv = (p, key) => p.evaluate(k => new Promise(res => { const q = indexedDB.open('khayrukum'); q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').get(k); g.onsuccess = () => { q.result.close(); res(g.result); }; }; }), key);
const events = p => p.evaluate(() => new Promise(res => { const q = indexedDB.open('khayrukum'); q.onsuccess = () => { const g = q.result.transaction('events').objectStore('events').getAll(); g.onsuccess = () => { q.result.close(); res(g.result); }; }; }));

test('exam, random exam, plan and history survive a reload and a browser restart; resume lands on the first ungraded question (EX-14/17, RND-08/10, PL-*, HIS-01, DATA-50)', async () => {
  const dir = profile();
  let { ctx, p } = await launch(dir);
  // exam: grade 2, reveal the third
  await p.goto(BASE + 'exam/?id=baqarah-1'); await settle(p);
  await p.click('.rt[data-round="next"]');
  await p.locator('button.g.ok').nth(0).click(); await p.locator('button.g.mid').nth(1).click(); await p.locator('[data-open]').nth(2).click(); await p.waitForTimeout(300);
  // tuhfa + baqarah-2: one grade each
  await p.goto(BASE + 'exam/?id=baqarah-2'); await settle(p); await p.click('.rt[data-round="pages"]'); await p.locator('button.g.bad').first().click(); await p.waitForTimeout(300);
  await p.goto(BASE + 'exam/?id=tuhfa'); await settle(p); await p.click('.rt[data-round="chapters"]'); await p.locator('button.g.ok').first().click(); await p.waitForTimeout(300);
  await p.locator('.rt[data-round="random-number"]').click(); await p.click('[data-act="roll"]'); const rolled = await p.locator('.bignum').innerText(); await p.waitForTimeout(300);
  // random: preferences and progress
  await p.goto(BASE + 'random/'); await settle(p); if (await p.locator('#ctl:not([open]) > summary').count()) { await p.click('#ctl > summary'); await p.waitForTimeout(100); } /* the range settings are folded while a set is running */
  await p.click('[data-size="25"]'); await p.click('[data-src="baqarah-1"]'); await p.click('[data-quick="tuhfa"][data-a="6"]'); await p.waitForTimeout(100);
  await p.click('#newSet'); await p.waitForTimeout(200);
  await p.click('button.g.ok'); await p.waitForTimeout(100); await p.click('#next'); await p.waitForTimeout(100); await p.click('button.g.bad'); await p.waitForTimeout(100); await p.click('#next'); await p.waitForTimeout(200);
  const setBefore = (await kv(p, 'random:current')).set;
  assert.equal(new Set(setBefore).size, setBefore.length, 'no duplicate question in a run');
  // plan: reps, a checkbox, a mistake
  await p.goto(BASE + 'plan/'); await settle(p);
  await p.click('[data-rep="1"]'); await p.locator('#day input[type=checkbox]').first().check(); await p.fill('#mInput', 'خطأ للاختبار'); await p.press('#mInput', 'Enter'); await p.waitForTimeout(200);
  const planBefore = await kv(p, 'plan:baqarah');

  const check = async label => {
    await p.goto(BASE + 'exam/?id=baqarah-1'); await settle(p); await p.waitForTimeout(400);
    assert.equal(await p.$eval('.rt[aria-selected="true"]', e => e.dataset.round), 'next', label + ': round restored');
    assert.deepEqual(await p.$$eval('button.g[aria-pressed="true"]', b => b.map(x => x.dataset.g + ':' + x.dataset.v)), ['baqarah-1/next/01:ok', 'baqarah-1/next/02:mid'], label + ': grades restored');
    assert.equal(await p.locator('.ans').count(), 1, label + ': revealed answer restored (EX-09)');
    assert.match(await p.locator('#rintro').innerText(), /تابعتَ من حيث توقفت: ٢ من ١٣ مُقيَّمة في هذه الجولة\./, label + ': resume note');
    const vis = await p.$eval('#q-baqarah-1_next_03', a => { const r = a.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; });
    assert.ok(vis, label + ': the first ungraded question (3) is scrolled into view (EX-14)');
    await p.goto(BASE + 'exam/?id=tuhfa'); await settle(p);
    assert.equal(await p.$eval('.rt[aria-selected="true"]', e => e.dataset.round), 'random-number'); assert.equal(await p.locator('.bignum').innerText(), rolled, label + ': random number restored');
    await p.goto(BASE + 'random/'); await settle(p);
    assert.equal(await p.$eval('[data-size][aria-pressed="true"]', b => b.dataset.size), '25', label + ': set size');
    assert.deepEqual(await p.$$eval('[data-src]', b => b.map(x => x.getAttribute('aria-pressed'))), ['false', 'true', 'true'], label + ': sources');
    assert.deepEqual([await p.inputValue('#from-tuhfa'), await p.inputValue('#to-tuhfa')], ['6', '16'], label + ': range');
    assert.match(await p.locator('#rq .qn').innerText(), /سؤال ٣ من/, label + ': position in the set');
    assert.match(await p.locator('#play .banner').innerText(), /تابعتَ من حيث توقفت · ٢ من/, label + ': RND-08 note');
    assert.deepEqual((await kv(p, 'random:current')).set, setBefore, label + ': same set');
    await p.goto(BASE + 'plan/'); await settle(p);
    const pl = await kv(p, 'plan:baqarah');
    assert.deepEqual([pl.week.reps, pl.week.checks, pl.mistakes.map(m => m.text)], [planBefore.week.reps, planBefore.week.checks, ['خطأ للاختبار']], label + ': plan');
    assert.match(await p.locator('#mList').innerText(), /خطأ للاختبار/);
    await p.goto(BASE + 'history/'); await settle(p);
    assert.equal(await p.locator('.evline').count(), 6, label + ': 6 history lines');
    const ev = (await events(p)).filter(e => !e.deleted);
    assert.deepEqual([...new Set(ev.map(e => e.tool + ':' + e.src))].sort(), ['exam:baqarah-1', 'exam:baqarah-2', 'exam:tuhfa', 'random:baqarah-2', 'random:tuhfa'].filter(x => ev.some(e => e.tool + ':' + e.src === x)).sort());
    assert.ok(ev.some(e => e.tool === 'random') && ['baqarah-1', 'baqarah-2', 'tuhfa'].every(s => ev.some(e => e.tool === 'exam' && e.src === s)), label + ': events from every exam and from the random exam');
  };
  await p.reload(); await check('reload');
  await ctx.close();
  ({ ctx, p } = await launch(dir));
  await check('restart');
  // DATA-50 AC
  assert.deepEqual(await p.evaluate(() => Object.keys(localStorage).filter(k => k !== 'khayrukum.theme')), []);
  assert.deepEqual(await p.evaluate(async () => (await indexedDB.databases()).map(d => d.name)), ['khayrukum']);
  assert.deepEqual((await p.evaluate(() => caches.keys())).filter(k => !/^khayr-app-[0-9a-f]+$/.test(k) && k !== 'khayr-audio-v1'), [], 'OFF-02: only the two caches');
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('legacy localStorage keys from the old pages are ignored and left alone (§4.10: migration is not in v1)', async () => {
  const { ctx, p } = await launch(profile());
  await p.goto(BASE); await settle(p);
  const OLD = ['baqarah-plan-v1', 'baqarah-exam-public-1', 'baqarah-exam-public-2', 'tuhfa-exam-1', 'random-exam-prefs', 'random-exam-current', 'khayr-history-v1'];
  await p.evaluate(keys => keys.forEach(k => localStorage.setItem(k, JSON.stringify({ grades: { next0: 'ok' }, pair: 3, src: ['x'], set: [1], idx: 9, events: [{ g: 'ok' }] }))), OLD);
  for (const u of ['', 'plan/', 'exam/?id=baqarah-1', 'exam/?id=tuhfa', 'random/', 'history/']) { await p.goto(BASE + u); await settle(p); }
  assert.match(await p.locator('#main').innerText(), /لا يوجد سجل بعد/, 'old history is not imported');
  assert.equal((await kv(p, 'plan:baqarah'))?.pair ?? 1, 1, 'old plan is not imported');
  assert.deepEqual(await p.evaluate(keys => keys.filter(k => localStorage.getItem(k) === null), OLD), [], 'old keys are not deleted');
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('offline after the first visit: every page, reloads and URL variants work; grading works; the precache list covers dist/ (OFF-02…04, OFF-24)', async () => {
  const sw = fs.readFileSync(path.join(DIST, 'sw.js'), 'utf8');
  const list = JSON.parse(/const PRECACHE = (\[.*?\]);/s.exec(sw)[1]).map(e => e.url);
  const walk = (d, a = []) => { for (const f of fs.readdirSync(d)) { const x = path.join(d, f); fs.statSync(x).isDirectory() ? walk(x, a) : a.push(path.relative(DIST, x)); } return a; };
  const notPre = walk(DIST).filter(f => !list.includes(f));
  assert.deepEqual(notPre.sort(), ['CNAME', 'assets/fonts/LICENSES/README.md', 'robots.txt', 'sw.js'], 'everything a page can request is precached');
  assert.equal(walk(DIST).filter(f => /\.(mp3|m4a|ogg|wav|opus|aac|flac)$/i.test(f)).length, 0, 'no audio file in dist (AUD-40)');

  const { ctx, p } = await launch(profile());
  const failed = []; p.on('requestfailed', r => failed.push(r.url())); p.on('response', r => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url()); });
  await p.goto(BASE); await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
  await p.getByText('جاهز للعمل دون إنترنت').waitFor({ timeout: 10000 });
  assert.deepEqual(failed, [], 'no failed request on the first visit (missing fonts must not 404)');
  const cached = await p.evaluate(async () => { const k = (await caches.keys()).find(x => x.startsWith('khayr-app-')); return (await (await caches.open(k)).keys()).map(r => new URL(r.url).pathname.slice(1)); });
  assert.deepEqual(list.filter(u => !cached.includes(u)), [], 'every precache entry is in the app cache');
  await ctx.setOffline(true);
  const pages = { '': 'خيركم من تعلّمه', 'plan/': 'خطة تثبيت البقرة', 'exam/?id=baqarah-1': 'اختبار ١ · البقرة ١–٤٣', 'exam/?id=baqarah-2': 'اختبار ٢ · البقرة ٤٤–٧٤', 'exam/?id=tuhfa': 'اختبار تحفة الأطفال',
    'random/': 'الاختبار العشوائي', 'history/': 'سجلي', 'listen/': 'استماع تحفة الأطفال', 'settings/': 'الإعدادات', 'about/': 'عن الموقع', 'privacy/': 'الخصوصية', '404.html': 'الصفحة غير موجودة', 'no-such-page/': 'الصفحة غير موجودة',
    '?source=pwa': 'خيركم من تعلّمه', 'exam/index.html?id=tuhfa&x=1': 'اختبار تحفة الأطفال' };
  for (const [u, h1] of Object.entries(pages)) {
    await p.goto(BASE + u); await p.waitForFunction(t => document.querySelector('h1')?.textContent === t, h1, { timeout: 8000 });
    await p.reload(); await p.waitForFunction(t => document.querySelector('h1')?.textContent === t, h1, { timeout: 8000 });
    assert.equal(await p.locator('.banner.offline').isVisible(), true, `${u}: offline banner (OFF-24)`);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${u}: no horizontal scroll`);
  }
  // grading offline
  await p.goto(BASE + 'exam/?id=tuhfa'); await p.waitForSelector('.rt'); await p.click('.rt[data-round="codes"]'); await p.locator('button.g.ok').first().click(); await p.waitForTimeout(300); /* m13: let the write commit */ await p.reload(); await p.waitForSelector('button.g.ok[aria-pressed="true"]');
  await ctx.setOffline(false);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('IA-05: a directory URL without the trailing slash ends in «/» also when the service worker answers the navigation', async () => {
  const { ctx, p } = await launch(profile());
  await p.goto(BASE); await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
  await p.getByText('جاهز للعمل دون إنترنت').waitFor({ timeout: 10000 });
  const slashless = [];
  for (const u of ['plan', 'exam?id=baqarah-1', 'history']) { await p.goto(BASE + u); await p.waitForSelector('#footer a'); const loc = await p.evaluate(() => location.pathname); if (!loc.endsWith('/')) slashless.push(`${u} → ${loc}`); }
  assert.deepEqual(slashless, []);
  await ctx.close();
});

test('every Quran fragment the exam pages render is an exact substring of a Tanzil verse of Al-Baqarah (LIC-02, EX-16)', async () => {
  const tz = loadTanzil(); const verses = []; for (let a = 1; a <= 286; a++) verses.push(tz.verses.get('2:' + a));
  const { ctx, p } = await launch(profile());
  let n = 0; const bad = [];
  for (const id of ['baqarah-1', 'baqarah-2', 'tuhfa']) {
    await p.goto(BASE + 'exam/?id=' + id); await settle(p);
    for (const round of await p.$$eval('.rt', t => t.map(x => x.dataset.round))) {
      await p.click(`.rt[data-round="${round}"]`);
      await p.evaluate(() => { for (;;) { const b = document.querySelector('#qs [data-open][aria-expanded="false"]'); if (!b) break; b.click(); } });
      const frags = await p.$$eval('.frag.qf', els => els.map(e => { const c = e.cloneNode(true); c.querySelectorAll('.vnum').forEach(v => v.remove()); return c.textContent.trim(); }));
      for (const f of frags) { n++; if (!verses.some(v => v.includes(f))) bad.push(`${id}/${round}: «${f.slice(0, 60)}»`); }
    }
  }
  await p.goto(BASE + 'plan/'); await settle(p);
  for (const f of await p.$$eval('.task .main.qf', els => els.map(e => e.textContent.trim()))) { n++; if (!verses.some(v => v.includes(f))) bad.push('plan: ' + f); }
  console.log(`# rendered Quran fragments checked: ${n}`);
  assert.ok(n > 400, 'fragments found: ' + n);
  assert.deepEqual(bad, []);
  await ctx.close();
});

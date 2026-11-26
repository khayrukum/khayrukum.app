// TST-71: «مشغّل المدى» (RNG-*) and «وضع العرض» (STG-*) end to end, on a throw-away copy of site/ with audio ON
// and synthetic tones (tests/lib/media-fixture.mjs): no recitation file is needed, so this runs everywhere.
// The fixture gives every verse 3 s: part f1 = 1:1–7, basmala, 2:1–5; part f2 = 2:6–25.
// Verse texts are compared with the site's Tanzil-derived files; no Quran text is typed here.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from '../../tools/serve.mjs';
import { makeSite, ROOT, VERSE, LEAD, PAUSE } from '../lib/media-fixture.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
let axeSource = null; try { axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'); } catch { /* not installed */ }
const q = n => JSON.parse(fs.readFileSync(path.join(ROOT, `site/data/quran/00${n}.json`), 'utf8'));
const Q1 = q(1), Q2 = q(2);
const abyat = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/data/tuhfa/abyat.json'), 'utf8')).abyat;
let site, srv, BASE, browser; const open = new Set();

before(async () => {
  site = makeSite();
  srv = createServer(site.dir); await new Promise(r => srv.listen(0, r)); BASE = `http://localhost:${srv.address().port}/`;
  browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
});
afterEach(async () => { for (const c of open) await c.close().catch(() => {}); open.clear(); });
after(async () => { await browser?.close(); srv?.close(); site?.cleanup(); });

async function page(opts = {}, { fullscreen = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...opts }); open.add(ctx);
  const p = await ctx.newPage(); p.errors = [];
  p.on('pageerror', e => p.errors.push(e.message));
  await p.addInitScript(fs => {
    window.__plays = []; window.__csp = []; window.__wake = [];
    document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { window.__plays.push(window.event ? window.event.type : null); return play.apply(this, arguments); };
    if (!fs) { delete Element.prototype.requestFullscreen; delete Element.prototype.webkitRequestFullscreen; } // iPhone Safari: no element full screen
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { window.__wake.push('on'); const l = new EventTarget(); l.release = async () => { window.__wake.push('off'); }; return l; } } });
  }, fullscreen);
  return { ctx, p };
}
const settle = p => p.waitForLoadState('networkidle').then(() => p.waitForTimeout(200));
const au = (p, fn, arg) => p.evaluate(`(${fn})(document.querySelector('audio'), ${JSON.stringify(arg ?? null)})`);
const playing = p => p.waitForFunction(() => { const a = document.querySelector('audio'); return a && !a.paused && a.readyState >= 2; }, null, { timeout: 15000 });
const prefs = p => p.evaluate(() => new Promise(res => { const r = indexedDB.open('khayrukum'); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('range:prefs'); g.onsuccess = () => { r.result.close(); res(g.result); }; }; }));
const start = i => LEAD + VERSE * i; // start of the i-th entry of a fixture part
const stageText = p => p.$$eval('#stText .w:not(.vnum):not([hidden])', w => w.map(x => x.textContent).join(' '));
const nowT = (p, re) => p.waitForFunction(s => new RegExp(s).test(document.querySelector('#nowT').textContent), re.source, { timeout: 15000 });

test('RNG-01/03/04: the hub links to the page; only covered units are offered; «من … إلى» stays ordered; the choice survives a reload', async () => {
  const { p } = await page();
  await p.goto(BASE); await settle(p);
  const card = p.locator('a.card[href$="range/"]');
  assert.match(await card.innerText(), /مشغّل المدى/); assert.doesNotMatch(await card.innerText(), /قريبًا/);
  await card.click(); await settle(p);
  assert.equal(await p.locator('h1').innerText(), 'مشغّل المدى');
  assert.match(await p.locator('#head').innerText(), /تلاوة الشيخ محمد صديق المنشاوي/);
  assert.deepEqual(await p.$$eval('#rFrom option', o => o.map(x => x.textContent)), ['ص ١ · الفاتحة ١', 'ص ٢ · البقرة ١', 'ص ٣ · البقرة ٦', 'ص ٤ · البقرة ١٧'], 'pages 1–4 are covered; page 5 (2:25–29) is not');
  assert.match(await p.textContent('#sum'), /^عدد الصفحات: ١ · المدة ٠:٢[٠١] · الفاتحة ١ ← الفاتحة ٧$/);
  await p.selectOption('#rFrom', '2');
  assert.equal(await p.inputValue('#rTo'), '2', 'choosing «من» after «إلى» moves «إلى» with it');
  await p.selectOption('#rTo', '3'); await p.selectOption('#rTo', '1');
  assert.equal(await p.inputValue('#rFrom'), '2', 'choosing «إلى» before «من» keeps «من»: a closed loop (RNG-16)');
  assert.match(await p.textContent('#sum'), /^عدد الصفحات: ٤ · .* · البقرة ٦ ← البقرة ٥ · ↻ يدور من آخر القائمة إلى أولها$/);
  await p.selectOption('#rFrom', '1'); await p.selectOption('#rTo', '1');
  await p.click('[data-unit="Q"]');
  assert.deepEqual(await p.$$eval('#rFrom option', o => o.map(x => x.textContent)), ['الربع ١ · الفاتحة ١']);
  await p.click('[data-unit="A"]');
  assert.deepEqual(await p.$$eval('#rSura option', o => o.map(x => x.textContent)), ['الفاتحة', 'البقرة']);
  await p.selectOption('#rSura', '2');
  assert.equal(await p.locator('#rFrom option').count(), 25, 'Al-Baqarah offers its 25 covered verses only');
  await p.selectOption('#rFrom', '2'); await p.selectOption('#rTo', '4');
  assert.match(await p.textContent('#sum'), /^عدد الآيات: ٣ · المدة ٠:٠[٨٩] · البقرة ٣ ← البقرة ٥$/);
  await p.click('#speedBtn'); await p.click('[data-rate="1.5"]'); await p.click('#loop');
  await p.waitForTimeout(300);
  const saved = await prefs(p);
  assert.deepEqual([saved.unit, saved.A, saved.rate, saved.loop], ['A', { sura: 2, from: 3, to: 5 }, 1.5, false]);
  await p.reload(); await settle(p);
  assert.equal(await p.getAttribute('[data-unit="A"]', 'aria-pressed'), 'true');
  assert.deepEqual([await p.inputValue('#rSura'), await p.inputValue('#rFrom'), await p.inputValue('#rTo'), await p.textContent('#speedBtn'), await p.getAttribute('#loop', 'aria-pressed')], ['2', '2', '4', '١٫٥×', 'false']);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, 'no horizontal scroll at 390 px');
  assert.deepEqual(await p.evaluate(() => window.__csp), []); assert.deepEqual(p.errors, []);
});

test('RNG-15/16/18/19: by sura; a closed loop plays to the end of the list and round from its start; last ranges and «المدى التالي»', async () => {
  const { p } = await page();
  await p.goto(BASE + 'range/'); await settle(p);
  assert.equal(await p.locator('#recent').isHidden(), true, 'nothing played yet');
  // by sura: only Al-Fatiha is complete in the fixture
  await p.click('[data-unit="S"]');
  assert.deepEqual(await p.$$eval('#rFrom option', o => o.map(x => x.textContent)), ['سورة الفاتحة']);
  assert.match(await p.textContent('#sum'), /^عدد السور: ١ · .* · الفاتحة ١ ← الفاتحة ٧$/);
  assert.deepEqual([await p.isDisabled('#shPrev'), await p.isDisabled('#shNext')], [true, true]);
  // closed loop by page: page 4, then round to page 1
  await p.click('[data-unit="P"]');
  await p.selectOption('#rFrom', '3'); await p.selectOption('#rTo', '0');
  assert.match(await p.textContent('#sum'), /^عدد الصفحات: ٢ · .* · البقرة ١٧ ← الفاتحة ٧ · ↻ يدور من آخر القائمة إلى أولها$/);
  await p.click('#pp'); await playing(p); await nowT(p, /البقرة · آية ١٧/);
  assert.match(await au(p, a => a.currentSrc), /f2\./);
  await au(p, (a, t) => { a.currentTime = t; }, start(19) - 1.2); // just before the end of 2:24
  await nowT(p, /الفاتحة · آية ١/);
  assert.match(await au(p, a => a.currentSrc), /f1\./, 'after the last page comes the first');
  assert.deepEqual(await p.$$eval('#recentChips .chip', c => c.map(x => x.textContent + '|' + x.getAttribute('aria-pressed'))), ['ص ٤ ← ص ١|true']);
  // «المدى التالي»: the same length, just after; and it is remembered because it is playing
  await p.selectOption('#rFrom', '0'); await p.selectOption('#rTo', '1');
  assert.deepEqual([await p.isDisabled('#shPrev'), await p.isDisabled('#shNext')], [true, false]);
  await p.click('#shNext');
  assert.deepEqual([await p.inputValue('#rFrom'), await p.inputValue('#rTo')], ['2', '3']);
  assert.equal(await p.isDisabled('#shNext'), true, 'the end of the covered pages');
  await playing(p); await nowT(p, /البقرة · آية ٦/);
  const chips = () => p.$$eval('#recentChips .chip', c => c.map(x => x.textContent));
  // a range chosen during playback is remembered once it has played for a moment; the steps of choosing are not
  await p.waitForFunction(() => document.querySelectorAll('#recentChips .chip').length === 2, null, { timeout: 8000 });
  assert.deepEqual(await chips(), ['ص ٣ ← ص ٤', 'ص ٤ ← ص ١']);
  await p.click('#pp'); await p.waitForFunction(() => document.querySelector('audio').paused);
  // a chip selects its range and plays it; the list survives a reload
  await p.click('#recentChips .chip:nth-child(2)'); await playing(p); await nowT(p, /البقرة · آية ١٧/);
  assert.deepEqual([await p.inputValue('#rFrom'), await p.inputValue('#rTo')], ['3', '0']);
  assert.deepEqual(await chips(), ['ص ٤ ← ص ١', 'ص ٣ ← ص ٤']);
  await p.click('#pp'); await p.waitForTimeout(400);
  await p.reload(); await settle(p);
  assert.deepEqual(await chips(), ['ص ٤ ← ص ١', 'ص ٣ ← ص ٤']);
  assert.deepEqual([await p.inputValue('#rFrom'), await p.inputValue('#rTo')], ['3', '0'], 'the loop is restored as it was');
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, 'no horizontal scroll at 390 px');
  assert.deepEqual(p.errors, []);
});

test('RNG-05…08: a range plays as clips cut inside the pauses, crosses to the next part file, loops, and stops at the end without «كرّر»; one media element; play() inside the tap (AUD-03/05/35)', async () => {
  const { p } = await page();
  await p.goto(BASE + 'range/'); await settle(p);
  await p.selectOption('#rFrom', '1'); await p.selectOption('#rTo', '2'); // pages 2–3: 2:1–5 in f1, 2:6–16 in f2
  await p.click('#pp'); await playing(p);
  assert.equal((await p.evaluate(() => window.__plays))[0], 'click');
  assert.match(await au(p, a => a.currentSrc), /audio\/minshawi\/f1\.wav$/);
  const t0 = await au(p, a => a.currentTime);
  assert.ok(t0 >= start(7) - 0.31 && t0 < start(7) + 1.5, `starts 0.3 s before the basmala of Al-Baqarah (${t0})`);
  await nowT(p, /^يُقرأ الآن: بسملة سورة البقرة$/);
  await au(p, (a, t) => { a.currentTime = t; }, start(9) + 0.2);
  await nowT(p, /^يُقرأ الآن: سورة البقرة · آية ٢$/);
  assert.equal(await p.textContent('#nowS'), 'ص ٢ · يتكرر');
  assert.equal(await p.textContent('#pp'), '⏸');
  // near the end of the last verse in f1 → the next clip is in the other file, at 2:6 (its isti'adha skipped)
  await au(p, (a, t) => { a.currentTime = t; }, start(13) - 1.2);
  await p.waitForFunction(() => /f2\.wav$/.test(document.querySelector('audio').currentSrc), null, { timeout: 15000 }); await playing(p);
  const t1 = await au(p, a => a.currentTime);
  assert.ok(t1 >= start(0) - 0.31 && t1 < start(0) + 1.5, `the second clip starts just before 2:6 (${t1})`);
  await nowT(p, /آية ٦$/);
  assert.equal(await p.textContent('#nowS'), 'ص ٣ · يتكرر');
  const cur = await p.getAttribute('#seek', 'aria-valuenow'), max = await p.getAttribute('#seek', 'aria-valuemax');
  assert.ok(+cur >= 15 && +cur <= 18 && +max >= 48 && +max <= 50, `the bar shows the place in the whole range (${cur} of ${max})`);
  // the end of the range wraps to its start (loop is on by default)
  await au(p, (a, t) => { a.currentTime = t; }, start(11) - 1.3);
  await p.waitForFunction(() => /f1\.wav$/.test(document.querySelector('audio').currentSrc), null, { timeout: 15000 }); await playing(p);
  await nowT(p, /بسملة سورة البقرة$/);
  assert.equal(await p.locator('audio, video').count(), 1);
  // the clip ends on time: never more than 0.15 s past its end before the jump (precise stop)
  const over = await p.evaluate(async end => { const a = document.querySelector('audio'); a.currentTime = end - 1.2; let max = 0; const t0 = performance.now(); while (performance.now() - t0 < 2500 && /f1\.wav$/.test(a.currentSrc)) { max = Math.max(max, a.currentTime); await new Promise(r => setTimeout(r, 10)); } return max - end; }, start(13) - PAUSE); // f1 has nothing after 2:5: the clip ends where the recitation ends
  assert.ok(over < 0.15, `overshoot past the end of the clip: ${over.toFixed(3)} s`);
  // without «كرّر» the range stops at its end and offers ▶ again (no dead end)
  await playing(p); await p.click('#loop');
  await au(p, (a, t) => { a.currentTime = t; }, start(11) - 1.2);
  await p.waitForFunction(() => document.querySelector('audio').paused && document.querySelector('#pp').textContent === '▶', null, { timeout: 15000 });
  assert.equal(await p.textContent('#nowT'), 'اضغط ▶ ليبدأ المدى');
  await p.click('#pp'); await playing(p);
  await nowT(p, /بسملة سورة البقرة$/);
  // seek across files with the keyboard and the ±5 buttons; previous / next verse
  await p.click('#pp');
  await p.focus('#seek'); await p.keyboard.press('End'); await p.waitForTimeout(400);
  assert.match(await au(p, a => a.currentSrc), /f2\.wav$/); assert.equal(await au(p, a => a.paused), true, 'seeking while paused stays paused');
  await p.keyboard.press('Home'); await p.waitForTimeout(400);
  assert.match(await au(p, a => a.currentSrc), /f1\.wav$/);
  await p.click('#nextV'); await p.click('#nextV'); await p.waitForTimeout(300);
  assert.match(await p.textContent('#nowT'), /^متوقف عند: سورة البقرة · آية ٢$/);
  await p.click('#prevV'); await p.waitForTimeout(300);
  assert.match(await p.textContent('#nowT'), /آية ١$/);
  assert.deepEqual(await p.evaluate(() => window.__csp), []); assert.deepEqual(p.errors, []);
});

test('RNG-09/10: ±1 s fine-tune is saved on the device and moves the range; the place in the range is resumed after a reload', async () => {
  const { p } = await page();
  await p.goto(BASE + 'range/'); await settle(p);
  await p.selectOption('#rFrom', '2'); await p.selectOption('#rTo', '2'); // page 3 = 2:6–16, starts at entry 0 of f2
  await p.click('#tune > summary');
  assert.equal(await p.textContent('#tv-s'), 'كما هي'); assert.equal(await p.isDisabled('#tuneReset'), true);
  await p.click('[data-tune="s"][data-d="-1"]'); await p.click('[data-tune="e"][data-d="1"]'); await p.click('[data-tune="e"][data-d="1"]');
  assert.equal(await p.textContent('#tv-s'), '−١ ث'); assert.equal(await p.textContent('#tv-e'), '+٢ ث');
  await p.waitForTimeout(300);
  assert.deepEqual((await prefs(p)).tune, { 'f2/2:6/s': -1, 'f2/2:17/e': 2 });
  await p.click('#pp'); await playing(p);
  const t0 = await au(p, a => a.currentTime);
  assert.ok(t0 < start(0) - 0.31 && t0 >= 0, `the range now starts a second earlier (${t0})`);
  await p.click('#pp'); await p.focus('#seek'); await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(400);
  const at = +(await p.getAttribute('#seek', 'aria-valuenow'));
  await p.waitForTimeout(300);
  await p.reload(); await settle(p);
  assert.equal(await p.textContent('#tv-s'), '−١ ث');
  assert.ok(Math.abs(+(await p.getAttribute('#seek', 'aria-valuenow')) - at) <= 1, 'the bar shows where the reader stopped');
  assert.match(await p.textContent('#nowT'), /^متوقف عند: سورة البقرة · آية [٨٩]$/);
  await p.click('#pp'); await playing(p);
  assert.ok((await au(p, a => a.currentTime)) > start(2) - 2, 'playback resumes there, not at the start');
  await p.click('#pp'); await p.click('#tune > summary'); await p.click('#tuneReset');
  assert.equal(await p.textContent('#tv-e'), 'كما هي');
  assert.deepEqual(p.errors, []);
});

test('STG (Quran): opens over the page, shows the verse being recited from the site\'s text, follows the audio and the phrase, controls fade and return, Escape / back close it and return to the same place', async () => {
  const { p } = await page();
  await p.goto(BASE + 'range/'); await settle(p);
  await p.evaluate(() => window.scrollTo(0, 180)); const y0 = await p.evaluate(() => scrollY);
  await p.click('#stageBtn');
  const st = p.locator('#stage');
  assert.deepEqual([await st.getAttribute('role'), await st.getAttribute('aria-modal'), await st.getAttribute('aria-label')], ['dialog', 'true', 'وضع العرض']);
  const box = await st.boundingBox();
  assert.deepEqual([box.x, box.y, box.width, box.height], [0, 0, 390, 844], 'CSS full-viewport fallback when the browser has no element full screen');
  assert.equal(await p.evaluate(() => document.getElementById('app').inert), true);
  // idle: the first verse of the range, ready to play
  assert.equal(await stageText(p), Q1.ayat[0]);
  assert.equal(await p.textContent('#stCtx'), 'سورة الفاتحة'); assert.equal(await p.textContent('#stNum'), 'آية ١ · ص ١');
  assert.equal(await p.textContent('#stText .vnum'), '﴿١﴾');
  await p.click('[data-st="toggle"]'); await playing(p);
  assert.equal((await p.evaluate(() => window.__plays))[0], 'click');
  await p.waitForFunction(() => window.__wake.includes('on'), null, { timeout: 5000 });
  // follows the time: verse 5, first phrase then second phrase
  await au(p, (a, t) => { a.currentTime = t; }, start(4) + 0.1);
  await p.waitForFunction(() => document.querySelector('#stNum').textContent === 'آية ٥ · ص ١', null, { timeout: 5000 });
  assert.equal(await stageText(p), Q1.ayat[4]);
  const words = Q1.ayat[4].split(' ');
  assert.deepEqual(await p.$$eval('#stText .w.on', w => w.map(x => x.textContent)), words.slice(0, Math.floor(words.length / 2)), 'the first phrase is marked');
  await au(p, (a, t) => { a.currentTime = t; }, start(4) + VERSE / 2 + 0.2);
  await p.waitForFunction(n => document.querySelectorAll('#stText .w.on').length === n, words.length - Math.floor(words.length / 2), { timeout: 5000 });
  assert.deepEqual(await p.$$eval('#stText .w.on', w => w.map(x => x.textContent)), words.slice(Math.floor(words.length / 2)), 'then the second');
  // the text fits: no clipping, no scrolling, large type
  const fit = await p.evaluate(() => { const b = document.querySelector('#stBody'), t = document.querySelector('#stText'); return { ok: t.scrollHeight <= b.clientHeight + 1 && t.scrollWidth <= b.clientWidth + 1, px: parseFloat(getComputedStyle(t).fontSize), family: getComputedStyle(t).fontFamily }; });
  assert.ok(fit.ok && fit.px >= 40, `fits at ${fit.px}px`); assert.match(fit.family, /Amiri Quran/);
  // next / previous verse; the basmala comes from the site's data
  await p.click('[data-st="next"]'); await p.waitForFunction(() => document.querySelector('#stNum').textContent.startsWith('آية ٦'), null, { timeout: 5000 });
  await p.keyboard.press('ArrowRight'); await p.waitForFunction(() => document.querySelector('#stNum').textContent.startsWith('آية ٥'), null, { timeout: 5000 });
  await p.keyboard.press('ArrowLeft'); await p.waitForFunction(() => document.querySelector('#stNum').textContent.startsWith('آية ٦'), null, { timeout: 5000 });
  // controls fade while playing and return on a tap; a faded control is not clickable
  await p.waitForFunction(() => document.querySelector('#stage').classList.contains('idle'), null, { timeout: 6000 });
  assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector('.st-ctl')).pointerEvents), 'none');
  assert.equal(await p.textContent('#stCtx'), 'سورة الفاتحة', 'the context stays');
  await p.mouse.click(195, 400);
  assert.equal(await st.evaluate(e => e.classList.contains('idle')), false);
  assert.equal(await au(p, a => a.paused), false, 'the tap that brings the controls back does not pause');
  // loop indicator and play/pause
  assert.equal(await p.getAttribute('[data-st="loop"]', 'aria-pressed'), 'true');
  await p.click('[data-st="loop"]'); assert.equal(await p.getAttribute('[data-st="loop"]', 'aria-pressed'), 'false'); await p.click('[data-st="loop"]');
  await p.focus('#stage'); await p.keyboard.press(' '); await p.waitForFunction(() => document.querySelector('audio').paused);
  await p.waitForFunction(() => document.querySelector('[data-st="toggle"]').textContent === '▶', null, { timeout: 5000 });
  await p.waitForFunction(() => window.__wake.includes('off'), null, { timeout: 5000 });
  if (axeSource) {
    await p.evaluate(axeSource);
    const v = await p.evaluate(async () => (await window.axe.run(document.getElementById('stage'), { resultTypes: ['violations'] })).violations.filter(x => x.impact === 'serious' || x.impact === 'critical').map(x => x.id + ' ' + x.nodes[0].target));
    assert.deepEqual(v, [], 'axe: no serious violations in the view');
  }
  const small = await p.$$eval('#stage button', b => b.map(x => x.getBoundingClientRect()).filter(r => r.width < 44 || r.height < 44).length);
  assert.equal(small, 0, 'targets ≥ 44 px');
  // Escape closes; focus and scroll position are where they were
  const shown = (await p.textContent('#stNum')).split(' · ')[0]; // «آية N» (it kept playing while the controls faded)
  await p.keyboard.press('Escape'); await p.waitForSelector('#stage', { state: 'detached' });
  assert.deepEqual([await p.evaluate(() => document.activeElement.id), await p.evaluate(() => scrollY), await p.evaluate(() => document.getElementById('app').inert)], ['stageBtn', y0, false]);
  assert.equal(await p.textContent('#nowT'), 'متوقف عند: سورة الفاتحة · ' + shown, 'the page shows the same place');
  // the browser's back button closes it too, and stays on the page
  await p.click('#stageBtn'); await p.waitForSelector('#stage');
  await p.goBack(); await p.waitForSelector('#stage', { state: 'detached' });
  assert.match(p.url(), /\/range\/$/);
  assert.deepEqual(await p.evaluate(() => window.__csp), []); assert.deepEqual(p.errors, []);
});

test('STG-05: landscape and small screens — a verse too long for one screen is shown a screenful at a time, never below the Quran minimum size, never clipped; real full screen where the browser has it', async () => {
  const { p } = await page({ viewport: { width: 360, height: 250 } }, { fullscreen: true }); // small enough that 2:25 needs more than one screen
  await p.goto(BASE + 'range/'); await settle(p);
  await p.click('[data-unit="A"]'); await p.selectOption('#rSura', '2'); await p.selectOption('#rFrom', '24'); // 2:25
  await p.click('#stageBtn'); await p.waitForSelector('#stText.in');
  await p.waitForFunction(() => !!document.fullscreenElement, null, { timeout: 5000 }).catch(() => {});
  const fs1 = await p.evaluate(() => document.fullscreenElement?.id || null);
  const state = () => p.evaluate(() => { const b = document.querySelector('#stBody'), t = document.querySelector('#stText'); return { ok: t.scrollHeight <= b.clientHeight + 1 && t.scrollWidth <= b.clientWidth + 1, px: parseFloat(getComputedStyle(t).fontSize), page: document.querySelector('#stPage').textContent, shown: [...t.querySelectorAll('.w:not([hidden]):not(.vnum)')].map(x => x.textContent), h: innerHeight }; });
  const a = await state();
  const all = Q2.ayat[24].split(' ');
  assert.ok(a.ok, 'the screenful fits'); assert.ok(a.px >= 22 - 0.01, `Quran type stays ≥ 1.375 rem (${a.px}px)`);
  assert.match(a.page, /^١ \/ [٢٣٤٥]$/, 'more than one screen: ' + a.page);
  assert.deepEqual(a.shown, all.slice(0, a.shown.length), 'the first screen is the start of the verse');
  // the second half of the verse is on a later screen once the recitation gets there
  await p.click('[data-st="toggle"]'); await playing(p);
  await au(p, (x, t) => { x.currentTime = t; }, start(19) + VERSE / 2 + 0.2);
  await p.waitForFunction(() => !document.querySelector('#stPage').textContent.startsWith('١ '), null, { timeout: 5000 });
  const b = await state();
  assert.ok(b.ok); assert.ok(b.shown.length > 0 && b.shown.every(w => all.includes(w)));
  assert.equal(b.shown.includes(all[Math.floor(all.length / 2)]), true, 'the screen shown holds the phrase being recited');
  assert.ok(await p.locator('#stText .w.on:not([hidden])').count() > 0);
  if (fs1) { // real full screen: leaving it (the browser's Esc) closes the view
    assert.equal(fs1, 'stage');
    await p.evaluate(() => document.exitFullscreen()); await p.waitForSelector('#stage', { state: 'detached' });
  } else { await p.keyboard.press('Escape'); await p.waitForSelector('#stage', { state: 'detached' }); }
  assert.deepEqual(p.errors, []);
});

test('STG (Tuhfa): the listening page opens the same view on the bayt being heard — two hemistichs, bayt and chapter, previous / next bayt, close returns', async () => {
  const { p } = await page();
  await p.goto(BASE + 'listen/'); await settle(p);
  await p.click('details[data-open="1"] > summary'); await p.click('[data-bayt="3"]'); await playing(p);
  await p.click('#stageBtn'); await p.waitForSelector('#stText.in');
  assert.deepEqual(await p.$$eval('#stText .bayt.both .h', h => h.map(x => x.textContent)), abyat[3]);
  assert.equal(await p.textContent('#stNum'), 'البيت ٣'); assert.match(await p.textContent('#stCtx'), /^تحفة الأطفال · الباب ١ · /);
  const fit = await p.evaluate(() => { const b = document.querySelector('#stBody'), t = document.querySelector('#stText'); return { ok: t.scrollHeight <= b.clientHeight + 1 && [...t.querySelectorAll('.h')].every(h => h.scrollWidth <= h.clientWidth + 1), px: parseFloat(getComputedStyle(t).fontSize), family: getComputedStyle(t).fontFamily }; });
  assert.ok(fit.ok && fit.px >= 24, `the bayt fits at ${fit.px}px`); assert.match(fit.family, /Amiri/);
  assert.equal(await p.textContent('[data-st="toggle"]'), '⏸');
  await p.click('[data-st="next"]'); await p.waitForFunction(() => document.querySelector('#stNum').textContent === 'البيت ٤', null, { timeout: 5000 });
  assert.deepEqual(await p.$$eval('#stText .h', h => h.map(x => x.textContent)), abyat[4]);
  await p.click('[data-st="prev"]'); await p.click('[data-st="prev"]'); await p.waitForFunction(() => document.querySelector('#stNum').textContent === 'البيت ٢', null, { timeout: 5000 });
  await p.click('[data-st="toggle"]'); await p.waitForFunction(() => document.querySelector('audio').paused);
  await p.click('[data-st="close"]'); await p.waitForSelector('#stage', { state: 'detached' });
  assert.equal(await p.evaluate(() => document.activeElement.id), 'stageBtn');
  assert.match(await p.textContent('#nowT'), /^بيت ٢ · /);
  assert.equal(await p.locator('audio, video').count(), 1);
  assert.deepEqual(await p.evaluate(() => window.__csp), []); assert.deepEqual(p.errors, []);
});

test('NFR-A11Y: the range page has no serious axe violations in both themes and no target under 24 px', { skip: !axeSource && 'axe-core not installed' }, async () => {
  for (const scheme of ['light', 'dark']) {
    const { p } = await page({ colorScheme: scheme, viewport: { width: 375, height: 800 } });
    await p.goto(BASE + 'range/'); await settle(p); await p.click('#tune > summary'); await p.click('#speedBtn');
    await p.evaluate(axeSource);
    const v = await p.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter(x => x.impact === 'serious' || x.impact === 'critical').map(x => x.id + ' ' + x.nodes[0].target));
    assert.deepEqual(v, [], scheme);
    const small = await p.evaluate(() => [...document.querySelectorAll('button, a[href], select, summary, [role=slider]')].filter(e => e.offsetParent !== null && !e.closest('p, .notes p')).map(e => e.getBoundingClientRect()).filter(r => r.width > 0 && (r.width < 24 || r.height < 24)).length);
    assert.equal(small, 0);
  }
});

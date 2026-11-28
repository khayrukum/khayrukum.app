// TST-21 (audio engine) and TST-25 (download all). Written by the test agent.
// These need the recitation files, which are NOT in Git (AUD-41): the tests build a throw-away artifact
// `dist-tst-audio` from local-audio/ and are SKIPPED when local-audio/ is absent (CI without private storage).
// Real media is used (Chromium decodes the MP3 files); only `play()` and element creation are instrumented.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from '../../tools/serve.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.join(ROOT, 'dist-tst-audio');
const HAVE = fs.existsSync(path.join(ROOT, 'local-audio/tuhfa/full.mp3'));
const skip = !HAVE && 'local-audio/ is not present (audio is kept out of Git until permission is recorded)';
let srv, BASE, browser, delayMp3 = 0; const open = new Set();

before(async () => {
  if (!HAVE) return;
  execFileSync(process.execPath, ['tools/build.mjs', '--out', 'dist-tst-audio', '--audio', 'on', '--audio-dir', 'local-audio'], { cwd: ROOT, stdio: 'pipe' });
  srv = createServer(OUT, { intercept: (req, res, u) => {
    if (!delayMp3 || !u.pathname.endsWith('.mp3') || req.headers.range) return false;
    const f = path.join(OUT, u.pathname); if (!fs.existsSync(f)) return false;
    setTimeout(() => { const b = fs.readFileSync(f); res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': b.length, 'Cache-Control': 'no-cache' }); res.end(b); }, delayMp3);
    return true;
  } });
  await new Promise(r => srv.listen(0, r)); BASE = `http://localhost:${srv.address().port}/`;
  browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
});
afterEach(async () => { delayMp3 = 0; for (const c of open) await c.close().catch(() => {}); open.clear(); });
after(async () => { await browser?.close(); srv?.close(); fs.rmSync(OUT, { recursive: true, force: true }); });

async function page(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 }, ...opts }); open.add(ctx);
  const p = await ctx.newPage(); p.errors = [];
  p.on('pageerror', e => p.errors.push(e.message));
  await p.addInitScript(() => {
    window.__plays = []; window.__created = 0; window.__ev = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { window.__plays.push({ during: window.event ? window.event.type : null, src: this.currentSrc || this.src, t: performance.now() }); return play.apply(this, arguments); };
    const ce = Document.prototype.createElement;
    Document.prototype.createElement = function (name) { const el = ce.apply(this, arguments); if (/^(audio|video)$/i.test(name)) { window.__created++; for (const t of ['ended', 'playing']) el.addEventListener(t, () => window.__ev.push({ t, at: performance.now(), src: el.currentSrc })); } return el; };
    const A = window.Audio; window.Audio = function (...a) { window.__created++; return new A(...a); };
  });
  return { ctx, p };
}
const settle = p => p.waitForLoadState('networkidle').then(() => p.waitForTimeout(200));
const au = (p, fn, arg) => p.evaluate(`(${fn})(document.querySelector('audio'), ${JSON.stringify(arg ?? null)})`);
const playing = p => p.waitForFunction(() => { const a = document.querySelector('audio'); return a && !a.paused && a.currentTime > 0.05; }, null, { timeout: 15000 });
const prefs = p => p.evaluate(() => new Promise(res => { const q = indexedDB.open('khayrukum'); q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').get('listen:prefs'); g.onsuccess = () => { q.result.close(); res(g.result); }; }; }));

test('TST-21a: play() runs synchronously inside the tap; one media element; only one item plays; bayt playback uses the per-bayt file (AUD-01/02/03/05/08)', { skip }, async () => {
  const { p } = await page();
  await p.goto(BASE + 'listen/'); await settle(p);
  await p.click('details[data-open="1"] > summary');
  await p.click('[data-bayt="2"]'); await playing(p);
  let plays = await p.evaluate(() => window.__plays);
  assert.equal(plays[0].during, 'click', 'play() was called while the click event was being dispatched (no await/timer before it)');
  assert.match(plays[0].src, /\/audio\/tuhfa\/bayt\/02\.mp3\?v=[0-9a-f]{8}$/);
  assert.deepEqual(await au(p, a => [a.preload, a.hasAttribute('playsinline')]), ['auto', true]);
  await p.click('[data-chapter="1"]'); await playing(p);
  assert.match(await au(p, a => a.currentSrc), /\/chapter\/01\.mp3/);
  await p.click('#allBtn'); await playing(p);
  assert.match(await au(p, a => a.currentSrc), /\/full\.mp3/);
  assert.match(await p.textContent('#nowT'), /التحفة كاملة · المقدمة/);
  plays = await p.evaluate(() => window.__plays);
  assert.ok(plays.slice(0, 3).every(x => x.during === 'click'), JSON.stringify(plays.map(x => x.during)));
  assert.equal(await p.locator('audio, video').count(), 1, 'exactly one media element in the page');
  assert.equal(await p.evaluate(() => window.__created), 1, 'exactly one media element was ever created');
  // pause/resume keeps the position (AUD-10)
  await p.click('#pp'); const t0 = await au(p, a => a.currentTime); await p.waitForTimeout(400);
  assert.equal(await au(p, a => a.paused), true); await p.click('#pp'); await playing(p);
  assert.ok((await au(p, a => a.currentTime)) >= t0, 'resume continues from the paused position');
  assert.deepEqual(p.errors, []);
});

test('TST-21b: a selection plays in ascending order on the same element with a gap ≤ 300 ms (ended → playing); without «كرّر» it stops on the last bayt, with it it restarts (AUD-04, LIS-05/06)', { skip }, async () => {
  const { p } = await page();
  await p.goto(BASE + 'listen/'); await settle(p);
  // cache the files first: AUD-04 is specified for cached files
  await p.evaluate(async () => { const m = await import(new URL('../assets/js/core/audio-cache.js', location.href).href); const col = await m.collection('tuhfa'); for (const id of ['bayt:2', 'bayt:3', 'bayt:5']) await m.cacheItem(col.byId.get(id)); });
  await p.click('#selMode');
  for (const b of [5, 3, 2]) await p.click(`.byt[data-b="${b}"]`);          // chosen out of order
  assert.match(await p.textContent('#selCount'), /٣ أبيات مختارة/);
  await p.click('#selPlay'); await playing(p);
  const order = [];
  for (let i = 0; i < 3; i++) {
    await p.waitForFunction(k => new RegExp(`الأبيات المختارة · ${'٠١٢٣٤٥٦٧٨٩'[k + 1]} من ٣`).test(document.querySelector('#nowT').textContent), i, { timeout: 15000 });
    await playing(p);
    order.push(+/bayt\/(\d+)\.mp3/.exec(await au(p, a => a.currentSrc))[1]);
    assert.equal(await p.locator('.byt.on').getAttribute('data-b'), String(order[i]), 'the current bayt is highlighted');
    await au(p, a => { a.currentTime = a.duration - 0.6; });                // jump close to the natural end
    if (i < 2) await p.waitForFunction(n => window.__ev.filter(e => e.t === 'ended').length > n, i, { timeout: 15000 });
  }
  assert.deepEqual(order, [2, 3, 5], 'ascending order');
  await p.waitForFunction(() => window.__ev.filter(e => e.t === 'ended').length >= 3, null, { timeout: 15000 });
  await p.waitForTimeout(700);
  assert.match(await p.textContent('#nowT'), /اختر بابًا أو بيتًا/, 'without «كرّر» playback stops after the last bayt');
  const ev = await p.evaluate(() => window.__ev);
  const gaps = []; ev.forEach((e, i) => { if (e.t === 'ended') { const nx = ev.slice(i + 1).find(x => x.t === 'playing'); if (nx) gaps.push(Math.round(nx.at - e.at)); } });
  console.log('# selection gaps ended→playing (ms):', gaps.join(', '));
  assert.equal(gaps.length, 2); assert.ok(gaps.every(g => g <= 300), 'gap ≤ 300 ms: ' + gaps.join(', '));
  assert.equal(await p.evaluate(() => window.__created), 1, 'the sequence stays on one element');
  // with «كرّر»: after the last bayt it restarts from the first
  await p.click('#loop'); await p.click('#selPlay'); await playing(p);
  for (let i = 0; i < 3; i++) { await playing(p); const before = await p.evaluate(() => window.__ev.filter(e => e.t === 'ended').length); await au(p, a => { a.currentTime = a.duration - 0.5; }); await p.waitForFunction(n => window.__ev.filter(e => e.t === 'ended').length > n, before, { timeout: 15000 }); }
  await playing(p);
  assert.match(await au(p, a => a.currentSrc), /bayt\/02\.mp3/, 'restarted from the first selected bayt');
  assert.match(await p.textContent('#nowT'), /الأبيات المختارة · ١ من ٣ · يتكرر/);
  assert.deepEqual(p.errors, []);
});

test('TST-21c: speed, pitch and loop apply immediately, survive a src change and persist across a reload (AUD-09, LIS-07/08)', { skip }, async () => {
  const { p } = await page();
  await p.goto(BASE + 'listen/'); await settle(p);
  assert.deepEqual(await p.$$eval('[data-rate]', b => b.map(x => x.textContent)), ['٠٫٥×', '٠٫٧٥×', '١×', '١٫٢٥×', '١٫٥×', '١٫٧٥×', '٢×', '٢٫٥×', '٣×']);
  await p.click('details[data-open="1"] > summary'); await p.click('[data-bayt="1"]'); await playing(p);
  await p.click('#speedBtn'); await p.click('[data-rate="1.5"]');
  assert.deepEqual(await au(p, a => [a.playbackRate, a.defaultPlaybackRate, a.preservesPitch]), [1.5, 1.5, true], 'applies immediately');
  await p.click('#loop');
  assert.equal(await au(p, a => a.loop), true, 'a single bayt loops with the native loop attribute (LIS-07)');
  assert.match(await p.textContent('#nowT'), /بيت ١ · .* · يتكرر/);
  await p.click('[data-bayt="3"]'); await playing(p);
  assert.deepEqual(await au(p, a => [a.playbackRate, a.preservesPitch, a.loop]), [1.5, true, true], 'kept after the src change');
  await p.waitForTimeout(300);
  assert.deepEqual([(await prefs(p)).rate, (await prefs(p)).loop], [1.5, true]);
  await p.reload(); await settle(p);
  assert.equal(await p.textContent('#speedBtn'), '١٫٥×'); assert.equal(await p.getAttribute('#loop', 'aria-pressed'), 'true');
  await p.click('[data-chapter="3"]'); await playing(p);
  assert.deepEqual(await au(p, a => [a.playbackRate, a.preservesPitch, a.loop]), [1.5, true, true], 'restored after a reload');
  assert.deepEqual(p.errors, []);
});

test('TST-21d: early-end recovery — `ended` far before the real end reloads from a blob URL and resumes at the same position, once (AUD-07)', { skip }, async () => {
  const { p } = await page();
  await p.goto(BASE + 'listen/'); await settle(p);
  await p.click('[data-chapter="1"]'); await playing(p);
  await p.waitForFunction(() => document.querySelector('audio').currentTime > 2, null, { timeout: 10000 });
  const pos = await au(p, a => { const t = a.currentTime; a.pause(); a.dispatchEvent(new Event('ended')); return t; });
  await p.waitForFunction(() => document.querySelector('audio').currentSrc.startsWith('blob:') && !document.querySelector('audio').paused, null, { timeout: 10000 });
  const now = await au(p, a => a.currentTime);
  assert.ok(now >= pos - 0.2 && now < pos + 3, `resumed near ${pos.toFixed(2)} s (now ${now.toFixed(2)} s)`);
  assert.match(await p.textContent('#nowT'), /الباب ١/);
  assert.deepEqual(p.errors, []);
});

test('TST-21e: the seek bar is a custom slider; a touch drag previews, seeks on release and does not scroll the page; keys work in RTL (AUD-12, LIS-09)', { skip }, async () => {
  const { ctx, p } = await page({ hasTouch: true, isMobile: true });
  await p.goto(BASE + 'listen/'); await settle(p);
  assert.equal(await p.locator('input[type=range]').count(), 0);
  await p.click('[data-chapter="2"]'); await playing(p);
  await p.evaluate(() => window.scrollTo(0, 300)); await p.waitForTimeout(150);
  const y0 = await p.evaluate(() => scrollY);
  assert.ok(y0 > 0, 'the page is scrolled, and the now-playing bar is still visible (sticky, LIS-02)');
  const box = await p.locator('#seek').boundingBox();
  assert.ok(box.y >= 0 && box.y < 400, 'sticky bar visible after scrolling');
  const attrs = await p.$eval('#seek', e => ({ role: e.getAttribute('role'), min: e.getAttribute('aria-valuemin'), max: +e.getAttribute('aria-valuemax'), text: e.getAttribute('aria-valuetext'), ta: getComputedStyle(e).touchAction }));
  assert.equal(attrs.role, 'slider'); assert.equal(attrs.min, '0'); assert.ok(attrs.max > 100); assert.match(attrs.text, /^[٠-٩]+:[٠-٩]{2} من [٠-٩]+:[٠-٩]{2}$/); assert.equal(attrs.ta, 'none');
  const cdp = await ctx.newCDPSession(p);
  const yMid = box.y + box.height / 2, pt = (x, y) => [{ x, y, id: 1 }];
  const tBefore = await au(p, a => a.currentTime);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(box.x + box.width * 0.9, yMid) });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(box.x + box.width * (0.9 - i * 0.05), yMid + i * 12) }); // drag left and DOWN
  const mid = await p.$eval('#seek', e => +e.getAttribute('aria-valuenow'));
  const tDuring = await au(p, a => a.currentTime);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(300);
  const tAfter = await au(p, a => a.currentTime), dur = await au(p, a => a.duration);
  assert.equal(await p.evaluate(() => scrollY), y0, 'the drag did not scroll the page');
  assert.ok(tDuring - tBefore < 2, 'no seek while dragging (preview only)');
  assert.ok(Math.abs(mid - dur * 0.5) < dur * 0.12, `preview shows the dragged position (RTL: 50 % from the right ≈ ${Math.round(dur * 0.5)} s, shown ${mid})`);
  assert.ok(Math.abs(tAfter - dur * 0.5) < dur * 0.12, `seek applied on release (${tAfter.toFixed(1)} of ${dur.toFixed(1)} s)`);
  // keys: ArrowLeft = +5 s, ArrowRight = −5 s, Home, End (clamped to duration − 0.1)
  await p.focus('#seek'); await au(p, a => a.pause());
  const k0 = await au(p, a => a.currentTime);
  await p.keyboard.press('ArrowLeft'); const k1 = await au(p, a => a.currentTime);
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); const k2 = await au(p, a => a.currentTime);
  assert.ok(Math.abs(k1 - (k0 + 5)) < 0.3 && Math.abs(k2 - (k0 - 5)) < 0.3, `ArrowLeft +5 / ArrowRight −5: ${k0.toFixed(1)} → ${k1.toFixed(1)} → ${k2.toFixed(1)}`);
  await p.keyboard.press('Home'); assert.ok((await au(p, a => a.currentTime)) < 0.2);
  await p.keyboard.press('End'); const e = await au(p, a => a.currentTime); assert.ok(e <= dur - 0.05 && e > dur - 0.5, 'End clamps to duration − 0.1');
  assert.deepEqual(p.errors, []);
});

test('TST-25: download all — size, progress, «أوقف», leaving the page stops it, «أكمل التحميل» skips cached files, done state on settings/listen/hub, delete; short quota (OFF-20…22, SET-02, LIS-11, HUB-06)', { skip }, async () => {
  const { p } = await page();
  const count = () => p.evaluate(async () => (await caches.has('khayr-audio-v1')) ? (await (await caches.open('khayr-audio-v1')).keys()).length : 0);
  const mp3Requests = []; p.on('request', r => { if (/\.mp3/.test(r.url())) mp3Requests.push(r.url()); });
  await p.goto(BASE + 'settings/'); await settle(p);
  assert.match(await p.textContent('#dlAll'), /^حمّل الصوت كله \(≈ [٠-٩٫]+ م\.ب\)$/);
  delayMp3 = 120;
  await p.click('#dlAll');
  await p.waitForSelector('#dlStop'); await p.waitForFunction(() => +document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow') >= 6, null, { timeout: 20000 });
  assert.match(await p.locator('#audioBox p').innerText(), /^[٠-٩]+ من ٧٢ ملفًا · [٠-٩٫]+ م\.ب$/);
  await p.click('#dlStop');
  await p.waitForSelector('#dlAll'); const k1 = await count();
  assert.ok(k1 >= 6 && k1 < 72, `stopped part-way (${k1} of 72)`);
  assert.match(await p.textContent('#dlAll'), new RegExp('^أكمل التحميل \\('), 'resume button after «أوقف»');
  // resume, then leave the page: the download must stop
  await p.click('#dlAll'); await p.waitForFunction(k => +document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow') >= k + 6, k1, { timeout: 20000 });
  await p.goto(BASE + 'listen/'); await settle(p);
  const k2 = await count(); await p.waitForTimeout(1500); const k3 = await count();
  assert.ok(k2 > k1 && k2 < 72, `more files after resuming (${k2})`); assert.equal(k3, k2, 'nothing is fetched after leaving the settings page');
  assert.match(await p.locator('#dl').innerText(), /^أكمل التحميل \([٠-٩]+ من ٧٢\)$/, 'LIS-11 resume state');
  // back: resume skips what is cached
  await p.goto(BASE + 'settings/'); await settle(p);
  delayMp3 = 0; mp3Requests.length = 0;
  await p.click('#dlAll');
  await p.getByText('الصوت محفوظ ✓').waitFor({ timeout: 60000 });
  assert.equal(await count(), 72);
  assert.equal(mp3Requests.length, 72 - k3, 'only the missing files were requested');
  assert.equal(new Set(mp3Requests).size, mp3Requests.length, 'no file requested twice');
  const ok = await p.evaluate(async () => { const c = await caches.open('khayr-audio-v1'); const man = await (await fetch(new URL('../data/audio/tuhfa.json', location.href))).json(); let bad = 0; for (const it of man.items) { const r = await c.match(new URL('../' + it.src + '?v=' + it.sha256.slice(0, 8), location.href).href); if (!r || r.status !== 200 || (await r.arrayBuffer()).byteLength !== it.bytes) bad++; } return bad; });
  assert.equal(ok, 0, 'every cached body has the manifest size and is a 200 (OFF-08/09)');
  await p.goto(BASE + 'listen/'); await settle(p); assert.equal(await p.locator('#dl').innerText(), 'الصوت محفوظ على الجهاز ✓');
  await p.goto(BASE); await settle(p); await p.getByText('الصوت محفوظ للعمل دون إنترنت ✓').waitFor({ timeout: 5000 });
  // delete asks for confirmation
  await p.goto(BASE + 'settings/'); await settle(p);
  await p.click('#dlDelete'); assert.equal(await count(), 72, 'nothing deleted before the confirmation');
  await p.click('#audioConfirm [data-c="yes"]'); await p.waitForSelector('#dlAll');
  assert.equal(await count(), 0); assert.match(await p.textContent('#dlAll'), /^حمّل الصوت كله/);
  // short quota
  await p.evaluate(() => { navigator.storage.estimate = async () => ({ quota: 5 * 1048576, usage: 1048576 }); });
  await p.click('#dlAll');
  await p.getByText('لا توجد مساحة كافية على الجهاز').waitFor({ timeout: 5000 });
  assert.equal(await count(), 0);
  assert.deepEqual(p.errors, []);
});

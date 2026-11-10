// Regression tests for defects found by the test agent. Each test fails until the defect is fixed
// (see TEST-REPORT.md). Needs dist/ (npm run build).
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from '../../tools/serve.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const DIST = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../dist');
let srv, BASE, browser; const open = new Set();
before(async () => {
  assert.ok(fs.existsSync(path.join(DIST, 'sw.js')), 'run node tools/build.mjs first');
  srv = createServer(DIST); await new Promise(r => srv.listen(0, r)); BASE = `http://localhost:${srv.address().port}/`;
  browser = await chromium.launch();
});
afterEach(async () => { for (const c of open) await c.close().catch(() => {}); open.clear(); });
after(async () => { await browser?.close(); srv?.close(); });

async function page() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] }); open.add(ctx);
  const p = await ctx.newPage(); p.errors = [];
  p.on('pageerror', e => p.errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') p.errors.push(m.text()); });
  return { ctx, p };
}
const settle = p => p.waitForLoadState('networkidle').then(() => p.waitForTimeout(250));
const gradeBad = async (p, exam, round, nth) => { await p.goto(BASE + 'exam/?id=' + exam); await settle(p); await p.click(`.rt[data-round="${round}"]`); await p.locator('button.g.bad').nth(nth).click(); await p.waitForTimeout(300); };

test('HIS-08: «انسخ الملخص» lists the verse / bayt NUMBER of each item (not a word index or the hemistich number)', async () => {
  const { p } = await page();
  await gradeBad(p, 'tuhfa', 'codes', 2);              // tuhfa/codes/03 → answer in bayt 10 (second hemistich)
  await gradeBad(p, 'baqarah-1', 'repeated-word', 2);  // baqarah-1/repeated-word/03 → answers in verses 20 and 25
  assert.match(await p.locator('#slips').innerText(), /آية ٢٠، ٢٥/, 'the exam page itself says verses 20 and 25');
  await p.goto(BASE + 'history/'); await settle(p);
  await p.click('#copy'); await p.waitForTimeout(150);
  const text = await p.evaluate(() => navigator.clipboard.readText());
  assert.match(text, /تحفة الأطفال · الرموز والحروف · بيت ١٠(\n|$)/, 'Tuhfa item names bayt 10:\n' + text);
  assert.match(text, /البقرة ١ · الكلمة المتكررة · آية ٢٠، ٢٥(\n|$)/, 'Baqarah item names verses 20 and 25:\n' + text);
});

test('GEN-03: the history page shows no Western digits for a graded random-number question', async () => {
  const { p } = await page();
  await p.goto(BASE + 'random/'); await settle(p); if (await p.locator('#ctl:not([open]) > summary').count()) { await p.click('#ctl > summary'); await p.waitForTimeout(100); } /* the range settings are folded while a set is running */
  await p.click('[data-src="baqarah-1"]'); await p.click('[data-src="baqarah-2"]');
  await p.click('[data-quick="tuhfa"][data-a="17"]'); await p.waitForTimeout(100);      // chapter 3 = bayt 17 only
  await p.click('#newSet'); await p.waitForTimeout(200);
  let found = false;
  for (let i = 0; i < 12 && !found; i++) { if (await p.locator('#rq .bignum').count()) found = true; else if (await p.locator('#next').count()) { await p.click('#next'); await p.waitForTimeout(80); } else break; }
  assert.ok(found, 'the set contains the generated «اقرأ البيت رقم ١٧» question');
  await p.click('button.g.bad'); await p.waitForTimeout(300);
  await p.goto(BASE + 'history/'); await settle(p);
  const item = await p.locator('.rv').first().innerText();
  assert.doesNotMatch(item, /[0-9]/, 'review item: ' + item.replace(/\n+/g, ' | '));
});

test('NFR-PRV-05 / DATA-61: a backup whose kv values have the wrong shape is rejected (or at least cannot break the exam and random pages)', async () => {
  const { p } = await page();
  await p.goto(BASE + 'settings/'); await settle(p);
  await p.click('#copyJson'); await p.waitForTimeout(150);
  const bk = JSON.parse(await p.evaluate(() => navigator.clipboard.readText()));
  bk.kv = { 'exam:baqarah-1': { grades: null, open: 'x', round: 5, updatedAt: 9e15 }, 'random:prefs': { src: 'x', ranges: null, n: 'big', updatedAt: 9e15 }, 'random:current': { set: 'abc', updatedAt: 9e15 } };
  await p.click('#pasteBox > summary'); await p.fill('#paste', JSON.stringify(bk)); await p.click('#importText'); await p.waitForTimeout(200);
  if (await p.locator('#importYes').count()) { await p.click('#importYes'); await p.waitForTimeout(300); }   // accepted → it must then be harmless
  p.errors.length = 0;
  await p.goto(BASE + 'exam/?id=baqarah-1'); await settle(p);
  assert.ok(await p.locator('.rt').count() > 0, 'the exam page still renders its rounds; errors: ' + p.errors.join(' | '));
  await p.goto(BASE + 'random/'); await settle(p);
  assert.ok(await p.locator('#newSet').count() > 0, 'the random page still renders; errors: ' + p.errors.join(' | '));
  assert.deepEqual(p.errors, []);
});

test('NFR-A11Y-04: choosing a theme does not put aria-pressed on <html>', async () => {
  const { p } = await page();
  await p.goto(BASE + 'settings/'); await settle(p);
  await p.click('button[data-theme="dark"]'); await p.click('button[data-theme="light"]');
  assert.equal(await p.evaluate(() => document.documentElement.getAttribute('aria-pressed')), null);
  assert.deepEqual(await p.$$eval('button[data-theme]', b => b.map(x => x.dataset.theme + ':' + x.getAttribute('aria-pressed'))), ['auto:false', 'light:true', 'dark:false']);
});

test('NFR-A11Y-04: the backup file chooser shows a visible focus indicator when reached with the keyboard', async () => {
  const { p } = await page();
  await p.goto(BASE + 'settings/'); await settle(p);
  await p.focus('#copyJson'); await p.keyboard.press('Tab');
  const r = await p.evaluate(() => {
    const e = document.activeElement, l = document.querySelector('label[for="file"]');
    const ring = x => { const c = getComputedStyle(x); return (c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0) || c.boxShadow !== 'none'; };
    const b = e.getBoundingClientRect();
    return { id: e.id, inputVisible: b.width > 4 && b.height > 4 && ring(e), labelRing: ring(l) };
  });
  assert.equal(r.id, 'file', 'Tab from «انسخ النسخة نصًّا» lands on the file input');
  assert.ok(r.inputVisible || r.labelRing, 'neither the 1 px clipped input nor its visible label shows focus');
});

test('EX-15 / DATA-01: a slip line does not end with a dangling Quranic pause mark', async () => {
  const { p } = await page();
  await gradeBad(p, 'baqarah-1', 'pages', 2);          // baqarah-1/pages/03: the 5th token of the prompt is a pause mark
  const line = await p.locator('#slips li').first().innerText();
  assert.doesNotMatch(line, /[ۖ-ۭ]\s*\)\s*$/, line);
});

test('GEN-08: «سجلي» shows the Quran and Tuhfa notes when it displays their text', async () => {
  const { p } = await page();
  await gradeBad(p, 'baqarah-1', 'next', 0); await gradeBad(p, 'tuhfa', 'next-bayt', 0);
  await p.goto(BASE + 'history/'); await settle(p);
  assert.ok(await p.locator('.rv .frag.qf').count() > 0 && await p.locator('.rv .bayt').count() > 0, 'history shows Quran and Tuhfa text');
  const notes = await p.locator('#notes').innerText();
  assert.match(notes, /المصحف هو المرجع عند أي شك/); assert.match(notes, /فنسختك هي المرجع/);
});

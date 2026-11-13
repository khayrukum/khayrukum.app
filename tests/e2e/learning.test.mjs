// Learning features (docs/LEARNING-PLAN.md): multiple choice «ما رقمها؟» and spaced review «وِرد اليوم».
// Needs dist/ (npm run build).
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

test('«ما رقمها؟»: four ordered choices; a tap answers, grades and locks the question, and survives a reload', async () => {
  const { p } = await page();
  await p.goto(BASE + 'random/'); await settle(p);
  let found = false;
  for (let i = 0; i < 80 && !found; i++) {
    if (await p.locator('#rq .choice').count()) found = true;
    else if (await p.locator('#next').count()) { const was = await p.locator('.qn').innerText(); await p.click('#next'); await p.waitForFunction(t => document.querySelector('.qn')?.textContent !== t, was); }
    else { await p.click('#result'); await p.waitForSelector('#play .panel #newSet2'); await p.click('#newSet2'); await p.waitForSelector('#rq'); }
  }
  assert.ok(found, 'a multiple-choice question turns up');
  const nums = await p.locator('#rq .choice').allInnerTexts();
  assert.equal(nums.length, 4); assert.equal(new Set(nums).size, 4);
  assert.equal(await p.locator('#rq #reveal').count(), 0, 'no self-grading buttons on a multiple-choice question');
  await p.locator('#rq .choice').first().click(); await p.waitForTimeout(300);
  assert.equal(await p.locator('#rq .choice.right').count(), 1, 'the right number is marked');
  assert.equal(await p.locator('#rq .choice:disabled').count(), 4, 'locked after answering');
  const verdict = await p.locator('#rq').getAttribute('class');
  assert.match(verdict, /r-(ok|bad)/);
  await p.reload(); await settle(p);
  assert.deepEqual(await p.locator('#rq .choice').allInnerTexts(), nums, 'same choices after a reload');
  assert.equal(await p.locator('#rq .choice.right').count(), 1);
  await p.goto(BASE + 'history/'); await settle(p);
  if (/r-bad/.test(verdict)) assert.match(await p.textContent('#main'), /مُصحَّح آليًّا/, 'a missed one is listed for review, marked as corrected by the app');
  assert.deepEqual(p.errors, []);
});

test('«وِرد اليوم»: a missed question comes back the next day, a right answer postpones it, a wrong one returns the day after', async () => {
  const { p } = await page(); const DAY = 86400000; const t0 = Date.now();
  await p.clock.install({ time: t0 });
  await p.goto(BASE + 'random/?due=1'); await settle(p);
  assert.match(await p.textContent('#main'), /لا مراجعات مستحقّة اليوم/); assert.ok(p.url().includes('due'), 'the address keeps the mode');
  await p.goto(BASE + 'exam/?id=baqarah-1'); await settle(p); await p.click('.rt[data-round="next"]');
  await p.locator('button.g.bad').nth(0).click(); await p.locator('button.g.mid').nth(1).click(); await p.locator('button.g.ok').nth(2).click(); await p.waitForTimeout(400);
  await p.goto(BASE); await settle(p);
  assert.match(await p.locator('[data-prg="due"]').innerText(), /غدًا/, 'nothing is due the same day');
  await p.clock.setFixedTime(t0 + DAY + 3600000);
  await p.goto(BASE); await settle(p);
  assert.match(await p.locator('[data-prg="due"]').innerText(), /٢ مستحقّة اليوم/, 'the two missed questions, not the one answered right');
  await p.goto(BASE + 'random/?due=1'); await settle(p);
  assert.equal(await p.locator('#title').innerText(), 'وِرد اليوم'); assert.match(await p.locator('.qn').innerText(), /١ من ٢/);
  await p.click('button.g.ok'); await p.click('#next'); await p.waitForTimeout(100); await p.click('button.g.bad'); await p.waitForTimeout(100); await p.click('#result'); await p.waitForTimeout(400);
  assert.match(await p.textContent('#play'), /أتممتَ وِرد اليوم/);
  await p.goto(BASE + 'random/?due=1'); await settle(p);
  assert.match(await p.textContent('#main'), /لا مراجعات مستحقّة اليوم/, 'done for today');
  await p.clock.setFixedTime(t0 + 2 * DAY + 3600000);
  await p.goto(BASE + 'random/?due=1'); await settle(p);
  assert.match(await p.locator('.qn').innerText(), /١ من ١/, 'only the one answered wrong returns the day after');
  await p.goto(BASE + 'random/'); await settle(p);
  assert.equal(await p.locator('#title').innerText(), 'الاختبار العشوائي'); assert.equal(await p.locator('#newSet2').count(), 1, 'the random exam keeps its own state');
  assert.deepEqual(p.errors, []);
});

test('«ما رقمها؟» drill inside an exam: ten per batch, a miss comes back until right, not in the exam score, saved', async () => {
  const { p } = await page();
  await p.goto(BASE + 'exam/?id=baqarah-2'); await settle(p);
  const score = await p.locator('#score').innerText();
  await p.click('.rt[data-round="which-number"]'); await p.click('[data-act="drillMore"]'); await p.waitForSelector('#qs article.drill');
  assert.match(await p.locator('#qs .qn').innerText(), /١٠/);
  const answer = async wrongFirst => {          // returns the verse number of the question just answered
    const btns = p.locator('#qs .choice');
    if (wrongFirst) { await btns.first().click(); }
    else { // find the right one without guessing: tap, and if wrong this question returns later
      await btns.first().click();
    }
    await p.waitForTimeout(60);
    const num = await p.locator('#qs .choice.right').innerText(); const wrong = await p.locator('#qs .choice.wrong').count();
    assert.equal(await p.locator('#qs .choice:disabled').count(), 4);
    await p.click('[data-act="drillNext"]'); await p.waitForTimeout(60);
    return { num, wrong };
  };
  const log = []; for (let k = 0; k < 40 && await p.locator('#qs .choice').count(); k++) log.push(await answer());
  // every miss is followed later by the same number again, and the batch ends only when each was answered right
  for (const [i, x] of log.entries()) if (x.wrong && i < log.length - 10) assert.ok(log.slice(i + 1).some(y => y.num === x.num), `${x.num} came back`); // the queue holds at most ten
  const last = new Map(); log.forEach(x => last.set(x.num, x)); assert.equal(last.size, 10, 'ten verses in the batch');
  if (log.length < 40) assert.ok([...last.values()].every(x => !x.wrong), 'each verse was finally answered right');
  assert.equal(await p.locator('#score').innerText(), score, 'the exam score is unchanged');
  await p.reload(); await settle(p);
  assert.match(await p.locator('.rt[data-round="which-number"]').innerText(), /١٠\/٣١/, 'progress saved');
  assert.deepEqual(p.errors, []);
});

test('«أوائل الحروف»: first letters only, tap reveals a word, a non-«صحيح» grade brings the verse back, not in the score, due the next day', async () => {
  const { p } = await page(); const t0 = Date.now();
  await p.goto(BASE + 'exam/?id=baqarah-1'); await settle(p);
  const score = await p.locator('#score').innerText();
  await p.click('.rt[data-round="first-letters"]'); await p.click('[data-act="drillMore"]'); await p.waitForSelector('#qs article.drill');
  const letters = await p.locator('#qs button.fl').allInnerTexts();
  assert.ok(letters.length >= 3 && letters.every(x => [...x].length === 1), 'one letter per word');
  await p.locator('#qs button.fl').first().click(); await p.waitForTimeout(80);
  assert.ok([...(await p.locator('#qs .fl.open').first().innerText())].length > 1, 'the tapped letter shows its whole word');
  const first = await p.locator('#qs .qtag').innerText();
  await p.click('[data-flg="mid"]'); await p.waitForTimeout(120);
  const seen = [];
  for (let k = 0; k < 15 && await p.locator('[data-flg]').count(); k++) { seen.push(await p.locator('#qs .qtag').innerText()); await p.click('[data-flg="ok"]'); await p.waitForTimeout(120); }
  assert.equal(seen[seen.length - 1], first, 'the verse graded «متردد» came back at the end of the batch');
  assert.match(await p.textContent('#qs'), /أتقنت من أول مرة ٩ من ١٠/);
  assert.equal(await p.locator('#score').innerText(), score);
  await p.clock.install({ time: t0 + 86400000 + 3600000 }); // the clock is set only now: a frozen clock stalls the taps above
  await p.goto(BASE + 'random/?due=1'); await settle(p);
  assert.match(await p.textContent('#main'), /سمّع الآية من أوائل حروفها/, 'it is due in «وِرد اليوم» the next day');
  assert.deepEqual(p.errors, []);
});

test('«الإخفاء التدريجي»: verses in order, five per batch, a quarter more hidden per step until only the first word is left; grade only at the end', async () => {
  const { p } = await page();
  await p.goto(BASE + 'exam/?id=baqarah-2'); await settle(p);
  await p.click('.rt[data-round="progressive-hide"]'); await p.click('[data-act="drillMore"]'); await p.waitForSelector('#qs article.drill');
  assert.equal(await p.locator('#qs .qtag').innerText(), 'آية ٤٤', 'starts at the first verse of the exam');
  const count = async () => [await p.locator('#qs .hw').count(), await p.locator('#qs .hw-open').count()];
  const [h0, o0] = await count(); assert.equal(h0, 0); const words = o0;
  let prev = 0;
  for (let s = 1; s <= 4; s++) {
    assert.equal(await p.locator('[data-flg]').count(), 0, 'no grading before the last step');
    await p.click('[data-act="hdMore"]'); await p.waitForTimeout(60);
    const [h] = await count(); assert.ok(h > prev, `step ${s} hides more`); prev = h;
  }
  assert.deepEqual(await count(), [words - 1, 1], 'only the first word is left');
  await p.locator('#qs button.hw').first().click(); await p.waitForTimeout(60);
  assert.deepEqual(await count(), [words - 2, 2], 'a tap shows one hidden word');
  const order = [];
  for (let k = 0; k < 5; k++) { order.push(await p.locator('#qs .qtag').innerText()); if (k) for (let s = 0; s < 4; s++) await p.click('[data-act="hdMore"]'); await p.click('[data-flg="ok"]'); await p.waitForTimeout(120); }
  assert.deepEqual(order, ['آية ٤٤', 'آية ٤٥', 'آية ٤٦', 'آية ٤٧', 'آية ٤٨'], 'in order, five per batch');
  assert.match(await p.textContent('#qs'), /أتقنت من أول مرة ٥ من ٥/);
  assert.deepEqual(p.errors, []);
});

test('«رتّب الآيات»: four consecutive verses shown out of order; tapping them in order is right, otherwise the group returns; undo works', async () => {
  const { p } = await page(); const num = s => +s.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  await p.goto(BASE + 'exam/?id=baqarah-1'); await settle(p);
  const score = await p.locator('#score').innerText();
  await p.click('.rt[data-round="order-verses"]'); await p.click('[data-act="drillMore"]'); await p.waitForSelector('#qs article.drill');
  const startOf = async () => num((await p.locator('#qs .qtag').innerText()).match(/[٠-٩]+/)[0]);
  const s1 = await startOf();
  const shown = (await p.locator('#qs button.ord-i').evaluateAll(bs => bs.map(b => +b.dataset.ord)));
  assert.deepEqual([...shown].sort((a, b) => a - b), [s1, s1 + 1, s1 + 2, s1 + 3], 'four consecutive verses');
  assert.notDeepEqual(shown, [s1, s1 + 1, s1 + 2, s1 + 3], 'not already in order');
  await p.click(`#qs [data-ord="${s1 + 1}"]`); await p.click('[data-act="orUndo"]'); assert.equal(await p.locator('#qs [aria-pressed="true"]').count(), 0);
  for (const x of [s1 + 1, s1, s1 + 2, s1 + 3]) await p.click(`#qs [data-ord="${x}"]`);
  assert.equal(await p.locator('#qs .banner.warn').count(), 1, 'a wrong order is marked');
  await p.click('[data-act="orNext"]'); await p.waitForTimeout(100);
  const seen = [];
  for (let k = 0; k < 6 && await p.locator('#qs button.ord-i').count(); k++) {
    const s0 = await startOf(); seen.push(s0);
    for (let i = 0; i < 4; i++) await p.click(`#qs [data-ord="${s0 + i}"]`);
    assert.equal(await p.locator('#qs .banner.good').count(), 1);
    await p.click('[data-act="orNext"]'); await p.waitForTimeout(100);
  }
  assert.equal(seen[seen.length - 1], s1, 'the missed group came back at the end');
  assert.match(await p.textContent('#qs'), /رتّبت من أول مرة ٤ من ٥/);
  assert.equal(await p.locator('#score').innerText(), score);
  assert.deepEqual(p.errors, []);
});

test('«خريطة الصفحة»: page and position checked against the page table; the picks stay visible; Quran exams only', async () => {
  const { p } = await page();
  const meta = JSON.parse(fs.readFileSync(path.join(DIST, 'data/quran/meta.json'), 'utf8'));
  const { pageOf } = await import(path.join(DIST, 'assets/js/core/pages.js'));
  assert.deepEqual(pageOf(meta, 2, 5), { page: 2, pos: 'last' }); assert.deepEqual(pageOf(meta, 2, 77), { page: 12, pos: 'first' }); assert.deepEqual(pageOf(meta, 2, 80), { page: 12, pos: 'mid' });
  await p.goto(BASE + 'exam/?id=baqarah-3'); await settle(p);
  await p.click('.rt[data-round="page-map"]'); await p.click('[data-act="drillMore"]'); await p.waitForSelector('#qs article.drill');
  for (let k = 0; k < 3; k++) {
    const pages = await p.locator('#qs [data-pp]').evaluateAll(bs => bs.map(b => +b.dataset.pp));
    const pick = pages[0];
    await p.click(`#qs [data-pp="${pick}"]`); await p.click('#qs [data-ppos="mid"]'); await p.waitForTimeout(80);
    assert.deepEqual(await p.locator('#qs [data-pp]').evaluateAll(bs => bs.map(b => +b.dataset.pp)), pages, 'same page choices after answering');
    const banner = await p.locator('#qs .banner').innerText();
    const [, aya, pg] = banner.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).match(/الآية (\d+) · صفحة (\d+)/).map(Number);
    const truth = pageOf(meta, 2, aya); assert.equal(pg, truth.page, 'the stated page matches the table');
    const want = (pick === truth.page) + (truth.pos === 'mid') === 2 ? 'r-ok' : (pick === truth.page) || truth.pos === 'mid' ? 'r-mid' : 'r-bad';
    assert.match(await p.locator('#qs article').getAttribute('class'), new RegExp(want));
    if (pick !== truth.page) assert.equal(await p.locator(`#qs [data-pp="${pick}"].wrong`).count(), 1, 'a wrong pick stays visible');
    await p.click('[data-act="pmNext"]'); await p.waitForTimeout(80);
  }
  await p.goto(BASE + 'exam/?id=tuhfa'); await settle(p);
  assert.equal(await p.locator('.rt[data-round="page-map"]').count(), 0, 'not in the Tuhfa');
  assert.deepEqual(p.errors, []);
});

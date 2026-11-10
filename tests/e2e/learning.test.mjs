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
    else if (await p.locator('#next').count()) { await p.click('#next'); await p.waitForTimeout(60); }
    else { await p.click('#result'); await p.click('#newSet2'); await p.waitForTimeout(150); }
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
  assert.match(await p.textContent('#main'), /مُصحَّح آليًّا/, 'the history marks it as corrected by the app');
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

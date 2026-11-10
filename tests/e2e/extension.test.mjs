// TST-30: data-only extension. A `baqarah-3` fixture (rub' 5–6, 2:75–105) is added to a throw-away COPY of site/
// (nothing in site/ is touched). It must appear on the hub, in the random exam and in history with no code change
// (DATA-20, ARCH-02, RND-01…03). The fixture contains references only — no Quran text is typed here.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from '../../tools/serve.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
let tmp, srv, BASE, browser;

const FIXTURE = {
  schema: 'exam', version: '0.0.1-fixture', id: 'baqarah-3',
  summary: [{ kind: 'outline', title: 'fixture', items: [{ range: '2:75-82', text: 'fixture «[[q:2:75:1-2]]»' }] }],
  rounds: ['summary', 'next', 'mid-verse', 'random-number'], roundText: {}, plainQuotes: [],
  questions: [
    { id: 'baqarah-3/next/01', type: 'next', prompt: [{ ref: '2:75:-3', dots: 'before' }], answer: [{ ref: '2:76' }] },
    { id: 'baqarah-3/next/02', type: 'next', prompt: [{ ref: '2:92:-3', dots: 'before' }], answer: [{ ref: '2:93' }] },
    { id: 'baqarah-3/mid-verse/01', type: 'mid-verse', prompt: [{ ref: '2:83:5-8', dots: 'both' }], answer: [{ ref: '2:83' }] }
  ],
  retired: []
};

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'khayr-tst30-'));
  fs.cpSync(path.join(ROOT, 'site'), tmp, { recursive: true, filter: s => !/\/audio(\/|$)/.test(s.slice(path.join(ROOT, 'site').length)) || s.includes('/data/audio') });
  const idxP = path.join(tmp, 'data/exams/index.json'); const idx = JSON.parse(fs.readFileSync(idxP, 'utf8'));
  // The real exam 3 is published now; the test still proves the point by swapping in a three-question fixture
  // (data only) and dropping the «soon» entry that follows it.
  const e = idx.exams.find(x => x.id === 'baqarah-3'); assert.ok(e, 'index.json lists baqarah-3');
  Object.assign(e, { status: 'published', file: 'baqarah-3.json', pages: [11, 16] });
  idx.exams = idx.exams.filter(x => x.status !== 'soon');
  fs.writeFileSync(idxP, JSON.stringify(idx)); fs.writeFileSync(path.join(tmp, 'data/exams/baqarah-3.json'), JSON.stringify(FIXTURE));
  srv = createServer(tmp); await new Promise(r => srv.listen(0, r)); BASE = `http://localhost:${srv.address().port}/`;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); srv?.close(); if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); });

test('TST-30: a published baqarah-3 fixture appears on the hub, in the random exam (rub\' 5–6) and in history with no code change', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  const settle = () => p.waitForLoadState('networkidle').then(() => p.waitForTimeout(200));

  // hub: a card for the new exam, and no «الاختبار القادم» line any more
  await p.goto(BASE); await settle();
  const card = p.locator('a[href*="exam/?id=baqarah-3"]');
  assert.equal(await card.count(), 1, 'hub card for baqarah-3');
  assert.match(await card.innerText(), /اختبار ٣ · البقرة ٧٥–١٠٥/);
  assert.match(await card.innerText(), /الربعان الخامس والسادس/);
  assert.doesNotMatch(await p.locator('#main').innerText(), /الاختبار القادم/);

  // exam page renders from the fixture and grades
  await card.click(); await settle();
  assert.equal(await p.locator('h1').innerText(), 'اختبار ٣ · البقرة ٧٥–١٠٥');
  assert.deepEqual(await p.$$eval('.rt', t => t.map(x => x.dataset.round)), ['summary', 'next', 'mid-verse', 'random-number']);
  await p.click('.rt[data-round="next"]');
  assert.equal(await p.locator('article.q').count(), 2);
  await p.locator('[data-open]').first().click();
  const verse76 = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/data/quran/002.json'), 'utf8')).ayat[75];
  assert.ok((await p.locator('.ans .frag.qf').first().innerText()).includes(verse76.split(' ').slice(0, 3).join(' ')), 'answer shows 2:76 from the corpus');
  await p.locator('button.g.bad').first().click(); await p.waitForTimeout(200);
  assert.match(await p.textContent('#score'), /✗ ١ · من ٣ سؤال/);

  // hub progress for the new exam
  await p.goto(BASE); await settle();
  assert.match(await p.locator('a[href*="exam/?id=baqarah-3"]').innerText(), /١ من ٣ · ٠٪ صحيح/);

  // random exam: source chip, covered range 1–105, rub' 5 and 6 quick ranges, pool from the new exam
  await p.goto(BASE + 'random/'); await settle(); if (await p.locator('#ctl:not([open]) > summary').count()) { await p.click('#ctl > summary'); await p.waitForTimeout(100); } /* the range settings are folded while a set is running */
  assert.equal(await p.locator('[data-src="baqarah-3"]').count(), 1);
  assert.match(await p.locator('[data-src="baqarah-3"]').innerText(), /البقرة ٣/);
  assert.equal(await p.$eval('#to-quran2', s => s.options[s.options.length - 1].value), '105');
  const quick = await p.$$eval('[data-quick="quran2"]', b => b.map(x => `${x.textContent}|${x.dataset.a}-${x.dataset.b}`));
  assert.ok(quick.includes('الربع ٥|75-91'), 'quick range for rub\' 5: ' + quick.join(' ; '));
  assert.ok(quick.includes('الربع ٦|92-105'), 'quick range for rub\' 6');
  for (const id of ['baqarah-1', 'baqarah-2', 'tuhfa']) await p.click(`[data-src="${id}"]`);
  await p.click('[data-quick="quran2"][data-a="75"]'); await p.waitForTimeout(100);
  await p.click('#newSet'); await p.waitForTimeout(300);
  const set = await p.evaluate(() => new Promise(res => { const q = indexedDB.open('khayrukum'); q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').get('random:current'); g.onsuccess = () => res(g.result.set); }; }));
  assert.ok(set.length >= 3 && set.every(id => id.startsWith('baqarah-3/')), 'set drawn only from baqarah-3: ' + set.join(' '));
  assert.ok(set.includes('baqarah-3/next/01') && set.includes('baqarah-3/mid-verse/01'), 'rub\' 5 questions are in the pool');
  assert.ok(!set.includes('baqarah-3/next/02'), 'the rub\' 6 question (answer 2:93) drops out of the rub\' 5 range');
  assert.ok(set.filter(id => id.includes('/random-number/')).every(id => { const n = +id.split('/').pop(); return n >= 75 && n <= 91; }), 'generated numbers stay inside the range');
  await (async g => { if (await p.locator('#rq .choice').count()) await p.locator('#rq .choice').first().click(); else await p.click('#rq button.g.' + g); })('ok'); await p.waitForTimeout(200);

  // history: both events, with the new source name and a filter chip
  await p.goto(BASE + 'history/'); await settle();
  const txt = await p.locator('#main').innerText();
  assert.match(txt, /البقرة ٣/);
  assert.equal(await p.locator('.evline').count(), 2);
  assert.deepEqual(errors, []);
  await ctx.close();
});

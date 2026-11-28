// TST-16 support: normalization and per-verse alignment (DATA-25).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalize, alignVerse, findSpan } from '../../tools/lib/arabic.mjs';

test('normalization maps hamza seats, alef maqsura, ta marbuta and strips tashkeel', () => {
  assert.equal(normalize('ٱلْكِتَـٰبُ'), 'الكتب');
  assert.equal(normalize('أُو۟لَـٰٓئِكَ'), 'اوليك');
  assert.equal(normalize('هُدًى'), 'هدي');
  assert.equal(normalize('رَحْمَةِ'), 'رحمه');
});
test('one Uthmani token aligns to two Simple words («يا» + «أيها»)', () => {
  const r = alignVerse(['يَـٰٓأَيُّهَا', 'ٱلنَّاسُ'], ['يا', 'أيها', 'الناس']);
  assert.deepEqual(r.map, [0, 0, 1]); assert.equal(r.ok, true);
});
test('findSpan', () => { assert.deepEqual(findSpan(['a', 'b', 'a', 'b'], ['a', 'b']), [0, 2]); });
test('porting result: 0 mismatches, every override has a reason, porting log present (TST-16)', () => {
  const tsv = fs.readFileSync(new URL('../../tools/port/alignment-table.tsv', import.meta.url), 'utf8').trim().split('\n').slice(1).map(l => l.split('\t'));
  assert.ok(tsv.length > 400);
  assert.equal(tsv.filter(r => r[5] === 'mismatch').length, 0);
  assert.ok(tsv.filter(r => r[5] === 'override').every(r => r[6] && r[6].length > 10));
  assert.ok(fs.existsSync(new URL('../../tools/port/porting-log.md', import.meta.url)));
});

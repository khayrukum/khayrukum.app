// TST-15: word indexing (DATA-01), item rendering, chain expansion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseRef, selectWords, wordCount, resolveRef, splitInline, expandChain, isMarkToken } from '../../site/assets/js/core/refs.js';
import { itemHtml, itemText } from '../../site/assets/js/core/render.js';

const q2 = JSON.parse(fs.readFileSync(new URL('../../site/data/quran/002.json', import.meta.url)));
const tu = JSON.parse(fs.readFileSync(new URL('../../site/data/tuhfa/abyat.json', import.meta.url)));
const corpus = { verse: (s, a) => q2.ayat[a - 1], bayt: b => tu.abyat[b], review: b => tu.review[b] };
const v = a => q2.ayat[a - 1];

test('2:2 — pause marks are not words; a mark between selected words is kept, a trailing one is not', () => {
  const toks = v(2).split(' ');
  assert.ok(toks.some(isMarkToken), 'verse 2:2 contains mark-only tokens');
  assert.equal(wordCount(v(2), 'q'), toks.filter(t => !isMarkToken(t)).length);
  const w45 = selectWords(v(2), { from: 4, to: 5 }, 'q'); // رَيْبَ ۛ فِيهِ
  assert.equal(w45.split(' ').length, 3);
  assert.ok(isMarkToken(w45.split(' ')[1]));
  const w4 = selectWords(v(2), { from: 4, to: 4 }, 'q');
  assert.equal(w4.split(' ').length, 1, 'trailing mark after the last selected word is not rendered');
});

test('2:21 — «يا أيها الناس» is the 2 Uthmani tokens 2:21:1-2', () => {
  const s = resolveRef('2:21:1-2', corpus).parts[0].text;
  assert.equal(s.split(' ').length, 2);
  assert.equal(s, v(21).split(' ').slice(0, 2).join(' '));
});

test('t:25 — hemistich word ranges and last-N words', () => {
  assert.equal(resolveRef('t:25:2:2-5', corpus).parts[0].text, tu.abyat[25][1].split(' ').slice(1, 5).join(' '));
  assert.equal(resolveRef('t:25:1:-2', corpus).parts[0].text, tu.abyat[25][0].split(' ').slice(-2).join(' '));
  assert.equal(resolveRef('t:25', corpus).parts.length, 2);
  assert.throws(() => resolveRef('t:25:2:4-9', corpus), /out of bounds/);
});

test('ref grammar', () => {
  assert.deepEqual([parseRef('2:1-10').aya, parseRef('2:1-10').ayaTo], [1, 10]);
  assert.deepEqual(parseRef('2:27:-4').words, { last: 4 });
  assert.deepEqual(parseRef('2:27:4-').words, { from: 4, to: 'end' });
  assert.equal(parseRef('t:16:2').h, 2);
  assert.throws(() => parseRef('2:x'));
  assert.deepEqual(splitInline('a «[[q:2:54:4-6|2:54:9-10]]» b').map(p => p.refs || p.text), ['a «', ['2:54:4-6', '2:54:9-10'], '» b']);
});

test('item rendering: gapped, note, label, showRef', () => {
  const g = itemText({ refs: ['2:54:6-8', '2:54:14-15'], join: 'dots' }, corpus);
  assert.ok(g.includes(' … '));
  const h = itemHtml({ ref: '2:7:-3', dots: 'before', note: 'الكافرين' }, corpus);
  assert.match(h, /class="dots">…<\/span> <span class="frag qf"/);
  assert.match(h, /\(الكافرين\)/);
  assert.match(itemHtml({ text: 'الكتاب', note: 'قمرية · «[[t:25:2:2-5]]»' }, corpus), /frag t/);
  assert.match(itemHtml({ ref: '2:49:2-2', showRef: true }, corpus), /\(٤٩\)/);
  assert.match(itemHtml({ label: 'الإدغام', ref: 't:9:2:2' }, corpus), /<b>الإدغام<\/b>: /);
  // DATA-17: the note follows the review status, whatever the real data currently says
  assert.match(itemHtml({ ref: 't:26' }, { ...corpus, review: () => 'pending' }), /قيد المراجعة/, 'note on a bayt under review');
  assert.doesNotMatch(itemHtml({ ref: 't:26' }, { ...corpus, review: () => 'verified' }), /قيد المراجعة/, 'no note once verified');
});

test('chain shorthand expands forward and reversed', () => {
  const f = expandChain({ chainFrom: '2:1', chainTo: '2:3', words: 2, override: { '2:1': 1 } });
  assert.deepEqual(f.chain.map(c => c.ref), ['2:1:1-1', '2:2:1-2', '2:3:1-2']);
  const r = expandChain({ chainFrom: '2:43', chainTo: '2:30', words: 2 });
  assert.equal(r.chain.length, 14); assert.equal(r.chain[0].ref, '2:43:1-2'); assert.equal(r.chain[13].ref, '2:30:1-2');
});

// «مشغّل المدى» logic (TST-70): covered pages / rub's / verses, the clips of a range (also across part files),
// where a range is cut inside the pause, the range's time line and loop wrap, the verse and phrase being heard,
// and the cue → Uthmani word mapping of the import tool. Runs against the shipped Minshawi timings.
// No Quran text is typed here: verse texts come from the Tanzil files in data/source/.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as R from '../../site/assets/js/core/range-logic.js';
import { wordCount } from '../../site/assets/js/core/refs.js';
import { scaleIndex, cueWord, tanzilTexts, convert } from '../../tools/audio/recitation.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const rd = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const meta = rd('site/data/quran/meta.json'), col = rd('site/data/audio/minshawi.json');
const idx = R.buildIndex(col);
const near = (a, b, eps = 0.011) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);
const E = k => idx.byKey.get(k);

test('index: 10 parts, every covered verse once; basmala and isti\'adha entries are not verses', () => {
  assert.equal(idx.parts.length, 10);
  assert.equal(idx.byKey.size, 7 + 286 + 200 + 6 + 7 + 112);
  assert.ok(idx.has(4, 6) && !idx.has(4, 7) && idx.has(20, 129) && !idx.has(20, 128));
  assert.equal(idx.parts[0].entries[0].pre, true);
  assert.equal(idx.parts[5].entries.find(e => e.bas).bas, 3);
});

test('pages: only pages the parts cover completely are offered (RNG-03)', () => {
  const P = R.coveredUnits(meta, idx, 'P');
  assert.deepEqual(P.map(p => p.n), [...Array.from({ length: 77 }, (_, i) => i + 1), ...Array.from({ length: 10 }, (_, i) => 322 + i)]);
  assert.deepEqual([P[0].from, P[0].to], [[1, 1], [1, 7]]);
  assert.deepEqual([P[76].from, P[76].to], [[4, 1], [4, 6]], 'page 77 is An-Nisa 1–6, the last covered page of the first run');
  assert.ok(!P.some(p => p.n === 321), 'page 321 starts at Ta-Ha 126, which is not covered');
  assert.equal(new Set(P.slice(0, 77).map(p => p.run)).size, 1); assert.notEqual(P[76].run, P[77].run, 'a gap starts a new run');
  assert.equal(P.reduce((a, p) => a + p.count, 0), 7 + 286 + 200 + 6 + 112);
});

test('rub\'s and verses (RNG-03)', () => {
  const Q = R.coveredUnits(meta, idx, 'Q');
  assert.deepEqual(Q.map(q => q.n), [...Array.from({ length: 30 }, (_, i) => i + 1), 129, 130, 131, 132]);
  assert.deepEqual([Q[1].from, Q[1].to], [[2, 26], [2, 43]]);
  assert.deepEqual(Q[29].to, [3, 200], 'rub\' 30 ends with Al Imran');
  const A = R.coveredSuras(meta, idx);
  assert.deepEqual(A.map(s => [s.sura, s.ayas[0].n, s.ayas[s.ayas.length - 1].n]), [[1, 1, 7], [2, 1, 286], [3, 1, 200], [4, 1, 6], [20, 129, 135], [21, 1, 112]]);
});

test('«من … إلى» stays ordered and inside one unbroken run (RNG-04)', () => {
  const P = R.coveredUnits(meta, idx, 'P');
  assert.deepEqual(R.linkEnds(P, 5, 2, 'from'), [5, 5], 'from moved past to: to follows');
  assert.deepEqual(R.linkEnds(P, 5, 2, 'to'), [2, 2], 'to moved before from: from follows');
  assert.deepEqual(R.linkEnds(P, 70, 80, 'from'), [70, 76], 'to is pulled back to the end of the run of «from»');
  assert.deepEqual(R.linkEnds(P, 70, 80, 'to'), [77, 80], 'from is pushed to the start of the run of «to»');
  assert.deepEqual(R.linkEnds(P, 3, 9, 'to'), [3, 9]);
});

test('cut inside the pause: start just before the first sound, end just after the last (owner rule 2026-11-22)', () => {
  // long pause: 2:6 has boundary 121.45 and start 122.99 → h = 1.54
  const a = E('2:6'); assert.deepEqual([a.b, a.s], [121.45, 122.99]);
  near(R.cutStart(a), 122.99 - 0.3);
  near(R.cutEnd(a), 121.45 - 1.54 + 0.3); // pause start + 0.3
  // short pause (h < 0.3): both cuts fall on the boundary itself
  const short = { b: 10, s: 10.2 };
  near(R.cutStart(short), 10); near(R.cutEnd(short), 10);
  for (const p of idx.parts) for (const e of p.entries) { assert.ok(R.cutEnd(e) <= R.cutStart(e) + 1e-9); assert.ok(R.cutStart(e) <= e.s && R.cutStart(e) >= e.b - 1e-9, e.key); }
});

test('clips: one clip inside a part, cut at cutStart / cutEnd; the basmala belongs to verse 1 (RNG-05)', () => {
  const [c, ...rest] = R.buildClips(meta, idx, [2, 6], [2, 16]); // page 3
  assert.equal(rest.length, 0); assert.equal(c.part.id, 'm01');
  near(c.start, R.cutStart(E('2:6'))); near(c.end, R.cutEnd(E('2:17')));
  assert.deepEqual([c.entries[0].key, c.last.key, c.entries.length], ['2:6', '2:16', 11]);
  const [f] = R.buildClips(meta, idx, [1, 1], [1, 7]);
  near(f.start, R.cutStart(E('1:1'))); assert.equal(f.entries[0].key, '1:1', 'the isti\'adha that opens the file is not part of the range');
  near(f.end, R.cutEnd(idx.parts[0].entries.find(e => e.bas === 2)), 0.011);
  const [b] = R.buildClips(meta, idx, [2, 1], [2, 5]);
  assert.equal(b.entries[0].key, 'bas2', 'a range that opens a sura starts with its basmala'); near(b.start, R.cutStart(b.entries[0]));
  const [k] = R.buildClips(meta, idx, [3, 1], [3, 3]); assert.equal(k.part.id, 'm06'); assert.equal(k.entries[0].key, 'bas3');
});

test('consecutive units in one part file are one clip: played through, joined by position not by time (RNG-05)', () => {
  const P = R.coveredUnits(meta, idx, 'P');
  const c = R.buildClips(meta, idx, P[2].from, P[4].to); // pages 3–5
  assert.equal(c.length, 1);
  const one = [P[2], P[3], P[4]].map(u => R.buildClips(meta, idx, u.from, u.to)[0]);
  assert.equal(one[0].endKey.replace('/e', ''), one[1].startKey.replace('/s', ''), 'this unit\'s end boundary is the next unit\'s start boundary');
  near(c[0].start, one[0].start); near(c[0].end, one[2].end);
  assert.equal(R.buildClips(meta, idx, [2, 280], [3, 10]).length, 1, 'across a sura border inside one file (with the basmala inside)');
});

test('a range that crosses part files gives one clip per file; the next file\'s isti\'adha is skipped (RNG-06)', () => {
  const c = R.buildClips(meta, idx, [2, 58], [2, 64]);
  assert.deepEqual(c.map(x => x.part.id), ['m01', 'm02']);
  assert.equal(c[0].end, idx.parts[0].end, 'the first file plays to where its recitation ends (before the closing formula)');
  assert.equal(c[0].endKey, 'm01/end/e');
  near(c[1].start, R.cutStart(E('2:62'))); assert.equal(c[1].entries[0].key, '2:62');
  near(c[1].end, R.cutEnd(E('2:65')));
  const whole = R.buildClips(meta, idx, [1, 1], [4, 6]);
  assert.deepEqual(whole.map(x => x.part.id), ['m01', 'm02', 'm03a', 'm04', 'm05', 'm06', 'm07', 'm08', 'm09']);
  assert.equal(whole.reduce((a, x) => a + x.entries.filter(e => e.sura).length, 0), 499);
  assert.deepEqual(R.buildClips(meta, idx, [4, 1], [4, 9]), [], 'a verse that is not covered gives no range');
});

test('fine-tune moves the start or the end of a range by whole seconds and never inverts it (RNG-09)', () => {
  const [base] = R.buildClips(meta, idx, [2, 6], [2, 16]);
  const [t] = R.buildClips(meta, idx, [2, 6], [2, 16], { [base.startKey]: -1, [base.endKey]: 2 });
  near(t.start, base.start - 1); near(t.end, base.end + 2);
  assert.notEqual(base.startKey, R.buildClips(meta, idx, [2, 1], [2, 5])[0].endKey, 'the end before 2:6 and the start at 2:6 are tuned apart');
  const [x] = R.buildClips(meta, idx, [2, 6], [2, 6], { [base.startKey]: 500 });
  assert.ok(x.start < x.end);
});

test('time line: position, locate, loop wrap and the clip that follows (RNG-07)', () => {
  const c = R.buildClips(meta, idx, [2, 58], [2, 64]);
  const d0 = R.clipDur(c[0]), d1 = R.clipDur(c[1]), total = R.totalDur(c);
  near(total, d0 + d1, 1e-9);
  near(R.rangePos(c, 0, c[0].start + 5), 5); near(R.rangePos(c, 1, c[1].start + 5), d0 + 5);
  assert.equal(R.rangePos(c, 0, c[0].start - 3), 0); near(R.rangePos(c, 1, c[1].end + 9), total, 1e-9);
  assert.deepEqual(R.locate(c, 5), { i: 0, t: c[0].start + 5 });
  const l = R.locate(c, d0 + 2); assert.equal(l.i, 1); near(l.t, c[1].start + 2, 1e-9);
  const w = R.locate(c, total + 3, true); assert.equal(w.i, 0); near(w.t, c[0].start + 3, 1e-6);
  const back = R.locate(c, -2, true); assert.equal(back.i, 1); near(back.t, c[1].end - 2, 1e-6);
  assert.equal(R.locate(c, total + 3).i, 1, 'without loop the position is clamped to the end');
  assert.deepEqual([R.nextClip(0, 2, false), R.nextClip(1, 2, false), R.nextClip(1, 2, true), R.nextClip(0, 1, true)], [1, -1, 0, 0]);
});

test('the verse being heard follows verses[].start (RNG-08, STG-11)', () => {
  const [c] = R.buildClips(meta, idx, [2, 1], [2, 5]);
  assert.equal(R.entryAt(c, c.start).key, 'bas2');
  assert.equal(R.entryAt(c, E('2:2').s + 0.01).key, '2:2');
  assert.equal(R.entryAt(c, E('2:3').b).key, '2:2', 'in the pause before 2:3 the verse shown is still 2:2');
  assert.equal(R.entryAt(c, E('2:3').s).key, '2:3');
  assert.equal(R.entryAt(c, c.end + 5).key, '2:5');
  const flat = R.flatEntries(R.buildClips(meta, idx, [2, 60], [2, 63]));
  assert.deepEqual(flat.map(x => `${x.i}/${x.e.key}`), ['0/2:60', '0/2:61', '1/2:62', '1/2:63']);
});

test('phrases from cues: spans cover every word once; odd cues are tolerated (STG-12)', () => {
  assert.deepEqual(R.phraseSpans([[10, 1], [14, 7], [20, 13]], 20), { spans: [[1, 6], [7, 12], [13, 20]], times: [10, 14, 20] });
  assert.deepEqual(R.phraseSpans([[10, 3], [14, 3], [15, 2], [20, 99]], 8).spans, [[1, 2], [3, 7], [8, 8]], 'first phrase starts at word 1; cues that do not advance are dropped; past the end is clamped');
  assert.deepEqual(R.phraseSpans([], 5), { spans: [[1, 5]], times: [0] });
  assert.deepEqual([R.phraseAt([10, 14, 20], 9), R.phraseAt([10, 14, 20], 13.95), R.phraseAt([10, 14, 20], 30)], [0, 1, 2]);
  // every verse of the shipped data: spans are a partition of 1…count
  const T = tanzilTexts();
  for (const p of idx.parts) for (const e of p.entries.filter(x => x.sura)) {
    const count = wordCount(T.uthmani(e.sura, e.aya), 'q'); const { spans, times } = R.phraseSpans(p.cues.get(e.key), count);
    assert.equal(spans.length, times.length); assert.equal(spans[0][0], 1); assert.equal(spans[spans.length - 1][1], count, e.key);
    spans.forEach((s, i) => { assert.ok(s[0] <= s[1], e.key); if (i) assert.equal(s[0], spans[i - 1][1] + 1, e.key); });
  }
});

test('cue word: Simple-Clean index → Uthmani word; the same when counts match, aligned or scaled otherwise (AUD-34)', () => {
  assert.deepEqual([scaleIndex(0, 10, 5), scaleIndex(9, 10, 5), scaleIndex(5, 10, 5), scaleIndex(3, 1, 4), scaleIndex(2, 4, 0)], [0, 4, 2, 0, 0]);
  const T = tanzilTexts();
  const sc = (s, a) => T.simple(s, a).split(' ').filter(w => /[ء-ي]/.test(w)).length, uc = (s, a) => wordCount(T.uthmani(s, a), 'q');
  assert.equal(sc(2, 2), uc(2, 2)); // equal counts: identity, 1-based
  assert.deepEqual([0, 3, uc(2, 2) - 1].map(i => cueWord(i, T.uthmani(2, 2), T.simple(2, 2))), [1, 4, uc(2, 2)]);
  assert.equal(cueWord(999, T.uthmani(2, 2), T.simple(2, 2)), uc(2, 2), 'past the end is clamped');
  // 2:21 opens with «يا أيها»: two Simple-Clean words, one Uthmani token (DATA-01)
  assert.equal(sc(2, 21), uc(2, 21) + 1);
  assert.deepEqual([0, 1, 2, sc(2, 21) - 1].map(i => cueWord(i, T.uthmani(2, 21), T.simple(2, 21))), [1, 1, 2, uc(2, 21)]);
  // every cue of the shipped manifest names a word that exists, and the manifest is what the tool writes
  for (const [id, seg] of Object.entries(col.segments)) for (const [, k, w] of seg.cues) { const m = /^(\d+):(\d+)$/.exec(k); if (m) assert.ok(w >= 1 && w <= uc(+m[1], +m[2]), `${id} ${k} word ${w}`); }
  assert.deepEqual(convert({ ...rd(col.source.file), id: 'minshawi' }, T).segments, col.segments);
});

test('the shipped sura files are byte-equal to Tanzil and carry its notice (LIC-01/02, STG-10)', () => {
  const T = tanzilTexts(); const src = rd('site/data/quran/source.json');
  for (const [n, count] of [[1, 7], [3, 200], [4, 176], [20, 135], [21, 112]]) {
    const q = rd(`site/data/quran/${String(n).padStart(3, '0')}.json`);
    assert.equal(q.ayat.length, count); assert.equal(q.notice, src.notice);
    q.ayat.forEach((v, i) => assert.equal(v, T.uthmani(n, i + 1), `${n}:${i + 1}`));
    assert.equal(q.basmala, T.uthmani(1, 1)); assert.equal(q.basmalaPrefixed, n !== 1);
  }
});

// TST-15: grading rules (DATA-41), history aggregates, plan arithmetic, random pool, merge rules (DATA-44).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planGrade } from '../../site/assets/js/core/grading.js';
import { tiles, strengths, needsReview, byType, attemptTally } from '../../site/assets/js/core/stats.js';
import * as P from '../../site/assets/js/core/plan-logic.js';
import { buildPool, orderSet, inRange, numberChoices, pickBalanced } from '../../site/assets/js/core/random-logic.js';
import { mergeKv, mergeEvents, planImport, parseBackup } from '../../site/assets/js/core/backup.js';

let k = 0; const id = () => 'e' + (++k);
const base = { qid: 'baqarah-1/next/05', tool: 'exam', src: 'baqarah-1', type: 'next', dev: 'd' };

test('DATA-41: re-grade in the same session updates the event', () => {
  const [e] = planGrade([], { ...base, session: 's1', g: 'ok' }, 1, id);
  const [u] = planGrade([e], { ...base, session: 's1', g: 'bad' }, 2, id);
  assert.equal(u.id, e.id); assert.equal(u.g, 'bad'); assert.equal(u.updatedAt, 2);
});
test('DATA-41: clear in the same session tombstones', () => {
  const [e] = planGrade([], { ...base, session: 's1', g: 'ok' }, 1, id);
  const [c] = planGrade([e], { ...base, session: 's1', g: null }, 2, id);
  assert.equal(c.id, e.id); assert.equal(c.deleted, true);
});
test('DATA-41: clearing a grade from an earlier session leaves history unchanged', () => {
  const [e] = planGrade([], { ...base, session: 's1', g: 'ok' }, 1, id);
  assert.deepEqual(planGrade([e], { ...base, session: 's2', g: null }, 2, id), []);
});
test('DATA-41: re-grade in a new session (also after reset) appends', () => {
  const [e] = planGrade([], { ...base, session: 's1', g: 'ok' }, 1, id);
  const [n] = planGrade([e], { ...base, session: 's2', g: 'mid' }, 2, id);
  assert.notEqual(n.id, e.id);
});

const ev = (qid, g, t, src = 'baqarah-1', type = 'next') => ({ id: id(), qid, g, t, src, type, deleted: false });
test('history aggregates (HIS-03…06)', () => {
  const day = 86400000;
  const list = [ev('a', 'ok', 1), ev('a', 'ok', 2), ev('b', 'bad', 3), ev('b', 'bad', 4 + day), ev('c', 'mid', 5), ev('c', 'ok', 6), ev('d', 'ok', 7, 'tuhfa', 'codes')];
  const t = tiles(list);
  assert.equal(t.n, 7); assert.equal(t.ok, 4); assert.equal(t.mastered, 1); assert.equal(t.days, 2);
  const rv = needsReview(list); assert.deepEqual(rv.map(r => r.qid), ['b']); assert.equal(rv[0].counts.bad, 2);
  const s = strengths([ev('x', 'ok', 1), ev('y', 'ok', 2), ev('z', 'ok', 3), ev('w', 'bad', 4)]);
  assert.equal(s.length, 1); assert.equal(s[0].rate, 0.75);
  const bt = byType(list); assert.equal(bt.get('baqarah-1')[0].type, 'next'); assert.equal(bt.get('tuhfa')[0].n, 1);
  assert.deepEqual(attemptTally({ q1: 'ok', q2: 'ok', q3: 'bad', old: 'ok' }, ['q1', 'q2', 'q3', 'q4']), { ok: 2, mid: 0, bad: 1, graded: 3 });
});
test('HIS-05 sort: last bad first, then #bad, then most recent', () => {
  const l = [ev('m', 'mid', 10), ev('b1', 'bad', 1), ev('b2', 'bad', 2), ev('b2', 'bad', 3)];
  assert.deepEqual(needsReview(l).map(r => r.qid), ['b2', 'b1', 'm']);
});

test('plan arithmetic (PL-03/05/08/09/15)', () => {
  const s = P.freshPlan();
  s.week.reps = [3, 5, 1, 0, 0, 0, 2];
  assert.deepEqual(P.planTotals(s), { x: 9, y: 0 });
  s.week.reps = [9, 9, 9, 9, 9, 9, 9]; assert.equal(P.planTotals(s).x, 20);
  assert.equal(P.tapRep(0, 1), 2); assert.equal(P.tapRep(2, 1), 1);
  assert.deepEqual(P.reviewFor(1, 0), [3, 4, 5]); assert.deepEqual(P.reviewFor(1, 5), [18, 19, 20]); assert.deepEqual(P.reviewFor(10, 0), [1, 2, 3]);
  assert.equal(P.dayDone(s, 0), false);
  P.dayKeys(s, 0).forEach(k => { s.week.checks[k] = true; }); assert.equal(P.dayDone(s, 0), true);
  s.mistakes.push({ id: 'm', text: 'x', deleted: false }); assert.equal(P.dayDone(s, 0), false, 'Saturday mistake task added');
  const n = P.advance({ ...s, pair: 10, done: [10] }, 5);
  assert.equal(n.pair, 1); assert.deepEqual(n.done, [10]); assert.equal(n.history.length, 1); assert.deepEqual(n.week.reps, [0, 0, 0, 0, 0, 0, 0]);
  assert.equal(P.planTotals({ week: { reps: [] }, done: [1, 1, 2] }).y, 4);
  const sat = new Date(2026, 10, 7), sun = new Date(2026, 10, 8);
  const w = P.freshPlan(); assert.equal(P.showSaturdayBanner(w, sat), false);
  w.week.reps[6] = 1; assert.equal(P.showSaturdayBanner(w, sat), true); assert.equal(P.showSaturdayBanner(w, sun), false);
  w.week.satBannerDismissed = P.saturdayKey(sat); assert.equal(P.showSaturdayBanner(w, sat), false);
});

test('random pool (RND-05/06)', () => {
  const qs = [
    { id: 'b/next/01', type: 'next', answer: [{ ref: '2:10' }] },
    { id: 'b/next/02', type: 'next', answer: [{ ref: '2:30' }] },
    { id: 'b/pages/01', type: 'pages', answer: [{ ref: '2:44' }] }
  ];
  const p = buildPool([{ id: 'b', kind: 'quran', range: [1, 43], questions: qs }], { quran2: [1, 20], tuhfa: [1, 61] }, () => 0.3);
  assert.deepEqual(p.questions.map(q => q.id), ['b/next/01']);
  assert.equal(p.generated.length, 12); assert.ok(p.generated.every(g => g.number >= 1 && g.number <= 20 && g.id === `b/${g.type}/${g.number}`));
  assert.deepEqual([...new Set(p.generated.map(g => g.type))], ['random-number', 'which-number']);
  // «ما رقمها؟»: four distinct choices in order, the right one among them, all inside the range, stable for a seed
  for (const [num, lo, hi] of [[1, 1, 43], [43, 1, 43], [20, 1, 43], [3, 1, 4], [60, 44, 74]]) {
    const c = numberChoices(num, lo, hi, 'seed' + num);
    assert.equal(new Set(c).size, 4); assert.ok(c.includes(num)); assert.ok(c.every(x => x >= lo && x <= hi)); assert.deepEqual(c, [...c].sort((x, y) => x - y));
    assert.deepEqual(c, numberChoices(num, lo, hi, 'seed' + num));
  }
  assert.equal(buildPool([{ id: 'b', kind: 'quran', range: [1, 43], questions: [] }], { quran2: [1, 3], tuhfa: [1, 61] }).generated.filter(g => g.type === 'which-number').length, 0, 'no multiple choice with fewer than four numbers');
  assert.equal(inRange({ answer: [{ chain: [{ ref: '2:5:1-1' }, { ref: '2:21:1-1' }] }] }, { quran2: [1, 20] }), false);
  const o = orderSet([{ src: 'a', type: 'x' }, { src: 'a', type: 'x' }, { src: 'a', type: 'y' }]);
  assert.notDeepEqual([o[0].type, o[1].type], ['x', 'x']);
});

test('merge rules (DATA-44): events, kv, mistake tombstones, done union; idempotent import', () => {
  const local = [{ id: '1', t: 1, updatedAt: 1, g: 'ok', qid: 'q' }];
  const inc = [{ id: '1', t: 1, updatedAt: 5, g: 'bad', qid: 'q' }, { id: '2', t: 2, updatedAt: 2, g: 'ok', qid: 'q' }];
  assert.deepEqual(mergeEvents(local, inc).map(e => e.id), ['1', '2']);
  assert.deepEqual(mergeEvents(inc, inc), []);
  const a = { pair: 2, done: [1], mistakes: [{ id: 'm1', text: 'a', deleted: true, updatedAt: 9 }], history: [], updatedAt: 1 };
  const b = { pair: 3, done: [2], mistakes: [{ id: 'm1', text: 'a', deleted: false, updatedAt: 3 }, { id: 'm2', text: 'b', deleted: false, updatedAt: 4 }], history: [], updatedAt: 2 };
  const m = mergeKv('plan:baqarah', a, b);
  assert.equal(m.pair, 3); assert.deepEqual(m.done, [1, 2]);
  assert.equal(m.mistakes.find(x => x.id === 'm1').deleted, true, 'deleted mistakes do not come back');
  assert.equal(mergeKv('exam:x', { updatedAt: 5, v: 1 }, { updatedAt: 3, v: 2 }).v, 1);
  const data = { format: 'khayrukum-backup', schema: 1, exportedAt: 1, kv: { 'exam:baqarah-1': { updatedAt: 3, grades: {} } }, events: inc };
  const p1 = planImport({}, [], data); assert.equal(p1.added, 2); assert.equal(p1.updatedExams, 1);
  const p2 = planImport({ 'exam:baqarah-1': data.kv['exam:baqarah-1'] }, inc, data); assert.equal(p2.added, 0); assert.equal(p2.events.length, 0);
  assert.equal(parseBackup(JSON.stringify(data)).ok, true);
  assert.equal(parseBackup('{"format":"x"}').ok, false);
  assert.equal(parseBackup(JSON.stringify({ ...data, kv: { evil: 1 } })).ok, false);
});

test('random exam: every source gets an equal share', () => {
  const mk = (src, k) => Array.from({ length: k }, (_, i) => ({ id: `${src}/${i}`, src, type: 'x' }));
  const count = l => l.reduce((m, q) => (m[q.src] = (m[q.src] || 0) + 1, m), {});
  assert.deepEqual(count(pickBalanced([...mk('b1', 30), ...mk('b2', 25), ...mk('t', 90)], 15)), { b1: 5, b2: 5, t: 5 });
  const short = count(pickBalanced([...mk('b1', 2), ...mk('t', 90)], 10)); assert.deepEqual(short, { b1: 2, t: 8 }, 'a short source gives its share away');
  assert.equal(pickBalanced(mk('t', 3), 10).length, 3);
  const ids = pickBalanced([...mk('b1', 30), ...mk('t', 90)], 25).map(q => q.id); assert.equal(new Set(ids).size, 25, 'no duplicates');
});

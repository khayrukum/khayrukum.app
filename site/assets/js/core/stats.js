// Pure history aggregates (HIS-03…07, HUB-02/04). No DOM, no storage.
import { dayKey } from './fmt.js';

export const live = events => events.filter(e => !e.deleted);

/** HIS-03 tiles. */
export function tiles(ev) {
  const n = ev.length, ok = ev.filter(e => e.g === 'ok').length;
  const byQ = groupBy(ev, e => e.qid);
  let mastered = 0;
  for (const list of byQ.values()) {
    const s = list.slice().sort((a, b) => a.t - b.t);
    if (s.length >= 2 && s[s.length - 1].g === 'ok' && s[s.length - 2].g === 'ok') mastered++;
  }
  const days = new Set(ev.map(e => dayKey(e.t))).size;
  return { n, ok, mastered, days };
}

/** HIS-04: (source, type) pairs with ≥ 4 events and ok rate ≥ 75 %, sorted by rate, top 6. */
export function strengths(ev) {
  const g = groupBy(ev, e => e.src + '|' + e.type);
  return [...g.entries()].map(([k, l]) => { const [src, type] = k.split('|'); const ok = l.filter(e => e.g === 'ok').length; return { src, type, n: l.length, ok, rate: ok / l.length }; })
    .filter(x => x.n >= 4 && x.rate >= 0.75)
    .sort((a, b) => b.rate - a.rate || b.n - a.n).slice(0, 6);
}

/** HIS-05: questions whose most recent event is not ok. Sorted: last bad first, then #bad, then most recent. */
export function needsReview(ev) {
  const out = [];
  for (const [qid, l] of groupBy(ev, e => e.qid)) {
    const s = l.slice().sort((a, b) => a.t - b.t);
    const last = s[s.length - 1];
    if (last.g === 'ok') continue;
    const c = { ok: 0, mid: 0, bad: 0 }; s.forEach(e => c[e.g]++);
    out.push({ qid, last, counts: c, n: s.length });
  }
  return out.sort((a, b) => ((b.last.g === 'bad') - (a.last.g === 'bad')) || (b.counts.bad - a.counts.bad) || (b.last.t - a.last.t));
}

/** HIS-06: per source, one row per type ID, sorted by ok rate ascending. */
export function byType(ev) {
  const res = new Map();
  for (const [src, l] of groupBy(ev, e => e.src)) {
    const rows = [...groupBy(l, e => e.type).entries()].map(([type, x]) => {
      const c = { ok: 0, mid: 0, bad: 0 }; x.forEach(e => c[e.g]++);
      return { type, n: x.length, ...c, rate: c.ok / x.length };
    }).sort((a, b) => a.rate - b.rate);
    res.set(src, rows);
  }
  return res;
}

/** HIS-07: events grouped by local day, newest first. */
export function byDay(ev) {
  const g = groupBy(ev.slice().sort((a, b) => b.t - a.t), e => dayKey(e.t));
  return [...g.entries()].map(([day, l]) => ({ day, t: l[0].t, events: l, ok: l.filter(e => e.g === 'ok').length }));
}

/** HUB-02 / EX-02: tally of an attempt over the current data only. */
export function attemptTally(grades, qids) {
  const set = new Set(qids);
  const c = { ok: 0, mid: 0, bad: 0, graded: 0 };
  for (const [q, g] of Object.entries(grades || {})) if (set.has(q) && c[g] != null) { c[g]++; c.graded++; }
  return c;
}

export function groupBy(list, fn) {
  const m = new Map();
  for (const x of list) { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
}

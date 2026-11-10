// Pure random-exam logic (RND-05, RND-06). Unit-tested.
import { parseRef } from './refs.js';

const refsOf = q => {
  const out = [];
  for (const a of q.answer || []) { if (a.ref) out.push(a.ref); if (a.refs) out.push(...a.refs); (a.chain || []).forEach(c => { if (c.ref) out.push(c.ref); if (c.refs) out.push(...c.refs); }); }
  return out;
};
/** True when every answer ref falls inside the selected range of its family. */
export function inRange(q, ranges) {
  const refs = refsOf(q);
  if (!refs.length) return false;
  return refs.every(r => {
    const p = parseRef(r);
    const [a, b] = p.kind === 'q' ? ranges.quran2 : ranges.tuhfa;
    const lo = p.kind === 'q' ? p.aya : p.bayt, hi = p.kind === 'q' ? p.ayaTo : p.bayt;
    return lo >= a && hi <= b;
  });
}

/**
 * sources: [{id, kind, range:[a,b], questions:[gradable-in-random questions]}]
 * ranges: {quran2:[a,b], tuhfa:[a,b]}
 * Returns { questions, generated } where generated are up to 6 random-number questions per source (RND-05).
 */
export function buildPool(sources, ranges, rnd = Math.random) {
  const questions = []; const generated = [];
  for (const s of sources) {
    const fam = s.kind === 'tuhfa' ? 'tuhfa' : 'quran2';
    const [ra, rb] = ranges[fam];
    questions.push(...s.questions.filter(q => q.type !== 'random-number' && inRange(q, ranges)));
    const lo = Math.max(ra, s.range[0]), hi = Math.min(rb, s.range[1]);
    const nums = []; for (let x = lo; x <= hi; x++) nums.push(x);
    for (const type of ['random-number', 'which-number']) {
      if (type === 'which-number' && nums.length < 4) continue; // four choices need four numbers
      shuffle(nums.slice(), rnd).slice(0, 6).forEach(num => generated.push({
        id: `${s.id}/${type}/${num}`, type, src: s.id, kind: s.kind, number: num,
        answer: [{ ref: s.kind === 'tuhfa' ? `t:${num}` : `2:${num}` }]
      }));
    }
  }
  return { questions, generated };
}

export function shuffle(a, rnd = Math.random) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** RND-06: avoid the same source and type twice in a row where possible (greedy). */
export function orderSet(list) {
  const rest = list.slice(); const out = [];
  while (rest.length) {
    const last = out[out.length - 1];
    let i = last ? rest.findIndex(q => !(q.src === last.src && q.type === last.type)) : 0;
    if (i < 0) i = 0;
    out.push(rest.splice(i, 1)[0]);
  }
  return out;
}

/**
 * Four choices for a «ما رقمها؟» question: the right number and three close ones (within ±6, inside [lo, hi]),
 * in ascending order. Deterministic for a given seed, so a reload shows the same choices.
 */
export function numberChoices(num, lo, hi, seed) {
  let h = 2166136261; for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
  const near = []; for (let x = Math.max(lo, num - 6); x <= Math.min(hi, num + 6); x++) if (x !== num) near.push(x);
  for (let x = lo; near.length < 3 && x <= hi; x++) if (x !== num && !near.includes(x)) near.push(x);
  return [num, ...shuffle(near, rnd).slice(0, 3)].sort((a, b) => a - b);
}

/**
 * Pick n questions with an equal share for every source, so a source with many questions
 * (the Tuhfa has far more than one Baqarah exam) does not crowd out the others.
 * A source that runs short gives its unused share to the rest.
 */
export function pickBalanced(list, n, rnd = Math.random) {
  const by = new Map();
  for (const q of shuffle(list.slice(), rnd)) { if (!by.has(q.src)) by.set(q.src, []); by.get(q.src).push(q); }
  const groups = shuffle([...by.values()], rnd); const out = [];
  while (out.length < n && groups.some(g => g.length)) {
    for (const g of groups) { if (out.length >= n) break; if (g.length) out.push(g.pop()); }
  }
  return out;
}

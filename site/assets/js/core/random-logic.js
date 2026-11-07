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
    shuffle(nums, rnd).slice(0, 6).forEach(num => generated.push({
      id: `${s.id}/random-number/${num}`, type: 'random-number', src: s.id, kind: s.kind, number: num,
      answer: [{ ref: s.kind === 'tuhfa' ? `t:${num}` : `2:${num}` }]
    }));
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

// «رتّب الآيات»: four consecutive verses (or abyat) shown shuffled by their opening words; the reader taps them
// in order and the app checks. Generated in the exam's drill round; in «وِرد اليوم» it is shown and self-graded.
import { makeType } from './generic.js';
import { letterTokens } from '../core/refs.js';
import { shuffle } from '../core/choices.js';
import { esc, n } from '../core/fmt.js';

export const SPAN = 4;
const OPEN_WORDS = 6;
/** Window starts covering [a, z] with SPAN verses each; the last window ends on z. */
export function windows(a, z) {
  const out = []; for (let s = a; s <= z - SPAN + 1; s += SPAN) out.push(s);
  if (z - a + 1 >= SPAN && out[out.length - 1] + SPAN - 1 < z) out.push(z - SPAN + 1);
  return out;
}
/** Shown order for a window (never already in order), fixed for a seed. */
export function shownOrder(start, seed) {
  let h = 2166136261; for (const c of String(seed) + ':' + start) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
  const nums = Array.from({ length: SPAN }, (_, i) => start + i); let o;
  do o = shuffle(nums.slice(), rnd); while (o.every((x, i) => x === nums[i]));
  return o;
}
/** Opening words of a verse/bayt (the first hemistich for a bayt), pause marks dropped. */
export function opening(corpus, kind, num) {
  const text = kind === 'tuhfa' ? (corpus.bayt(num) || [''])[0] : corpus.verse(2, num);
  const w = letterTokens(text || '', kind === 'tuhfa' ? 't' : 'q').filter(t => !t.mark).map(t => t.word);
  return w.slice(0, OPEN_WORDS).join(' ') + (w.length > OPEN_WORDS ? ' …' : '');
}
export default makeType('order-verses', { exam: false, random: true }, {
  render(q, ctx) { return `<ol class="ord" type="I">${shownOrder(q.number, 'srs').map(x => `<li class="ord-i">${esc(opening(ctx.corpus, q.kind, x))}</li>`).join('')}</ol>`; },
  answerView(q, ctx) { return `<ol class="ord">${Array.from({ length: SPAN }, (_, i) => q.number + i).map(x => `<li class="ord-i"><b>${n(x)}</b> ${esc(opening(ctx.corpus, q.kind, x))}</li>`).join('')}</ol>`; }
});

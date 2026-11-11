// «الإخفاء التدريجي»: the verse/bayt is read in full, then hidden a quarter at a time (the first word stays)
// while the reader recites it after each step. Generated in the exam's drill round; shown fully hidden in «وِرد اليوم».
import { makeType } from './generic.js';
import { answerLines } from '../core/render.js';
import { letterTokens } from '../core/refs.js';
import { shuffle } from '../core/choices.js';
import { esc } from '../core/fmt.js';

export const STAGES = 4;
/** Which word indexes are hidden at a stage: a fixed order per verse, the first word never hidden. */
function hiddenAt(count, num, stage) {
  let h = 2166136261 + num * 7919; const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
  const order = shuffle(Array.from({ length: Math.max(0, count - 1) }, (_, i) => i + 1), rnd);
  return new Set(order.slice(0, Math.ceil((order.length * stage) / STAGES)));
}
export function hideHtml(parts, kind, num, { stage = STAGES, peek = {}, tap = false } = {}) {
  const lines = parts.map(text => letterTokens(text, kind === 'tuhfa' ? 't' : 'q'));
  const hidden = hiddenAt(lines.reduce((a, l) => a + l.filter(t => !t.mark).length, 0), num, stage);
  let w = 0, k = 0;
  return lines.map(l => `<div class="fl-line">${l.map(t => {
    const i = k++; if (t.mark) return `<span class="fl-mark">${esc(t.word)}</span>`;
    const hid = hidden.has(w++) && !peek[i];
    if (!hid) return `<span class="hw-open">${esc(t.word)}</span>`;
    return tap ? `<button type="button" class="hw" data-hw="${i}" aria-label="…">${esc(t.word)}</button>` : `<span class="hw">${esc(t.word)}</span>`;
  }).join(' ')}</div>`).join('');
}
export default makeType('progressive-hide', { exam: false, random: true }, {
  render(q, ctx) {
    const p = q.kind === 'tuhfa' ? ctx.corpus.bayt(q.number) : [ctx.corpus.verse(2, q.number)];
    return `<div class="prompt fls">${hideHtml(p || [], q.kind, q.number)}</div>`;
  },
  answerView(q, ctx) { return answerLines([{ ref: q.kind === 'tuhfa' ? `t:${q.number}` : `2:${q.number}` }], ctx.corpus); }
});

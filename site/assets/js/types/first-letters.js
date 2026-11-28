// «أوائل الحروف»: the verse/bayt shown as the first letter of each word; the reader recites it and grades himself.
// Generated in the exam's drill round (not stored in the exam data); shown again in «وِرد اليوم» and the history.
import { makeType } from './generic.js';
import { answerLines } from '../core/render.js';
import { letterTokens } from '../core/refs.js';
import { esc } from '../core/fmt.js';

export const lettersRef = q => (q.kind === 'tuhfa' ? `t:${q.number}` : `2:${q.number}`);
/** Letters line(s). open: set of revealed word indexes (per hemistich offset), all: reveal everything. */
export function lettersHtml(parts, kind, { open = {}, all = false, tap = false } = {}) {
  let k = 0;
  return parts.map(text => `<div class="fl-line">${letterTokens(text, kind === 'tuhfa' ? 't' : 'q').map(t => {
    const i = k++; const shown = all || open[i];
    if (t.mark) return `<span class="fl-mark">${esc(t.word)}</span>`;
    const inner = shown ? esc(t.word) : esc(t.letter);
    return tap && !shown ? `<button type="button" class="fl" data-flw="${i}" aria-label="${esc(t.letter)}">${inner}</button>` : `<span class="fl${shown ? ' open' : ''}">${inner}</span>`;
  }).join(' ')}</div>`).join('');
}
export default makeType('first-letters', { exam: false, random: true }, {
  render(q, ctx) {
    const p = q.kind === 'tuhfa' ? ctx.corpus.bayt(q.number) : [ctx.corpus.verse(2, q.number)];
    return `<div class="prompt fls">${lettersHtml(p || [], q.kind)}</div>`;
  },
  answerView(q, ctx) { return answerLines([{ ref: lettersRef(q) }], ctx.corpus); }
});

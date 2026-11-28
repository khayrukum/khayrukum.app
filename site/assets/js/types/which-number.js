// «ما رقمها؟»: multiple choice — the verse or bayt is shown and the reader picks its number.
// Generated in the random exam only; answered by tapping a choice, so it grades itself.
import { makeType } from './generic.js';
import { refHtml, answerLines } from '../core/render.js';

const refOf = q => (q.kind === 'tuhfa' ? `t:${q.number}` : `2:${q.number}`);
export default makeType('which-number', { exam: false, random: true }, {
  choice: true,
  render(q, ctx) { return `<div class="prompt">${refHtml(refOf(q), ctx.corpus, { verseNums: false })}</div>`; },
  answerView(q, ctx) { return answerLines([{ ref: refOf(q) }], ctx.corpus); }
});

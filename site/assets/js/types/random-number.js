// «رقم عشوائي» (EX-12, RND-05): not graded in exam context, graded in the random exam.
import { makeType } from './generic.js';
import { n } from '../core/fmt.js';
import { answerLines } from '../core/render.js';

export default makeType('random-number', { exam: false, random: true }, {
  render(q) { return `<div class="rand"><div class="bignum">${n(q.number)}</div></div>`; },
  answerView(q, ctx) { return answerLines([{ ref: q.kind === 'tuhfa' ? `t:${q.number}` : `2:${q.number}` }], ctx.corpus); },
  /** Generated question for the random exam (RND-05). */
  make(examId, kind, number, ask) {
    return { id: `${examId}/random-number/${number}`, type: 'random-number', src: examId, kind, number, ask, prompt: [], answer: [{ ref: kind === 'tuhfa' ? `t:${number}` : `2:${number}` }] };
  }
});

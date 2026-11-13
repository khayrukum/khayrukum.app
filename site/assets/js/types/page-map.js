// «خريطة الصفحة»: a verse is shown; the reader picks its page in the Madinah mushaf and where it sits on it
// (first verse, last verse, or in between). Checked by the app from the page table. Quran exams only.
import { makeType } from './generic.js';
import { refHtml, answerLines } from '../core/render.js';
export default makeType('page-map', { exam: false, random: true }, {
  render(q, ctx) { return `<div class="prompt">${refHtml(`2:${q.number}`, ctx.corpus, { verseNums: false })}</div>`; },
  answerView(q, ctx) { return answerLines([{ ref: `2:${q.number}` }], ctx.corpus); }
});

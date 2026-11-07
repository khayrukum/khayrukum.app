// Shared implementation for question types (ARCH-02). A type module provides
// render(question, ctx) and answerView(question, ctx), and declares `gradable` per context (DATA-23).
import { promptHtml, answerLines, inlineHtml } from '../core/render.js';

export function makeType(id, gradable, extra = {}) {
  return {
    id,
    gradable,
    render(q, ctx) { return promptHtml(q.prompt || [], ctx.corpus); },
    answerView(q, ctx) {
      return answerLines(q.answer || [], ctx.corpus) + (q.tip ? `<div class="tip">${inlineHtml(q.tip, ctx.corpus)}</div>` : '');
    },
    ...extra
  };
}

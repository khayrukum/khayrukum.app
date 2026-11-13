// History events and grading rules (DATA-40, DATA-41, DATA-42).
// `planGrade` is pure (unit-tested); `grade` applies it to the store.
import * as store from './store.js';

/** A new session id: one exam page load, one random set, or «ابدأ من جديد» (DATA-41). */
export const newSession = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);

/**
 * Pure. Decide which events to write for a grade (g = 'ok'|'mid'|'bad') or a clear (g = null).
 * - re-grade in the same session updates the live event of that session;
 * - otherwise a new event is appended;
 * - clear tombstones only an event of the current session; otherwise history is unchanged.
 */
export function planGrade(events, { session, qid, g, tool, src, type, snap, dev }, now, makeId) {
  const cur = events.find(e => e.session === session && e.qid === qid && !e.deleted);
  if (!g) return cur ? [{ ...cur, deleted: true, updatedAt: now }] : [];
  if (cur) return [{ ...cur, g, updatedAt: now, snap: snap || cur.snap }];
  return [{ id: makeId(), t: now, updatedAt: now, dev, session, tool, src, type, qid, g, deleted: false, snap }];
}

export async function grade(input) {
  const [all, dev] = await Promise.all([store.events(), store.device()]);
  const changes = planGrade(all, { ...input, dev: dev.id }, Date.now(), store.uuid);
  await store.putEvents(changes);
  if (all.length > 20000) store.prune(); // DATA-43
  return changes;
}

/** Trim a snapshot to the DATA-40 limits. */
export function makeSnap({ ask = '', prompt = '', answerRefs = [], answer = '', unit = '' }) {
  const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  return { ask: cut(ask, 160), prompt: cut(prompt, 160), answerRefs, answer: cut(answer, 160), unit };
}

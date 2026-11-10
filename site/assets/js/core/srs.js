// Spaced review «وِرد اليوم». Pure: the schedule is derived from the history events, nothing else is stored.
// A question enters the queue the first time it is answered «متردد» or «خطأ». Each «صحيح» moves it one
// step along STEPS (days until it comes back); «متردد» repeats the step; «خطأ» restarts. After the last
// step it leaves the queue, and re-enters if it is missed again.
export const STEPS = [1, 3, 7, 16, 35];
const DAY = 86400000;
const dayStart = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** events → Map(qid → { qid, step, dueAt, last }) for the questions currently in the queue. */
export function schedule(events) {
  const by = new Map();
  for (const e of events) { if (e.deleted || !e.qid || !e.g) continue; if (!by.has(e.qid)) by.set(e.qid, []); by.get(e.qid).push(e); }
  const out = new Map();
  for (const [qid, list] of by) {
    list.sort((a, b) => a.t - b.t);
    const days = []; // one verdict a day: the last answer of that day
    for (const e of list) { const d = dayStart(e.t); if (days.length && days[days.length - 1].d === d) days[days.length - 1].e = e; else days.push({ d, e }); }
    let step = -1;
    for (const { e } of days) {
      if (step < 0) { if (e.g !== 'ok') step = 0; }
      else if (e.g === 'ok') { step++; if (step >= STEPS.length) step = -1; }
      else if (e.g === 'bad') step = 0;
    }
    if (step < 0) continue;
    const last = days[days.length - 1];
    out.set(qid, { qid, step, dueAt: last.d + STEPS[step] * DAY, last: last.e });
  }
  return out;
}

/** Questions due now (oldest first) and the time the next one comes due (or null). */
export function dueNow(events, now = Date.now()) {
  const all = [...schedule(events).values()];
  const due = all.filter(x => x.dueAt <= now).sort((a, b) => a.dueAt - b.dueAt || (a.qid < b.qid ? -1 : 1));
  const later = all.filter(x => x.dueAt > now).map(x => x.dueAt);
  return { due, nextAt: later.length ? Math.min(...later) : null, waiting: later.length };
}

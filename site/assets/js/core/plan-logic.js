// Pure plan arithmetic (PL-03, PL-05, PL-08, PL-09, PL-15). Unit-tested.
export const TARGETS = [3, 3, 3, 3, 3, 3, 2];
export const freshWeek = () => ({ reps: [0, 0, 0, 0, 0, 0, 0], checks: {}, clean: null, satBannerDismissed: null });
export const freshPlan = () => ({ pair: 1, week: freshWeek(), mistakes: [], done: [], history: [], updatedAt: 0 });
/** Day index 0 = Saturday … 6 = Friday. */
export const todayIdx = (d = new Date()) => (d.getDay() + 1) % 7;
export const pairRubs = p => [2 * p - 1, 2 * p];
export const liveMistakes = s => (s.mistakes || []).filter(m => !m.deleted);

/** PL-03 x and PL-08 y. */
export function planTotals(s, targets = TARGETS) {
  const reps = s.week?.reps || [];
  const x = Math.min(20, targets.reduce((a, t, d) => a + Math.min(reps[d] || 0, t), 0));
  const y = 2 * new Set(s.done || []).size;
  return { x, y };
}
/** PL-05: the 18 rub' outside the pair; day d shows items 3d … 3d+2. */
export function reviewFor(pair, d, all = 20, per = 3) {
  if (d > 5) return [];
  const cur = pairRubs(pair);
  const rest = []; for (let r = 1; r <= all; r++) if (!cur.includes(r)) rest.push(r);
  return rest.slice(d * per, d * per + per);
}
/** Checkbox keys of a day (`week.checks`). */
export function dayKeys(s, d, fridayIds = ['f:a', 'f:c', 'f:d']) {
  const k = reviewFor(s.pair, d).map(r => `d${d}:rv${r}`);
  if (d < 6) k.push(`d${d}:join`);
  if (d === 0 && liveMistakes(s).length) k.push('d0:mist');
  if (d === 6) k.push(...fridayIds);
  return k;
}
/** PL-03: reps ≥ target and every task ticked. */
export const dayDone = (s, d, targets = TARGETS) => (s.week.reps[d] || 0) >= targets[d] && dayKeys(s, d).every(k => s.week.checks[k]);
/** PL-03: tapping button j sets reps to j+1; tapping a filled button j sets reps to j. */
export const tapRep = (reps, j) => (reps > j ? j : j + 1);
/** PL-09: confirm the week. */
export function advance(s, now = Date.now()) {
  const done = s.done.includes(s.pair) ? s.done.slice() : s.done.concat(s.pair);
  return { ...s, done, history: s.history.concat({ pair: s.pair, clean: s.week.clean, endedAt: now }), pair: (s.pair % 10) + 1, week: freshWeek(), updatedAt: now };
}
/** Key of the Saturday that starts the week containing `date`. */
export function saturdayKey(date = new Date()) { const d = new Date(date); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - todayIdx(d)); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
/** PL-15: today is Saturday and the current week has Friday activity, and it was not dismissed this Saturday. */
export function showSaturdayBanner(s, date = new Date(), fridayIds = ['f:a', 'f:c', 'f:d']) {
  if (todayIdx(date) !== 0) return false;
  const w = s.week;
  const friday = (w.reps[6] || 0) > 0 || fridayIds.some(k => w.checks[k]) || w.clean != null;
  return friday && w.satBannerDismissed !== saturdayKey(date);
}

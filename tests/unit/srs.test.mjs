// Spaced review schedule (docs/LEARNING-PLAN.md step 1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schedule, dueNow, STEPS } from '../../site/assets/js/core/srs.js';

const DAY = 86400000;
const D0 = new Date(2026, 10, 1, 9, 0, 0).getTime();          // a morning
const day0 = new Date(2026, 10, 1).getTime();
const ev = (qid, g, day, extra = {}) => ({ qid, g, t: D0 + day * DAY, deleted: false, ...extra });

test('a question enters the queue only when it is missed, and comes back the next day', () => {
  assert.equal(schedule([ev('a', 'ok', 0)]).size, 0, 'answered right from the start: not queued');
  const s = schedule([ev('a', 'bad', 0)]).get('a');
  assert.equal(s.step, 0); assert.equal(s.dueAt, day0 + 1 * DAY);
  assert.equal(schedule([ev('a', 'mid', 0)]).get('a').dueAt, day0 + 1 * DAY, '«متردد» queues it too');
  assert.equal(dueNow([ev('a', 'bad', 0)], D0 + 2 * 3600000).due.length, 0, 'not due the same day');
  assert.equal(dueNow([ev('a', 'bad', 0)], day0 + DAY + 1).due.length, 1, 'due from the next midnight');
});

test('«صحيح» lengthens the interval, «متردد» repeats it, «خطأ» restarts, and the last step retires the question', () => {
  let list = [ev('a', 'bad', 0)]; let day = 0;
  for (let k = 1; k < STEPS.length; k++) {
    day += STEPS[k - 1]; list.push(ev('a', 'ok', day));
    const s = schedule(list).get('a'); assert.equal(s.step, k); assert.equal(s.dueAt, day0 + (day + STEPS[k]) * DAY);
  }
  const mid = schedule([...list, ev('a', 'mid', day + 40)]).get('a'); assert.equal(mid.step, STEPS.length - 1, '«متردد» keeps the step');
  assert.equal(schedule([...list, ev('a', 'bad', day + 40)]).get('a').step, 0, '«خطأ» restarts');
  list.push(ev('a', 'ok', day + STEPS[STEPS.length - 1]));
  assert.equal(schedule(list).has('a'), false, 'retired after the last step');
  assert.equal(schedule([...list, ev('a', 'bad', day + 100)]).get('a').step, 0, 'a later miss queues it again');
});

test('one verdict a day (the last answer), deleted events ignored, oldest due first', () => {
  const same = [ev('a', 'bad', 0), { ...ev('a', 'ok', 0), t: D0 + 3600000 }];
  assert.equal(schedule(same).has('a'), false, 'missed then corrected the same day counts as right');
  assert.equal(schedule([{ ...ev('a', 'bad', 0), deleted: true }]).size, 0);
  const r = dueNow([ev('a', 'bad', 2), ev('b', 'bad', 0), ev('c', 'bad', 9)], day0 + 5 * DAY);
  assert.deepEqual(r.due.map(x => x.qid), ['b', 'a']); assert.equal(r.waiting, 1); assert.equal(r.nextAt, day0 + 10 * DAY);
});

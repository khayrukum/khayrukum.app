// Backup export/import (SET-04, DATA-60, DATA-61) and merge rules (DATA-44, pure → unit-tested).
import * as store from './store.js';
import { validate } from './schema.js';
import { config, build } from './base.js';

export const BACKUP_SCHEMA = {
  type: 'object', required: ['format', 'schema', 'exportedAt', 'kv', 'events'],
  properties: {
    format: { const: 'khayrukum-backup' }, schema: { const: 1 }, exportedAt: { type: 'number' },
    appVersion: { type: 'string' }, device: { type: ['object', 'null'] },
    kv: { type: 'object' },
    events: { type: 'array', items: { $ref: '#/definitions/event' } }
  },
  definitions: {
    event: {
      type: 'object', required: ['id', 't', 'qid', 'g'],
      properties: {
        id: { type: 'string', minLength: 1 }, t: { type: 'number' }, updatedAt: { type: 'number' }, dev: { type: 'string' },
        session: { type: 'string' }, tool: { enum: ['exam', 'random', 'review'] }, src: { type: 'string' }, type: { type: 'string' },
        qid: { type: 'string' }, g: { enum: ['ok', 'mid', 'bad'] }, deleted: { type: 'boolean' }, snap: { type: 'object' }
      }
    }
  }
};
const KV_KEY = /^(device|exam:[a-z0-9-]+|random:(prefs|current)|review:current|plan:[a-z0-9-]+|listen:prefs|ui:[a-zA-Z]+)$/;


// Shape of every stored value (NFR-PRV-05, DATA-61): a damaged or hand-edited backup is refused
// instead of being merged and breaking a page on every load.
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const opt = (v, f) => v === undefined || f(v);
const arrOf = f => v => Array.isArray(v) && v.every(f);
const isStr = v => typeof v === 'string';
const GRADE = v => v === 'ok' || v === 'mid' || v === 'bad';
const KV_SHAPE = {
  exam: v => opt(v.round, isStr) && opt(v.grades, g => isObj(g) && Object.values(g).every(GRADE)) && opt(v.open, isObj) && opt(v.rand, r => r === null || isObj(r)) && opt(v.pmap, x => x === null || (isObj(x) && arrOf(isNum)(x.deck) && arrOf(isNum)(x.queue) && Number.isInteger(x.done))) && opt(v.order, x => x === null || (isObj(x) && arrOf(isNum)(x.deck) && arrOf(isNum)(x.queue) && Number.isInteger(x.done) && arrOf(isNum)(x.picked))) && opt(v.hide, x => x === null || (isObj(x) && arrOf(isNum)(x.deck) && arrOf(isNum)(x.queue) && Number.isInteger(x.done))) && opt(v.letters, x => x === null || (isObj(x) && arrOf(isNum)(x.deck) && arrOf(isNum)(x.queue) && Number.isInteger(x.done))) && opt(v.drill, x => x === null || (isObj(x) && arrOf(isNum)(x.deck) && arrOf(isNum)(x.queue) && Number.isInteger(x.done))),
  'random:prefs': v => opt(v.src, arrOf(isStr)) && opt(v.n, x => isNum(x) && x >= 1 && x <= 200) && opt(v.ranges, isObj),
  'random:current': v => arrOf(isStr)(v.set) && Array.isArray(v.grades) && v.grades.length === v.set.length && v.grades.every(g => g === null || GRADE(g)) && Number.isInteger(v.idx) && v.idx >= 0 && v.idx < Math.max(1, v.set.length) && opt(v.done, x => typeof x === 'boolean'),
  'review:current': v => KV_SHAPE['random:current'](v),
  plan: v => opt(v.pair, x => Number.isInteger(x) && x >= 1) && opt(v.week, w => isObj(w) && opt(w.reps, arrOf(isNum)) && opt(w.checks, isObj)) && opt(v.mistakes, arrOf(isObj)) && opt(v.done, arrOf(isNum)) && opt(v.history, arrOf(isObj)),
  'listen:prefs': v => opt(v.sel, Array.isArray) && opt(v.rate, x => isNum(x) && x > 0 && x <= 4) && opt(v.loop, x => typeof x === 'boolean') && opt(v.open, isObj)
};
/** Errors for one kv entry (empty when the value is usable). Pure. */
export function checkKvValue(key, v, now = Date.now()) {
  if (!isObj(v)) return [`${key}: expected an object`];
  if (v.updatedAt !== undefined && !(isNum(v.updatedAt) && v.updatedAt >= 0 && v.updatedAt <= now + 86400000)) return [`${key}: bad updatedAt`];
  const shape = KV_SHAPE[key] || KV_SHAPE[key.split(':')[0]];
  let ok = true;
  try { ok = !shape || shape(v) === true; } catch { ok = false; }
  return ok ? [] : [`${key}: wrong shape`];
}

export async function makeBackup() {
  const [kv, events, dev, cfg, b] = await Promise.all([store.allKv(), store.events(), store.device(), config(), build()]);
  return { format: 'khayrukum-backup', schema: 1, exportedAt: Date.now(), appVersion: b?.version || cfg.appVersion || '', device: dev, kv, events };
}

/** Parse and validate a backup text. Returns { ok, data, errors }. */
export function parseBackup(text) {
  let data;
  try { data = JSON.parse(String(text).trim()); } catch { return { ok: false, errors: ['not JSON'] }; }
  const errors = validate(BACKUP_SCHEMA, data);
  if (data && data.kv && typeof data.kv === 'object') for (const [k, v] of Object.entries(data.kv)) { if (!KV_KEY.test(k)) errors.push('unknown key ' + k); else errors.push(...checkKvValue(k, v)); }
  return { ok: errors.length === 0, data, errors };
}

const ts = v => (v && typeof v === 'object' ? v.updatedAt || 0 : 0);

/** DATA-44 merge of one kv value. Plans merge mistakes per id (tombstones win by updatedAt) and `done` as a union. */
export function mergeKv(key, local, incoming) {
  if (local == null) return incoming;
  if (incoming == null) return local;
  if (key.startsWith('plan:')) {
    const base = ts(incoming) > ts(local) ? { ...incoming } : { ...local };
    const m = new Map();
    for (const x of [...(local.mistakes || []), ...(incoming.mistakes || [])]) { const c = m.get(x.id); if (!c || (x.updatedAt || 0) > (c.updatedAt || 0)) m.set(x.id, x); }
    base.mistakes = [...m.values()];
    base.done = [...new Set([...(local.done || []), ...(incoming.done || [])])].sort((a, b) => a - b);
    const h = new Map(); for (const x of [...(local.history || []), ...(incoming.history || [])]) h.set(x.pair + '|' + x.endedAt, x);
    base.history = [...h.values()].sort((a, b) => a.endedAt - b.endedAt);
    return base;
  }
  if (key === 'device') return local; // keep this device's identity
  return ts(incoming) > ts(local) ? incoming : local;
}

/** DATA-44 events: union by id, newer updatedAt wins. Returns the events to write. */
export function mergeEvents(local, incoming) {
  const byId = new Map(local.map(e => [e.id, e]));
  const out = [];
  for (const e of incoming) { const c = byId.get(e.id); if (!c || (e.updatedAt || e.t) > (c.updatedAt || c.t)) out.push(e); }
  return out;
}

/** Plan an import: { events:[to write], kv:{key: merged}, added, updatedExams }. Pure given the local state. */
export function planImport(localKv, localEvents, data) {
  const events = mergeEvents(localEvents, data.events);
  const known = new Set(localEvents.map(e => e.id));
  const added = events.filter(e => !known.has(e.id) && !e.deleted).length;
  const kv = {}; let updatedExams = 0;
  for (const [k, v] of Object.entries(data.kv)) {
    const merged = mergeKv(k, localKv[k], v);
    if (JSON.stringify(merged) !== JSON.stringify(localKv[k])) { kv[k] = merged; if (k.startsWith('exam:')) updatedExams++; }
  }
  return { events, kv, added, updatedExams };
}

/** DATA-61: idempotent, never deletes. */
export async function applyImport(data) {
  const [kv, events] = await Promise.all([store.allKv(), store.events()]);
  const plan = planImport(kv, events, data);
  await store.putEvents(plan.events);
  for (const [k, v] of Object.entries(plan.kv)) await store.set(k, v);
  return plan;
}

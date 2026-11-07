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
        session: { type: 'string' }, tool: { enum: ['exam', 'random'] }, src: { type: 'string' }, type: { type: 'string' },
        qid: { type: 'string' }, g: { enum: ['ok', 'mid', 'bad'] }, deleted: { type: 'boolean' }, snap: { type: 'object' }
      }
    }
  }
};
const KV_KEY = /^(device|exam:[a-z0-9-]+|random:(prefs|current)|plan:[a-z0-9-]+|listen:prefs|ui:[a-zA-Z]+)$/;

export async function makeBackup() {
  const [kv, events, dev, cfg, b] = await Promise.all([store.allKv(), store.events(), store.device(), config(), build()]);
  return { format: 'khayrukum-backup', schema: 1, exportedAt: Date.now(), appVersion: b?.version || cfg.appVersion || '', device: dev, kv, events };
}

/** Parse and validate a backup text. Returns { ok, data, errors }. */
export function parseBackup(text) {
  let data;
  try { data = JSON.parse(String(text).trim()); } catch { return { ok: false, errors: ['not JSON'] }; }
  const errors = validate(BACKUP_SCHEMA, data);
  if (data && data.kv && typeof data.kv === 'object') for (const k of Object.keys(data.kv)) if (!KV_KEY.test(k)) errors.push('unknown key ' + k);
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

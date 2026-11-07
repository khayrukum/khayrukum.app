// The only module that touches localStorage or IndexedDB (DATA-52).
// IndexedDB database `khayrukum` with stores `kv` and `events` (DATA-50). If storage is unavailable
// (private mode, blocked), everything works in memory and `persistent` is false (GEN-05).
const DB = 'khayrukum';
const THEME_KEY = 'khayrukum.theme';
const MAX_LIVE = 20000; // DATA-43
const TOMB_TTL = 90 * 86400000;

let dbP = null;
let mem = null; // in-memory fallback: { kv: Map, events: Map }
export let persistent = true;

function req2p(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
function txDone(tx) { return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = tx.onabort = () => rej(tx.error); }); }

function open() {
  if (dbP) return dbP;
  dbP = new Promise(resolve => {
    let idb;
    try { idb = globalThis.indexedDB; } catch { idb = null; }
    if (!idb) return resolve(null);
    let r;
    try { r = idb.open(DB, 1); } catch { return resolve(null); }
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('events')) {
        const ev = db.createObjectStore('events', { keyPath: 'id' });
        ev.createIndex('t', 't'); ev.createIndex('qid', 'qid'); ev.createIndex('src', 'src');
      }
    };
    r.onsuccess = () => {
      const db = r.result;
      // probe a write: some browsers open IDB but refuse writes
      try {
        const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(Date.now(), '__probe');
        txDone(tx).then(() => resolve(db), () => resolve(null));
      } catch { resolve(null); }
    };
    r.onerror = () => resolve(null);
    r.onblocked = () => resolve(null);
  }).then(db => {
    if (!db) { persistent = false; mem = { kv: new Map(), events: new Map() }; }
    return db;
  });
  return dbP;
}
export const ready = () => open().then(() => persistent);

const clone = v => (v == null ? v : structuredClone(v));

export async function get(key) {
  const db = await open();
  if (!db) return clone(mem.kv.get(key));
  return req2p(db.transaction('kv').objectStore('kv').get(key));
}
export async function set(key, value) {
  const db = await open();
  if (!db) { mem.kv.set(key, clone(value)); }
  else { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(value, key); await txDone(tx); }
  broadcast({ type: 'kv', key });
}
export async function del(key) {
  const db = await open();
  if (!db) mem.kv.delete(key);
  else { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(key); await txDone(tx); }
  broadcast({ type: 'kv', key });
}
export async function allKv() {
  const db = await open();
  if (!db) return Object.fromEntries([...mem.kv].filter(([k]) => k !== '__probe').map(([k, v]) => [k, clone(v)]));
  const tx = db.transaction('kv'); const st = tx.objectStore('kv');
  const [keys, vals] = await Promise.all([req2p(st.getAllKeys()), req2p(st.getAll())]);
  const o = {}; keys.forEach((k, i) => { if (k !== '__probe') o[k] = vals[i]; });
  return o;
}

let evCache = null;
/** All events (including tombstones), cached per page. */
export async function events() {
  if (evCache) return evCache;
  const db = await open();
  evCache = db ? await req2p(db.transaction('events').objectStore('events').getAll()) : [...mem.events.values()].map(clone);
  return evCache;
}
export async function putEvents(list) {
  if (!list.length) return;
  const db = await open();
  if (!db) list.forEach(e => mem.events.set(e.id, clone(e)));
  else { const tx = db.transaction('events', 'readwrite'); const st = tx.objectStore('events'); list.forEach(e => st.put(e)); await txDone(tx); }
  if (evCache) { const idx = new Map(evCache.map((e, i) => [e.id, i])); list.forEach(e => { const i = idx.get(e.id); if (i == null) evCache.push(e); else evCache[i] = e; }); }
  broadcast({ type: 'events' });
}
export const putEvent = e => putEvents([e]);
export async function deleteEvents(ids) {
  const db = await open();
  if (!db) ids.forEach(id => mem.events.delete(id));
  else { const tx = db.transaction('events', 'readwrite'); const st = tx.objectStore('events'); ids.forEach(id => st.delete(id)); await txDone(tx); }
  if (evCache) { const s = new Set(ids); evCache = evCache.filter(e => !s.has(e.id)); }
  broadcast({ type: 'events' });
}
export async function clearEvents() {
  const db = await open();
  if (!db) mem.events.clear();
  else { const tx = db.transaction('events', 'readwrite'); tx.objectStore('events').clear(); await txDone(tx); }
  evCache = [];
  broadcast({ type: 'events' });
}
/** DATA-43: keep ≥ 20 000 live events; prune the oldest beyond that and tombstones older than 90 days. */
export async function prune(now = Date.now()) {
  const all = await events();
  const drop = all.filter(e => e.deleted && now - (e.updatedAt || e.t) > TOMB_TTL).map(e => e.id);
  const live = all.filter(e => !e.deleted).sort((a, b) => a.t - b.t);
  if (live.length > MAX_LIVE) drop.push(...live.slice(0, live.length - MAX_LIVE).map(e => e.id));
  if (drop.length) await deleteEvents(drop);
  return drop.length;
}
export function invalidate() { evCache = null; }

/** Delete everything the app stored (SET-06): the database, the theme key. */
export async function wipe() {
  const db = await open();
  if (db) { db.close(); await new Promise(res => { const r = indexedDB.deleteDatabase(DB); r.onsuccess = r.onerror = r.onblocked = () => res(); }); }
  dbP = null; evCache = null; mem = null; persistent = true;
  try { localStorage.removeItem(THEME_KEY); } catch { /* ignore */ }
  broadcast({ type: 'wipe' });
}

// ---------- theme (the one localStorage key) ----------
export function getTheme() { try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch { return 'auto'; } }
export function setTheme(t) {
  try { if (t === 'auto') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, t); } catch { /* ignore */ }
  if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  broadcast({ type: 'theme', theme: t });
}

// ---------- cross-tab notifications (DATA-54) ----------
let bc = null;
try { bc = new BroadcastChannel('khayrukum'); bc.unref?.(); } catch { bc = null; }
const listeners = new Set();
export function broadcast(msg) { try { bc && bc.postMessage(msg); } catch { /* ignore */ } }
export function onMessage(fn) { listeners.add(fn); return () => listeners.delete(fn); }
if (bc) bc.onmessage = ev => { if (ev.data?.type === 'events' || ev.data?.type === 'wipe') evCache = null; listeners.forEach(fn => fn(ev.data)); };

export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));

/** `device` kv (DATA-51). */
export async function device() {
  let d = await get('device');
  if (!d) { d = { id: uuid(), createdAt: Date.now() }; await set('device', d); }
  return d;
}

// Audio manifest and the audio cache `khayr-audio-v1` (OFF-06, OFF-09, OFF-20…22, AUD-30 §5.x).
import { url, getJson, config } from './base.js';
import * as platform from './platform.js';

export const AUDIO_CACHE = 'khayr-audio-v1';
const hasCaches = () => typeof caches !== 'undefined';

let idxP = null; const colP = new Map();
/** Audio is available only when config.audio.enabled (AUD-40). */
export async function enabled() { return !!(await config()).audio?.enabled; }
export async function audioIndex() { return (idxP ||= getJson('data/audio/index.json')); }
/** A collection manifest by id, or null when audio is off or the collection is not granted (AUD-33). */
export async function collection(id) {
  if (!(await enabled())) return null;
  if (!colP.has(id)) colP.set(id, (async () => {
    const idx = await audioIndex();
    const c = idx.collections.find(x => x.id === id);
    if (!c) return null;
    const m = await getJson('data/audio/' + c.manifest);
    const reciter = idx.reciters.find(r => r.id === c.reciter);
    return { ...m, meta: c, reciter, byId: new Map(m.items.map(it => [it.id, it])) };
  })().catch(() => null));
  return colP.get(id);
}
/** Collections of a type (AUD-30 §5.x: pages that list collections pick new ones up from data). */
export async function collectionsOfType(type) {
  if (!(await enabled())) return [];
  const idx = await audioIndex();
  return Promise.all(idx.collections.filter(c => c.type === type).map(c => collection(c.id))).then(l => l.filter(Boolean));
}
/** AUD-31: a Quran recitation item for sura:aya, if any `quran` collection has it. */
export async function quranItem(sura, aya) {
  for (const c of await collectionsOfType('quran')) { const it = c.byId.get(`${sura}:${aya}`); if (it) return { c, it }; }
  return null;
}

/** Cache-busted URL of an item (OFF-11 keys entries by `?v=<sha8>`). */
export const itemUrl = it => url(it.src) + (it.sha256 ? `?v=${it.sha256.slice(0, 8)}` : '');

export async function isCached(it) {
  if (!hasCaches()) return false;
  try { return !!(await (await caches.open(AUDIO_CACHE)).match(itemUrl(it))); } catch { return false; }
}
export async function cachedCount(items) {
  if (!hasCaches()) return 0;
  try {
    const c = await caches.open(AUDIO_CACHE);
    const keys = new Set((await c.keys()).map(r => r.url));
    return items.filter(it => keys.has(itemUrl(it))).length;
  } catch { return 0; }
}
async function sha256Hex(buf) {
  const d = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Fetch an item fully (no Range) and store it if it matches the manifest (OFF-06, OFF-09). */
const inflight = new Map();
export function cacheItem(it, { verifyHash = false, signal } = {}) {
  if (!hasCaches()) return Promise.resolve(false);
  const u = itemUrl(it);
  if (inflight.has(u)) return inflight.get(u);
  const p = (async () => {
    const c = await caches.open(AUDIO_CACHE);
    if (await c.match(u)) return true;
    const r = await fetch(u, { signal, cache: 'no-store' });
    if (r.status !== 200) throw new Error('HTTP ' + r.status);
    const buf = await r.arrayBuffer();
    if (it.bytes != null && buf.byteLength !== it.bytes) throw new Error('size mismatch');
    if (verifyHash && it.sha256 && (await sha256Hex(buf)) !== it.sha256) throw new Error('hash mismatch');
    await c.put(u, new Response(buf, { status: 200, headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(buf.byteLength), 'Accept-Ranges': 'bytes' } }));
    return true;
  })().finally(() => inflight.delete(u));
  inflight.set(u, p);
  return p;
}
/** Background caching on first online play (OFF-06) and prefetch of upcoming items (AUD-11). */
export function warm(it) { if (navigator.onLine !== false) cacheItem(it).catch(() => {}); }

/** Blob URL for an item: from the cache, else the network (AUD-06/07/10). */
export async function blobUrl(it) {
  const u = itemUrl(it);
  let r = null;
  if (hasCaches()) { try { r = await (await caches.open(AUDIO_CACHE)).match(u); } catch { r = null; } }
  if (!r) r = await fetch(u);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return URL.createObjectURL(await r.blob());
}

/** Total bytes of a set of items. */
export const totalBytes = items => items.reduce((a, it) => a + (it.bytes || 0), 0);

/**
 * Page-driven «حمّل الصوت كله» (OFF-20). 3 files at a time; each verified file is written as soon as it is complete.
 * Returns { done, total, stopped }. onProgress({k, n, bytes}).
 */
export async function downloadAll(items, { onProgress, signal } = {}) {
  const est = await platform.estimate();
  const remaining = [];
  for (const it of items) if (!(await isCached(it))) remaining.push(it);
  const need = totalBytes(remaining);
  if (est && est.quota != null && est.usage != null && est.quota - est.usage < need * 1.1) return { error: 'space' };
  await platform.persist();
  let k = items.length - remaining.length, bytes = totalBytes(items) - need;
  onProgress?.({ k, n: items.length, bytes });
  let i = 0, failed = 0;
  const worker = async () => {
    while (i < remaining.length && !signal?.aborted) {
      const it = remaining[i++];
      try { await cacheItem(it, { verifyHash: true, signal }); k++; bytes += it.bytes || 0; onProgress?.({ k, n: items.length, bytes }); }
      catch { if (!signal?.aborted) failed++; }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return { done: k, total: items.length, failed, stopped: !!signal?.aborted };
}
export async function deleteAll() { if (hasCaches()) await caches.delete(AUDIO_CACHE); }

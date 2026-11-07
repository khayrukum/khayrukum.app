// The audio engine (ARCH-03, AUD-01…15). Exactly one HTMLAudioElement per page (AUD-03).
// API: play(item), pause(), resume(), seek(t), setRate(r), setLoop(b), playSequence(items), stop(), on(type, fn).
// item = { key, it (manifest item), title, sub, chapterOffsets?, segments? }
import { itemUrl, blobUrl, warm, isCached } from './audio-cache.js';
import { S } from './strings.ar.js';
import { url } from './base.js';

const et = new EventTarget();
export const on = (type, fn) => { const h = e => fn(e.detail); et.addEventListener(type, h); return () => et.removeEventListener(type, h); };
const emit = (type, detail) => et.dispatchEvent(new CustomEvent(type, { detail }));

let el = null;
const st = { item: null, seq: null, idx: 0, playing: false, rate: 1, loop: false, recovered: false, blob: null, retried: false };
export const state = () => ({ item: st.item, seq: st.seq, idx: st.idx, playing: st.playing, rate: st.rate, loop: st.loop, time: el ? el.currentTime : 0, dur: duration() });
export const isPlaying = () => st.playing;
let lastEnded = 0; export const gaps = []; // TST-21: ended → playing gaps (ms)
let artwork = null; export const setArtwork = a => { artwork = a; };

function media() {
  if (el) return el;
  el = document.createElement('audio');
  el.preload = 'auto'; el.setAttribute('playsinline', ''); el.setAttribute('webkit-playsinline', '');
  el.className = 'sr-only';
  document.body.appendChild(el);
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* AUD-02 */ }
  el.addEventListener('playing', () => { if (lastEnded) { gaps.push(performance.now() - lastEnded); lastEnded = 0; } st.playing = true; startPoll(); emit('change', state()); posState(); });
  el.addEventListener('pause', () => { st.playing = false; stopPoll(); emit('change', state()); posState(); });
  el.addEventListener('ended', onEnded);
  el.addEventListener('error', () => { if (st.item) mediaError(); });
  el.addEventListener('loadedmetadata', () => { applyRate(); emit('change', state()); posState(); });
  el.addEventListener('ratechange', posState);
  initSession();
  return el;
}
function duration() { const d = el?.duration; return Number.isFinite(d) && d > 0 ? d : (st.item?.it?.dur || 0); }

function applyRate() {
  const a = el; if (!a) return;
  a.defaultPlaybackRate = st.rate; a.playbackRate = st.rate;
  a.preservesPitch = true; a.webkitPreservesPitch = true; a.mozPreservesPitch = true; // AUD-09
}
function revokeBlob() { if (st.blob) { URL.revokeObjectURL(st.blob); st.blob = null; } }

/** AUD-05: src + play() run synchronously inside the caller's tap handler. */
function start(item, from = 0) {
  const a = media();
  revokeBlob();
  st.item = item; st.recovered = false; st.retried = false;
  a.loop = !!(st.loop && !st.seq);
  a.src = itemUrl(item.it);
  applyRate();
  if (from) { try { a.currentTime = from; } catch { /* set after metadata */ } }
  const p = a.play();
  emit('item', item); emit('change', state()); meta();
  if (p && p.catch) p.catch(err => {
    if (a.error) return; // handled by the error event
    if (err && err.name === 'AbortError') return;
    if (!st.retried) { st.retried = true; a.addEventListener('canplay', () => { if (st.item === item) a.play().catch(() => fail(item)); }, { once: true }); }
  });
  warm(item.it); // OFF-06
  if (navigator.onLine === false) isCached(item.it).then(c => { if (!c && st.item === item) emit('toast', { text: S.notCached }); });
}

/** AUD-06: on a media error, play from a blob URL at the same position; then give up with a toast. */
async function mediaError(pos = el?.currentTime || 0) {
  const item = st.item; if (!item) return;
  if (st.blob) return fail(item);
  try {
    const b = await blobUrl(item.it);
    if (st.item !== item) { URL.revokeObjectURL(b); return; }
    st.blob = b; el.src = b; applyRate();
    el.addEventListener('loadedmetadata', () => { try { el.currentTime = pos; } catch { /* ignore */ } }, { once: true });
    await el.play();
  } catch { fail(item); }
}
function fail(item) {
  if (st.item !== item) return;
  st.playing = false; st.item = null; st.seq = null; stopPoll();
  emit('toast', { text: navigator.onLine === false ? S.notCached : S.audioError, error: true });
  emit('change', state());
}

function onEnded() {
  const item = st.item; if (!item) return;
  const d = item.it?.dur || duration();
  // AUD-07: early end (e.g. a broken range response): reload from a blob, seek, resume — once per item.
  if (d && el.currentTime < d - 1.5 && !st.recovered) { st.recovered = true; const pos = el.currentTime; st.blob = null; mediaError(pos); return; }
  lastEnded = performance.now();
  if (st.seq) {
    let i = st.idx + 1;
    if (i >= st.seq.length) { if (!st.loop) return finish(); i = 0; }
    st.idx = i; start(st.seq[i]); prefetchNext(); return; // AUD-03: change src inside `ended`
  }
  finish();
}
function finish() { st.playing = false; st.item = null; st.seq = null; stopPoll(); emit('change', state()); emit('ended'); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none'; }
function prefetchNext() { if (!st.seq) return; for (let k = 1; k <= 3; k++) { const x = st.seq[(st.idx + k) % st.seq.length]; if (x && (st.idx + k < st.seq.length || st.loop)) warm(x.it); } } // AUD-11

// ---------- public API ----------
export function play(item, opts = {}) { st.seq = null; st.idx = 0; start(item, opts.from || 0); }
export function playSequence(items, opts = {}) { if (!items.length) return; st.seq = items; st.idx = opts.start || 0; start(items[st.idx]); prefetchNext(); }
export function pause() { if (el) el.pause(); }
export function resume() { if (el && st.item) { const p = el.play(); if (p) p.catch(() => mediaError()); } }
export function toggle() { if (st.playing) pause(); else resume(); }
export function stop() { if (el) { el.pause(); el.removeAttribute('src'); el.load(); } revokeBlob(); finish(); }
export function seek(t) {
  if (!el || !st.item) return;
  const d = duration(); t = Math.max(0, Math.min(t, Math.max(0, d - 0.1)));
  const s = el.seekable; let ok = !s || s.length === 0;
  for (let i = 0; s && i < s.length; i++) if (t >= s.start(i) && t <= s.end(i)) ok = true;
  if (!ok && !st.blob) { mediaError(t); return; } // AUD-10
  el.currentTime = t; emit('change', state()); posState();
}
export const skip = d => seek((el?.currentTime || 0) + d);
export function setRate(r) { st.rate = r; applyRate(); emit('change', state()); }
export function setLoop(b) { st.loop = !!b; if (el) el.loop = !!(st.loop && !st.seq); emit('change', state()); }
export function next() { if (st.seq) { const i = Math.min(st.seq.length - 1, st.idx + 1); st.idx = i; start(st.seq[i]); } else if (st.item?.chapterOffsets) jumpChapter(1); }
export function prev() { if (st.seq) { const i = Math.max(0, st.idx - 1); st.idx = i; start(st.seq[i]); } else if (st.item?.chapterOffsets) jumpChapter(-1); }
function jumpChapter(dir) {
  const offs = st.item.chapterOffsets, t = el.currentTime;
  let i = offs.findIndex((o, k) => t >= o && (k === offs.length - 1 || t < offs[k + 1]));
  i = Math.max(0, Math.min(offs.length - 1, i + dir)); seek(offs[i] + 0.01);
}

// ---------- polling (AUD-13): ≥ 4 updates/s while playing, none when idle ----------
let timer = null;
function startPoll() { if (!timer) timer = setInterval(() => emit('time', state()), 200); }
function stopPoll() { clearInterval(timer); timer = null; emit('time', state()); }

// ---------- Media Session (AUD-14) ----------
function initSession() {
  if (!('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  const set = (a, f) => { try { ms.setActionHandler(a, f); } catch { /* unsupported */ } };
  set('play', resume); set('pause', pause); set('stop', stop);
  set('seekbackward', d => skip(-(d?.seekOffset || 5))); set('seekforward', d => skip(d?.seekOffset || 5));
  set('previoustrack', prev); set('nexttrack', next);
  set('seekto', d => d?.seekTime != null && seek(d.seekTime));
}
function meta() {
  if (!('mediaSession' in navigator) || !st.item) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: st.item.title + (st.loop ? S.listen.looping : ''), artist: S.listen.artist, album: S.listen.album,
      artwork: [{ src: artwork || url('assets/icons/icon-512.png'), sizes: '512x512', type: 'image/png' }]
    });
  } catch { /* ignore */ }
}
function posState() {
  if (!('mediaSession' in navigator) || !el) return;
  try {
    navigator.mediaSession.playbackState = st.playing ? 'playing' : st.item ? 'paused' : 'none';
    const d = duration();
    if (d && navigator.mediaSession.setPositionState) navigator.mediaSession.setPositionState({ duration: d, playbackRate: el.playbackRate || 1, position: Math.min(el.currentTime, d) });
  } catch { /* ignore */ }
}
export const refreshMeta = meta;

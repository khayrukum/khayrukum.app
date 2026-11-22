// «وضع العرض» (STG-*): a full-screen view that opens like a video and shows, in large type, what is being
// recited: the current verse (words from the site's Tanzil text, the phrase being heard softly marked) or the
// current bayt (two hemistichs, as everywhere on the site). The page that owns the audio feeds it:
//   open({ opener, onToggle, onPrev, onNext, onLoop, onClose })
//   show({ id, kind: 'q'|'t'|'x', ctx, num, words:[{ t, w }], spans:[[from,to]], vnum, hems:[a,b], note, label })
//   tick({ playing, loop, frac, phrase })      close()      isOpen()
// Text never scrolls and is never cut: the type shrinks to fit, and a verse too long for the smallest size is
// shown a screenful at a time, following the recitation (STG-05).
import { S } from './strings.ar.js';
import { esc, n } from './fmt.js';
import * as platform from './platform.js';

const T = S.stage;
const MIN = { q: 1.375, t: 1.1, x: 1.1 }; // rem — Quran never below NFR-TYP-02
const MAX = 4.5, STEP = 0.9, IDLE_MS = 3000;
let root = null, cb = null, view = null, pages = [], page = -1, phrase = -1, playing = false, idleTimer = null, wasIdle = false, wasFull = false, pushed = false, ro = null;
const $ = sel => root.querySelector(sel);
export const isOpen = () => !!root;

function build() {
  const el = document.createElement('div');
  el.className = 'stage'; el.id = 'stage'; el.tabIndex = -1;
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', T.title);
  el.innerHTML = `<div class="st-top"><span class="st-ctx" id="stCtx"></span><button type="button" class="st-b fade" data-st="close" aria-label="${esc(T.close)}">✕</button></div>
  <div class="st-body" id="stBody"><div class="st-text" id="stText" lang="ar"></div></div>
  <div class="st-bot"><div class="st-sub"><span id="stNum"></span><span id="stPage"></span></div>
    <div class="st-bar" aria-hidden="true"><i></i></div>
    <div class="st-ctl fade"><button type="button" class="st-b" data-st="prev" aria-label="${esc(T.prev)}">→</button><button type="button" class="st-b pp" data-st="toggle" aria-label="${esc(T.play)}">▶</button><button type="button" class="st-b" data-st="next" aria-label="${esc(T.next)}">←</button><button type="button" class="st-b" data-st="loop" aria-pressed="false" aria-label="${esc(T.loop)}">↻</button></div></div>`;
  return el;
}

/** Open the view. Must run inside the tap that asked for it (full screen needs a user gesture). */
export function open(handlers) {
  if (root) return;
  cb = handlers; view = null; pages = []; page = phrase = -1; playing = false;
  root = build(); document.body.appendChild(root);
  const app = document.getElementById('app'); if (app) app.inert = true;
  root.addEventListener('pointerdown', () => { wasIdle = root.classList.contains('idle'); }, true);
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKey);
  root.addEventListener('focusin', wake);
  addEventListener('popstate', onPop);
  document.addEventListener('fullscreenchange', onFs); document.addEventListener('webkitfullscreenchange', onFs);
  ro = new ResizeObserver(() => { if (view) relayout(); }); ro.observe($('#stBody'));
  document.fonts?.ready.then(() => { if (root && view) relayout(); });
  try { history.pushState({ ...(history.state || {}), stage: 1 }, ''); pushed = true; } catch { pushed = false; }
  wasFull = false; platform.enterFullscreen(root).then(ok => { wasFull = ok; });
  root.focus({ preventScroll: true });
  wake();
}

/** Close the view and give the reader back the place they were at (STG-07). */
export function close() {
  if (!root) return;
  if (pushed && history.state?.stage) { history.back(); return; } // → popstate → teardown
  teardown();
}
function teardown() {
  if (!root) return;
  const h = cb; clearTimeout(idleTimer);
  removeEventListener('popstate', onPop);
  document.removeEventListener('fullscreenchange', onFs); document.removeEventListener('webkitfullscreenchange', onFs);
  ro?.disconnect(); ro = null;
  platform.keepAwake(false); platform.exitFullscreen();
  root.remove(); root = null; cb = null; view = null; pushed = false;
  const app = document.getElementById('app'); if (app) app.inert = false;
  h?.opener?.focus?.({ preventScroll: true });
  h?.onClose?.();
}
const onPop = () => { pushed = false; teardown(); };
const onFs = () => { if (root && wasFull && !platform.fullscreenElement()) { wasFull = false; close(); } }; // Esc in real full screen

function onClick(e) {
  const b = e.target.closest('[data-st]');
  if (!b) { if (wasIdle) wake(); else if (playing) sleep(); return; } // a tap on the text shows the controls, or hides them again
  wake();
  const a = b.dataset.st;
  if (a === 'close') close(); else if (a === 'toggle') cb.onToggle(); else if (a === 'prev') cb.onPrev(); else if (a === 'next') cb.onNext(); else if (a === 'loop') cb.onLoop();
}
function onKey(e) {
  wake();
  const onBtn = !!e.target.closest('button');
  if (e.key === 'Escape') { e.preventDefault(); close(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); cb.onNext(); } // RTL: left = forward
  else if (e.key === 'ArrowRight') { e.preventDefault(); cb.onPrev(); }
  else if ((e.key === ' ' || e.key === 'Enter') && !onBtn) { e.preventDefault(); cb.onToggle(); }
}
/** Controls fade while playing and come back on any tap, key or focus (STG-06). */
function wake() { if (!root) return; root.classList.remove('idle'); clearTimeout(idleTimer); if (playing) idleTimer = setTimeout(sleep, IDLE_MS); }
function sleep() { if (root && playing) root.classList.add('idle'); }

// ---------- content ----------
const wordHtml = x => `<span class="${x.w ? 'w' : 'w mk'}"${x.w ? ` data-w="${x.w}"` : ''}>${esc(x.t)}</span>`;
/** Show a verse, a bayt or a label. The same `id` again changes nothing. */
export function show(v) {
  if (!root || (view && view.id === v.id)) return;
  view = v; phrase = -1; page = -1;
  root.dataset.kind = v.kind;
  $('#stCtx').textContent = v.ctx || ''; $('#stNum').textContent = v.num || '';
  const tx = $('#stText');
  if (v.kind === 'q') tx.innerHTML = v.words.map(wordHtml).join(' ') + (v.vnum ? `\u00A0<span class="w vnum" data-w="${v.words.reduce((m, x) => Math.max(m, x.w || 0), 0)}v">${esc(v.vnum)}</span>` : '');
  else if (v.kind === 't') tx.innerHTML = `<span class="bayt both"><span class="h">${esc(v.hems[0])}</span><span class="h">${esc(v.hems[1])}${v.note ? `<span class="review">${esc(v.note)}</span>` : ''}</span></span>`;
  else tx.innerHTML = `<span class="st-label">${esc(v.label || '')}</span>`;
  relayout();
  tx.classList.remove('in'); void tx.offsetWidth; tx.classList.add('in'); // short fade; off under reduced motion
}

const setSize = f => $('#stText').style.setProperty('--fs', f.toFixed(3) + 'rem');
function fits() {
  const b = $('#stBody'), t = $('#stText');
  if (t.scrollHeight > b.clientHeight + 1 || t.scrollWidth > b.clientWidth + 1) return false;
  return [...t.querySelectorAll('.h')].every(h => h.scrollWidth <= h.clientWidth + 1); // a hemistich must not run into the other
}
/** Largest size from MAX down to `min` at which the visible text fits; false when even `min` does not. */
function shrink(min) {
  for (let f = MAX; f > min; f *= STEP) { setSize(f); if (fits()) return true; }
  setSize(min); return fits();
}
function relayout() {
  if (!root || !view) return;
  const tx = $('#stText'); const kind = view.kind; const min = MIN[kind];
  tx.classList.remove('wrap');
  const ws = kind === 'q' ? [...tx.querySelectorAll('.w')] : [];
  ws.forEach(w => { w.hidden = false; });
  pages = [];
  if (shrink(min)) { /* the whole text fits on one screen */ }
  else if (kind === 't') { tx.classList.add('wrap'); if (!shrink(min)) shrink(0.8); } // let a hemistich wrap before going smaller
  else if (kind === 'q') pages = paginate(ws, min);
  else shrink(0.8);
  const keep = phrase; page = -1; phrase = -1; mark(Math.max(0, keep));
}
/** A verse too long for one screen at the smallest size: screens that break between phrases where possible (STG-05). */
function paginate(ws, min) {
  setSize(min);
  const count = view.words.reduce((m, x) => Math.max(m, x.w || 0), 0);
  const num = w => parseInt(w.dataset.w || '0', 10) || 0; // a mark belongs to the word before it
  let last = 0; const of = ws.map(w => { const k = num(w); if (k) last = k; return k || last || 1; });
  const showRange = (a, b) => ws.forEach((w, i) => { w.hidden = of[i] < a || of[i] > b; });
  const ok = (a, b) => { showRange(a, b); return fits(); };
  const out = []; let a = 1;
  const ends = (view.spans?.length ? view.spans.map(s => s[1]) : [count]);
  while (a <= count) {
    let b = 0;
    for (const e of ends) { if (e < a) continue; if (ok(a, e)) b = e; else break; }
    if (!b) { let lo = a, hi = (ends.find(e => e >= a) || count); while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ok(a, mid)) lo = mid; else hi = mid - 1; } b = lo; } // one long phrase: break between words
    out.push([a, b]); a = b + 1;
  }
  if (out.length < 2) { ws.forEach(w => { w.hidden = false; }); let f = min; while (f > 0.7 && !fits()) { f *= STEP; setSize(f); } return []; }
  return out;
}
/** Softly mark the phrase being recited, and turn to its screen. */
function mark(k) {
  if (!root || !view) return;
  if (view.kind !== 'q') { $('#stPage').textContent = ''; return; }
  const span = view.spans?.[k] || view.spans?.[0]; if (!span) return;
  if (k === phrase) return; phrase = k;
  const tx = $('#stText'); const ws = [...tx.querySelectorAll('.w')];
  let last = 0;
  ws.forEach(w => { const n = parseInt(w.dataset.w || '0', 10) || 0; if (n) last = n; const at = n || last; w.classList.toggle('on', !!view.spans && view.spans.length > 1 && at >= span[0] && at <= span[1] && !w.classList.contains('vnum')); });
  if (pages.length) {
    const p = Math.max(0, pages.findIndex(([a, b]) => span[0] >= a && span[0] <= b));
    if (p !== page) { page = p; let l2 = 0; ws.forEach(w => { const n = parseInt(w.dataset.w || '0', 10) || 0; if (n) l2 = n; const at = n || l2 || 1; w.hidden = at < pages[p][0] || at > pages[p][1]; }); }
    $('#stPage').textContent = T.pageOf(n(p + 1), n(pages.length));
  } else $('#stPage').textContent = '';
}

/** Playback state from the owning page, a few times a second. frac = progress 0…1; phrase = index into spans. */
export function tick(s) {
  if (!root) return;
  if (s.playing !== playing) { playing = s.playing; platform.keepAwake(playing); wake(); }
  const pp = $('[data-st=toggle]'); const sym = s.playing ? '⏸' : '▶';
  if (pp.textContent !== sym) { pp.textContent = sym; pp.setAttribute('aria-label', s.playing ? T.pause : T.play); }
  $('[data-st=loop]').setAttribute('aria-pressed', String(!!s.loop));
  $('.st-bar > i').style.setProperty('--w', (Math.max(0, Math.min(1, s.frac || 0)) * 100).toFixed(2) + '%');
  if (s.phrase != null) mark(s.phrase);
}

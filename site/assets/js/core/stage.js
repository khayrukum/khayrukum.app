// «وضع العرض» (STG-*): a full-screen view that opens like a video and shows, in large type, what is being
// recited: the current verse (words from the site's Tanzil text, the phrase being heard softly marked) or the
// current bayt (two hemistichs, as everywhere on the site). The page that owns the audio feeds it:
//   open({ opener, onToggle, onPrev, onNext, onLoop, onClose })
//   show({ id, kind: 'q'|'t'|'x', ctx, num, words:[{ t, w }], spans:[[from,to]], vnum, hems:[a,b], note, label })
//   tick({ playing, loop, frac, phrase })      close()      isOpen()
// Text is never cut: the type shrinks to fit, and a verse too long for one screen is shown whole at a comfortable
// size and scrolls, keeping the phrase being recited in the middle (STG-27).
import { S } from './strings.ar.js';
import { esc } from './fmt.js';
import * as platform from './platform.js';
import * as store from './store.js';

const T = S.stage;
const MIN = { q: 1.375, t: 1.1, x: 1.1 }; // rem — Quran never below NFR-TYP-02
const MAX = 10, STEP = 0.93, IDLE_MS = 3000; // STG-23: as large as the screen allows
let memo = false, hold = 0, down = null, swiped = false;
const ready = store.get('stage:prefs').then(v => { memo = !!v?.memo; }).catch(() => {});
let root = null, cb = null, view = null, phrase = -1, playing = false, idleTimer = null, wasIdle = false, wasFull = false, pushed = false, ro = null;
const $ = sel => root.querySelector(sel);
export const isOpen = () => !!root;

function build() {
  const el = document.createElement('div');
  el.className = 'stage'; el.id = 'stage'; el.tabIndex = -1;
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', T.title);
  el.innerHTML = `<div class="st-top"><span class="st-ctx" id="stCtx"></span><button type="button" class="st-memo fade" data-st="memo" aria-pressed="false" hidden>${esc(T.memo)}</button><button type="button" class="st-b fade" data-st="close" aria-label="${esc(T.close)}">✕</button></div>
  <div class="st-body" id="stBody"><div class="st-text" id="stText" lang="ar"></div></div>
  <div class="st-bot"><div class="st-sub"><span id="stNum"></span></div>
    <div class="st-bar" aria-hidden="true"><i></i></div>
    <div class="st-ctl fade"><button type="button" class="st-b" data-st="prev" aria-label="${esc(T.prev)}">→</button><button type="button" class="st-b pp" data-st="toggle" aria-label="${esc(T.play)}">▶</button><button type="button" class="st-b" data-st="next" aria-label="${esc(T.next)}">←</button><button type="button" class="st-b" data-st="loop" aria-pressed="false" aria-label="${esc(T.loop)}">↻</button></div></div>`;
  return el;
}

/** Open the view. Must run inside the tap that asked for it (full screen needs a user gesture). */
export function open(handlers) {
  if (root) return;
  cb = handlers; view = null; phrase = -1; playing = false; hold = 0; down = null; swiped = false;
  root = build(); document.body.appendChild(root);
  const app = document.getElementById('app'); if (app) app.inert = true;
  root.addEventListener('pointerdown', e => { wasIdle = root.classList.contains('idle'); down = e.isPrimary ? { x: e.clientX, y: e.clientY, t: Date.now() } : null; }, true);
  root.addEventListener('pointerup', onUp, true);
  root.addEventListener('pointercancel', () => { down = null; }, true);
  const body = root.querySelector('#stBody'); const held = () => { hold = Date.now() + 4000; };
  body.addEventListener('touchmove', held, { passive: true }); body.addEventListener('wheel', held, { passive: true });
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
  ready.then(() => { if (!root || !memo) return; $('[data-st=memo]').setAttribute('aria-pressed', 'true'); const k = phrase; phrase = -1; mark(Math.max(0, k)); });
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

/** STG-26: a sideways swipe moves to the next (finger to the right, as turning a mushaf page) or previous verse / bayt. */
function onUp(e) {
  const d = down; down = null; if (!d || !cb) return;
  const dx = e.clientX - d.x, dy = e.clientY - d.y;
  if (Math.abs(dx) < 45 || Math.abs(dx) < 1.6 * Math.abs(dy) || Date.now() - d.t > 900) return;
  swiped = true; setTimeout(() => { swiped = false; }, 350); // the click that may follow is part of the swipe
  const idle = wasIdle; if (dx > 0) cb.onNext(); else cb.onPrev();
  if (idle) sleep();
}
function onClick(e) {
  if (swiped) { swiped = false; return; }
  const b = e.target.closest('[data-st]');
  if (!b) { if (wasIdle) wake(); else sleep(); return; } // STG-25: a tap on the text shows the controls, or hides them at once
  wake();
  const a = b.dataset.st;
  if (a === 'memo') { memo = !memo; store.set('stage:prefs', { memo, updatedAt: Date.now() }).catch(() => {}); b.setAttribute('aria-pressed', String(memo)); const k = phrase; phrase = -1; mark(Math.max(0, k)); return; }
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
function sleep() { if (!root) return; clearTimeout(idleTimer); root.classList.add('idle'); }

// ---------- content ----------
const wordHtml = x => `<span class="${x.w ? 'w' : 'w mk'}${memo ? ' hid' : ''}"${x.w ? ` data-w="${x.w}"` : ''}>${x.w ? '' : '\u00A0'}${esc(x.t)}</span>`; // STG-29: a pause mark carries a no-break space, so it never leaves its word

/** Show a verse, a bayt or a label. The same `id` again changes nothing. */
export function show(v) {
  if (!root || (view && view.id === v.id)) return;
  view = v; phrase = -1; hold = 0;
  const mb = $('[data-st=memo]'); mb.hidden = v.kind !== 'q'; mb.setAttribute('aria-pressed', String(memo));
  root.dataset.kind = v.kind;
  $('#stCtx').textContent = v.ctx || ''; $('#stNum').textContent = v.num || '';
  const tx = $('#stText');
  if (v.kind === 'q') tx.innerHTML = v.words.map((x, i) => (i && x.w ? ' ' : '') + wordHtml(x)).join('') + (v.vnum ? `\u00A0<span class="w vnum" data-w="${v.words.reduce((m, x) => Math.max(m, x.w || 0), 0)}v">${esc(v.vnum)}</span>` : '');
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
  const tx = $('#stText'); const body = $('#stBody'); const kind = view.kind; const min = MIN[kind];
  tx.classList.remove('wrap'); body.classList.remove('scroll'); body.scrollTop = 0;
  if (shrink(min)) { /* the whole text fits on one screen */ }
  else if (kind === 't') { tx.classList.add('wrap'); if (!shrink(min)) shrink(0.8); } // let a hemistich wrap before going smaller
  else if (kind === 'q') { // STG-27: shown whole at a comfortable size; it scrolls and follows the recitation
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    setSize(Math.max(min, Math.min(3.1, Math.sqrt(body.clientWidth * body.clientHeight) / 12 / rem)));
    body.classList.add('scroll');
  }
  else shrink(0.8);
  const keep = phrase; phrase = -1; mark(Math.max(0, keep));
}
/** Keep the phrase being recited in the middle of a scrolling verse, unless the reader has just scrolled it. */
function follow() {
  const body = $('#stBody'); if (!body.classList.contains('scroll') || Date.now() < hold) return;
  const on = body.querySelectorAll('.w.on'); const first = on[0] || (phrase <= 0 ? body.querySelector('.w') : null); if (!first) return;
  const br = body.getBoundingClientRect(), H = body.clientHeight;
  const a = first.getBoundingClientRect().top - br.top + body.scrollTop, b = (on[on.length - 1] || first).getBoundingClientRect().bottom - br.top + body.scrollTop;
  const top = Math.max(0, Math.min(body.scrollHeight - H, b - a > H * 0.8 ? a - H * 0.12 : (a + b) / 2 - H / 2));
  if (Math.abs(top - body.scrollTop) > 4) body.scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
/** Softly mark the phrase being recited and bring it into view; with «تسميع» on, what has not been recited yet stays blurred (STG-28). */
function mark(k) {
  if (!root || !view) return;
  if (view.kind !== 'q') return;
  const span = view.spans?.[k] || view.spans?.[0]; if (!span) return;
  if (k === phrase) return; phrase = k;
  const tx = $('#stText'); const ws = [...tx.querySelectorAll('.w')];
  let last = 0;
  ws.forEach(w => {
    const n = parseInt(w.dataset.w || '0', 10) || 0; if (n) last = n; const at = n || last; const vn = w.classList.contains('vnum');
    w.classList.toggle('on', !!view.spans && view.spans.length > 1 && at >= span[0] && at <= span[1] && !vn);
    w.classList.toggle('hid', memo && !vn && at >= span[0]);
  });
  follow();
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

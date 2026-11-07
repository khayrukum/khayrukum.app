// Listening «/listen/» (LIS-01…12, AUD-*).
import { S } from '../core/strings.ar.js';
import { esc, n, clock, rate as fmtRate, mb } from '../core/fmt.js';
import { href } from '../core/base.js';
import * as store from '../core/store.js';
import * as ui from '../core/ui.js';
import * as audio from '../core/audio.js';
import { collection, cachedCount, totalBytes } from '../core/audio-cache.js';
import { loadTuhfa } from '../core/content.js';

const L = S.listen;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]; // LIS-08
const main = ui.$('#main');
let T, col, prefs, selMode = false, dragging = null;

const chapterOf = b => T.chapters.find(c => b >= c.from && b <= c.to);
const savePrefs = () => { prefs.updatedAt = Date.now(); return store.set('listen:prefs', prefs); };
const review = b => (T.review?.[b] && T.review[b] !== 'verified' ? `<span class="review">${esc(S.reviewNote)}</span>` : '');
const baytHtml = b => `<span class="bayt both"><span class="h">${esc(T.abyat[b][0])}</span><span class="h">${esc(T.abyat[b][1])}${review(b)}</span></span>`;

function head() {
  ui.$('#head').innerHTML = `<span class="muted small">${esc(L.kicker)}</span><h1 id="title">${esc(S.titles.listen)}</h1><span class="muted small">${esc(L.usage)}</span><span class="muted small">${esc(S.credit.audio)}</span>`;
}

// ---------- items ----------
const baytItem = b => ({ key: `bayt:${b}`, it: col.byId.get(`bayt:${b}`), title: L.tBayt(n(b), T.abyat[b][0]), bayt: b });
const chapterItem = c => ({ key: `chapter:${c}`, it: col.byId.get(`chapter:${c}`), title: L.tChapter(n(c), T.chapters[c - 1].name), chapter: c });
const fullItem = () => { const it = col.byId.get('full'); return { key: 'full', it, title: L.tAll(T.chapters[0].name), chapterOffsets: it.chapterOffsets }; };

/** Current bayt being heard (AUD-15) from segments + measured chapter offsets. */
function currentBayt(s) {
  if (!s.item) return null;
  if (s.item.bayt) return s.item.bayt;
  const segs = col.segments || {};
  let ci = null, t = s.time;
  if (s.item.chapter) ci = s.item.chapter - 1;
  else if (s.item.chapterOffsets) { const o = s.item.chapterOffsets; ci = o.findIndex((x, k) => t >= x && (k === o.length - 1 || t < o[k + 1])); if (ci < 0) return null; t -= o[ci]; }
  if (ci == null) return null;
  let best = null;
  for (const [b, [c, a]] of Object.entries(segs)) if (c === ci && t >= a - 0.2) best = +b;
  return best;
}
function currentChapter(s) {
  if (!s.item) return null;
  if (s.item.chapter) return s.item.chapter;
  if (s.item.bayt) return chapterOf(s.item.bayt).n;
  if (s.item.chapterOffsets) { const o = s.item.chapterOffsets; const i = o.findIndex((x, k) => s.time >= x && (k === o.length - 1 || s.time < o[k + 1])); return i >= 0 ? i + 1 : 1; }
  return null;
}

// ---------- rendering ----------
function list() {
  return T.chapters.map(c => {
    const open = selMode || !!prefs.open[c.n];
    const it = col?.byId.get(`chapter:${c.n}`);
    const all = Array.from({ length: c.to - c.from + 1 }, (_, i) => c.from + i);
    const allSel = all.every(b => prefs.sel.includes(b));
    const rows = all.map(b => {
      const sel = prefs.sel.includes(b);
      if (!col) return `<div class="byt" data-b="${b}"><span class="n">${n(b)}</span>${baytHtml(b)}</div>`;
      if (selMode) return `<div class="byt${sel ? ' sel' : ''}" data-b="${b}" role="checkbox" aria-checked="${sel}" tabindex="0"><span class="ck" aria-hidden="true">${sel ? '✓' : ''}</span><span class="n">${n(b)}</span>${baytHtml(b)}</div>`;
      return `<div class="byt" data-b="${b}"><span class="n">${n(b)}</span>${baytHtml(b)}<button type="button" class="play" data-bayt="${b}" aria-label="${esc(L.baytPlay(n(b)))}">▶</button></div>`;
    }).join('');
    const right = !col ? '' : selMode ? `<button type="button" class="btn small" data-selch="${c.n}" aria-pressed="${allSel}">${esc(allSel ? L.chapSelOn : L.chapSel)}</button>` : `<button type="button" class="btn small primary" data-chapter="${c.n}">${esc(L.chapterBtn)}</button>`;
    return `<section class="chap" data-ch="${c.n}"><div class="chap-head"><span class="num" aria-hidden="true">${n(c.n)}</span><span class="t"><b>${esc(c.name)}</b><span class="muted small">${n(c.from)}${c.to !== c.from ? '–' + n(c.to) : ''}${it?.dur ? ' · ' + clock(it.dur) : ''}</span></span>${right}</div>
      <details data-open="${c.n}"${open ? ' open' : ''}><summary>${esc(L.abyat)}</summary>${rows}</details></section>`;
  }).join('');
}

function render() {
  if (!col) {
    main.innerHTML = `<p class="banner">${esc(L.soon)}</p><div class="stack">${list()}</div>`; // LIS-12
    return;
  }
  main.innerHTML = `
  <div class="nowbar"><div class="now">
    <button class="ctl" type="button" id="pp" aria-label="${esc(L.play)}" disabled>▶</button>
    <div class="t"><b id="nowT">${esc(L.idleT)}</b><span class="sub" id="nowS">${esc(L.idleS)}</span>
      <div class="seekrow"><button type="button" class="skip" id="back5" aria-label="${esc(L.back5)}">${esc(L.back5t)}</button>
        <div id="seek" class="track" role="slider" tabindex="0" aria-label="${esc(L.seek)}" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0" aria-valuetext="" aria-disabled="true"><i class="fill"></i><i class="knob"></i></div>
        <button type="button" class="skip" id="fwd5" aria-label="${esc(L.fwd5)}">${esc(L.fwd5t)}</button></div>
      <div class="times"><span id="tCur">${clock(0)}</span><span id="tDur">${clock(0)}</span></div></div>
    <div class="side"><button class="btn" type="button" id="loop" aria-pressed="${!!prefs.loop}">${esc(L.loop)}</button><button class="btn" type="button" id="speedBtn" aria-expanded="false" aria-controls="speeds" aria-label="${esc(L.speedBtn)}">${esc(fmtRate(prefs.rate))}</button></div>
  </div><div class="speeds" id="speeds" hidden><span>${esc(L.speed)}</span>${SPEEDS.map(r => `<button type="button" class="chip" data-rate="${r}" aria-pressed="${r === prefs.rate}">${esc(fmtRate(r))}</button>`).join('')}</div></div>
  <button type="button" class="allbtn" id="allBtn" aria-pressed="false"><span class="ic" aria-hidden="true">▶</span><span class="stack"><b>${esc(L.all)}</b><span class="muted small">${esc(L.allSub)}</span></span></button>
  <p class="small" id="dl"></p>
  <div class="row"><button type="button" class="btn" id="selMode" aria-pressed="${selMode}">${esc(selMode ? L.selDone : L.selMode)}</button><span class="muted small">${esc(L.selHint)}</span></div>
  <div id="list" class="stack">${list()}</div>
  <div class="selbar" id="selBar"${selMode ? '' : ' hidden'}><div class="in">
    <div class="rng"><label for="rFrom">${esc(L.from)}</label><select id="rFrom">${opts(prefs.rf || 1)}</select><label for="rTo">${esc(L.to)}</label><select id="rTo">${opts(prefs.rt || 5)}</select><button type="button" class="btn small" id="rAdd">${esc(L.addRange)}</button></div>
    <div class="row"><b id="selCount"></b><button type="button" class="btn small grow-none" id="selClear">${esc(L.clear)}</button><button type="button" class="btn primary small" id="selPlay">${esc(L.playSel)}</button></div>
  </div></div>`;
  selCount(); sync(audio.state()); dlState();
}
const opts = v => Array.from({ length: 61 }, (_, i) => `<option value="${i + 1}"${i + 1 === v ? ' selected' : ''}>${n(i + 1)}</option>`).join('');
function selCount() {
  const k = prefs.sel.length; const el = ui.$('#selCount'); if (!el) return;
  el.textContent = !k ? L.selNone : k === 1 ? L.selOne(n(1)) : L.selMany(n(k));
  ui.$('#selPlay').disabled = !k;
}

async function dlState() { // LIS-11
  const el = ui.$('#dl'); if (!el) return;
  const k = await cachedCount(col.items); const N = col.items.length;
  const text = k === N ? L.dlDone : k > 0 ? L.dlResume(n(k), n(N)) : L.dl(mb(totalBytes(col.items)));
  el.innerHTML = `<a href="${href('settings/#audio')}">${esc(text)}</a>`;
}

/** Update the now-playing bar and highlights. */
function sync(s) {
  if (!col || !ui.$('#pp')) return;
  const pp = ui.$('#pp');
  pp.disabled = !s.item; pp.textContent = s.playing ? '⏸' : '▶'; pp.setAttribute('aria-label', s.playing ? L.pause : L.play);
  let title = L.idleT, sub = L.idleS;
  if (s.item) {
    const loopTxt = s.loop ? L.looping : '';
    if (s.seq) { title = L.tSel(n(s.idx + 1), n(s.seq.length)) + loopTxt; sub = s.item.title; }
    else if (s.item.chapterOffsets) { const c = currentChapter(s); title = L.tAll(T.chapters[(c || 1) - 1].name) + loopTxt; sub = L.allSub; }
    else { title = s.item.title + loopTxt; sub = s.item.chapter ? `${n(T.chapters[s.item.chapter - 1].from)}–${n(T.chapters[s.item.chapter - 1].to)}` : ''; }
  }
  ui.$('#nowT').textContent = title; ui.$('#nowS').textContent = sub;
  if (!dragging) seekUi(s.time, s.dur);
  ui.$('#seek').setAttribute('aria-disabled', String(!s.item));
  ui.$('#allBtn').setAttribute('aria-pressed', String(s.item?.key === 'full'));
  ui.$('#allBtn .ic').textContent = s.item?.key === 'full' && s.playing ? '⏸' : '▶';
  const ch = currentChapter(s); const b = currentBayt(s);
  ui.$$('.chap').forEach(c => c.classList.toggle('on', +c.dataset.ch === ch));
  ui.$$('.byt').forEach(r => r.classList.toggle('on', +r.dataset.b === b));
  if (b) ui.setTuhfaContext(b);
}
function seekUi(t, d) {
  const sk = ui.$('#seek'); if (!sk) return;
  const p = d ? Math.max(0, Math.min(1, t / d)) : 0;
  sk.style.setProperty('--p', (p * 100).toFixed(2) + '%');
  sk.setAttribute('aria-valuemax', String(Math.round(d || 0))); sk.setAttribute('aria-valuenow', String(Math.round(t || 0)));
  sk.setAttribute('aria-valuetext', L.timeOf(clock(t), clock(d)));
  ui.$('#tCur').textContent = clock(t); ui.$('#tDur').textContent = clock(d);
}

// ---------- seek slider (AUD-12): custom, RTL, pointer capture, preview while dragging, seek on release ----------
function bindSeek() {
  const sk = ui.$('#seek');
  const frac = x => { const r = sk.getBoundingClientRect(); return Math.max(0, Math.min(1, (r.right - x) / r.width)); }; // start = right edge
  sk.addEventListener('pointerdown', e => {
    const s = audio.state(); if (!s.item) return;
    e.preventDefault(); sk.setPointerCapture(e.pointerId); dragging = { id: e.pointerId, t: frac(e.clientX) * s.dur };
    seekUi(dragging.t, s.dur);
  });
  sk.addEventListener('pointermove', e => { if (!dragging || e.pointerId !== dragging.id) return; const d = audio.state().dur; dragging.t = frac(e.clientX) * d; seekUi(dragging.t, d); });
  const end = e => { if (!dragging || e.pointerId !== dragging.id) return; const t = dragging.t; dragging = null; audio.seek(t); };
  sk.addEventListener('pointerup', end); sk.addEventListener('pointercancel', () => { dragging = null; });
  sk.addEventListener('keydown', e => {
    const s = audio.state(); if (!s.item) return;
    const m = { ArrowLeft: 5, ArrowRight: -5 }[e.key]; // RTL: left = forward
    if (m != null) { e.preventDefault(); audio.skip(m); }
    else if (e.key === 'Home') { e.preventDefault(); audio.seek(0); }
    else if (e.key === 'End') { e.preventDefault(); audio.seek(s.dur); }
  });
}

function playSelection() {
  const sel = prefs.sel.slice().sort((a, b) => a - b); if (!sel.length) return;
  audio.setLoop(!!prefs.loop);
  audio.playSequence(sel.map(baytItem)); // LIS-06: ascending, one media element
}

function bind() {
  main.addEventListener('click', e => {
    const b = e.target.closest('button');
    const row = !b && e.target.closest('.byt[role=checkbox]');
    if (row) { toggleSel(+row.dataset.b); return; }
    if (!b) return; const d = b.dataset;
    if (b.id === 'pp') { audio.toggle(); return; }
    if (b.id === 'back5') { audio.skip(-5); return; }
    if (b.id === 'fwd5') { audio.skip(5); return; }
    if (b.id === 'loop') { prefs.loop = !prefs.loop; audio.setLoop(prefs.loop); b.setAttribute('aria-pressed', String(prefs.loop)); savePrefs(); audio.refreshMeta(); sync(audio.state()); return; }
    if (b.id === 'speedBtn') { const sp = ui.$('#speeds'); sp.hidden = !sp.hidden; b.setAttribute('aria-expanded', String(!sp.hidden)); return; }
    if (d.rate) { prefs.rate = +d.rate; audio.setRate(prefs.rate); ui.$('#speedBtn').textContent = fmtRate(prefs.rate); ui.$$('[data-rate]').forEach(x => x.setAttribute('aria-pressed', String(+x.dataset.rate === prefs.rate))); savePrefs(); return; }
    if (b.id === 'allBtn') { const s = audio.state(); if (s.item?.key === 'full') { audio.toggle(); return; } audio.setLoop(!!prefs.loop); audio.play(fullItem()); return; }
    if (d.chapter) { const s = audio.state(); const k = `chapter:${d.chapter}`; if (s.item?.key === k && !s.seq) { audio.toggle(); return; } audio.setLoop(!!prefs.loop); audio.play(chapterItem(+d.chapter)); return; }
    if (d.bayt) { const s = audio.state(); const k = `bayt:${d.bayt}`; if (s.item?.key === k && !s.seq) { audio.toggle(); return; } audio.setLoop(!!prefs.loop); audio.play(baytItem(+d.bayt)); return; }
    if (b.id === 'selMode') { selMode = !selMode; render(); bindSeek(); ui.$('#selMode').focus(); return; }
    if (d.selch) { const c = T.chapters[+d.selch - 1]; const all = []; for (let x = c.from; x <= c.to; x++) all.push(x); const on = all.every(x => prefs.sel.includes(x)); prefs.sel = on ? prefs.sel.filter(x => !all.includes(x)) : [...new Set(prefs.sel.concat(all))]; savePrefs(); rerenderList(); return; }
    if (b.id === 'rAdd') { let a = +ui.$('#rFrom').value, z = +ui.$('#rTo').value; if (a > z) [a, z] = [z, a]; prefs.rf = a; prefs.rt = z; const add = []; for (let x = a; x <= z; x++) add.push(x); prefs.sel = [...new Set(prefs.sel.concat(add))]; savePrefs(); rerenderList(); return; } // LIS-05: adds the range
    if (b.id === 'selClear') { prefs.sel = []; savePrefs(); rerenderList(); return; } // GEN-07 exempt
    if (b.id === 'selPlay') { playSelection(); return; }
  });
  main.addEventListener('keydown', e => { const row = e.target.closest?.('.byt[role=checkbox]'); if (row && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); toggleSel(+row.dataset.b); } });
  main.addEventListener('toggle', e => { const d = e.target; if (d.dataset?.open && !selMode) { prefs.open[d.dataset.open] = d.open; savePrefs(); } }, true);
}
function toggleSel(b) { prefs.sel = prefs.sel.includes(b) ? prefs.sel.filter(x => x !== b) : prefs.sel.concat(b); savePrefs(); rerenderList(); ui.$(`.byt[data-b="${b}"]`)?.focus(); }
function rerenderList() { ui.$('#list').innerHTML = list(); selCount(); sync(audio.state()); }

(async () => {
  await ui.initPage({ notes: ['tuhfa'] });
  try {
    T = await loadTuhfa();
    col = await collection('tuhfa');
    prefs = Object.assign({ sel: [], rate: 1, loop: false, open: {} }, (await store.get('listen:prefs')) || {});
    head(); render();
    if (col) {
      audio.setRate(prefs.rate); audio.setLoop(!!prefs.loop);
      bind(); bindSeek();
      audio.on('change', sync); audio.on('time', sync);
    } else {
      main.addEventListener('toggle', e => { const d = e.target; if (d.dataset?.open) { prefs.open[d.dataset.open] = d.open; savePrefs(); } }, true);
    }
  } catch (e) { console.error(e); main.innerHTML = `<p class="banner warn">${esc(S.loadError)}</p>`; }
})();

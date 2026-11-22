// «مشغّل المدى» «/range/» (RNG-01…12): pick a range by page, rub' or verse and hear it continuously in the
// recitation of a Quran collection made of part files (AUD-34/35), with «وضع العرض» (STG-10…12).
import { S } from '../core/strings.ar.js';
import { esc, n, clock, rate as fmtRate, mb, dec } from '../core/fmt.js';
import { href } from '../core/base.js';
import * as store from '../core/store.js';
import * as ui from '../core/ui.js';
import * as audio from '../core/audio.js';
import { collection, cachedCount, totalBytes, downloadAll } from '../core/audio-cache.js';
import { loadMeta, loadQuran } from '../core/content.js';
import { pageOf } from '../core/pages.js';
import { tokens, isMarkToken } from '../core/refs.js';
import * as R from '../core/range-logic.js';
import { seekbar } from '../core/seekbar.js';
import * as stage from '../core/stage.js';

const L = S.range;
const COLLECTION = 'minshawi';
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const main = ui.$('#main');
let meta, col, idx, prefs, lists, clips = [], items = [], flat = [], total = 0, resume = 0, bar = null, lastSave = 0, busy = false;
const texts = new Map(), views = new Map();

const savePrefs = () => { prefs.updatedAt = Date.now(); return store.set('range:prefs', prefs); };
const suraName = s => meta.suras[s - 1].name;

// ---------- the selection ----------
/** The list the «من / إلى» selects offer for the current unit: items { n, run, from:[s,a], to:[s,a] }. */
function list() {
  if (prefs.unit !== 'A') return lists[prefs.unit];
  const su = lists.A.find(x => x.sura === prefs.A.sura) || lists.A[0];
  return su.ayas.map(a => ({ n: a.n, run: a.run, from: [su.sura, a.n], to: [su.sura, a.n] }));
}
function picked() {
  const l = list(); const cur = prefs.unit === 'A' ? [prefs.A.from, prefs.A.to] : prefs[prefs.unit];
  const at = v => Math.max(0, l.findIndex(x => x.n === v));
  return { l, a: at(cur[0]), b: Math.max(at(cur[0]), at(cur[1])) };
}
function setPicked(a, b) { const l = list(); if (prefs.unit === 'A') { prefs.A.from = l[a].n; prefs.A.to = l[b].n; } else prefs[prefs.unit] = [l[a].n, l[b].n]; }
const rangeKey = () => { const { l, a, b } = picked(); return `${prefs.unit}:${l[a].from.join(':')}-${l[b].to.join(':')}`; };

const label = e => (e.pre ? L.istiadha : e.bas ? L.basmala(suraName(e.bas)) : L.label(suraName(e.sura), n(e.aya)));
function rebuild() {
  const { l, a, b } = picked();
  clips = R.buildClips(meta, idx, l[a].from, l[b].to, prefs.tune);
  items = clips.map((c, i) => ({ key: 'range:' + i, it: c.part.it, start: c.start, end: c.end, title: label(c.first), artist: L.artist, album: L.album }));
  flat = R.flatEntries(clips); total = R.totalDur(clips); views.clear();
  for (const s of new Set(flat.map(x => x.e.sura || x.e.bas).filter(Boolean))) if (!texts.has(s)) loadQuran(s).then(q => { texts.set(s, q); views.clear(); sync(audio.state()); }).catch(() => {});
}

// ---------- playback ----------
const mine = s => !!s.item && items.includes(s.item);
const pos = s => (mine(s) ? R.rangePos(clips, s.idx, s.abs) : resume);
function current(s) {
  if (!clips.length) return null;
  if (mine(s)) return { i: s.idx, e: R.entryAt(clips[s.idx], s.abs), t: s.abs };
  const at = R.locate(clips, resume); return { i: at.i, e: R.entryAt(clips[at.i], at.t), t: at.t };
}
function play(p = 0) {
  if (!clips.length) return;
  const at = R.locate(clips, p);
  audio.setRate(prefs.rate); audio.setLoop(!!prefs.loop);
  audio.playSequence(items, { start: at.i, from: at.t - clips[at.i].start }); // AUD-05: inside the tap
}
function toggle() { const s = audio.state(); if (mine(s)) audio.toggle(); else play(resume); }
function seekTo(p) {
  const s = audio.state(); p = Math.max(0, Math.min(p, Math.max(0, total - 0.1)));
  if (!mine(s)) { resume = p; sync(s); return; }
  const at = R.locate(clips, p);
  if (at.i === s.idx) audio.seek(at.t - clips[at.i].start);
  else { play(p); if (!s.playing) audio.pause(); }
}
/** «previous / next verse» — on the page, in «وضع العرض» and from the lock screen. */
function step(dir) {
  const s = audio.state(); const c = current(s); if (!c) return;
  let k = flat.findIndex(x => x.i === c.i && x.e === c.e);
  if (dir < 0 && c.t - c.e.s > 2) { /* restart this verse */ } else k += dir;
  if (k >= flat.length) { if (!prefs.loop) return; k = 0; }
  k = Math.max(0, k);
  const x = flat[k];
  seekTo(k === 0 ? 0 : R.rangePos(clips, x.i, Math.max(clips[x.i].start, x.e.s - 0.1))); // just before its first sound
}
function setLoop(on) { prefs.loop = on; audio.setLoop(on); savePrefs(); audio.refreshMeta(); const b = ui.$('#loop'); if (b) b.setAttribute('aria-pressed', String(on)); sync(audio.state()); }
/** The range changed (selection or fine-tune): keep playing if it was playing, from `p`. */
function apply(p = 0) {
  const s = audio.state(); const was = mine(s), playing = was && s.playing;
  rebuild(); resume = typeof p === 'function' ? p() : p; p = resume; prefs.pos = null;
  if (playing) play(p); else if (was) audio.stop();
  summary(); tuneUi(); dlState(); sync(audio.state());
}

// ---------- «وضع العرض» ----------
function viewOf(e) {
  if (views.has(e.key)) return views.get(e.key);
  let v;
  const q = texts.get(e.sura || e.bas);
  if (e.pre) v = { id: e.key, kind: 'x', label: L.istiadha, ctx: '', num: '', times: [0] };
  else if (!q) return { id: e.key + '?', kind: 'x', label: '', ctx: L.suraName(suraName(e.sura || e.bas)), num: '', times: [0] }; // the text is on its way (local data)
  else {
    let w = 0; const words = tokens(e.bas ? q.basmala : q.ayat[e.aya - 1]).map(t => (isMarkToken(t) ? { t, w: 0 } : { t, w: ++w }));
    const ph = R.phraseSpans(idx.parts[e.part].cues.get(e.key), w);
    v = e.bas ? { id: e.key, kind: 'q', words, spans: ph.spans, times: ph.times, ctx: L.suraName(suraName(e.bas)), num: L.basmala(suraName(e.bas)) }
      : { id: e.key, kind: 'q', words, spans: ph.spans, times: ph.times, vnum: `﴿${n(e.aya)}﴾`, ctx: L.suraName(suraName(e.sura)), num: `${L.ayah(n(e.aya))} · ${L.page(n(pageOf(meta, e.sura, e.aya).page))}` };
  }
  views.set(e.key, v); return v;
}
function openStage(opener) {
  stage.open({ opener, onToggle: toggle, onPrev: () => step(-1), onNext: () => step(1), onLoop: () => setLoop(!prefs.loop) });
  sync(audio.state());
}

// ---------- rendering ----------
function head() {
  ui.$('#head').innerHTML = `<h1 id="title">${esc(S.titles.range)}</h1><span class="muted small">${esc(L.usage)}</span>${col ? `<span class="muted small">${esc(S.credit.minshawi)}</span>` : ''}`;
}
const optLabel = x => (prefs.unit === 'A' ? L.optA(n(x.n)) : L[prefs.unit === 'P' ? 'optP' : 'optQ'](n(x.n), suraName(x.from[0]), n(x.from[1])));
function fill() {
  const { l, a, b } = picked();
  const opts = sel => l.map((x, i) => `<option value="${i}"${i === sel ? ' selected' : ''}>${esc(optLabel(x))}</option>`).join('');
  ui.$('#rFrom').innerHTML = opts(a); ui.$('#rTo').innerHTML = opts(b);
  ui.$('#suraBox').hidden = prefs.unit !== 'A';
  ui.$$('[data-unit]').forEach(x => { x.setAttribute('aria-pressed', String(x.dataset.unit === prefs.unit)); x.disabled = !lists[x.dataset.unit].length; }); // RNG-03: only what is covered
}
function summary() {
  const { l, a, b } = picked();
  const v = x => L.verse(suraName(x[0]), n(x[1]));
  ui.$('#sum').textContent = `${L.sum[prefs.unit](n(b - a + 1), clock(total))} · ${L.span(v(l[a].from), v(l[b].to))}`;
}
function coverage() {
  return L.covered(lists.A.map(su => {
    if (su.ayas.length === meta.suras[su.sura - 1].ayas) return su.name;
    const runs = []; for (const a of su.ayas) { const r = runs[runs.length - 1]; if (r && r.run === a.run) r.b = a.n; else runs.push({ run: a.run, a: a.n, b: a.n }); }
    return runs.map(r => L.coveredPart(su.name, n(r.a), n(r.b))).join(L.listSep);
  }).join(L.listSep));
}
function render() {
  if (!col) { // RNG-12: no recitation in this build — say so, and offer the next step (NFR-FEEL-04)
    const K = L.noneLinks;
    main.innerHTML = `<p class="banner" id="none">${esc(L.none)}</p><div class="panel"><p>${esc(L.noneWhy)}</p><div class="row">
      <a class="btn primary" href="${href('random/?due=1')}">${esc(K.due)}</a><a class="btn" href="${href('random/')}">${esc(K.random)}</a><a class="btn" href="${href('listen/')}">${esc(K.listen)}</a><a class="btn" href="${href('')}">${esc(K.home)}</a></div></div>`;
    return;
  }
  main.innerHTML = `
  <section class="panel" aria-label="${esc(S.titles.range)}">
    <div class="chips" role="group" aria-label="${esc(L.unit)}">${['P', 'Q', 'A'].map(u => `<button type="button" class="chip" data-unit="${u}" aria-pressed="false">${esc(L.units[u])}</button>`).join('')}</div>
    <div class="rng" id="suraBox" hidden><label for="rSura">${esc(L.sura)}</label><select id="rSura" class="grow">${lists.A.map(su => `<option value="${su.sura}"${su.sura === prefs.A.sura ? ' selected' : ''}>${esc(su.name)}</option>`).join('')}</select></div>
    <div class="rng"><label for="rFrom">${esc(L.from)}</label><select id="rFrom" class="grow"></select></div>
    <div class="rng"><label for="rTo">${esc(L.to)}</label><select id="rTo" class="grow"></select></div>
    <span class="muted small" id="sum"></span>
  </section>
  <div class="nowbar"><div class="now">
    <button class="ctl" type="button" id="pp" aria-label="${esc(L.play)}">▶</button>
    <div class="t"><b id="nowT">${esc(L.idleT)}</b><span class="sub" id="nowS"></span>
      <div class="seekrow"><button type="button" class="skip" id="back5" aria-label="${esc(S.listen.back5)}">${esc(S.listen.back5t)}</button>
        <div id="seek" class="track" role="slider" tabindex="0" aria-label="${esc(S.listen.seek)}" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0" aria-valuetext=""><i class="fill"></i><i class="knob"></i></div>
        <button type="button" class="skip" id="fwd5" aria-label="${esc(S.listen.fwd5)}">${esc(S.listen.fwd5t)}</button></div>
      <div class="times"><span id="tCur">${clock(0)}</span><span id="tDur">${clock(0)}</span></div></div>
    <div class="side"><button class="btn" type="button" id="loop" aria-pressed="${!!prefs.loop}">${esc(S.listen.loop)}</button><button class="btn" type="button" id="speedBtn" aria-expanded="false" aria-controls="speeds" aria-label="${esc(S.listen.speedBtn + ' ' + fmtRate(prefs.rate))}">${esc(fmtRate(prefs.rate))}</button></div>
  </div><div class="speeds" id="speeds" hidden><span>${esc(S.listen.speed)}</span>${SPEEDS.map(r => `<button type="button" class="chip" data-rate="${r}" aria-pressed="${r === prefs.rate}">${esc(fmtRate(r))}</button>`).join('')}</div></div>
  <div class="row"><button type="button" class="btn primary grow" id="stageBtn">${esc(L.stage)}</button><button type="button" class="btn" id="prevV" aria-label="${esc(L.prev)}">${esc(L.prevT)}</button><button type="button" class="btn" id="nextV" aria-label="${esc(L.next)}">${esc(L.nextT)}</button></div>
  <details class="panel" id="tune"><summary>${esc(L.tune)}</summary><p class="muted small">${esc(L.tuneHint)}</p>
    ${[['s', L.tuneStart], ['e', L.tuneEnd]].map(([k, t]) => `<div class="kv"><span>${esc(t)}: <b id="tv-${k}"></b></span><span class="row"><button type="button" class="btn small" data-tune="${k}" data-d="-1" aria-label="${esc(L.earlier(t))}">${esc(L.minus)}</button><button type="button" class="btn small" data-tune="${k}" data-d="1" aria-label="${esc(L.later(t))}">${esc(L.plus)}</button></span></div>`).join('')}
    <div class="row"><button type="button" class="btn small" id="tuneReset">${esc(L.tuneReset)}</button></div></details>
  <div id="dl" class="small"></div>
  <p class="muted small">${esc(coverage())} ${esc(L.accuracy)}</p>`;
  fill(); summary(); tuneUi(); dlState();
  bar = seekbar(ui.$('#seek'), {
    now: () => ({ active: clips.length > 0, time: pos(audio.state()), dur: total }),
    seek: seekTo, skip: d => seekTo(pos(audio.state()) + d), text: (t, d) => S.listen.timeOf(clock(t), clock(d)),
    onPaint: (t, d) => { ui.$('#tCur').textContent = clock(t); ui.$('#tDur').textContent = clock(d); }
  });
  sync(audio.state());
}
function tuneUi() {
  const c0 = clips[0], c1 = clips[clips.length - 1]; if (!c0 || !ui.$('#tv-s')) return;
  const show = d => (d ? L.tuneVal((d > 0 ? '+' : '−') + dec(Math.abs(d))) : L.tuneZero);
  ui.$('#tv-s').textContent = show(prefs.tune[c0.startKey] || 0); ui.$('#tv-e').textContent = show(prefs.tune[c1.endKey] || 0);
  ui.$('#tuneReset').disabled = !prefs.tune[c0.startKey] && !prefs.tune[c1.endKey];
}
async function dlState(progress) {
  const el = ui.$('#dl'); if (!el || busy && !progress) return;
  const parts = [...new Set(clips.map(c => c.part.it))];
  if (progress) { el.textContent = L.dlBusy(n(progress.k), n(progress.n)); return; }
  const key = rangeKey(); const k = await cachedCount(parts); if (key !== rangeKey()) return;
  el.innerHTML = k === parts.length ? esc(L.dlDone) : `<button type="button" class="linkbtn" id="dlBtn">${esc(L.dl(mb(totalBytes(parts))))}</button>`;
}
async function download() {
  if (busy) return; busy = true;
  const parts = [...new Set(clips.map(c => c.part.it))];
  dlState({ k: 0, n: parts.length });
  const r = await downloadAll(parts, { onProgress: p => dlState(p) }).catch(() => ({ failed: 1 }));
  busy = false;
  if (r.error === 'space') ui.toast(L.dlSpace, { error: true }); else if (r.failed) ui.toast(L.dlFail, { error: true });
  dlState();
}

/** Now-playing bar, «وضع العرض» and the lock-screen title follow the audio (RNG-08). */
function sync(s) {
  if (!col || !ui.$('#pp')) return;
  const on = mine(s), playing = on && s.playing, c = current(s), p = pos(s);
  const pp = ui.$('#pp'); const sym = playing ? '⏸' : '▶';
  if (pp.textContent !== sym) { pp.textContent = sym; pp.setAttribute('aria-label', playing ? L.pause : L.play); }
  const text = c ? label(c.e) : '';
  const title = !c ? L.idleT : playing ? L.nowT(text) : on || p > 0 ? L.pausedT(text) : L.idleT;
  if (ui.$('#nowT').textContent !== title) ui.$('#nowT').textContent = title;
  const sub = c && c.e.sura ? L.sub(n(pageOf(meta, c.e.sura, c.e.aya).page), prefs.loop) : '';
  if (ui.$('#nowS').textContent !== sub) ui.$('#nowS').textContent = sub;
  bar?.paint(p, total);
  if (on && c && s.item.title !== text) { s.item.title = text; audio.refreshMeta(); }
  if (stage.isOpen() && c) { const v = viewOf(c.e); stage.show(v); stage.tick({ playing, loop: prefs.loop, frac: total ? p / total : 0, phrase: R.phraseAt(v.times, c.t) }); }
  if (on) { resume = p; if (!s.playing || Date.now() - lastSave > 5000) keep(); }
}
/** Remember where the reader is in this range (NFR-FEEL-04). */
function keep() { const v = { k: rangeKey(), p: Math.round(resume * 10) / 10 }; if (prefs.pos?.k === v.k && prefs.pos.p === v.p) return; lastSave = Date.now(); prefs.pos = v; savePrefs(); }

function bind() {
  main.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
    if (b.id === 'pp') return toggle();
    if (b.id === 'back5') return seekTo(pos(audio.state()) - 5);
    if (b.id === 'fwd5') return seekTo(pos(audio.state()) + 5);
    if (b.id === 'prevV') return step(-1);
    if (b.id === 'nextV') return step(1);
    if (b.id === 'loop') return setLoop(!prefs.loop);
    if (b.id === 'stageBtn') return openStage(b);
    if (b.id === 'speedBtn') { const sp = ui.$('#speeds'); sp.hidden = !sp.hidden; b.setAttribute('aria-expanded', String(!sp.hidden)); return; }
    if (d.rate) { prefs.rate = +d.rate; audio.setRate(prefs.rate); ui.$('#speedBtn').textContent = fmtRate(prefs.rate); ui.$('#speedBtn').setAttribute('aria-label', S.listen.speedBtn + ' ' + fmtRate(prefs.rate)); ui.$$('[data-rate]').forEach(x => x.setAttribute('aria-pressed', String(+x.dataset.rate === prefs.rate))); savePrefs(); return; }
    if (d.unit) { if (d.unit === prefs.unit) return; prefs.unit = d.unit; fill(); apply(); savePrefs(); return; }
    if (d.tune) { // RNG-09: ±1 s on the start or the end of the range; hear the result at once
      const key = d.tune === 's' ? clips[0].startKey : clips[clips.length - 1].endKey;
      const v = Math.max(-10, Math.min(10, (prefs.tune[key] || 0) + +d.d));
      if (v) prefs.tune[key] = v; else delete prefs.tune[key];
      const s = audio.state(); const held = mine(s) && s.playing ? null : pos(s); // playing: replay the edge that moved
      apply(() => (held != null ? Math.min(held, Math.max(0, total - 0.1)) : d.tune === 's' ? 0 : Math.max(0, total - 3)));
      savePrefs(); sync(audio.state()); return;
    }
    if (b.id === 'tuneReset') { delete prefs.tune[clips[0].startKey]; delete prefs.tune[clips[clips.length - 1].endKey]; apply(0); savePrefs(); return; }
    if (b.id === 'dlBtn') return download();
  });
  main.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'rSura') { const su = lists.A.find(x => x.sura === +t.value); prefs.A = { sura: su.sura, from: su.ayas[0].n, to: su.ayas[su.ayas.length - 1].n }; fill(); apply(); savePrefs(); return; }
    if (t.id !== 'rFrom' && t.id !== 'rTo') return;
    // RNG-04: the end the reader did not touch moves so that the range stays ordered and without a gap
    const [a, b] = R.linkEnds(list(), +ui.$('#rFrom').value, +ui.$('#rTo').value, t.id === 'rFrom' ? 'from' : 'to');
    ui.$('#rFrom').value = String(a); ui.$('#rTo').value = String(b);
    setPicked(a, b); apply(); savePrefs();
  });
}

(async () => {
  await ui.initPage({ notes: ['quran'] });
  try {
    [meta, col] = await Promise.all([loadMeta(), collection(COLLECTION)]);
    const saved = (await store.get('range:prefs')) || {};
    if (col) {
      idx = R.buildIndex(col);
      lists = { P: R.coveredUnits(meta, idx, 'P'), Q: R.coveredUnits(meta, idx, 'Q'), A: R.coveredSuras(meta, idx) };
      if (!lists.A.length) col = null;
    }
    head();
    if (!col) { render(); return; }
    const su = lists.A[0];
    prefs = Object.assign({ unit: lists.P.length ? 'P' : 'A', P: [lists.P[0]?.n, lists.P[0]?.n], Q: [lists.Q[0]?.n, lists.Q[0]?.n], A: { sura: su.sura, from: su.ayas[0].n, to: su.ayas[su.ayas.length - 1].n }, loop: true, rate: 1, tune: {}, pos: null }, saved);
    if (!lists[prefs.unit]?.length) prefs.unit = 'A';
    const { a, b } = picked(); setPicked(...R.linkEnds(list(), a, b, 'from'));
    rebuild();
    if (prefs.pos && prefs.pos.k === rangeKey()) resume = Math.min(prefs.pos.p || 0, Math.max(0, total - 0.1));
    render(); bind();
    audio.setRate(prefs.rate); audio.setLoop(!!prefs.loop);
    audio.setNav(() => step(-1), () => step(1));
    audio.on('change', sync); audio.on('time', sync);
    audio.on('ended', () => { resume = 0; keep(); sync(audio.state()); });
    addEventListener('pagehide', () => { if (mine(audio.state())) keep(); });
  } catch (e) { console.error(e); main.innerHTML = `<p class="banner warn">${esc(S.loadError)}</p>`; }
})();

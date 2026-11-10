// Exam «/exam/?id=…» (EX-01…17, IA-01/03/06).
import { S } from '../core/strings.ar.js';
import { esc, n } from '../core/fmt.js';
import { href } from '../core/base.js';
import * as store from '../core/store.js';
import * as ui from '../core/ui.js';
import * as platform from '../core/platform.js';
import * as audio from '../core/audio.js';
import { collection } from '../core/audio-cache.js';
import { loadIndex, loadExam, loadCorpus, loadMeta, answerNumbers, answerRefs } from '../core/content.js';
import { getType, isGradable } from '../core/registry.js';
import { inlineHtml, inlineText, itemHtml, itemText, refHtml, refText, baytNumbers, promptHtml } from '../core/render.js';
import { grade as writeGrade, newSession, makeSnap } from '../core/grading.js';
import { attemptTally } from '../core/stats.js';
import { parseRef } from '../core/refs.js';
import { numberChoices, shuffle } from '../core/random-logic.js';

const main = ui.$('#main');
const E = S.exam;
let ex, entry, corpus, st, key, session, col = null, meta = null, confirmReset = false, gradable = [];

const qDom = id => 'q-' + id.replace(/[^a-z0-9-]/gi, '_');
const unit = () => (ex.kind === 'tuhfa' ? S.units.tuhfa : S.units.quran);
const save = () => { st.updatedAt = Date.now(); return store.set(key, st); };
const roundQs = rid => ex.questions.filter(q => q.type === rid);

function playBtn(k, label) {
  if (!col) return '';
  const it = col.byId.get(k); if (!it) return '';
  const on = audio.state().item?.key === k;
  return `<button type="button" class="play" data-play="${k}" aria-pressed="${on}">${esc(on ? E.stop : label)}</button>`;
}
function syncPlayButtons() {
  const cur = audio.state().item?.key;
  ui.$$('[data-play]').forEach(b => { const on = b.dataset.play === cur && audio.state().item; b.setAttribute('aria-pressed', String(!!on)); b.textContent = on ? E.stop : (b.dataset.play.startsWith('chapter') ? E.listen : E.listenBayt); });
}

function header() {
  const credit = col ? `<span class="muted small">${esc(S.credit.audio)}</span>` : '';
  ui.$('#head').innerHTML = `<span class="muted small">${esc(entry.intro || '')}</span><h1 id="title">${esc(entry.title)}</h1><span class="muted small">${esc(ex.kind === 'tuhfa' ? E.usageTuhfa : E.usage)}</span>${credit}`;
  document.title = entry.title;
}

function scoreLine() {
  const t = attemptTally(st.grades, gradable);
  ui.$('#score').innerHTML = `<b>${esc(E.score(n(t.ok), n(t.mid), n(t.bad), n(gradable.length)))}</b>`;
}

function tabs() {
  ui.$('#rounds').innerHTML = ex.rounds.map(r => {
    const qs = roundQs(r.id); const g = r.gradable?.exam && qs.length;
    const done = qs.filter(q => st.grades[q.id]).length;
    if (r.id === 'which-number' && st.drill) return `<button type="button" role="tab" class="rt" id="tab-${r.id}" aria-controls="qs" aria-selected="${st.round === r.id}" tabindex="${st.round === r.id ? 0 : -1}" data-round="${r.id}">${esc(r.title)}<span class="c">${n(Object.keys(st.drill.first).length)}/${n(st.drill.deck.length)}</span></button>`;
    const sel = st.round === r.id;
    return `<button type="button" role="tab" class="rt" id="tab-${r.id}" aria-controls="qs" aria-selected="${sel}" tabindex="${sel ? 0 : -1}" data-round="${r.id}">${esc(r.title)}${g ? `<span class="c">${n(done)}/${n(qs.length)}</span>` : ''}</button>`;
  }).join('');
}

function summaryHtml() {
  let h = '';
  let chap = 0;
  for (const b of ex.summary || []) {
    if (b.kind === 'outline') {
      h += `<div class="q sum"><h3>${esc(b.title)}</h3><ul>${b.items.map(it => { const p = parseRef(it.range); return `<li><span class="ref">${p.aya === p.ayaTo ? n(p.aya) : n(p.aya) + '–' + n(p.ayaTo)}</span><span class="tx">${inlineHtml(it.text, corpus)}</span></li>`; }).join('')}</ul></div>`;
    } else if (b.kind === 'chapters') {
      h += `<div class="q sum"><h3>${esc(b.title || '')}</h3><ul>${b.items.map(it => { const c = corpus.chapters[it.chapter - 1]; chap++; return `<li><span class="ref">${c.from === c.to ? n(c.from) : n(c.from) + '–' + n(c.to)}</span><span class="tx">${inlineHtml(it.text, corpus)}</span>${b.playable ? playBtn('chapter:' + it.chapter, E.listen) : ''}</li>`; }).join('')}</ul></div>`;
    } else if (b.kind === 'pageStarts') {
      const items = b.items || (meta ? pageStartItems(b.pages) : []);
      h += `<div class="q sum"><h3>${esc(b.title || E.pageStarts)}</h3><div class="pg">${items.map(it => `<div><b>${esc(E.pageLabel(n(it.page)))}</b><span>${itemHtml(it, corpus)}</span></div>`).join('')}</div></div>`;
    } else if (b.kind === 'lookalikes') {
      h += `<div class="q sum"><h3>${esc(b.title || E.lookalikes)}</h3><ul>${b.items.map(it => `<li><span class="ref">${it.refs.map(r => n(parseRef(r).kind === 'q' ? parseRef(r).aya : parseRef(r).bayt)).join(' / ')}</span><span class="tx">${inlineHtml(it.text, corpus)}</span></li>`).join('')}</ul></div>`;
    } else if (b.kind === 'codes') {
      h += `<div class="q sum"><h3>${esc(b.title || E.codes)}</h3><div class="pg">${b.items.map(it => `<div><b>${esc(it.label)}</b><span>${itemHtml({ ...it, label: undefined }, corpus)}</span></div>`).join('')}</div></div>`;
    }
  }
  void chap;
  const first = ex.rounds.find(r => r.id !== 'summary');
  return h + (first ? `<div class="row"><button type="button" class="btn show" data-round="${first.id}">${esc(E.start)}</button></div>` : '');
}
function pageStartItems([a, b]) {
  const out = [];
  for (let p = a; p <= b; p++) { const ps = meta.pages[p - 1]; if (ps && ps[0] === 2) out.push({ page: p, ref: `2:${ps[1]}:1-3` }); }
  return out;
}

function questionHtml(q, i) {
  const t = getType(q.type);
  const g = st.grades[q.id] || '';
  const open = !!st.open[q.id];
  const ctx = { corpus, exam: ex };
  let h = `<article class="q${g ? ' r-' + g : ''}" id="${qDom(q.id)}"><div class="qtop"><span class="qn">${esc(E.q(n(i + 1)))}</span>${g ? `<span class="gradetag">· ${esc(S.grades[g])}</span>` : ''}${q.ask ? `<span class="ask">${inlineHtml(q.ask, corpus)}</span>` : ''}</div>`;
  h += t.render(q, ctx);
  if (open) {
    h += `<div class="ans"><div class="ans-h">${esc(S.exam.answerH)}</div>${t.answerView(q, ctx)}`;
    if (ex.kind === 'tuhfa') { const b = baytNumbers(q.answer)[0]; if (b) h += `<div>${playBtn('bayt:' + b, E.listenBayt)}</div>`; } // EX-11: first bayt reference
    h += '</div>';
  }
  h += `<div class="row"><button type="button" class="btn${open ? '' : ' show'}" data-open="${esc(q.id)}" aria-expanded="${open}">${esc(open ? E.hide : E.reveal)}</button>`;
  if (isGradable(q.type, 'exam')) {
    h += `<div class="grade" role="group" aria-label="${esc(E.gradeGroup)}">${['ok', 'mid', 'bad'].map(k => `<button type="button" class="g ${k}" data-g="${esc(q.id)}" data-v="${k}" aria-pressed="${g === k}">${esc(S.grades[k])}</button>`).join('')}</div>`;
  }
  return h + '</div></article>';
}

function randomRound() {
  const tuhfa = ex.kind === 'tuhfa';
  let h = `<div class="q"><div class="rand"><button type="button" class="btn show" data-act="roll">${esc(tuhfa ? E.randBayt : E.randAya)}</button>`;
  const r = st.rand;
  if (r && r.n) {
    h += `<div class="bignum">${n(r.n)}</div><span class="muted">${esc(tuhfa ? E.readBayt(n(r.n)) : E.readAya(n(r.n)))}</span>`;
    if (r.open) h += `<div class="ans"><div class="al"><span class="ref">${n(r.n)}</span><span class="tx">${refHtml(tuhfa ? `t:${r.n}` : `2:${r.n}`, corpus, { verseNums: false })}</span></div>${tuhfa ? playBtn('bayt:' + r.n, E.listenBayt) : ''}</div>`;
    else h += `<button type="button" class="btn" data-act="randShow">${esc(E.show)}</button>`;
  }
  return h + '</div></div>';
}

// «ما رقمها؟» drill: every verse/bayt of the exam, ten per batch, a miss comes back in the same batch.
// Not part of the exam score; the first answer per verse in a pass goes to the history (and so to «وِرد اليوم»).
const BATCH = 10;
const drillRef = num => (ex.kind === 'tuhfa' ? `t:${num}` : `2:${num}`);
function drillState() {
  if (!st.drill) { const [a, z] = entry.range; const deck = []; for (let x = a; x <= z; x++) deck.push(x); st.drill = { deck: shuffle(deck), done: 0, queue: [], batch: [], first: {}, tries: {}, pick: null, seed: newSession() }; }
  return st.drill;
}
function drillRound() {
  const t = ex.kind === 'tuhfa'; const d = drillState(); const N = d.deck.length;
  const firstOk = list => list.filter(x => d.first[x] === 'ok').length;
  if (!d.queue.length) {
    let h = '<div class="q drill">';
    if (d.batch.length) h += `<p class="banner ${firstOk(d.batch) === d.batch.length ? 'good' : ''}">${esc(E.drillBatch(n(firstOk(d.batch)), n(d.batch.length)))}</p>`;
    if (d.done >= N) {
      const missed = d.deck.filter(x => d.first[x] && d.first[x] !== 'ok').sort((x, y) => x - y);
      h += `<h3>${esc((t ? E.drillAllT : E.drillAll)(n(firstOk(d.deck)), n(N)))}</h3>`;
      if (missed.length) h += `<p class="muted">${esc(E.drillMissed)} ${missed.map(n).join('، ')}</p>`;
      h += `<div class="row"><button type="button" class="btn primary" data-act="drillAgain">${esc(E.drillAgain)}</button></div>`;
    } else {
      h += `<p class="muted">${esc((t ? E.drillLeftT : E.drillLeft)(n(N - d.done), n(N)))}</p><div class="row"><button type="button" class="btn primary" data-act="drillMore">${esc(d.done ? E.drillMore(n(Math.min(BATCH, N - d.done))) : E.drillStart(n(BATCH)))}</button></div>`;
    }
    return h + '</div>';
  }
  const num = d.queue[0]; const pick = d.pick; const [a, z] = entry.range;
  let h = `<article class="q drill${pick == null ? '' : pick === num ? ' r-ok' : ' r-bad'}"><div class="qtags"><span class="qn">${esc(E.drillInBatch(n(d.queue.length)))}</span></div>`;
  h += `<div class="ask">${esc(t ? E.drillAskBayt : E.drillAskAya)}</div><div class="prompt">${refHtml(drillRef(num), corpus, { verseNums: false })}</div>`;
  h += `<div class="choices" role="group" aria-label="${esc(E.drillChoose)}">${numberChoices(num, a, z, d.seed + ':' + num + ':' + ((d.tries[num] || 0) - (pick == null ? 0 : 1))  /* same choices before and after the tap */).map(c => `<button type="button" class="choice${pick != null && c === num ? ' right' : ''}${pick === c && c !== num ? ' wrong' : ''}" data-drill="${c}"${pick != null ? ' disabled' : ''} aria-pressed="${pick === c}">${n(c)}</button>`).join('')}</div>`;
  if (pick != null) {
    h += `<div class="drill-fb"><div class="bignum">${n(num)}</div><p>${esc(pick === num ? (t ? E.drillRightT : E.drillRight) : (t ? E.drillWrongT : E.drillWrong)(n(num)))}</p></div>`;
    h += `<div class="row"><button type="button" class="btn primary" data-act="drillNext">${esc(E.drillNext)}</button></div>`;
  }
  return h + '</article>';
}
async function drillPick(c) {
  const d = drillState(); const num = d.queue[0]; if (num == null || d.pick != null) return;
  d.pick = c; d.tries[num] = (d.tries[num] || 0) + 1;
  if (!d.first[num]) {
    d.first[num] = c === num ? 'ok' : 'bad';
    const t = ex.kind === 'tuhfa'; const ref = drillRef(num);
    writeGrade({ session, qid: `${entry.id}/which-number/${num}`, g: d.first[num], tool: 'exam', src: entry.id, type: 'which-number',
      snap: makeSnap({ ask: t ? E.drillAskBayt : E.drillAskAya, prompt: refText(ref, corpus), answerRefs: [ref], answer: n(num), unit: unit() }) });
  }
  await save(); renderRound(); ui.$('[data-act="drillNext"]')?.focus();
}
function drillAct(act) {
  const d = drillState();
  if (act === 'drillMore') { d.batch = d.deck.slice(d.done, d.done + BATCH); d.queue = d.batch.slice(); d.done += d.batch.length; d.pick = null; }
  else if (act === 'drillNext') { const num = d.queue.shift(); if (d.pick !== num) d.queue.push(num); d.pick = null; }
  else if (act === 'drillAgain') { st.drill = null; drillState(); }
}

function renderRound() {
  const r = ex.rounds.find(x => x.id === st.round) || ex.rounds[0];
  st.round = r.id;
  ui.$('#rintro').innerHTML = `<h2>${esc(r.title)}</h2><span class="muted">${esc(r.intro)}</span>`;
  let h;
  if (r.id === 'summary') h = summaryHtml();
  else if (r.id === 'random-number') h = randomRound();
  else if (r.id === 'which-number') h = drillRound();
  else h = roundQs(r.id).map(questionHtml).join('');
  const i = ex.rounds.indexOf(r), pv = ex.rounds[i - 1], nx = ex.rounds[i + 1];
  h += `<div class="roundnav">${pv ? `<button type="button" class="btn" data-round="${pv.id}" data-top="1">${esc(E.prev(pv.title))}</button>` : '<span></span>'}${nx ? `<button type="button" class="btn show" data-round="${nx.id}" data-top="1">${esc(E.next(nx.title))}</button>` : ''}</div>`;
  ui.$('#qs').innerHTML = h;
  ui.$('#qs').setAttribute('aria-labelledby', 'tab-' + r.id);
}

function slipLines() {
  const out = [];
  for (const r of ex.rounds) for (const q of roundQs(r.id)) {
    const g = st.grades[q.id]; if (g !== 'mid' && g !== 'bad') continue;
    const words = (q.prompt || []).map(it => itemText(it, corpus)).join(' ').replace(/…/g, '').trim().split(/\s+/).slice(0, 5).join(' ').replace(/(\s[\u06D6-\u06ED]+)+$/u, '');
    out.push({ g, q, text: E.slipLine(S.grades[g], r.title, unit(), answerNumbers(q).map(n).join('، '), words) });
  }
  return out;
}
function slips() {
  const l = slipLines();
  ui.$('#slipCount').textContent = l.length ? E.slipsCount(n(l.length)) : '';
  ui.$('#slips').innerHTML = l.length ? l.map(s => `<li><span class="who-tag${s.g === 'mid' ? ' m' : ''}">${esc(S.grades[s.g])}</span><span>${esc(s.text.slice(S.grades[s.g].length + 1))}</span></li>`).join('') : `<li class="muted">${esc(E.slipsEmpty)}</li>`;
  const box = ui.$('#resetBox');
  if (confirmReset && !box.innerHTML) ui.confirmInline(box, E.restartConfirm, E.restartYes, resetAttempt);
}

function render() { scoreLine(); tabs(); renderRound(); slips(); }

async function resetAttempt() {
  st.grades = {}; st.open = {}; st.rand = null; confirmReset = false;
  session = newSession(); st.session = session; st.startedAt = Date.now(); // DATA-41: reset starts a new session
  await save(); render();
}

function snapOf(q) {
  const ask = q.ask ? inlineText(q.ask, corpus) : '';
  const prompt = q.type === 'random-number' ? n(q.number) : (q.prompt || []).map(it => itemText(it, corpus)).join(' ');
  const answer = (q.answer || []).map(it => itemText(it, corpus)).join(' · ');
  return makeSnap({ ask, prompt, answerRefs: answerRefs(q), answer, unit: unit() });
}

function scrollToIntro() {
  const t = ui.$('#rintro'); t.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
function centerTab() {
  const c = ui.$('.rt[aria-selected="true"]'), bar = ui.$('#rounds'); if (!c || !bar) return;
  const cr = c.getBoundingClientRect(), br = bar.getBoundingClientRect();
  bar.scrollBy({ left: cr.left + cr.width / 2 - (br.left + br.width / 2), behavior: 'auto' });
}

function bind() {
  ui.$('#app').addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
    if (d.play) { // AUD-05: synchronous play inside the tap
      const cur = audio.state().item;
      if (cur?.key === d.play) { audio.stop(); syncPlayButtons(); return; }
      const it = col.byId.get(d.play);
      const bn = d.play.startsWith('bayt:') ? +d.play.slice(5) : null;
      audio.play({ key: d.play, it, title: bn ? S.listen.tBayt(n(bn), corpus.bayt(bn)[0]) : S.listen.tChapter(n(it.n), corpus.chapters[it.n - 1].name) });
      if (bn) ui.setTuhfaContext(bn);
      syncPlayButtons(); return;
    }
    if (d.round) {
      st.round = d.round; save(); render(); centerTab();
      if (d.top) scrollToIntro(); else ui.$('#rintro').scrollIntoView({ block: 'start' });
      return;
    }
    if (d.open) {
      st.open[d.open] = !st.open[d.open]; if (!st.open[d.open]) delete st.open[d.open];
      if (st.open[d.open] && ex.kind === 'tuhfa') { const b0 = baytNumbers(ex.byId.get(d.open).answer)[0]; if (b0) ui.setTuhfaContext(b0); }
      save(); renderRound(); ui.$(`[data-open="${CSS.escape(d.open)}"]`)?.focus(); return;
    }
    if (d.g) {
      const q = ex.byId.get(d.g); const prev = st.grades[d.g];
      const g = prev === d.v ? null : d.v;
      if (g) st.grades[d.g] = g; else delete st.grades[d.g];
      save(); scoreLine(); tabs(); renderRound(); slips();
      ui.$(`[data-g="${CSS.escape(d.g)}"][data-v="${d.v}"]`)?.focus();
      writeGrade({ session, qid: q.id, g, tool: 'exam', src: ex.entry.id, type: q.type, snap: g ? snapOf(q) : undefined });
      return;
    }
    if (d.drill) { await drillPick(+d.drill); return; }
    if (d.act === 'drillMore' || d.act === 'drillNext' || d.act === 'drillAgain') { drillAct(d.act); await save(); renderRound(); tabs(); ui.$('#qs .drill')?.scrollIntoView({ block: 'nearest' }); ui.$('#qs .choice, #qs [data-act]')?.focus({ preventScroll: true }); return; }
    if (d.act === 'roll') { const [a, z] = entry.range; let x; do { x = a + Math.floor(Math.random() * (z - a + 1)); } while (st.rand && x === st.rand.n && z > a); st.rand = { n: x, open: false }; }
    else if (d.act === 'randShow') { st.rand.open = true; if (ex.kind === 'tuhfa') ui.setTuhfaContext(st.rand.n); }
    else if (b.id === 'resetBtn') { confirmReset = true; ui.confirmInline(ui.$('#resetBox'), E.restartConfirm, E.restartYes, resetAttempt); return; }
    else if (b.id === 'copyBtn') {
      const txt = slipLines().map(s => s.text).join('\n') || E.slipsEmpty;
      if (await platform.copyText(txt)) ui.flash(b, S.copied); else platform.selectText(ui.$('#slips'));
      return;
    } else return;
    save(); renderRound();
  });
  ui.$('#rounds').addEventListener('keydown', e => {
    const k = { ArrowLeft: 1, ArrowRight: -1, Home: -999, End: 999 }[e.key]; if (k == null) return;
    e.preventDefault(); const i = ex.rounds.findIndex(r => r.id === st.round);
    const j = Math.max(0, Math.min(ex.rounds.length - 1, Math.abs(k) === 999 ? (k < 0 ? 0 : ex.rounds.length - 1) : i + k));
    st.round = ex.rounds[j].id; save(); render(); centerTab(); ui.$('#tab-' + st.round).focus();
  });
}

function notFound(msg) {
  ui.$('#head').innerHTML = `<h1 id="title">${esc(msg)}</h1>`;
  main.innerHTML = `<p><a class="btn" href="${href('')}">${esc(E.backHome)}</a></p>`;
}

(async () => {
  const id = new URLSearchParams(location.search).get('id');
  await ui.initPage({ keep: ['id'], notes: [] });
  const idx = await loadIndex().catch(() => null);
  entry = idx?.exams.find(e => e.id === id);
  if (!entry) return notFound(E.notFound); // IA-03
  if (entry.status !== 'published') return notFound(E.notPublished);
  try {
    [ex, corpus] = await Promise.all([loadExam(entry), loadCorpus()]);
    if (entry.kind === 'quran') meta = await loadMeta().catch(() => null);
  } catch (e) { console.error(e); return notFound(S.loadError); }
  ui.setNotes(entry.kind === 'tuhfa' ? ['tuhfa'] : ['quran']);
  if (entry.audio) col = await collection(entry.audio);
  key = 'exam:' + entry.id;
  gradable = ex.questions.filter(q => isGradable(q.type, 'exam')).map(q => q.id);
  st = Object.assign({ round: ex.rounds[0].id, grades: {}, open: {}, rand: null }, (await store.get(key)) || {});
  session = newSession(); st.session = session; st.startedAt ||= Date.now(); // one page load = one session (DATA-41)
  header();
  main.innerHTML = `<div class="score" id="score"></div>
    <nav class="rounds" role="tablist" id="rounds" aria-label="${esc(E.roundsLabel)}"></nav>
    <div class="rintro" id="rintro"></div>
    <section class="qs" id="qs" role="tabpanel"></section>
    <section class="panel"><div class="panel-head"><h2>${esc(E.slipsTitle)}</h2><span class="muted small" id="slipCount"></span></div>
      <ul class="slips" id="slips"></ul>
      <div class="row"><a class="btn" href="${href('history/')}">${esc(E.historyLink)}</a><button class="btn" type="button" id="copyBtn">${esc(E.copyList)}</button><button class="btn" type="button" id="resetBtn">${esc(E.restart)}</button></div>
      <div id="resetBox"></div></section>`;
  // IA-06: #q=<qid>
  const hq = /^#q=(.+)$/.exec(location.hash); const target = hq && ex.byId.get(decodeURIComponent(hq[1]));
  if (target) st.round = target.type;
  render(); bind(); centerTab();
  audio.on('change', syncPlayButtons);
  await save();
  requestAnimationFrame(() => {
    if (target) { const el = document.getElementById(qDom(target.id)); el?.scrollIntoView({ block: 'center' }); return; }
    // EX-14: restore and continue
    const qs = roundQs(st.round); const graded = qs.filter(q => st.grades[q.id]).length;
    if (!graded) return;
    const nx = qs.find(q => !st.grades[q.id]) || qs[qs.length - 1];
    const note = document.createElement('div'); note.className = 'muted small'; note.textContent = E.resumed(n(graded), n(qs.length));
    ui.$('#rintro').appendChild(note);
    setTimeout(() => document.getElementById(qDom(nx.id))?.scrollIntoView({ block: 'center' }), 50);
  });
  ui.onRefresh(async () => { const fresh = await store.get(key); if (fresh && fresh.updatedAt > st.updatedAt) { Object.assign(st, fresh, { session }); render(); } });
})();


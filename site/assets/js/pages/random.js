// Random exam «/random/» (RND-01…11). Uses the exam data files directly (RND-11).
import { S } from '../core/strings.ar.js';
import { esc, n } from '../core/fmt.js';
import { href } from '../core/base.js';
import * as store from '../core/store.js';
import * as ui from '../core/ui.js';
import { publishedExams, loadExam, loadCorpus, loadMeta, suraRubs, answerRefs } from '../core/content.js';
import { getType, isGradable } from '../core/registry.js';
import { inlineHtml, inlineText, itemText } from '../core/render.js';
import { grade as writeGrade, newSession, makeSnap } from '../core/grading.js';
import { buildPool, orderSet, shuffle, numberChoices, pickBalanced } from '../core/random-logic.js';
import { parseRef } from '../core/refs.js';
import { dueNow } from '../core/srs.js';
import { live } from '../core/stats.js';
import { soon } from '../core/fmt.js';

const R = S.random;
const main = ui.$('#main');
let exams = [], corpus, prefs, cur, meta = null, revealed = false, resumedNote = false;
// «وِرد اليوم»: the same page, fed by the questions that are due for review (srs.js) instead of a random draw.
const DUE = new URLSearchParams(location.search).has('due');
const CUR_KEY = DUE ? 'review:current' : 'random:current';
const DUE_MAX = 20;
let dueInfo = { due: [], nextAt: null, waiting: 0 };
const fam = e => (e.kind === 'tuhfa' ? 'tuhfa' : 'quran2');

function covered() { // RND-02: only verses covered by published Baqarah exams
  const q = new Set();
  exams.filter(e => e.entry.kind === 'quran').forEach(e => { for (let a = e.entry.range[0]; a <= e.entry.range[1]; a++) q.add(a); });
  return { quran2: [...q].sort((a, b) => a - b), tuhfa: Array.from({ length: 61 }, (_, i) => i + 1) };
}
const defaultRanges = () => { const c = covered(); return { quran2: [c.quran2[0] || 1, c.quran2[c.quran2.length - 1] || 1], tuhfa: [1, 61] }; };

function pool() {
  const sel = exams.filter(e => prefs.src.includes(e.entry.id));
  return buildPool(sel.map(e => ({ id: e.entry.id, kind: e.entry.kind, range: e.entry.range, questions: e.questions.filter(q => isGradable(q.type, 'random')) })), prefs.ranges);
}
function resolveQ(qid) {
  const m = /^(.+)\/(random|which)-number\/(\d+)$/.exec(qid);
  if (m) {
    const e = exams.find(x => x.entry.id === m[1]); if (!e) return null; const num = +m[3]; const t = e.entry.kind === 'tuhfa';
    const which = m[2] === 'which';
    return { id: qid, type: `${m[2]}-number`, src: m[1], kind: e.entry.kind, number: num, range: e.entry.range, ask: which ? (t ? R.whichBayt : R.whichAya) : (t ? R.askBayt(n(num)) : R.askAya(n(num))), prompt: which ? [{ ref: t ? `t:${num}` : `2:${num}` }] : [], answer: [{ ref: t ? `t:${num}` : `2:${num}` }] };
  }
  for (const e of exams) { const q = e.byId.get(qid); if (q) return q; }
  return null;
}

async function newSet() {
  if (DUE) {
    store.invalidate(); dueInfo = dueNow(live(await store.events()));
    const ids = dueInfo.due.map(x => x.qid).filter(id => resolveQ(id)).slice(0, DUE_MAX);
    cur = ids.length ? { set: ids, idx: 0, grades: ids.map(() => null), session: newSession(), startedAt: Date.now(), done: false, updatedAt: Date.now() } : null;
    revealed = false; resumedNote = false;
    if (cur) await store.set(CUR_KEY, cur); else await store.del(CUR_KEY);
    render(); return;
  }
  const p = pool();
  const picked = orderSet(shuffle(pickBalanced(p.questions.concat(p.generated), prefs.n))); // equal share per source
  cur = { set: picked.map(q => q.id), idx: 0, grades: picked.map(() => null), session: newSession(), startedAt: Date.now(), done: false, updatedAt: Date.now() };
  revealed = false; resumedNote = false; ctlOpen = false;
  await store.set(CUR_KEY, cur);
  render(); scrollTop();
}
const savePrefs = () => { prefs.updatedAt = Date.now(); return store.set('random:prefs', prefs); };
const saveCur = () => { cur.updatedAt = Date.now(); return store.set(CUR_KEY, cur); };
// Move to the question itself, not to the top of the page (the settings sit above it).
const scrollTop = () => ui.$('#play')?.scrollIntoView({ block: 'start' });
let ctlOpen = false; // the settings are folded while a set is in progress

function dueHead() {
  if (cur && cur.set.length) return `<p class="muted">${esc(R.dueIntro)}</p>`;
  return `<section class="panel"><h2>${esc(R.dueNone)}</h2><p>${esc(dueInfo.nextAt ? R.dueNext(n(dueInfo.waiting), soon(dueInfo.nextAt, S.days)) : R.dueEmpty)}</p><div class="row"><a class="btn primary" href="${href('random/')}">${esc(S.titles.random)}</a><a class="btn" href="${href('history/')}">${esc(R.historyLink)}</a></div></section>`;
}

function controls() {
  if (DUE) return dueHead();
  const c = covered();
  const fams = [...new Set(exams.filter(e => prefs.src.includes(e.entry.id)).map(fam))];
  const active = !!(cur && cur.set.length);
  const sum = fams.map(f => `${f === 'tuhfa' ? R.famTuhfa : R.famQuran} ${n(prefs.ranges[f][0])}–${n(prefs.ranges[f][1])}`).join(' · ');
  let h = active ? `<details class="panel" id="ctl"${ctlOpen ? ' open' : ''}><summary><span>${esc(R.settings)} <span class="muted small">${esc(sum)}</span></span></summary>` : `<section class="panel">`;
  h += `<h2${active ? ' class="sr-only"' : ''}>${esc(R.sources)}</h2><div class="chips">${exams.map(e => `<button type="button" class="chip" data-src="${e.entry.id}" aria-pressed="${prefs.src.includes(e.entry.id)}">${esc(e.entry.short)} <span class="sub">${esc(e.entry.sub)}</span></button>`).join('')}</div>`;
  for (const f of fams) {
    const opts = c[f]; const [a, b] = prefs.ranges[f];
    const label = f === 'tuhfa' ? R.rangeTuhfa : R.rangeQuran;
    const quick = f === 'tuhfa'
      ? [[R.allTuhfa, 1, 61], ...corpus.chapters.map(ch => [ch.short, ch.from, ch.to])]
      : [[R.allQuran, opts[0], opts[opts.length - 1]], ...(meta ? suraRubs(meta, 2).filter(r => opts.includes(r.from)).map(r => [R.rub(n(r.n)), r.from, Math.min(r.to, opts[opts.length - 1])]) : [])];
    h += `<div class="stack"><b>${esc(label)}</b><div class="rng"><label for="from-${f}">${esc(R.from)}</label><select id="from-${f}" data-from="${f}" aria-label="${esc(R.fromLabel)}">${opts.map(v => `<option value="${v}"${v === a ? ' selected' : ''}>${n(v)}</option>`).join('')}</select>
      <label for="to-${f}">${esc(R.to)}</label><select id="to-${f}" data-to="${f}" aria-label="${esc(R.toLabel)}">${opts.map(v => `<option value="${v}"${v === b ? ' selected' : ''}>${n(v)}</option>`).join('')}</select></div>
      <div class="chips">${quick.map(([t, x, y]) => `<button type="button" class="chip" data-quick="${f}" data-a="${x}" data-b="${y}" aria-pressed="${x === a && y === b}">${esc(t)}</button>`).join('')}</div></div>`;
  }
  const p = pool(); const avail = p.questions.length + p.generated.length;
  h += `<div class="stack"><b>${esc(R.sizeLabel)}</b><div class="chips">${[10, 15, 25].map(k => `<button type="button" class="chip" data-size="${k}" aria-pressed="${prefs.n === k}">${n(k)}</button>`).join('')}</div>`;
  const none = !prefs.src.length;
  h += `<p class="muted small">${esc(none ? R.noSource : avail ? R.available(n(avail)) : R.empty)}</p>`;
  h += `<div class="row"><button type="button" class="btn primary" id="newSet"${none || !avail ? ' disabled' : ''}>${esc(R.newSet)}</button></div></div>${active ? '</details>' : '</section>'}`;
  return h;
}

function snapOf(q) {
  const unit = q.kind === 'tuhfa' ? S.units.tuhfa : S.units.quran;
  return makeSnap({ ask: q.ask ? inlineText(q.ask, corpus) : '', prompt: q.type === 'random-number' ? n(q.number) : (q.prompt || []).map(it => itemText(it, corpus)).join(' '), answerRefs: answerRefs(q), answer: (q.answer || []).map(it => itemText(it, corpus)).join(' · '), unit });
}

function questionView() {
  const N = cur.set.length; const i = cur.idx; const q = resolveQ(cur.set[i]);
  if (!q) return '';
  const e = exams.find(x => x.entry.id === q.src); const t = getType(q.type);
  const round = e?.rounds.find(r => r.id === q.type);
  const g = cur.grades[i] || '';
  let h = '';
  if (resumedNote && !DUE) h += `<p class="banner">${esc(R.resumed(n(cur.grades.filter(Boolean).length), n(N)))}</p>`;
  h += `<article class="q${g ? ' r-' + g : ''}" id="rq"><div class="qtags"><span class="qtag">${esc(e ? `${e.entry.short} · ${e.entry.sub}` : q.src)}</span><span class="qtag alt">${esc(round?.title || (t.choice ? (q.kind === 'tuhfa' ? R.whichTitleT : R.whichTitleQ) : q.type))}</span><span class="qn">${esc(R.qOf(n(i + 1), n(N)))}</span>${g ? `<span class="gradetag">· ${esc(S.grades[g])}</span>` : ''}</div>`;
  h += `<div class="ask">${q.ask ? inlineHtml(q.ask, corpus) : esc(round?.intro || '')}</div>`;
  h += t.render(q, { corpus });
  if (t.choice) {
    // multiple choice: a tap answers and grades the question; the choice is kept with the set
    const pick = cur.picks?.[i]; const fam2 = fam(e.entry); const lo = Math.max(q.range[0], prefs.ranges[fam2]?.[0] ?? q.range[0]), hi = Math.min(q.range[1], prefs.ranges[fam2]?.[1] ?? q.range[1]);
    const [a, b] = lo <= q.number && q.number <= hi && hi - lo >= 3 ? [lo, hi] : q.range;
    h += `<div class="choices" role="group" aria-label="${esc(R.choose)}">${numberChoices(q.number, a, b, cur.session + q.id).map(c => `<button type="button" class="choice${pick != null && c === q.number ? ' right' : ''}${pick === c && c !== q.number ? ' wrong' : ''}" data-pick="${c}"${pick != null ? ' disabled' : ''} aria-pressed="${pick === c}">${n(c)}</button>`).join('')}</div>`;
    if (pick != null) h += `<p class="banner ${pick === q.number ? 'good' : 'warn'}" role="status">${esc(pick === q.number ? R.pickRight : R.pickWrong(n(q.number)))}</p>`;
  } else {
  if (revealed) h += `<div class="ans"><div class="ans-h">${esc(S.exam.answerH)}</div>${t.answerView(q, { corpus })}</div>`;
  h += `<div class="row"><button type="button" class="btn${revealed ? '' : ' show'}" id="reveal" aria-expanded="${revealed}">${esc(revealed ? S.exam.hide : S.exam.reveal)}</button><div class="grade" role="group" aria-label="${esc(S.exam.gradeGroup)}">${['ok', 'mid', 'bad'].map(k => `<button type="button" class="g ${k}" data-g="${k}" aria-pressed="${g === k}">${esc(S.grades[k])}</button>`).join('')}</div></div></article>`;
  }
  h += `<div class="roundnav"><button type="button" class="btn" id="prev"${i === 0 ? ' disabled' : ''}>${esc(R.prev)}</button>${i < N - 1 ? `<button type="button" class="btn primary" id="next">${esc(R.next)}</button>` : `<button type="button" class="btn primary" id="result">${esc(R.result)}</button>`}</div>`;
  h += `<div class="pdots" aria-label="${esc(R.progress)}" role="img">${cur.grades.map((x, k) => `<i class="${x || ''}${k === i ? ' cur' : ''}"></i>`).join('')}</div>`;
  if (!DUE) h += `<div class="row"><button type="button" class="btn" id="newSet2">${esc(R.newSet)}</button></div>`;
  return h;
}

function results() {
  const c = { ok: 0, mid: 0, bad: 0 }; cur.grades.forEach(g => g && c[g]++);
  const bad = cur.set.map((id, k) => ({ q: resolveQ(id), g: cur.grades[k] })).filter(x => x.q && (x.g === 'mid' || x.g === 'bad'));
  return `<section class="panel"><h2>${esc(DUE ? R.dueDoneH : R.done)}</h2><p>${esc(R.counts(n(c.ok), n(c.mid), n(c.bad)))}</p>
    ${bad.length ? `<h3>${esc(R.reviewThese)}</h3><ul class="slips">${bad.map(x => `<li><span class="who-tag${x.g === 'mid' ? ' m' : ''}">${esc(S.grades[x.g])}</span><span>${esc(exams.find(e => e.entry.id === x.q.src)?.entry.short || '')}: ${esc(x.q.ask ? inlineText(x.q.ask, corpus) : (x.q.prompt || []).map(it => itemText(it, corpus)).join(' ').slice(0, 80))}</span></li>`).join('')}</ul>` : `<p>${esc(R.noMistakes)}</p>`}
    ${DUE ? `<p class="muted">${esc(R.dueDone)}</p>` : ''}
    <div class="row">${DUE ? `<a class="btn primary" href="${href('')}">${esc(S.home)}</a>` : `<button type="button" class="btn primary" id="newSet2">${esc(R.newSet)}</button>`}<button type="button" class="btn" id="again">${esc(R.restartReview)}</button><a class="btn" href="${href('history/')}">${esc(R.historyLink)}</a></div></section>`;
}

function render() {
  main.innerHTML = controls() + `<div id="play" class="stack">${cur && cur.set.length ? (cur.done ? results() : questionView()) : ''}</div>`;
}

function bind() {
  main.addEventListener('toggle', e => { if (e.target.id === 'ctl') ctlOpen = e.target.open; }, true);
  main.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return; const d = b.dataset;
    if (d.src) { prefs.src = prefs.src.includes(d.src) ? prefs.src.filter(x => x !== d.src) : exams.map(x => x.entry.id).filter(x => x === d.src || prefs.src.includes(x)); }
    else if (d.quick) { prefs.ranges[d.quick] = [+d.a, +d.b]; }
    else if (d.size) { prefs.n = +d.size; }
    else if (b.id === 'newSet' || b.id === 'newSet2') { await newSet(); return; }
    else if (b.id === 'reveal') { revealed = !revealed; render(); ui.$('#reveal')?.focus(); return; }
    else if (d.g) {
      const q = resolveQ(cur.set[cur.idx]); const prev = cur.grades[cur.idx]; const g = prev === d.g ? null : d.g;
      cur.grades[cur.idx] = g; await saveCur(); render(); ui.$(`[data-g="${d.g}"]`)?.focus();
      writeGrade({ session: cur.session, qid: q.id, g, tool: DUE ? 'review' : 'random', src: q.src, type: q.type, snap: g ? snapOf(q) : undefined });
      return;
    }
    else if (d.pick) {
      const q = resolveQ(cur.set[cur.idx]); const pick = +d.pick; const g = pick === q.number ? 'ok' : 'bad';
      cur.picks = { ...(cur.picks || {}), [cur.idx]: pick }; cur.grades[cur.idx] = g; await saveCur(); render(); ui.$('#next, #result')?.focus();
      writeGrade({ session: cur.session, qid: q.id, g, tool: DUE ? 'review' : 'random', src: q.src, type: q.type, snap: snapOf(q) });
      return;
    }
    else if (b.id === 'prev') { cur.idx = Math.max(0, cur.idx - 1); revealed = false; resumedNote = false; await saveCur(); render(); scrollTop(); return; }
    else if (b.id === 'next') { cur.idx = Math.min(cur.set.length - 1, cur.idx + 1); revealed = false; resumedNote = false; await saveCur(); render(); scrollTop(); return; }
    else if (b.id === 'result') { cur.done = true; resumedNote = false; await saveCur(); render(); ui.$('#play')?.scrollIntoView({ block: 'start' }); return; }
    else if (b.id === 'again') { cur.done = false; cur.idx = 0; revealed = false; await saveCur(); render(); scrollTop(); return; }
    else return;
    await savePrefs(); render();
  });
  main.addEventListener('change', async e => {
    const t = e.target; const f = t.dataset.from || t.dataset.to; if (!f) return;
    let [a, b] = prefs.ranges[f]; const v = +t.value;
    if (t.dataset.from) { a = v; if (a > b) b = a; } else { b = v; if (b < a) a = b; } // RND-02
    prefs.ranges[f] = [a, b]; await savePrefs(); render(); ui.$('#' + t.id)?.focus();
  });
}

(async () => {
  await ui.initPage({ notes: ['quran', 'tuhfa'], keep: ['due'] });
  if (DUE) { ui.$('#title').textContent = S.titles.due; document.title = S.titles.due; }
  try {
    const entries = await publishedExams();
    [corpus, meta] = await Promise.all([loadCorpus(), loadMeta().catch(() => null)]);
    exams = (await Promise.all(entries.map(e => loadExam(e).catch(() => null)))).filter(Boolean);
    const d = defaultRanges();
    prefs = Object.assign({ src: exams.map(e => e.entry.id), n: 15, ranges: d }, (await store.get('random:prefs')) || {});
    prefs.src = prefs.src.filter(id => exams.some(e => e.entry.id === id));
    prefs.ranges = { ...d, ...prefs.ranges };
    cur = await store.get(CUR_KEY);
    if (cur && cur.set.some(id => !resolveQ(id))) cur = null;
    // «وِرد اليوم»: continue today's unfinished round; otherwise draw what is due now
    if (DUE && cur && (cur.done || new Date(cur.startedAt).toDateString() !== new Date().toDateString())) cur = null;
    bind();
    if (!cur) await newSet(); // RND-06: a set is built automatically on the first visit
    else { resumedNote = !cur.done && (cur.idx > 0 || cur.grades.some(Boolean)); render(); }
    ui.onRefresh(async () => { const c = await store.get(CUR_KEY); if (c && c.updatedAt > (cur?.updatedAt || 0)) { cur = c; render(); } });
  } catch (e) { console.error(e); main.innerHTML = `<p class="banner warn">${esc(S.loadError)}</p>`; }
  void parseRef;
})();

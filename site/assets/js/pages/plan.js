// Plan «/plan/» (PL-01…15).
import { S } from '../core/strings.ar.js';
import { esc, n } from '../core/fmt.js';
import * as store from '../core/store.js';
import * as ui from '../core/ui.js';
import { loadPlan, loadMeta, loadRubOpenings, loadCorpus, suraRubs } from '../core/content.js';
import { refText } from '../core/render.js';
import * as P from '../core/plan-logic.js';

const KEY = 'plan:baqarah';
const main = ui.$('#main');
let plan, rubs, openings = {}, corpus, s, sel = P.todayIdx(), confirming = false;
const T = S.plan;

const rub = r => rubs.find(x => x.n === r);
const phrase = r => (openings[r] ? refText(openings[r], corpus) : T.rubLabel(n(r)));
const save = () => { s.updatedAt = Date.now(); return store.set(KEY, s); };

function task(key, mainTxt, sub, quran = false) {
  const on = !!s.week.checks[key];
  return `<label class="task${on ? ' checked' : ''}"><input type="checkbox" data-k="${esc(key)}"${on ? ' checked' : ''}><span class="t"><span class="main${quran ? ' q' : ''}">${esc(mainTxt)}</span>${sub ? `<span class="muted small">${esc(sub)}</span>` : ''}</span></label>`;
}

function renderDay() {
  const d = sel, w = s.week, today = P.todayIdx();
  const [ra, rb] = P.pairRubs(s.pair);
  const t = plan.targets[d];
  const labels = d === 6 ? plan.repLabels.friday : plan.repLabels.week;
  let h = `<div class="day-head"><h2>${esc(T.days[d])}${d === today ? ` <span class="tag">· ${esc(T.today)}</span>` : ''}</h2><span class="muted small">${P.dayDone(s, d, plan.targets) ? esc(T.dayDone) : ''}</span></div>`;
  if (d === 0 && P.liveMistakes(s).length) h += `<div class="dsec"><div class="dsec-title"><span>${esc(T.mistakesSec)}</span></div>${task('d0:mist', plan.dayTasks.mistakes.title, P.liveMistakes(s).map(m => m.text).join(' · '))}</div>`;
  h += `<div class="dsec"><div class="dsec-title"><span>${esc(T.tasbeet)}</span><span class="tag">${esc(T.repsOf(n(Math.min(w.reps[d], t)), n(t)))}</span></div><div class="reps">`;
  labels.forEach((l, j) => { const on = w.reps[d] > j; h += `<button type="button" class="rep" data-rep="${j}" aria-pressed="${on}"><b>${on ? '✓' : n(j + 1)}</b>${esc(l)}</button>`; });
  h += '</div>';
  if (d === 5) h += `<div class="hint">${esc(plan.dayTasks.thursdayHint)}</div>`;
  if (d < 6) {
    h += `<div class="muted small">${esc(plan.dayTasks.noMushaf)}</div>`;
    h += task(`d${d}:join`, plan.dayTasks.join.title, plan.dayTasks.join.sub.replace('{a}', phrase(ra)).replace('{b}', phrase(rb)));
  }
  h += '</div>';
  if (d === 6) {
    h += `<div class="dsec"><div class="dsec-title"><span>${esc(T.session)}</span></div>`;
    plan.fridayTasks.forEach(f => { h += task(f.id, f.title, f.sub); });
    h += `<div class="small">${esc(T.cleanQ)}</div><div class="chips"><button type="button" class="chip" data-clean="1" aria-pressed="${w.clean === true}">${esc(T.cleanYes)}</button><button type="button" class="chip bad" data-clean="0" aria-pressed="${w.clean === false}">${esc(T.cleanNo)}</button></div>`;
    h += `<div class="muted small">${esc(T.afterSession)}</div></div>`;
  }
  const rv = P.reviewFor(s.pair, d);
  if (rv.length) {
    h += `<div class="dsec"><div class="dsec-title"><span>${esc(T.review)}</span><span class="tag">${esc(T.reviewTag)}</span></div>`;
    rv.forEach(r => { const x = rub(r); h += task(`d${d}:rv${r}`, phrase(r), T.rubLine(n(r), n(x.from), n(x.to)), !!openings[r]); });
    h += '</div>';
  }
  ui.$('#day').innerHTML = h;
}

function render() {
  const [r1, r2] = P.pairRubs(s.pair);
  const { x, y } = P.planTotals(s, plan.targets);
  ui.$('#weekLabel').textContent = T.week(n(s.pair));
  ui.$('#pairLine').textContent = `۞ ${phrase(r1)} · ۞ ${phrase(r2)}`;
  ui.$('#ringNum').textContent = n(x);
  ui.$('#ring').setAttribute('aria-label', `${T.ringAria}: ${T.ringLabel(n(x))}`);
  ui.$('#ringBar').setAttribute('stroke-dashoffset', (251.3 * (1 - x / 20)).toFixed(1));
  const today = P.todayIdx();
  ui.$('#days').innerHTML = T.days.map((d, i) => `<button type="button" role="tab" id="tab-${i}" aria-controls="day" class="day-tab${i === today ? ' today' : ''}${P.dayDone(s, i, plan.targets) ? ' done' : ''}" aria-selected="${i === sel}" tabindex="${i === sel ? 0 : -1}" data-day="${i}"><span class="long">${esc(d)}</span><span class="short">${esc(T.daysShort[i])}</span><span class="dot" aria-hidden="true"></span></button>`).join('');
  ui.$('#day').setAttribute('aria-labelledby', 'tab-' + sel);
  renderDay();

  const b = ui.$('#banner'); let bh = '';
  const last = s.history[s.history.length - 1];
  if (last && last.clean === false) bh += `<div class="banner warn"><span>${esc(T.weakBanner)}</span></div>`; // PL-10
  if (P.showSaturdayBanner(s, new Date(), plan.fridayTasks.map(f => f.id)) && s.done.length < 10) bh += `<div class="banner"><span class="grow">${esc(T.satBanner)}</span><button type="button" class="btn primary small" data-sat="go">${esc(T.satGo)}</button><button type="button" class="btn small" data-sat="no">${esc(T.satDismiss)}</button></div>`; // PL-15
  b.innerHTML = bh;

  const cur = P.pairRubs(s.pair);
  ui.$('#map').innerHTML = rubs.map(r => { const p = Math.ceil(r.n / 2); const c = cur.includes(r.n) ? 'cur' : s.done.includes(p) ? 'done' : ''; const st = c === 'cur' ? T.stCur : c === 'done' ? T.stDone : T.stNext; return `<div class="cell ${c}"><b>${n(r.n)}</b>${n(r.from)}–${n(r.to)}<span class="st">${esc(st)}</span></div>`; }).join('');
  ui.$('#mapCount').textContent = T.mapCount(n(y));
  const nb = ui.$('#nextBox');
  if (s.done.length >= 10 && new Set(s.done).size >= 10) nb.innerHTML = `<div class="banner good"><span>${esc(T.allDone)}</span></div>`; // PL-11
  else if (confirming) { const np = (s.pair % 10) + 1; nb.innerHTML = `<div class="confirm"><span>${esc(T.nextConfirm(n(r1), n(r2), n(2 * np - 1), n(2 * np)))}</span><div class="row"><button class="btn primary" type="button" data-next="yes">${esc(T.nextYes)}</button><button class="btn" type="button" data-next="no">${esc(S.undo)}</button></div></div>`; }
  else nb.innerHTML = `<button class="btn primary" type="button" data-next="ask">${esc(T.nextAsk)}</button>`;

  const ms = P.liveMistakes(s);
  ui.$('#mList').innerHTML = ms.length ? ms.map(m => `<li><span>${esc(m.text)}</span><button type="button" aria-label="${esc(T.del)}" data-del="${esc(m.id)}">×</button></li>`).join('') : `<li class="empty">${esc(T.noMistakes)}</li>`;
  ui.$('#pairSel').innerHTML = Array.from({ length: 10 }, (_, k) => { const p = k + 1, [a, c] = P.pairRubs(p); return `<option value="${p}"${p === s.pair ? ' selected' : ''}>${esc(T.pairOption(n(p), n(a), n(c)))} (${esc(phrase(a))} / ${esc(phrase(c))})</option>`; }).join('');
}

function skeleton() {
  ui.$('#head').innerHTML = `<div class="plan-head"><div class="txt"><span class="muted small" id="weekLabel"></span><h1 id="title">${esc(S.titles.plan)}</h1><div class="pair-line" id="pairLine"></div></div>
    <div class="ring" id="ring" role="img"><svg viewBox="0 0 96 96" aria-hidden="true"><circle class="track" cx="48" cy="48" r="40" stroke-width="8"/><circle class="barc" id="ringBar" cx="48" cy="48" r="40" stroke-width="8" stroke-dasharray="251.3" stroke-dashoffset="251.3"/></svg><div class="num2" aria-hidden="true"><b id="ringNum">٠</b><span>${esc(T.ring)}</span></div></div></div>`;
  main.innerHTML = `<div id="banner" class="stack"></div>
  <div class="days" role="tablist" id="days" aria-label="${esc(T.tasbeet)}"></div>
  <section class="day" id="day" role="tabpanel"></section>
  <section class="panel"><div class="panel-head"><h2>${esc(T.mistakesTitle)}</h2><span class="tag">${esc(T.mistakesTag)}</span></div>
    <form class="addrow" id="mForm"><input type="text" id="mInput" placeholder="${esc(T.mistakePh)}" aria-label="${esc(T.mistakeLabel)}" maxlength="200"><button class="btn primary" type="submit">${esc(T.add)}</button></form>
    <ul class="mlist" id="mList"></ul></section>
  <section class="panel" id="mapPanel"><div class="panel-head"><h2>${esc(T.map)}</h2><span class="tag" id="mapCount"></span></div>
    <div class="map" id="map"></div>
    <div class="legend"><span><i class="done"></i>${esc(T.stDone)}</span><span><i class="cur"></i>${esc(T.stCur)}</span><span><i></i>${esc(T.stNext)}</span></div>
    <div id="nextBox"></div></section>
  <details class="panel" id="settings"><summary>${esc(T.settings)}</summary>
    <div class="field"><label for="pairSel">${esc(T.pairLabel)}</label><select id="pairSel"></select></div></details>
  <section class="panel"><h2>${esc(T.rules)}</h2><ol class="rules">${plan.rules.map(r => `<li>${esc(r)}</li>`).join('')}</ol></section>`;
}

function bind() {
  ui.$('#app').addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return; const d = t.dataset;
    if (d.day) { sel = +d.day; render(); ui.$('#tab-' + sel)?.focus(); return; }
    if (d.rep) { s.week.reps[sel] = P.tapRep(s.week.reps[sel], +d.rep); }
    else if (d.clean) { const v = d.clean === '1'; s.week.clean = s.week.clean === v ? null : v; }
    else if (d.del) { const m = s.mistakes.find(x => x.id === d.del); if (m) { m.deleted = true; m.updatedAt = Date.now(); } }
    else if (d.next === 'ask') { confirming = true; render(); ui.$('#nextBox button')?.focus(); return; }
    else if (d.next === 'no') { confirming = false; render(); return; }
    else if (d.next === 'yes') { s = P.advance(s); confirming = false; sel = 0; }
    else if (d.sat === 'go') { confirming = true; render(); ui.$('#mapPanel').scrollIntoView({ block: 'center' }); ui.$('#nextBox button')?.focus(); return; }
    else if (d.sat === 'no') { s.week.satBannerDismissed = P.saturdayKey(); }
    else return;
    save(); render();
  });
  ui.$('#days').addEventListener('keydown', e => { // ARIA tabs pattern (RTL: ArrowLeft = next)
    const k = { ArrowLeft: 1, ArrowRight: -1, Home: -99, End: 99 }[e.key]; if (k == null) return;
    e.preventDefault(); sel = Math.max(0, Math.min(6, k === -99 ? 0 : k === 99 ? 6 : sel + k)); render(); ui.$('#tab-' + sel).focus();
  });
  ui.$('#app').addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.k) { s.week.checks[t.dataset.k] = t.checked; save(); render(); }
    else if (t.id === 'pairSel') { s.pair = +t.value; save(); render(); } // PL-12: mistakes kept
  });
  ui.$('#mForm').addEventListener('submit', e => {
    e.preventDefault(); const inp = ui.$('#mInput'); const v = inp.value.trim();
    if (v) { s.mistakes.push({ id: store.uuid(), text: v, deleted: false, updatedAt: Date.now() }); inp.value = ''; save(); render(); }
  });
}

(async () => {
  await ui.initPage({ notes: ['quran'] });
  try {
    [plan, corpus] = await Promise.all([loadPlan(), loadCorpus(['quran'])]);
    const meta = await loadMeta();
    rubs = suraRubs(meta, plan.sura).filter(r => r.n >= plan.rubs[0] && r.n <= plan.rubs[1]);
    try { const o = await loadRubOpenings(); (o[String(plan.sura)] || []).forEach(x => { openings[x.rub] = x.ref; }); } catch { /* no Quran text yet */ }
    if (!corpus.quran) openings = {};
    s = Object.assign(P.freshPlan(), (await store.get(KEY)) || {});
    s.week = Object.assign(P.freshWeek(), s.week || {});
    skeleton(); bind(); render();
    ui.onRefresh(async () => { s = Object.assign(P.freshPlan(), (await store.get(KEY)) || {}); s.week = Object.assign(P.freshWeek(), s.week); render(); });
  } catch (e) { console.error(e); main.innerHTML = `<p class="banner warn">${esc(S.loadError)}</p>`; }
})();

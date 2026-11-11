// History «سجلي» «/history/» (HIS-01…11). One store for every tool.
import { S } from '../core/strings.ar.js';
import { esc, n, npct, time, fullDate, dayMonth } from '../core/fmt.js';
import { href } from '../core/base.js';
import * as store from '../core/store.js';
import * as ui from '../core/ui.js';
import * as platform from '../core/platform.js';
import { loadIndex, loadExam, loadCorpus, loadRoundTypes } from '../core/content.js';
import { getType } from '../core/registry.js';
import { inlineHtml, refHtml } from '../core/render.js';
import { parseRef } from '../core/refs.js';
import { live, tiles, strengths, needsReview, byType, byDay } from '../core/stats.js';

const H = S.history;
const main = ui.$('#main');
let exams = new Map(), entries = [], corpus, rt, filter = 'all', confirmClear = false;

const srcName = src => entries.find(e => e.id === src)?.short || src;
const typeName = (type, src) => { const t = rt.types.find(x => x.id === type); const kind = entries.find(e => e.id === src)?.kind === 'tuhfa' ? 'tuhfa' : 'quran'; return t ? (t.title[kind] || t.title.quran || t.title.tuhfa) : type; };
const findQ = (qid, src) => exams.get(src)?.byId.get(qid) || null;
const unitOf = e => e.snap?.unit || (entries.find(x => x.id === e.src)?.unit) || '';
// Verse / bayt numbers of a list of refs (HIS-08): never a word index or a hemistich number.
const refsText = refs => [...new Set((refs || []).map(r => { try { const p = parseRef(r); return p.kind === 't' ? p.bayt : p.aya; } catch { return null; } }).filter(x => x != null))].map(n).join('، ');

function reviewItem(r) {
  const e = r.last; const q = findQ(r.qid, e.src) || (r.qid.includes('/random-number/') ? null : null);
  const known = !!findQ(r.qid, e.src) || /\/((random|which)-number|first-letters|progressive-hide)\/\d+$/.test(r.qid) && exams.has(e.src);
  const old = !known;
  let body = '';
  if (q && !old) {
    const t = getType(q.type);
    body = `${q.ask ? `<div class="ask">${inlineHtml(q.ask, corpus)}</div>` : ''}${t.render(q, { corpus })}<div class="ans">${t.answerView(q, { corpus })}</div>`;
  } else {
    const s = e.snap || {};
    body = `${s.ask ? `<div class="ask">${esc(s.ask)}</div>` : ''}${s.prompt ? `<div>${esc(s.prompt)}</div>` : ''}${s.answer ? `<div class="ans"><div class="al"><span class="ref">${esc(refsText(s.answerRefs))}</span><span class="tx">${/random-number/.test(r.qid) && s.answerRefs?.[0] ? refHtml(s.answerRefs[0], corpus) : esc(s.answer)}</span></div></div>` : ''}`;
  }
  const link = q && !old ? ` · <a href="${href(`exam/?id=${encodeURIComponent(e.src)}#q=${encodeURIComponent(r.qid)}`)}">${esc(H.open)}</a>` : '';
  return `<div class="rv"><div class="qtags"><span class="qtag">${esc(srcName(e.src))}</span><span class="qtag alt">${esc(typeName(e.type, e.src))}</span>${old ? `<span class="qtag">${esc(H.old)}</span>` : ''}${getType(e.type)?.choice ? `<span class="qtag">${esc(H.auto)}</span>` : ''}</div>
    <span class="muted small">${esc(H.lastTime(S.grades[e.g], fullDate(e.t)))} · ${esc(H.tally(n(r.counts.ok), n(r.counts.mid), n(r.counts.bad)))}${link}</span>${body}</div>`;
}

async function render() {
  store.invalidate();
  const all = live(await store.events());
  const sources = [...new Set(all.map(e => e.src))];
  if (filter !== 'all' && !sources.includes(filter)) filter = 'all';
  ui.setNotes([...new Set(sources.map(s => entries.find(e => e.id === s)?.kind === 'tuhfa' ? 'tuhfa' : 'quran'))]); // GEN-08
  const ev = filter === 'all' ? all : all.filter(e => e.src === filter);
  if (!all.length) { main.innerHTML = `<section class="panel"><h2>${esc(H.emptyTitle)}</h2><p class="muted">${esc(H.emptyText)}</p></section>`; return; } // HIS-11
  let h = '';
  if (sources.length >= 2) h += `<div class="chips" role="group" aria-label="${esc(H.filter)}">${['all', ...sources].map(s => `<button type="button" class="chip" data-f="${esc(s)}" aria-pressed="${filter === s}">${esc(s === 'all' ? H.all : srcName(s))}</button>`).join('')}</div>`;
  const t = tiles(ev);
  h += `<div class="tiles"><div class="tile"><b>${n(t.n)}</b><span>${esc(H.answers('').trim())}</span></div><div class="tile"><b>${npct(t.ok, t.n)}٪</b><span>${esc(S.grades.ok)}</span></div><div class="tile"><b>${n(t.mastered)}</b><span>${esc(H.mastered('').trim())}</span></div><div class="tile"><b>${n(t.days)}</b><span>${esc(H.days(n(t.days)).replace(n(t.days), '').trim())}</span></div></div>`;
  const st = strengths(ev);
  h += `<section class="panel"><h2>${esc(H.strengths)}</h2>${st.length ? `<ul class="slips">${st.map(x => `<li><span class="qtag">${esc(srcName(x.src))}</span><span>${esc(typeName(x.type, x.src))} · ${n(Math.round(x.rate * 100))}٪ · ${n(x.n)}</span></li>`).join('')}</ul>` : `<p class="muted small">${esc(H.strengthsEmpty)}</p>`}</section>`;
  const rv = needsReview(ev);
  h += `<section class="panel"><div class="panel-head"><h2>${esc(H.review)}</h2><span class="tag">${esc(H.reviewCount(n(rv.length)))}</span></div>`;
  h += rv.length ? rv.slice(0, 30).map(reviewItem).join('') + (rv.length > 30 ? `<p class="muted small">${esc(H.reviewMore)}</p>` : '') : `<p>${esc(H.reviewNone)}</p>`;
  h += '</section>';
  const bt = byType(ev);
  h += `<section class="panel"><h2>${esc(H.byType)}</h2><div class="legend"><span><i class="sw ok"></i>${esc(S.grades.ok)}</span><span><i class="sw mid"></i>${esc(S.grades.mid)}</span><span><i class="sw bad"></i>${esc(S.grades.bad)}</span></div>`;
  for (const [src, rows] of bt) {
    h += `<h3>${esc(srcName(src))}</h3>` + rows.map(r => `<div class="trow"><span class="lbl">${esc(typeName(r.type, src))}</span><span class="stack-bar" role="img" aria-label="${esc(`${S.grades.ok} ${n(r.ok)} · ${S.grades.mid} ${n(r.mid)} · ${S.grades.bad} ${n(r.bad)}`)}"><i class="ok" data-w="${(r.ok / r.n) * 100}"></i><i class="mid" data-w="${(r.mid / r.n) * 100}"></i><i class="bad" data-w="${(r.bad / r.n) * 100}"></i></span><span class="small">${esc(H.typeRow(n(Math.round(r.rate * 100)), n(r.n)))}</span></div>`).join('');
  }
  h += '</section>';
  const days = byDay(ev);
  h += `<section class="panel"><h2>${esc(H.full)}</h2>${days.map((d, i) => `<details class="daygroup"${i === 0 ? ' open' : ''}><summary><b>${esc(fullDate(d.t))}</b><span class="muted small">${esc(H.dayHead(n(d.events.length), npct(d.ok, d.events.length)))}</span></summary>${d.events.map(e => { const s = e.snap || {}; const line = (s.ask || s.prompt || '').slice(0, 70); return `<div class="evline"><span class="gl ${e.g}">${esc(S.grades[e.g])}</span><span class="muted">${esc(time(e.t))}</span><span>${esc(srcName(e.src))} · ${esc(typeName(e.type, e.src))}</span><span class="grow">${esc(line)}</span></div>`; }).join('')}</details>`).join('')}</section>`;
  h += `<div class="row"><button type="button" class="btn" id="copy">${esc(H.copy)}</button><button type="button" class="btn danger" id="clear">${esc(H.clear)}</button></div><div id="clearBox"></div>`;
  main.innerHTML = h;
  main.querySelectorAll('[data-w]').forEach(i => i.style.setProperty('--w', (+i.dataset.w).toFixed(1) + '%')); // CSSOM only (NFR-PRV-04)
  void dayMonth; void confirmClear;
}

function summaryText(ev) {
  const t = tiles(ev); const st = strengths(ev); const rv = needsReview(ev).slice(0, 30);
  return [H.sumLine1(n(t.n), npct(t.ok, t.n)), H.sumLine2(st.map(x => `${srcName(x.src)} · ${typeName(x.type, x.src)}`).join('، ') || '—'), H.sumLine3,
    ...rv.map(r => H.sumItem(srcName(r.last.src), typeName(r.last.type, r.last.src), unitOf(r.last), refsText(r.last.snap?.answerRefs)))].join('\n');
}

(async () => {
  await ui.initPage({ notes: [] });
  try {
    const idx = await loadIndex();
    entries = idx.exams;
    [corpus, rt] = await Promise.all([loadCorpus(), loadRoundTypes()]);
    for (const e of entries.filter(x => x.status === 'published')) { try { exams.set(e.id, await loadExam(e)); } catch { /* missing data: snapshots are used */ } }
    await render();
  } catch (e) { console.error(e); main.innerHTML = `<p class="banner warn">${esc(S.loadError)}</p>`; return; }
  main.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.f) { filter = b.dataset.f; await render(); return; }
    if (b.id === 'copy') { const ev = live(await store.events()); const txt = summaryText(filter === 'all' ? ev : ev.filter(x => x.src === filter)); if (await platform.copyText(txt)) ui.flash(b, S.copiedM); return; }
    if (b.id === 'clear') { ui.confirmInline(ui.$('#clearBox'), H.clearConfirm, H.clearYes, async () => { await store.clearEvents(); await render(); }); }
  });
  ui.onRefresh(render);
})();

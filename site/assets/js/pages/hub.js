// Hub «/» (HUB-01…09, §2.2).
import { S } from '../core/strings.ar.js';
import { esc, n, npct, when, soon } from '../core/fmt.js';
import { href, url, config } from '../core/base.js';
import * as store from '../core/store.js';
import * as ui from '../core/ui.js';
import * as platform from '../core/platform.js';
import * as swc from '../core/sw-client.js';
import { loadIndex, loadExam } from '../core/content.js';
import { isGradable } from '../core/registry.js';
import { attemptTally, live } from '../core/stats.js';
import { collection, cachedCount } from '../core/audio-cache.js';
import { planTotals } from '../core/plan-logic.js';
import { dueNow } from '../core/srs.js';

const main = ui.$('#main');
const card = (link, num, numCls, title, sub, key) =>
  `<li><a class="card" href="${href(link)}"><span class="num${numCls}" aria-hidden="true">${num}</span><span class="t"><b>${esc(title)}</b><span class="s">${esc(sub)}</span><span class="prg" data-prg="${esc(key)}" hidden></span></span><span class="arrow" aria-hidden="true">←</span></a></li>`;

async function render() {
  const [idx, cfg] = await Promise.all([loadIndex(), config()]);
  const audioOn = !!cfg.audio?.enabled;
  const exams = idx.exams;
  const quran = exams.filter(e => e.kind === 'quran');
  const tuhfa = exams.filter(e => e.kind === 'tuhfa');
  const pub = l => l.filter(e => e.status === 'published');
  const soon = l => l.filter(e => e.status === 'soon');
  const tajweedCard = e => card(`exam/?id=${encodeURIComponent(e.id)}`, S.hub.tuhfaIcon, ' g', e.title, e.card + (audioOn && e.audio ? S.hub.tuhfaAudioTail : e.audio ? S.hub.tuhfaNoAudioTail : ''), 'exam:' + e.id);
  main.innerHTML = `
  <header class="hub-head">
    <img src="${url('assets/icons/icon-192.png')}" width="96" height="96" alt="${esc(S.hub.iconAlt)}">
    <h1>${esc(S.titles.hub)}</h1>
    <p class="hadith">${esc(S.hub.hadith)} <span class="small muted">${esc(S.hub.hadithSrc)}</span></p>
    <p class="muted">${esc(S.hub.tagline)}</p>
    <p class="small muted" id="ready" hidden>${esc(S.ready)}</p>
  </header>
  <div id="hints" class="stack"></div>
  <section class="sec"><h2>${esc(S.hub.secAll)}</h2><ul class="list">
    ${card('random/?due=1', '☀', ' g', S.hub.due, S.hub.dueSub, 'due')}
    ${card('random/', '↻', ' g', S.hub.random, S.hub.randomSub, 'random')}
    ${card('history/', '٪', '', S.hub.history, S.hub.historySub, 'history')}
  </ul></section>
  <section class="sec"><h2>${esc(S.hub.secPlan)}</h2><ul class="list">
    ${card('plan/', '✓', ' g', S.hub.plan, S.hub.planSub, 'plan')}
  </ul></section>
  <section class="sec"><h2>${esc(S.hub.secBaqarah)}</h2><ul class="list">
    ${pub(quran).map((e, i) => card(`exam/?id=${encodeURIComponent(e.id)}`, n(i + 1), '', e.title, e.card, 'exam:' + e.id)).join('')}
  </ul>${soon(quran).map(e => `<div class="soon">${esc(S.hub.next(e.card))}</div>`).join('')}</section>
  <section class="sec"><h2>${esc(S.hub.secTajweed)}</h2><ul class="list">${pub(tuhfa).map(tajweedCard).join('')}</ul>${soon(tuhfa).map(e => `<div class="soon">${esc(S.hub.next(e.card))}</div>`).join('')}</section>
  <section class="sec"><h2>${esc(S.hub.secListen)}</h2><ul class="list">
    ${card('listen/', '▶', '', S.hub.listen, S.hub.listenSub, 'listen')}
  </ul></section>`;
  swc.onReady(() => { const r = ui.$('#ready'); if (r) r.hidden = false; });
  await Promise.all([progress(idx), hints(), audioStatus(audioOn)]);
}

function put(key, html) { const el = main.querySelector(`[data-prg="${key}"]`); if (el) { el.innerHTML = html; el.hidden = !html; } return el; }
function bar(el, frac) { const i = el?.querySelector('.bar > i'); if (i) i.style.setProperty('--w', Math.min(100, Math.round(frac * 100)) + '%'); }

async function progress(idx) {
  // HUB-02: exam cards
  for (const e of idx.exams.filter(x => x.status === 'published')) {
    const st = await store.get('exam:' + e.id);
    if (!st || !Object.keys(st.grades || {}).length) { put('exam:' + e.id, ''); continue; }
    try {
      const ex = await loadExam(e);
      const qids = ex.questions.filter(q => isGradable(q.type, 'exam')).map(q => q.id);
      const t = attemptTally(st.grades, qids);
      if (!t.graded) { put('exam:' + e.id, ''); continue; }
      const el = put('exam:' + e.id, `<span class="bar"><i></i></span><span>${esc(S.hub.examPrg(n(t.graded), n(qids.length), npct(t.ok, t.graded)))}</span>`);
      bar(el, t.graded / qids.length);
    } catch { /* exam data missing */ }
  }
  // HUB-03: random card
  const cur = await store.get('random:current');
  if (cur && cur.set?.length) {
    const nq = cur.set.length, d = (cur.grades || []).filter(Boolean).length, ok = (cur.grades || []).filter(g => g === 'ok').length;
    if (cur.done) put('random', `<span>${esc(S.hub.rndDone(n(ok), n(nq)))}</span>`);
    else bar(put('random', `<span class="bar"><i></i></span><span>${esc(S.hub.rndRunning(n((cur.idx || 0) + 1), n(nq), n(d)))}</span>`), (cur.idx || 0) / nq);
  } else put('random', '');
  // HUB-04: history card
  const ev = live(await store.events());
  const d = dueNow(ev);
  put('due', `<span>${esc(d.due.length ? S.hub.dueCount(n(d.due.length)) : d.nextAt ? S.hub.dueLater(soon(d.nextAt, S.days)) : S.hub.dueClear)}</span>`);
  if (ev.length) {
    const ok = ev.filter(x => x.g === 'ok').length, last = Math.max(...ev.map(x => x.t));
    put('history', `<span>${esc(S.hub.histLine(n(ev.length), npct(ok, ev.length), when(last)))}</span>`);
  } else put('history', '');
  // HUB-05: plan card
  const plan = await store.get('plan:baqarah');
  if (plan?.week) {
    const { x, y } = planTotals(plan);
    bar(put('plan', `<span class="bar"><i></i></span><span>${esc(S.hub.planLine(n(x), n(y)))}</span>`), x / 20);
  } else put('plan', '');
}

async function audioStatus(on) {
  if (!on) return;
  const c = await collection('tuhfa'); if (!c) return;
  const k = await cachedCount(c.items);
  if (k === c.items.length) put('listen', `<span>${esc(S.hub.audioSaved)}</span>`); // HUB-06
}

async function hints() {
  const box = ui.$('#hints'); box.innerHTML = '';
  const dismissed = async (key, days) => { const v = await store.get(key); return v && (!days || Date.now() - v.dismissedAt < days * 86400000); };
  const banner = (text, key, extra = '') => {
    const d = document.createElement('div'); d.className = 'banner';
    d.innerHTML = `<span class="grow">${esc(text)}</span>${extra}<button type="button" class="btn small" data-dismiss>${esc(S.dismiss)}</button>`;
    d.querySelector('[data-dismiss]').addEventListener('click', () => { store.set(key, { dismissedAt: Date.now() }); d.remove(); });
    box.appendChild(d); return d;
  };
  // GEN-06
  if (platform.inAppBrowser() && !(await dismissed('ui:inapp'))) banner(S.inApp, 'ui:inapp');
  // HUB-08: iOS standalone with empty storage, once
  if (platform.isStandalone() && platform.isIOS() && !(await store.get('ui:standaloneHint'))) {
    const ev = await store.events(); const kv = await store.allKv();
    const empty = !ev.length && !Object.keys(kv).some(k => k.startsWith('exam:') || k.startsWith('plan:') || k.startsWith('random:'));
    if (empty) { store.set('ui:standaloneHint', { dismissedAt: Date.now() }); const d = document.createElement('div'); d.className = 'banner'; d.innerHTML = `<span>${esc(S.hub.standaloneHint)}</span> <a href="${href('settings/#backup')}">${esc(S.titles.settings)}</a>`; box.appendChild(d); }
  }
  // HUB-07: install card, dismissible for 30 days
  if (!platform.isStandalone() && !(await dismissed('ui:install', 30))) {
    const d = document.createElement('div'); d.className = 'panel install';
    let body = `<b>${esc(S.hub.install)}</b>`;
    if (platform.isIOS()) {
      const v = platform.iosMajor(); const keys = Object.keys(S.hub.iosSteps).map(Number).sort((a, b) => b - a);
      const steps = S.hub.iosSteps[keys.find(k => v >= k) || keys[keys.length - 1]];
      body += `<ol>${steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`;
    }
    body += `<div class="row"><button type="button" class="btn primary" data-install hidden>${esc(S.hub.installBtn)}</button><button type="button" class="btn" data-later>${esc(S.hub.installLater)}</button></div>`;
    d.innerHTML = body;
    const ib = d.querySelector('[data-install]');
    platform.onInstallable(() => { ib.hidden = false; });
    ib.addEventListener('click', async () => { if (await platform.promptInstall()) d.remove(); });
    d.querySelector('[data-later]').addEventListener('click', () => { store.set('ui:install', { dismissedAt: Date.now() }); d.remove(); });
    if (platform.isIOS() || platform.canPromptInstall()) box.appendChild(d);
    else platform.onInstallable(() => { if (!d.isConnected) box.appendChild(d); });
  }
}

(async () => {
  await ui.initPage({ home: false });
  try { await render(); } catch (e) { main.innerHTML = `<p class="banner warn">${esc(S.loadError)}</p>`; console.error(e); }
  ui.onRefresh(() => loadIndex().then(progress).catch(() => {}));
})();

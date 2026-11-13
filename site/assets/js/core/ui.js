// Page chrome shared by every page: home link, footer, notes (GEN-08), storage warning (GEN-05),
// offline banner (OFF-24), toasts, inline confirmations (GEN-07), canonical URL (IA-01), SW, analytics.
import { S, ORIGIN, CONTACT } from './strings.ar.js';
import { esc } from './fmt.js';
import { href, here, config, build } from './base.js';
import * as store from './store.js';
import * as platform from './platform.js';
import * as swc from './sw-client.js';
import * as audio from './audio.js';
import { loadAnalytics } from './analytics.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let toastBox = null;
/** role="status" toast (NFR-A11Y-04). opts: {error, sticky, timeout, action:{label, run}} */
export function toast(text, opts = {}) {
  if (!toastBox) { toastBox = document.createElement('div'); toastBox.className = 'toasts'; toastBox.setAttribute('role', 'status'); toastBox.setAttribute('aria-live', 'polite'); document.body.appendChild(toastBox); }
  const key = opts.key || text;
  [...toastBox.children].forEach(c => { if (c.dataset.key === key) c.remove(); });
  const t = document.createElement('div'); t.className = 'toast' + (opts.error ? ' error' : ''); t.dataset.key = key;
  const span = document.createElement('span'); span.textContent = text; t.appendChild(span);
  if (opts.action) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn small'; b.textContent = opts.action.label; b.addEventListener('click', () => { opts.action.run(); t.remove(); }); t.appendChild(b); }
  toastBox.appendChild(t);
  if (!opts.sticky) setTimeout(() => t.remove(), opts.timeout || 8000);
  return t;
}

/** GEN-07: inline confirmation «امحُ…» + «تراجع». Renders into `box`. */
export function confirmInline(box, text, yesLabel, onYes, { danger = true } = {}) {
  box.innerHTML = `<div class="confirm" role="group"><span>${esc(text)}</span><div class="row"><button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-c="yes">${esc(yesLabel)}</button><button type="button" class="btn" data-c="no">${esc(S.undo)}</button></div></div>`;
  const close = () => { box.innerHTML = ''; };
  box.querySelector('[data-c=yes]').addEventListener('click', async () => { close(); await onYes(); });
  box.querySelector('[data-c=no]').addEventListener('click', close);
  box.querySelector('[data-c=no]').focus();
}

/** Show «نُسخت» on a button for 1.5 s (EX-15, HIS-08). */
export function flash(btn, text) { const old = btn.textContent; btn.textContent = text; setTimeout(() => { btn.textContent = old; }, 1500); }

let tuhfaBayt = null; let notesEl = null; let notesKinds = [];
/** GEN-08: set which content notes the footer shows (once the content kind is known). */
export function setNotes(kinds) { notesKinds = kinds; renderNotes(); }

/** GEN-08 prefill: the bayt currently playing or last revealed. */
export function setTuhfaContext(n) { tuhfaBayt = n; renderNotes(); }

async function renderNotes() {
  if (!notesEl) return;
  const ver = (await build())?.version || (await config()).appVersion || '';
  const parts = [`<p>${esc(S.notes.device)}</p>`];
  if (notesKinds.includes('quran')) parts.push(`<p>${esc(S.notes.mushaf)}</p>`);
  if (notesKinds.includes('tuhfa')) {
    const subject = encodeURIComponent(S.notes.mailSubject);
    const body = encodeURIComponent(S.notes.mailBody(here() + location.search || '/', ver, tuhfaBayt ? String(tuhfaBayt) : ''));
    parts.push(`<p>${esc(S.notes.tuhfa)}: <a href="mailto:${CONTACT}?subject=${subject}&amp;body=${body}">${esc(CONTACT)}</a></p>`);
  }
  notesEl.innerHTML = parts.join('');
}

/** Rewrite variants to the canonical URL (IA-01). keep = query params that belong to the canonical form. */
export function canonicalize(keep = []) {
  const u = new URL(location.href);
  let path = u.pathname.replace(/index\.html$/, '');
  const q = new URLSearchParams();
  keep.forEach(k => { if (u.searchParams.has(k)) q.set(k, u.searchParams.get(k)); });
  const qs = q.toString();
  const target = path + (qs ? '?' + qs : '') + u.hash;
  if (target !== u.pathname + u.search + u.hash) history.replaceState(history.state, '', target);
  let link = document.querySelector('link[rel=canonical]');
  if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); }
  link.href = ORIGIN + '/' + here() + (qs ? '?' + qs : '');
}

/**
 * Common page setup. opts: { notes: ['quran'|'tuhfa'], home: true, keep: [query params] }
 * Returns once storage is ready.
 */
export async function initPage(opts = {}) {
  canonicalize(opts.keep || []);
  const home = $('#homelink');
  if (home && opts.home !== false) home.innerHTML = `<a href="${href('')}">${esc(S.home)}</a>`;
  const foot = $('#footer');
  if (foot) {
    foot.className = 'stack';
    foot.innerHTML = `<div class="notes" id="notes"></div><nav class="foot" aria-label="${esc(S.site)}"><a href="${href('settings/')}">${esc(S.footer.settings)}</a><a href="${href('about/')}">${esc(S.footer.about)}</a><a href="${href('privacy/')}">${esc(S.footer.privacy)}</a></nav>`;
    notesEl = $('#notes'); notesKinds = opts.notes || []; renderNotes();
  }
  const persistent = await store.ready();
  if (!persistent) { const w = document.createElement('div'); w.className = 'banner warn'; w.setAttribute('role', 'alert'); w.textContent = S.storageBlocked; place(w); }
  // OFF-24 offline banner
  const ob = document.createElement('div'); ob.className = 'banner offline'; ob.setAttribute('role', 'status'); ob.textContent = S.offline; ob.hidden = navigator.onLine !== false;
  place(ob);
  addEventListener('online', () => { ob.hidden = true; }); addEventListener('offline', () => { ob.hidden = false; });
  audio.on('toast', t => toast(t.text, { error: t.error }));
  swc.register({ toast });
  // DATA-53: ask for persistent storage on first run
  if (persistent && !(await store.get('ui:persistAsked'))) { platform.persist(); store.set('ui:persistAsked', { at: Date.now() }); }
  loadAnalytics();
  return persistent;
}

/** Banners live before #main so page renders never wipe them. */
function place(el) { const m = $('#main'); if (m) m.before(el); else document.body.prepend(el); }

/** Throttled refresh on visibility and cross-tab changes (DATA-54). */
export function onRefresh(fn) {
  let t = null; const run = () => { clearTimeout(t); t = setTimeout(fn, 50); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { store.invalidate(); run(); } });
  store.onMessage(m => { if (m && (m.type === 'kv' || m.type === 'events' || m.type === 'wipe')) run(); });
}

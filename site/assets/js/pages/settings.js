// Settings «/settings/» (SET-01…06).
import { S } from '../core/strings.ar.js';
import { esc, n, mb, isoDate, fullDate } from '../core/fmt.js';
import { config, build } from '../core/base.js';
import * as store from '../core/store.js';
import * as ui from '../core/ui.js';
import * as platform from '../core/platform.js';
import * as swc from '../core/sw-client.js';
import { collection, cachedCount, totalBytes, downloadAll, deleteAll, AUDIO_CACHE } from '../core/audio-cache.js';
import { makeBackup, parseBackup, applyImport } from '../core/backup.js';

const T = S.settings;
const main = ui.$('#main');
let col = null, ctrl = null;

function skeleton(audioOn) {
  main.innerHTML = `
  <section class="panel" id="theme"><h2>${esc(T.theme)}</h2><div class="chips" role="group" aria-label="${esc(T.theme)}">
    ${[['auto', T.themeAuto], ['light', T.themeLight], ['dark', T.themeDark]].map(([k, l]) => `<button type="button" class="chip" data-theme="${k}" aria-pressed="${store.getTheme() === k}">${esc(l)}</button>`).join('')}</div></section>
  ${audioOn ? `<section class="panel" id="audio"><h2>${esc(T.audio)}</h2><div id="audioBox" class="stack"></div><div id="audioConfirm"></div></section>` : ''}
  <section class="panel" id="storage"><h2>${esc(T.storage)}</h2><p id="usage" class="small"></p><p id="persist" class="small"></p></section>
  <section class="panel" id="backup"><h2>${esc(T.backup)}</h2><p class="muted small">${esc(T.backupHint)}</p>
    <h3>${esc(T.saveH)}</h3>
    <div class="row"><button type="button" class="btn primary" id="export">${esc(T.export)}</button><button type="button" class="btn" id="copyJson">${esc(T.copyJson)}</button></div>
    <h3>${esc(T.restoreH)}</h3>
    <div class="stack"><label class="btn" for="file">${esc(T.import)}</label><input type="file" id="file" class="sr-only" accept=".json,application/json,text/plain"></div>
    <details class="more" id="pasteBox"><summary>${esc(T.fromText)}</summary><div class="field"><label for="paste">${esc(T.paste)}</label><textarea id="paste" dir="ltr" spellcheck="false"></textarea><div class="row"><button type="button" class="btn" id="importText">${esc(T.importText)}</button></div></div></details>
    <div id="importBox" role="status"></div></section>
  <section class="panel"><p id="version" class="small"></p><div id="updBox"></div></section>
  <section class="panel"><button type="button" class="btn danger" id="wipe">${esc(T.wipe)}</button><div id="wipeBox"></div></section>`;
}

async function audioBox(progress) {
  const box = ui.$('#audioBox'); if (!box || !col) return;
  const N = col.items.length, k = await cachedCount(col.items), size = mb(totalBytes(col.items));
  if (progress) {
    box.innerHTML = `<div class="prog" role="progressbar" aria-valuemin="0" aria-valuemax="${N}" aria-valuenow="${progress.k}"><i></i></div><p class="small">${esc(T.dlProgress(n(progress.k), n(N), mb(progress.bytes)))}</p><div class="row"><button type="button" class="btn" id="dlStop">${esc(T.dlStop)}</button></div>`;
    box.querySelector('.prog > i').style.setProperty('--w', ((progress.k / N) * 100).toFixed(1) + '%');
    return;
  }
  if (k === N) box.innerHTML = `<p>${esc(T.dlDone)}</p><div class="row"><button type="button" class="btn danger" id="dlDelete">${esc(T.dlDelete)}</button></div>`;
  else if (k > 0) box.innerHTML = `<div class="row"><button type="button" class="btn primary" id="dlAll">${esc(T.dlResume(n(k), n(N)))}</button><button type="button" class="btn danger" id="dlDelete">${esc(T.dlDelete)}</button></div>`;
  else box.innerHTML = `<div class="row"><button type="button" class="btn primary" id="dlAll">${esc(T.dlAll(size))}</button></div>`;
}

async function storageInfo() {
  const est = await platform.estimate();
  ui.$('#usage').textContent = est ? T.usage(mb(est.usage || 0), est.quota ? mb(est.quota) : '') : '';
  ui.$('#persist').textContent = (await platform.persisted()) ? T.persisted : T.notPersisted;
}

async function versionLine() {
  const b = await build(); const c = await config();
  ui.$('#version').textContent = T.version(b?.version || c.appVersion || '', fullDate(b?.date || Date.now()));
  swc.onUpdate(() => { ui.$('#updBox').innerHTML = `<button type="button" class="btn primary" id="updNow">${esc(T.updateNow)}</button>`; });
}

function showImport(data) {
  const box = ui.$('#importBox');
  box.innerHTML = `<div class="confirm"><span>${esc(T.importSummary(n(data.events.length), n(Object.keys(data.kv).length)))}</span><div class="row"><button type="button" class="btn primary" id="importYes">${esc(T.importYes)}</button><button type="button" class="btn" id="importNo">${esc(S.undo)}</button></div></div>`;
  box.querySelector('#importYes').addEventListener('click', async () => { const r = await applyImport(data); box.innerHTML = `<p class="banner good">${esc(T.imported(n(r.added), n(r.updatedExams)))}</p>`; });
  box.querySelector('#importNo').addEventListener('click', () => { box.innerHTML = ''; });
}
function tryImport(text) {
  const r = parseBackup(text);
  if (!r.ok) { ui.$('#importBox').innerHTML = `<p class="banner warn">${esc(T.invalid)}</p>`; return; }
  showImport(r.data);
}

function bind() {
  main.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.theme) { store.setTheme(b.dataset.theme); ui.$$('button[data-theme]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.theme === b.dataset.theme))); return; }
    if (b.id === 'dlAll') {
      ctrl = new AbortController();
      const r = await downloadAll(col.items, { signal: ctrl.signal, onProgress: p => audioBox(p) });
      ctrl = null;
      if (r.error === 'space') { ui.toast(T.noSpace, { error: true }); }
      await audioBox(); return;
    }
    if (b.id === 'dlStop') { ctrl?.abort(); return; }
    if (b.id === 'dlDelete') { ui.confirmInline(ui.$('#audioConfirm'), T.dlDeleteConfirm, T.dlDeleteYes, async () => { await deleteAll(); await audioBox(); }); return; }
    if (b.id === 'export') { const data = await makeBackup(); await platform.saveFile(`khayrukum-backup-${isoDate()}.json`, JSON.stringify(data)); return; }
    if (b.id === 'copyJson') { const data = await makeBackup(); if (await platform.copyText(JSON.stringify(data))) ui.flash(b, S.copied); return; }
    if (b.id === 'importText') { tryImport(ui.$('#paste').value); return; }
    if (b.id === 'updNow') { swc.applyUpdate(); return; }
    if (b.id === 'wipe') {
      ui.confirmInline(ui.$('#wipeBox'), T.wipeConfirm1, T.wipeYes1, () => {
        ui.confirmInline(ui.$('#wipeBox'), T.wipeConfirm2, T.wipeYes2, async () => { // SET-06: confirm twice
          await store.wipe(); try { await caches.delete(AUDIO_CACHE); } catch { /* ignore */ }
          ui.$('#wipeBox').innerHTML = `<p class="banner">${esc(T.wiped)}</p>`;
        });
      });
    }
  });
  ui.$('#file').addEventListener('change', async e => { const f = e.target.files[0]; if (f) tryImport(await platform.readFile(f)); e.target.value = ''; });
}

(async () => {
  await ui.initPage({ notes: [] });
  const cfg = await config();
  col = cfg.audio?.enabled ? await collection('tuhfa') : null;
  skeleton(!!col); bind();
  await Promise.all([audioBox(), storageInfo(), versionLine()]);
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  addEventListener('pagehide', () => ctrl?.abort()); // OFF-20: leaving the page stops the download
})();

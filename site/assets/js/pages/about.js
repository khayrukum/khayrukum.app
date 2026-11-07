// «عن الموقع» (ABT-01, LIC-01, LIC-11, LIC-21, LIC-30, D-5).
import { S, CONTACT } from '../core/strings.ar.js';
import { esc, n, fullDate } from '../core/fmt.js';
import { getJson, config, build, href } from '../core/base.js';
import * as ui from '../core/ui.js';

const A = S.about;

(async () => {
  await ui.initPage({ notes: [] });
  const main = ui.$('#main');
  const [cfg, b, src, tuhfa] = await Promise.all([config(), build(), getJson('data/quran/source.json').catch(() => null), getJson('data/tuhfa/abyat.json').catch(() => null)]);
  const pending = tuhfa ? Object.entries(tuhfa.review || {}).filter(([, v]) => v !== 'verified').map(([k]) => n(+k)) : [];
  const audioOn = !!cfg.audio?.enabled;
  main.innerHTML = `<div class="prose">
    <p>${esc(A.purpose)}</p>
    <h2>${esc(A.audioH)}</h2><p>${esc(S.credit.audio)}. ${esc(audioOn ? A.audioPermission : A.audioPending)}</p>
    <h2>${esc(A.poemH)}</h2><p>${esc(A.poem)}</p>
    <h2>${esc(A.reviewH)}</h2><p>${esc(pending.length ? A.reviewPending(pending.join('، ')) : A.reviewDone(tuhfa?.source?.verifiedAgainst?.edition || ''))}</p>
    <h2>${esc(A.quranH)}</h2><p>${esc(A.quran)} <a href="https://tanzil.net" rel="noopener">${esc(A.tanzil)} (tanzil.net)</a></p>
    ${src ? `<p class="small">${esc(A.notice)}</p><pre class="notice" lang="en" dir="ltr">${esc(src.notice)}</pre>` : ''}
    <h2>${esc(A.fontsH)}</h2><p>${esc(A.fonts)}</p>
    <h2>${esc(A.limitH)}</h2><p>${esc(A.limit)}</p>
    <h2>${esc(A.contactH)}</h2><p><a href="mailto:${CONTACT}">${CONTACT}</a></p>
    <h2>${esc(A.repoH)}</h2><p><a href="${esc(cfg.repo || '')}" rel="noopener">${esc(A.repo)}</a></p>
    <h2>${esc(A.licH)}</h2><ul>${A.lic.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    <h2>${esc(A.versionH)}</h2><p>${esc(S.settings.version(b?.version || cfg.appVersion || '', fullDate(b?.date || Date.now())))}</p>
    <p><a href="${href('privacy/')}">${esc(S.titles.privacy)}</a></p></div>`;
})();

// «عن التطبيق» (ABT-01, LIC-01, LIC-11, LIC-21, LIC-30, D-5).
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
  const edition = tuhfa?.source?.verifiedAgainst?.edition || '';
  const review = pending.length ? A.reviewPending(pending.join('، ')) : edition ? A.reviewDone(edition) : '';
  const audioOn = !!cfg.audio?.enabled;
  const item = (h, body) => `<div class="src"><h3>${esc(h)}</h3>${body}</div>`;
  main.innerHTML = `
    <p class="lead">${esc(A.lead)}</p>
    <section class="panel"><h2>${esc(A.featuresH)}</h2><ul class="feat">${A.features.map(([h, t]) => `<li><b>${esc(h)}</b><span>${esc(t)}</span></li>`).join('')}</ul></section>
    <section class="panel"><h2>${esc(A.roadH)}</h2><p>${esc(A.road)}</p></section>
    <section class="panel"><h2>${esc(A.sourcesH)}</h2>
      ${item(A.quranH, `<p>${esc(A.quran)} <a href="https://tanzil.net" rel="noopener">${esc(A.tanzil)} (tanzil.net)</a></p>${src ? `<details class="more"><summary>${esc(A.notice)}</summary><pre class="notice" lang="en" dir="ltr">${esc(src.notice)}</pre></details>` : ''}`)}
      ${item(A.poemH, `<p>${esc(A.poem)}${review ? ' ' + esc(review) : ''}</p>`)}
      ${item(A.audioH, `<p>${esc(S.credit.audio)}. ${esc(audioOn ? A.audioPermission : A.audioPending)}</p>${audioOn ? `<p class="muted small"><b>${esc(A.limitH)}:</b> ${esc(A.limit)}</p>` : ''}`)}
      ${item(A.fontsH, `<p>${esc(A.fonts)}</p>`)}
      ${item(A.licH, `<ul>${A.lic.map(x => `<li>${esc(x)}</li>`).join('')}</ul><p><a href="${esc(cfg.repo || '')}" rel="noopener">${esc(A.repo)}</a></p>`)}
    </section>
    <section class="panel"><h2>${esc(A.contactH)}</h2><p>${esc(A.contact)} <a href="mailto:${CONTACT}">${CONTACT}</a></p><p><a href="${href('privacy/')}">${esc(A.privacyLink)}</a></p></section>
    <p class="muted small center">${esc(S.settings.version(b?.version || cfg.appVersion || '', fullDate(b?.date || Date.now())))}</p>`;
})();

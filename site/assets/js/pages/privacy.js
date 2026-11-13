// «سياسة الخصوصية» (ABT-02).
import { S, CONTACT } from '../core/strings.ar.js';
import { esc, n } from '../core/fmt.js';
import { href } from '../core/base.js';
import * as ui from '../core/ui.js';

const P = S.privacy;

(async () => {
  await ui.initPage({ notes: [] });
  ui.$('#main').innerHTML = `<p class="lead">${esc(P.intro)}</p><p class="muted small">${esc(P.updated)}</p>
    ${P.sections.map(([h, t], i) => `<section class="panel pol"><h2><span class="pn">${n(i + 1)}</span>${esc(h)}</h2><p>${esc(t)}</p></section>`).join('')}
    <section class="panel"><h2>${esc(P.contact)}</h2><p>${esc(P.contactText)} <a href="mailto:${CONTACT}">${CONTACT}</a></p><p><a href="${href('settings/')}">${esc(P.settingsLink)}</a></p></section>`;
})();

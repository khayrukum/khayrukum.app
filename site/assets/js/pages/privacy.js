// «الخصوصية» (ABT-02).
import { S, CONTACT } from '../core/strings.ar.js';
import { esc } from '../core/fmt.js';
import { href } from '../core/base.js';
import * as ui from '../core/ui.js';

const P = S.privacy.sections;

(async () => {
  await ui.initPage({ notes: [] });
  ui.$('#main').innerHTML = `<div class="prose">${P.map(([h, t]) => `<h2>${esc(h)}</h2><p>${esc(t)}</p>`).join('')}
    <h2>${esc(S.privacy.contact)}</h2><p><a href="mailto:${CONTACT}">${CONTACT}</a></p>
    <p><a href="${href('settings/')}">${esc(S.titles.settings)}</a></p></div>`;
})();

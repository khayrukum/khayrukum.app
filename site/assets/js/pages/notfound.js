// 404 page.
import { S } from '../core/strings.ar.js';
import { esc } from '../core/fmt.js';
import { href } from '../core/base.js';
import * as ui from '../core/ui.js';

(async () => {
  await ui.initPage({ notes: [] });
  ui.$('#main').innerHTML = `<p>${esc(S.notFound.text)}</p><p><a class="btn primary" href="${href('')}">${esc(S.notFound.back)}</a></p>`;
})();

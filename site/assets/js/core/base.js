// Base-path helper (ARCH-01). Every link and asset URL is built here, relative to the site root,
// which is derived from this module's own location: <root>/assets/js/core/base.js.
export const ROOT = new URL('../../../', import.meta.url);

/** Absolute URL of a site-root-relative path, e.g. url('data/exams/index.json'). */
export const url = (path = '') => new URL(path.replace(/^\/+/, ''), ROOT).href;
/** Path (without origin) of a site page, for links: href('exam/?id=tuhfa'). */
export const href = (path = '') => { const u = new URL(path.replace(/^\/+/, ''), ROOT); return u.pathname + u.search + u.hash; };
/** Site-root-relative path of the current page, e.g. 'exam/'. */
export const here = () => location.pathname.slice(ROOT.pathname.length);

export async function getJson(path, opts = {}) {
  const r = await fetch(url(path), opts);
  if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status} for ${path}`), { status: r.status });
  return r.json();
}

let configP = null;
/** site config.json (AUD-40 switch, analytics token). */
export const config = () => (configP ||= getJson('config.json').catch(() => ({ audio: { enabled: false }, analytics: {}, appVersion: '0' })));
let buildP = null;
/** build.json written by tools/build.mjs (version, date, hash); absent in dev. */
export const build = () => (buildP ||= getJson('build.json').catch(() => null));

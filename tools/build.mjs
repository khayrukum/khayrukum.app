#!/usr/bin/env node
// Minimal build (§9.1): copy site/ → dist/, generate sw.js with the inlined hash list (OFF-02a), config.json,
// build.json and fonts.css; enforce budgets (OFF-05, NFR-PERF-03); apply the audio switch (AUD-40/41).
//
//   node tools/build.mjs [--out dist] [--audio on|off] [--audio-dir local-audio] [--version 1.0.0] [--strict]
//
// --audio-dir  where tuhfa/{bayt,chapter}/*.mp3 and tuhfa/full.mp3 live (default site/audio). Never committed.
// --strict     fail on warnings that a release must not have (missing Quran text, missing fonts).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SITE, readJson, tryJson, sha256, walk, ok, warn, fail } from './lib/util.mjs';
import { fontsCss } from './fonts.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const OUT = path.resolve(ROOT, opt('--out', 'dist'));
const STRICT = argv.includes('--strict');
const cfg = readJson(path.join(SITE, 'config.json'));
const local = tryJson(path.join(SITE, 'config.local.json')) || {};
const audioFlag = opt('--audio', null);
const audioOn = audioFlag ? audioFlag === 'on' : (local.audio?.enabled ?? cfg.audio.enabled);
const audioDir = path.resolve(ROOT, opt('--audio-dir', local.audioDir || 'site/audio'));
const version = opt('--version', process.env.APP_VERSION || cfg.appVersion);
const MB = 1048576;
let problems = 0;
const strictWarn = m => { if (STRICT) { fail(m); problems++; } else warn(m); };

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// ---------- content gates ----------
const quranOk = fs.existsSync(path.join(SITE, 'data/quran/002.json'));
const index = readJson(path.join(SITE, 'data/exams/index.json'));
const excluded = [];
for (const e of index.exams) {
  if (e.status !== 'published') continue;
  const f = path.join(SITE, 'data/exams', e.file || '');
  const needsQuran = e.kind === 'quran';
  if (!fs.existsSync(f) || (needsQuran && !quranOk)) { excluded.push(e.id); }
  else { const x = readJson(f); if (x.ported && x.ported.status !== 'complete') strictWarn(`${e.id}: ported.status is "${x.ported.status}" (pending: ${(x.ported.pending || []).length})`); }
}
if (excluded.length) {
  const msg = `\n######## EXAMS EXCLUDED: ${excluded.join(', ')} ########\n# Their data or the Quran text is missing. Run: npm run import:tanzil && npm run port\n# See CONTENT-TODO.md. They are shown as «قريبًا» until then.\n`;
  if (STRICT) { fail(msg); process.exit(1); } else warn(msg);
}

// ---------- copy ----------
const SKIP = rel => rel === 'sw.template.js' || rel === 'config.local.json' || rel.startsWith('audio/') || (!audioOn && rel.startsWith('data/audio/'))
  || rel === 'assets/css/fonts.css' || rel.endsWith('.DS_Store');
for (const rel of walk(SITE)) {
  if (SKIP(rel)) continue;
  const dst = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(path.join(SITE, rel), dst);
}
if (excluded.length) {
  const idx = readJson(path.join(OUT, 'data/exams/index.json'));
  idx.exams.forEach(e => { if (excluded.includes(e.id)) e.status = 'soon'; });
  fs.writeFileSync(path.join(OUT, 'data/exams/index.json'), JSON.stringify(idx, null, 2) + '\n');
}

// ---------- fonts.css (only faces whose files exist) ----------
const { css, missing } = fontsCss(path.join(SITE, 'assets/fonts'));
fs.writeFileSync(path.join(OUT, 'assets/css/fonts.css'), css);
if (missing.length) strictWarn(`fonts missing (system fallbacks used): ${missing.join(', ')} — see CONTENT-TODO.md`);
if (!fs.existsSync(path.join(SITE, 'assets/fonts/LICENSES')) || walk(path.join(SITE, 'assets/fonts/LICENSES')).filter(f => /OFL/i.test(f)).length === 0) strictWarn('assets/fonts/LICENSES/ has no OFL texts (LIC-30)');

// ---------- audio (AUD-40/41) ----------
const outCfg = { ...cfg, appVersion: version, audio: { ...cfg.audio, enabled: audioOn } };
if (audioOn) {
  const man = readJson(path.join(SITE, 'data/audio/tuhfa.json'));
  let missingA = 0;
  for (const it of man.items) {
    const src = path.join(audioDir, it.src.replace(/^audio\//, ''));
    if (!fs.existsSync(src)) { missingA++; continue; }
    const buf = fs.readFileSync(src);
    if (it.sha256 && sha256(buf) !== it.sha256) { fail(`${it.src}: sha256 differs from the manifest (run check-audio --write)`); process.exit(1); }
    const dst = path.join(OUT, it.src); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, buf);
  }
  if (missingA) { fail(`audio enabled but ${missingA} files are missing under ${path.relative(ROOT, audioDir)}`); process.exit(1); }
  const perm = readJson(path.join(SITE, 'data/audio/permission.json'));
  if (perm.collections?.tuhfa?.status !== 'granted') warn('audio is ON but permission.json does not record a grant: this build must not be deployed (LIC-20). release-check.mjs will fail.');
  ok(`audio enabled: ${man.items.length} files copied from ${path.relative(ROOT, audioDir)}`);
} else ok('audio disabled: no audio files, no audio manifest in the build (AUD-40)');
fs.writeFileSync(path.join(OUT, 'config.json'), JSON.stringify(outCfg, null, 2) + '\n');

// ---------- precache list ----------
const PRE = rel => /\.(html|css|js|json|webmanifest|png|svg|woff2)$/.test(rel) && !rel.startsWith('audio/') && rel !== 'sw.js' && !rel.startsWith('assets/fonts/LICENSES');
// SOURCE_DATE_EPOCH (set by the deploy workflows to the commit time) makes a re-deploy of the same commit byte-identical (OFF-10).
const date = (process.env.SOURCE_DATE_EPOCH ? new Date(+process.env.SOURCE_DATE_EPOCH * 1000) : new Date()).toISOString();
const files0 = walk(OUT).filter(PRE);
const entries0 = files0.map(rel => { const b = fs.readFileSync(path.join(OUT, rel)); return { url: rel, sha256: sha256(b), bytes: b.length }; });
const BUILD_HASH = sha256(JSON.stringify(entries0)).slice(0, 12);
fs.writeFileSync(path.join(OUT, 'build.json'), JSON.stringify({ version, date, hash: BUILD_HASH, audio: audioOn }) + '\n');
const bj = fs.readFileSync(path.join(OUT, 'build.json'));
const entries = entries0.concat({ url: 'build.json', sha256: sha256(bj), bytes: bj.length }).sort((a, b) => a.url.localeCompare(b.url));
const total = entries.reduce((a, e) => a + e.bytes, 0);
if (total > 2 * MB) { fail(`precache is ${(total / MB).toFixed(2)} MB > 2.0 MB (OFF-05)`); process.exit(1); }
ok(`precache: ${entries.length} files, ${(total / 1024).toFixed(0)} KB (budget 2048 KB)`);

const audioManifests = audioOn ? walk(path.join(OUT, 'data/audio')).filter(f => f !== 'index.json' && f !== 'permission.json').map(f => 'data/audio/' + f) : [];
const sw = fs.readFileSync(path.join(SITE, 'sw.template.js'), 'utf8')
  .replace('__BUILD_HASH__', BUILD_HASH)
  .replace('__PRECACHE__', JSON.stringify(entries))
  .replace('__AUDIO_MANIFESTS__', JSON.stringify(audioManifests));
fs.writeFileSync(path.join(OUT, 'sw.js'), sw);

// ---------- budgets (NFR-PERF-03) ----------
const importsOf = (file, seen = new Set()) => {
  if (seen.has(file)) return seen; seen.add(file);
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/^\s*import\s+(?:[^'"]*?from\s+)?['"](\.[^'"]+)['"]/gm)) importsOf(path.resolve(path.dirname(file), m[1]), seen);
  return seen;
};
for (const page of walk(path.join(OUT, 'assets/js/pages'))) {
  const set = importsOf(path.join(OUT, 'assets/js/pages', page));
  const bytes = [...set].reduce((a, f) => a + fs.statSync(f).size, 0);
  if (bytes > 120 * 1024) { fail(`${page}: first-party JS ${(bytes / 1024).toFixed(0)} KB > 120 KB`); problems++; }
}
const cssBytes = walk(path.join(OUT, 'assets/css')).reduce((a, f) => a + fs.statSync(path.join(OUT, 'assets/css', f)).size, 0);
if (cssBytes > 40 * 1024) { fail(`CSS ${(cssBytes / 1024).toFixed(0)} KB > 40 KB`); problems++; }
ok(`budgets: CSS ${(cssBytes / 1024).toFixed(1)} KB; JS per page checked`);

// ---------- reminders ----------
const ab = readJson(path.join(SITE, 'data/tuhfa/abyat.json'));
const pending = Object.entries(ab.review || {}).filter(([, v]) => v !== 'verified').map(([k]) => k);
if (pending.length) warn(`Tuhfa abyat under review (shown «قيد المراجعة», DATA-17/LIC-11): ${pending.join(', ')}`);
if (!cfg.analytics?.cloudflareToken) warn('config.json analytics.cloudflareToken is empty: analytics stays off (DEP-07, token pending)');
if (problems) process.exit(1);
ok(`built ${path.relative(ROOT, OUT)}/ — version ${version}, hash ${BUILD_HASH}`);

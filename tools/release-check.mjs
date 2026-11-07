#!/usr/bin/env node
// Release gate (TST-60, LIC-11, LIC-20, AUD-33, DEP-09).
//   node tools/release-check.mjs [--accept-review]   (--accept-review = owner accepted «قيد المراجعة», OWNER-2)
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { ROOT, SITE, readJson, tryJson, ok, fail, warn } from './lib/util.mjs';

let bad = 0; const E = m => { fail(m); bad++; };
const acceptReview = process.argv.includes('--accept-review') || process.env.OWNER_ACCEPTS_REVIEW === '1';
const cfg = readJson(path.join(SITE, 'config.json'));
const perm = readJson(path.join(SITE, 'data/audio/permission.json'));
const aidx = readJson(path.join(SITE, 'data/audio/index.json'));

// LIC-20 / AUD-33: audio only with a recorded grant, per collection
for (const c of aidx.collections) {
  const p = perm.collections[c.id];
  if (cfg.audio.enabled && !(p && p.status === 'granted' && p.granted && c.permission.granted)) E(`audio is enabled but collection «${c.id}» has no recorded grant (LIC-20/AUD-33)`);
}
if (!cfg.audio.enabled) ok('audio disabled (LIC-20 fallback)');
// AUD-41: no audio in Git unless granted
const tracked = execSync('git ls-files', { cwd: ROOT }).toString().split('\n').filter(f => /\.(mp3|m4a|ogg|wav)$/i.test(f));
if (tracked.length && !Object.values(perm.collections).every(p => p.status === 'granted')) E(`audio files tracked in Git before permission: ${tracked.slice(0, 3).join(', ')}…`);

// LIC-11: Tuhfa verification or accepted fallback
const ab = readJson(path.join(SITE, 'data/tuhfa/abyat.json'));
const pending = Object.entries(ab.review).filter(([, v]) => v !== 'verified').map(([k]) => k);
if (pending.length && !acceptReview) E(`abyat ${pending.join(', ')} not verified (LIC-11); pass --accept-review only if the owner accepted «قيد المراجعة»`);
else if (pending.length) warn(`abyat ${pending.join(', ')} ship marked «قيد المراجعة» (owner-accepted fallback)`);

// LIC-01: Quran notice present
const src = tryJson(path.join(SITE, 'data/quran/source.json'));
const q = tryJson(path.join(SITE, 'data/quran/002.json'));
if (!src || !q || !q.notice || q.notice !== src.notice) E('Quran text or its Tanzil notice is missing (LIC-01, DATA-12)');
// exams fully ported
for (const e of readJson(path.join(SITE, 'data/exams/index.json')).exams.filter(x => x.status === 'published')) {
  const x = tryJson(path.join(SITE, 'data/exams', e.file));
  if (!x) E(`${e.id}: data file missing`); else if (x.ported && x.ported.status !== 'complete') E(`${e.id}: ported.status = ${x.ported.status}`);
}
// fonts and licenses (LIC-30)
const lic = path.join(SITE, 'assets/fonts/LICENSES');
if (!fs.existsSync(lic) || !fs.readdirSync(lic).some(f => /OFL/i.test(f))) E('OFL license texts missing in assets/fonts/LICENSES (LIC-30)');
if (!fs.readdirSync(path.join(SITE, 'assets/fonts')).some(f => f.endsWith('.woff2'))) E('self-hosted WOFF2 fonts missing (NFR-TYP-01)');
if (!cfg.analytics.cloudflareToken) warn('analytics token empty (DEP-07): analytics will be off');

if (bad) { console.error(`\nrelease check FAILED (${bad})`); process.exit(1); }
ok('release check passed');

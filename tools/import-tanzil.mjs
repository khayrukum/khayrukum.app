#!/usr/bin/env node
// The ONLY writer of site/data/quran/* (DATA-14).
//
//   node tools/import-tanzil.mjs                 # import from data/source/ (see CONTENT-TODO.md)
//   node tools/import-tanzil.mjs --fallback-meta # no Tanzil files yet: write a PROVISIONAL meta.json
//                                                # (Al-Baqarah rub' boundaries from the baseline plan, checked
//                                                # by the independent review) so the plan works. No Quran text.
//
// Inputs (owner provides, never typed by hand — LIC-01):
//   data/source/quran-uthmani.txt       Tanzil Uthmani 1.1, "text with aya numbers" (sura|aya|text), options below
//   data/source/quran-simple-clean.txt  Tanzil Simple-Clean (alignment input only, never shipped — DATA-25)
//   data/source/quran-data.js           Tanzil metadata (suras, pages, hizb quarters)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT, SITE, QURAN_SRC, parseTanzil, readJson, tryJson, writeJson, sha256, ok, warn, fail } from './lib/util.mjs';
import { QuranIndex } from './port/resolve.mjs';

const OUT = path.join(SITE, 'data/quran');
const OPTIONS = { pauseMarks: true, sajdah: false, rubElHizb: false, superscriptAlefTatweel: false, basmala: 'separate' };
const args = new Set(process.argv.slice(2));
const today = new Date().toISOString().slice(0, 10);
const planRubs = readJson(path.join(ROOT, 'tools/port/baseline/plan-rubs.json'));

if (args.has('--fallback-meta')) {
  if (fs.existsSync(path.join(OUT, 'meta.json')) && !tryJson(path.join(OUT, 'meta.json'))?.provisional) {
    console.log('meta.json already imported from Tanzil; not replacing it with the provisional one.');
    process.exit(0);
  }
  const rubs = planRubs.rubs.map(r => ({ n: r.rub, sura: r.rub === 1 ? 1 : 2, aya: r.rub === 1 ? 1 : r.from }));
  writeJson(path.join(OUT, 'meta.json'), {
    schema: 'quran-meta', version: '0.0.0-provisional', provisional: true,
    note: 'PROVISIONAL: Al-Baqarah rub\' starts only, from the baseline plan (checked by the review). Replace by running tools/import-tanzil.mjs with data/source/quran-data.js.',
    mushaf: 'مصحف المدينة',
    suras: [{ n: 2, ayas: 286, name: 'البقرة' }],
    pages: [], rubs
  });
  ok('wrote PROVISIONAL site/data/quran/meta.json (rub\' boundaries of Al-Baqarah only)');
  process.exit(0);
}

const missing = Object.entries(QURAN_SRC).filter(([, p]) => !fs.existsSync(p));
if (missing.length) {
  fail('Missing Tanzil source files:\n' + missing.map(([k, p]) => `   ${k}: ${path.relative(ROOT, p)}`).join('\n') + '\n   See CONTENT-TODO.md for where to download them and with which options.');
  process.exit(1);
}

// ---------- Uthmani text ----------
const rawU = fs.readFileSync(QURAN_SRC.uthmani);
const U = parseTanzil(rawU.toString('utf8'));
if (U.suras.size !== 114) { fail(`expected 114 suras in ${QURAN_SRC.uthmani}, found ${U.suras.size}`); process.exit(1); }
const all = [...U.suras.values()].flat();
// Record the options the file was actually downloaded with (DATA-10). The text is never modified (LIC-02):
// signs present in the download stay in the verse text as mark-only tokens and never count as words (DATA-01).
const has = cp => all.some(v => v.includes(String.fromCodePoint(cp)));
const detected = {
  pauseMarks: [0x06D6, 0x06D7, 0x06D8, 0x06D9, 0x06DA, 0x06DB, 0x06DC].some(has),
  sajdah: has(0x06E9),
  rubElHizb: has(0x06DE),
  superscriptAlefTatweel: all.some(v => v.includes('\u0640\u0670')),
  basmala: 'separate'
};
for (const k of ['sajdah', 'rubElHizb', 'superscriptAlefTatweel']) {
  if (detected[k] !== OPTIONS[k]) warn(`Download option "${k}" is ${detected[k]} (requirements default: ${OPTIONS[k]}). Recorded as-is in source.json; the text is not changed.`);
}
if (!detected.pauseMarks) { fail('The Uthmani file has no pause marks. Download it again with "pause marks" ON.'); process.exit(1); }
if (!U.notice) { fail('The Uthmani file has no Tanzil notice block (# comment lines). Use the unmodified download.'); process.exit(1); }

const basmala = U.suras.get(1)[0];
const s2 = U.suras.get(2).slice();
if (s2.length !== 286) { fail('Al-Baqarah should have 286 verses'); process.exit(1); }
let basmalaOut = null;
if (s2[0].startsWith(basmala + ' ')) { basmalaOut = basmala; s2[0] = s2[0].slice(basmala.length + 1); }
else warn('2:1 does not start with the basmala of 1:1; storing 2:1 unchanged and basmala as 1:1.');

writeJson(path.join(OUT, 'source.json'), {
  schema: 'quran-source', version: '1.1',
  source: 'Tanzil Quran Text', edition: 'Uthmani', url: 'https://tanzil.net',
  retrieved: process.env.TANZIL_RETRIEVED || today,
  file: 'data/source/quran-uthmani.txt', sha256: sha256(rawU),
  simpleClean: { file: 'data/source/quran-simple-clean.txt', sha256: sha256(fs.readFileSync(QURAN_SRC.simple)), shipped: false },
  metadata: { file: 'data/source/quran-data.js', sha256: sha256(fs.readFileSync(QURAN_SRC.meta)) },
  options: detected, notice: U.notice
});
writeJson(path.join(OUT, '002.json'), { schema: 'quran-sura', version: '1.1', sura: 2, basmala: basmalaOut || basmala, basmalaPrefixed: !!basmalaOut, ayat: s2, notice: U.notice });
ok(`002.json: ${s2.length} verses (Uthmani, byte-exact)`);

// ---------- metadata ----------
const ctx = { QuranData: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(QURAN_SRC.meta, 'utf8') + '\n;globalThis.__Q = QuranData;', ctx);
const Q = ctx.__Q;
const suras = Q.Sura.filter(x => x && x.length).map((x, i) => ({ n: i + 1, start: x[0], ayas: x[1], name: x[4] }));
const pages = Q.Page.filter(x => x && x.length).map(([s, a]) => [s, a]);
const rubs = Q.HizbQaurter.filter(x => x && x.length).map(([s, a], i) => ({ n: i + 1, sura: s, aya: a }));
if (pages.length < 604) { fail(`expected 604 page starts, found ${pages.length}`); process.exit(1); }
if (rubs.length < 240) { fail(`expected 240 hizb quarters, found ${rubs.length}`); process.exit(1); }
writeJson(path.join(OUT, 'meta.json'), {
  schema: 'quran-meta', version: '1.0', provisional: false, mushaf: 'مصحف المدينة',
  source: 'Tanzil quran-data.js', suras: suras.map(({ n, ayas, name }) => ({ n, ayas, name })),
  pages: pages.slice(0, 604), rubs: rubs.slice(0, 240)
});
ok('meta.json: 114 suras, 604 pages, 240 rub\'');

// cross-check the baseline plan boundaries against Tanzil (LIC-04)
for (const r of planRubs.rubs) {
  const t = rubs[r.rub - 1];
  const start = r.rub === 1 ? 1 : t.aya;
  if ((r.rub > 1 && (t.sura !== 2 || start !== r.from))) warn(`rub' ${r.rub}: baseline starts at 2:${r.from}, Tanzil at ${t.sura}:${t.aya}`);
}

// ---------- rub' openings (DATA-13): baseline phrases aligned to Uthmani tokens ----------
const simple = parseTanzil(fs.readFileSync(QURAN_SRC.simple, 'utf8')).suras;
const ss2 = simple.get(2).slice();
const sb = simple.get(1)[0];
if (ss2[0].startsWith(sb + ' ')) ss2[0] = ss2[0].slice(sb.length + 1);
const idx = new QuranIndex(2, s2, ss2);
const openings = [];
for (const r of planRubs.rubs) {
  const from = r.rub === 1 ? 1 : rubs[r.rub - 1].aya;
  const res = idx.find(r.phrase, [from], null, { anchor: 'start', hintsOnly: true });
  if (res.status !== 'match' || res.verse !== from) { fail(`rub' ${r.rub}: opening «${r.phrase}» not found at the start of 2:${from} (${res.why || 'other verse'})`); continue; }
  openings.push({ rub: r.rub, ref: res.ref });
}
writeJson(path.join(OUT, 'rub-openings.json'), { schema: 'rub-openings', version: '1.0', 2: openings });
ok(`rub-openings.json: ${openings.length} openings`);

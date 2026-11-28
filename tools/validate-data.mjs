#!/usr/bin/env node
// Data validation (TST-10) and Quran byte check (TST-11).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SITE, readJson, tryJson, sha256, parseTanzil, QURAN_SRC, ok, fail, warn } from './lib/util.mjs';
import { validate } from '../site/assets/js/core/schema.js';
import { parseRef, resolveRef, splitInline, expandChain } from '../site/assets/js/core/refs.js';
import { hasType, isGradable } from '../site/assets/js/core/registry.js';
import { BACKUP_SCHEMA } from '../site/assets/js/core/backup.js';
import { wordCount } from '../site/assets/js/core/refs.js';
import { convert, tanzilTexts } from './audio/recitation.mjs';

let errors = 0;
const E = m => { fail(m); errors++; };
const schema = name => readJson(path.join(ROOT, 'schemas', name + '.schema.json'));
function check(file, sname) {
  const p = path.join(SITE, file);
  if (!fs.existsSync(p)) { E(`missing ${file}`); return null; }
  let d; try { d = readJson(p); } catch (e) { E(`${file}: invalid JSON (${e.message})`); return null; }
  const errs = validate(schema(sname), d);
  errs.slice(0, 10).forEach(x => E(`${file}: ${x}`));
  return d;
}

// ---------- backup schema file is in sync with the app ----------
const bs = path.join(ROOT, 'schemas/backup.schema.json');
const bsWant = JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', title: 'backup', ...BACKUP_SCHEMA }, null, 2) + '\n';
if (!fs.existsSync(bs) || fs.readFileSync(bs, 'utf8') !== bsWant) { fs.writeFileSync(bs, bsWant); warn('schemas/backup.schema.json regenerated from core/backup.js'); }

// ---------- static files ----------
const cfg = check('config.json', 'config');
const rt = check('data/round-types.json', 'round-types');
const idx = check('data/exams/index.json', 'exam-index');
const plan = check('data/plan/baqarah.json', 'plan');
const tuhfa = check('data/tuhfa/abyat.json', 'tuhfa-abyat');
const audioIdx = check('data/audio/index.json', 'audio-index');
const perm = check('data/audio/permission.json', 'audio-permission');
const meta = check('data/quran/meta.json', 'quran-meta');
const quranCollections = [];
for (const c of audioIdx?.collections || []) {
  const m = check('data/audio/' + c.manifest, 'audio-collection');
  if (m && m.id !== c.id) E(`audio collection ${c.id}: manifest id ${m.id}`);
  if (m && m.type !== c.type) E(`audio collection ${c.id}: type ${m.type} in the manifest, ${c.type} in index.json`);
  if (!audioIdx.reciters.some(r => r.id === c.reciter)) E(`audio collection ${c.id}: unknown reciter ${c.reciter}`);
  const pr = perm?.collections?.[c.id];
  if (!pr) E(`permission.json has no record for collection ${c.id} (AUD-33)`);
  else if (pr.granted !== c.permission.granted) E(`collection ${c.id}: permission.granted differs between index.json and permission.json`);
  if (m && m.type === 'quran' && m.items.some(it => it.kind === 'part')) quranCollections.push(m);
}

// ---------- round types vs registry (DATA-23, ARCH-02) ----------
for (const t of rt?.types || []) {
  if (!hasType(t.id)) E(`round type ${t.id} has no module in the registry`);
  else for (const ctx of ['exam', 'random']) if (isGradable(t.id, ctx) !== t.gradable[ctx]) E(`round type ${t.id}: gradable.${ctx} differs between round-types.json and its module`);
}

// ---------- Tuhfa (DATA-15/16/17, LIC-10) ----------
if (tuhfa) {
  const src = path.join(ROOT, 'data/source', tuhfa.source.file);
  if (fs.existsSync(src)) {
    const raw = fs.readFileSync(src); const s = JSON.parse(raw.toString('utf8'));
    if (sha256(raw) !== tuhfa.source.sha256) E('abyat.json: source sha256 differs from data/source/tuhfa-tashkeel.json (run import-tuhfa)');
    for (const k of Object.keys(s)) if (JSON.stringify(s[k]) !== JSON.stringify(tuhfa.abyat[k])) E(`abyat.json: bayt ${k} differs from the source (must be byte-exact)`);
  }
  let expect = 1;
  for (const c of tuhfa.chapters) { if (c.from !== expect || c.to < c.from) E(`chapter ${c.n}: boundaries ${c.from}-${c.to} not contiguous`); expect = c.to + 1; }
  if (expect !== 62) E('chapters do not end at bayt 61');
  const pend = Object.entries(tuhfa.review).filter(([, v]) => v !== 'verified').map(([k]) => k);
  if (pend.length) warn(`Tuhfa abyat under review: ${pend.join(', ')} (DATA-17)`);
}

// ---------- Quran (TST-11) ----------
const q2 = fs.existsSync(path.join(SITE, 'data/quran/002.json')) ? check('data/quran/002.json', 'quran-sura') : null;
const qsrc = q2 ? check('data/quran/source.json', 'quran-source') : null;
const quran = new Map(); // sura → its shipped file (every data/quran/NNN.json)
if (q2 && qsrc) {
  const T = fs.existsSync(QURAN_SRC.uthmani) ? parseTanzil(fs.readFileSync(QURAN_SRC.uthmani).toString('utf8')).suras : null;
  if (T && sha256(fs.readFileSync(QURAN_SRC.uthmani)) !== qsrc.sha256) E('data/source/quran-uthmani.txt sha256 differs from source.json');
  if (!T) warn('data/source/quran-uthmani.txt absent: byte check skipped');
  for (const f of fs.readdirSync(path.join(SITE, 'data/quran')).filter(x => /^\d{3}\.json$/.test(x)).sort()) {
    const q = f === '002.json' ? q2 : check('data/quran/' + f, 'quran-sura'); if (!q) continue;
    const n = q.sura;
    if (String(n).padStart(3, '0') + '.json' !== f) E(`${f}: sura is ${n}`);
    if (!q.notice || q.notice !== qsrc.notice) E(`${f}: Tanzil notice missing or different from source.json (DATA-12)`);
    quran.set(n, q);
    if (!T) continue;
    const src = T.get(n);
    src.forEach((v, i) => { const mine = i === 0 && q.basmalaPrefixed ? q.basmala + ' ' + q.ayat[0] : q.ayat[i]; if (mine !== v) E(`${n}:${i + 1} is not byte-equal to the Tanzil download`); });
    if (q.basmala !== T.get(1)[0]) E(`${f}: basmala is not Tanzil 1:1`);
    if (src.length !== q.ayat.length) E(`${f} verse count differs from Tanzil`);
    else ok(`Quran: ${src.length} verses of sura ${n}${n === 2 ? ' (Al-Baqarah)' : ''} byte-equal to the Tanzil download${n === 2 ? ` (options ${JSON.stringify(qsrc.options)})` : ''}`);
  }
  if (meta?.provisional) E('meta.json is provisional while the Quran text is present: run tools/import-tanzil.mjs');
  if (meta && !meta.provisional && (meta.pages.length !== 604 || meta.rubs.length !== 240)) E('meta.json must have 604 pages and 240 rub\'');
  check('data/quran/rub-openings.json', 'rub-openings');
} else warn('Quran text not imported (site/data/quran/002.json missing): Baqarah exams cannot be validated');

// ---------- Quran recitation collections (AUD-34, RNG-02): part files with verse timings ----------
for (const m of quranCollections) {
  const where = `data/audio/${m.id}.json`;
  validate(schema('recitation-segments'), m.segments || {}).slice(0, 10).forEach(x => E(`${where} segments: ${x}`));
  const seen = new Map(); let nv = 0, nc = 0;
  const ayas = s => meta?.suras?.[s - 1]?.ayas;
  for (const it of m.items) {
    if (it.kind !== 'part') { E(`${where}: ${it.id} is not a part item`); continue; }
    const id = it.id.replace(/^part:/, ''), seg = m.segments?.[id], w = `${where} ${id}`;
    if (!seg || !Array.isArray(seg.verses) || !Array.isArray(seg.cues)) { E(`${w}: no segments for this part`); continue; }
    if (!(it.dur > 0) || !(it.end > 0) || it.end > it.dur + 0.01) E(`${w}: end ${it.end} must lie inside the file (dur ${it.dur})`);
    // AUD-37: an extra is a passage after the recitation of the part (it is not Quran text and has no verses)
    for (const x of it.extras || []) if (!(x.start >= it.end) || !(x.end > x.start + 1) || x.end > it.dur + 0.01) E(`${w}: extra ${x.id} must lie after the recitation and inside the file`);
    // verses: in mushaf order without gaps from `from` to `to`; a basmala entry only right before verse 1 of its sura
    const vs = seg.verses.filter(v => /^\d+:\d+$/.test(v[0])).map(v => v[0].split(':').map(Number));
    if (!vs.length) { E(`${w}: no verses`); continue; }
    if (vs[0].join(':') !== it.from || vs[vs.length - 1].join(':') !== it.to) E(`${w}: verses run ${vs[0].join(':')}–${vs[vs.length - 1].join(':')}, the item says ${it.from}–${it.to}`);
    vs.forEach(([s, a], i) => {
      if (!ayas(s) || a < 1 || a > ayas(s)) E(`${w}: ${s}:${a} is not a verse`);
      if (i) { const [ps, pa] = vs[i - 1]; const want = pa < ayas(ps) ? [ps, pa + 1] : [ps + 1, 1]; if (want[0] !== s || want[1] !== a) E(`${w}: ${s}:${a} follows ${ps}:${pa} (gap or wrong order)`); }
      if (seen.has(`${s}:${a}`)) E(`${w}: ${s}:${a} is also in part ${seen.get(`${s}:${a}`)}`); else seen.set(`${s}:${a}`, id);
      if (!quran.has(s)) E(`${w}: sura ${s} has no text file in data/quran/ (run tools/import-tanzil.mjs with this sura; STG-10)`);
    });
    let prevB = -1; const keys = new Map();
    seg.verses.forEach(([k, b, st], i) => {
      if (keys.has(k)) E(`${w}: ${k} appears twice`); keys.set(k, i);
      if (!(b > prevB)) E(`${w}: boundary of ${k} (${b}) is not after the one before it`);
      if (st < b) E(`${w}: ${k} starts (${st}) before its boundary (${b})`);
      if (st >= it.end) E(`${w}: ${k} starts after the end of the recitation`);
      prevB = b;
      const bm = /^bas(\d+)$/.exec(k);
      if (bm && seg.verses[i + 1]?.[0] !== `${bm[1]}:1`) E(`${w}: ${k} is not followed by ${bm[1]}:1`);
      if (k === 'pre0' && i !== 0) E(`${w}: pre0 must open the part`);
    });
    let prevT = -1;
    for (const [t, k, word] of seg.cues) {
      if (!keys.has(k)) { E(`${w}: cue at ${t} names ${k}, which is not in this part`); continue; }
      if (t < prevT) E(`${w}: cue at ${t} is out of order`); prevT = t;
      const i = keys.get(k), next = seg.verses[i + 1];
      if (t < seg.verses[i][2] - 0.01 || (next && t >= next[2])) E(`${w}: cue at ${t} lies outside ${k}`);
      const vm = /^(\d+):(\d+)$/.exec(k), text = vm && quran.get(+vm[1])?.ayat[+vm[2] - 1];
      if (text && word > wordCount(text, 'q')) E(`${w}: cue at ${t}: word ${word} of ${k}, which has ${wordCount(text, 'q')} words`);
      nc++;
    }
    nv += vs.length;
  }
  // the manifest is what the writer produces from the committed timings
  const srcFile = m.source?.file && path.join(ROOT, m.source.file);
  if (srcFile && fs.existsSync(srcFile) && fs.existsSync(QURAN_SRC.simple) && fs.existsSync(QURAN_SRC.uthmani)) {
    const raw = fs.readFileSync(srcFile);
    if (sha256(raw) !== m.source.sha256) E(`${where}: ${m.source.file} changed since the manifest was written (run tools/audio/import-recitation.mjs --id ${m.id})`);
    else if (JSON.stringify(convert({ ...JSON.parse(raw.toString('utf8')), id: m.id }, tanzilTexts()).segments) !== JSON.stringify(m.segments)) E(`${where}: segments differ from what tools/audio/import-recitation.mjs writes`);
  } else warn(`${where}: timing source absent, manifest not compared with it`);
  ok(`${m.id}: ${m.items.length} part files, ${nv} verses, ${nc} cues valid`);
}

// ---------- exams (DATA-20…24, LIC-04) ----------
const corpus = {
  verse: (s, a) => (s === 2 && q2 ? q2.ayat[a - 1] : undefined), // exams are about Al-Baqarah only
  bayt: b => tuhfa?.abyat[b]
};
const EXPECT = { 'baqarah-1': { total: 59, pages: 8, next: 13, 'topic-end': 7, 'repeated-word': 9, lookalikes: 9, 'mid-verse': 8, chain: 5 }, 'baqarah-2': { total: 61 }, tuhfa: { total: 86 } };
const pageStart = p => meta?.pages?.[p - 1];
const allIds = new Set();
for (const e of idx?.exams || []) {
  if (e.status !== 'published') continue;
  if (e.kind === 'quran' && !q2) { warn(`${e.id}: skipped (no Quran text)`); continue; }
  const ex = check('data/exams/' + e.file, 'exam'); if (!ex) continue;
  if (ex.id !== e.id) E(`${e.file}: id ${ex.id} differs from index ${e.id}`);
  const isQ = e.kind === 'quran';
  const retired = new Set(ex.retired || []);
  const counts = {};
  const res = (ref, where, it = {}) => {
    try { parseRef(ref); } catch (err) { E(`${where}: ${err.message}`); return null; }
    try { resolveRef(ref, corpus); } catch (err) { E(`${where}: ${ref} does not resolve (${err.message})`); return null; }
    const p = parseRef(ref);
    if ((p.kind === 'q') === isQ && !it.outOfRange) {
      const lo = p.kind === 'q' ? p.aya : p.bayt, hi = p.kind === 'q' ? p.ayaTo : p.bayt;
      if (lo < e.range[0] || hi > e.range[1]) E(`${where}: ${ref} is outside the exam range ${e.range.join('-')} and not marked outOfRange`);
    }
    return p;
  };
  const inline = (s, where) => { if (typeof s !== 'string') return; for (const part of splitInline(s)) if (part.refs) part.refs.forEach(r => { try { resolveRef(r, corpus); } catch (err) { E(`${where}: inline ${r} does not resolve (${err.message})`); } }); };
  const items = (list, where) => (list || []).forEach((it, i) => {
    const w = `${where}[${i}]`;
    const x = it.chainFrom != null ? (() => { try { return expandChain(it); } catch (err) { E(`${w}: ${err.message}`); return null; } })() : it;
    if (!x) return;
    if (x.chain) { x.chain.forEach((c, j) => { if (c.ref) res(c.ref, `${w}.chain[${j}]`, c); }); return; }
    const kinds = ['ref', 'refs', 'text'].filter(k => x[k] != null);
    if (kinds.length !== 1) E(`${w}: exactly one of ref, refs, text must be set`);
    if (x.ref) res(x.ref, w, x);
    (x.refs || []).forEach((r, j) => res(r, `${w}.refs[${j}]`, x));
    inline(x.text, w); inline(x.note, w + '.note');
  });
  for (const q of ex.questions) {
    const m = /^([a-z0-9-]+)\/([a-z-]+)\/(\d{2,})$/.exec(q.id);
    if (!m || m[1] !== e.id || m[2] !== q.type) E(`${q.id}: id must be <examId>/<type>/<nn>`);
    if (allIds.has(q.id)) E(`${q.id}: duplicate id`); allIds.add(q.id);
    if (retired.has(q.id)) E(`${q.id}: reuses a retired id`);
    if (!rt.types.some(t => t.id === q.type) || !hasType(q.type)) E(`${q.id}: unknown type ${q.type}`);
    if (!ex.rounds.includes(q.type)) E(`${q.id}: type ${q.type} is not in the exam's rounds`);
    counts[q.type] = (counts[q.type] || 0) + 1;
    items(q.prompt, q.id + '.prompt'); items(q.answer, q.id + '.answer');
    inline(q.ask, q.id + '.ask'); inline(q.tip, q.id + '.tip');
    if (q.type === 'pages' && isQ) {
      if (!q.page && !q.ask) E(`${q.id}: pages question needs page or ask`);
      if (q.page && meta && !meta.provisional) { // LIC-04: page fields vs meta.pages
        const ans = parseRef(q.answer[0].ref || q.answer[0].refs[0]);
        const pr = parseRef(q.prompt[0].ref || q.prompt[0].refs[0]);
        if (q.page.dir === 'forward') {
          const st = pageStart(q.page.to);
          if (!st || st[0] !== 2 || st[1] !== ans.aya) E(`${q.id}: page ${q.page.to} starts at ${st}, answer is 2:${ans.aya}`);
          if (st && st[1] - 1 !== pr.aya) E(`${q.id}: prompt 2:${pr.aya} is not the last verse of page ${q.page.from}`);
        } else {
          const st = pageStart(q.page.from);
          if (!st || st[1] !== pr.aya) E(`${q.id}: page ${q.page.from} starts at ${st}, prompt is 2:${pr.aya}`);
          if (st && st[1] - 1 !== ans.aya) E(`${q.id}: answer 2:${ans.aya} is not the verse before page ${q.page.from}`);
        }
      }
    }
  }
  for (const b of ex.summary || []) {
    (b.items || []).forEach((it, i) => {
      const w = `${e.id}.summary.${b.kind}[${i}]`;
      inline(it.text, w);
      if (it.ref) res(it.ref, w, { outOfRange: 'context' });
      if (b.kind === 'pageStarts' && meta && !meta.provisional) { const st = pageStart(it.page); const p = parseRef(it.ref); if (!st || st[1] !== p.aya || (p.words && (p.words.from ?? 1) !== 1)) E(`${w}: page ${it.page} starts at ${st}, item is ${it.ref}`); }
      if (b.kind === 'lookalikes') (it.refs || []).forEach(r => res(r, w, { outOfRange: 'lookalike' }));
    });
  }
  const want = EXPECT[e.id];
  if (want) {
    if (ex.questions.length !== want.total) E(`${e.id}: ${ex.questions.length} questions, DATA-24 expects ${want.total} (explain in tools/port/porting-log.md)`);
    for (const [t, c] of Object.entries(want)) if (t !== 'total' && counts[t] !== c) E(`${e.id}: ${counts[t] || 0} ${t} questions, DATA-24 expects ${c}`);
  }
  if (ex.ported && ex.ported.status !== 'complete') warn(`${e.id}: ported.status = ${ex.ported.status}`);
  ok(`${e.id}: ${ex.questions.length} questions valid`);
}

if (errors) { console.error(`\n${errors} data error(s)`); process.exit(1); }
ok('data valid');

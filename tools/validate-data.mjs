#!/usr/bin/env node
// Data validation (TST-10) and Quran byte check (TST-11).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SITE, readJson, tryJson, sha256, parseTanzil, QURAN_SRC, ok, fail, warn } from './lib/util.mjs';
import { validate } from '../site/assets/js/core/schema.js';
import { parseRef, resolveRef, splitInline, expandChain } from '../site/assets/js/core/refs.js';
import { hasType, isGradable } from '../site/assets/js/core/registry.js';
import { BACKUP_SCHEMA } from '../site/assets/js/core/backup.js';

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
for (const c of audioIdx?.collections || []) {
  const m = check('data/audio/' + c.manifest, 'audio-collection');
  if (m && m.id !== c.id) E(`audio collection ${c.id}: manifest id ${m.id}`);
  const pr = perm?.collections?.[c.id];
  if (!pr) E(`permission.json has no record for collection ${c.id} (AUD-33)`);
  else if (pr.granted !== c.permission.granted) E(`collection ${c.id}: permission.granted differs between index.json and permission.json`);
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
if (q2 && qsrc) {
  if (!q2.notice || q2.notice !== qsrc.notice) E('002.json: Tanzil notice missing or different from source.json (DATA-12)');
  if (fs.existsSync(QURAN_SRC.uthmani)) {
    const raw = fs.readFileSync(QURAN_SRC.uthmani);
    if (sha256(raw) !== qsrc.sha256) E('data/source/quran-uthmani.txt sha256 differs from source.json');
    const T = parseTanzil(raw.toString('utf8')).suras.get(2);
    T.forEach((v, i) => { const mine = i === 0 && q2.basmalaPrefixed ? q2.basmala + ' ' + q2.ayat[0] : q2.ayat[i]; if (mine !== v) E(`2:${i + 1} is not byte-equal to the Tanzil download`); });
    if (T.length !== q2.ayat.length) E('002.json verse count differs from Tanzil');
    else ok(`Quran: ${T.length} verses of Al-Baqarah byte-equal to the Tanzil download (options ${JSON.stringify(qsrc.options)})`);
  } else warn('data/source/quran-uthmani.txt absent: byte check skipped');
  if (meta?.provisional) E('meta.json is provisional while the Quran text is present: run tools/import-tanzil.mjs');
  if (meta && !meta.provisional && (meta.pages.length !== 604 || meta.rubs.length !== 240)) E('meta.json must have 604 pages and 240 rub\'');
  check('data/quran/rub-openings.json', 'rub-openings');
} else warn('Quran text not imported (site/data/quran/002.json missing): Baqarah exams cannot be validated');

// ---------- exams (DATA-20…24, LIC-04) ----------
const corpus = {
  verse: (s, a) => (s === 2 && q2 ? q2.ayat[a - 1] : undefined),
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

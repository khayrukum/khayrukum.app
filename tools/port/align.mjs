#!/usr/bin/env node
// Porting step 2 (DATA-25, DATA-26, LIC-05): convert every baseline phrase into references.
//
//   node tools/port/align.mjs            # port every exam whose corpus is available
//   node tools/port/align.mjs --check    # dry run: print the table summary, write nothing, exit 1 on mismatch
//   node tools/port/align.mjs --force    # overwrite exam files already marked ported:"complete"
//
// Inputs : tools/port/baseline/*.json (extract-baseline.mjs), tools/port/drafts/*.summary.json,
//          tools/port/patches.json, tools/port/align-overrides.json,
//          site/data/quran/002.json (Uthmani, from import-tanzil.mjs), data/source/quran-simple-clean.txt,
//          site/data/tuhfa/abyat.json.
// Outputs: site/data/exams/<id>.json, tools/port/alignment-table.tsv, tools/port/porting-log.md
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SITE, readJson, tryJson, writeJson, parseTanzil, QURAN_SRC } from '../lib/util.mjs';
import { numbersIn, arToInt } from '../lib/arabic.mjs';
import { QuranIndex, TuhfaIndex } from './resolve.mjs';
import { parseRef } from '../../site/assets/js/core/refs.js';

const PORT = path.join(ROOT, 'tools/port');
const args = new Set(process.argv.slice(2));
const CHECK = args.has('--check'), FORCE = args.has('--force');

const EXAMS = {
  'baqarah-1': { kind: 'quran', range: [1, 43] },
  'baqarah-2': { kind: 'quran', range: [44, 74] },
  tuhfa: { kind: 'tuhfa', range: [1, 61] }
};
const TYPE_MAP = {
  quran: { sum: 'summary', pages: 'pages', next: 'next', topics: 'topic-end', words: 'repeated-word', twins: 'lookalikes', mid: 'mid-verse', chain: 'chain', rand: 'random-number' },
  tuhfa: { sum: 'summary', abwab: 'chapters', half: 'complete-hemistich', next: 'next-bayt', which: 'bayt-topic', codes: 'codes', quran: 'quran-to-tuhfa', chain: 'chain', rand: 'random-number' }
};

class PendingQuran extends Error {}

// ---------- corpora ----------
let qIndex = null;
const q002 = tryJson(path.join(SITE, 'data/quran/002.json'));
if (q002 && fs.existsSync(QURAN_SRC.simple)) {
  const simple = parseTanzil(fs.readFileSync(QURAN_SRC.simple, 'utf8')).suras;
  const s2 = simple.get(2).slice();
  const bas = simple.get(1)[0];
  if (s2[0].startsWith(bas + ' ')) s2[0] = s2[0].slice(bas.length + 1);
  qIndex = new QuranIndex(2, q002.ayat, s2);
}
const abyat = readJson(path.join(SITE, 'data/tuhfa/abyat.json'));
const tIndex = new TuhfaIndex(abyat.abyat);
const overrides = tryJson(path.join(PORT, 'align-overrides.json')) || {};
const patches = tryJson(path.join(PORT, 'patches.json')) || {};
const roundTypes = readJson(path.join(SITE, 'data/round-types.json')).types;

const table = []; // qid · field · baseline phrase · ref · normalized source phrase · status · reason
const log = [];   // porting log entries
const summaryRows = {};

// ---------- phrase parsing ----------
function parsePhrase(raw) {
  let s = raw.trim(); const o = {};
  if (s.startsWith('…')) { o.dots = 'before'; s = s.slice(1).trim(); }
  if (s.endsWith('…')) { o.dots = o.dots ? 'both' : 'after'; s = s.slice(0, -1).trim(); }
  const m = /\s*\(([^()]*)\)\s*$/.exec(s);
  if (m) { o.note = m[1].trim(); s = s.slice(0, m.index).trim(); }
  if (s.endsWith('…')) { o.dots = o.dots === 'before' ? 'both' : 'after'; s = s.slice(0, -1).trim(); }
  o.parts = s.split('…').map(x => x.trim()).filter(Boolean);
  return o;
}

function resolve(ctx, corpus, phrase, hints, field, opts = {}) {
  const key = `${ctx.qid}|${field}|${phrase}`;
  const ov = overrides[key];
  if (ov) {
    if (!ov.reason) throw new Error('override without reason: ' + key);
    table.push([ctx.qid, field, phrase, ov.ref || ('text:' + ov.text), '', 'override', ov.reason]);
    return ov.ref ? { ref: ov.ref } : { text: ov.text };
  }
  let r;
  if (corpus === 'q') {
    if (!qIndex) throw new PendingQuran(phrase);
    r = qIndex.find(phrase, hints, ctx.scope, opts);
  } else r = tIndex.find(phrase, hints, opts);
  table.push([ctx.qid, field, phrase, r.ref || '', r.norm || '', r.status, r.why || (r.ambiguous ? 'first of several occurrences' : '')]);
  if (r.status !== 'match') return { mismatch: true, text: phrase };
  return { ref: r.ref };
}

/** Draft item → final item. Draft: {q|t: phrase, in:[n]} | {ref} | {text} plus dots/note/label/showRef. */
function draftToItem(ctx, d, field) {
  const out = {};
  if (d.ref) out.ref = d.ref;
  else if (d.text != null) out.text = d.q === undefined ? tokenize(ctx, d.text, ctx.quoteCorpus, d.in || ctx.hints, field) : d.text;
  else {
    const corpus = d.q != null ? 'q' : 't';
    const p = d.q != null ? d.q : d.t;
    const parts = d.parts || [p];
    const refs = parts.map(x => resolve(ctx, corpus, x, d.in || ctx.hints, field, { anchor: d.anchor }));
    if (refs.some(r => r.text != null && !r.ref)) {
      if (refs.length === 1 && !refs[0].mismatch) { out.text = refs[0].text; }
      else { ctx.mismatch = true; out.text = parts.join(' … '); }
    } else if (refs.length === 1) out.ref = refs[0].ref;
    else { out.refs = refs.map(r => r.ref); out.join = 'dots'; }
  }
  for (const k of ['dots', 'label', 'showRef', 'outOfRange']) if (d[k] != null) out[k] = d[k];
  if (d.note != null) out.note = tokenize(ctx, d.note, d.noteCorpus || ctx.quoteCorpus, d.in || ctx.hints, field + '.note');
  return out;
}

/** Phrase string from the baseline → draft item. */
function phraseDraft(raw, corpus, hints, extra = {}) {
  const p = parsePhrase(raw);
  const d = { [corpus]: p.parts.join(' '), in: hints, ...extra };
  if (p.parts.length > 1) d.parts = p.parts;
  if (p.dots) d.dots = p.dots;
  if (p.note != null) {
    const nums = numbersIn(p.note);
    if (/^[٠-٩]+$/.test(p.note)) { d.showRef = true; d.in = [arToInt(p.note)]; }
    else { d.note = p.note; if (nums.length && corpus === 'q' && /البقرة/.test(p.note)) d.in = nums.concat(hints); }
  }
  return d;
}

/** «A / B (note)» → two items separated by «/»; the note goes on the last one. */
function slashDraft(raw, corpus, hints) {
  if (!raw.includes('/')) return [phraseDraft(raw, corpus, hints)];
  const m = /\s*\(([^()]*)\)\s*$/.exec(raw);
  const body = m ? raw.slice(0, m.index) : raw;
  const parts = body.split(/\s*\/\s*/).map(x => x.trim()).filter(Boolean);
  const out = [];
  parts.forEach((p, i) => {
    const d = phraseDraft(p + (i === parts.length - 1 && m ? ` (${m[1]})` : ''), corpus, hints);
    if (i === parts.length - 1 && m && corpus === 'q' && /البقرة/.test(m[1])) { const ns = numbersIn(m[1]); d.in = ns.length === 2 ? rangeN(ns[0], ns[1]) : ns; }
    else if (m && corpus === 'q' && /البقرة/.test(m[1])) { const ns = numbersIn(m[1]); d.in = ns.length === 2 ? rangeN(ns[0], ns[1]) : ns; }
    if (i) out.push({ text: '/' });
    out.push(d);
  });
  return out;
}
const rangeN = (a, b) => { const o = []; for (let x = a; x <= b; x++) o.push(x); return o; };

/** Replace «quotes» in a content string with inline tokens (DATA-02). */
function tokenize(ctx, str, corpus, hints, field) {
  if (typeof str !== 'string' || !str.includes('«')) return str;
  return str.replace(/«([^«»]+)»/g, (all, inner) => {
    if (inner.includes('[[')) return all;
    if ((ctx.plainQuotes || []).includes(inner)) return all;
    const words = inner.trim().split(/\s+/).filter(w => /[\u0600-\u06FF]/.test(w));
    const extraHints = numbersIn(str);
    const h = [...(hints || []), ...(corpus === 'q' ? extraHints : [])];
    if (words.length < 2) {
      // single words: tokenize only when found among the hints; otherwise keep (allowed by DATA-02)
      try {
        const key = `${ctx.qid}|${field}|${inner}`;
        if (overrides[key]) { const r = resolve(ctx, corpus, inner, h, field); return r.ref ? `«[[${corpus}:${r.ref.replace(/^t:/, '')}]]»` : all; }
        if (corpus === 'q' && !qIndex) return all;
        const f1 = v => corpus === 'q' ? qIndex.find(inner, [v], null, { hintsOnly: true }) : tIndex.find(inner, [v], { hintsOnly: true });
        const hits = [...new Set(h)].filter(v => f1(v).status === 'match');
        const r = hits.length === 1 ? f1(hits[0]) : { status: 'skip' }; // only when exactly one hinted verse/bayt has it
        if (r.status === 'match') { table.push([ctx.qid, field, inner, r.ref, r.norm, 'match', 'single word']); return `«[[${corpus}:${r.ref.replace(/^t:/, '')}]]»`; }
      } catch (e) { if (!(e instanceof PendingQuran)) throw e; }
      return all;
    }
    if (inner.includes('/')) { ctx.unlisted = (ctx.unlisted || []).concat(inner); return all; }
    const parts = inner.split('…').map(x => x.trim()).filter(Boolean);
    const refs = parts.map(p => resolve(ctx, corpus, p, h, field));
    if (refs.some(r => !r.ref)) { if (refs.some(r => r.mismatch)) ctx.mismatch = true; return all; }
    return `«[[${corpus}:${refs.map(r => r.ref.replace(/^t:/, '')).join('|')}]]»`;
  });
}

// ---------- per-question conversion ----------
function askPage(ask) {
  let m;
  if ((m = /^آخر صفحة ([٠-٩]+)، فما أول صفحة ([٠-٩]+)؟$/.exec(ask))) return { from: arToInt(m[1]), to: arToInt(m[2]), dir: 'forward' };
  if ((m = /^بالعكس: هذه أول صفحة ([٠-٩]+)، فما آخر صفحة ([٠-٩]+)؟$/.exec(ask))) return { from: arToInt(m[1]), to: arToInt(m[2]), dir: 'back' };
  if ((m = /^بالعكس: هذه أول صفحة ([٠-٩]+)، فما الآية التي قبلها؟$/.exec(ask))) return { from: arToInt(m[1]), to: arToInt(m[1]) - 1, dir: 'back', changed: true };
  return null;
}
export function pageAsk(p) {
  const ar = n => Number(n).toLocaleString('ar-EG', { useGrouping: false });
  return p.dir === 'back' ? `بالعكس: هذه أول صفحة ${ar(p.from)}، فما آخر صفحة ${ar(p.to)}؟` : `آخر صفحة ${ar(p.from)}، فما أول صفحة ${ar(p.to)}؟`;
}

function chainDraft(raw, q, corpus) {
  const text = raw.a[0][1];
  const entries = text.split(' · ').map(s => s.trim());
  const nums = numbersIn(raw.ask || '');
  let seq = null;
  if (nums.length >= 2) {
    const [a, b] = nums.slice(-2); const step = b >= a ? 1 : -1; seq = [];
    for (let x = a; ; x += step) { seq.push(x); if (x === b) break; }
  }
  const items = entries.map((e, i) => {
    const p = parsePhrase(e);
    const d = { [corpus]: p.parts.join(' '), anchor: 'start' };
    if (p.note != null && /^[٠-٩]+$/.test(p.note)) { d.in = [arToInt(p.note)]; d.showRef = true; delete d.anchor; }
    else { if (p.note != null) d.note = p.note; d.in = seq && seq.length === entries.length ? [seq[i]] : []; }
    return d;
  });
  if (seq && seq.length !== entries.length && items.some(d => !d.in.length)) q.warn = `chain: ${entries.length} entries for ${seq.length} numbers`;
  return items;
}

function convertQuestion(exam, cfg, roundId, type, raw, idx) {
  const qid = `${exam}/${type}/${String(idx + 1).padStart(2, '0')}`;
  const pkey = `${exam}/${roundId}/${idx}`;
  const patch = patches[pkey];
  if (patch) { if (!patch.reason) throw new Error('patch without reason: ' + pkey); raw = { ...raw, ...patch.set }; log.push({ qid, what: 'patch', old: patches[pkey].old || '', reason: patch.reason }); }
  const isQ = cfg.kind === 'quran';
  const C = isQ ? 'q' : 't';
  const ansNums = raw.a.map(x => x[0]);
  const ctx = { qid, scope: isQ ? cfg.range : null, hints: ansNums, quoteCorpus: C, plainQuotes: cfg.plainQuotes };
  if (type === 'quran-to-tuhfa') ctx.quoteCorpus = 'q';
  const q = { id: qid, type };

  // ask
  let page = null;
  if (type === 'pages' && raw.ask) {
    page = askPage(raw.ask);
    if (page) {
      q.page = { from: page.from, to: page.to, dir: page.dir };
      if (page.changed || pageAsk(page) !== raw.ask) log.push({ qid, what: 'ask generated from the page template (DATA-21)', old: raw.ask, now: pageAsk(page) });
    } else q.ask = raw.ask;
  } else if (raw.ask) q.ask = tokenize(ctx, raw.ask, C, ansNums, 'ask');

  // prompt
  let promptDraft;
  if (raw.promptItems) promptDraft = raw.promptItems;
  else if (typeof raw.p === 'object') {
    const { bayt, part } = raw.p;
    promptDraft = [part === 0 ? { ref: `t:${bayt}` } : part === 1 ? { ref: `t:${bayt}:1`, dots: 'after' } : { ref: `t:${bayt}:2`, dots: 'before' }];
  } else if (raw.p.includes('«') || (type === 'chain' && !(raw.a.length === 1 && raw.a[0][1] && raw.a[0][1].includes(' · ')))) {
    promptDraft = [{ text: raw.p }];
  } else if (type === 'chain') {
    const head = raw.p.split('←')[0].trim();
    const first = chainDraft(raw, q, C)[0];
    promptDraft = [{ ...phraseDraft(head, C, first.in), anchor: 'start' }, { text: '←', dots: 'after' }];
  } else if (type === 'codes') {
    promptDraft = [{ text: raw.p }];
  } else {
    const a = ansNums[0];
    let hints = ansNums;
    if (type === 'pages') hints = page && page.dir === 'back' ? [a + 1] : [a - 1];
    else if (type === 'next' || type === 'topic-end' || type === 'complete-hemistich') hints = [a - 1];
    else if (type === 'mid-verse') hints = [a];
    promptDraft = slashDraft(raw.p, type === 'quran-to-tuhfa' ? 'q' : C, type === 'quran-to-tuhfa' ? [] : hints);
  }

  // answer
  let answerDraft;
  if (raw.answerItems) answerDraft = raw.answerItems;
  else if (type === 'chain' && raw.a.length === 1 && raw.a[0][1] && raw.a[0][1].includes(' · ')) {
    answerDraft = [{ chain: chainDraft(raw, q, C), sep: ' · ' }];
  } else {
    answerDraft = raw.a.map(([n, t]) => {
      if (t == null) return { ref: isQ ? `2:${n}` : `t:${n}` };
      if (type === 'quran-to-tuhfa' || !isQ) {
        const m = /^(.+?):\s*(.+?)\s*\((.+)\)$/.exec(t); // «الكتاب: قمرية (ابغ حجك وخف عقيمه)»
        if (m) return { text: m[1], note: `${m[2]} · «${m[3]}»`, in: [n], noteCorpus: 't' };
      }
      return phraseDraft(t, C, [n]);
    });
  }

  const conv = (drafts, field) => drafts.map((d, i) => {
    if (d.chain) return { chain: d.chain.map((c, j) => draftToItem({ ...ctx, hints: c.in || [] }, c, `${field}[${i}].chain[${j}]`)), sep: d.sep || ' · ' };
    return draftToItem({ ...ctx, hints: d.in || ctx.hints }, d, `${field}[${i}]`);
  });
  const mm = { v: false };
  const ctxCheck = (arr) => arr;
  q.prompt = ctxCheck(conv(promptDraft, 'prompt'));
  q.answer = ctxCheck(conv(answerDraft, 'answer'));
  if (raw.tip) q.tip = tokenize(ctx, raw.tip, ctx.quoteCorpus, ansNums.concat(numbersIn(raw.tip)), 'tip');

  // outOfRange marks (DATA-22)
  const mark = it => {
    const refs = it.ref ? [it.ref] : it.refs || [];
    if (!refs.length) return;
    const r = parseRef(refs[0]);
    const inR = r.kind === 'q' ? (isQ && r.aya >= cfg.range[0] && r.ayaTo <= cfg.range[1]) : (!isQ && r.bayt >= cfg.range[0] && r.bayt <= cfg.range[1]);
    if ((r.kind === 'q') !== isQ) return; // cross-corpus prompt (quran-to-tuhfa): not range-checked
    if (!inR && !it.outOfRange) { it.outOfRange = type === 'pages' ? 'bridge' : type === 'lookalikes' ? 'lookalike' : 'context'; log.push({ qid, what: `ref ${refs[0]} is outside the exam range, marked outOfRange:${it.outOfRange}` }); }
  };
  q.prompt.forEach(mark);
  q.answer.forEach(it => it.chain ? it.chain.forEach(mark) : mark(it));
  void mm;
  return q;
}

function convertSummary(exam, cfg) {
  const draftPath = path.join(PORT, 'drafts', exam + '.summary.json');
  const draft = tryJson(draftPath);
  if (!draft) return [];
  const isQ = cfg.kind === 'quran';
  const C = isQ ? 'q' : 't';
  return draft.blocks.map((b, bi) => {
    const ctx = { qid: `${exam}/summary/${bi + 1}`, scope: isQ ? cfg.range : null, quoteCorpus: C, plainQuotes: cfg.plainQuotes };
    const nums = r => { const m = /^(?:t:)?(?:\d+:)?(\d+)(?:-(\d+))?$/.exec(r); if (!m) return []; const a = +m[1], z = m[2] ? +m[2] : a; const o = []; for (let x = a; x <= z; x++) o.push(x); return o; };
    if (b.kind === 'outline' || b.kind === 'chapters') {
      return { ...b, items: (b.items || []).map((it, ii) => {
        const hints = it.range ? nums(it.range) : it.chapter ? range(abyat.chapters[it.chapter - 1]) : [];
        return { ...it, text: tokenize({ ...ctx, qid: ctx.qid + '.' + (ii + 1) }, it.text, C, hints, 'text') };
      }) };
    }
    if (b.kind === 'lookalikes') {
      return { ...b, items: b.items.map((it, ii) => ({ ...it, text: tokenize({ ...ctx, qid: ctx.qid + '.' + (ii + 1) }, it.text, C, it.refs.flatMap(nums), 'text') })) };
    }
    if (b.kind === 'pageStarts') {
      return { kind: 'pageStarts', ...(b.title ? { title: b.title } : {}), items: b.items.map((it, ii) => ({ page: it.page, ...draftToItem({ ...ctx, qid: ctx.qid + '.' + (ii + 1), hints: it.in }, { q: it.q, in: it.in, anchor: 'start' }, 'item') })) };
    }
    if (b.kind === 'codes') {
      return { ...b, items: b.items.map((it, ii) => { const d = phraseDraft(it.t, 't', it.in); const o = draftToItem({ ...ctx, qid: ctx.qid + '.' + (ii + 1), hints: it.in }, d, 'item'); return { label: it.label, ...o }; }) };
    }
    return b;
  });
}
const range = ch => { const o = []; for (let x = ch.from; x <= ch.to; x++) o.push(x); return o; };

// ---------- main ----------
const results = [];
for (const [exam, cfg0] of Object.entries(EXAMS)) {
  const base = readJson(path.join(PORT, 'baseline', exam + '.json'));
  const draftCfg = tryJson(path.join(PORT, 'drafts', exam + '.summary.json')) || {};
  const cfg = { ...cfg0, plainQuotes: draftCfg.plainQuotes || [] };
  const outPath = path.join(SITE, 'data/exams', exam + '.json');
  const existing = tryJson(outPath);
  if (existing?.ported?.status === 'complete' && !FORCE && !CHECK) { console.log(`${exam}: already ported (complete); use --force to redo`); results.push({ exam, skipped: true }); continue; }
  if (cfg.kind === 'quran' && !qIndex) {
    console.log(`\x1b[33m${exam}: SKIPPED — Quran text missing (site/data/quran/002.json from import-tanzil.mjs, and data/source/quran-simple-clean.txt). See CONTENT-TODO.md\x1b[0m`);
    results.push({ exam, pending: true }); continue;
  }
  const map = TYPE_MAP[cfg.kind];
  const questions = []; const pending = []; const rounds = []; const roundText = {};
  let mismatches = 0;
  for (const r of base.rounds) {
    const type = map[r.id];
    rounds.push(type);
    const rt = roundTypes.find(t => t.id === type);
    const kindKey = cfg.kind === 'quran' ? 'quran' : 'tuhfa';
    if (rt && rt.intro?.[kindKey] !== r.d) roundText[type] = { intro: r.d };
    if (rt && rt.title?.[kindKey] !== r.t) roundText[type] = { ...(roundText[type] || {}), title: r.t };
    r.qs.forEach((raw, i) => {
      const before = table.filter(x => x[5] === 'mismatch').length;
      try {
        const q = convertQuestion(exam, cfg, r.id, type, raw, i);
        questions.push(q);
        const after = table.filter(x => x[5] === 'mismatch').length;
        mismatches += after - before;
      } catch (e) {
        if (e instanceof PendingQuran) pending.push(`${exam}/${type}/${String(i + 1).padStart(2, '0')}`);
        else throw e;
      }
    });
  }
  const summary = (() => { try { return convertSummary(exam, cfg); } catch (e) { if (e instanceof PendingQuran) { pending.push(`${exam}/summary`); return null; } throw e; } })();
  mismatches += table.filter(x => x[0].startsWith(exam + "/summary") && x[5] === "mismatch").length;
  const status = pending.length ? "partial" : mismatches ? "mismatch" : "complete";
  const doc = {
    schema: 'exam', version: existing?.version || '1.0.0', id: exam,
    ported: { from: base.source, tool: 'tools/port/align.mjs', status, ...(pending.length ? { pending } : {}) },
    summary: summary || [],
    rounds, roundText, plainQuotes: cfg.plainQuotes, questions, retired: existing?.retired || []
  };
  results.push({ exam, n: questions.length, pending: pending.length, mismatches, status });
  if (!CHECK) writeJson(outPath, doc);
  else if (existing && JSON.stringify(existing.questions) !== JSON.stringify(doc.questions)) console.log(`\x1b[33m${exam}: the exam file was edited after porting (expected for maintained content)\x1b[0m`);
}

// ---------- reports ----------
if (!CHECK) {
  const tsv = ['qid\tfield\tbaseline phrase\tref\tnormalized source phrase\tstatus\treason', ...table.map(r => r.map(x => String(x).replace(/\t/g, ' ')).join('\t'))].join('\n') + '\n';
  fs.writeFileSync(path.join(PORT, 'alignment-table.tsv'), tsv);
  const manual = fs.existsSync(path.join(PORT, 'porting-notes.md')) ? fs.readFileSync(path.join(PORT, 'porting-notes.md'), 'utf8') : '';
  const lines = ['# Porting log (DATA-26)', '', 'Generated by `tools/port/align.mjs`. Lists every question whose content changed while porting.', '',
    '| Exam | Questions | Pending (needs Quran text) | Mismatches | Status |', '|---|---|---|---|---|',
    ...results.map(r => `| ${r.exam} | ${r.n ?? '—'} | ${r.pending === true ? 'all' : r.pending ?? 0} | ${r.mismatches ?? '—'} | ${r.skipped ? 'kept (complete)' : r.status || 'not ported'} |`), '',
    '## Automatic changes', '', ...log.map(l => `- \`${l.qid}\`: ${l.what}${l.old ? ` — old: «${l.old}»` : ''}${l.now ? ` → new: «${l.now}»` : ''}${l.reason ? ` — ${l.reason}` : ''}`), '', manual];
  fs.writeFileSync(path.join(PORT, 'porting-log.md'), lines.join('\n'));
}
const counts = table.reduce((a, r) => (a[r[5]] = (a[r[5]] || 0) + 1, a), {});
console.log('alignment rows:', JSON.stringify(counts));
for (const r of results) console.log(`${r.exam}: ${r.skipped ? 'kept' : r.pending === true ? 'pending Quran text' : `${r.n} questions, ${r.pending} pending, ${r.mismatches} mismatches → ${r.status}`}`);
const bad = table.filter(r => r[5] === 'mismatch');
if (bad.length) { console.log('\nMismatches (add entries to tools/port/align-overrides.json, key "qid|field|phrase"):'); bad.forEach(r => console.log('  ' + r.slice(0, 3).join(' | ') + '  — ' + r[6])); process.exitCode = 1; }

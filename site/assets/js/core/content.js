// Content loading: exam index, round types, exam files, Quran and Tuhfa corpora (DATA-1x/2x).
import { getJson } from './base.js';
import { expandChain, parseRef } from './refs.js';
import { S } from './strings.ar.js';
import { n as fmtN } from './fmt.js';

const memo = new Map();
const once = (k, f) => { if (!memo.has(k)) memo.set(k, f().catch(e => { memo.delete(k); throw e; })); return memo.get(k); };

export const loadIndex = () => once('index', () => getJson('data/exams/index.json'));
export const loadRoundTypes = () => once('rt', () => getJson('data/round-types.json'));
export const loadTuhfa = () => once('tuhfa', () => getJson('data/tuhfa/abyat.json'));
export const loadQuran = (sura = 2) => once('q' + sura, () => getJson(`data/quran/${String(sura).padStart(3, '0')}.json`));
export const loadMeta = () => once('meta', () => getJson('data/quran/meta.json'));
export const loadRubOpenings = () => once('rubo', () => getJson('data/quran/rub-openings.json'));
export const loadPlan = () => once('plan', () => getJson('data/plan/baqarah.json'));

/** Corpus accessor used by refs.resolveRef. Missing texts resolve to undefined. */
export async function loadCorpus(kinds = ['quran', 'tuhfa']) {
  const [q, t] = await Promise.all([
    kinds.includes('quran') ? loadQuran(2).catch(() => null) : null,
    kinds.includes('tuhfa') ? loadTuhfa().catch(() => null) : null
  ]);
  return {
    quran: q, tuhfa: t,
    verse: (s, a) => (s === 2 && q ? q.ayat[a - 1] : undefined),
    bayt: b => (t ? t.abyat[b] : undefined),
    review: b => (t ? t.review?.[b] : undefined),
    chapters: t ? t.chapters : []
  };
}

/** Published exams from the index, in order. */
export async function publishedExams() { return (await loadIndex()).exams.filter(e => e.status === 'published'); }

/**
 * Load and normalize an exam file:
 * - chain shorthands expanded (§4.2);
 * - `pages` questions get their generated ask (DATA-21);
 * - rounds carry title/intro from round-types.json, overridable by the exam (EX-06).
 */
export async function loadExam(entry) {
  const [raw, rt] = await Promise.all([getJson('data/exams/' + entry.file), loadRoundTypes()]);
  return normalizeExam(raw, rt, entry);
}

export function normalizeExam(raw, rt, entry) {
  const kind = entry.kind === 'tuhfa' ? 'tuhfa' : 'quran';
  const types = new Map(rt.types.map(t => [t.id, t]));
  const rounds = raw.rounds.map(id => {
    const t = types.get(id) || { id, title: {}, intro: {}, gradable: { exam: true, random: true } };
    const o = raw.roundText?.[id] || {};
    return { id, title: o.title || t.title[kind] || t.title.quran || id, intro: o.intro || t.intro[kind] || t.intro.quran || '', gradable: t.gradable };
  });
  const questions = raw.questions.map(q => {
    const x = { ...q, src: entry.id, kind };
    x.answer = (q.answer || []).map(a => (a.chainFrom != null ? expandChain(a) : a));
    if (q.type === 'pages' && q.page && !q.ask) x.ask = q.page.dir === 'back' ? S.exam.pagesAskBack(fmtN(q.page.from), fmtN(q.page.to)) : S.exam.pagesAsk(fmtN(q.page.from), fmtN(q.page.to));
    return x;
  });
  return { ...raw, entry, kind, rounds, questions, byId: new Map(questions.map(q => [q.id, q])) };
}

/** All answer refs of a question (for ranges, slips and snapshots). */
export function answerRefs(q) {
  const out = [];
  for (const a of q.answer || []) {
    if (a.ref) out.push(a.ref);
    if (a.refs) out.push(...a.refs);
    if (a.chain) a.chain.forEach(c => { if (c.ref) out.push(c.ref); if (c.refs) out.push(...c.refs); });
  }
  return out;
}

/** Distinct verse/bayt numbers of a question's answer, in order. */
export function answerNumbers(q) {
  const seen = []; for (const r of answerRefs(q)) { const p = parseRef(r); const k = p.kind === 'q' ? p.aya : p.bayt; if (!seen.includes(k)) seen.push(k); }
  return seen;
}

/** Rub' list of a sura from meta: [{n, from, to}] clipped to the sura (PL-01). */
export function suraRubs(meta, sura = 2) {
  const ayas = meta.suras.find(s => s.n === sura)?.ayas;
  const out = [];
  meta.rubs.forEach((r, i) => {
    const next = meta.rubs[i + 1];
    const startS = r.sura, endS = next ? (next.aya === 1 ? next.sura - 1 : next.sura) : sura;
    if (startS > sura || endS < sura) return;
    const from = startS < sura ? 1 : r.aya;
    const to = next && next.sura === sura ? next.aya - 1 : ayas;
    if (from <= to) out.push({ n: r.n, from, to });
  });
  return out;
}

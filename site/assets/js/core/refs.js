// Reference grammar (REQUIREMENTS §4.1) and word indexing (DATA-01).
// Pure module: no DOM, no fetch. Used by the pages and by the Node tools.

// Quranic annotation marks (pause marks, ۞, small high letters…): U+06D6–U+06ED.
const MARK_ONLY = /^[ۖ-ۭ‌‍]+$/u;

/** True when a token is made only of Quranic annotation marks (not a word, DATA-01). */
export function isMarkToken(tok) { return MARK_ONLY.test(tok); }

/** Split a stored text (Uthmani verse or hemistich) into tokens on spaces, without changing bytes. */
export function tokens(text) { return text.split(' ').filter(t => t.length > 0); }

/** Index of word tokens (1-based word n → token index). Quran skips mark-only tokens; Tuhfa counts every token. */
export function wordIndex(toks, kind) {
  const idx = [];
  toks.forEach((t, i) => { if (kind !== 'q' || !isMarkToken(t)) idx.push(i); });
  return idx;
}

/** Parse a word selector: "5-9" | "-4" (last 4) | "4-" (4 to end) | "5". */
export function parseWords(s) {
  if (s == null || s === '') return null;
  let m;
  if ((m = /^(\d+)-(\d+)$/.exec(s))) return { from: +m[1], to: +m[2] };
  if ((m = /^-(\d+)$/.exec(s))) return { last: +m[1] };
  if ((m = /^(\d+)-$/.exec(s))) return { from: +m[1], to: 'end' };
  if ((m = /^(\d+)$/.exec(s))) return { from: +m[1], to: +m[1] };
  throw new Error('bad word selector: ' + s);
}

/**
 * Parse one reference.
 *  2:27  2:1-10  2:27:5-9  2:27:-4  2:27:4-
 *  t:16  t:16:1  t:16:2:3-4  t:16:1:-2
 */
export function parseRef(ref) {
  if (typeof ref !== 'string') throw new Error('ref must be a string');
  let m;
  if ((m = /^t:(\d+)(?::([12]))?(?::([0-9-]+))?$/.exec(ref))) {
    const r = { kind: 't', bayt: +m[1], h: m[2] ? +m[2] : 0, words: null, ref };
    if (m[3]) { if (!r.h) throw new Error('tuhfa word range needs a hemistich: ' + ref); r.words = parseWords(m[3]); }
    return r;
  }
  if ((m = /^(\d+):(\d+)-(\d+)$/.exec(ref))) {
    return { kind: 'q', sura: +m[1], aya: +m[2], ayaTo: +m[3], words: null, ref };
  }
  if ((m = /^(\d+):(\d+)(?::([0-9-]+))?$/.exec(ref))) {
    return { kind: 'q', sura: +m[1], aya: +m[2], ayaTo: +m[2], words: m[3] ? parseWords(m[3]) : null, ref };
  }
  throw new Error('bad ref: ' + ref);
}

/** Resolve a word selector against a word count → [from,to] 1-based inclusive, or throw if out of bounds. */
export function wordSpan(sel, count) {
  if (!sel) return [1, count];
  let a, b;
  if (sel.last != null) { a = count - sel.last + 1; b = count; }
  else { a = sel.from; b = sel.to === 'end' ? count : sel.to; }
  if (!(a >= 1 && b <= count && a <= b)) throw new Error(`word range ${a}-${b} out of bounds (1-${count})`);
  return [a, b];
}

/**
 * Select words from a stored text. Returns the exact substring of tokens joined by spaces.
 * A mark token between two selected words is kept; a mark right after the last selected word is not (DATA-01).
 */
export function selectWords(text, sel, kind) {
  const toks = tokens(text);
  const wi = wordIndex(toks, kind);
  const [a, b] = wordSpan(sel, wi.length);
  return toks.slice(wi[a - 1], wi[b - 1] + 1).join(' ');
}

/** First letter of an Arabic word (no diacritics), for the «أوائل الحروف» drill. */
const LETTER = /[\u0621-\u063A\u0641-\u064A\u0671-\u06D3\u06FA-\u06FC]/u;
export function firstLetter(word) { const m = LETTER.exec(word); return m ? m[0] : word; }
/** Tokens of a text as [{ word, letter, mark }] — pause marks stay as they are (they help the reciter). */
export function letterTokens(text, kind) {
  return tokens(text).map(t => (kind === 'q' && isMarkToken(t) ? { word: t, letter: t, mark: true } : { word: t, letter: firstLetter(t), mark: false }));
}

/** Number of words in a stored text. */
export function wordCount(text, kind) { return wordIndex(tokens(text), kind).length; }

/**
 * Resolve a ref against a corpus.
 * corpus = { verse(sura, aya) → string|undefined, bayt(n) → [h1,h2]|undefined }
 * Returns { kind, parts:[{n, text, h?}] } — one part per verse (ranges) or per hemistich.
 */
export function resolveRef(ref, corpus) {
  const r = typeof ref === 'string' ? parseRef(ref) : ref;
  if (r.kind === 'q') {
    const parts = [];
    for (let a = r.aya; a <= r.ayaTo; a++) {
      const v = corpus.verse(r.sura, a);
      if (v == null) throw new Error('unknown verse ' + r.sura + ':' + a);
      parts.push({ n: a, sura: r.sura, text: r.words ? selectWords(v, r.words, 'q') : v, full: !r.words });
    }
    return { kind: 'q', ref: r, parts };
  }
  const b = corpus.bayt(r.bayt);
  if (!b) throw new Error('unknown bayt ' + r.bayt);
  if (!r.h) return { kind: 't', ref: r, parts: [{ n: r.bayt, h: 1, text: b[0] }, { n: r.bayt, h: 2, text: b[1] }], full: true };
  const h = b[r.h - 1];
  return { kind: 't', ref: r, parts: [{ n: r.bayt, h: r.h, text: r.words ? selectWords(h, r.words, 't') : h, full: !r.words }] };
}

/** First verse/bayt number a ref points at (for «آية/بيت <refs>» lists). */
export function refNumber(ref) { const r = parseRef(ref); return r.kind === 'q' ? r.aya : r.bayt; }
export function refRange(ref) { const r = parseRef(ref); return r.kind === 'q' ? [r.aya, r.ayaTo] : [r.bayt, r.bayt]; }

/** Inline tokens: "[[q:2:171:-6]]", "[[t:25:2:2-5]]", "[[q:2:54:4-6|2:54:9-10]]". */
const INLINE = /\[\[(q|t):([^\]]+)\]\]/g;
export function splitInline(str) {
  const out = []; let last = 0; let m;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(str))) {
    if (m.index > last) out.push({ text: str.slice(last, m.index) });
    const refs = m[2].split('|').map(x => (m[1] === 't' ? (x.startsWith('t:') ? x : 't:' + x) : x));
    out.push({ refs });
    last = m.index + m[0].length;
  }
  if (last < str.length) out.push({ text: str.slice(last) });
  return out;
}

/** Collect all refs used by an item (prompt/answer/summary item). */
export function itemRefs(item) {
  if (!item) return [];
  const out = [];
  if (item.ref) out.push(item.ref);
  if (item.refs) out.push(...item.refs);
  if (item.chain) item.chain.forEach(c => out.push(...itemRefs(c)));
  for (const k of ['note', 'text']) if (typeof item[k] === 'string') splitInline(item[k]).forEach(p => p.refs && out.push(...p.refs));
  return out;
}

/**
 * Expand chain shorthand {chainFrom, chainTo, words, override} into an explicit chain (§4.2).
 * chainTo < chainFrom gives a reversed chain.
 */
export function expandChain(item) {
  if (!item || item.chainFrom == null) return item;
  const f = parseRef(item.chainFrom), t = parseRef(item.chainTo);
  if (f.sura !== t.sura) throw new Error('chain across suras');
  const step = t.aya >= f.aya ? 1 : -1;
  const chain = [];
  for (let a = f.aya; ; a += step) {
    const key = f.sura + ':' + a;
    const w = (item.override && item.override[key]) || item.words || 2;
    chain.push({ ref: `${key}:1-${w}` });
    if (a === t.aya) break;
  }
  return { chain, sep: item.sep || ' · ' };
}

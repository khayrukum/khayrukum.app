// Phrase → reference resolution shared by align.mjs and import-tanzil.mjs (DATA-25).
import { normWords, findSpan, alignVerse, normalize } from '../lib/arabic.mjs';
import { tokens, isMarkToken } from '../../site/assets/js/core/refs.js';

/** Index over Surah text: Uthmani (shipped) + Simple-Clean (tool input only). */
export class QuranIndex {
  constructor(sura, uthAyat, simpleAyat) {
    this.sura = sura; this.uth = uthAyat; this.simple = simpleAyat;
    this.cache = new Map();
  }
  count() { return this.uth.length; }
  verse(a) {
    if (this.cache.has(a)) return this.cache.get(a);
    const u = this.uth[a - 1], s = this.simple[a - 1];
    if (u == null || s == null) return null;
    const uw = tokens(u).filter(t => !isMarkToken(t));
    const sw = s.split(' ').filter(w => normalize(w).length > 0); // Simple-Clean keeps waqf/rub' marks: drop them
    const sn = sw.map(w => normalize(w));
    const al = alignVerse(uw, sw);
    const v = { uw, sw, sn, al };
    this.cache.set(a, v);
    return v;
  }
  /**
   * Find a phrase. hints: ordered verse numbers to try first; then `scope` [from,to]; then the whole sura.
   * opts.anchor: 'start' to prefer a match at word 1.
   * Returns { status:'match'|'mismatch', ref?, norm?, verse?, ambiguous?, why? }
   */
  find(phrase, hints = [], scope = null, opts = {}) {
    const needle = normWords(phrase);
    if (!needle.length) return { status: 'mismatch', why: 'empty phrase' };
    const order = [];
    const push = a => { if (a >= 1 && a <= this.count() && !order.includes(a)) order.push(a); };
    hints.forEach(push);
    const tiers = [order.length];
    if (scope) { for (let a = scope[0]; a <= scope[1]; a++) push(a); tiers.push(order.length); }
    if (!opts.hintsOnly) for (let a = 1; a <= this.count(); a++) push(a);
    let tierStart = 0;
    for (const tierEnd of [...tiers, order.length]) {
      const hits = [];
      for (let k = tierStart; k < tierEnd; k++) {
        const a = order[k]; const v = this.verse(a); if (!v) continue;
        let spans = findSpan(v.sn, needle);
        if (opts.anchor === 'start' && spans.includes(0)) spans = [0];
        if (spans.length) hits.push({ a, spans, v });
      }
      if (hits.length) {
        const h = hits[0];
        const s = h.spans[0], e = s + needle.length - 1;
        const ui = h.v.al.map[s], uj = h.v.al.map[e];
        const unresolvedInSpan = h.v.al.unresolved.some(u => u.simple != null && u.simple >= s && u.simple <= e);
        if (ui < 0 || uj < 0 || unresolvedInSpan) return { status: 'mismatch', why: 'alignment unresolved in verse ' + h.a, verse: h.a };
        return {
          status: 'match', verse: h.a, ref: verseRef(this.sura, h.a, ui + 1, uj + 1, h.v.uw.length),
          norm: h.v.sn.slice(s, e + 1).join(' '),
          ambiguous: h.spans.length > 1 || (tierStart === 0 && hits.length > 1 && hints.length > 0 && false)
        };
      }
      tierStart = tierEnd;
      if (opts.hintsOnly) break;
    }
    return { status: 'mismatch', why: 'not found' };
  }
}

export function verseRef(sura, a, from, to, count) {
  if (from === 1 && to === count) return `${sura}:${a}`;
  if (to === count && from > 1) return `${sura}:${a}:-${count - from + 1}`;
  return `${sura}:${a}:${from}-${to}`;
}

/** Index over the Tuhfa abyat (no alignment needed: tokens are words). */
export class TuhfaIndex {
  constructor(abyat) { this.abyat = abyat; this.n = Object.keys(abyat).length; }
  find(phrase, hints = [], opts = {}) {
    const needle = normWords(phrase);
    if (!needle.length) return { status: 'mismatch', why: 'empty phrase' };
    const order = [];
    const push = b => { if (b >= 1 && b <= this.n && !order.includes(b)) order.push(b); };
    hints.forEach(push);
    const tierEnd = order.length;
    if (!opts.hintsOnly) for (let b = 1; b <= this.n; b++) push(b);
    for (let k = 0; k < order.length; k++) {
      const b = order[k];
      const [h1, h2] = this.abyat[b];
      for (const [h, text] of [[1, h1], [2, h2]]) {
        const toks = tokens(text);
        const nw = toks.map(t => normalize(t));
        let spans = findSpan(nw, needle);
        if (opts.anchor === 'start' && spans.includes(0)) spans = [0];
        if (spans.length) {
          const s = spans[0] + 1, e = spans[0] + needle.length;
          const ref = s === 1 && e === toks.length ? `t:${b}:${h}` : (e === toks.length && s > 1 ? `t:${b}:${h}:-${e - s + 1}` : `t:${b}:${h}:${s}-${e}`);
          return { status: 'match', ref, bayt: b, norm: nw.slice(s - 1, e).join(' '), ambiguous: spans.length > 1, outsideHints: k >= tierEnd };
        }
      }
      // whole bayt (phrase spans both hemistichs)
      const all = normWords(h1 + ' ' + h2);
      if (needle.length === all.length && findSpan(all, needle).length) return { status: 'match', ref: `t:${b}`, bayt: b, norm: all.join(' ') };
    }
    return { status: 'mismatch', why: 'not found' };
  }
}

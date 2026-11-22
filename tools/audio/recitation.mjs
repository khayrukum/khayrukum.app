// Quran recitation timings → the `segments` of a `quran` audio collection (AUD-34, RNG-02).
// Shared by tools/audio/import-recitation.mjs (the writer) and tools/validate-data.mjs (the check).
//
// Source (data/source/recitation/<id>-timings.json): per part file, `verses` {"sura:aya" | "basN" | "pre0":
// {boundary, start, q}} and `cues` [time, key, wordIndex], where wordIndex counts the words of the Tanzil
// Simple-Clean verse (0-based, basmala removed from verse 1) and comes from speech recognition.
// Site data: verses [key, boundary, start(, q when not "ok")] in recitation order and cues [time, key, word],
// where word is the 1-based word of the stored UTHMANI verse (DATA-01), so the site never needs Simple-Clean.
import fs from 'node:fs';
import { alignVerse, normalize } from '../lib/arabic.mjs';
import { QURAN_SRC, parseTanzil } from '../lib/util.mjs';
import { tokens, isMarkToken } from '../../site/assets/js/core/refs.js';

/** A word position in a text of `from` words → the matching position in a text of `to` words (both 0-based). */
export function scaleIndex(i, from, to) {
  if (to <= 0) return 0;
  if (from <= 1) return 0;
  return Math.max(0, Math.min(to - 1, Math.round((i * (to - 1)) / (from - 1))));
}

/**
 * Simple-Clean word index (0-based) → Uthmani word number (1-based) for one verse.
 * Equal word counts: the same position. Otherwise the per-verse alignment of DATA-25 («يا أيها» is one Uthmani
 * token); where that leaves a word unresolved, or the index is past the end, the position is scaled.
 */
export function cueWord(simpleIndex, uthmani, simple) {
  const uw = tokens(uthmani).filter(t => !isMarkToken(t));
  const sw = simple.split(' ').filter(w => normalize(w).length > 0);
  if (!uw.length) return 1;
  const i = Math.max(0, simpleIndex);
  if (uw.length === sw.length) return Math.min(i, uw.length - 1) + 1;
  const al = alignVerse(uw, sw);
  const hit = i < sw.length && al.ok ? al.map[i] : -1;
  return (hit >= 0 ? Math.min(hit, uw.length - 1) : scaleIndex(Math.min(i, sw.length - 1), sw.length, uw.length)) + 1;
}

const r2 = x => Math.round(x * 100) / 100;

/**
 * texts: { uthmani(sura, aya), simple(sura, aya) } → verse text with the basmala removed from verse 1.
 * Returns { items, segments } for the collection manifest (bytes, sha256 are added by the caller).
 */
export function convert(src, texts) {
  const items = [], segments = {};
  for (const p of src.parts) {
    items.push({ id: 'part:' + p.id, kind: 'part', name: p.name, src: `audio/${src.id || 'recitation'}/${p.file}`, dur: p.duration, from: p.from, to: p.to, end: p.end });
    const verses = Object.entries(p.verses).map(([k, v]) => (v.q && v.q !== 'ok' ? [k, r2(v.boundary), r2(v.start), v.q] : [k, r2(v.boundary), r2(v.start)]));
    const cues = p.cues.map(([t, k, w]) => {
      const m = /^(\d+):(\d+)$/.exec(k);
      return [r2(t), k, m ? cueWord(w, texts.uthmani(+m[1], +m[2]), texts.simple(+m[1], +m[2])) : 1];
    });
    segments[p.id] = { verses, cues };
  }
  return { items, segments };
}

/** The Tanzil texts from data/source/ as { uthmani(sura, aya), simple(sura, aya) }, basmala removed from verse 1. */
export function tanzilTexts() {
  const U = parseTanzil(fs.readFileSync(QURAN_SRC.uthmani, 'utf8')).suras, S = parseTanzil(fs.readFileSync(QURAN_SRC.simple, 'utf8')).suras;
  const strip = (T, s, a) => { const v = T.get(s)[a - 1], b = T.get(1)[0]; return a === 1 && s !== 1 && v.startsWith(b + ' ') ? v.slice(b.length + 1) : v; };
  return { uthmani: (s, a) => strip(U, s, a), simple: (s, a) => strip(S, s, a) };
}

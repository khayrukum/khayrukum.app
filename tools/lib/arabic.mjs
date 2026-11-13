// Arabic normalization for the porting/alignment tool (DATA-25 step 1).
// Used only by tools; never changes shipped text.

const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/gu; // harakat, Quranic marks, superscript alef, tatweel

export function normalize(s) {
  return s
    .replace(TASHKEEL, '')
    .replace(/[ٱآأإ]/gu, 'ا') // ٱ آ أ إ → ا
    .replace(/ى/gu, 'ي') // ى → ي
    .replace(/ة/gu, 'ه') // ة → ه
    .replace(/ؤ/gu, 'و') // ؤ → و
    .replace(/ئ/gu, 'ي') // ئ → ي
    .replace(/[ۥۦ]/gu, '') // small waw/yeh
    .replace(/‌|‍/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Normalized words (tokens that are empty after normalization are dropped). */
export function normWords(s) { return normalize(s).split(' ').filter(Boolean); }

/** Consonantal skeleton: also drop long vowels and hamza seats, for 1:2 / 2:1 alignment checks. */
export function skeleton(s) { return normalize(s).replace(/[اويء\s]/gu, ''); }

/**
 * Align Simple-Clean words to Uthmani word tokens for one verse (DATA-25 step 3).
 * uthWords: array of Uthmani word tokens (marks already excluded). simpleWords: array of Simple-Clean words.
 * Returns { map: simpleIndex(0-based) → uthIndex(0-based), ok, unresolved:[…] }.
 */
export function alignVerse(uthWords, simpleWords) {
  const map = new Array(simpleWords.length).fill(-1);
  if (uthWords.length === simpleWords.length) {
    for (let i = 0; i < map.length; i++) map[i] = i;
    return { map, ok: true, unresolved: [] };
  }
  let i = 0, j = 0; const unresolved = [];
  const sk = skeleton;
  while (i < uthWords.length && j < simpleWords.length) {
    const u = sk(uthWords[i]);
    if (u === sk(simpleWords[j])) { map[j] = i; i++; j++; continue; }
    if (j + 1 < simpleWords.length && u === sk(simpleWords[j] + simpleWords[j + 1])) { map[j] = i; map[j + 1] = i; i++; j += 2; continue; }
    if (i + 1 < uthWords.length && sk(uthWords[i] + uthWords[i + 1]) === sk(simpleWords[j])) { map[j] = i; i += 2; j++; continue; }
    // lenient: a single-letter difference in skeleton (e.g. orthographic alef)
    if (lev1(u, sk(simpleWords[j]))) { map[j] = i; i++; j++; continue; }
    unresolved.push({ uth: i, simple: j }); map[j] = i; i++; j++;
  }
  if (j < simpleWords.length || i < uthWords.length) unresolved.push({ tail: true, uth: i, simple: j });
  return { map, ok: unresolved.length === 0, unresolved };
}

function lev1(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, e = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++e > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return e + (a.length - i) + (b.length - j) <= 1;
}

/** Find all start indices where `needle` (array) occurs contiguously in `hay` (array). */
export function findSpan(hay, needle) {
  const out = [];
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let k = 0; k < needle.length; k++) if (hay[i + k] !== needle[k]) continue outer;
    out.push(i);
  }
  return out;
}

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
export function arToInt(s) { return parseInt(String(s).replace(/[٠-٩]/g, d => AR_DIGITS.indexOf(d)), 10); }
/** Arabic-Indic numbers mentioned in a string, e.g. «(آية ١٧١)» → [171]. */
export function numbersIn(s) { return (String(s).match(/[٠-٩]+/g) || []).map(arToInt); }

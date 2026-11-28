// Page map of the Madinah mushaf (Tanzil page table): which page a verse starts on, and whether it is the
// page's first verse, its last verse, or in between.
const key = (s, a) => s * 1000 + a;
/** meta: quran meta (pages: [sura, aya] each page starts with; suras: verse counts). → { page, pos: 'first'|'mid'|'last' } */
export function pageOf(meta, sura, aya) {
  const P = meta.pages; const k = key(sura, aya);
  let lo = 0, hi = P.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (key(...P[m]) <= k) lo = m; else hi = m - 1; }
  const ayas = meta.suras[sura - 1].ayas;
  const after = aya < ayas ? key(sura, aya + 1) : key(sura + 1, 1); // the verse that follows
  const next = P[lo + 1];
  return { page: lo + 1, pos: key(...P[lo]) === k ? 'first' : !next || key(...next) === after ? 'last' : 'mid' };
}

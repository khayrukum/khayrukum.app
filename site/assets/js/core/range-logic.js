// «مشغّل المدى» logic (RNG-*): which pages, rub's and verses a Quran recitation collection covers, the clips that
// play a range of verses (also across part files), the range's time line, and which verse and phrase is heard.
// Pure module: no DOM, no fetch. Used by pages/range.js and by the unit tests.
//
// A collection of part files (AUD-34) has items {id:'part:<id>', from, to, end} and
// segments[<id>] = { verses: [key, boundary, start(, q)], cues: [time, key, word] }.
// key = "sura:aya" | "basN" (basmala before sura N) | "pre0" (the isti'adha that opens a file).

const VERSE = /^(\d+):(\d+)$/;
export const vkey = (s, a) => `${s}:${a}`;
/** The verse after sura:aya in the mushaf, or null after the last verse. */
export function nextVerse(meta, s, a) {
  if (a < meta.suras[s - 1].ayas) return [s, a + 1];
  return s < meta.suras.length ? [s + 1, 1] : null;
}
const cmp = (x, y) => x[0] - y[0] || x[1] - y[1];

/**
 * Index of a collection: parts with their entries in recitation order, and verse key → entry.
 * entry = { key, part (index), i (index in the part), b (boundary), s (start), q, sura, aya } — sura/aya are
 * undefined for "basN"/"pre0" entries, which carry `bas` (N) or `pre`.
 */
export function buildIndex(col) {
  const parts = [], byKey = new Map();
  for (const it of (col.items || []).filter(x => x.kind === 'part')) {
    const id = it.id.replace(/^part:/, ''); const seg = col.segments?.[id]; if (!seg) continue;
    const part = { id, it, n: parts.length, end: it.end ?? it.dur, entries: [], cues: new Map() };
    seg.verses.forEach(([key, b, s, q], i) => {
      const m = VERSE.exec(key); const e = { key, part: part.n, i, b, s, q: q || 'ok' };
      if (m) { e.sura = +m[1]; e.aya = +m[2]; if (!byKey.has(key)) byKey.set(key, e); }
      else if (key.startsWith('bas')) e.bas = +key.slice(3); else e.pre = true;
      part.entries.push(e);
    });
    for (const [t, key, w] of seg.cues || []) { if (!part.cues.has(key)) part.cues.set(key, []); part.cues.get(key).push([t, w]); }
    parts.push(part);
  }
  return { parts, byKey, has: (s, a) => byKey.has(vkey(s, a)) };
}

/** Verses from `from` to `to` inclusive ([sura, aya] pairs), in mushaf order. */
export function versesBetween(meta, from, to) {
  const out = [];
  for (let v = from; v && cmp(v, to) <= 0; v = nextVerse(meta, v[0], v[1])) out.push(v);
  return out;
}

/**
 * Pages ('P') or rub's ('Q') that the collection covers completely (RNG-03):
 * [{ n, from:[s,a], to:[s,a], count, run }]. Units with the same `run` follow each other without a gap.
 */
export function coveredUnits(meta, idx, kind) {
  const starts = kind === 'P' ? meta.pages : meta.rubs.map(r => [r.sura, r.aya]);
  const last = [meta.suras.length, meta.suras[meta.suras.length - 1].ayas];
  const out = []; let run = 0, prevN = -1;
  starts.forEach((from, k) => {
    if (!idx.has(from[0], from[1])) return;
    let to = last;
    if (starts[k + 1]) { const [s, a] = starts[k + 1]; to = a > 1 ? [s, a - 1] : [s - 1, meta.suras[s - 2].ayas]; }
    const vs = versesBetween(meta, from, to);
    if (!vs.every(v => idx.has(v[0], v[1]))) return;
    if (k !== prevN + 1) run++;
    prevN = k;
    out.push({ n: k + 1, from, to, count: vs.length, run });
  });
  return out;
}

/** Suras with covered verses (RNG-03, unit «آية»): [{ sura, name, ayas:[{ n, run }] }]. */
export function coveredSuras(meta, idx) {
  const out = [];
  for (const su of meta.suras) {
    const ayas = []; let run = 0, prev = -1;
    for (let a = 1; a <= su.ayas; a++) if (idx.has(su.n, a)) { if (a !== prev + 1) run++; prev = a; ayas.push({ n: a, run }); }
    if (ayas.length) out.push({ sura: su.n, name: su.name, ayas });
  }
  return out;
}

/**
 * Keep a «من … إلى» pair ordered and inside one unbroken run (RNG-04): the end the reader did not touch moves.
 * list = items with `run`; a, b = indices; moved = 'from' | 'to'. → [a, b]
 */
export function linkEnds(list, a, b, moved) {
  const n = list.length; if (!n) return [0, 0];
  a = Math.max(0, Math.min(n - 1, a)); b = Math.max(0, Math.min(n - 1, b));
  if (moved === 'to') { if (a > b) a = b; while (list[a].run !== list[b].run) a++; }
  else { if (b < a) b = a; while (list[b].run !== list[a].run) b--; }
  return [a, b];
}

const lead = (part, e) => { const p = part.entries[e.i - 1]; return e.aya === 1 && p && p.bas === e.sura ? p : e; };
/** Key under which a fine-tune is saved: the start ('s') of a range at an entry, or its end ('e') before an entry or at the end of the part. */
export const tuneKey = (part, entry, side) => `${part.id}/${entry ? entry.key : 'end'}/${side}`;

/**
 * Where to cut inside the pause before an entry (owner, 2026-11-22). The pause ends at the entry's `start`; its
 * half-length is h = start − boundary, so it begins at boundary − h.
 * A range that STARTS with the entry begins just before its first sound; one that ENDS there stops just after the last.
 */
const EDGE = 0.3;
const half = e => Math.max(0, e.s - e.b);
export const cutStart = e => e.s - Math.min(EDGE, half(e));
export const cutEnd = e => e.b - half(e) + Math.min(EDGE, half(e));

/**
 * The clips that play the verses from..to (RNG-05/06): one per stretch that is continuous inside one part file,
 * so consecutive units in the same file are played through without a seek (joined by position, never by time).
 * A clip starts at cutStart of its first verse (of the basmala when that verse opens a sura) and ends at cutEnd
 * of whatever follows its last verse, or where the recitation ends in the file.
 * tune = { [tuneKey]: seconds } moves a boundary (RNG-09).
 * → [{ part, start, end, entries:[…], first, last, startKey, endKey }] or [] when a verse is not covered.
 */
export function buildClips(meta, idx, from, to, tune = {}) {
  const vs = versesBetween(meta, from, to); const clips = [];
  let cur = null;
  for (const [s, a] of vs) {
    const e = idx.byKey.get(vkey(s, a)); if (!e) return [];
    const part = idx.parts[e.part];
    if (cur && cur.part === part && cur.last.i + 1 >= lead(part, e).i) { cur.last = e; continue; }
    cur = { part, head: lead(part, e), first: e, last: e }; clips.push(cur);
  }
  return clips.map(c => {
    const after = c.part.entries[c.last.i + 1] || null;
    const startKey = tuneKey(c.part, c.head, 's'), endKey = tuneKey(c.part, after, 'e');
    const max = c.part.it.dur || c.part.end;
    let start = cutStart(c.head) + (tune[startKey] || 0), end = (after ? cutEnd(after) : c.part.end) + (tune[endKey] || 0);
    end = Math.min(max, Math.max(end, c.last.s + 0.5)); start = Math.max(0, Math.min(start, end - 0.5));
    return { part: c.part, start, end, entries: c.part.entries.slice(c.head.i, c.last.i + 1), first: c.first, last: c.last, startKey, endKey };
  });
}

// ---------- the range as one time line ----------
export const clipDur = c => Math.max(0, c.end - c.start);
export const totalDur = clips => clips.reduce((a, c) => a + clipDur(c), 0);
/** Position in the range (s) of time `t` (seconds in the part file) while clip i plays. */
export function rangePos(clips, i, t) {
  let p = 0; for (let k = 0; k < i; k++) p += clipDur(clips[k]);
  return p + Math.max(0, Math.min(t - clips[i].start, clipDur(clips[i])));
}
/** Position in the range → { i, t (seconds in the part file) }. With loop the position wraps round; without, it is clamped. */
export function locate(clips, pos, loop = false) {
  const total = totalDur(clips); if (!clips.length || total <= 0) return { i: 0, t: clips[0]?.start || 0 };
  if (loop) pos = ((pos % total) + total) % total; else pos = Math.max(0, Math.min(pos, total - 0.05));
  for (let i = 0; i < clips.length; i++) { const d = clipDur(clips[i]); if (pos < d || i === clips.length - 1) return { i, t: clips[i].start + Math.min(pos, d) }; pos -= d; }
  return { i: 0, t: clips[0].start };
}
/** The clip after clip i: the first one again when looping, -1 when the range is over (RNG-07). */
export const nextClip = (i, n, loop) => (i + 1 < n ? i + 1 : loop && n ? 0 : -1);

// ---------- what is being recited ----------
/** The entry (verse or basmala) heard at time t of a clip: the last one that has started (RNG-08, STG-11). */
export function entryAt(clip, t) {
  let cur = clip.entries[0];
  for (const e of clip.entries) { if (e.s - 0.15 <= t) cur = e; else break; }
  return cur;
}
/** Every entry of the clips in order, as [{ i (clip), e }] — for «previous / next verse». */
export function flatEntries(clips) { return clips.flatMap((c, i) => c.entries.map(e => ({ i, e }))); }

/**
 * Speech cues of one verse → the phrases it is recited in (STG-12): { spans:[[from,to]] 1-based words, times:[s] }.
 * Cues are approximate: a cue that does not move forward is dropped, the first phrase always starts at word 1,
 * and word numbers past the end are clamped, so the spans always cover words 1…count exactly once.
 */
export function phraseSpans(cues, count) {
  const starts = [], times = [];
  for (const [t, w0] of cues || []) {
    const w = starts.length ? Math.min(count, Math.max(1, w0)) : 1;
    if (starts.length && w <= starts[starts.length - 1]) continue;
    starts.push(w); times.push(t);
  }
  if (!starts.length) return { spans: count > 0 ? [[1, count]] : [], times: [0] };
  return { spans: starts.map((w, k) => [w, k + 1 < starts.length ? starts[k + 1] - 1 : count]), times };
}
/** Index of the phrase heard at time t. */
export function phraseAt(times, t) {
  let k = 0; for (let j = 0; j < times.length; j++) if (times[j] - 0.1 <= t) k = j;
  return k;
}

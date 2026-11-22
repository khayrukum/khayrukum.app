// A throw-away copy of site/ with audio switched ON and synthetic sound, for the «مشغّل المدى» and «وضع العرض»
// tests (TST-70/71). Nothing of the recitations is used (AUD-41): every audio file is a sine tone generated here,
// as WAV, which every browser decodes (the test Chromium cannot decode AAC/MP4).
//   - collection `minshawi`: two part files with the real verse keys and made-up times, 3 s per verse:
//       f1 = isti'adha, 1:1–7, basmala, 2:1–5 (pages 1 and 2);  f2 = isti'adha, 2:6–25 (pages 3 and 4, end of rub' 1)
//   - collection `tuhfa`: every item points at one 20 s tone.
// No Quran text is typed here: word counts come from the site's Tanzil-derived files.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
export const VERSE = 3, LEAD = 1, PAUSE = 0.5; // seconds per verse; first verse start; boundary = start − PAUSE

/** A mono 8 kHz 16-bit WAV with a quiet sine tone. */
export function wav(seconds, freq = 330) {
  const rate = 8000, n = Math.round(seconds * rate), buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 2000), 44 + i * 2);
  return buf;
}
const words = text => text.split(' ').filter(t => t && !/^[ۖ-ۭ‌‍]+$/u.test(t)).length;

/** The fixture part: keys in order → { item, segments entry, dur }. */
function part(id, keys, quran, freq) {
  const verses = [['pre0', 0.1, 0.3]], cues = [[0.3, 'pre0', 1]];
  keys.forEach((k, i) => {
    const s = LEAD + VERSE * i; verses.push([k, s - PAUSE, s]); cues.push([s, k, 1]);
    const m = /^(\d+):(\d+)$/.exec(k); const count = m ? words(quran[m[1]].ayat[m[2] - 1]) : 4;
    if (count >= 2) cues.push([s + VERSE / 2, k, Math.floor(count / 2) + 1]); // a second phrase half-way through
  });
  const end = LEAD + VERSE * keys.length - PAUSE, dur = end + 2;
  const vs = keys.filter(k => k.includes(':'));
  return { id, dur, tone: wav(dur, freq), segments: { verses, cues }, item: { id: 'part:' + id, kind: 'part', n: 1, name: id, src: `audio/minshawi/${id}.wav`, bytes: null, dur, sha256: null, from: vs[0], to: vs[vs.length - 1], end } };
}
const seq = (s, a, b) => Array.from({ length: b - a + 1 }, (_, i) => `${s}:${a + i}`);

/** Create the site copy. Returns { dir, parts, cleanup }. */
export function makeSite() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'khayr-media-'));
  const SITE = path.join(ROOT, 'site');
  fs.cpSync(SITE, dir, { recursive: true, filter: s => !/^\/audio(\/|$)/.test(s.slice(SITE.length)) && !s.endsWith('config.local.json') });
  const rd = f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), wr = (f, v) => fs.writeFileSync(path.join(dir, f), JSON.stringify(v));
  const cfg = rd('config.json'); cfg.audio.enabled = true; wr('config.json', cfg);
  const quran = { 1: rd('data/quran/001.json'), 2: rd('data/quran/002.json') };
  const parts = [part('f1', [...seq(1, 1, 7), 'bas2', ...seq(2, 1, 5)], quran, 330), part('f2', seq(2, 6, 25), quran, 440)];
  const man = rd('data/audio/minshawi.json');
  man.items = parts.map((p, i) => ({ ...p.item, n: i + 1, bytes: p.tone.length })); man.segments = Object.fromEntries(parts.map(p => [p.id, p.segments])); delete man.source;
  wr('data/audio/minshawi.json', man);
  fs.mkdirSync(path.join(dir, 'audio/minshawi'), { recursive: true });
  for (const p of parts) fs.writeFileSync(path.join(dir, 'audio/minshawi', p.id + '.wav'), p.tone);
  const tone = wav(20, 262); fs.writeFileSync(path.join(dir, 'audio/tone.wav'), tone);
  const tu = rd('data/audio/tuhfa.json');
  tu.items = tu.items.map(it => ({ ...it, src: 'audio/tone.wav', bytes: tone.length, dur: 20, sha256: null, ...(it.chapterOffsets ? { chapterOffsets: it.chapterOffsets.map((_, i) => i * 2) } : {}) }));
  wr('data/audio/tuhfa.json', tu);
  return { dir, parts, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

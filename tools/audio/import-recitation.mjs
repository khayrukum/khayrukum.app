#!/usr/bin/env node
// Writer of a Quran recitation collection manifest (AUD-34): site/data/audio/<id>.json.
//
//   node tools/audio/import-recitation.mjs --id minshawi [--audio-dir local-audio]
//
// Reads data/source/recitation/<id>-timings.json (verse boundaries and speech cues, see tools/audio/recitation.mjs)
// and the Tanzil texts in data/source/. When the part files are present under <audio-dir>/<id>/ their bytes,
// sha256 and duration (ffprobe) are written into the manifest; otherwise the values already there are kept.
// The audio files themselves are never committed (AUD-41) and are not needed to run the site without audio.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, SITE, tryJson, writeJson, sha256, ok, warn, fail } from '../lib/util.mjs';
import { convert, tanzilTexts } from './recitation.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const id = opt('--id', 'minshawi');
const audioDir = path.resolve(ROOT, opt('--audio-dir', 'local-audio'));
const srcFile = path.join(ROOT, 'data/source/recitation', id + '-timings.json');
const outFile = path.join(SITE, 'data/audio', id + '.json');
if (!fs.existsSync(srcFile)) { fail(`missing ${path.relative(ROOT, srcFile)}`); process.exit(1); }

const raw = fs.readFileSync(srcFile);
const src = { ...JSON.parse(raw.toString('utf8')), id };
const { items, segments } = convert(src, tanzilTexts());
const prev = tryJson(outFile);
const prevItems = new Map((prev?.items || []).map(it => [it.id, it]));
let measured = 0; const format = prev?.format || { codec: 'aac', bitrate: 48000, sampleRate: 44100, channels: 1, container: 'mp4' };
const out = items.map((it, i) => {
  const f = path.join(audioDir, it.src.replace(/^audio\//, ''));
  const old = prevItems.get(it.id) || {};
  let bytes = old.bytes ?? null, hash = old.sha256 ?? null;
  if (fs.existsSync(f)) {
    const buf = fs.readFileSync(f); bytes = buf.length; hash = sha256(buf); measured++;
    try {
      const pr = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,sample_rate,channels:format=duration', '-of', 'json', f]).toString());
      const d = +pr.format.duration;
      if (Math.abs(d - it.dur) > 0.5) { fail(`${it.src}: duration ${d} s differs from the timings (${it.dur} s)`); process.exitCode = 1; }
      if (it.end > d) { fail(`${it.src}: end ${it.end} is after the end of the file (${d} s)`); process.exitCode = 1; }
      const st = pr.streams[0]; format.codec = st.codec_name; format.sampleRate = +st.sample_rate; format.channels = st.channels;
    } catch { warn(`${it.src}: ffprobe not available, duration not checked`); }
  }
  const { id: iid, kind, name, src: s, dur, ...rest } = it;
  return { id: iid, kind, n: i + 1, name, src: s, bytes, dur, sha256: hash, ...rest };
});
if (!measured) warn(`no part files under ${path.relative(ROOT, audioDir)}/${id}/: bytes and sha256 kept from the existing manifest`);
else if (measured < out.length) warn(`${out.length - measured} part file(s) absent: their bytes and sha256 were kept as they were`);

writeJson(outFile, {
  schema: 'audio-collection', version: '1.0.0', id, type: 'quran', reciter: id,
  title: opt('--title', prev?.title || src.edition), edition: src.edition, format,
  note: 'Written by tools/audio/import-recitation.mjs; do not edit by hand. items: one per part file (kind "part"), `from`/`to` = first/last verse, `end` = where the recitation ends in the file (before the closing formula). segments: part id → { verses: [key, boundary, start(, q)] in recitation order, cues: [time, key, word] }. Times are seconds in the part file. boundary = middle of the pause before the verse (ranges are cut there); start = first sound of the verse; q (amb | nopause | fallback) marks a less certain start. key = "sura:aya", "basN" (the basmala before sura N) or "pre0" (the isti\'adha that opens the file). word = 1-based word of the stored Uthmani verse (DATA-01) heard first in that speech chunk; approximate (speech recognition).',
  source: { file: path.relative(ROOT, srcFile), sha256: sha256(raw) },
  items: out, segments
});
ok(`${path.relative(ROOT, outFile)}: ${out.length} parts, ${Object.values(segments).reduce((a, s) => a + s.verses.length, 0)} verse entries, ${Object.values(segments).reduce((a, s) => a + s.cues.length, 0)} cues`);

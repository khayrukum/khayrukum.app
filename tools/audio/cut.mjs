#!/usr/bin/env node
// Reproducible per-bayt cutting from the chapter clips (LIC-22).
// Each bayt = chapter clip from segment start to end (segments-baseline.json: bayt → [chapter index, start s, end s]),
// with a 30 ms fade-in and 60 ms fade-out placed at the bayt's own boundaries (the earlier bug faded at the wrong
// timestamp and silenced most of each bayt; check-audio.mjs rule 5 guards against it).
//
//   node tools/audio/cut.mjs <chapter-dir with 01..10.mp3> <out-dir>
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [chDir, outDir] = process.argv.slice(2);
if (!chDir || !outDir) { console.error('usage: cut.mjs <chapter-dir> <out-dir>'); process.exit(2); }
const segs = JSON.parse(fs.readFileSync(new URL('./segments-baseline.json', import.meta.url)));
fs.mkdirSync(outDir, { recursive: true });
for (const [b, [ci, a, z]] of Object.entries(segs)) {
  const dur = +(z - a).toFixed(3);
  const out = path.join(outDir, String(b).padStart(2, '0') + '.mp3');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(a), '-t', String(dur), '-i', path.join(chDir, String(ci + 1).padStart(2, '0') + '.mp3'),
    '-af', `afade=t=in:st=0:d=0.03,afade=t=out:st=${Math.max(0, dur - 0.06).toFixed(3)}:d=0.06`,
    '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100', '-ac', '2', out]);
  console.log(out);
}

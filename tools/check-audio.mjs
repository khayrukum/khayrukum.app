#!/usr/bin/env node
// Audio verification (AUD-30 §5.3) and manifest writer (DATA-27, AUD-30 §5.x collections).
//
//   node tools/check-audio.mjs [--dir local-audio] [--write] [--waveforms out/] [--require]
//
// --dir      folder that holds tuhfa/{bayt,chapter}/NN.mp3 and tuhfa/full.mp3 (default: site/audio)
// --write    (re)write bytes, dur, sha256 and the measured chapterOffsets into site/data/audio/tuhfa.json
// --require  fail when the audio files are absent (CI with audio enabled); otherwise absence is a skip
// Needs ffmpeg and ffprobe on PATH.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, SITE, readJson, tryJson, writeJson, sha256, ok, fail, warn } from './lib/util.mjs';

const argv = process.argv.slice(2);
const opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const DIR = path.resolve(ROOT, opt('--dir') || 'site/audio');
const WRITE = argv.includes('--write');
const REQUIRE = argv.includes('--require');
const WAVES = opt('--waveforms');
const MAN = path.join(SITE, 'data/audio/tuhfa.json');
const segs = readJson(path.join(ROOT, 'tools/audio/segments-baseline.json'));
const abyat = readJson(path.join(SITE, 'data/tuhfa/abyat.json'));
const FORMAT = { codec: 'mp3', bitrate: 128000, sampleRate: 44100 };
const pad = n => String(n).padStart(2, '0');

const files = [];
for (let b = 1; b <= 61; b++) files.push({ id: `bayt:${b}`, kind: 'bayt', n: b, src: `audio/tuhfa/bayt/${pad(b)}.mp3` });
for (let c = 1; c <= 10; c++) files.push({ id: `chapter:${c}`, kind: 'chapter', n: c, src: `audio/tuhfa/chapter/${pad(c)}.mp3` });
files.push({ id: 'full', kind: 'full', src: 'audio/tuhfa/full.mp3' });
const local = f => path.join(DIR, f.src.replace(/^audio\//, ''));

const present = files.filter(f => fs.existsSync(local(f)));
if (present.length === 0) {
  const msg = `no audio files under ${path.relative(ROOT, DIR) || '.'} — audio checks skipped`;
  if (REQUIRE) { fail(msg); process.exit(1); }
  warn(msg + ' (audio is disabled or not yet provided; see CONTENT-TODO.md)');
  if (!fs.existsSync(MAN)) writeManifest(null);
  process.exit(0);
}

const errors = [];
const E = m => errors.push(m);
const probe = p => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,sample_rate,bit_rate:format=duration', '-of', 'json', p]).toString());
const silences = (p, noise, d) => {
  const out = execFileSync('ffmpeg', ['-hide_banner', '-nostats', '-i', p, '-af', `silencedetect=noise=${noise}:d=${d}`, '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString()
    + ''; return out;
};
function silenceInfo(p, minD) {
  let log = '';
  try { log = execFileSync('ffmpeg', ['-hide_banner', '-nostats', '-i', p, '-af', `silencedetect=noise=-40dB:d=${minD}`, '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' }); } catch (e) { log = String(e.stderr || ''); }
  return log;
}
function silenceList(p, dur, minD = 0.05) {
  let stderr = '';
  try {
    const r = require_spawn(p, minD); stderr = r;
  } catch (e) { stderr = String(e); }
  const starts = [...stderr.matchAll(/silence_start: ([\d.]+)/g)].map(m => +m[1]);
  const ends = [...stderr.matchAll(/silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/g)].map(m => ({ end: +m[1], d: +m[2] }));
  const list = starts.map((s, i) => ({ start: s, end: ends[i] ? ends[i].end : dur, d: ends[i] ? ends[i].d : dur - s }));
  return list;
}
import { spawnSync } from 'node:child_process';
function require_spawn(p, minD) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', p, '-af', `silencedetect=noise=-40dB:d=${minD}`, '-f', 'null', '-'], { encoding: 'utf8' });
  return r.stderr;
}
function meanVolume(p) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', p, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /mean_volume: (-?[\d.]+) dB/.exec(r.stderr); return m ? +m[1] : -99;
}
function pcm(p, seconds = null, rate = 8000) {
  const args = ['-v', 'error', '-i', p, '-ac', '1', '-ar', String(rate)];
  if (seconds) args.push('-t', String(seconds));
  args.push('-f', 'f32le', '-');
  const buf = execFileSync('ffmpeg', args, { maxBuffer: 1 << 28 });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

// ---------- per-file facts ----------
const facts = {};
for (const f of files) {
  const p = local(f);
  if (!fs.existsSync(p)) { E(`missing: ${f.src}`); continue; }
  const buf = fs.readFileSync(p);
  const pr = probe(p);
  const st = pr.streams[0] || {};
  const dur = +(+pr.format.duration).toFixed(3);
  if (st.codec_name !== FORMAT.codec) E(`${f.src}: codec ${st.codec_name}`);
  if (+st.sample_rate !== FORMAT.sampleRate) E(`${f.src}: sample rate ${st.sample_rate}`);
  if (Math.abs(+st.bit_rate - FORMAT.bitrate) > 1000) E(`${f.src}: bitrate ${st.bit_rate}`);
  facts[f.id] = { bytes: buf.length, dur, sha256: sha256(buf) };
}

// ---------- content checks (AUD-30 2–6) ----------
let maxSegDiff = 0, maxBaytSil = 0, maxLongSil = 0;
for (const f of files) {
  const x = facts[f.id]; if (!x) continue;
  const p = local(f);
  const sil = silenceList(p, x.dur);
  const internal = sil.filter(s => s.start > 0.05 && s.end < x.dur - 0.05);
  const maxInt = internal.reduce((m, s) => Math.max(m, s.d), 0);
  if (f.kind === 'bayt') {
    const [, a, b] = segs[f.n];
    const segDur = b - a;
    const diff = Math.abs(x.dur - segDur); maxSegDiff = Math.max(maxSegDiff, diff);
    if (diff > 0.15) E(`${f.src}: duration ${x.dur}s differs from its segment (${segDur.toFixed(2)}s) by ${diff.toFixed(3)}s > 0.15s`);
    maxBaytSil = Math.max(maxBaytSil, maxInt);
    if (maxInt >= 0.6) E(`${f.src}: internal silence ${maxInt.toFixed(2)}s ≥ 0.6s`);
    const silentTotal = sil.reduce((m, s) => m + Math.max(0, Math.min(s.end, x.dur) - s.start), 0);
    if ((x.dur - silentTotal) / x.dur < 0.85) E(`${f.src}: non-silent for only ${(100 * (x.dur - silentTotal) / x.dur).toFixed(0)}% of its duration (< 85%)`);
    const mv = meanVolume(p);
    if (mv < -30) E(`${f.src}: mean volume ${mv} dB < −30 dB`);
  } else {
    maxLongSil = Math.max(maxLongSil, maxInt);
    if (maxInt >= 2.5) E(`${f.src}: internal silence ${maxInt.toFixed(2)}s ≥ 2.5s`);
  }
}
const chapSum = files.filter(f => f.kind === 'chapter').reduce((m, f) => m + (facts[f.id]?.dur || 0), 0);
if (facts.full && Math.abs(chapSum - facts.full.dur) > 0.5) E(`sum of chapter durations ${chapSum.toFixed(2)}s differs from full.mp3 ${facts.full.dur}s by more than 0.5s`);

// ---------- chapterOffsets by cross-correlation (AUD-30 7) ----------
const offsets = []; const corrs = [];
if (facts.full) {
  const RATE = 4000;
  const full = pcm(local(files.find(f => f.kind === 'full')), null, RATE);
  let expected = 0;
  for (let c = 1; c <= 10; c++) {
    const f = files.find(x => x.id === `chapter:${c}`);
    if (!facts[f.id]) { offsets.push(null); continue; }
    const probeSig = pcm(local(f), 3, RATE);
    const n = probeSig.length;
    let pe = 0; for (let i = 0; i < n; i++) pe += probeSig[i] * probeSig[i];
    let best = -1, bestK = 0;
    const lo = Math.max(0, Math.round((expected - 6) * RATE)), hi = Math.min(full.length - n, Math.round((expected + 6) * RATE));
    for (let k = lo; k <= hi; k++) {
      let dot = 0, fe = 0;
      for (let i = 0; i < n; i++) { const v = full[k + i]; dot += v * probeSig[i]; fe += v * v; }
      const r = dot / Math.sqrt(pe * fe || 1);
      if (r > best) { best = r; bestK = k; }
    }
    const off = +(bestK / RATE).toFixed(3);
    offsets.push(off); corrs.push(+best.toFixed(3));
    if (best < 0.8) E(`chapter ${c}: weak correlation ${best.toFixed(3)} < 0.8 against full.mp3`);
    expected = off + facts[f.id].dur;
  }
}

// ---------- compare with the stored manifest (AUD-30 7, 8) ----------
const prev = tryJson(MAN);
if (prev && !WRITE) {
  for (const it of prev.items || []) {
    const x = facts[it.id]; if (!x) continue;
    if (it.sha256 !== x.sha256 || it.bytes !== x.bytes) E(`${it.src}: sha256/bytes do not match the manifest (run with --write after replacing files)`);
    if (it.dur != null && Math.abs(it.dur - x.dur) > 0.05) E(`${it.src}: dur ${x.dur} vs manifest ${it.dur} (> 0.05 s)`);
    if (it.id === 'full' && it.chapterOffsets) it.chapterOffsets.forEach((o, i) => { if (offsets[i] != null && Math.abs(o - offsets[i]) > 0.05) E(`chapter ${i + 1}: stored offset ${o} differs from measured ${offsets[i]} by > 50 ms`); });
  }
}

if (WAVES) {
  fs.mkdirSync(WAVES, { recursive: true });
  for (const f of files.filter(f => f.kind === 'chapter' && facts[f.id])) {
    spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', local(f), '-filter_complex', 'showwavespic=s=1200x200:split_channels=0', '-frames:v', '1', path.join(WAVES, `chapter-${pad(f.n)}.png`)]);
  }
  ok('waveforms written to ' + WAVES);
}

console.log(`max |bayt dur − segment| = ${maxSegDiff.toFixed(3)} s; max bayt internal silence = ${maxBaytSil.toFixed(2)} s; max chapter/full internal silence = ${maxLongSil.toFixed(2)} s; Σchapters − full = ${facts.full ? (chapSum - facts.full.dur).toFixed(2) : '—'} s`);
if (offsets.length) console.log('chapterOffsets (measured):', offsets.join(', '), ' correlation:', corrs.join(', '));

if (errors.length) { errors.forEach(e => fail(e)); process.exit(1); }
ok(`audio checks passed for ${Object.keys(facts).length} files`);
if (WRITE) { writeManifest(facts, offsets); ok('wrote ' + path.relative(ROOT, MAN)); }

function writeManifest(f, offs) {
  const items = files.map(x => {
    const o = { id: x.id, kind: x.kind, ...(x.n ? { n: x.n } : {}), src: x.src, bytes: f?.[x.id]?.bytes ?? null, dur: f?.[x.id]?.dur ?? null, sha256: f?.[x.id]?.sha256 ?? null };
    if (x.kind === 'bayt') o.chapter = abyat.chapters.findIndex(c => x.n >= c.from && x.n <= c.to) + 1;
    if (x.kind === 'full') o.chapterOffsets = offs || null;
    return o;
  });
  const segments = {};
  for (const [b, [ci, a, z]] of Object.entries(segs)) segments[b] = [ci, a, z];
  writeJson(MAN, {
    schema: 'audio-collection', version: '1.0.0', id: 'tuhfa', type: 'poem', reciter: 'ahmad-mahdi',
    title: 'تحفة الأطفال', format: FORMAT,
    note: 'segments: bayt → [chapter index (0-based), start s, end s] inside the chapter clip. bytes/dur/sha256/chapterOffsets are written by tools/check-audio.mjs --write (AUD-30).',
    items, segments
  });
}

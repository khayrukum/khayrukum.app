import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SITE = path.join(ROOT, 'site');

export function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
export function tryJson(p) { try { return readJson(p); } catch { return null; } }

/** Stable, readable JSON: objects pretty-printed, short arrays/objects of scalars kept on one line. */
export function stringify(v, indent = '') {
  const inner = indent + '  ';
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    const flat = JSON.stringify(v);
    if (flat.length <= 100 || v.every(x => x === null || typeof x !== 'object')) return flat;
    return '[\n' + v.map(x => inner + stringify(x, inner)).join(',\n') + '\n' + indent + ']';
  }
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length === 0) return '{}';
    const flat = JSON.stringify(v);
    if (flat.length <= 100) return flat;
    return '{\n' + keys.map(k => inner + JSON.stringify(k) + ': ' + stringify(v[k], inner)).join(',\n') + '\n' + indent + '}';
  }
  return JSON.stringify(v);
}

export function writeJson(p, v) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, stringify(v) + '\n');
}

export function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

export function walk(dir, base = dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, base));
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out.sort();
}

export function fail(msg) { console.error('\x1b[31m✗ ' + msg + '\x1b[0m'); process.exitCode = 1; }
export function warn(msg) { console.warn('\x1b[33m! ' + msg + '\x1b[0m'); }
export function ok(msg) { console.log('\x1b[32m✓\x1b[0m ' + msg); }

/** Parse a Tanzil "text with aya numbers" file: `sura|aya|text` per line, `#` comments. */
export function parseTanzil(text) {
  const suras = new Map();
  const notice = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    if (line.startsWith('#')) { notice.push(line.replace(/^#\s?/, '')); continue; }
    const m = /^(\d+)\|(\d+)\|(.*)$/.exec(line);
    if (!m) throw new Error('bad Tanzil line: ' + line.slice(0, 40));
    const s = +m[1], a = +m[2];
    if (!suras.has(s)) suras.set(s, []);
    suras.get(s)[a - 1] = m[3];
  }
  return { suras, notice: notice.join('\n').trim() };
}

export const QURAN_SRC = {
  uthmani: path.join(ROOT, 'data/source/quran-uthmani.txt'),
  simple: path.join(ROOT, 'data/source/quran-simple-clean.txt'),
  meta: path.join(ROOT, 'data/source/quran-data.js')
};

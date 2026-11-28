// Independent Tanzil parser and reference resolver used by the test agent's integrity tests.
// Deliberately shares no code with site/assets/js/core/refs.js or tools/.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const TANZIL = process.env.TANZIL_FILE || join(ROOT, 'data/source/quran-uthmani.txt');
export const read = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

// ---------- independent Tanzil parser ----------
export function loadTanzil(file = TANZIL) {
  const verses = new Map(); let count = 0; let basmala = null;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('|'), j = line.indexOf('|', i + 1);
    const s = +line.slice(0, i), a = +line.slice(i + 1, j); let text = line.slice(j + 1).replace(/\r$/, '');
    if (s === 1 && a === 1) basmala = text;
    // "Text with aya numbers" download: the basmala is prefixed to verse 1 of every sura except 1 and 9.
    if (a === 1 && s !== 1 && s !== 9 && basmala && text.startsWith(basmala + ' ')) text = text.slice(basmala.length + 1);
    verses.set(s + ':' + a, text); count++;
  }
  return { verses, count, basmala };
}

// ---------- independent reference resolver (DATA-01), offset based ----------
const isMark = cp => (cp >= 0x06D6 && cp <= 0x06ED);
const markOnly = tok => [...tok].every(ch => isMark(ch.codePointAt(0)));
/** word spans [start,end) of a stored text; Quran: tokens made only of U+06D6–U+06ED are not words. */
function wordSpans(text, quran) {
  const out = []; const re = /[^ ]+/g; let m;
  while ((m = re.exec(text))) if (!quran || !markOnly(m[0])) out.push([m.index, m.index + m[0].length]);
  return out;
}
function pick(text, sel, quran) {
  if (sel == null) return text;
  const w = wordSpans(text, quran); let a, b, m;
  if ((m = /^(\d+)-(\d+)$/.exec(sel))) { a = +m[1]; b = +m[2]; }
  else if ((m = /^-(\d+)$/.exec(sel))) { a = w.length - +m[1] + 1; b = w.length; }
  else if ((m = /^(\d+)-$/.exec(sel))) { a = +m[1]; b = w.length; }
  else if ((m = /^(\d+)$/.exec(sel))) { a = b = +m[1]; }
  else throw new Error('selector ' + sel);
  if (!(a >= 1 && b <= w.length && a <= b)) throw new Error(`words ${a}-${b} out of 1-${w.length}`);
  return text.slice(w[a - 1][0], w[b - 1][1]); // exact substring of the stored text, by offsets
}
/** → [{key:'2:5'|'t:5:1', text}] */
export function resolve(ref, tz, abyat) {
  let m;
  if ((m = /^t:(\d+)(?::([12]))?(?::([0-9-]+))?$/.exec(ref))) {
    const b = abyat[m[1]]; if (!b) throw new Error('no bayt ' + ref);
    if (!m[2]) return [{ key: `t:${m[1]}:1`, text: b[0] }, { key: `t:${m[1]}:2`, text: b[1] }];
    return [{ key: `t:${m[1]}:${m[2]}`, text: pick(b[m[2] - 1], m[3], false) }];
  }
  if ((m = /^(\d+):(\d+)-(\d+)$/.exec(ref))) {
    const out = []; for (let a = +m[2]; a <= +m[3]; a++) { const v = tz.verses.get(m[1] + ':' + a); if (v == null) throw new Error('no verse ' + ref); out.push({ key: m[1] + ':' + a, text: v }); }
    return out;
  }
  if ((m = /^(\d+):(\d+)(?::([0-9-]+))?$/.exec(ref))) {
    const v = tz.verses.get(m[1] + ':' + m[2]); if (v == null) throw new Error('no verse ' + ref);
    return [{ key: m[1] + ':' + m[2], text: pick(v, m[3], true) }];
  }
  throw new Error('bad ref ' + ref);
}

// ---------- collect every reference in site/data ----------
const REF_RE = /^(?:\d+:\d+(?:-\d+)?(?::[0-9-]+)?|t:\d+(?::[12])?(?::[0-9-]+)?)$/;
export function collectRefs(node, file, path = '', out = []) {
  if (typeof node === 'string') {
    for (const m of node.matchAll(/\[\[(q|t):([^\]]+)\]\]/g)) for (const r of m[2].split('|')) out.push({ file, path: path + ' (inline)', ref: m[1] === 't' && !r.startsWith('t:') ? 't:' + r : r });
    const key = path.split('.').pop().replace(/\[\d+\]$/, '');
    if (['ref', 'refs', 'chainFrom', 'chainTo', 'range'].includes(key) && REF_RE.test(node)) out.push({ file, path, ref: node });
  } else if (Array.isArray(node)) node.forEach((x, i) => collectRefs(x, file, `${path}[${i}]`, out));
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) {
    if (k === 'override' && v && typeof v === 'object') { for (const kk of Object.keys(v)) out.push({ file, path: path + '.override', ref: `${kk}:1-${v[kk]}` }); continue; }
    collectRefs(v, file, path ? path + '.' + k : k, out);
  }
  return out;
}
function walk(dir, acc = []) { for (const f of readdirSync(dir)) { const p = join(dir, f); statSync(p).isDirectory() ? walk(p, acc) : p.endsWith('.json') && acc.push(p); } return acc; }
export function allDataRefs() {
  const out = [];
  for (const p of walk(join(ROOT, 'site/data'))) {
    if (/site\/data\/quran\/(002|meta|source)\.json$/.test(p) || /tuhfa\/abyat\.json$/.test(p)) continue;
    collectRefs(JSON.parse(readFileSync(p, 'utf8')), p.slice(ROOT.length + 1), '', out);
  }
  return out;
}


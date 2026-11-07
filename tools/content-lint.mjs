#!/usr/bin/env node
// Content and code lint (TST-12): GEN-01/02, DATA-02/52, ARCH-01/07, NFR-A11Y-08/09, NFR-TYP-04, NFR-PRV-04, AUD-12.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { SITE, readJson, walk, ok, fail } from './lib/util.mjs';
import { S } from '../site/assets/js/core/strings.ar.js';

let errors = 0;
const E = m => { fail(m); errors++; };
const files = walk(SITE).filter(f => !f.startsWith('audio/'));
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');

// ---------- GEN-01: colloquial words ----------
const COLLOQUIAL = ['إنت', 'انت', 'اللي', 'ده', 'دي', 'إيه', 'ايه', 'كمّل', 'كمل', 'يقرا', 'جت', 'التانية', 'التاني', 'عشان', 'بتاع', 'ازاي', 'إزاي', 'مش', 'كده', 'دلوقتي', 'هتقول', 'وإنت'];
const wordRe = new RegExp(`(^|[\\s«(،:.!؟])(${COLLOQUIAL.join('|')})(?=$|[\\s»)،:.!؟])`, 'u');
const textFiles = ['assets/js/core/strings.ar.js', 'data/round-types.json', 'data/plan/baqarah.json', 'data/exams/index.json', ...files.filter(f => f.endsWith('.html'))];
const strip = s => s.replace(/[ً-ْٰ]/g, '');
for (const f of textFiles) read(f).split('\n').forEach((line, i) => { const m = wordRe.exec(strip(line)); if (m) E(`${f}:${i + 1}: colloquial word «${m[2]}» (GEN-01)`); });
// exam content strings (never the corpus refs themselves)
const contentStrings = ex => {
  const out = [];
  const item = (it, w) => { if (!it) return; if (it.text) out.push([w, it.text]); if (it.note) out.push([w + '.note', it.note]); (it.chain || []).forEach((c, j) => item(c, `${w}.chain[${j}]`)); };
  ex.questions.forEach(q => { if (q.ask) out.push([q.id + '.ask', q.ask]); if (q.tip) out.push([q.id + '.tip', q.tip]); (q.prompt || []).forEach((x, i) => item(x, `${q.id}.prompt[${i}]`)); (q.answer || []).forEach((x, i) => item(x, `${q.id}.answer[${i}]`)); });
  (ex.summary || []).forEach((b, bi) => { if (b.title) out.push([`summary[${bi}].title`, b.title]); (b.items || []).forEach((it, i) => { if (it.text) out.push([`summary[${bi}][${i}]`, it.text]); if (it.label) out.push([`summary[${bi}][${i}].label`, it.label]); }); });
  Object.entries(ex.roundText || {}).forEach(([k, v]) => { if (v.title) out.push([`roundText.${k}`, v.title]); if (v.intro) out.push([`roundText.${k}`, v.intro]); });
  return out;
};
for (const f of files.filter(f => f.startsWith('data/exams/') && f !== 'data/exams/index.json')) {
  const ex = readJson(path.join(SITE, f));
  const plain = new Set(ex.plainQuotes || []);
  for (const [w, s] of contentStrings(ex)) {
    const m = wordRe.exec(strip(s.replace(/\[\[[^\]]+\]\]/g, ''))); if (m) E(`${f} ${w}: colloquial word «${m[2]}» (GEN-01)`);
    for (const q of s.matchAll(/«([^«»]+)»/g)) { // DATA-02
      const inner = q[1]; if (inner.includes('[[') || plain.has(inner)) continue;
      const words = inner.split(/\s+/).filter(x => /[ء-ي]/.test(x));
      if (words.length >= 2) E(`${f} ${w}: quote «${inner}» is not an inline token (DATA-02); tokenize it or list it in plainQuotes`);
    }
  }
}

// ---------- GEN-02: <title>/<h1> equal strings; no Arabic literals in JS outside strings.ar.js ----------
const titles = new Set(Object.values(S.titles));
for (const f of files.filter(f => f.endsWith('.html'))) {
  const h = read(f);
  const t = /<title>([^<]*)<\/title>/.exec(h)?.[1]; if (!titles.has(t)) E(`${f}: <title>${t}</title> is not an entry of strings.ar.js titles`);
  const h1 = /<h1[^>]*>([^<]*)<\/h1>/.exec(h)?.[1]; if (h1 && !titles.has(h1)) E(`${f}: <h1>${h1}</h1> is not an entry of strings.ar.js titles`);
  // CSP hash of the inline theme script (NFR-THM-03, NFR-PRV-04)
  const inl = /<script>([^<]*)<\/script>/.exec(h)?.[1];
  const hash = inl && crypto.createHash('sha256').update(inl).digest('base64');
  if (!inl || !h.includes(`'sha256-${hash}'`)) E(`${f}: CSP does not allow the inline theme script hash`);
  if (!/<html lang="ar" dir="rtl">/.test(h)) E(`${f}: missing <html lang="ar" dir="rtl"> (GEN-04)`);
  if (/<input[^>]+type=["']?range/i.test(h)) E(`${f}: <input type=range> (AUD-12)`);
  if (/\sstyle="/i.test(h)) E(`${f}: inline style attribute (NFR-PRV-04)`);
  if (/(localStorage|indexedDB)/.test(h.replace(/<script>[^<]*<\/script>/, ''))) E(`${f}: storage access outside store.js (DATA-52)`);
}
for (const f of files.filter(f => f.endsWith('.js') && f !== 'sw.template.js')) {
  const src = read(f);
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:])\/\/.*$/gm, '$1');
  if (f !== 'assets/js/core/strings.ar.js') {
    if (/[ء-ي]/.test(code)) E(`${f}: Arabic text outside strings.ar.js (GEN-02)`);
    if (/khayrukum\.app/.test(code)) E(`${f}: site origin in JS (ARCH-01)`);
  }
  if (f !== 'assets/js/core/store.js' && /\b(localStorage|indexedDB)\b/.test(code)) E(`${f}: storage access outside store.js (DATA-52)`);
  if (/\bimport\s*\(/.test(code)) E(`${f}: dynamic import() (ARCH-07)`);
  if (/style="/.test(code)) E(`${f}: style="…" in markup; use the CSSOM (NFR-PRV-04)`);
  if (/type=["']?range/.test(code)) E(`${f}: <input type=range> (AUD-12)`);
  if (/window\.confirm|\bconfirm\(/.test(code)) E(`${f}: window.confirm (GEN-07)`);
}

// ---------- CSS: NFR-A11Y-08/09, NFR-TYP-04 ----------
for (const f of files.filter(f => f.endsWith('.css'))) {
  const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of css.matchAll(/()([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[2].trim(), body = m[3];
    if (/(^|[\s,])(html|body)\s*($|,)/.test(sel) && /overflow(-x)?\s*:\s*hidden/.test(body)) E(`${f}: overflow hidden on html/body (NFR-A11Y-08)`);
    if (/\.knob/.test(sel)) continue; // the seek knob is the one exception (NFR-TYP-04)
    const phys = /(^|[;\s])(margin|padding|border)-(left|right)\s*:|(^|[;\s])(left|right)\s*:|text-align\s*:\s*(left|right)|float\s*:\s*(left|right)/.exec(body);
    if (phys) E(`${f}: physical property in «${sel}» (${phys[0].trim()}) (NFR-TYP-04)`);
    for (const px of body.matchAll(/(-?\d*\.?\d+)px/g)) if (Math.abs(+px[1]) > 2) E(`${f}: ${px[0]} in «${sel}»; use rem (NFR-A11Y-09)`);
    if (/text-align\s*:\s*justify/.test(body) && /qtext|frag|quran/.test(sel)) E(`${f}: justified Quran text (NFR-TYP-02)`);
  }
}

if (errors) { console.error(`\n${errors} lint error(s)`); process.exit(1); }
ok('content and code lint passed');

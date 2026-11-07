// Rendering of items (§4.2) and inline tokens (§4.1) from the corpus — never from typed copies (EX-16).
import { resolveRef, splitInline, parseRef } from './refs.js';
import { esc, n } from './fmt.js';
import { S } from './strings.ar.js';

const vnum = a => `<span class="vnum">﴿${n(a)}﴾</span>`;
const DOTS = '<span class="dots">…</span>';

function reviewNote(corpus, b) {
  const st = corpus.review(b);
  return st && st !== 'verified' ? `<span class="review">${esc(S.reviewNote)}</span>` : '';
}

/** One ref → HTML fragment. opts.full: show full bayt layout / verse numbers. */
export function refHtml(ref, corpus, opts = {}) {
  let r;
  try { r = resolveRef(ref, corpus); } catch { return `<span class="muted">${esc(ref)}</span>`; }
  if (r.kind === 'q') {
    const body = r.parts.map(p => esc(p.text) + (p.full && (opts.verseNums ?? true) ? ' ' + vnum(p.n) : '')).join(' ');
    return `<span class="frag q" lang="ar">${body}</span>`;
  }
  const rn = reviewNote(corpus, r.ref.bayt);
  if (r.parts.length === 2) return `<span class="bayt both"><span class="h">${esc(r.parts[0].text)}</span><span class="h">${esc(r.parts[1].text)}${rn}</span></span>`;
  return `<span class="frag t">${esc(r.parts[0].text)}</span>${rn}`;
}

/** Content string with inline tokens → HTML. */
export function inlineHtml(str, corpus) {
  if (!str) return '';
  return splitInline(str).map(p => (p.text != null ? esc(p.text) : p.refs.map(r => refHtml(r, corpus, { verseNums: false })).join(' ' + DOTS + ' '))).join('');
}
/** Content string with inline tokens → plain text (copy, snapshots). */
export function inlineText(str, corpus) {
  if (!str) return '';
  return splitInline(str).map(p => (p.text != null ? p.text : p.refs.map(r => refText(r, corpus)).join(' … '))).join('');
}
export function refText(ref, corpus) {
  try { const r = resolveRef(ref, corpus); return r.parts.map(p => p.text).join(r.kind === 't' ? ' · ' : ' '); } catch { return ref; }
}

/** Number shown before an answer line, e.g. «٦» or «٥٤». */
export function itemNumber(it) {
  const ref = it.ref || it.refs?.[0];
  if (!ref) return '';
  const p = parseRef(ref);
  if (p.kind === 'q') return p.aya === p.ayaTo ? n(p.aya) : `${n(p.aya)}–${n(p.ayaTo)}`;
  return n(p.bayt);
}

/** Item → inline HTML (prompt style). */
export function itemHtml(it, corpus) {
  let body;
  if (it.chain) return chainHtml(it, corpus);
  if (it.ref) body = refHtml(it.ref, corpus, { verseNums: false });
  else if (it.refs) body = it.refs.map(r => refHtml(r, corpus, { verseNums: false })).join(' ' + DOTS + ' ');
  else body = `<span class="itext">${inlineHtml(it.text || '', corpus)}</span>`;
  if (it.dots === 'before' || it.dots === 'both') body = DOTS + ' ' + body;
  if (it.dots === 'after' || it.dots === 'both') body = body + ' ' + DOTS;
  if (it.label) body = `<b>${esc(it.label)}</b>: ` + body;
  if (it.showRef) body += ` <span class="note">(${itemNumber(it)})</span>`;
  if (it.note) body += ` <span class="note">(${inlineHtml(it.note, corpus)})</span>`;
  return body;
}
export function itemText(it, corpus) {
  if (it.chain) return it.chain.map(c => itemText(c, corpus)).join(it.sep || ' · ');
  let s = it.ref ? refText(it.ref, corpus) : it.refs ? it.refs.map(r => refText(r, corpus)).join(' … ') : inlineText(it.text || '', corpus);
  if (it.dots === 'before' || it.dots === 'both') s = '… ' + s;
  if (it.dots === 'after' || it.dots === 'both') s += ' …';
  if (it.label) s = it.label + ': ' + s;
  if (it.note) s += ` (${inlineText(it.note, corpus)})`;
  return s;
}
function chainHtml(it, corpus) {
  return it.chain.map(c => itemHtml(c, corpus)).join(`<span class="dots">${esc(it.sep || ' · ')}</span>`);
}

/** Prompt items → HTML block. */
export function promptHtml(items, corpus) {
  return `<div class="prompt">${items.map(it => `<div>${itemHtml(it, corpus)}</div>`).join('')}</div>`;
}

/** Answer items → lines with the verse/bayt number (EX-09). */
export function answerLines(items, corpus) {
  return items.map(it => {
    if (it.chain) return `<div class="al"><span class="tx">${chainHtml(it, corpus)}</span></div>`;
    const full = it.ref && /^(\d+:\d+|t:\d+)$/.test(it.ref);
    const body = full && !it.note && !it.label && !it.dots ? refHtml(it.ref, corpus, { verseNums: false }) : itemHtml(it, corpus);
    return `<div class="al"><span class="ref">${itemNumber(it)}</span><span class="tx">${body}</span></div>`;
  }).join('');
}

/** Bayt numbers referenced anywhere in items (for review notes / GEN-08 prefill). */
export function baytNumbers(items) {
  const out = [];
  const add = r => { try { const p = parseRef(r); if (p.kind === 't' && !out.includes(p.bayt)) out.push(p.bayt); } catch { /* ignore */ } };
  for (const it of items || []) { if (it.ref) add(it.ref); (it.refs || []).forEach(add); (it.chain || []).forEach(c => c.ref && add(c.ref)); }
  return out;
}

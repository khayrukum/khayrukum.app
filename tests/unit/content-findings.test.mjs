// Content checks written by the test agent (independent of tools/port/align.mjs and tools/validate-data.mjs).
// They compare what each reference RESOLVES to with what the baseline phrase / the question's own note says.
// No Quran or Tuhfa text is typed here: phrases come from tools/port/alignment-table.tsv and the corpus files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, read, loadTanzil, resolve } from '../lib/tanzil.mjs';

const tz = loadTanzil();
const abyat = read('site/data/tuhfa/abyat.json').abyat;

/** Consonant skeleton: letters only, no tatweel, weak letters and hamza carriers dropped, ة→ه. Loose on purpose. */
const skel = s => [...s.normalize('NFD')].filter(ch => { const c = ch.codePointAt(0); return (c >= 0x0621 && c <= 0x064A && c !== 0x0640) || ch === ' '; }).join('')
  .replace(/[اأإآءؤئويى]/g, '').replace(/ة/g, 'ه');

test('alignment table: every word of a baseline phrase occurs in the text its reference resolves to (DATA-25, LIC-05)', () => {
  const rows = readFileSync(join(ROOT, 'tools/port/alignment-table.tsv'), 'utf8').trim().split('\n').slice(1).map(l => l.split('\t'));
  assert.ok(rows.length > 500);
  const bad = [];
  for (const [qid, field, phrase, ref, , status] of rows) {
    const text = ref.split('|').map(r => resolve(r, tz, abyat).map(p => p.text).join(' ')).join(' ');
    const hay = skel(text).replace(/ /g, '');
    const missing = skel(phrase).split(' ').filter(w => w && !hay.includes(w));
    if (missing.length) bad.push(`${qid} ${field} [${status}] ${ref}: baseline «${phrase}» → resolves to «${text}»`);
  }
  assert.deepEqual(bad, []);
});

test('each published exam file uses exactly the references recorded in the alignment table for the human overrides', () => {
  const ov = read('tools/port/align-overrides.json');
  for (const [k, v] of Object.entries(ov)) {
    const exam = k.split('/')[0];
    const raw = readFileSync(join(ROOT, `site/data/exams/${exam}.json`), 'utf8');
    assert.ok(raw.includes(v.ref) || raw.includes(v.ref.replace(/^t:/, '')), `${k}: ${v.ref} not found in ${exam}.json`);
    assert.ok(v.reason && v.reason.length > 10, `${k}: override needs a reason`);
  }
});

test('quran-to-tuhfa prompts: the verse in the note «البقرة N» is the verse the reference points to', () => {
  const d = (s) => +[...s].map(ch => '٠١٢٣٤٥٦٧٨٩'.indexOf(ch)).join('');
  const bad = [];
  for (const q of read('site/data/exams/tuhfa.json').questions.filter(x => x.type === 'quran-to-tuhfa')) {
    const note = (q.prompt || []).map(it => it.note || '').join(' ');
    const m = /البقرة ([٠-٩]+)(?:–([٠-٩]+))?/.exec(note); if (!m) continue;
    const lo = d(m[1]), hi = m[2] ? d(m[2]) : lo;
    for (const it of q.prompt) for (const r of [it.ref, ...(it.refs || [])].filter(Boolean)) {
      const v = +r.split(':')[1];
      if (r.startsWith('2:') && (v < lo || v > hi)) bad.push(`${q.id}: note says «${m[0]}» but the text shown is ${r}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('exam facts derived from Tanzil metadata: `pages` questions, `next`/`next-bayt`/`chapters` adjacency', () => {
  // independent parse of Tanzil's quran-data.js page table: [sura, aya] per page
  const js = readFileSync(join(ROOT, 'data/source/quran-data.js'), 'utf8');
  const block = /QuranData\.Page\s*=\s*\[([\s\S]*?)\];/.exec(js)[1];
  const pages = [...block.matchAll(/\[(\d+),\s*(\d+)\]/g)].map(m => [+m[1], +m[2]]);
  assert.ok(pages.length >= 604);
  const start = p => pages[p - 1];
  const bad = [];
  const first = it => { const r = it.ref || it.refs?.[0]; return r; };
  for (const id of ['baqarah-1', 'baqarah-2']) for (const q of read(`site/data/exams/${id}.json`).questions) {
    if (!['pages', 'next', 'topic-end'].includes(q.type)) continue;
    const pv = +first(q.prompt[0]).split(':')[1], av = +first(q.answer[0]).split(':')[1];
    if (q.type === 'pages' && q.page) {
      const { from, to, dir } = q.page;
      if (dir === 'back') { // prompt = first verse of page `from`, answer = last verse of page `to`
        if (start(from)[0] !== 2 || start(from)[1] !== pv) bad.push(`${q.id}: prompt is not the first verse of page ${from}`);
        if (av !== pv - 1 || to !== from - 1) bad.push(`${q.id}: answer is not the verse before page ${from}`);
      } else {
        if (start(to)[0] !== 2 || start(to)[1] !== av) bad.push(`${q.id}: answer 2:${av} is not the first verse of page ${to} (2:${start(to)[1]})`);
        if (pv !== av - 1 || to !== from + 1) bad.push(`${q.id}: prompt is not the last verse of page ${from}`);
      }
    }
    if ((q.type === 'next' || q.type === 'topic-end') && av !== pv + 1) bad.push(`${q.id}: answer 2:${av} does not follow the prompt verse 2:${pv}`);
  }
  const t = read('site/data/exams/tuhfa.json'), ch = read('site/data/tuhfa/abyat.json').chapters;
  for (const q of t.questions) {
    if (!['next-bayt', 'complete-hemistich', 'chapters'].includes(q.type)) continue;
    const pb = +first(q.prompt[0]).split(':')[1], ab = +first(q.answer[0]).split(':')[1];
    if (q.type === 'next-bayt' && ab !== pb + 1) bad.push(`${q.id}: answer bayt ${ab} does not follow ${pb}`);
    if (q.type === 'complete-hemistich' && ab !== pb) bad.push(`${q.id}: answer is another bayt`);
    if (q.type === 'chapters') {
      const back = Math.abs(ab - pb) === 1 && ab < pb;
      const boundary = back ? ch.some(c => c.from === pb) : ch.some(c => c.to === pb) && ch.some(c => c.from === ab);
      if (!boundary || Math.abs(ab - pb) !== 1) bad.push(`${q.id}: ${pb} → ${ab} is not a chapter boundary`);
    }
  }
  assert.deepEqual(bad, []);
});

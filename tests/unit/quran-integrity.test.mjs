// Independent Quran/Tuhfa text-integrity check (written by the test agent; LIC-01/02, LIC-10, DATA-01, EX-16).
// It deliberately does NOT use tools/port/align.mjs, tools/validate-data.mjs or tools/lib/*.
// It has its own Tanzil parser and its own reference resolver, and compares their output with
// (1) the shipped corpus files and (2) what the application's own resolver (site/assets/js/core/refs.js) returns.
// No Quran text is typed in this file: everything is read from the Tanzil download.
//
// TANZIL_FILE=/path/to/quran-uthmani.txt overrides the source (default: data/source/quran-uthmani.txt).
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, read, loadTanzil, resolve, allDataRefs } from '../lib/tanzil.mjs';


const tz = loadTanzil();
const abyat = read('site/data/tuhfa/abyat.json').abyat;

test('Tanzil source parses to 6236 verses', () => { assert.equal(tz.count, 6236); assert.ok(tz.basmala); });

test('shipped site/data/quran/002.json is byte-equal to Tanzil, verse by verse (LIC-01/02, DATA-14)', () => {
  const q = read('site/data/quran/002.json');
  assert.equal(q.ayat.length, 286);
  const bad = [];
  q.ayat.forEach((v, i) => { if (v !== tz.verses.get('2:' + (i + 1))) bad.push(i + 1); });
  assert.deepEqual(bad, []);
  assert.equal(q.basmala, tz.basmala);
  assert.ok(q.notice && q.notice.includes('Tanzil') && q.notice.includes('tanzil.net'), 'Tanzil notice present');
  assert.equal(q.ayat.join('\n').normalize('NFC') === q.ayat.join('\n'), false, 'sanity: text is not NFC-normalized (byte-exact copy)');
});

test('Tuhfa abyat are byte-equal to data/source/tuhfa-tashkeel.json (LIC-10)', () => {
  const src = read('data/source/tuhfa-tashkeel.json');
  const flat = JSON.stringify(src);
  let n = 0;
  for (const [k, hs] of Object.entries(abyat)) { for (const h of hs) { assert.ok(flat.includes(JSON.stringify(h).slice(1, -1)), `bayt ${k} hemistich not found verbatim in the source file`); n++; } }
  assert.equal(n, 122);
});

test('every reference in site/data resolves; the app resolver returns an exact substring of the claimed Tanzil verse', async () => {
  const { resolveRef } = await import(join(ROOT, 'site/assets/js/core/refs.js'));
  const q2 = read('site/data/quran/002.json');
  const corpus = { verse: (s, a) => (s === 2 ? q2.ayat[a - 1] : undefined), bayt: b => abyat[b] };
  const refs = allDataRefs();
  const problems = []; let nq = 0, nt = 0;
  for (const r of refs) {
    let mine, app;
    try { mine = resolve(r.ref, tz, abyat); } catch (e) { problems.push(`${r.file} ${r.path} ${r.ref}: ${e.message}`); continue; }
    try { app = resolveRef(r.ref, corpus).parts; } catch (e) { problems.push(`${r.file} ${r.path} ${r.ref}: app resolver threw ${e.message}`); continue; }
    r.ref.startsWith('t:') ? nt++ : nq++;
    if (app.length !== mine.length) { problems.push(`${r.ref}: part count ${app.length} vs ${mine.length}`); continue; }
    app.forEach((p, i) => {
      const src = mine[i].key.startsWith('t:') ? abyat[mine[i].key.split(':')[1]][mine[i].key.split(':')[2] - 1] : tz.verses.get(mine[i].key);
      if (!src.includes(p.text)) problems.push(`${r.file} ${r.path} ${r.ref}: app text is not a substring of ${mine[i].key}`);
      if (p.text !== mine[i].text) problems.push(`${r.file} ${r.path} ${r.ref}: app text differs from the independent resolver`);
      if (p.text !== p.text.trim() || p.text === '') problems.push(`${r.ref}: empty or padded`);
    });
  }
  console.log(`# refs checked: ${refs.length} (Quran ${nq}, Tuhfa ${nt}); problems: ${problems.length}`);
  assert.deepEqual(problems, []);
  assert.ok(nq > 300 && nt > 150);
});

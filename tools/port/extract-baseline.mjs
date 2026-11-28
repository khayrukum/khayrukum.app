#!/usr/bin/env node
// One-off porting step 1: read the baseline exam pages (hand-built artifacts) and dump
// their question banks as plain JSON into tools/port/baseline/.
// Usage: node tools/port/extract-baseline.mjs <reference-dir>
//
// The output is a TOOL INPUT for align.mjs (DATA-25). It is never shipped to the site.
// Full-verse answers are stored as `null` (the verse number is enough), so the
// baseline's typed, unvocalized verse table is NOT copied. Partial phrases are kept,
// because align.mjs needs them to find word spans.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ref = process.argv[2];
if (!ref) { console.error('usage: extract-baseline.mjs <reference-dir>'); process.exit(2); }
const out = path.join(path.dirname(new URL(import.meta.url).pathname), 'baseline');
fs.mkdirSync(out, { recursive: true });

function grab(file, from, to) {
  const s = fs.readFileSync(path.join(ref, file), 'utf8');
  const i = s.indexOf(from), j = s.indexOf(to, i);
  if (i < 0 || j < 0) throw new Error(`markers not found in ${file}`);
  return s.slice(i, j);
}

function quran(file, id) {
  const code = grab(file, 'const AY=', 'const HLOG') + '\n;globalThis.__={AY,R};';
  const ctx = {}; vm.createContext(ctx); vm.runInContext(code, ctx);
  const { AY, R } = ctx.__;
  const rounds = R.map(r => ({
    id: r.id, t: r.t, d: r.d,
    qs: r.qs.map(q => {
      const o = {};
      if (q.ask) o.ask = q.ask;
      o.p = q.p;
      o.a = q.a.map(([n, t]) => [n, t === AY[n] ? null : t]);
      if (q.tip) o.tip = q.tip;
      return o;
    })
  }));
  return { exam: id, source: file, kind: 'quran', rounds };
}

function tuhfa(file, id) {
  const code = grab(file, 'const B=', 'const CH=') + '\n;globalThis.__={B,R,L,S1,S2};';
  const ctx = {}; vm.createContext(ctx); vm.runInContext(code, ctx);
  const { B, R, L, S1, S2 } = ctx.__;
  const ns = Object.keys(B).map(Number);
  const asBayt = p => {
    for (const n of ns) {
      if (p === L(n)) return { bayt: n, part: 0 };
      if (p === S1(n)) return { bayt: n, part: 1 };
      if (p === S2(n)) return { bayt: n, part: 2 };
    }
    return p;
  };
  const rounds = R.map(r => ({
    id: r.id, t: r.t, d: r.d,
    qs: r.qs.map(q => {
      const o = {};
      if (q.ask) o.ask = q.ask;
      o.p = asBayt(q.p);
      o.a = q.a.map(([n, t]) => [n, t === L(n) ? null : t]);
      if (q.tip) o.tip = q.tip;
      return o;
    })
  }));
  return { exam: id, source: file, kind: 'tuhfa', rounds };
}

// Plan: rub' boundaries and opening phrases (DATA-13 input; boundaries are checked against Tanzil metadata).
{
  const code = grab('plan.html', 'const RUBS=', 'const DAYS=') + '\n;globalThis.__=RUBS;';
  const ctx = {}; vm.createContext(ctx); vm.runInContext(code, ctx);
  const rubs = ctx.__.map(r => ({ rub: r.n, phrase: r.s, from: r.a, to: r.b }));
  fs.writeFileSync(path.join(out, 'plan-rubs.json'), '{"sura":2,"source":"plan.html","rubs":[\n' + rubs.map(r => '  ' + JSON.stringify(r)).join(',\n') + '\n]}\n');
  console.log('plan-rubs: ' + rubs.length + ' rubs');
}

const all = [quran('exam-1.html', 'baqarah-1'), quran('exam-2.html', 'baqarah-2'), tuhfa('tuhfa-exam.html', 'tuhfa')];
for (const x of all) {
  const n = x.rounds.reduce((a, r) => a + r.qs.length, 0);
  const body = x.rounds.map(r => '  {"id":' + JSON.stringify(r.id) + ',"t":' + JSON.stringify(r.t) + ',"d":' + JSON.stringify(r.d) + ',"qs":[' +
    r.qs.map(q => '\n    ' + JSON.stringify(q)).join(',') + (r.qs.length ? '\n  ' : '') + ']}').join(',\n');
  fs.writeFileSync(path.join(out, x.exam + '.json'),
    `{"exam":${JSON.stringify(x.exam)},"source":${JSON.stringify(x.source)},"kind":${JSON.stringify(x.kind)},"rounds":[\n${body}\n]}\n`);
  console.log(`${x.exam}: ${n} questions`);
}

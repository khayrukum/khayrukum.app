#!/usr/bin/env node
// Writes site/data/tuhfa/abyat.json from data/source/tuhfa-tashkeel.json, byte for byte (LIC-10, DATA-15).
// Review status (DATA-17) and verification records are kept from the existing file when present.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { ROOT, writeJson } from './lib/util.mjs';

const SRC = `${ROOT}/data/source/tuhfa-tashkeel.json`;
const OUT = `${ROOT}/site/data/tuhfa/abyat.json`;

const raw = fs.readFileSync(SRC);
const src = JSON.parse(raw.toString('utf8'));
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;

// DATA-16: chapter names defined once. `name` = listening page; `short` = exam names.
const chapters = [
  [1, 'المقدمة', 'المقدمة', 1, 5],
  [2, 'أحكام النون الساكنة والتنوين', 'النون الساكنة والتنوين', 6, 16],
  [3, 'النون والميم المشددتان', 'المشددتان', 17, 17],
  [4, 'أحكام الميم الساكنة', 'الميم الساكنة', 18, 23],
  [5, 'لام التعريف ولام الفعل', 'اللامات', 24, 29],
  [6, 'المتماثلان والمتقاربان والمتجانسان', 'المثلان', 30, 34],
  [7, 'أقسام المد', 'أقسام المد', 35, 41],
  [8, 'أحكام المد', 'أحكام المد', 42, 47],
  [9, 'أقسام المد اللازم', 'المد اللازم', 48, 57],
  [10, 'الخاتمة', 'الخاتمة', 58, 61]
].map(([n, name, short, from, to]) => ({ n, name, short, from, to }));

const abyat = {};
for (const k of Object.keys(src).sort((a, b) => a - b)) abyat[k] = src[k];

const review = prev?.review || { 26: 'pending', 28: 'pending', 57: 'pending' };
const doc = {
  schema: 'tuhfa-abyat',
  version: prev?.version || '1.0.0',
  title: 'تحفة الأطفال',
  author: 'سليمان الجمزوري',
  source: {
    file: 'tuhfa-tashkeel.json',
    sha256: crypto.createHash('sha256').update(raw).digest('hex'),
    verifiedAgainst: prev?.source?.verifiedAgainst ?? null
  },
  chapters,
  abyat,
  review
};
writeJson(OUT, doc);
const pending = Object.entries(review).filter(([, v]) => v !== 'verified').map(([k]) => k);
console.log(`abyat.json: ${Object.keys(abyat).length} abyat; under review: ${pending.join(', ') || 'none'}`);

// TST-13: axe-core on every page × both themes × 375 px; serious/critical violations fail (NFR-A11Y-01).
// Also TST-14 target size ≥ 24 px (NFR-A11Y-02). Skipped when axe-core is not installed (npm install).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from '../../tools/serve.mjs';

const require = createRequire(import.meta.url);
let axeSource = null; try { axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'); } catch { /* not installed */ }
const DIST = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../dist');
const PAGES = ['', 'plan/', 'exam/?id=baqarah-1', 'exam/?id=tuhfa', 'random/', 'history/', 'listen/', 'settings/', 'about/', 'privacy/', '404.html'];

test('target size ≥ 24 × 24 px for every interactive element (NFR-A11Y-02)', async () => {
  const { chromium } = require('playwright');
  const srv = createServer(DIST); await new Promise(r => srv.listen(0, r)); const base = `http://localhost:${srv.address().port}/`;
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 375, height: 800 } });
  try {
    for (const u of PAGES) {
      await p.goto(base + u); await p.waitForLoadState('networkidle');
      const small = await p.evaluate(() => [...document.querySelectorAll('button, a[href], select, input:not(.sr-only), summary, [role=slider], [role=checkbox]')]
        .filter(e => e.offsetParent !== null && !e.closest('p, li > span, .notes p, .prose p, .prose li, .ask, .tip, .notice'))
        .map(e => { const r = e.getBoundingClientRect(); return { t: (e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 20), w: r.width, h: r.height }; })
        .filter(x => x.w > 0 && (x.w < 24 || x.h < 24)));
      assert.deepEqual(small, [], `${u}: targets smaller than 24 px`);
    }
  } finally { await b.close(); srv.close(); }
});

test('axe-core: no serious or critical violations, light and dark (NFR-A11Y-01/03)', { skip: !axeSource && 'axe-core not installed' }, async () => {
  const { chromium } = require('playwright');
  const srv = createServer(DIST); await new Promise(r => srv.listen(0, r)); const base = `http://localhost:${srv.address().port}/`;
  const b = await chromium.launch();
  const found = [];
  try {
    for (const scheme of ['light', 'dark']) {
      const p = await b.newPage({ viewport: { width: 375, height: 800 }, colorScheme: scheme });
      for (const u of PAGES) {
        await p.goto(base + u); await p.waitForLoadState('networkidle');
        await p.addScriptTag({ content: axeSource }).catch(async () => { await p.evaluate(axeSource); });
        const v = await p.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.map(x => ({ id: x.id, impact: x.impact, n: x.nodes.length, t: x.nodes[0]?.target })));
        v.filter(x => x.impact === 'serious' || x.impact === 'critical').forEach(x => found.push(`${scheme} ${u}: ${x.id} (${x.n}) ${JSON.stringify(x.t)}`));
      }
      await p.close();
    }
  } finally { await b.close(); srv.close(); }
  assert.deepEqual(found, []);
});

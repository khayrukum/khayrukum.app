// NFR-A11Y-03: text colour pairs from the theme tokens reach 4.5:1 in both themes (axe runs in CI too).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../../site/assets/css/app.css', import.meta.url), 'utf8');
const block = sel => { const i = css.indexOf(sel); return css.slice(i, css.indexOf('}', i)); };
const tokens = s => Object.fromEntries([...s.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/g)].map(m => [m[1], m[2]]));
const lum = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const PAIRS = [['ink', 'bg'], ['ink', 'surface'], ['muted', 'bg'], ['muted', 'surface'], ['accent', 'bg'], ['accent', 'surface'], ['accent-ink', 'accent'], ['gold', 'gold-soft'], ['gold', 'surface'], ['warn', 'warn-soft'], ['bad', 'bad-soft'], ['mid', 'mid-soft'], ['accent', 'accent-soft'], ['ink', 'gold-soft']];

for (const [name, sel] of [['light', ':root {'], ['dark', ':root[data-theme="dark"] {']]) {
  test(`contrast ≥ 4.5:1 (${name})`, () => {
    const t = tokens(block(sel));
    for (const [f, b] of PAIRS) assert.ok(ratio(t[f], t[b]) >= 4.5, `${name}: ${f} on ${b} = ${ratio(t[f], t[b]).toFixed(2)}`);
  });
}

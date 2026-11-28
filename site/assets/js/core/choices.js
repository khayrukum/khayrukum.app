// Shuffling and «ما رقمها؟» choices, kept apart so the exam page does not load the random-exam logic.
export function shuffle(a, rnd = Math.random) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/**
 * Four choices for a «ما رقمها؟» question: the right number and three close ones (within ±6, inside [lo, hi]),
 * in ascending order. Deterministic for a given seed, so a reload shows the same choices.
 */
export function numberChoices(num, lo, hi, seed) {
  let h = 2166136261; for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
  const near = []; for (let x = Math.max(lo, num - 6); x <= Math.min(hi, num + 6); x++) if (x !== num) near.push(x);
  for (let x = lo; near.length < 3 && x <= hi; x++) if (x !== num && !near.includes(x)) near.push(x);
  return [num, ...shuffle(near, rnd).slice(0, 3)].sort((a, b) => a - b);
}

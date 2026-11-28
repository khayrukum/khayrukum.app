// The custom seek slider (AUD-12): RTL (start = right edge), pointer capture, a preview while dragging, the seek
// applied on release, keys ArrowLeft = +5 s, ArrowRight = −5 s, Home, End. Never <input type=range>.
// api = { now() → { active, time, dur }, seek(t), skip(d), text(t, d) → aria-valuetext, onPaint?(t, d) }
export function seekbar(sk, api) {
  let drag = null;
  const paint = (t, d) => {
    const p = d ? Math.max(0, Math.min(1, t / d)) : 0;
    sk.style.setProperty('--p', (p * 100).toFixed(2) + '%');
    sk.setAttribute('aria-valuemax', String(Math.round(d || 0))); sk.setAttribute('aria-valuenow', String(Math.round(t || 0)));
    sk.setAttribute('aria-valuetext', api.text(t, d));
    api.onPaint?.(t, d);
  };
  const frac = x => { const r = sk.getBoundingClientRect(); return Math.max(0, Math.min(1, (r.right - x) / r.width)); };
  sk.addEventListener('pointerdown', e => {
    const s = api.now(); if (!s.active) return;
    e.preventDefault(); sk.setPointerCapture(e.pointerId); drag = { id: e.pointerId, t: frac(e.clientX) * s.dur };
    paint(drag.t, s.dur);
  });
  sk.addEventListener('pointermove', e => { if (!drag || e.pointerId !== drag.id) return; const d = api.now().dur; drag.t = frac(e.clientX) * d; paint(drag.t, d); });
  sk.addEventListener('pointerup', e => { if (!drag || e.pointerId !== drag.id) return; const t = drag.t; drag = null; api.seek(t); });
  sk.addEventListener('pointercancel', () => { drag = null; });
  sk.addEventListener('keydown', e => {
    const s = api.now(); if (!s.active) return;
    const m = { ArrowLeft: 5, ArrowRight: -5 }[e.key];
    if (m != null) { e.preventDefault(); api.skip(m); }
    else if (e.key === 'Home') { e.preventDefault(); api.seek(0); }
    else if (e.key === 'End') { e.preventDefault(); api.seek(s.dur); }
  });
  /** Show a position, unless the reader is dragging the knob. */
  return { paint: (t, d) => { if (!drag) paint(t, d); }, dragging: () => !!drag };
}

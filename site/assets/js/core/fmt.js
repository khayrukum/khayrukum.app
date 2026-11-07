// Formatting (GEN-03): Arabic-Indic digits, no grouping, «٫» decimals, «٪», Arabic Gregorian dates.
const NF = new Intl.NumberFormat('ar-EG', { useGrouping: false });
const NF1 = new Intl.NumberFormat('ar-EG', { useGrouping: false, maximumFractionDigits: 2 });

export const n = x => NF.format(x);
export const dec = x => NF1.format(x);
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
export const npct = (a, b) => n(pct(a, b));
export const rate = r => `${dec(r)}×`;
export const mb = bytes => dec(Math.round((bytes / 1048576) * 10) / 10);

export function clock(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${n(m)}:${n(Math.floor(s / 10))}${n(s % 10)}`;
}
export const weekday = t => new Date(t).toLocaleDateString('ar-EG', { weekday: 'long' });
export const dayMonth = t => new Date(t).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' });
export const fullDate = t => new Date(t).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });
export const time = t => new Date(t).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
/** HUB-04: weekday if within 6 days, otherwise the date. */
export function when(t, now = Date.now()) {
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  const d1 = new Date(t); d1.setHours(0, 0, 0, 0);
  const days = Math.round((d0 - d1) / 86400000);
  return days <= 6 ? weekday(t) : dayMonth(t);
}
export const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
export const isoDate = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escape text for HTML (NFR-PRV-05). */
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);

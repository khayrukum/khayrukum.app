// Cloudflare Web Analytics (NFR-PRV-03, DEP-07): optional, page views only, skipped with DNT/GPC,
// fails silently (ARCH-06). The token lives in config.json (`analytics.cloudflareToken`).
import { config } from './base.js';

export async function loadAnalytics() {
  try {
    const token = (await config()).analytics?.cloudflareToken;
    if (!token) return;
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
    if (/^(capacitor|ionic):/.test(location.protocol) || location.hostname === 'localhost' && location.protocol === 'https:') return; // phase-2 apps
    const s = document.createElement('script');
    s.defer = true; s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    s.dataset.cfBeacon = JSON.stringify({ token, spa: false });
    s.onerror = () => {};
    document.head.appendChild(s);
  } catch { /* silent */ }
}

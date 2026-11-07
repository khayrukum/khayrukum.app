// Service worker registration and the multi-tab-safe update flow (OFF-02a.2, OFF-10, OFF-12, HUB-09).
import { url } from './base.js';
import { S } from './strings.ar.js';
import * as audio from './audio.js';
import { onMessage } from './store.js';

const readyFns = new Set(); let isReady = false;
export const onReady = fn => { readyFns.add(fn); if (isReady) fn(); };
const markReady = () => { if (!isReady) { isReady = true; readyFns.forEach(f => f()); } };
const updFns = new Set(); let waiting = null;
export const onUpdate = fn => { updFns.add(fn); if (waiting) fn(waiting); };
export const hasUpdate = () => !!waiting;

export function applyUpdate() { if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' }); }

export function register({ toast } = {}) {
  if (!('serviceWorker' in navigator)) return; // ARCH-05
  const sw = navigator.serviceWorker;
  // OFF-10: reload exactly once per new controller, and only if there was a previous controller.
  let hadController = !!sw.controller;
  const reloadedFor = new Set();
  sw.addEventListener('controllerchange', () => {
    const c = sw.controller; const id = c ? c.scriptURL + '#' + Date.now() : '';
    if (!hadController) { hadController = true; markReady(); return; }
    if (reloadedFor.size) return;
    reloadedFor.add(id);
    if (audio.isPlaying()) { toast?.(S.update.afterListening, { sticky: true }); return; }
    location.reload();
  });
  sw.addEventListener('message', e => { if (e.data?.type === 'precached' || e.data?.type === 'activated') markReady(); });
  onMessage(m => { if (m?.type === 'precached' || m?.type === 'activated') markReady(); });

  const notifyWaiting = w => {
    waiting = w; updFns.forEach(f => f(w));
    const show = () => toast?.(S.update.available, { sticky: true, action: { label: S.update.now, run: applyUpdate } });
    if (audio.isPlaying()) { const off = audio.on('change', s => { if (!s.playing) { off(); show(); } }); } else show();
  };
  const go = async () => {
    try {
      const reg = await sw.register(url('sw.js'), { scope: url(''), updateViaCache: 'none' });
      if (reg.active && sw.controller) markReady();
      if (reg.waiting && sw.controller) notifyWaiting(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing; if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed') { if (sw.controller) notifyWaiting(w); else markReady(); }
          if (w.state === 'activated') markReady();
        });
      });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    } catch { /* OFF-12: the app works without a service worker */ }
  };
  if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
}

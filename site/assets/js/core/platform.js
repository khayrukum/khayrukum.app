// Platform adapter (ARCH-04): clipboard, file save/open, share, install prompt, persistent storage.
// Feature-detected so a native (Capacitor) implementation can replace it later.

export async function copyText(text) {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; } } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', '');
    ta.className = 'sr-only'; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand && document.execCommand('copy'); ta.remove(); return !!ok;
  } catch { return false; }
}
/** Select an element's text so the user can copy by hand (EX-15 fallback). */
export function selectText(el) {
  const s = getSelection(), r = document.createRange(); r.selectNodeContents(el); s.removeAllRanges(); s.addRange(r);
}

/** Save a file: iOS share sheet when files can be shared, otherwise a download. */
export async function saveFile(name, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  try {
    const file = new File([blob], name, { type });
    if (isIOS() && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); return 'shared'; }
  } catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'downloaded';
}

/** Read a picked file as text. */
export const readFile = file => file.text();

export async function share(data) { if (navigator.share) { try { await navigator.share(data); return true; } catch { return false; } } return false; }

// ----- install (HUB-07) -----
let deferred = null; const waiters = new Set();
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; waiters.forEach(f => f()); });
export const canPromptInstall = () => !!deferred;
export const onInstallable = fn => { waiters.add(fn); if (deferred) fn(); };
export async function promptInstall() { if (!deferred) return false; deferred.prompt(); const r = await deferred.userChoice.catch(() => null); deferred = null; return r?.outcome === 'accepted'; }
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export function iosMajor() { const m = /OS (\d+)_/.exec(navigator.userAgent) || /Version\/(\d+)/.exec(navigator.userAgent); return m ? +m[1] : 0; }
/** GEN-06: WhatsApp, Instagram, Facebook in-app browsers. */
export const inAppBrowser = () => /WhatsApp|Instagram|FBAN|FBAV|FB_IAB/i.test(navigator.userAgent);

// ----- storage (DATA-53, SET-03) -----
export async function persist() { try { return navigator.storage?.persist ? await navigator.storage.persist() : false; } catch { return false; } }
export async function persisted() { try { return navigator.storage?.persisted ? await navigator.storage.persisted() : false; } catch { return false; } }
export async function estimate() { try { return navigator.storage?.estimate ? await navigator.storage.estimate() : null; } catch { return null; } }

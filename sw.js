/* iN&Ex service worker: app works offline; online opens always get the latest version */
const V = 'inex-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('inex-v') && k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
function withTimeout(p, ms) {
  return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then(v => { clearTimeout(t); res(v); }, er => { clearTimeout(t); rej(er); }); });
}
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (/(^|\.)script\.google\.com$|googleusercontent\.com$/.test(u.hostname)) return;
  if (r.mode === 'navigate') {
    e.respondWith(withTimeout(fetch(r), 3000).then(res => {
      if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put('./index.html', cp)); }
      return res;
    }).catch(() => caches.match('./index.html').then(m => m || caches.match('./'))));
    return;
  }
  if (u.origin === location.origin) {
    e.respondWith(caches.match(r).then(m => {
      const net = fetch(r).then(res => { if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); } return res; }).catch(() => m);
      return m || net;
    }));
    return;
  }
  if (/fonts\.googleapis\.com$|fonts\.gstatic\.com$|cdnjs\.cloudflare\.com$/.test(u.hostname)) {
    e.respondWith(caches.open('inex-ext').then(c => c.match(r).then(m => {
      const net = fetch(r).then(res => { if (res.ok || res.type === 'opaque') c.put(r, res.clone()); return res; }).catch(() => m);
      return m || net;
    })));
  }
});

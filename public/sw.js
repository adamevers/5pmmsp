// Minimal offline shell: cache the static skin; pages stay network-first.
const CACHE = '5pmmsp-v2';
const SHELL = ['/style.css', '/app.js', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', e => {
  self.skipWaiting();   // take over on update — don't wait for every tab to close
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
});
self.addEventListener('activate', e => {
  e.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))),
  ]));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Chromium sends cache:'only-if-cached' on some back/forward navigations;
  // fetch() rejects on those even while online — let the browser handle them.
  if (e.request.cache === 'only-if-cached' && e.request.mode !== 'same-origin') return;
  e.respondWith(
    fetch(e.request).catch(() =>
      caches.match(e.request).then(hit => hit ||
        new Response('Offline — reconnect to see what\'s pouring.', {
          status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' },
        }))),
  );
});

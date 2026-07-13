// Minimal offline shell: cache the static skin; pages stay network-first.
const CACHE = '5pmmsp-v1';
const SHELL = ['/style.css', '/app.js', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).catch(() =>
      caches.match(e.request).then(hit => hit ||
        new Response('Offline — reconnect to see what\'s pouring.', {
          status: 503, headers: { 'content-type': 'text/plain' },
        }))),
  );
});

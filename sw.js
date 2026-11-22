/* Cache hors-ligne. Augmenter VERSION à chaque mise à jour des fichiers. */
const VERSION = 'murajaa-v15';
const FILES = ['./', 'index.html', 'css/style.css', 'js/config.js', 'js/i18n-dict.js', 'js/i18n.js', 'js/icons.js', 'js/arabic.js', 'js/store.js', 'js/fx.js', 'js/engine.js', 'js/cloud.js', 'js/importer.js', 'js/call.js', 'js/app.js', 'data/tamhidi.js', 'manifest.webmanifest', 'icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// réseau d'abord (pour recevoir les nouveaux mots), cache si hors-ligne
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});

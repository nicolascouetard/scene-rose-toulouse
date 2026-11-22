// Scène Rose — Service Worker PWA (consultation hors-ligne dans le métro toulousain)
const CACHE_VERSION = 'scene-rose-v2';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const DATA_CACHE = `${CACHE_VERSION}-data`;
const POSTER_CACHE = `${CACHE_VERSION}-posters`;

const SHELL_ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(CACHE_VERSION))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Ne jamais intercepter Vite HMR, WebSocket ou POST /api/sync
  if (
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/__vite') ||
    url.pathname.startsWith('/node_modules') ||
    url.pathname === '/api/sync'
  ) {
    return;
  }

  // Données concerts (/api/concerts & /data/concerts.json) : Network-First avec fallback hors-ligne
  if (url.pathname === '/api/concerts' || url.pathname === '/data/concerts.json') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(DATA_CACHE).then((c) => c.put('/data/concerts.json', clone));
          }
          return res;
        })
        .catch(() => caches.match('/data/concerts.json').then((hit) => hit || caches.match(request)))
    );
    return;
  }

  // Affiches locales (/posters/...) : Cache-First pour affichage instantané hors-ligne
  if (url.origin === self.location.origin && url.pathname.startsWith('/posters/')) {
    event.respondWith(
      caches.open(POSTER_CACHE).then((cache) =>
        cache.match(request).then(
          (cached) =>
            cached ||
            fetch(request)
              .then((res) => {
                if (res.ok) cache.put(request, res.clone());
                return res;
              })
              .catch(() => new Response('', { status: 404 }))
        )
      )
    );
    return;
  }

  // Navigation & assets statiques : Stale-While-Revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((res) => {
            if (res.ok && (request.mode === 'navigate' || url.pathname.startsWith('/assets/'))) {
              const clone = res.clone();
              caches.open(SHELL_CACHE).then((c) => c.put(request, clone));
            }
            return res;
          })
          .catch(() => cached || caches.match('/index.html'));
        return cached || networkFetch;
      })
    );
  }
});

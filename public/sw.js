// Scène Rose — Service Worker PWA (consultation hors-ligne dans le métro toulousain)
const CACHE_VERSION = 'scene-rose-v14';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const DATA_CACHE = `${CACHE_VERSION}-data`;
const POSTER_CACHE = `${CACHE_VERSION}-posters`;
const FONT_CACHE = `${CACHE_VERSION}-fonts`;

// Plafond du cache d'affiches : 468 affiches ≈ 17 Mo, sous le quota navigateur,
// mais on borne pour éviter l'éviction du shell sur les petits appareils.
const POSTER_CACHE_LIMIT = 220;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest?v=rose3',
  '/icons/icon-192.png?v=rose3',
  '/icons/icon-512.png?v=rose3',
  '/fonts/fonts.css',
];

/** Évince les entrées les plus anciennes d'un cache (FIFO) au-delà de `limit`. */
async function trimCache(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  const excess = keys.length - limit;
  for (let i = 0; i < excess; i++) {
    await cache.delete(keys[i]);
  }
}

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

  // Ne jamais intercepter Vite HMR, WebSocket ou les endpoints /api/*
  if (
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/__vite') ||
    url.pathname.startsWith('/node_modules') ||
    url.pathname === '/api/sync' ||
    url.pathname === '/api/subscribe' ||
    url.pathname === '/api/favorites-alert'
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
                if (res.ok) {
                  cache.put(request, res.clone()).then(() => {
                    trimCache(POSTER_CACHE, POSTER_CACHE_LIMIT).catch(() => {});
                  });
                }
                return res;
              })
              .catch(() => new Response('', { status: 404 }))
        )
      )
    );
    return;
  }

  // Polices locales (/fonts/*.woff2) : Cache-First, elles sont immuables
  if (url.origin === self.location.origin && url.pathname.startsWith('/fonts/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(FONT_CACHE).then((c) => c.put(request, clone));
            }
            return res;
          })
      )
    );
    return;
  }

  // Pages HTML (navigation) : Network-First pour afficher immédiatement les mises à jour, fallback cache hors-ligne
  if (url.origin === self.location.origin && request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put('/index.html', clone));
          }
          return res;
        })
        .catch(() => caches.match('/index.html').then((hit) => hit || caches.match('/')))
    );
    return;
  }

  // Assets statiques (/assets/..., icônes, manifest) : Stale-While-Revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((res) => {
            if (res.ok && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/'))) {
              const clone = res.clone();
              caches.open(SHELL_CACHE).then((c) => c.put(request, clone));
            }
            return res;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
  }
});

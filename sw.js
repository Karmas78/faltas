const CACHE_NAME = 'ausencias-cache-v1.4.2';
const urlsToCache = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // Usa catch en cada add para que un error en CDN no rompa toda la instalación del SW
        return Promise.all(
          urlsToCache.map(url => {
            return cache.add(url).catch(err => console.warn('No se pudo cachear:', url, err));
          })
        );
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Ignorar peticiones a Google Sheets (CSV) para siempre tener datos frescos si hay red
  if (event.request.url.includes('docs.google.com/spreadsheets')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response('Error de red, modo offline.', { status: 503 }))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Retornar de cache si existe, si no, ir a la red
        return response || fetch(event.request);
      })
  );
});

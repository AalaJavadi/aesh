const CACHE = 'aesh-portfolio-v38';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(key =>
          key.startsWith('aesh-portfolio-') &&
          key !== CACHE
        )
        .map(key => caches.delete(key))
    );

    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // فقط فایل‌های نمونه‌کار را Cache می‌کند
  if (
    url.origin !== self.location.origin ||
    !url.pathname.includes('/assets/portfolio/')
  ) {
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);

    const cached = await cache.match(event.request, {
      ignoreVary: true
    });

    if (cached) {
      return cached;
    }

    const response = await fetch(event.request);

    if (response && response.ok) {
      await cache.put(
        event.request,
        response.clone()
      );
    }

    return response;
  })());
});
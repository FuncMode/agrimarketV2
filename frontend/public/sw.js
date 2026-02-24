const CACHE_NAME = 'agrimarket-tiles-v2';
const TILE_CACHE_EXPIRE = 30 * 24 * 60 * 60 * 1000; // 30 days

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  try {
    const url = new URL(request.url);

    // Only handle OpenStreetMap tile requests
    if (url.hostname.match(/tile\.openstreetmap\.org/)) {
      event.respondWith(handleTileRequest(request));
    }
    // Let all other requests (including API) pass through to network
    // Don't intercept them
  } catch (error) {
    console.error('Service worker fetch handler error:', error);
    // Re-throw to let browser handle it
    throw error;
  }
});

async function handleTileRequest(request) {
  try {
    // Try cache first
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      // Check if cache is expired
      const cacheDate = Number(cachedResponse.headers.get('sw-cache-date'));
      if (Number.isFinite(cacheDate) && Date.now() - cacheDate < TILE_CACHE_EXPIRE) {
        return cachedResponse;
      }
      // If metadata is missing/corrupted, still use stale cached tile as fallback.
      if (!cachedResponse.headers.get('sw-cache-date')) {
        return cachedResponse;
      }
    }

    // Fetch from network with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(request, {
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // Cache successful responses
    if (response && (response.ok || response.type === 'opaque')) {
      const responseToCache = response.clone();

      // Keep original response intact for opaque/cross-origin safety.
      if (responseToCache.type === 'opaque') {
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache).catch(() => {});
        });
      } else {
        const cacheResponse = new Response(responseToCache.body, {
          status: responseToCache.status,
          statusText: responseToCache.statusText,
          headers: new Headers(responseToCache.headers)
        });
        cacheResponse.headers.set('sw-cache-date', Date.now().toString());
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, cacheResponse).catch(() => {});
        });
      }
    }

    return response;
  } catch (error) {
    // Return cached version if available, even if expired
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Return error placeholder if nothing is cached
    return new Response(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      {
        status: 200,
        headers: { 'Content-Type': 'image/png' }
      }
    );
  }
}

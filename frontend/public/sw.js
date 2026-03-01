const TILE_CACHE_NAME = 'agrimarket-tiles-v4';
const STATIC_CACHE_NAME = 'agrimarket-static-v1';
const PAGE_CACHE_NAME = 'agrimarket-pages-v1';
const TILE_CACHE_EXPIRE = 30 * 24 * 60 * 60 * 1000; // 30 days

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/assets/css/main.css',
  '/assets/css/components.css',
  '/assets/css/utilities.css',
  '/assets/images/logo.png',
  '/assets/images/agriculture.webp',
  '/assets/js/config/env-loader.js'
];

const isSameOrigin = (url) => url.origin === self.location.origin;
const isApiRequest = (url) => url.pathname.startsWith('/api/');
const isStaticAsset = (url) => (
  /\.(?:js|css|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|eot|mp3|wav)$/i.test(url.pathname) ||
  url.pathname.startsWith('/assets/')
);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE_NAME);
    await cache.addAll(PRECACHE_ASSETS);
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      const allowed = new Set([TILE_CACHE_NAME, STATIC_CACHE_NAME, PAGE_CACHE_NAME]);
      return Promise.all(
        cacheNames
          .filter((cacheName) => !allowed.has(cacheName))
          .map((cacheName) => caches.delete(cacheName))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  
  try {
    const url = new URL(request.url);

    // Only handle OpenStreetMap tile requests
    if (url.hostname.match(/tile\.openstreetmap\.org/)) {
      event.respondWith(handleTileRequest(request));
      return;
    }

    if (!isSameOrigin(url) || isApiRequest(url)) {
      return;
    }

    if (request.mode === 'navigate') {
      event.respondWith(handlePageRequest(request));
      return;
    }

    if (isStaticAsset(url)) {
      event.respondWith(handleStaticRequest(request));
      return;
    }
  } catch (error) {
    console.error('Service worker fetch handler error:', error);
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
      signal: controller.signal,
      cache: 'reload'
    });

    clearTimeout(timeoutId);

    // Cache successful responses
    if (response && (response.ok || response.type === 'opaque')) {
      const responseToCache = response.clone();

      // Keep original response intact for opaque/cross-origin safety.
      if (responseToCache.type === 'opaque') {
        caches.open(TILE_CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache).catch(() => {});
        });
      } else {
        const cacheResponse = new Response(responseToCache.body, {
          status: responseToCache.status,
          statusText: responseToCache.statusText,
          headers: new Headers(responseToCache.headers)
        });
        cacheResponse.headers.set('sw-cache-date', Date.now().toString());
        caches.open(TILE_CACHE_NAME).then((cache) => {
          cache.put(request, cacheResponse).catch(() => {});
        });
      }
    }

    return response;
  } catch (error) {
    // Retry once while explicitly bypassing HTTP cache.
    try {
      const retryResponse = await fetch(request, { cache: 'reload' });
      if (retryResponse && (retryResponse.ok || retryResponse.type === 'opaque')) {
        return retryResponse;
      }
    } catch (retryError) {
      // Continue to cache fallback
    }

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

async function handleStaticRequest(request) {
  const cache = await caches.open(STATIC_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) {
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          cache.put(request, response.clone()).catch(() => {});
        }
      })
      .catch(() => {});
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    return cached || Response.error();
  }
}

async function handlePageRequest(request) {
  const cache = await caches.open(PAGE_CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return cache.match('/index.html');
  }
}

// Utility to handle tile caching and service worker registration
const TileCacheManager = {
  // Register service worker
  registerServiceWorker: async () => {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/'
        });

        
        // Check for updates periodically
        registration.addEventListener('updatefound', () => {

        });
        
        return registration;
      } catch (error) {
        console.warn('Service Worker registration failed:', error);
        // Don't block app if SW fails
        return null;
      }
    }
    return null;
  },

  // Initialize tile caching with fallback strategies
  initTileCaching: () => {
    // Open the tile cache
    if ('caches' in window) {
      caches.open('agrimarket-tiles-v2').catch(err => {
        console.warn('Cache API not available:', err);
      });
    }

    // Avoid mutating third-party tile URLs (e.g. OpenStreetMap).
    // Some providers may return 425/429 when query params are forced.
    if (window.L) {
      window.L.TileLayer.prototype.getTileUrl = (function(original) {
        return function(coords) {
          const url = original.call(this, coords);
          try {
            const parsedUrl = new URL(url, window.location.origin);
            const isOpenStreetMap = /(^|\.)tile\.openstreetmap\.org$/i.test(parsedUrl.hostname);
            if (isOpenStreetMap) {
              return url;
            }
          } catch (error) {
            return url;
          }

          return url;
        };
      })(window.L.TileLayer.prototype.getTileUrl);
    }
  },

  // Clear old caches
  clearOldCaches: async () => {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      const currentCache = 'agrimarket-tiles-v2';
      await Promise.all(
        cacheNames
          .filter(name => name !== currentCache && name.includes('agrimarket'))
          .map(name => caches.delete(name))
      );
    }
  }
};

// Auto-initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    TileCacheManager.registerServiceWorker();
    TileCacheManager.initTileCaching();
    TileCacheManager.clearOldCaches();
  });
} else {
  TileCacheManager.registerServiceWorker();
  TileCacheManager.initTileCaching();
  TileCacheManager.clearOldCaches();
}

// assets/js/utils/lazy-loader.js
// Image Lazy Loading Utility - Improves performance by deferring image loads

/**
 * Initialize lazy loading for images
 * Uses IntersectionObserver API for better performance
 * Only handles images with data-src attribute (manual lazy loading)
 * Images with native loading="lazy" are handled by the browser
 */
export const initLazyLoading = () => {
  // Check if IntersectionObserver is supported
  if (!('IntersectionObserver' in window)) {
    // Fallback: load all images immediately
    loadAllImages();
    return;
  }

  const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        loadImage(img);
        observer.unobserve(img);
      }
    });
  }, {
    // Load images slightly before they enter viewport
    rootMargin: '50px 0px',
    threshold: 0.01
  });

  // Observe only images with data-src (manual lazy loading)
  // Native loading="lazy" is handled by browser
  const lazyImages = document.querySelectorAll('img[data-src]');
  lazyImages.forEach(img => imageObserver.observe(img));
  
  // Also observe dynamically added images
  observeDynamicImages(imageObserver);
};

/**
 * Load a single image
 */
const loadImage = (img) => {
  const src = img.dataset.src || img.src;
  
  if (!src) return;

  // Create new image to preload
  const tempImage = new Image();
  
  tempImage.onload = () => {
    img.src = src;
    img.classList.add('loaded');
    img.removeAttribute('data-src');
  };

  tempImage.onerror = () => {
    console.warn('Failed to load image:', src);
    img.classList.add('error');
  };

  tempImage.src = src;
};

/**
 * Fallback: load all images immediately
 */
const loadAllImages = () => {
  const lazyImages = document.querySelectorAll('img[data-src]');
  lazyImages.forEach(img => {
    if (img.dataset.src) {
      img.src = img.dataset.src;
      img.removeAttribute('data-src');
    }
  });
};

/**
 * Preload critical images
 * Call this for above-the-fold images that should load immediately
 */
export const preloadImage = (src) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

/**
 * Batch preload multiple images
 */
export const preloadImages = (srcArray) => {
  return Promise.all(srcArray.map(src => preloadImage(src)));
};

/**
 * Observe dynamically added images with MutationObserver
 */
const observeDynamicImages = (imageObserver) => {
  if (!('MutationObserver' in window)) return;
  
  const mutationObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        // Check if the added node is an image with data-src
        if (node.tagName === 'IMG' && node.dataset.src) {
          imageObserver.observe(node);
        }
        // Check for images in added subtrees
        if (node.querySelectorAll) {
          const images = node.querySelectorAll('img[data-src]');
          images.forEach(img => imageObserver.observe(img));
        }
      });
    });
  });
  
  // Start observing
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
};

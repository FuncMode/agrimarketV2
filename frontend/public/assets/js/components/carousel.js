// assets/js/components/carousel.js
// Product Image Carousel Component

// Initialize global carousel state
window.carouselState = window.carouselState || {};

export const createCarousel = (photos = [], alt = 'Product', options = {}) => {
  const {
    height = '400px',
    objectFit = 'cover',
    showIndicators = true,
    showArrows = true,
    autoPlay = true,
    autoPlayInterval = 5000
  } = options;

  // Handle empty photos array
  if (!photos || photos.length === 0) {
    return `
      <div class="carousel-container relative w-full bg-gray-200 flex items-center justify-center" style="height: ${height};">
        <div class="text-center text-gray-500">
          <i class="bi bi-image text-3xl mb-2"></i>
          <p class="text-sm">No images available</p>
        </div>
      </div>
    `;
  }

  // Filter valid photos
  const validPhotos = photos.filter(photo => photo && typeof photo === 'string');
  
  if (validPhotos.length === 0) {
    return `
      <div class="carousel-container relative w-full bg-gray-200 flex items-center justify-center" style="height: ${height};">
        <div class="text-center text-gray-500">
          <i class="bi bi-image text-3xl mb-2"></i>
          <p class="text-sm">No valid images</p>
        </div>
      </div>
    `;
  }

  const carouselId = `carousel-${Math.random().toString(36).substr(2, 9)}`;
  const isSingleImage = validPhotos.length === 1;

  // Initialize state IMMEDIATELY
  window.carouselState[carouselId] = {
    current: 0,
    total: validPhotos.length,
    autoPlayInterval: autoPlayInterval,
    autoPlayTimer: null,
    isTransitioning: false
  };

  return `
    <div class="carousel-wrapper relative w-full" style="height: ${height};">
      <div class="carousel-container relative w-full h-full overflow-hidden rounded-lg">
        <!-- Main carousel -->
        <div class="carousel-slides relative w-full h-full" id="${carouselId}-slides">
          ${validPhotos.map((photo, index) => `
            <div class="carousel-slide absolute w-full h-full transition-opacity duration-500 ease-in-out" 
                 style="opacity: ${index === 0 ? '1' : '0'}; z-index: ${index === 0 ? '10' : '0'};"
                 data-slide="${index}">
              <img src="${photo}" 
                   alt="${alt} ${index + 1}" 
                   class="w-full h-full object-${objectFit}"
                   loading="lazy">
            </div>
          `).join('')}
        </div>

        <!-- Navigation Arrows (only show if more than 1 image) -->
        ${!isSingleImage && showArrows ? `
          <button class="carousel-prev absolute left-2 top-1/2 transform -translate-y-1/2 z-20 bg-white/70 hover:bg-white rounded-full p-2 transition"
                  onclick="window.carouselPrev('${carouselId}')" title="Previous image">
            <i class="bi bi-chevron-left text-gray-800"></i>
          </button>
          <button class="carousel-next absolute right-2 top-1/2 transform -translate-y-1/2 z-20 bg-white/70 hover:bg-white rounded-full p-2 transition"
                  onclick="window.carouselNext('${carouselId}')" title="Next image">
            <i class="bi bi-chevron-right text-gray-800"></i>
          </button>
        ` : ''}

        <!-- Indicators (only show if more than 1 image) -->
        ${!isSingleImage && showIndicators ? `
          <div class="carousel-indicators absolute bottom-3 left-1/2 transform -translate-x-1/2 z-20 flex gap-2">
            ${validPhotos.map((_, index) => `
              <button class="indicator w-2 h-2 rounded-full transition ${index === 0 ? 'bg-white' : 'bg-white/50'}"
                      onclick="window.carouselGoTo('${carouselId}', ${index})"
                      data-index="${index}"
                      title="Go to image ${index + 1}"></button>
            `).join('')}
          </div>
        ` : ''}

        <!-- Image counter (optional, only for multiple images) -->
        ${!isSingleImage ? `
          <div class="carousel-counter absolute top-3 right-3 z-20 bg-black/50 text-white px-2 py-1 rounded text-xs font-semibold">
            <span class="current-index">1</span>/<span class="total-count">${validPhotos.length}</span>
          </div>
        ` : ''}
      </div>
    </div>
  `;
};

window.carouselGoTo = function(carouselId, index) {
  if (!window.carouselState || !window.carouselState[carouselId]) return;
  
  const state = window.carouselState[carouselId];
  if (state.isTransitioning) return;
  
  state.isTransitioning = true;
  
  const slidesContainer = document.getElementById(`${carouselId}-slides`);
  if (!slidesContainer) return;
  
  const slides = slidesContainer.querySelectorAll('.carousel-slide');
  const parentEl = slidesContainer.parentElement;
  const indicators = parentEl ? parentEl.querySelectorAll('.indicator') : [];
  
  // Update slides visibility
  slides.forEach((slide, i) => {
    slide.style.opacity = i === index ? '1' : '0';
    slide.style.zIndex = i === index ? '10' : '0';
  });

  // Update indicators
  indicators.forEach((indicator, i) => {
    indicator.className = `indicator w-2 h-2 rounded-full transition ${i === index ? 'bg-white' : 'bg-white/50'}`;
  });

  // Update counter
  const counter = parentEl ? parentEl.querySelector('.current-index') : null;
  if (counter) {
    counter.textContent = index + 1;
  }

  state.current = index;
  
  setTimeout(() => {
    state.isTransitioning = false;
  }, 500);
};


window.carouselNext = function(carouselId) {
  if (!window.carouselState || !window.carouselState[carouselId]) return;
  
  const state = window.carouselState[carouselId];
  const nextIndex = (state.current + 1) % state.total;
  window.carouselGoTo(carouselId, nextIndex);
};


window.carouselPrev = function(carouselId) {
  if (!window.carouselState || !window.carouselState[carouselId]) return;
  
  const state = window.carouselState[carouselId];
  const prevIndex = (state.current - 1 + state.total) % state.total;
  window.carouselGoTo(carouselId, prevIndex);
};


window.startCarouselAutoPlay = function(carouselId) {
  if (!window.carouselState || !window.carouselState[carouselId] || window.carouselState[carouselId].total <= 1) return;
  
  const state = window.carouselState[carouselId];
  state.autoPlayTimer = setInterval(() => {
    window.carouselNext(carouselId);
  }, state.autoPlayInterval);
};


export const createSimpleCarousel = (photos = [], alt = 'Product') => {
  return createCarousel(photos, alt, {
    height: '400px',
    showIndicators: true,
    showArrows: true,
    autoPlay: true
  });
};

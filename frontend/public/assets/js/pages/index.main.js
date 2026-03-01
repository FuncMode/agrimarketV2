// assets/js/pages/index.main.js
import '../config/tile-cache.js';
// Main JavaScript for Landing/Guest Browsing Page

import { renderNavbar, updateCartCount, updateOrdersCount } from '../components/navbar.js';
import { showToast, showError } from '../components/toast.js';
import { showSpinner, hideSpinner } from '../components/loading-spinner.js';
import { createModal } from '../components/modal.js';
import { createCarousel } from '../components/carousel.js';
import { listProducts, incrementViewCount } from '../services/product.service.js';
import { getSellers } from '../services/user.service.js';
import { formatCurrency } from '../utils/formatters.js';
import { RIZAL_MUNICIPALITIES, MUNICIPALITY_COORDINATES, PRODUCT_TAGS } from '../utils/constants.js';
import { debounce } from '../utils/helpers.js';
import { isAuthenticated, isBuyer, isSeller } from '../core/auth.js';

// ============ State ============

let currentFilters = {
  search: '',
  category: '',
  municipality: '',
  seller_id: '',
  sort_by: 'created_at',
  sort_order: 'desc',
  page: 1,
  limit: 12
};

let products = [];
let sellers = [];
let map = null;
let showingAllProducts = false; // Track if showing all products
let markersLayer = null;
let heroStats = {
  verifiedSellers: 0,
  freshProducts: 0
};
let mobileMapExpanded = false;
let lastKnownCartCount = 0;
let desktopViewMode = 'grid';
let isProductDetailsModalOpen = false;

// ============ Product Reviews ============

async function viewProductReviews(productId, productName) {
  try {
    showSpinner(null, 'md', 'primary', 'Loading reviews...');
    
    const response = await fetch(`/api/products/${productId}/reviews?page=1&limit=20`);
    const result = await response.json();
    
    hideSpinner();
    
    if (!result.success) {
      showError(result.error || 'Failed to load reviews');
      return;
    }
    
    const reviews = result.data.reviews || [];
    
    if (reviews.length === 0) {
      showToast('No reviews yet for this product', 'info');
      return;
    }
    
    const modalContent = `
      <div class="space-y-4">
        <div class="border-b pb-3">
          <h4 class="font-semibold text-lg">${productName}</h4>
          <p class="text-sm text-gray-600">${reviews.length} ${reviews.length === 1 ? 'review' : 'reviews'}</p>
        </div>
        
        <div class="space-y-4 max-h-96 overflow-y-auto">
          ${reviews.map(review => `
            <div class="border-b pb-3 last:border-b-0">
              <div class="flex items-start justify-between mb-2">
                <div>
                  <p class="font-semibold text-sm">${review.buyer_name || 'Anonymous'}</p>
                  <p class="text-xs text-gray-500">${new Date(review.created_at).toLocaleDateString('en-US', { 
                    month: 'long', 
                    day: 'numeric', 
                    year: 'numeric' 
                  })}</p>
                </div>
                <div class="flex gap-1 text-warning">
                  ${[1,2,3,4,5].map(star => 
                    `<i class="bi bi-star${star <= review.rating ? '-fill' : ''}"></i>`
                  ).join('')}
                </div>
              </div>
              ${review.comment ? `
                <p class="text-sm text-gray-700 mt-2">${review.comment}</p>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
    
    createModal({
      title: 'Product Reviews',
      content: modalContent,
      size: 'lg',
      footer: '<button class="btn btn-secondary" data-modal-close>Close</button>'
    });
    
  } catch (error) {
    hideSpinner();
    console.error('Error loading reviews:', error);
    showError('Failed to load reviews. Please try again.');
  }
}

// Make it globally accessible
window.viewProductReviews = viewProductReviews;

// ============ Initialization ============

const init = async () => {

  
  // Render navbar
  renderNavbar();
  
  // Update cart count for buyers
  if (isAuthenticated() && isBuyer()) {
    try {
      const { getCartCount } = await import('../services/cart.service.js');
      const response = await getCartCount();
      if (response.success) {
        updateCartCount(response.data.count);
        updateMobileCartBar(response.data.count);
      }
    } catch (error) {
      console.error('Error updating cart count:', error);
    }
  }
  
  // Update orders badge for sellers
  if (isAuthenticated() && isSeller()) {
    try {
      const { getOrders } = await import('../services/order.service.js');
      const response = await getOrders();
      const orders = response.data?.orders || [];
      const pendingCount = orders.filter(o => o.status === 'pending').length;
      updateOrdersCount(pendingCount);
    } catch (error) {
      console.error('Error updating orders count:', error);
    }
  }
  
  // Populate municipality filter
  populateMunicipalityFilter();
  
  // Load initial data - load products and sellers in parallel
  await Promise.all([
    loadProducts(),
    loadSellers()
  ]);
  
  // Load fresh products count separately (doesn't need to block)
  loadFreshProductsCount();
  
  // Initialize map
  initMap();
  
  // Attach event listeners
  attachEventListeners();
  initMobileFilterSheet();
  initMobileMapToggle();
  initDesktopViewTabs();
  syncFilterControls();
  updateMobileFilterCount();
  refreshMobileCartBar();

  // Check if we should show signup modal (from become-seller page redirect)
  // This runs at the very end after everything is loaded
  const showSignupOnLoad = localStorage.getItem('showSignupModalOnLoad');
  if (showSignupOnLoad) {
    localStorage.removeItem('showSignupModalOnLoad');
    try {
      const { showSignupModal } = await import('../features/auth/signup.js');
      showSignupModal();
    } catch (error) {
      console.error('Error loading signup modal:', error);
    }
  }

  // Check if coming from 404 page with hash indicating which modal to show
  const hash = window.location.hash.slice(1); // Remove the '#' character
  if (hash === 'login') {
    try {
      const { showLoginModal: showAuthLoginModal } = await import('../features/auth/login.js');
      showAuthLoginModal();
      // Clear the hash after showing modal
      window.history.replaceState(null, null, '/index.html');
    } catch (error) {
      console.error('Error loading login modal:', error);
    }
  } else if (hash === 'signup') {
    try {
      const { showSignupModal } = await import('../features/auth/signup.js');
      showSignupModal();
      // Clear the hash after showing modal
      window.history.replaceState(null, null, '/index.html');
    } catch (error) {
      console.error('Error loading signup modal:', error);
    }
  }
  

};

// ============ Data Loading ============

const loadProducts = async () => {
  const container = document.getElementById('featured-products');
  const viewAllContainer = document.getElementById('view-all-container');
  if (!container) return;
  
  renderProductSkeletons(window.innerWidth >= 1280 ? 8 : 4);
  
  try {
    const response = await listProducts(currentFilters);
    products = response.data?.products || [];
    
    if (products.length === 0) {
      container.innerHTML = `
        <div class="text-center py-12 col-span-full">
          <i class="bi bi-inbox text-6xl text-gray-400"></i>
          <p class="text-gray-500 mt-4">No products found</p>
        </div>
      `;
      // Hide view all button when no products
      if (viewAllContainer) viewAllContainer.style.display = 'none';
    } else {
      renderProducts();
      setupViewAllButton();
    }
  } catch (error) {
    console.error('Error loading products:', error);
    container.innerHTML = `
      <div class="text-center py-12 col-span-full">
        <i class="bi bi-exclamation-circle text-6xl text-danger"></i>
        <p class="text-danger mt-4">Failed to load products</p>
        <button class="btn btn-primary mt-4" onclick="location.reload()">Retry</button>
      </div>
    `;
    // Hide view all button on error
    if (viewAllContainer) viewAllContainer.style.display = 'none';
  }
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatStatCount = (value) => {
  return `${toNumber(value)}+`;
};

const updateHeroStats = () => {
  const sellersEl = document.getElementById('stats-sellers');
  const productsEl = document.getElementById('stats-products');
  const footerSellersEl = document.getElementById('footer-verified-count');

  if (sellersEl) {
    sellersEl.textContent = formatStatCount(heroStats.verifiedSellers);
  }

  if (productsEl) {
    productsEl.textContent = formatStatCount(heroStats.freshProducts);
  }

  if (footerSellersEl) {
    footerSellersEl.textContent = String(toNumber(heroStats.verifiedSellers));
  }
};

const renderProductSkeletons = (count = 8) => {
  const container = document.getElementById('featured-products');
  if (!container) return;

  const skeletonCards = Array.from({ length: count }).map(() => `
    <div class="home-product-skeleton">
      <div class="home-skeleton shimmer home-skeleton-image"></div>
      <div class="home-skeleton-body">
        <div class="home-skeleton shimmer home-skeleton-title"></div>
        <div class="home-skeleton shimmer home-skeleton-line"></div>
        <div class="home-skeleton shimmer home-skeleton-price"></div>
        <div class="home-skeleton shimmer home-skeleton-actions"></div>
      </div>
    </div>
  `).join('');

  container.innerHTML = skeletonCards;
};

const renderProducts = () => {
  const container = document.getElementById('featured-products');
  const displayProducts = showingAllProducts ? products : products.slice(0, 5);
  container.innerHTML = displayProducts.map(product => createProductCard(product)).join('');
};

const setupViewAllButton = () => {
  const viewAllContainer = document.getElementById('view-all-container');
  const viewAllBtn = document.getElementById('btn-view-all');
  
  if (!viewAllContainer || !viewAllBtn) return;
  
  // Show "View All" button only if there are more than 5 products
  if (products.length > 5) {
    viewAllContainer.style.display = 'block';
    
    // Update button text based on current state
    updateViewAllButton();
    
    // Add click event listener
    viewAllBtn.onclick = toggleViewAll;
  } else {
    viewAllContainer.style.display = 'none';
  }
};

const updateViewAllButton = () => {
  const viewAllBtn = document.getElementById('btn-view-all');
  if (!viewAllBtn) return;
  
  if (showingAllProducts) {
    viewAllBtn.innerHTML = `<i class="bi bi-chevron-up"></i> Show Less`;
    viewAllBtn.title = 'Show only featured products';
  } else {
    viewAllBtn.innerHTML = `<i class="bi bi-grid-3x3-gap"></i> View All Products (${products.length})`;
    viewAllBtn.title = 'View all available products';
  }
};

const toggleViewAll = () => {
  showingAllProducts = !showingAllProducts;
  renderProducts();
  updateViewAllButton();
  
  // Smooth scroll to products section if expanding
  if (showingAllProducts) {
    document.getElementById('featured-products')?.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'start' 
    });
  }
};

const loadSellers = async () => {
  try {
    const response = await getSellers();
    sellers = response.data?.sellers || [];
    heroStats.verifiedSellers = response.total !== undefined
      ? toNumber(response.total)
      : sellers.length;
  } catch (error) {
    console.error('Error loading sellers:', error);
    sellers = [];
    heroStats.verifiedSellers = 0;
  }

  updateHeroStats();
};

const loadFreshProductsCount = async () => {
  try {
    // Fetch with high limit to get accurate count of ALL fresh products
    // Backend has max limit of 100, so we'll fetch in batches if needed
    const response = await listProducts({
      tags: PRODUCT_TAGS.FRESH,
      page: 1,
      limit: 100 // Backend max limit is 100
    });

    // The backend returns filtered products, so the length is the actual count
    // Note: If there are more than 100 fresh products, this will undercount
    // But it's a reasonable approximation for the hero stats
    heroStats.freshProducts = response.data?.products?.length || 0;
    updateHeroStats();
  } catch (error) {
    console.error('Error loading fresh products count:', error);
    heroStats.freshProducts = 0;
    updateHeroStats();
  }
};

// ============ Product Card ============

const createProductCard = (product) => {
  const isAuth = isAuthenticated();
  const canBuy = isAuth && isBuyer();
  
  // Prepare photos array
  const photos = product.photos && product.photos.length > 0 
    ? product.photos 
    : (product.photo_path ? [product.photo_path] : []);
  
  // Create carousel HTML
  const carouselHeight = window.innerWidth >= 1280 ? '198px' : '220px';
  const carouselHtml = createCarousel(photos, product.name, {
    height: carouselHeight,
    objectFit: 'cover',
    showIndicators: photos.length > 1,
    showArrows: photos.length > 1,
    autoPlay: false
  });
  
  return `
    <div class="card product-card">
      ${product.tags?.includes('fresh') ? '<div class="product-card-badge">Fresh</div>' : ''}
      
      <div class="pc-media-wrap">
        ${carouselHtml}
      </div>
      
      <div class="card-body">
        <div class="flex items-center justify-between mb-2">
          <h3 class="card-title pc-title mb-0">${product.name}</h3>
          ${product.seller_verified ? '<span class="verified-badge"><i class="bi bi-patch-check-fill"></i> Verified</span>' : ''}
        </div>

        <div class="pc-primary-row flex items-center justify-between mt-3">
          <div>
            <p class="text-xl font-bold text-primary pc-price">${formatCurrency(product.price_per_unit)}</p>
            <p class="text-sm text-gray-500">per ${product.unit_type}</p>
          </div>
          
          <div class="text-right">
            <p class="text-sm text-gray-600 pc-stock-label">Available</p>
            <p class="font-semibold pc-stock-value muted">${product.available_quantity}</p>
          </div>
        </div>

        <details class="pc-secondary mt-3">
          <summary class="pc-secondary-toggle">More details</summary>
          <div class="pc-secondary-content">
            <p class="text-sm text-gray-600 pc-meta mb-2">
              <i class="bi bi-geo-alt"></i> ${product.municipality}
            </p>
            
            <p class="text-sm text-gray-600 pc-meta mb-2">
              <i class="bi bi-tag"></i> ${product.category}
            </p>
            
            ${product.average_rating && product.average_rating > 0 ? `
              <div class="mb-2 pb-2 border-b border-gray-200">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <div class="flex gap-1 text-warning text-sm">
                      ${[1,2,3,4,5].map(star => 
                        `<i class="bi bi-star${star <= Math.round(product.average_rating) ? '-fill' : ''}"></i>`
                      ).join('')}
                    </div>
                    <span class="text-sm font-semibold">${product.average_rating.toFixed(1)}</span>
                    <span class="text-xs text-gray-500">(${product.total_reviews || 0})</span>
                  </div>
                  <button class="btn-sm text-xs text-primary hover:underline" onclick="window.viewProductReviews('${product.id}', '${product.name.replace(/'/g, "\\'")}')">
                    <i class="bi bi-chat-quote"></i> Reviews
                  </button>
                </div>
              </div>
            ` : ''}

            <p class="card-text pc-desc line-clamp-2">
              <i class="bi bi-file-text"></i> ${product.description || 'No description'}
            </p>

            ${product.tags && product.tags.length > 0 ? `
              <div class="product-tags flex gap-2 mt-2 flex-wrap">
                ${product.tags.map(tag => `
                  <span class="badge badge-info pc-tag">
                    <i class="bi bi-tag"></i> ${tag.charAt(0).toUpperCase() + tag.slice(1)}
                  </span>
                `).join('')}
              </div>
            ` : ''}

            <div class="pc-metrics flex gap-4 mt-3 text-xs text-gray-500 border-t border-gray-200 pt-2">
              <div class="flex items-center gap-1">
                <i class="bi bi-eye"></i>
                <span>${product.view_count || 0} views</span>
              </div>
              <div class="flex items-center gap-1">
                <i class="bi bi-cart-check"></i>
                <span>${product.order_count || 0} orders</span>
              </div>
            </div>
          </div>
        </details>
      </div>
      
      <div class="card-footer">
        <div class="flex gap-2">
          <button class="btn btn-outline pc-action-btn flex-1" onclick="window.viewProduct('${product.id}')">
            <i class="bi bi-eye"></i> View
          </button>
          ${canBuy ? `
            <button class="btn btn-primary pc-action-btn flex-1" onclick="window.addToCart('${product.id}')">
              <i class="bi bi-cart-plus"></i> Add Cart
            </button>
          ` : !isAuth ? `
            <button class="btn btn-primary pc-action-btn flex-1" onclick="window.showLoginModal('buyer')">
              <i class="bi bi-cart-plus"></i> Add Cart
            </button>
          ` : ''}
        </div>
      </div>
    </div>
  `;
};

// ============ Map ============

const initMap = () => {
  const mapContainer = document.getElementById('sellers-map');
  if (!mapContainer) {
    console.warn('Map container not found');
    return;
  }
  
  if (typeof L === 'undefined') {
    console.warn('Leaflet library not loaded');
    mapContainer.innerHTML = '<div class="p-4 text-center text-danger">Map library failed to load</div>';
    return;
  }
  
  try {
    // Initialize map centered on Rizal, Philippines
    map = L.map('sellers-map').setView([14.6037, 121.3084], 11);
    
    // Add tile layer with error handling
    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18,
      errorTileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    }).addTo(map);
    
    // Suppress tile loading errors
    tileLayer.on('tileerror', function(error, tile) {
      // Silently handle tile errors
    });
    
    // Create markers layer
    markersLayer = L.layerGroup().addTo(map);
    
    // Add seller markers
    updateMapMarkers();
    

  } catch (error) {
    console.error('Leaflet Map Init - Error initializing map:', error);
    mapContainer.innerHTML = '<div class="p-4 text-center text-danger">Failed to initialize map</div>';
  }
};

let activeSellerMarker = null;

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const getSellerName = (seller) => seller.business_name || seller.full_name || 'Local Seller';

const getSellerProductCount = (seller) => {
  const count = Number(seller.total_products || seller.product_count || 0);
  return Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
};

const buildSellerMetaRows = (seller) => {
  const municipality = escapeHtml(seller.municipality || 'Unknown');
  const farmType = escapeHtml(seller.farm_type || 'Farm');
  return `
    <p class="map-popup-meta"><i class="bi bi-geo-alt"></i> ${municipality}</p>
    <p class="map-popup-meta"><i class="bi bi-shop"></i> ${farmType}</p>
  `;
};

const buildSellerTrustRow = (seller) => {
  const rating = Number(seller.rating || 0);
  const totalOrders = Number(seller.total_orders || 0);
  const totalReviews = Number(seller.total_reviews || seller.review_count || 0);
  const hasRating = Number.isFinite(rating) && rating > 0;
  const hasOrders = Number.isFinite(totalOrders) && totalOrders > 0;
  const hasReviews = Number.isFinite(totalReviews) && totalReviews > 0;
  if (!hasRating && !hasOrders && !hasReviews) return '';

  const ratingText = hasRating ? rating.toFixed(1) : 'No rating yet';
  const trustCountText = hasReviews
    ? `${totalReviews} reviews`
    : (hasOrders ? `${totalOrders} ${totalOrders === 1 ? 'order' : 'orders'}` : 'No reviews yet');
  return `
    <div class="map-popup-trust">
      <i class="bi bi-star-fill"></i> ${ratingText} • ${trustCountText}
    </div>
  `;
};

const buildSellerActivityRow = (seller) => {
  const lastActive = seller.last_active || seller.last_seen_at || '';
  const verifiedAt = seller.verified_at || '';

  if (lastActive) {
    return `<p class="map-popup-activity"><i class="bi bi-clock-history"></i> Last active: ${escapeHtml(lastActive)}</p>`;
  }

  if (verifiedAt) {
    return `<p class="map-popup-activity"><i class="bi bi-shield-check"></i> Verified since ${escapeHtml(verifiedAt)}</p>`;
  }

  return '';
};

const buildSellerStatusChip = (seller) => {
  const hasProducts = getSellerProductCount(seller) > 0;
  return hasProducts
    ? '<span class="map-status-chip map-status-chip--active"><i class="bi bi-circle-fill"></i> Active listings</span>'
    : '<span class="map-status-chip map-status-chip--muted"><i class="bi bi-pause-circle"></i> No active listings</span>';
};

const buildViewProductsButton = (seller) => {
  const count = getSellerProductCount(seller);
  const sellerId = escapeHtml(seller.id);
  if (count <= 0) {
    return `
      <div class="map-popup-empty">
        <i class="bi bi-inbox"></i> No products yet
      </div>
    `;
  }

  return `
    <button
      type="button"
      class="btn btn-primary map-popup-cta"
      onclick="window.viewSeller(event, '${sellerId}', ${count})"
      aria-label="View ${count} products from ${escapeHtml(getSellerName(seller))}">
      View ${count} Product${count > 1 ? 's' : ''}
    </button>
  `;
};

const buildSingleSellerPopupContent = (seller) => `
  <article class="map-popup-card">
    <div class="map-popup-body">
      <h4 class="map-popup-title">${escapeHtml(getSellerName(seller))}</h4>
      <div class="map-popup-badges">
        ${seller.verified ? '<span class="map-verified-badge"><i class="bi bi-patch-check-fill"></i> Verified</span>' : ''}
        ${buildSellerStatusChip(seller)}
      </div>
      <div class="map-popup-meta-wrap">
        ${buildSellerMetaRows(seller)}
      </div>
      ${buildSellerTrustRow(seller)}
      ${buildSellerActivityRow(seller)}
      <p class="map-popup-count"><i class="bi bi-basket2"></i> ${getSellerProductCount(seller)} products available</p>
    </div>
    <div class="map-popup-actions">
      ${buildViewProductsButton(seller)}
    </div>
  </article>
`;

const buildGroupedSellersPopupContent = (groupSellers, municipalityName) => {
  const sellersHtml = groupSellers.map((seller) => `
    <article class="map-popup-group-item">
      <h5 class="map-popup-title map-popup-title--sm">${escapeHtml(getSellerName(seller))}</h5>
      <div class="map-popup-badges map-popup-badges--tight">
        ${seller.verified ? '<span class="map-verified-badge"><i class="bi bi-patch-check-fill"></i> Verified</span>' : ''}
        ${buildSellerStatusChip(seller)}
      </div>
      <div class="map-popup-meta-wrap map-popup-meta-wrap--tight">
        ${buildSellerMetaRows(seller)}
      </div>
      ${buildSellerTrustRow(seller)}
      ${buildSellerActivityRow(seller)}
      <p class="map-popup-count map-popup-count--tight"><i class="bi bi-basket2"></i> ${getSellerProductCount(seller)} products available</p>
      ${buildViewProductsButton(seller)}
    </article>
  `).join('');

  return `
    <section class="map-popup-group">
      <h4 class="map-popup-group-title">
        <i class="bi bi-geo-alt"></i> ${escapeHtml(municipalityName)} (${groupSellers.length} sellers)
      </h4>
      <div class="map-popup-group-list">
        ${sellersHtml}
      </div>
    </section>
  `;
};

const createSingleSellerIcon = (seller) => {
  const hasProducts = getSellerProductCount(seller) > 0;
  const markerStateClass = hasProducts ? 'seller-marker--active' : 'seller-marker--inactive';
  return L.divIcon({
    className: 'seller-marker',
    html: `
      <div class="seller-marker-pin ${markerStateClass}">
        <span class="seller-marker-core"></span>
      </div>
    `,
    iconSize: [34, 44],
    iconAnchor: [17, 42]
  });
};

const setMarkerSelected = (marker) => {
  if (activeSellerMarker && activeSellerMarker.getElement()) {
    activeSellerMarker.getElement().classList.remove('is-selected');
  }
  activeSellerMarker = marker;
  if (marker && marker.getElement()) {
    marker.getElement().classList.add('is-selected');
  }
};

const attachMarkerAccessibility = (marker, label) => {
  marker.on('add', () => {
    const markerEl = marker.getElement();
    if (!markerEl) return;
    markerEl.setAttribute('tabindex', '0');
    markerEl.setAttribute('role', 'button');
    markerEl.setAttribute('aria-label', label);
    markerEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        marker.openPopup();
      }
    });
  });
};

const bindMarkerInteractions = (marker, popupContent, previewHtml) => {
  marker.bindPopup(popupContent, {
    minWidth: 280,
    maxWidth: 320,
    className: 'seller-popup',
    keepInView: true,
    autoPan: true,
    autoPanPadding: [28, 28]
  });

  if (window.innerWidth >= 1024 && previewHtml) {
    marker.bindTooltip(previewHtml, {
      direction: 'top',
      className: 'seller-preview-tooltip',
      offset: [0, -20],
      opacity: 1,
      sticky: false
    });
  }

  marker.on('click', function() {
    this.openPopup();
  });

  marker.on('popupopen', (event) => {
    setMarkerSelected(marker);
    const closeBtn = event.popup?._container?.querySelector('.leaflet-popup-close-button');
    if (closeBtn) closeBtn.setAttribute('aria-label', 'Close seller details');
    if (window.innerWidth < 1024 && map) {
      setTimeout(() => map.panTo(event.popup.getLatLng(), { animate: true, duration: 0.25 }), 80);
    }
  });

  marker.on('popupclose', () => {
    if (marker.getElement()) {
      marker.getElement().classList.remove('is-selected');
    }
    if (activeSellerMarker === marker) {
      activeSellerMarker = null;
    }
  });
};

const renderMapMarkers = (municipality = '') => {
  if (!map || !markersLayer) {
    console.warn('Map or markers layer not initialized');
    return;
  }

  markersLayer.clearLayers();
  const locationGroups = {};

  sellers.forEach((seller) => {
    if (municipality && seller.municipality !== municipality) return;

    let finalLat;
    let finalLng;
    const parsedLat = Number(seller.latitude);
    const parsedLng = Number(seller.longitude);

    if (Number.isFinite(parsedLat) && Number.isFinite(parsedLng)) {
      finalLat = parsedLat;
      finalLng = parsedLng;
    } else if (seller.municipality && MUNICIPALITY_COORDINATES[seller.municipality]) {
      const munCoords = MUNICIPALITY_COORDINATES[seller.municipality];
      finalLat = munCoords.latitude;
      finalLng = munCoords.longitude;
    } else {
      return;
    }

    const locationKey = `${finalLat.toFixed(6)},${finalLng.toFixed(6)}`;
    if (!locationGroups[locationKey]) {
      locationGroups[locationKey] = { lat: finalLat, lng: finalLng, sellers: [] };
    }
    locationGroups[locationKey].sellers.push(seller);
  });

  Object.values(locationGroups).forEach((group) => {
    const { lat, lng, sellers: groupSellers } = group;
    let marker;
    let popupContent;
    let markerLabel;
    let previewHtml = '';

    if (groupSellers.length === 1) {
      const seller = groupSellers[0];
      const sellerName = escapeHtml(getSellerName(seller));
      const productCount = getSellerProductCount(seller);
      marker = L.marker([lat, lng], {
        title: getSellerName(seller),
        icon: createSingleSellerIcon(seller)
      });
      popupContent = buildSingleSellerPopupContent(seller);
      markerLabel = `${sellerName}, ${productCount} products`;
      previewHtml = `<div class="seller-preview-card"><strong>${sellerName}</strong><span>${productCount} products</span></div>`;
    } else {
      const municipalityName = groupSellers[0]?.municipality || 'Unknown';
      const clusterIcon = L.divIcon({
        className: 'cluster-marker',
        html: `<div class="cluster-marker-inner">${groupSellers.length}</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });
      marker = L.marker([lat, lng], { icon: clusterIcon, title: `${groupSellers.length} sellers` });
      popupContent = buildGroupedSellersPopupContent(groupSellers, municipalityName);
      markerLabel = `${groupSellers.length} sellers in ${municipalityName}`;
      previewHtml = `<div class="seller-preview-card"><strong>${escapeHtml(municipalityName)}</strong><span>${groupSellers.length} sellers</span></div>`;
    }

    bindMarkerInteractions(marker, popupContent, previewHtml);
    attachMarkerAccessibility(marker, markerLabel);
    markersLayer.addLayer(marker);
  });
};

const updateMapMarkers = () => renderMapMarkers();

// Filters
const filterMapByMunicipality = (municipality) => renderMapMarkers(municipality);

// ============ Filters ============

const populateMunicipalityFilter = () => {
  const selectors = ['filter-municipality', 'filter-municipality-mobile'];
  const options = '<option value="">All Municipalities</option>' +
    RIZAL_MUNICIPALITIES.map(m => `<option value="${m}">${m}</option>`).join('');
  
  selectors.forEach(id => {
    const select = document.getElementById(id);
    if (select) {
      select.innerHTML = options;
    }
  });
};

const applyFilters = async () => {
  currentFilters.page = 1; // Reset to first page
  await loadProducts();
  
  // Update map filters if municipality filter is active
  if (currentFilters.municipality) {
    filterMapByMunicipality(currentFilters.municipality);
  } else {
    updateMapMarkers();
  }
};

const syncFilterControls = () => {
  const mappings = [
    ['filter-category', 'filter-category-mobile', currentFilters.category],
    ['filter-municipality', 'filter-municipality-mobile', currentFilters.municipality],
    ['sort-by', 'sort-by-mobile', `${currentFilters.sort_by}:${currentFilters.sort_order}`]
  ];

  mappings.forEach(([desktopId, mobileId, value]) => {
    const desktop = document.getElementById(desktopId);
    const mobile = document.getElementById(mobileId);
    if (desktop) desktop.value = value;
    if (mobile) mobile.value = value;
  });
};

const updateMobileFilterCount = () => {
  const badge = document.getElementById('mobile-filter-count');
  if (!badge) return;

  const activeCount = [currentFilters.category, currentFilters.municipality]
    .filter(Boolean).length;

  badge.textContent = String(activeCount);
  badge.classList.toggle('hidden', activeCount === 0);
};

const setMobileFilterSheetOpen = (isOpen) => {
  const sheet = document.getElementById('mobile-filters-sheet');
  if (!sheet) return;
  sheet.classList.toggle('hidden', !isOpen);
  sheet.setAttribute('aria-hidden', String(!isOpen));
  document.body.classList.toggle('home-sheet-open', isOpen);
};

const initMobileFilterSheet = () => {
  const btnOpen = document.getElementById('btn-mobile-filters');
  const btnClose = document.getElementById('btn-close-mobile-filters');
  const backdrop = document.getElementById('mobile-filters-backdrop');
  const btnApply = document.getElementById('btn-apply-mobile-filters');
  const btnReset = document.getElementById('btn-reset-mobile-filters');

  if (btnOpen) btnOpen.addEventListener('click', () => setMobileFilterSheetOpen(true));
  if (btnClose) btnClose.addEventListener('click', () => setMobileFilterSheetOpen(false));
  if (backdrop) backdrop.addEventListener('click', () => setMobileFilterSheetOpen(false));

  if (btnApply) {
    btnApply.addEventListener('click', async () => {
      currentFilters.category = document.getElementById('filter-category-mobile')?.value || '';
      currentFilters.municipality = document.getElementById('filter-municipality-mobile')?.value || '';
      currentFilters.seller_id = '';
      const mobileSort = document.getElementById('sort-by-mobile')?.value || 'created_at:desc';
      const [sortField, sortOrder] = mobileSort.split(':');
      currentFilters.sort_by = sortField;
      currentFilters.sort_order = sortOrder || 'desc';
      syncFilterControls();
      updateMobileFilterCount();
      setMobileFilterSheetOpen(false);
      await applyFilters();
    });
  }

  if (btnReset) {
    btnReset.addEventListener('click', async () => {
      currentFilters.category = '';
      currentFilters.municipality = '';
      currentFilters.seller_id = '';
      currentFilters.sort_by = 'created_at';
      currentFilters.sort_order = 'desc';
      syncFilterControls();
      updateMobileFilterCount();
      setMobileFilterSheetOpen(false);
      await applyFilters();
    });
  }
};

const setMobileMapExpanded = (expanded) => {
  const mapShell = document.querySelector('.home-map-shell');
  const btn = document.getElementById('btn-view-full-map');
  if (!mapShell || !btn) return;

  mobileMapExpanded = expanded;
  mapShell.classList.toggle('home-map-expanded', expanded);
  btn.innerHTML = expanded ? 'Close Full Map' : 'View Full Map';
  setTimeout(() => {
    if (map) {
      map.invalidateSize();
    }
  }, 240);
};

const initMobileMapToggle = () => {
  const btn = document.getElementById('btn-view-full-map');
  if (!btn) return;

  btn.addEventListener('click', () => setMobileMapExpanded(!mobileMapExpanded));
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 768 && mobileMapExpanded) {
      setMobileMapExpanded(false);
    }
  });
};

const setDesktopViewMode = (mode) => {
  desktopViewMode = mode;

  const gridSection = document.getElementById('home-grid-section');
  const mapSection = document.getElementById('home-map-section');
  const gridBtn = document.getElementById('btn-view-grid-desktop');
  const mapBtn = document.getElementById('btn-view-map-desktop');
  const isDesktop = window.innerWidth >= 1024;

  if (!gridSection || !mapSection || !gridBtn || !mapBtn || !isDesktop) return;

  const showGrid = mode !== 'map';
  gridSection.classList.toggle('hidden', !showGrid);
  mapSection.classList.toggle('hidden', showGrid);

  gridBtn.classList.toggle('active', showGrid);
  mapBtn.classList.toggle('active', !showGrid);
  gridBtn.setAttribute('aria-selected', String(showGrid));
  mapBtn.setAttribute('aria-selected', String(!showGrid));

  if (!showGrid) {
    setTimeout(() => {
      if (map) {
        map.invalidateSize();
      }
      mapSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 140);
  }
};

const initDesktopViewTabs = () => {
  const gridBtn = document.getElementById('btn-view-grid-desktop');
  const mapBtn = document.getElementById('btn-view-map-desktop');
  if (!gridBtn || !mapBtn) return;

  gridBtn.addEventListener('click', () => setDesktopViewMode('grid'));
  mapBtn.addEventListener('click', () => setDesktopViewMode('map'));

  setDesktopViewMode('grid');
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024) {
      setDesktopViewMode(desktopViewMode);
    } else {
      const gridSection = document.getElementById('home-grid-section');
      const mapSection = document.getElementById('home-map-section');
      if (gridSection) gridSection.classList.remove('hidden');
      if (mapSection) mapSection.classList.remove('hidden');
    }
  });
};

const updateMobileCartBar = (count) => {
  const bar = document.getElementById('mobile-cart-bar');
  const countEl = document.getElementById('mobile-cart-bar-count');
  if (!bar || !countEl) return;

  const safeCount = Number.isFinite(Number(count)) ? Number(count) : 0;
  lastKnownCartCount = safeCount;
  countEl.textContent = `${safeCount} ${safeCount === 1 ? 'item' : 'items'}`;
  const shouldShow = isAuthenticated() && isBuyer() && safeCount > 0 && !isProductDetailsModalOpen;
  bar.classList.toggle('hidden', !shouldShow);
  bar.setAttribute('aria-hidden', String(!shouldShow));
};

const refreshMobileCartBar = async () => {
  if (!(isAuthenticated() && isBuyer())) {
    updateMobileCartBar(0);
    return;
  }

  try {
    const { getCartCount } = await import('../services/cart.service.js');
    const response = await getCartCount();
    updateMobileCartBar(response.data?.count || 0);
  } catch (error) {
    updateMobileCartBar(lastKnownCartCount);
  }
};

// ============ Event Listeners ============

const attachEventListeners = () => {
  // Search inputs (both mobile and desktop)
  const searchSelectors = ['search-input', 'search-input-mobile'];
  searchSelectors.forEach(id => {
    const searchInput = document.getElementById(id);
    if (searchInput) {
      searchInput.addEventListener('input', debounce((e) => {
        currentFilters.search = e.target.value;
        currentFilters.seller_id = '';
        
        // Sync both search inputs
        searchSelectors.forEach(syncId => {
          const syncInput = document.getElementById(syncId);
          if (syncInput && syncInput !== e.target) {
            syncInput.value = e.target.value;
          }
        });
        
        applyFilters();
      }, 500));
    }
  });
  
  const categoryFilter = document.getElementById('filter-category');
  if (categoryFilter) {
    categoryFilter.addEventListener('change', (e) => {
      currentFilters.category = e.target.value;
      currentFilters.seller_id = '';
      currentFilters.page = 1;
      syncFilterControls();
      updateMobileFilterCount();
      applyFilters();
    });
  }

  const municipalityFilter = document.getElementById('filter-municipality');
  if (municipalityFilter) {
    municipalityFilter.addEventListener('change', (e) => {
      currentFilters.municipality = e.target.value;
      currentFilters.seller_id = '';
      currentFilters.page = 1;
      syncFilterControls();
      updateMobileFilterCount();
      applyFilters();
    });
  }

  const sortBy = document.getElementById('sort-by');
  if (sortBy) {
    sortBy.addEventListener('change', (e) => {
      const [field, order] = e.target.value.split(':');
      currentFilters.seller_id = '';
      currentFilters.sort_by = field;
      currentFilters.sort_order = order || 'desc';
      currentFilters.page = 1;
      syncFilterControls();
      applyFilters();
    });
  }
  
  // Hero buttons
  const btnBrowse = document.getElementById('btn-browse-products');
  if (btnBrowse) {
    btnBrowse.addEventListener('click', () => {
      if (window.innerWidth >= 1024) {
        setDesktopViewMode('grid');
      }
      document.getElementById('featured-products')?.scrollIntoView({ behavior: 'smooth' });
    });
  }
  
  const btnViewMap = document.getElementById('btn-view-map');
  if (btnViewMap) {
    btnViewMap.addEventListener('click', () => {
      document.getElementById('sellers-map')?.scrollIntoView({ behavior: 'smooth' });
    });
  }
};

// ============ Global Functions ============

window.viewProduct = (productId) => {
  // Find the product from the products list
  const product = products.find(p => p.id === productId);
  if (!product) {
    showError('Product not found');
    return;
  }
  
  // Only increment view count if user is a buyer
  if (isAuthenticated() && isBuyer()) {
    incrementViewCount(productId);
  }
  
  const isAuth = isAuthenticated();
  const canBuy = isAuth && isBuyer();
  const rawSellerName = product.seller_name || product.seller?.business_name || product.seller?.full_name || '';
  const sellerName = rawSellerName && !/funcmode null/i.test(rawSellerName)
    ? rawSellerName
    : 'Unknown Seller';
  const category = product.category || 'Uncategorized';
  const location = product.municipality || 'Unknown';
  
  // Prepare photos array
  const photos = product.photos && product.photos.length > 0 
    ? product.photos 
    : (product.photo_path ? [product.photo_path] : []);
  
  // Create carousel HTML
  const carouselHtml = createCarousel(photos, product.name, {
    height: '400px',
    objectFit: 'cover',
    showIndicators: photos.length > 1,
    showArrows: photos.length > 1,
    autoPlay: false
  });
  
  const modalContent = `
    <div class="featured-product-details space-y-4">
      ${carouselHtml}
      
      <div class="featured-product-details__content">
        <div class="flex items-start justify-between mb-2 gap-2">
          <h3 class="card-title pc-title mb-0">${product.name}</h3>
          ${product.seller_verified ? '<span class="verified-badge"><i class="bi bi-patch-check-fill"></i> Verified</span>' : ''}
        </div>
        
        <p class="text-sm text-gray-600 pc-meta mb-3">
          <i class="bi bi-shop"></i> ${sellerName}
        </p>
        
        <p class="card-text pc-desc mb-3">
          <i class="bi bi-file-text"></i> ${product.description || 'No description'}
        </p>
        
        <!-- Tags -->
        ${product.tags && product.tags.length > 0 ? `
          <div class="mb-4">
            <p class="text-sm text-gray-600 mb-2">Tags</p>
            <div class="flex gap-2 flex-wrap">
              ${product.tags.map(tag => `
                <span class="badge badge-info pc-tag">
                  <i class="bi bi-tag"></i> ${tag.replace(/_/g, ' ').charAt(0).toUpperCase() + tag.replace(/_/g, ' ').slice(1)}
                </span>
              `).join('')}
            </div>
          </div>
        ` : ''}
        
        <div class="featured-product-details__grid mb-4">
          <div class="featured-product-details__item featured-product-details__item--price">
            <p class="text-sm text-gray-600">Price</p>
            <p class="pc-price">${formatCurrency(product.price_per_unit)}</p>
            <p class="text-sm text-gray-500">per ${product.unit_type}</p>
          </div>
          
          <div class="featured-product-details__item">
            <p class="text-sm text-gray-600">Available Stock</p>
            <p class="pc-stock-value">${product.available_quantity}</p>
          </div>
          
          <div class="featured-product-details__item">
            <p class="text-sm text-gray-600">Category</p>
            <p class="font-semibold">${category}</p>
          </div>
          
          <div class="featured-product-details__item">
            <p class="text-sm text-gray-600">Location</p>
            <p class="font-semibold">${location}</p>
          </div>
        </div>
        
        ${canBuy ? `
          <div class="form-group featured-product-details__qty">
            <label class="form-label">Quantity</label>
            <input type="number" id="product-quantity" class="form-control" value="1" min="1" max="${product.available_quantity}">
          </div>
        ` : !isAuth ? `
          <div class="featured-product-details__guest-note">
            <i class="bi bi-info-circle"></i> Login as buyer to add this item to cart.
          </div>
        ` : ''}
      </div>
    </div>
  `;
  
  const footer = `
    <button class="btn btn-outline" data-modal-close>Close</button>
    ${canBuy ? `
      <button class="btn btn-primary" id="btn-add-to-cart-modal">
        <i class="bi bi-cart-plus"></i> Add to Cart
      </button>
    ` : !isAuth ? `
    <button class="btn btn-primary" id="btn-login-to-buy-modal">
        <i class="bi bi-box-arrow-in-right"></i> Login to Buy
    </button>
    ` : ''}
  `;
  
  isProductDetailsModalOpen = true;
  updateMobileCartBar(lastKnownCartCount);

  const modal = createModal({
    title: 'Product Details',
    content: modalContent,
    footer: footer,
    size: 'lg',
    onClose: () => {
      isProductDetailsModalOpen = false;
      updateMobileCartBar(lastKnownCartCount);
    }
  });
  
  // Add to cart from modal (only for buyers)
  if (canBuy) {
    const btnAddToCart = document.getElementById('btn-add-to-cart-modal');
    if (btnAddToCart) {
      btnAddToCart.addEventListener('click', async () => {
        const quantity = parseInt(document.getElementById('product-quantity').value);
        try {
          const { addToCart } = await import('../services/cart.service.js');
          await addToCart(productId, quantity);
          showToast('Added to cart!', 'success');
          
          // Update cart count
          const { getCartCount } = await import('../services/cart.service.js');
          const response = await getCartCount();
          if (response.success) {
            updateCartCount(response.data.count);
            updateMobileCartBar(response.data.count);
          }
          
          // Close modal
          modal.close();
        } catch (error) {
          showError('Failed to add to cart');
        }
      });
    }
  } else if (!isAuth) {
    const btnLoginToBuy = document.getElementById('btn-login-to-buy-modal');
    if (btnLoginToBuy) {
      btnLoginToBuy.addEventListener('click', () => {
        window.showLoginModal('buyer');
        modal.close();
      });
    }
  }
};

window.addToCart = async (productId) => {
  if (!isAuthenticated()) {
    window.showLoginModal('buyer');
    return;
  }
  
  if (!isBuyer()) {
    showToast('Only buyers can add items to cart', 'warning');
    return;
  }
  
  try {
    const { addToCart } = await import('../services/cart.service.js');
    await addToCart(productId, 1);
    showToast('Added to cart!', 'success');
    
    // Update cart count
    const { getCartCount } = await import('../services/cart.service.js');
    const response = await getCartCount();
    updateCartCount(response.data?.count || 0);
    updateMobileCartBar(response.data?.count || 0);
  } catch (error) {
    console.error('Error adding to cart:', error);
    showError(error.message || 'Failed to add to cart');
  }
};

window.viewSeller = async (eventOrSellerId, sellerIdArg, productCountArg = 0) => {
  const fromButtonClick = typeof eventOrSellerId !== 'string';
  const sellerId = fromButtonClick ? sellerIdArg : eventOrSellerId;
  const productCount = fromButtonClick ? Number(productCountArg || 0) : 0;
  const matchedSeller = sellers.find(seller => seller.id === sellerId);
  const sellerName = matchedSeller ? getSellerName(matchedSeller) : '';

  if (!sellerId) {
    showError('Seller not found');
    return;
  }

  const clickedBtn = fromButtonClick ? eventOrSellerId?.currentTarget : null;
  const originalLabel = clickedBtn ? clickedBtn.innerHTML : '';
  if (clickedBtn) {
    clickedBtn.disabled = true;
    clickedBtn.setAttribute('aria-busy', 'true');
    clickedBtn.innerHTML = '<span class="map-btn-spinner"></span> Loading...';
  }

  currentFilters.seller_id = sellerId;
  currentFilters.page = 1;

  try {
    await applyFilters();

    if (mobileMapExpanded) {
      setMobileMapExpanded(false);
    }

    if (window.innerWidth >= 1024) {
      setDesktopViewMode('grid');
    }
    document.getElementById('home-grid-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (sellerName) {
      const safeCount = Number.isFinite(productCount) ? Math.max(0, productCount) : 0;
      const countHint = safeCount > 0 ? ` (${safeCount} products)` : '';
      showToast(`Showing products from ${sellerName}${countHint}`, 'info');
    }
  } catch (error) {
    showError('Failed to load seller products');
  } finally {
    if (clickedBtn) {
      clickedBtn.disabled = false;
      clickedBtn.removeAttribute('aria-busy');
      clickedBtn.innerHTML = originalLabel;
    }
  }
};

window.showLoginModal = (preferredRole = 'buyer') => {
  const modal = createModal({
    title: '🛒 Login Required',
    content: `
      <div class="space-y-4 text-center">
        <div class="text-6xl">🛒</div>
        <h3 class="text-xl font-semibold">Please Login to Purchase</h3>
        <p class="text-gray-600">You need to login as a buyer to add items to your cart and make purchases.</p>
        <div class="bg-green-50 border border-green-200 rounded-lg p-4">
          <p class="text-sm text-green-800">
            <i class="bi bi-info-circle"></i>
            Don't have an account? You can register as a buyer during the login process.
          </p>
        </div>
      </div>
    `,
    footer: `
      <button class="btn btn-outline" data-modal-close>Cancel</button>
      <button class="btn btn-primary" id="btn-show-login-form">
        <i class="bi bi-box-arrow-in-right"></i> Login as ${preferredRole.charAt(0).toUpperCase() + preferredRole.slice(1)}
      </button>
    `,
    size: 'md'
  });
  
  // Add event listener to the "Login as Buyer" button
  const btnShowLoginForm = document.getElementById('btn-show-login-form');
  if (btnShowLoginForm) {
    btnShowLoginForm.addEventListener('click', async () => {
      // Close the "Login Required" modal first
      modal.close();
      
      // Import and show the actual login form modal
      const { showLoginModal: showAuthLoginModal } = await import('../features/auth/login.js');
      showAuthLoginModal();
    });
  }
};

// ============ Initialize on Load ============

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export { init, loadProducts, loadSellers, applyFilters };

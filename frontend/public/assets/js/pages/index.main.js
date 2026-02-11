// assets/js/pages/index.main.js
// Main JavaScript for Landing/Guest Browsing Page

import { renderNavbar, updateCartCount, updateOrdersCount } from '../components/navbar.js';
import { showToast, showError } from '../components/toast.js';
import { showSpinner, hideSpinner } from '../components/loading-spinner.js';
import { createModal } from '../components/modal.js';
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
  

};

// ============ Data Loading ============

const loadProducts = async () => {
  const container = document.getElementById('featured-products');
  const viewAllContainer = document.getElementById('view-all-container');
  if (!container) return;
  
  showSpinner(container, 'md', 'primary', 'Loading products...');
  
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

  if (sellersEl) {
    sellersEl.textContent = formatStatCount(heroStats.verifiedSellers);
  }

  if (productsEl) {
    productsEl.textContent = formatStatCount(heroStats.freshProducts);
  }
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
  const imageUrl = product.photo_path || product.photos?.[0] || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22200%22%3E%3Crect fill=%22%23f0f0f0%22 width=%22300%22 height=%22200%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2220%22 fill=%22%23999%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Image%3C/text%3E%3C/svg%3E';
  const isAuth = isAuthenticated();
  const canBuy = isAuth && isBuyer();
  
  return `
    <div class="card product-card">
      ${product.tags?.includes('fresh') ? '<div class="product-card-badge">Fresh</div>' : ''}
      
      <img src="${imageUrl}" alt="${product.name}" class="card-img" loading="lazy">
      
      <div class="card-body">
        <div class="flex items-center justify-between mb-2">
          <h3 class="card-title mb-0">${product.name}</h3>
          ${product.seller_verified ? '<span class="verified-badge"><i class="bi bi-patch-check-fill"></i> Verified</span>' : ''}
        </div>
        
        <p class="text-sm text-gray-600 mb-2">
          <i class="bi bi-geo-alt"></i> ${product.municipality}
        </p>
        
        <p class="text-sm text-gray-600 mb-2">
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
        
        <p class="card-text line-clamp-2">
          <i class="bi bi-file-text"></i> ${product.description || 'No description'}
        </p>
        
        <!-- Tags -->
        ${product.tags && product.tags.length > 0 ? `
          <div class="flex gap-2 mt-2 flex-wrap">
            ${product.tags.map(tag => `
              <span class="badge badge-info">
                <i class="bi bi-tag"></i> ${tag.charAt(0).toUpperCase() + tag.slice(1)}
              </span>
            `).join('')}
          </div>
        ` : ''}
        
        <!-- View Count & Order Count -->
        <div class="flex gap-4 mt-3 text-xs text-gray-500 border-t border-gray-200 pt-2">
          <div class="flex items-center gap-1">
            <i class="bi bi-eye"></i>
            <span>${product.view_count || 0} views</span>
          </div>
          <div class="flex items-center gap-1">
            <i class="bi bi-cart-check"></i>
            <span>${product.order_count || 0} orders</span>
          </div>
        </div>
        
        <!-- Spacer to push content to bottom -->
        <div class="flex-grow"></div>
        
        <div class="flex items-center justify-between mt-4">
          <div>
            <p class="text-2xl font-bold text-primary">${formatCurrency(product.price_per_unit)}</p>
            <p class="text-sm text-gray-500">per ${product.unit_type}</p>
          </div>
          
          <div class="text-center">
            <p class="text-sm text-gray-600">Available</p>
            <p class="font-semibold">${product.available_quantity}</p>
          </div>
        </div>
      </div>
      
      <div class="card-footer">
        <div class="flex gap-2">
          <button class="btn btn-outline flex-1" onclick="window.viewProduct('${product.id}')">
            <i class="bi bi-eye"></i> View
          </button>
          ${canBuy ? `
            <button class="btn btn-primary flex-1" onclick="window.addToCart('${product.id}')">
              <i class="bi bi-cart-plus"></i> Add to Cart
            </button>
          ` : !isAuth ? `
            <button class="btn btn-primary flex-1" onclick="window.showLoginModal('buyer')">
              <i class="bi bi-cart-plus"></i> Add to Cart
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

const updateMapMarkers = () => {
  if (!map || !markersLayer) {
    console.warn('Map or markers layer not initialized');
    return;
  }
  
  // Clear existing markers
  markersLayer.clearLayers();
  
  let markersAdded = 0;
  let skipped = 0;
  
  // Group sellers by their coordinates to handle overlapping markers
  const locationGroups = {};
  
  sellers.forEach((seller, index) => {
    let finalLat, finalLng;
    
    // Try to use seller's coordinates first
    if (seller.latitude && seller.longitude && !isNaN(seller.latitude) && !isNaN(seller.longitude)) {
      finalLat = parseFloat(seller.latitude);
      finalLng = parseFloat(seller.longitude);
    } 
    // Fallback to municipality coordinates
    else if (seller.municipality && MUNICIPALITY_COORDINATES[seller.municipality]) {
      const munCoords = MUNICIPALITY_COORDINATES[seller.municipality];
      finalLat = munCoords.latitude;
      finalLng = munCoords.longitude;
    } 
    // Skip if no valid coordinates available
    else {
      console.warn(`Skipping seller ${index}: ${seller.business_name || seller.full_name} - no valid coordinates or municipality`);
      skipped++;
      return;
    }
    
    // Create a location key to group sellers at the same coordinates
    const locationKey = `${finalLat.toFixed(6)},${finalLng.toFixed(6)}`;
    
    if (!locationGroups[locationKey]) {
      locationGroups[locationKey] = {
        lat: finalLat,
        lng: finalLng,
        sellers: []
      };
    }
    
    locationGroups[locationKey].sellers.push(seller);
  });
  
  // Add markers for each location group
  Object.entries(locationGroups).forEach(([locationKey, group]) => {
    try {
      const { lat, lng, sellers: groupSellers } = group;
      
      let marker, popupContent;
      
      if (groupSellers.length === 1) {
        // Single seller at this location
        const seller = groupSellers[0];
        marker = L.marker([lat, lng], {
          title: seller.business_name || seller.full_name
        });
        
        popupContent = `
          <div class="p-3" style="min-width: 240px; max-width: 300px;">
            <h4 class="font-bold text-sm mb-2 break-words">${seller.business_name || seller.full_name}</h4>
            <div class="mb-2">
              ${seller.verified ? '<span class="inline-block bg-green-100 text-green-700 text-xs px-2 py-1 rounded font-semibold"><i class="bi bi-patch-check-fill"></i> Verified</span>' : ''}
            </div>
            <div class="space-y-1 mb-3">
              <p class="text-xs text-gray-700"><i class="bi bi-geo-alt"></i> ${seller.municipality || 'Unknown'}</p>
              <p class="text-xs text-gray-700"><i class="bi bi-shop"></i> ${seller.farm_type || 'Farm'}</p>
            </div>
            <button class="btn btn-sm btn-primary w-full text-xs py-2" onclick="window.viewSeller('${seller.id}')">
              View Products
            </button>
          </div>
        `;
      } else {
        // Multiple sellers at the same location - create clustered marker
        const municipalityName = groupSellers[0].municipality || 'Unknown';
        
        // Create custom marker icon for clusters
        const clusterIcon = L.divIcon({
          className: 'cluster-marker',
          html: `<div class="cluster-marker-inner">${groupSellers.length}</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15]
        });
        
        marker = L.marker([lat, lng], { icon: clusterIcon });
        
        // Create popup content for multiple sellers
        const sellersHtml = groupSellers.map(seller => `
          <div class="border-b border-gray-200 last:border-b-0 pb-2 mb-2 last:pb-0 last:mb-0">
            <h5 class="font-bold text-sm break-words">${seller.business_name || seller.full_name}</h5>
            <div class="mb-1">
              ${seller.verified ? '<span class="inline-block bg-green-100 text-green-700 text-xs px-2 py-1 rounded font-semibold"><i class="bi bi-patch-check-fill"></i> Verified</span>' : ''}
            </div>
            <div class="space-y-1 mb-2">
              <p class="text-xs text-gray-600"><i class="bi bi-shop"></i> ${seller.farm_type || 'Farm'}</p>
            </div>
            <button class="btn btn-sm btn-primary w-full text-xs py-1" onclick="window.viewSeller('${seller.id}')">
              View Products
            </button>
          </div>
        `).join('');
        
        popupContent = `
          <div class="p-3" style="min-width: 280px; max-width: 320px; max-height: 400px; overflow-y: auto;">
            <h4 class="font-bold text-sm mb-3 text-center">
              <i class="bi bi-geo-alt"></i> ${municipalityName} (${groupSellers.length} sellers)
            </h4>
            <div class="space-y-3">
              ${sellersHtml}
            </div>
          </div>
        `;
      }
      
      marker.bindPopup(popupContent, { maxWidth: 350 });
      
      // Event listeners
      marker.on('click', function() {
        this.openPopup();
      });
      
      markersLayer.addLayer(marker);
      markersAdded++;
      
    } catch (error) {
      console.warn(`Error adding marker for location ${locationKey}:`, error);
      skipped++;
    }
  });
  

  if (skipped > 0) {

  }
};

// Filters
const filterMapByMunicipality = (municipality) => {
  if (!markersLayer) return;
  
  // Clear existing markers
  markersLayer.clearLayers();
  
  let filteredCount = 0;
  
  // Group sellers by their coordinates, filtering by municipality first
  const locationGroups = {};
  
  sellers.forEach((seller, index) => {
    // Skip if municipality filter doesn't match
    if (municipality && seller.municipality !== municipality) {
      return;
    }
    
    let finalLat, finalLng;
    
    // Try to use seller's coordinates first
    if (seller.latitude && seller.longitude && !isNaN(seller.latitude) && !isNaN(seller.longitude)) {
      finalLat = parseFloat(seller.latitude);
      finalLng = parseFloat(seller.longitude);
    } 
    // Fallback to municipality coordinates
    else if (seller.municipality && MUNICIPALITY_COORDINATES[seller.municipality]) {
      const munCoords = MUNICIPALITY_COORDINATES[seller.municipality];
      finalLat = munCoords.latitude;
      finalLng = munCoords.longitude;
    } 
    // Skip if no valid coordinates available
    else {
      return;
    }
    
    // Create a location key to group sellers at the same coordinates
    const locationKey = `${finalLat.toFixed(6)},${finalLng.toFixed(6)}`;
    
    if (!locationGroups[locationKey]) {
      locationGroups[locationKey] = {
        lat: finalLat,
        lng: finalLng,
        sellers: []
      };
    }
    
    locationGroups[locationKey].sellers.push(seller);
  });
  
  // Add markers for each location group
  Object.entries(locationGroups).forEach(([locationKey, group]) => {
    try {
      const { lat, lng, sellers: groupSellers } = group;
      
      let marker, popupContent;
      
      if (groupSellers.length === 1) {
        // Single seller at this location
        const seller = groupSellers[0];
        marker = L.marker([lat, lng], {
          title: seller.business_name || seller.full_name
        });
        
        popupContent = `
          <div class="p-3" style="min-width: 240px; max-width: 300px;">
            <h4 class="font-bold text-sm mb-2 break-words">${seller.business_name || seller.full_name}</h4>
            <div class="mb-2">
              ${seller.verified ? '<span class="inline-block bg-green-100 text-green-700 text-xs px-2 py-1 rounded font-semibold"><i class="bi bi-patch-check-fill"></i> Verified</span>' : ''}
            </div>
            <div class="space-y-1 mb-3">
              <p class="text-xs text-gray-700"><i class="bi bi-geo-alt"></i> ${seller.municipality || 'Unknown'}</p>
              <p class="text-xs text-gray-700"><i class="bi bi-shop"></i> ${seller.farm_type || 'Farm'}</p>
            </div>
            <button class="btn btn-sm btn-primary w-full text-xs py-2" onclick="window.viewSeller('${seller.id}')">
              View Products
            </button>
          </div>
        `;
      } else {
        // Multiple sellers at the same location - create clustered marker
        const municipalityName = groupSellers[0].municipality || 'Unknown';
        
        // Create custom marker icon for clusters
        const clusterIcon = L.divIcon({
          className: 'cluster-marker',
          html: `<div class="cluster-marker-inner">${groupSellers.length}</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15]
        });
        
        marker = L.marker([lat, lng], { icon: clusterIcon });
        
        // Create popup content for multiple sellers
        const sellersHtml = groupSellers.map(seller => `
          <div class="border-b border-gray-200 last:border-b-0 pb-2 mb-2 last:pb-0 last:mb-0">
            <h5 class="font-bold text-sm break-words">${seller.business_name || seller.full_name}</h5>
            <div class="mb-1">
              ${seller.verified ? '<span class="inline-block bg-green-100 text-green-700 text-xs px-2 py-1 rounded font-semibold"><i class="bi bi-patch-check-fill"></i> Verified</span>' : ''}
            </div>
            <div class="space-y-1 mb-2">
              <p class="text-xs text-gray-600"><i class="bi bi-shop"></i> ${seller.farm_type || 'Farm'}</p>
            </div>
            <button class="btn btn-sm btn-primary w-full text-xs py-1" onclick="window.viewSeller('${seller.id}')">
              View Products
            </button>
          </div>
        `).join('');
        
        popupContent = `
          <div class="p-3" style="min-width: 280px; max-width: 320px; max-height: 400px; overflow-y: auto;">
            <h4 class="font-bold text-sm mb-3 text-center">
              <i class="bi bi-geo-alt"></i> ${municipalityName} (${groupSellers.length} sellers)
            </h4>
            <div class="space-y-3">
              ${sellersHtml}
            </div>
          </div>
        `;
      }
      
      marker.bindPopup(popupContent, { maxWidth: 350 });
      markersLayer.addLayer(marker);
      filteredCount++;
      
    } catch (error) {
      console.warn(`Error adding filtered marker for location ${locationKey}:`, error);
    }
  });
  

};

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

// ============ Event Listeners ============

const attachEventListeners = () => {
  // Search inputs (both mobile and desktop)
  const searchSelectors = ['search-input', 'search-input-mobile'];
  searchSelectors.forEach(id => {
    const searchInput = document.getElementById(id);
    if (searchInput) {
      searchInput.addEventListener('input', debounce((e) => {
        currentFilters.search = e.target.value;
        
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
  
  // Category filter (both desktop and mobile)
  const categorySelectors = ['filter-category', 'filter-category-mobile'];
  categorySelectors.forEach(id => {
    const categoryFilter = document.getElementById(id);
    if (categoryFilter) {
      categoryFilter.addEventListener('change', (e) => {
        currentFilters.category = e.target.value;
        currentFilters.page = 1;
        
        // Sync both selectors
        categorySelectors.forEach(syncId => {
          const syncSelect = document.getElementById(syncId);
          if (syncSelect && syncSelect !== e.target) {
            syncSelect.value = e.target.value;
          }
        });
        
        applyFilters();
      });
    }
  });
  
  // Municipality filter (both desktop and mobile)
  const municipalitySelectors = ['filter-municipality', 'filter-municipality-mobile'];
  municipalitySelectors.forEach(id => {
    const municipalityFilter = document.getElementById(id);
    if (municipalityFilter) {
      municipalityFilter.addEventListener('change', (e) => {
        currentFilters.municipality = e.target.value;
        currentFilters.page = 1; // Reset to first page when municipality changes
        
        // Sync both selectors
        municipalitySelectors.forEach(syncId => {
          const syncSelect = document.getElementById(syncId);
          if (syncSelect && syncSelect !== e.target) {
            syncSelect.value = e.target.value;
          }
        });
        
        applyFilters();
      });
    }
  });
  
  // Sort filter (both desktop and mobile)
  const sortSelectors = ['sort-by', 'sort-by-mobile'];
  sortSelectors.forEach(id => {
    const sortBy = document.getElementById(id);
    if (sortBy) {
      sortBy.addEventListener('change', (e) => {
        // Parse sort value (format: "field:order")
        const [field, order] = e.target.value.split(':');
        currentFilters.sort_by = field;
        currentFilters.sort_order = order || 'desc';
        currentFilters.page = 1;
        
        // Sync both selectors
        sortSelectors.forEach(syncId => {
          const syncSelect = document.getElementById(syncId);
          if (syncSelect && syncSelect !== e.target) {
            syncSelect.value = e.target.value;
          }
        });
        
        applyFilters();
      });
    }
  });
  
  // Hero buttons
  const btnBrowse = document.getElementById('btn-browse-products');
  if (btnBrowse) {
    btnBrowse.addEventListener('click', () => {
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
  
  const modalContent = `
    <div class="space-y-4">
      <img src="${product.photo_path || product.photos?.[0] || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22800%22 height=%22400%22%3E%3Crect fill=%22%23f0f0f0%22 width=%22800%22 height=%22400%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2240%22 fill=%22%23999%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Image%3C/text%3E%3C/svg%3E'}" 
           alt="${product.name}" 
           class="w-full h-64 object-cover rounded-lg">
      
      <div>
        <div class="flex items-start justify-between mb-2">
          <h3 class="text-2xl font-bold">${product.name}</h3>
          ${product.seller_verified ? '<span class="verified-badge"><i class="bi bi-patch-check-fill"></i> Verified</span>' : ''}
        </div>
        
        <p class="text-gray-600 mb-4">
          <i class="bi bi-shop"></i> ${product.seller_name || 'Unknown Seller'}
        </p>
        
        <p class="text-gray-600 mb-4">${product.description || 'No description'}</p>
        
        <!-- Tags -->
        ${product.tags && product.tags.length > 0 ? `
          <div class="mb-4">
            <p class="text-sm text-gray-600 mb-2">Tags</p>
            <div class="flex gap-2 flex-wrap">
              ${product.tags.map(tag => `
                <span class="badge badge-info">
                  <i class="bi bi-tag"></i> ${tag.charAt(0).toUpperCase() + tag.slice(1)}
                </span>
              `).join('')}
            </div>
          </div>
        ` : ''}
        
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p class="text-sm text-gray-600">Price</p>
            <p class="text-2xl font-bold text-primary">${formatCurrency(product.price_per_unit)}</p>
            <p class="text-sm text-gray-500">per ${product.unit_type}</p>
          </div>
          
          <div>
            <p class="text-sm text-gray-600">Available Stock</p>
            <p class="text-xl font-semibold">${product.available_quantity}</p>
          </div>
          
          <div>
            <p class="text-sm text-gray-600">Category</p>
            <p class="font-semibold">${product.category}</p>
          </div>
          
          <div>
            <p class="text-sm text-gray-600">Location</p>
            <p class="font-semibold">${product.municipality}</p>
          </div>
        </div>
        
        ${canBuy ? `
          <div class="form-group">
            <label class="form-label">Quantity</label>
            <input type="number" id="product-quantity" class="form-control" value="1" min="1" max="${product.available_quantity}">
          </div>
        ` : ''}
      </div>
    </div>
  `;
  
  const footer = `
    <button class="btn btn-outline" onclick="this.closest('.modal-backdrop').remove()">Close</button>
    ${canBuy ? `
      <button class="btn btn-primary" id="btn-add-to-cart-modal">
        <i class="bi bi-cart-plus"></i> Add to Cart
      </button>
    ` : !isAuth ? `
      <a href="/index.html?login=buyer" class="btn btn-primary">
        <i class="bi bi-box-arrow-in-right"></i> Login to Buy
      </a>
    ` : ''}
  `;
  
  const modal = createModal({
    title: 'Product Details',
    content: modalContent,
    footer: footer,
    size: 'lg'
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
          }
          
          // Close modal
          document.querySelector('.modal-backdrop').remove();
        } catch (error) {
          showError('Failed to add to cart');
        }
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
  } catch (error) {
    console.error('Error adding to cart:', error);
    showError(error.message || 'Failed to add to cart');
  }
};

window.viewSeller = (sellerId) => {
  // Filter products by seller
  currentFilters.sellerId = sellerId;
  applyFilters();
  document.getElementById('featured-products')?.scrollIntoView({ behavior: 'smooth' });
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
      <button class="btn btn-outline" onclick="document.querySelector('.modal-backdrop').remove()">Cancel</button>
      <a href="/index.html?login=${preferredRole}" class="btn btn-primary">
        <i class="bi bi-box-arrow-in-right"></i> Login as ${preferredRole.charAt(0).toUpperCase() + preferredRole.slice(1)}
      </a>
    `,
    size: 'md'
  });
};

// ============ Initialize on Load ============

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export { init, loadProducts, loadSellers, applyFilters };
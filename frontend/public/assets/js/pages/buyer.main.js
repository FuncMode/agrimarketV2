// assets/js/pages/buyer.main.js
// Buyer Dashboard Main Script

import { renderNavbar, updateCartCount, updateMessagesCount } from '../components/navbar.js';
import { showToast, showError, showSuccess } from '../components/toast.js';
import { showSpinner, hideSpinner } from '../components/loading-spinner.js';
import { createProductCard, renderProductCards } from '../components/product-card.js';
import { createModal, closeModal } from '../components/modal.js';
import { openIssueModal } from '../components/issue-modal.js';
import { initMap, addMarkers, clearMarkers } from '../components/map.js';
import { requireAuth, getToken } from '../core/auth.js';
import { formatCurrency, formatRelativeTime } from '../utils/formatters.js';
import { debounce } from '../utils/helpers.js';
import { MUNICIPALITY_COORDINATES, RIZAL_MUNICIPALITIES, PRODUCT_TAGS } from '../utils/constants.js';
import { ENDPOINTS, buildUrl } from '../config/api.js';

// Services
import { listProducts, incrementViewCount } from '../services/product.service.js';
import { 
  getCart, 
  addToCart as addToCartService, 
  updateCartItem, 
  removeFromCart, 
  clearCart,
  getCartCount 
} from '../services/cart.service.js';
import { 
  createOrder, 
  getOrders, 
  getOrderById,
  cancelOrder,
  confirmOrder,
  rateOrder 
} from '../services/order.service.js';
import { 
  getConversations,
  getOrderMessages,
  sendMessage,
  markMessagesAsRead
} from '../services/message.service.js';
import { getMyIssues, getIssue } from '../services/issue.service.js';
import { getProfile } from '../services/user.service.js';
import { calculateDistance, getRoute, geocodeAddress } from '../services/map.service.js';
import { getUserId } from '../core/auth.js';
import { getDeliveryProofUrl, getIssueEvidenceUrl } from '../utils/image-helpers.js';
import { initNotificationSounds, playMessageSound } from '../features/notifications/notification-sound.js';
import {
  initOnlineStatus,
  createStatusBadge,
  isUserOnline,
  onStatusChange,
  setInitialOnlineUsers,
  cleanup as cleanupOnlineStatus
} from '../features/real-time/online-status.js';
import { initLiveUpdates, onUpdate } from '../features/real-time/live-updates.js';

// Store
import cartStore from '../store/cart.store.js';

// ============ State ============

let currentPage = 'browse';
let currentConversation = null;
let onlineUsers = new Set(); // Track online users
let initialOnlineUsersPromise = Promise.resolve(); // Promise that resolves when initial online users are loaded
let browseFilters = {
  search: '',
  category: '',
  municipality: '',
  tags: [],
  sort_by: 'created_at',
  sort_order: 'desc',
  page: 1,
  limit: 12
};
let currentView = 'grid'; // 'grid' or 'map'
let browseMap = null;
let orderFilters = {
  status: 'all',
  page: 1
};
let issueFilters = {
  status: 'all'
};
let currentCart = null;
let currentOrders = [];
let currentIssues = [];
let productDetailsMap = null;
let userLocation = null;

// ============ Product Reviews ============

async function viewProductReviews(productId, productName) {
  try {
    showSpinner(null, 'md', 'primary', 'Loading reviews...');
    
    const token = getToken();
    const response = await fetch(`/api/products/${productId}/reviews?page=1&limit=20`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
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
  // Check authentication
  if (!requireAuth(['buyer'])) return;
  
  // Initialize cart store
  cartStore.init();
  
  // Initialize notification sounds
  initNotificationSounds();
  
  // Initialize real-time features (socket) BEFORE rendering navbar
  await initializeRealTime();
  
  // NOW initialize components that depend on socket
  renderNavbar();
  
  // Wait for DOM to be fully ready before setting up navigation
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupNavigation);
  } else {
    setupNavigation();
  }
  
  // Load initial cart from server
  try {
    const response = await getCart();
    if (response.success && response.data) {
      cartStore.set(response.data.items || []);
    }
  } catch (error) {
    console.warn('Could not load cart:', error);
  }
  
  // Populate municipality filter
  populateMunicipalityFilter();
  
  // Load initial data
  await loadBrowseProducts();
  await updateCartUI();
  await updateMessageBadge();
  
  // Attach event listeners
  attachEventListeners();
};

// ============ Navigation ============

const setupNavigation = () => {
  // Handle hash navigation
  const handleHashChange = () => {
    const hash = window.location.hash.slice(1) || 'browse';
    showPage(hash);
  };
  
  window.addEventListener('hashchange', handleHashChange);
  
  // Wait for DOM to be fully loaded before initial navigation
  if (document.readyState === 'complete') {
    handleHashChange();
  } else {
    window.addEventListener('load', handleHashChange);
  }
};

const showPage = (page) => {
  currentPage = page;
  
  // Close conversation when leaving messaging section
  if (page !== 'messaging') {
    currentConversation = null;
    const chatWindow = document.getElementById('chat-window');
    if (chatWindow) {
      chatWindow.innerHTML = '<p class="text-center text-gray-500 py-12">Select a conversation to start messaging</p>';
    }
  }
  
  // Hide all sections
  document.querySelectorAll('section').forEach(section => {
    section.style.display = 'none';
  });
  
  // Show current section
  const section = document.getElementById(page);
  if (section) {
    section.style.display = 'block';
    
    // Load page data
    switch(page) {
      case 'browse':
        loadBrowseProducts();
        break;
      case 'cart':
        loadCart();
        break;
      case 'orders':
        loadOrders();
        break;
      case 'messaging':
        // Wait for initial online users to be loaded from server before rendering conversations
        // This prevents badges from showing offline when they should show online
        initialOnlineUsersPromise.then(() => {
          if (currentPage === 'messaging') {
            loadConversations();
          }
        }).catch(() => {
          // If promise rejects or times out, load conversations anyway
          if (currentPage === 'messaging') {
            loadConversations();
          }
        });
        break;
      case 'my-issues':
        loadMyIssues();
        break;
    }
  }
};

// ============ Browse Products ============

const loadBrowseProducts = async () => {
  const container = document.getElementById('browse-products');
  if (!container) return;
  
  showSpinner(container, 'md', 'primary', 'Loading products...');
  
  try {
    // Prepare filters, handling tags array
    const filters = { ...browseFilters };
    if (filters.tags && filters.tags.length > 0) {
      filters.tags = filters.tags.join(',');
    } else {
      delete filters.tags;
    }
    
    const response = await listProducts(filters);
    const products = response.data?.products || [];
    const total = response.total || products.length;
    
    // Update products count
    updateProductsCount(total);
    
    if (products.length === 0) {
      container.innerHTML = `
        <div class="text-center py-12 col-span-full">
          <i class="bi bi-inbox text-6xl text-gray-400"></i>
          <p class="text-gray-500 mt-4">No products found</p>
          <p class="text-sm text-gray-400 mt-2">Try adjusting your filters or search terms</p>
        </div>
      `;
      return;
    }
    
    renderProductCards(products, container, {
      showActions: true,
      showSeller: true,
      onView: viewProductDetails,
      onAddToCart: handleAddToCart,
      onViewReviews: viewProductReviews
    });
    
  } catch (error) {
    console.error('Error loading products:', error);
    container.innerHTML = `
      <div class="text-center py-12 col-span-full">
        <i class="bi bi-exclamation-circle text-6xl text-danger"></i>
        <p class="text-danger mt-4">Failed to load products</p>
        <button class="btn btn-primary mt-4" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
};

// Update products count display
const updateProductsCount = (count) => {
  const countEl = document.getElementById('products-count');
  if (countEl) {
    countEl.textContent = `${count} product${count !== 1 ? 's' : ''} found`;
  }
};

// Populate municipality filter dropdown
const populateMunicipalityFilter = () => {
  const municipalitySelect = document.getElementById('browse-municipality');
  if (!municipalitySelect) return;
  
  const options = '<option value="">All Locations</option>' +
    RIZAL_MUNICIPALITIES.map(m => `<option value="${m}">${m}</option>`).join('');
  
  municipalitySelect.innerHTML = options;
};

// Clear all filters
const clearAllFilters = () => {
  // Reset filter values
  browseFilters = {
    search: '',
    category: '',
    municipality: '',
    tags: [],
    sort_by: 'created_at',
    sort_order: 'desc',
    page: 1,
    limit: 12
  };
  
  // Reset UI
  const searchInput = document.getElementById('browse-search');
  if (searchInput) searchInput.value = '';
  
  const categorySelect = document.getElementById('browse-category');
  if (categorySelect) categorySelect.value = '';
  
  const municipalitySelect = document.getElementById('browse-municipality');
  if (municipalitySelect) municipalitySelect.value = '';
  
  const sortSelect = document.getElementById('browse-sort');
  if (sortSelect) sortSelect.value = 'created_at:desc';
  
  // Uncheck all tag checkboxes
  document.querySelectorAll('.product-tag-checkbox').forEach(checkbox => {
    checkbox.checked = false;
  });
  
  // Reload products
  loadBrowseProducts();
};

// Toggle between grid and map view
const toggleView = (view) => {
  currentView = view;
  
  const gridContainer = document.getElementById('browse-products');
  const mapContainer = document.getElementById('browse-map-container');
  const gridBtn = document.getElementById('view-grid');
  const mapBtn = document.getElementById('view-map');
  
  if (view === 'grid') {
    gridContainer?.classList.remove('hidden');
    mapContainer?.classList.add('hidden');
    gridBtn?.classList.add('active');
    mapBtn?.classList.remove('active');
  } else {
    gridContainer?.classList.add('hidden');
    mapContainer?.classList.remove('hidden');
    gridBtn?.classList.remove('active');
    mapBtn?.classList.add('active');
    
    // Initialize map if not already done
    if (!browseMap) {
      initBrowseMap();
    }
  }
};

// Initialize browse map
const initBrowseMap = () => {
  const mapContainer = document.getElementById('browse-map');
  if (!mapContainer || typeof L === 'undefined') return;
  
  try {
    // Initialize map centered on Rizal
    browseMap = L.map('browse-map').setView([14.6037, 121.3084], 11);
    
    // Add tile layer with error handling
    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18,
      errorTileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    }).addTo(browseMap);
    
    // Suppress tile loading errors
    tileLayer.on('tileerror', function(error, tile) {
      // Silently handle tile errors
    });
    
    // Load and display products on map
    loadProductsOnMap();
  } catch (error) {
    console.error('Error initializing browse map:', error);
  }
};

// Load products on map
const loadProductsOnMap = async () => {
  if (!browseMap) return;
  
  try {
    // Get current products
    const filters = { ...browseFilters };
    if (filters.tags && filters.tags.length > 0) {
      filters.tags = filters.tags.join(',');
    } else {
      delete filters.tags;
    }

    const response = await listProducts({ ...filters, limit: 100 });
    const products = response.data?.products || [];
    
    // Clear existing markers
    browseMap.eachLayer((layer) => {
      if (layer instanceof L.Marker) {
        browseMap.removeLayer(layer);
      }
    });

    // Group products by seller and municipality
    const sellerGroups = {};
    products.forEach(product => {
      const coords = MUNICIPALITY_COORDINATES[product.municipality];
      if (!coords) return;
      
      const sellerId = product.seller?.id || product.seller_name;
      const key = `${sellerId}_${product.municipality}`;
      
      if (!sellerGroups[key]) {
        sellerGroups[key] = {
          seller_name: product.seller_name || 'Unknown Seller',
          seller_verified: product.seller_verified || false,
          municipality: product.municipality,
          coordinates: coords,
          products: []
        };
      }
      
      sellerGroups[key].products.push(product);
    });

    // Add one marker per seller per location
    Object.values(sellerGroups).forEach(sellerGroup => {
      const { seller_name, seller_verified, municipality, coordinates, products } = sellerGroup;
      
      const marker = L.marker([coordinates.latitude, coordinates.longitude]);
      
      // Create popup content showing all products from this seller
      const productList = products.map(product => `
        <div class="border-b border-gray-200 pb-2 mb-2 last:border-b-0 last:pb-0 last:mb-0">
          <h5 class="font-semibold text-sm text-gray-800">${product.name}</h5>
          <p class="text-xs text-gray-600 mb-1">${product.description || ''}</p>
          <div class="flex justify-between items-center">
            <span class="text-sm font-bold text-primary">${formatCurrency(product.price_per_unit)}/${product.unit_type}</span>
            <button 
              class="btn btn-xs btn-outline-primary" 
              onclick="window.viewProductFromMap('${product.id}')"
            >
              View
            </button>
          </div>
        </div>
      `).join('');
      
      const popupContent = `
        <div class="p-3" style="min-width: 280px; max-width: 320px;">
          <div class="flex items-center gap-2 mb-3">
            <i class="bi bi-shop text-primary"></i>
            <h4 class="font-bold text-base text-gray-800">${seller_name}</h4>
            ${seller_verified ? '<i class="bi bi-patch-check-fill text-success" title="Verified Seller"></i>' : ''}
          </div>
          
          <p class="text-xs text-gray-600 mb-3">
            <i class="bi bi-geo-alt"></i> ${municipality}
          </p>
          
          <div class="mb-3">
            <h5 class="font-semibold text-sm text-gray-700 mb-2">Products (${products.length}):</h5>
            <div class="max-h-60 overflow-y-auto">
              ${productList}
            </div>
          </div>
          
          <div class="text-center">
            <button 
              class="btn btn-sm btn-primary w-full" 
              onclick="window.viewAllSellerProducts('${sellerGroup.seller_name}', '${municipality}')"
            >
              <i class="bi bi-grid-3x3-gap"></i> View All ${products.length} Products
            </button>
          </div>
        </div>
      `;
      
      marker.bindPopup(popupContent, {
        maxWidth: 320,
        className: 'seller-popup'
      });
      marker.addTo(browseMap);
    });
  } catch (error) {
    console.error('Error loading products on map:', error);
  }
};

// Global function to view product from map
window.viewProductFromMap = async (productId) => {
  try {
    const filters = { ...browseFilters };
    if (filters.tags && filters.tags.length > 0) {
      filters.tags = filters.tags.join(',');
    } else {
      delete filters.tags;
    }
    
    const response = await listProducts(filters);
    const product = response.data?.products.find(p => p.id === productId);
    
    if (product) {
      viewProductDetails(product);
    }
  } catch (error) {
    console.error('Error viewing product from map:', error);
  }
};

// Global function to view all products from a seller
window.viewAllSellerProducts = async (sellerName, municipality) => {
  try {
    // Filter products to show only from this seller in this municipality
    const originalFilters = { ...browseFilters };
    
    // Apply seller filter by searching for seller name
    // Since we don't have direct seller filter, we'll show a modal instead
    const filters = { ...browseFilters };
    if (filters.tags && filters.tags.length > 0) {
      filters.tags = filters.tags.join(',');
    } else {
      delete filters.tags;
    }
    
    const response = await listProducts({ ...filters, limit: 100 });
    const allProducts = response.data?.products || [];
    
    // Filter products by seller and municipality
    const sellerProducts = allProducts.filter(product => 
      product.seller_name === sellerName && product.municipality === municipality
    );
    
    if (sellerProducts.length === 0) {
      showError('No products found for this seller');
      return;
    }
    
    // Create modal to show all seller products
    const modal = createModal({
      title: `${sellerName} - ${municipality}`,
      content: `
        <div class="space-y-4">
          <div class="text-sm text-gray-600 mb-4">
            <i class="bi bi-shop"></i> ${sellerProducts[0].seller_verified ? '<span class="text-success"><i class="bi bi-patch-check-fill"></i> Verified Seller</span>' : 'Seller'}
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
            ${sellerProducts.map(product => `
              <div class="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <h5 class="font-semibold text-gray-800 mb-2">${product.name}</h5>
                <p class="text-xs text-gray-600 mb-2">${product.description || ''}</p>
                <p class="text-sm font-bold text-primary mb-3">${formatCurrency(product.price_per_unit)} per ${product.unit_type}</p>
                <div class="flex gap-2">
                  <button 
                    class="btn btn-xs btn-outline-primary flex-1" 
                    onclick="window.viewProductFromModal('${product.id}')"
                  >
                    <i class="bi bi-eye"></i> View
                  </button>
                  <button 
                    class="btn btn-xs btn-primary flex-1" 
                    onclick="window.addToCartFromModal('${product.id}')"
                  >
                    <i class="bi bi-cart-plus"></i> Add
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `,
      size: 'lg'
    });
    
  } catch (error) {
    console.error('Error viewing seller products:', error);
    showError('Failed to load seller products');
  }
};

// Helper functions for modal actions
window.viewProductFromModal = async (productId) => {
  try {
    const response = await listProducts({ limit: 100 });
    const product = response.data?.products.find(p => p.id === productId);
    
    if (product) {
      // Close only the seller products modal, keep the product details modal intact
      const sellerModals = document.querySelectorAll('.modal-backdrop:not(#product-details-modal)');
      sellerModals.forEach(modal => modal.remove());
      
      // Show product details
      viewProductDetails(product);
    }
  } catch (error) {
    console.error('Error viewing product from modal:', error);
  }
};

window.addToCartFromModal = async (productId) => {
  try {
    const response = await listProducts({ limit: 100 });
    const product = response.data?.products.find(p => p.id === productId);
    
    if (product) {
      await handleAddToCart(product);
      
      // Close only the seller products modal, not the product details modal
      const sellerModals = document.querySelectorAll('.modal-backdrop:not(#product-details-modal)');
      sellerModals.forEach(modal => modal.remove());
      
      showToast('Product added to cart!', 'success');
    }
  } catch (error) {
    console.error('Error adding product to cart from modal:', error);
    showError('Failed to add product to cart');
  }
};

const viewProductDetails = async (product) => {
  try {
    // Increment view count
    incrementViewCount(product.id);
    
    // Get modal elements with null checks
    let modal = document.getElementById('product-details-modal');
    let titleEl = document.getElementById('product-details-title');
    let infoSection = document.getElementById('product-info-content');
    
    // If modal doesn't exist, create it using the modal component
    if (!modal || !titleEl || !infoSection) {
      const dynamicModal = createModal({
        title: product.name || 'Product Details',
        content: `
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Map Section -->
            <div class="bg-gray-50 rounded-lg h-64 lg:h-80 relative">
              <div id="dynamic-product-map" class="w-full h-full rounded-lg"></div>
              <div class="absolute bottom-2 left-2 right-2">
                <div id="dynamic-distance-display" class="bg-white/90 backdrop-blur-sm rounded px-3 py-2 text-sm">
                  <i class="bi bi-geo-alt"></i> Calculating distance...
                </div>
              </div>
            </div>
            
            <!-- Product Info -->
            <div id="dynamic-product-info" class="space-y-4">
              <!-- Content will be populated here -->
            </div>
          </div>
        `,
        size: 'xl'
      });
      
      // Use the dynamic modal elements
      infoSection = document.getElementById('dynamic-product-info');
      
      if (!infoSection) {
        showError('Unable to create product modal');
        return;
      }
      
      // Render product information in dynamic modal
      renderProductInfoForDynamicModal(product, infoSection);
      
      // Initialize map for dynamic modal
      setTimeout(() => {
        initDynamicProductMap(product);
      }, 100);
      
      return;
    }
    
    // Use existing static modal
    titleEl.textContent = product.name;
    renderProductInfo(product, infoSection);
    modal.classList.remove('hidden');
    
    // Initialize map after modal is shown
    setTimeout(() => {
      initProductMap(product);
    }, 100);
    
    // Set up close handler for static modal
    setupModalCloseHandlers();
    
  } catch (error) {
    console.error('Error viewing product details:', error);
    showError('Failed to load product details');
  }
};

const renderProductInfo = (product, container) => {
  if (!container) {
    console.error('Product info container not found');
    return;
  }
  
  try {
    container.innerHTML = `
      <img src="${product.photo_path || product.photos?.[0] || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22800%22 height=%22400%22%3E%3Crect fill=%22%23f0f0f0%22 width=%22800%22 height=%22400%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2240%22 fill=%22%23999%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Image%3C/text%3E%3C/svg%3E'}" 
           alt="${product.name || 'Product'}">
      
      <div class="flex items-start justify-between mb-4">
        <h3 class="text-3xl font-bold">${product.name || 'Unknown Product'}</h3>
        ${product.seller_verified ? '<span class="verified-badge"><i class="bi bi-patch-check-fill"></i> Verified</span>' : ''}
      </div>
      
      <p class="product-price">${formatCurrency(product.price_per_unit || 0)} <span class="text-lg font-normal">per ${product.unit_type || 'unit'}</span></p>
      
      <div class="product-description">
        <h4 class="font-bold text-lg mb-3"><i class="bi bi-info-circle"></i> Description</h4>
        <p>${product.description || 'No description available'}</p>
      </div>
      
      <div class="product-details-grid">
        <div class="product-detail-item">
          <div class="label">Seller</div>
          <div class="value"><i class="bi bi-shop"></i> ${product.seller_name || 'Unknown Seller'}</div>
        </div>
        
        <div class="product-detail-item">
          <div class="label">Available Stock</div>
          <div class="value"><i class="bi bi-box"></i> ${product.available_quantity || 0} ${product.unit_type || 'units'}</div>
        </div>
        
        <div class="product-detail-item">
          <div class="label">Category</div>
          <div class="value"><i class="bi bi-tag"></i> ${product.category || 'Uncategorized'}</div>
        </div>
      
        <div class="product-detail-item">
          <div class="label">Location</div>
          <div class="value"><i class="bi bi-geo-alt"></i> ${product.municipality || 'Unknown'}</div>
        </div>
      </div>
      
      <div class="product-actions">
        <div class="quantity-selector">
          <label>Quantity:</label>
          <div class="flex items-center gap-2">
            <button type="button" class="btn btn-sm btn-outline" onclick="decrementQuantity('product-quantity')">-</button>
            <input type="number" id="product-quantity" value="1" min="1" max="${product.available_quantity || 1}" class="form-control" style="width: 80px; text-align: center;">
            <span class="text-sm text-gray-600">${product.unit_type || 'units'}</span>
            <button type="button" class="btn btn-sm btn-outline" onclick="incrementQuantity('product-quantity', ${product.available_quantity || 1})">+</button>
          </div>
        </div>
        
        <button id="add-to-cart-btn" class="btn btn-primary w-full" onclick="handleAddToCartFromModal('${product.id}')">
          <i class="bi bi-cart-plus"></i> Add to Cart
        </button>
      </div>
    `;
  } catch (error) {
    console.error('Error rendering product info:', error);
    container.innerHTML = `
      <div class="text-center p-8">
        <i class="bi bi-exclamation-triangle text-4xl text-warning mb-3"></i>
        <p class="text-gray-600">Failed to load product information</p>
      </div>
    `;
  }
};

// Render product info for dynamic modal (simpler version)
const renderProductInfoForDynamicModal = (product, container) => {
  if (!container) {
    console.error('Product info container not found');
    return;
  }
  
  try {
    container.innerHTML = `
      <div class="space-y-4">
        <!-- Product Image -->
        <div class="aspect-w-16 aspect-h-12 bg-gray-100 rounded-lg overflow-hidden">
          <img src="${product.photo_path || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22%3E%3Crect fill=%22%23f0f0f0%22 width=%22400%22 height=%22300%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2220%22 fill=%22%23999%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Image%3C/text%3E%3C/svg%3E'}" 
               alt="${product.name || 'Product'}" 
               class="w-full h-48 object-cover">
        </div>
        
        <!-- Product Info -->
        <div class="space-y-3">
          <div class="flex items-start justify-between">
            <h3 class="text-xl font-bold text-gray-900">${product.name || 'Unknown Product'}</h3>
            ${product.seller_verified ? '<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800"><i class="bi bi-patch-check-fill mr-1"></i> Verified</span>' : ''}
          </div>
          
          <p class="text-2xl font-bold text-primary">${formatCurrency(product.price_per_unit || 0)} <span class="text-lg font-normal text-gray-600">per ${product.unit_type || 'unit'}</span></p>
          
          ${product.description ? `<p class="text-gray-700">${product.description}</p>` : ''}
          
          <!-- Details Grid -->
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div class="flex items-center text-gray-600">
              <i class="bi bi-shop mr-2"></i>
              <span>${product.seller_name || 'Unknown Seller'}</span>
            </div>
            <div class="flex items-center text-gray-600">
              <i class="bi bi-geo-alt mr-2"></i>
              <span>${product.municipality || 'Unknown'}</span>
            </div>
            <div class="flex items-center text-gray-600">
              <i class="bi bi-box mr-2"></i>
              <span>${product.available_quantity || 0} ${product.unit_type || 'units'} available</span>
            </div>
            <div class="flex items-center text-gray-600">
              <i class="bi bi-tag mr-2"></i>
              <span>${product.category || 'Uncategorized'}</span>
            </div>
          </div>
          
          <!-- Add to Cart Section -->
          <div class="border-t pt-4">
            <div class="flex items-center gap-3 mb-3">
              <label class="font-medium">Quantity:</label>
              <div class="flex items-center gap-2">
                <button type="button" class="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center" onclick="decrementQuantity('dynamic-product-quantity')">-</button>
                <input type="number" id="dynamic-product-quantity" value="1" min="1" max="${product.available_quantity || 1}" class="w-16 px-2 py-1 border border-gray-300 rounded text-center">
                <button type="button" class="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center" onclick="incrementQuantity('dynamic-product-quantity', ${product.available_quantity || 1})">+</button>
                <span class="text-sm text-gray-600">${product.unit_type || 'units'}</span>
              </div>
            </div>
            
            <button class="btn btn-primary w-full" onclick="handleAddToCartFromDynamicModal('${product.id}')">
              <i class="bi bi-cart-plus"></i> Add to Cart
            </button>
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Error rendering product info for dynamic modal:', error);
    container.innerHTML = `
      <div class="text-center p-8">
        <i class="bi bi-exclamation-triangle text-4xl text-warning mb-3"></i>
        <p class="text-gray-600">Failed to load product information</p>
      </div>
    `;
  }
};

// Initialize map for dynamic product modal
const initDynamicProductMap = async (product) => {
  const mapContainer = document.getElementById('dynamic-product-map');
  if (!mapContainer || typeof L === 'undefined') return;
  
  try {
    // Get seller coordinates
    let sellerCoords = null;
    if (product.latitude && product.longitude) {
      sellerCoords = {
        lat: parseFloat(product.latitude),
        lng: parseFloat(product.longitude)
      };
    } else if (product.municipality && MUNICIPALITY_COORDINATES[product.municipality]) {
      sellerCoords = {
        lat: MUNICIPALITY_COORDINATES[product.municipality].latitude,
        lng: MUNICIPALITY_COORDINATES[product.municipality].longitude
      };
    }
    
    if (!sellerCoords) {
      console.warn('No coordinates available for product');
      mapContainer.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500"><i class="bi bi-geo-alt-fill mr-2"></i>Map not available</div>';
      return;
    }
    
    // Initialize map
    const map = L.map('dynamic-product-map').setView([sellerCoords.lat, sellerCoords.lng], 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    
    // Add seller marker
    const sellerIcon = L.divIcon({
      className: 'custom-marker seller-marker',
      html: '<div class="marker-pin seller-pin"><i class="bi bi-shop-window"></i></div>',
      iconSize: [30, 40],
      iconAnchor: [15, 40]
    });
    
    L.marker([sellerCoords.lat, sellerCoords.lng], { icon: sellerIcon })
      .addTo(map)
      .bindPopup(`<strong>${product.seller_name || 'Seller'}</strong><br>${product.municipality || 'Location'}`)
      .openPopup();
      
    // Update distance display
    const distanceEl = document.getElementById('dynamic-distance-display');
    if (distanceEl) {
      distanceEl.innerHTML = `<i class="bi bi-geo-alt"></i> ${product.municipality || 'Unknown Location'}`;
    }
    
  } catch (error) {
    console.error('Error initializing dynamic product map:', error);
    mapContainer.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500"><i class="bi bi-exclamation-triangle mr-2"></i>Map unavailable</div>';
  }
};

// Initialize product map in modal
const initProductMap = async (product) => {
  const mapContainer = document.getElementById('product-map');
  
  try {

    
    // Get seller coordinates (from product data or fallback to municipality)
    let sellerCoords = null;
    if (product.latitude && product.longitude) {
      sellerCoords = {
        lat: parseFloat(product.latitude),
        lng: parseFloat(product.longitude)
      };

    } else if (product.municipality && MUNICIPALITY_COORDINATES[product.municipality]) {
      sellerCoords = {
        lat: MUNICIPALITY_COORDINATES[product.municipality].latitude,
        lng: MUNICIPALITY_COORDINATES[product.municipality].longitude
      };

    } else {
      console.warn('No coordinates available for product or municipality:', product.municipality);
    }
    
    // Get user location
    await getUserLocation();

    
    // Default center (Manila area)
    let center = [14.6037, 121.3084];
    let zoom = 11;
    
    // Calculate center between user and seller if both available
    if (userLocation && sellerCoords) {
      const midLat = (userLocation.latitude + sellerCoords.lat) / 2;
      const midLng = (userLocation.longitude + sellerCoords.lng) / 2;
      center = [midLat, midLng];
      zoom = 12;

    } else if (sellerCoords) {
      center = [sellerCoords.lat, sellerCoords.lng];
      zoom = 13;

    } else if (userLocation) {
      center = [userLocation.latitude, userLocation.longitude];
      zoom = 13;

    }
    
    // Initialize map
    productDetailsMap = L.map('product-map').setView(center, zoom);
    
    // Add tile layer with error handling
    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18,
      errorTileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    }).addTo(productDetailsMap);
    
    // Suppress tile loading errors
    tileLayer.on('tileerror', function(error, tile) {
      // Silently handle tile errors
    });
    
    const markers = [];
    
    // Add seller marker with red icon
    if (sellerCoords) {
      const sellerIcon = L.divIcon({
        className: 'custom-marker seller-marker',
        html: '<div class="marker-pin seller-pin"><i class="bi bi-shop-window"></i></div>',
        iconSize: [30, 40],
        iconAnchor: [15, 40]
      });
      
      const sellerMarker = L.marker([sellerCoords.lat, sellerCoords.lng], { icon: sellerIcon })
        .addTo(productDetailsMap)
        .bindPopup(`
          <div class="p-3 min-w-48">
            <h4 class="font-bold text-lg text-red-600 mb-2">
              <i class="bi bi-shop-window"></i> ${product.seller_name || 'Seller'}
            </h4>
            <p class="text-sm mb-1"><i class="bi bi-box"></i> ${product.name}</p>
            <p class="text-sm mb-1"><i class="bi bi-geo-alt"></i> ${product.municipality}</p>
            <p class="text-sm text-gray-600">📍 Seller Location</p>
          </div>
        `);
      
      markers.push(sellerMarker);

    }
    
    // Add user marker with blue icon
    if (userLocation) {
      const userIcon = L.divIcon({
        className: 'custom-marker user-marker',
        html: '<div class="marker-pin user-pin"><i class="bi bi-person-fill"></i></div>',
        iconSize: [30, 40],
        iconAnchor: [15, 40]
      });
      
      const userMarker = L.marker([userLocation.latitude, userLocation.longitude], { icon: userIcon })
        .addTo(productDetailsMap)
        .bindPopup(`
          <div class="p-3 min-w-48">
            <h4 class="font-bold text-lg text-blue-600 mb-2">
              <i class="bi bi-person-fill"></i> Your Location
            </h4>
            <p class="text-sm mb-1"><i class="bi bi-geo-alt"></i> ${userLocation.address || 'Current Location'}</p>
            <p class="text-sm text-gray-600">📍 Buyer Location</p>
          </div>
        `);
      
      markers.push(userMarker);

      
      // Calculate and display distance if we have seller coordinates
      if (sellerCoords) {
        // Create a temporary product-like object with proper coordinates
        const productWithCoords = {
          ...product,
          latitude: sellerCoords.lat,
          longitude: sellerCoords.lng
        };
        calculateProductDistance(userLocation, productWithCoords);
      }
    }
    
    // Fit map to show both markers
    if (markers.length > 1) {
      const group = new L.featureGroup(markers);
      productDetailsMap.fitBounds(group.getBounds().pad(0.1), { maxZoom: 15 });

    } else if (markers.length === 1) {
      productDetailsMap.setView(markers[0].getLatLng(), 13);

    }
    
  } catch (error) {
    console.error('Error initializing product map:', error);
    mapContainer.innerHTML = `
      <div class="flex items-center justify-center h-full bg-gray-100">
        <div class="text-center">
          <i class="bi bi-geo-alt-fill text-4xl text-gray-400"></i>
          <p class="text-gray-500 mt-2">Map unavailable</p>
          <p class="text-xs text-gray-400 mt-1">${error.message}</p>
        </div>
      </div>
    `;
  }
};

const getUserLocation = async () => {
  if (userLocation) {

    return userLocation; // Already have location
  }
  

  
  try {
    // First try to get from user profile

    const profileResponse = await getProfile();
    if (profileResponse.success && profileResponse.data) {
      const { latitude, longitude, address, municipality } = profileResponse.data;
      
      if (latitude && longitude) {
        userLocation = {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          address: address || municipality || 'Profile Location'
        };

        return userLocation;
      }
      
      // If profile has municipality but no coordinates, use municipality coordinates
      if (municipality && MUNICIPALITY_COORDINATES[municipality]) {
        userLocation = {
          latitude: MUNICIPALITY_COORDINATES[municipality].latitude,
          longitude: MUNICIPALITY_COORDINATES[municipality].longitude,
          address: `${municipality}, Rizal`
        };

        return userLocation;
      }
    }
    

    
    // If not in profile, try browser geolocation
    if (navigator.geolocation) {
      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            userLocation = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              address: 'Current Location (GPS)'
            };

            resolve(userLocation);
          },
          (error) => {
            console.warn('Geolocation error:', error);
            // Use default location for Rizal province (center)
            userLocation = {
              latitude: 14.6037,
              longitude: 121.3084,
              address: 'Default Location (Manila Area)'
            };

            resolve(userLocation);
          },
          { 
            timeout: 8000, 
            enableHighAccuracy: false,
            maximumAge: 300000 // Cache for 5 minutes
          }
        );
      });
    }
    
    // Final fallback
    userLocation = {
      latitude: 14.6037,
      longitude: 121.3084,
      address: 'Default Location (Manila Area)'
    };

    return userLocation;
    
  } catch (error) {
    console.error('Error getting user location:', error);
    // Always return some location
    userLocation = {
      latitude: 14.6037,
      longitude: 121.3084,
      address: 'Default Location (Manila Area)'
    };

    return userLocation;
  }
};

const calculateProductDistance = async (userLoc, product) => {
  const distanceDisplay = document.getElementById('distance-display');
  
  try {
    distanceDisplay.innerHTML = '<i class="bi bi-geo-alt"></i> Calculating distance...';
    distanceDisplay.classList.add('loading');
    distanceDisplay.classList.remove('error');
    
    // Ensure we have valid coordinates
    if (!userLoc || !userLoc.latitude || !userLoc.longitude) {
      throw new Error('User location not available');
    }
    
    if (!product.latitude || !product.longitude) {
      throw new Error('Product location not available');
    }
    
    const response = await calculateDistance(
      userLoc.latitude,
      userLoc.longitude,
      parseFloat(product.latitude),
      parseFloat(product.longitude)
    );
    
 
    
    if (response && response.success && response.data && typeof response.data.distance_km === 'number') {
      const distanceKm = response.data.distance_km;
      const estimatedTime = Math.round(distanceKm * 3); 
      

      
      distanceDisplay.innerHTML = `
        <div>
          <div><i class="bi bi-geo-alt"></i> ${distanceKm.toFixed(1)} km away</div>
          <div class="text-sm mt-1"><i class="bi bi-clock"></i> ~${estimatedTime} mins travel</div>
        </div>
      `;
      distanceDisplay.classList.remove('loading');
      
      // Try to get and display route
      await displayRoute(userLoc, product, distanceKm);
      
    } else {
      console.warn('API response invalid, using fallback calculation:', response);
      throw new Error(response?.message || `Invalid API response: ${JSON.stringify(response)}`);
    }
    
  } catch (error) {
    console.error('Error calculating distance via API:', error);
    
    // Fallback: Calculate straight-line distance using Haversine formula
    try {

      
      if (!userLoc || !userLoc.latitude || !userLoc.longitude) {
        throw new Error('User location not available for fallback calculation');
      }
      
      if (!product.latitude || !product.longitude) {
        throw new Error('Product location not available for fallback calculation');
      }
      
      const fallbackDistance = haversineDistance(
        userLoc.latitude,
        userLoc.longitude,
        parseFloat(product.latitude),
        parseFloat(product.longitude)
      );
      
      const estimatedTime = Math.round(fallbackDistance * 4); // More conservative for straight-line
      

      
      distanceDisplay.innerHTML = `
        <div>
          <div><i class="bi bi-geo-alt"></i> ~${fallbackDistance.toFixed(1)} km away</div>
          <div class="text-sm mt-1"><i class="bi bi-clock"></i> ~${estimatedTime} mins travel</div>
          <div class="text-xs text-gray-300 mt-1">* Estimated straight-line distance</div>
        </div>
      `;
      distanceDisplay.classList.remove('loading');
      
      // Try to display a simple straight line route
      await displayStraightLineRoute(userLoc, product);
      
    } catch (fallbackError) {
      console.error('Fallback distance calculation also failed:', fallbackError);
      distanceDisplay.innerHTML = `
        <div>
          <div><i class="bi bi-exclamation-triangle"></i> Distance unavailable</div>
          <div class="text-xs text-gray-400 mt-1">Location data incomplete</div>
        </div>
      `;
      distanceDisplay.classList.remove('loading');
      distanceDisplay.classList.add('error');
    }
  }
};

// Simple straight-line route display
const displayStraightLineRoute = async (userLoc, product) => {
  try {
    if (!productDetailsMap) return;
    
    const routeCoordinates = [
      [userLoc.latitude, userLoc.longitude],
      [parseFloat(product.latitude), parseFloat(product.longitude)]
    ];
    
    const routeLine = L.polyline(routeCoordinates, {
      color: '#28a745',
      weight: 3,
      opacity: 0.7,
      dashArray: '10, 5'
    }).addTo(productDetailsMap);
    
    // Store route line for cleanup
    if (!productDetailsMap.routeLayers) {
      productDetailsMap.routeLayers = [];
    }
    productDetailsMap.routeLayers.push(routeLine);
    

  } catch (error) {
    console.warn('Could not display straight-line route:', error);
  }
};

// Haversine distance formula (fallback calculation)
const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const toRadians = (degrees) => degrees * (Math.PI / 180);

const displayRoute = async (userLoc, product, distance) => {
  try {
    // Only show route for reasonable distances (< 50km to avoid cluttering)
    if (distance > 50 || !productDetailsMap) return;
    
    const routeResponse = await getRoute(
      userLoc.latitude,
      userLoc.longitude,
      parseFloat(product.latitude),
      parseFloat(product.longitude)
    );
    

    
    if (routeResponse.success && routeResponse.data) {
      let routeCoordinates = [];
      
      // Check if we have geometry data
      if (routeResponse.data.geometry && routeResponse.data.geometry.coordinates) {
        // Handle GeoJSON LineString format from OSRM
        routeCoordinates = routeResponse.data.geometry.coordinates.map(coord => [coord[1], coord[0]]); // [lng, lat] -> [lat, lng]
      } else if (routeResponse.data.route && Array.isArray(routeResponse.data.route)) {
        // Handle array of lat/lng points (fallback format)
        routeCoordinates = routeResponse.data.route.map(point => [point.lat, point.lng]);
      } else {
        // Fallback: just draw straight line
        routeCoordinates = [
          [userLoc.latitude, userLoc.longitude],
          [parseFloat(product.latitude), parseFloat(product.longitude)]
        ];
      }
      
      // Add route line to map
      const routeLine = L.polyline(routeCoordinates, {
        color: '#28a745',
        weight: 4,
        opacity: 0.8,
        dashArray: '5, 10'
      }).addTo(productDetailsMap);
      
      // Store route line for cleanup
      if (!productDetailsMap.routeLayers) {
        productDetailsMap.routeLayers = [];
      }
      productDetailsMap.routeLayers.push(routeLine);
      
      // Update distance display with route info if available
      if (routeResponse.data.duration_minutes) {
        const distanceDisplay = document.getElementById('distance-display');
        distanceDisplay.innerHTML = `
          <div>
            <div><i class="bi bi-geo-alt"></i> ${distance.toFixed(1)} km away</div>
            <div class="text-sm mt-1"><i class="bi bi-clock"></i> ~${routeResponse.data.duration_minutes} mins by car</div>
            ${routeResponse.data.note ? '<div class="text-xs text-gray-300 mt-1">* Estimated based on straight-line distance</div>' : ''}
          </div>
        `;
      }
      
      // Fit map to route, but don't zoom in too much
      const bounds = routeLine.getBounds();
      productDetailsMap.fitBounds(bounds.pad(0.1), { maxZoom: 14 });
    }
  } catch (error) {
    console.warn('Could not display route:', error);
    // Route display is optional, don't show error to user
  }
};

const setupModalCloseHandlers = () => {
  try {
    const modal = document.getElementById('product-details-modal');
    const closeBtn = document.getElementById('close-product-modal');
    
    if (!modal || !closeBtn) {
      console.warn('Modal or close button not found, skipping close handlers setup');
      return;
    }
    
    // Close button handler
    closeBtn.onclick = closeProductDetailsModal;
    
    // Click outside modal to close
    modal.onclick = (e) => {
      if (e.target === modal) {
        closeProductDetailsModal();
      }
    };
    
    // ESC key to close
    const escKeyHandler = (e) => {
      if (e.key === 'Escape') {
        closeProductDetailsModal();
        document.removeEventListener('keydown', escKeyHandler);
      }
    };
    document.addEventListener('keydown', escKeyHandler);
  } catch (error) {
    console.error('Error setting up modal close handlers:', error);
  }
};

const closeProductDetailsModal = () => {
  try {
    const modal = document.getElementById('product-details-modal');
    if (!modal) {
      console.warn('Product details modal not found');
      return;
    }
    
    modal.classList.add('hidden');
    
    // Clean up map and route layers
    if (productDetailsMap) {
      // Clean up route layers
      if (productDetailsMap.routeLayers) {
        productDetailsMap.routeLayers.forEach(layer => {
          productDetailsMap.removeLayer(layer);
        });
        productDetailsMap.routeLayers = [];
      }
      
      productDetailsMap.remove();
      productDetailsMap = null;
    }
  } catch (error) {
    console.error('Error closing product details modal:', error);
  }
};

const handleAddToCart = async (product, quantity = 1) => {
  try {
    await addToCartService(product.id, quantity);
    showSuccess('Added to cart!');
    
    // Update cart count
    await updateCartUI();
    
    // Update cart store
    cartStore.add(product, quantity);
    
  } catch (error) {
    console.error('Error adding to cart:', error);
    showError(error.message || 'Failed to add to cart');
  }
};

// ============ Cart Management ============

const loadCart = async () => {
  const container = document.getElementById('cart-items');
  if (!container) return;
  
  showSpinner(container, 'md', 'primary', 'Loading cart...');
  
  try {
    const response = await getCart();
    currentCart = response.data?.cart || { items: [], total: 0 };
    
    renderCart();
    
  } catch (error) {
    console.error('Error loading cart:', error);
    showError('Failed to load cart');
  }
};

const renderCart = () => {
  const container = document.getElementById('cart-items');
  const subtotalEl = document.getElementById('cart-subtotal');
  const totalEl = document.getElementById('cart-total');
  
  if (!currentCart || currentCart.items.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12">
        <i class="bi bi-cart-x text-6xl text-gray-400"></i>
        <p class="text-gray-500 mt-4">Your cart is empty</p>
        <a href="#browse" class="btn btn-primary mt-4">
          <i class="bi bi-grid"></i> Browse Products
        </a>
      </div>
    `;
    subtotalEl.textContent = formatCurrency(0);
    totalEl.textContent = formatCurrency(0);
    attachCheckoutListener();
    return;
  }
  
  container.innerHTML = currentCart.items.map(item => `
    <div class="card" data-item-id="${item.id}">
      <div class="card-body">
        <div class="flex gap-4">
          <img src="${item.product?.photo_path || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22200%22%3E%3Crect fill=%22%23f0f0f0%22 width=%22300%22 height=%22200%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2220%22 fill=%22%23999%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Image%3C/text%3E%3C/svg%3E'}" 
               alt="${item.product?.name}"
               class="w-24 h-24 object-cover rounded-lg">
          
          <div class="flex-1">
            <h4 class="font-bold text-lg">${item.product?.name}</h4>
            <p class="text-gray-600 text-sm">${item.product?.seller?.user?.full_name}</p>
            <p class="text-primary font-bold mt-2">${formatCurrency(item.product?.price_per_unit)} per ${item.product?.unit_type}</p>
          </div>
          
          <div class="flex flex-col items-end gap-2">
            <div class="flex items-center gap-2">
              <button class="btn btn-sm btn-outline" onclick="window.updateCartQuantity('${item.id}', ${item.quantity - 1})">
                <i class="bi bi-dash"></i>
              </button>
              <input type="number" 
                     value="${item.quantity}" 
                     min="1" 
                     max="${item.product?.available_quantity}"
                     class="w-16 text-center form-control"
                     onchange="window.updateCartQuantity('${item.id}', this.value)">
              <button class="btn btn-sm btn-outline" onclick="window.updateCartQuantity('${item.id}', ${item.quantity + 1})">
                <i class="bi bi-plus"></i>
              </button>
            </div>
            
            <p class="text-lg font-bold">${formatCurrency(item.product?.price_per_unit * item.quantity)}</p>
            
            <button class="btn btn-sm btn-danger" onclick="window.removeCartItem('${item.id}')">
              <i class="bi bi-trash"></i> Remove
            </button>
          </div>
        </div>
      </div>
    </div>
  `).join('');
  
  // Calculate totals
  const subtotal = currentCart.items.reduce((sum, item) => {
    const itemTotal = (item.product?.price_per_unit || 0) * item.quantity;
    return sum + itemTotal;
  }, 0);
  
  subtotalEl.textContent = formatCurrency(subtotal);
  totalEl.textContent = formatCurrency(subtotal);
  
  // Attach checkout button listener
  attachCheckoutListener();
};

// Attach checkout button listener
const attachCheckoutListener = () => {
  const btnCheckout = document.getElementById('btn-checkout');
  if (!btnCheckout) return;
  
  // Remove old listeners by cloning
  const newBtn = btnCheckout.cloneNode(true);
  btnCheckout.parentNode.replaceChild(newBtn, btnCheckout);
  
  // Add new listener
  newBtn.addEventListener('click', handleCheckout);
};

const updateCartUI = async () => {
  try {
    const response = await getCartCount();
    const count = response.data?.count || 0;
    updateCartCount(count);
  } catch (error) {
    console.error('Error updating cart count:', error);
  }
};

// Global functions for cart operations
window.updateCartQuantity = async (itemId, quantity) => {
  quantity = parseInt(quantity);
  if (quantity < 1) return;
  
  try {
    await updateCartItem(itemId, quantity);
    await loadCart();
    showSuccess('Cart updated');
  } catch (error) {
    console.error('Error updating cart:', error);
    showError('Failed to update cart');
  }
};

window.removeCartItem = async (itemId) => {
  // Show confirmation modal instead of browser confirm
  const modalInstance = createModal({
    title: 'Remove Item',
    content: `
      <div class="space-y-4">
        <p class="text-gray-700">Are you sure you want to remove this item from your cart?</p>
      </div>
    `,
    footer: `
      <button class="btn btn-outline" data-dismiss-modal>Cancel</button>
      <button class="btn btn-danger" id="btn-confirm-remove">
        <i class="bi bi-trash"></i> Remove
      </button>
    `,
    size: 'sm'
  });
  
  // Cancel button handler
  const cancelBtn = modalInstance.modal.querySelector('[data-dismiss-modal]');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      modalInstance.close();
    });
  }
  
  const confirmBtn = document.getElementById('btn-confirm-remove');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Removing...';
      
      try {
        await removeFromCart(itemId);
        
        // Close modal first
        modalInstance.close();
        
        // Then reload cart and show success
        await loadCart();
        await updateCartUI();
        showSuccess('Item removed from cart');
      } catch (error) {
        console.error('Error removing item:', error);
        showError('Failed to remove item');
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<i class="bi bi-trash"></i> Remove';
      }
    });
  }
};

// ============ Checkout ============

const handleCheckout = async () => {
  if (!currentCart || currentCart.items.length === 0) {
    showError('Your cart is empty');
    return;
  }
  
  // Get unique sellers in cart
  const uniqueSellers = [...new Set(currentCart.items.map(item => item.seller_id))];
  
  if (uniqueSellers.length === 0) {
    showError('No items in cart');
    return;
  }
  
  // If only one seller, proceed directly
  if (uniqueSellers.length === 1) {
    const sellerItem = currentCart.items.find(item => item.seller_id === uniqueSellers[0]);
    const sellerName = sellerItem?.product?.seller?.user?.full_name || 'Unknown Seller';
    showCheckoutModal(uniqueSellers[0], sellerName);
    return;
  }
  
  // If multiple sellers, show selection modal
  const modalContent = `
    <div class="space-y-4">
      <p class="text-gray-700 font-semibold">Your cart contains items from multiple sellers.</p>
      <p class="text-sm text-gray-600">Please select a seller to place an order. You can place separate orders for items from other sellers.</p>
      <div id="seller-list" class="space-y-2">
        ${uniqueSellers.map(sellerId => {
          const sellerItem = currentCart.items.find(item => item.seller_id === sellerId);
          const sellerName = sellerItem?.product?.seller?.user?.full_name || 'Unknown Seller';
          const sellerItems = currentCart.items.filter(item => item.seller_id === sellerId);
          const subtotal = sellerItems.reduce((sum, item) => sum + ((item.product?.price_per_unit || 0) * item.quantity), 0);
          return `
            <div class="border rounded-lg p-4 cursor-pointer hover:bg-gray-50" onclick="window.selectSellerForCheckout('${sellerId}', '${sellerName}')">
              <div class="flex justify-between items-center">
                <div>
                  <p class="font-semibold">${sellerName}</p>
                  <p class="text-sm text-gray-600">${sellerItems.length} item${sellerItems.length !== 1 ? 's' : ''}</p>
                </div>
                <p class="font-bold text-primary">${formatCurrency(subtotal)}</p>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
  
  const footer = `
    <button class="btn btn-outline" onclick="document.querySelector('.modal-backdrop').remove()">Cancel</button>
  `;
  
  const modal = createModal({
    title: 'Select Seller',
    content: modalContent,
    footer: footer,
    size: 'md'
  });
};

window.selectSellerForCheckout = async (sellerId, sellerName) => {
  document.querySelector('.modal-backdrop').remove();
  showCheckoutModal(sellerId, sellerName);
};

const showCheckoutModal = (sellerId, sellerName) => {
  // Filter cart items for this seller
  const sellerItems = currentCart.items.filter(item => item.seller_id === sellerId);
  const subtotal = sellerItems.reduce((sum, item) => sum + ((item.product?.price_per_unit || 0) * item.quantity), 0);
  
  const modalContent = `
    <form id="checkout-form" class="space-y-4">
      <div class="alert alert-info">
        <p class="font-semibold">Order Summary</p>
        <p class="text-sm">${sellerItems.length} item${sellerItems.length !== 1 ? 's' : ''} from <strong>${sellerName}</strong></p>
        <p class="text-sm mt-2">Subtotal: ${formatCurrency(subtotal)}</p>
      </div>
      
      <div class="form-group">
        <label class="form-label">Delivery Option</label>
        <select id="delivery-option" class="form-select" required>
          <option value="pickup">Pickup from seller</option>
          <option value="drop-off">Drop-off delivery</option>
        </select>
      </div>
      
      <div class="form-group">
        <label class="form-label">Delivery Address</label>
        <textarea id="delivery-address" class="form-control" rows="3" required readonly></textarea>
        <small class="text-gray-500">Your address from profile</small>
      </div>
      
      <div class="form-group">
        <label class="form-label">Payment Method</label>
        <select id="payment-method" class="form-select" required>
          <option value="cod">Cash on Delivery</option>
        </select>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="form-group">
          <label class="form-label">Preferred Date (Optional)</label>
          <input type="date" id="preferred-date" class="form-control" min="${new Date().toISOString().split('T')[0]}">
          <small class="text-gray-500">When do you want to receive the order?</small>
        </div>
        
        <div class="form-group">
          <label class="form-label">Preferred Time (Optional)</label>
          <select id="preferred-time" class="form-select">
            <option value="">Any time</option>
            <option value="morning">Morning (8AM - 12PM)</option>
            <option value="afternoon">Afternoon (12PM - 5PM)</option>
            <option value="evening">Evening (5PM - 8PM)</option>
          </select>
        </div>
      </div>
      
      <div class="form-group">
        <label class="form-label">Notes (Optional)</label>
        <textarea id="order-notes" class="form-control" rows="2" placeholder="Special instructions for the seller..."></textarea>
      </div>
    </form>
  `;
  
  const footer = `
    <button class="btn btn-outline" onclick="this.closest('.modal-backdrop').remove()">Cancel</button>
    <button class="btn btn-primary" id="btn-place-order">
      <i class="bi bi-check-circle"></i> Place Order
    </button>
  `;
  
  const modal = createModal({
    title: 'Checkout',
    content: modalContent,
    footer: footer,
    size: 'md'
  });
  
  // Store user coordinates for order creation
  let userDeliveryCoordinates = { latitude: null, longitude: null };
  
  // Load and populate user's address from profile
  const loadUserAddress = async () => {
    try {
      const response = await getProfile();
      
      // Handle different response structures
      const userData = response?.data?.user || response?.user || response?.data || response;
      const addressField = document.getElementById('delivery-address');
      
      if (addressField && userData) {
        // For buyers, the address is stored in buyer_profile.delivery_address
        const fullAddress = userData.buyer_profile?.delivery_address || userData.delivery_address || userData.address || '';
        
        // Get coordinates from profile if available
        const profileLat = userData.buyer_profile?.delivery_latitude || userData.delivery_latitude || userData.latitude;
        const profileLng = userData.buyer_profile?.delivery_longitude || userData.delivery_longitude || userData.longitude;
        
        if (profileLat && profileLng) {
          // Use coordinates from profile
          userDeliveryCoordinates.latitude = parseFloat(profileLat);
          userDeliveryCoordinates.longitude = parseFloat(profileLng);
          console.log('Using coordinates from profile:', userDeliveryCoordinates);
        } else if (fullAddress) {
          // Try to geocode the address to get coordinates
          console.log('Geocoding address:', fullAddress);
          const geocodeResult = await geocodeAddress(fullAddress);
          
          if (geocodeResult.success && geocodeResult.data) {
            userDeliveryCoordinates.latitude = geocodeResult.data.latitude;
            userDeliveryCoordinates.longitude = geocodeResult.data.longitude;
            console.log('Geocoded coordinates:', userDeliveryCoordinates);
          } else {
            console.warn('Could not geocode address:', geocodeResult.message);
          }
        }
        
        // Set the address and disable the field
        addressField.value = fullAddress || 'No address found in profile';
        addressField.readOnly = true;
      }
    } catch (error) {
      console.warn('Could not load user profile address:', error);
      const addressField = document.getElementById('delivery-address');
      if (addressField) {
        addressField.value = 'Error loading address. Please update your profile.';
        addressField.readOnly = true;
      }
    }
  };
  
  // Load address when modal is ready
  loadUserAddress();
  
  const btnPlaceOrder = document.getElementById('btn-place-order');
  btnPlaceOrder.addEventListener('click', async () => {
    const form = document.getElementById('checkout-form');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    
    // Get preferred time value
    const preferredTimeValue = document.getElementById('preferred-time').value;
    
    const orderData = {
      seller_id: sellerId,
      delivery_option: document.getElementById('delivery-option').value,
      delivery_address: document.getElementById('delivery-address').value,
      delivery_latitude: userDeliveryCoordinates.latitude,
      delivery_longitude: userDeliveryCoordinates.longitude,
      preferred_date: document.getElementById('preferred-date').value || null,
      preferred_time: preferredTimeValue || null,
      order_notes: document.getElementById('order-notes').value || null
    };
    
    console.log('Order data being sent:', orderData);
    
    try {
      btnPlaceOrder.disabled = true;
      btnPlaceOrder.innerHTML = '<i class="bi bi-hourglass-split"></i> Processing...';
      
      const response = await createOrder(orderData);
      
      if (response.success) {
        // Close modal using the modal's close method
        modal.close();
        
        // Show success message
        showSuccess('Order placed successfully!');
        
        // Reload cart and navigate to orders (don't await to avoid blocking)
        loadCart().then(() => updateCartUI()).catch(err => console.error('Error refreshing cart:', err));
        
        // Navigate to orders page
        setTimeout(() => {
          window.location.hash = 'orders';
        }, 300);
      } else {
        throw new Error(response.message || 'Failed to place order');
      }
    } catch (error) {
      console.error('Error placing order:', error);
      showError(error.message || 'Failed to place order');
      btnPlaceOrder.disabled = false;
      btnPlaceOrder.innerHTML = '<i class="bi bi-check-circle"></i> Place Order';
    }
  });
};

// ============ Orders Management ============

const loadOrders = async () => {
  const container = document.getElementById('orders-list');
  if (!container) return;
  
  // Update active filter button state
  document.querySelectorAll('.order-filter').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.status === orderFilters.status || (btn.dataset.status === 'all' && !orderFilters.status)) {
      btn.classList.add('active');
    }
  });
  
  showSpinner(container, 'md', 'primary', 'Loading orders...');
  
  try {
    // Don't send status if it's 'all' - backend doesn't accept it
    const filters = { ...orderFilters };
    if (filters.status === 'all') {
      delete filters.status;
    }
    
    const response = await getOrders(filters);
    currentOrders = response.data?.orders || [];
    
    if (currentOrders.length === 0) {
      // Dynamic empty state message based on filter
      let emptyMessage = 'No orders yet';
      if (orderFilters.status === 'pending') {
        emptyMessage = 'No pending orders yet';
      } else if (orderFilters.status === 'confirmed') {
        emptyMessage = 'No confirmed orders yet';
      } else if (orderFilters.status === 'ready') {
        emptyMessage = 'No ready orders yet';
      } else if (orderFilters.status === 'completed') {
        emptyMessage = 'No completed orders yet';
      } else if (orderFilters.status === 'cancelled') {
        emptyMessage = 'No cancelled orders yet';
      }
      
      container.innerHTML = `
        <div class="text-center py-12">
          <i class="bi bi-inbox text-6xl text-gray-400"></i>
          <p class="text-gray-500 mt-4">${emptyMessage}</p>
          ${orderFilters.status !== 'all' ? '<a href="#orders" class="btn btn-primary mt-4 onclick-filter">View All Orders</a>' : '<a href="#browse" class="btn btn-primary mt-4">Start Shopping</a>'}
        </div>
      `;
      // Still attach filter listeners even if no orders
      attachOrderFilterListeners();
      return;
    }
    
    container.innerHTML = currentOrders.map(order => createOrderCard(order)).join('');
    
    // Attach filter listeners after rendering
    attachOrderFilterListeners();
    
  } catch (error) {
    console.error('Error loading orders:', error);
    showError('Failed to load orders');
  }
};

const createOrderCard = (order) => {
  const statusColors = {
    pending: 'warning',
    confirmed: 'info',
    ready: 'primary',
    completed: 'success',
    cancelled: 'danger'
  };
  
  const statusColor = statusColors[order.status] || 'secondary';
  const sellerName = order.seller?.user?.full_name || 'Seller';
  const isCompleted = order.status === 'completed';
  const hasRating = order.buyer_rating && order.buyer_rating > 0;
  
  // Debug log for completed orders
  if (isCompleted) {
    console.log('Completed Order:', order.order_number, {
      status: order.status,
      buyer_rating: order.buyer_rating,
      hasRating: hasRating
    });
  }
  
  return `
    <div class="card" data-order-id="${order.id}">
      <div class="card-body">
        <div class="flex justify-between items-start mb-4">
          <div>
            <h4 class="font-bold text-lg">Order #${order.order_number}</h4>
            <p class="text-sm text-gray-600">${formatRelativeTime(order.created_at)}</p>
          </div>
          <span class="badge badge-${statusColor}">${order.status.toUpperCase()}</span>
        </div>
        
        <div class="mb-4">
          <p class="text-sm text-gray-600 mb-2">
            <i class="bi bi-shop"></i> ${sellerName}
          </p>
          <p class="text-sm text-gray-600">
            <i class="bi bi-box"></i> ${order.items?.length || 0} items • ${formatCurrency(order.total_amount)}
          </p>
          ${order.preferred_date ? `
            <p class="text-sm text-primary mt-1">
              <i class="bi bi-calendar-check"></i> Preferred: ${new Date(order.preferred_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}${order.preferred_time ? ` • ${order.preferred_time}` : ''}
            </p>
          ` : ''}
        </div>
        
        ${order.seller_delivery_proof_url ? `
          <div class="mb-4 p-3 bg-green-50 rounded-lg border border-green-200">
            <p class="text-sm font-semibold mb-2 text-green-800">
              <i class="bi bi-check-circle-fill"></i> Seller's Delivery Proof
            </p>
            <img src="${getDeliveryProofUrl(order.seller_delivery_proof_url)}" 
                 alt="Delivery Proof" 
                 class="w-full max-w-xs h-48 object-cover rounded-lg border cursor-pointer"
                 onclick="window.open('${getDeliveryProofUrl(order.seller_delivery_proof_url)}', '_blank')">
            <p class="text-xs text-gray-600 mt-1">Click to view full size - Proof that order is ready/delivered</p>
          </div>
        ` : ''}
        
        ${order.buyer_delivery_proof_url ? `
          <div class="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p class="text-sm font-semibold mb-2 text-blue-800">
              <i class="bi bi-check-circle-fill"></i> Your Receipt Confirmation
            </p>
            <img src="${getDeliveryProofUrl(order.buyer_delivery_proof_url)}" 
                 alt="Receipt Proof" 
                 class="w-full max-w-xs h-48 object-cover rounded-lg border cursor-pointer"
                 onclick="window.open('${getDeliveryProofUrl(order.buyer_delivery_proof_url)}', '_blank')">
            <p class="text-xs text-gray-600 mt-1">Click to view full size</p>
          </div>
        ` : ''}
        
        <div class="flex gap-2 flex-wrap">
          <button class="btn btn-sm btn-outline" onclick="window.viewOrderDetails('${order.id}')">
            <i class="bi bi-eye"></i> View Details
          </button>
          ${order.status !== 'cancelled' && order.status !== 'completed' ? `
            <button class="btn btn-sm btn-primary" onclick="window.openOrderChat('${order.id}')">
              <i class="bi bi-chat"></i> Message Seller
            </button>
          ` : ''}
          ${order.status === 'pending' ? `
            <button class="btn btn-sm btn-danger" onclick="window.cancelOrder('${order.id}')">
              <i class="bi bi-x-circle"></i> Cancel
            </button>
          ` : ''}
          ${order.status === 'ready' && !order.buyer_confirmed ? `
            <button class="btn btn-sm btn-success" onclick="window.confirmOrderReceived('${order.id}')">
              <i class="bi bi-check-circle"></i> Confirm Received
            </button>
          ` : ''}
          ${order.status === 'ready' && order.buyer_confirmed && !order.seller_confirmed ? `
            <div class="btn btn-sm btn-outline cursor-default">
              <i class="bi bi-hourglass-split"></i> Waiting for Seller Confirmation
            </div>
          ` : ''}
          ${isCompleted ? `
            <div class="btn btn-sm btn-success cursor-default">
              <i class="bi bi-check-circle-fill"></i> Order Completed
            </div>
          ` : ''}
          ${isCompleted && !hasRating ? `
            <button class="btn btn-sm btn-warning" onclick="window.rateOrderModal('${order.id}', '${order.order_number}', '${sellerName.replace(/'/g, "\\'")}')">
              <i class="bi bi-star"></i> Rate Order
            </button>
          ` : ''}
          ${isCompleted && hasRating ? `
            <div class="btn btn-sm btn-outline cursor-default">
              <i class="bi bi-star-fill text-warning"></i> Rated ${order.buyer_rating}/5
            </div>
          ` : ''}
          ${isCompleted ? `
            <button class="btn btn-sm btn-danger" onclick="window.reportOrderIssue('${order.id}', '${order.order_number}')">
              <i class="bi bi-flag"></i> Report Issue
            </button>
          ` : ''}
        </div>
      </div>
    </div>
  `;
};

window.viewOrderDetails = async (orderId) => {
  try {
    const response = await getOrderById(orderId);
    const order = response.data?.order;
    
    if (!order) {
      showError('Order not found');
      return;
    }
    
    const modalContent = `
      <div class="space-y-4">
        <div class="flex justify-between items-center">
          <h3 class="text-xl font-bold">Order #${order.order_number}</h3>
          <span class="badge badge-${order.status === 'completed' ? 'success' : 'warning'}">
            ${order.status.toUpperCase()}
          </span>
        </div>
        
        <div class="border-t pt-4">
          <h4 class="font-semibold mb-2">Seller Information</h4>
          <p class="text-sm"><i class="bi bi-shop"></i> ${order.seller?.user?.full_name || 'Unknown Seller'}</p>
          <p class="text-sm"><i class="bi bi-geo-alt"></i> ${order.seller?.municipality || 'Not provided'}</p>
          ${order.seller?.rating && order.seller.rating > 0 ? `
            <div class="flex items-center gap-2 mt-2">
              <div class="flex gap-1 text-warning text-sm">
                ${[1,2,3,4,5].map(star => 
                  `<i class="bi bi-star${star <= Math.round(order.seller.rating) ? '-fill' : ''}"></i>`
                ).join('')}
              </div>
              <span class="text-sm font-semibold">${order.seller.rating.toFixed(1)} / 5.0</span>
              <button class="btn btn-sm btn-outline text-xs" onclick="window.viewSellerReviews('${order.seller.id}', '${order.seller.user.full_name}')">
                View Reviews
              </button>
            </div>
          ` : ''}
        </div>
        
        <div class="border-t pt-4">
          <h4 class="font-semibold mb-2">Order Items</h4>
          <div class="space-y-2">
            ${order.items.map(item => `
              <div class="flex justify-between text-sm">
                <span>${item.product_name} (${item.quantity} ${item.unit_type})</span>
                <span class="font-semibold">${formatCurrency(item.subtotal)}</span>
              </div>
            `).join('')}
          </div>
        </div>
        
        <div class="border-t pt-4">
          <div class="flex justify-between font-bold text-lg">
            <span>Total</span>
            <span class="text-primary">${formatCurrency(order.total_amount)}</span>
          </div>
        </div>
        
        <div class="border-t pt-4">
          <h4 class="font-semibold mb-2">Delivery Details</h4>
          <p class="text-sm"><strong>Option:</strong> ${order.delivery_option}</p>
          <p class="text-sm"><strong>Address:</strong> ${order.delivery_address}</p>
          ${order.preferred_date ? `<p class="text-sm"><strong>Preferred Date:</strong> ${new Date(order.preferred_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</p>` : ''}
          ${order.preferred_time ? `<p class="text-sm"><strong>Preferred Time:</strong> ${order.preferred_time.charAt(0).toUpperCase() + order.preferred_time.slice(1)}</p>` : ''}
          <p class="text-sm"><strong>Payment:</strong> ${order.payment_method}</p>
          ${order.order_notes ? `<p class="text-sm mt-2"><strong>Notes:</strong> ${order.order_notes}</p>` : ''}
        </div>

        ${order.buyer_rating ? `
          <div class="border-t pt-4">
            <h4 class="font-semibold mb-2">
              <i class="bi bi-star-fill text-warning"></i> Your Rating
            </h4>
            <div class="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
              <div class="flex items-center gap-2 mb-2">
                <div class="flex gap-1 text-warning">
                  ${[1,2,3,4,5].map(star => 
                    `<i class="bi bi-star${star <= order.buyer_rating ? '-fill' : ''}"></i>`
                  ).join('')}
                </div>
                <span class="font-semibold">${order.buyer_rating}/5</span>
              </div>
              ${order.buyer_rating_comment ? `
                <p class="text-sm text-gray-700 italic">"${order.buyer_rating_comment}"</p>
              ` : ''}
              <p class="text-xs text-gray-600 mt-2">
                Rated on ${new Date(order.buyer_rated_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>
        ` : ''}

        ${order.seller_delivery_proof_url ? `
          <div class="border-t pt-4">
            <h4 class="font-semibold mb-2">
              <i class="bi bi-image"></i> Seller's Delivery Proof
            </h4>
            <div class="bg-blue-50 p-3 rounded-lg border border-blue-200">
              <img src="${getDeliveryProofUrl(order.seller_delivery_proof_url)}" 
                   alt="Seller Delivery Proof" 
                   class="w-full h-64 object-cover rounded-lg border cursor-pointer"
                   onclick="window.open('${getDeliveryProofUrl(order.seller_delivery_proof_url)}', '_blank')">
              <p class="text-xs text-gray-600 mt-2">
                <i class="bi bi-info-circle"></i> Click to view full size
              </p>
            </div>
          </div>
        ` : ''}

        ${order.buyer_delivery_proof_url ? `
          <div class="border-t pt-4">
            <h4 class="font-semibold mb-2">
              <i class="bi bi-image"></i> Your Receipt Proof
            </h4>
            <div class="bg-green-50 p-3 rounded-lg border border-green-200">
              <img src="${getDeliveryProofUrl(order.buyer_delivery_proof_url)}" 
                   alt="Buyer Receipt Proof" 
                   class="w-full h-64 object-cover rounded-lg border cursor-pointer"
                   onclick="window.open('${getDeliveryProofUrl(order.buyer_delivery_proof_url)}', '_blank')">
              <p class="text-xs text-gray-600 mt-2">
                <i class="bi bi-info-circle"></i> Click to view full size
              </p>
            </div>
          </div>
        ` : ''}
      </div>
    `;
    
    createModal({
      title: 'Order Details',
      content: modalContent,
      size: 'md'
    });
    
  } catch (error) {
    console.error('Error loading order details:', error);
    showError(error.message || 'Failed to load order details');
  }
};

window.cancelOrder = async (orderId) => {
  const modalContent = `
    <div class="space-y-4">
      <p class="text-gray-700 mb-4">Please provide a reason for cancellation:</p>
      <textarea id="cancel-reason" class="form-control" rows="3" placeholder="Enter cancellation reason..." required></textarea>
    </div>
  `;
  
  const footer = `
    <button class="btn btn-outline" onclick="document.querySelector('.modal-backdrop').remove()">Cancel</button>
    <button class="btn btn-danger" id="btn-confirm-cancel">
      <i class="bi bi-x-circle"></i> Cancel Order
    </button>
  `;
  
  const modal = createModal({
    title: 'Cancel Order',
    content: modalContent,
    footer: footer,
    size: 'sm'
  });
  
  const confirmBtn = document.getElementById('btn-confirm-cancel');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      const reason = document.getElementById('cancel-reason').value.trim();
      if (!reason) {
        showError('Please provide a reason for cancellation');
        return;
      }
      
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Cancelling...';
      
      try {
        await cancelOrder(orderId, reason);
        
        // Close modal immediately after success
        modal.close();
        
        // Show success message
        showSuccess('Order cancelled successfully');
        
        // Reload orders (don't await to avoid blocking)
        loadOrders().catch(err => console.error('Error reloading orders:', err));
      } catch (error) {
        console.error('Error cancelling order:', error);
        const errorMsg = error?.message || 'Failed to cancel order';
        showError(errorMsg);
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<i class="bi bi-x-circle"></i> Cancel Order';
      }
    });
  }
};

window.confirmOrderReceived = async (orderId) => {
  try {
    // Fetch fresh order data to get latest delivery proof
    const response = await getOrderById(orderId);
    const order = response.data?.order;
    
    if (!order) {
      showError('Order not found');
      return;
    }

    // Show confirmation modal with seller's delivery proof
    const modal = createModal({
      title: '✓ Confirm Order Received',
      content: `
        <div class="space-y-4">
          <p class="text-gray-700">Have you received this order?</p>
          
          <div class="bg-green-50 border border-green-200 rounded-lg p-4">
            <p class="text-sm text-gray-600">Order #${order.order_number}</p>
            <p class="font-bold text-lg mt-1">${formatCurrency(order.total_amount)}</p>
            <p class="text-sm text-gray-600 mt-2">
              ${order.items?.length || 0} item(s) from ${order.seller?.user?.full_name || 'Unknown Seller'}
            </p>
          </div>
          
          ${order.seller_delivery_proof_url ? `
            <div class="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p class="text-sm font-semibold mb-2 text-blue-800">
                <i class="bi bi-image"></i> Seller's Delivery Proof:
              </p>
              <img src="${getDeliveryProofUrl(order.seller_delivery_proof_url)}" 
                   alt="Delivery Proof" 
                   class="w-full h-56 object-cover rounded-lg border cursor-pointer"
                   onclick="window.open('${getDeliveryProofUrl(order.seller_delivery_proof_url)}', '_blank')">
              <p class="text-xs text-gray-600 mt-1"><i class="bi bi-info-circle"></i> Click image to view full size - Verify this matches what you received</p>
            </div>
          ` : `
            <div class="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <p class="text-sm text-yellow-800">
                <i class="bi bi-exclamation-triangle"></i> Seller has not uploaded delivery proof yet.
              </p>
            </div>
          `}
          
          <div class="form-group">
            <label class="form-label">
              <i class="bi bi-camera" style="margin-right: 4px;"></i>
              Upload Your Receipt Confirmation (Image) <span class="text-info">(Optional)</span>
            </label>
            <input type="file" id="receipt-proof" class="form-control" 
                   accept="image/jpeg,image/jpg,image/png">
            <p class="text-sm text-gray-600 mt-1">
              <i class="bi bi-info-circle"></i> Attach proof that you received the items (optional but recommended)
            </p>
            <div id="image-preview-receipt" class="mt-2"></div>
          </div>
          
          <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p class="text-sm text-yellow-800">
              <i class="bi bi-info-circle"></i> <strong>Note:</strong> Once confirmed, the seller will also need to confirm to complete the order.
            </p>
          </div>
        </div>
      `,
      footer: `
        <button class="btn btn-outline" onclick="this.closest('.modal-backdrop').remove()">Cancel</button>
        <button class="btn btn-success" id="btn-confirm-received">
          <i class="bi bi-check-circle"></i> Confirm Received
        </button>
      `,
      size: 'md'
    });
    
    // Handle image preview
    const fileInput = document.getElementById('receipt-proof');
    const imagePreview = document.getElementById('image-preview-receipt');
    
    if (fileInput && imagePreview) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            imagePreview.innerHTML = `
              <img src="${event.target.result}" alt="Preview" class="w-full h-40 object-cover rounded-lg border border-gray-300">
            `;
          };
          reader.readAsDataURL(file);
        }
      });
    }
    
    const btnConfirm = document.getElementById('btn-confirm-received');
    btnConfirm.addEventListener('click', async () => {
      const file = fileInput?.files[0];
      
      try {
        btnConfirm.disabled = true;
        btnConfirm.innerHTML = '<i class="bi bi-hourglass-split"></i> Confirming...';
        
        await confirmOrder(orderId, file);
        
        // Close modal using the modal's close method
        modal.close();
        
        // Show success message
        showSuccess('Order confirmed! Waiting for seller confirmation.');
        
        // Reload orders to get updated status
        await loadOrders();
      } catch (error) {
        console.error('Error confirming order:', error);
        showError(error.message || 'Failed to confirm order');
        btnConfirm.disabled = false;
        btnConfirm.innerHTML = '<i class="bi bi-check-circle"></i> Confirm Received';
      }
    });
  } catch (error) {
    console.error('Error loading order details:', error);
    showError('Failed to load order details');
  }
};

// Rate order modal - Rate individual products
window.rateOrderModal = async (orderId, orderNumber, sellerName) => {
  try {
    // Fetch order details to get products
    const response = await getOrderById(orderId);
    const order = response.data?.order;
    
    if (!order || !order.items || order.items.length === 0) {
      showError('Order details not found');
      return;
    }
    
    const items = order.items;
    const productRatings = {};
    
    // Create rating UI for each product
    const productsHTML = items.map((item, index) => `
      <div class="border border-gray-200 rounded-lg p-4 mb-3" data-product-id="${item.product_id}">
        <div class="flex justify-between items-start mb-2">
          <div>
            <h4 class="font-semibold">${item.product_name}</h4>
            <p class="text-sm text-gray-600">${item.quantity} ${item.unit_type} • ${formatCurrency(item.subtotal)}</p>
          </div>
        </div>
        
        <div class="mt-3">
          <label class="form-label text-sm">Rating for this product:</label>
          <div class="flex gap-2 text-2xl rating-stars" data-product-index="${index}">
            <i class="bi bi-star cursor-pointer hover:text-warning transition-colors" data-rating="1"></i>
            <i class="bi bi-star cursor-pointer hover:text-warning transition-colors" data-rating="2"></i>
            <i class="bi bi-star cursor-pointer hover:text-warning transition-colors" data-rating="3"></i>
            <i class="bi bi-star cursor-pointer hover:text-warning transition-colors" data-rating="4"></i>
            <i class="bi bi-star cursor-pointer hover:text-warning transition-colors" data-rating="5"></i>
          </div>
          <p class="text-sm text-gray-600 mt-1 rating-text-${index}">Select a rating</p>
          
          <textarea class="form-control mt-2 product-comment" data-product-index="${index}" 
                    rows="2" placeholder="Comment (optional)..."></textarea>
        </div>
      </div>
    `).join('');
    
    const modal = createModal({
      title: `⭐ Rate Products from Order #${orderNumber}`,
      content: `
        <div class="space-y-4">
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p class="text-sm text-blue-800">
              <i class="bi bi-info-circle"></i> Rate each product individually to help other buyers
            </p>
          </div>
          <div class="max-h-96 overflow-y-auto">
            ${productsHTML}
          </div>
        </div>
      `,
      footer: `
        <button class="btn btn-outline" onclick="this.closest('.modal-backdrop').remove()">Cancel</button>
        <button class="btn btn-primary" id="btn-submit-rating" disabled>
          <i class="bi bi-star"></i> Submit Reviews
        </button>
      `,
      size: 'lg'
    });
    
    const btnSubmit = document.getElementById('btn-submit-rating');
    const ratingLabels = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];
    
    // Setup rating for each product
    items.forEach((item, index) => {
      const container = document.querySelector(`[data-product-index="${index}"]`);
      if (!container) return;
      
      const stars = container.querySelectorAll('i');
      const ratingText = document.querySelector(`.rating-text-${index}`);
      
      let selectedRating = 0;
      
      stars.forEach(star => {
        star.addEventListener('click', () => {
          selectedRating = parseInt(star.dataset.rating);
          productRatings[item.product_id] = selectedRating;
          
          // Update stars
          stars.forEach((s, i) => {
            if (i < selectedRating) {
              s.classList.remove('bi-star');
              s.classList.add('bi-star-fill', 'text-warning');
            } else {
              s.classList.remove('bi-star-fill', 'text-warning');
              s.classList.add('bi-star');
            }
          });
          
          ratingText.textContent = `${ratingLabels[selectedRating]} (${selectedRating}/5)`;
          
          // Enable submit if at least one product rated
          btnSubmit.disabled = Object.keys(productRatings).length === 0;
        });
        
        // Hover effects
        star.addEventListener('mouseenter', () => {
          const rating = parseInt(star.dataset.rating);
          stars.forEach((s, i) => {
            if (i < rating) s.classList.add('text-warning');
          });
        });
        
        star.addEventListener('mouseleave', () => {
          stars.forEach((s, i) => {
            if (i >= selectedRating) s.classList.remove('text-warning');
          });
        });
      });
    });
    
    // Handle submit
    btnSubmit.addEventListener('click', async () => {
      if (Object.keys(productRatings).length === 0) {
        showError('Please rate at least one product');
        return;
      }
      
      try {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="bi bi-hourglass-split"></i> Submitting...';
        
        // Build reviews array
        const reviews = Object.entries(productRatings).map(([productId, rating]) => {
          const commentBox = document.querySelector(`.product-comment[data-product-index]`);
          const productIndex = items.findIndex(item => item.product_id === productId);
          const comment = document.querySelector(`.product-comment[data-product-index="${productIndex}"]`)?.value || '';
          
          return {
            product_id: productId,
            rating: rating,
            comment: comment.trim()
          };
        });
        
        await rateOrder(orderId, reviews);
        
        showSuccess('Reviews submitted successfully!');
        closeModal();
        
        // Reload orders
        await loadOrders();
        
      } catch (error) {
        console.error('Error submitting rating:', error);
        showError(error.message || 'Failed to submit reviews');
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<i class="bi bi-star"></i> Submit Reviews';
      }
    });
    
  } catch (error) {
    console.error('Error loading order for rating:', error);
    showError('Failed to load order details');
  }
};

// View seller reviews
window.viewSellerReviews = async (sellerId, sellerName) => {
  try {
    const token = getToken();
    const response = await fetch(`/api/products/seller/${sellerId}/reviews?limit=50`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    const data = await response.json();
    
    if (!data.success) {
      showError(data.message || 'Failed to load reviews');
      return;
    }
    
    const reviews = data.data?.reviews || [];
    
    const reviewsHTML = reviews.length > 0 ? reviews.map(review => `
      <div class="border border-gray-200 rounded-lg p-4 mb-3">
        <div class="flex justify-between items-start mb-2">
          <div>
            <div class="flex items-center gap-2">
              <span class="font-semibold">${review.buyer_name || 'Anonymous'}</span>
              <div class="flex gap-1 text-warning text-sm">
                ${[1,2,3,4,5].map(star => 
                  `<i class="bi bi-star${star <= review.rating ? '-fill' : ''}"></i>`
                ).join('')}
              </div>
            </div>
            <p class="text-xs text-gray-500">${formatRelativeTime(review.created_at)}</p>
          </div>
        </div>
        
        ${review.product_name ? `
          <div class="flex items-center gap-2 mb-2 text-sm text-gray-600">
            <i class="bi bi-box"></i>
            <span>${review.product_name}</span>
          </div>
        ` : ''}
        
        ${review.comment ? `
          <p class="text-sm text-gray-700 mt-2">"${review.comment}"</p>
        ` : ''}
      </div>
    `).join('') : `
      <div class="text-center py-8 text-gray-500">
        <i class="bi bi-chat-quote text-4xl mb-2"></i>
        <p>No reviews yet</p>
      </div>
    `;
    
    createModal({
      title: `Reviews for ${sellerName}`,
      content: `
        <div class="space-y-4">
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p class="text-sm text-blue-800">
              <i class="bi bi-info-circle"></i> ${reviews.length} review(s) from verified buyers
            </p>
          </div>
          <div class="max-h-96 overflow-y-auto">
            ${reviewsHTML}
          </div>
        </div>
      `,
      size: 'lg',
      footer: '<button class="btn btn-secondary" data-modal-close>Close</button>'
    });
    
  } catch (error) {
    console.error('Error loading reviews:', error);
    showError('Failed to load reviews');
  }
};

// Report issue for completed order
window.reportOrderIssue = (orderId, orderNumber) => {
  openIssueModal(orderId, orderNumber);
};

// ============ My Issues Management ============

const loadMyIssues = async () => {
  const container = document.getElementById('issues-list');
  if (!container) return;
  
  // Update active filter button state
  document.querySelectorAll('.issue-filter').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.status === issueFilters.status || (btn.dataset.status === 'all' && !issueFilters.status)) {
      btn.classList.add('active');
    }
  });
  
  showSpinner(container, 'md', 'primary', 'Loading issues...');
  
  try {
    const response = await getMyIssues();
    let issues = response.data?.issues || [];
    
    // Filter by status if not 'all'
    if (issueFilters.status && issueFilters.status !== 'all') {
      issues = issues.filter(issue => issue.status === issueFilters.status);
    }
    
    currentIssues = issues;
    
    if (currentIssues.length === 0) {
      let emptyMessage = 'No issues reported';
      if (issueFilters.status === 'under_review') {
        emptyMessage = 'No issues under review';
      } else if (issueFilters.status === 'resolved') {
        emptyMessage = 'No resolved issues';
      } else if (issueFilters.status === 'rejected') {
        emptyMessage = 'No rejected issues';
      }
      
      container.innerHTML = `
        <div class="text-center py-12">
          <i class="bi bi-flag text-6xl text-gray-400"></i>
          <p class="text-gray-500 mt-4">${emptyMessage}</p>
          ${issueFilters.status !== 'all' ? '<button class="btn btn-primary mt-4" onclick="document.querySelector(\'.issue-filter[data-status=\\\"all\\\"]\').click()">View All Issues</button>' : '<a href="#orders" class="btn btn-primary mt-4">View Orders</a>'}
        </div>
      `;
      attachIssueFilterListeners();
      return;
    }
    
    container.innerHTML = currentIssues.map(issue => createIssueCard(issue)).join('');
    attachIssueFilterListeners();
  } catch (error) {
    console.error('Error loading issues:', error);
    container.innerHTML = `
      <div class="text-center py-12">
        <i class="bi bi-exclamation-circle text-6xl text-red-400"></i>
        <p class="text-red-500 mt-4">Failed to load issues</p>
        <button class="btn btn-primary mt-4" onclick="window.location.reload()">Retry</button>
      </div>
    `;
  }
};

const createIssueCard = (issue) => {
  const statusColors = {
    under_review: 'warning',
    resolved: 'success',
    rejected: 'danger'
  };
  
  const statusIcons = {
    under_review: 'hourglass-split',
    resolved: 'check-circle-fill',
    rejected: 'x-circle-fill'
  };
  
  return `
    <div class="card hover:shadow-lg transition-shadow">
      <div class="card-body">
        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
          <div class="flex-1">
            <div class="flex items-start gap-3">
              <i class="bi bi-flag-fill text-warning text-xl mt-1"></i>
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-2">
                  <h3 class="font-bold text-lg">${issue.issue_type}</h3>
                  <span class="badge badge-${statusColors[issue.status] || 'secondary'}">
                    <i class="bi bi-${statusIcons[issue.status] || 'circle'}"></i>
                    ${issue.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                
                <p class="text-sm text-gray-600 mb-3 line-clamp-2">${issue.description}</p>
                
                <div class="flex flex-wrap gap-4 text-sm text-gray-500">
                  <div>
                    <i class="bi bi-receipt"></i>
                    <strong>Order:</strong> #${issue.order?.order_number || 'N/A'}
                  </div>
                  <div>
                    <i class="bi bi-calendar"></i>
                    <strong>Reported:</strong> ${formatRelativeTime(issue.created_at)}
                  </div>
                  ${issue.evidence_urls && issue.evidence_urls.length > 0 ? `
                    <div>
                      <i class="bi bi-paperclip"></i>
                      <strong>Evidence:</strong> ${issue.evidence_urls.length} file(s)
                    </div>
                  ` : ''}
                </div>
                
                ${issue.admin_notes && issue.status !== 'under_review' ? `
                  <div class="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p class="text-sm font-semibold text-blue-800 mb-1">
                      <i class="bi bi-person-badge"></i> Admin Response:
                    </p>
                    <p class="text-sm text-blue-900">${issue.admin_notes}</p>
                  </div>
                ` : ''}
              </div>
            </div>
          </div>
          
          <div class="flex gap-2 flex-wrap sm:flex-col">
            <button class="btn btn-sm btn-outline" onclick="window.viewIssueDetails('${issue.id}')">
              <i class="bi bi-eye"></i> View Details
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
};

window.viewIssueDetails = async (issueId) => {
  try {
    const response = await getIssue(issueId);
    const issue = response.data?.issue;
    
    if (!issue) {
      showError('Issue not found');
      return;
    }
    
    const statusColors = {
      under_review: 'warning',
      resolved: 'success',
      rejected: 'danger'
    };
    
    const modal = createModal({
      title: 'Issue Details',
      content: `
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-bold">${issue.issue_type}</h3>
            <span class="badge badge-${statusColors[issue.status] || 'secondary'}">
              ${issue.status.replace('_', ' ').toUpperCase()}
            </span>
          </div>
          
          <div class="border-t pt-4">
            <h4 class="font-semibold mb-2">Order Information</h4>
            <p class="text-sm"><i class="bi bi-receipt"></i> Order #${issue.order?.order_number || 'N/A'}</p>
            <p class="text-sm"><i class="bi bi-cash"></i> ${formatCurrency(issue.order?.total_amount || 0)}</p>
          </div>
          
          <div class="border-t pt-4">
            <h4 class="font-semibold mb-2">Description</h4>
            <p class="text-sm text-gray-700">${issue.description}</p>
          </div>
          
          ${issue.evidence_urls && issue.evidence_urls.length > 0 ? `
            <div class="border-t pt-4">
              <h4 class="font-semibold mb-2">Evidence (${issue.evidence_urls.length})</h4>
              <div class="grid grid-cols-2 gap-2">
                ${issue.evidence_urls.map(url => {
                  const fullUrl = getIssueEvidenceUrl(url);
                  return `<img src="${fullUrl}" alt="Evidence" class="w-full h-32 object-cover rounded-lg border cursor-pointer" onclick="window.open('${fullUrl}', '_blank')">`;
                }).join('')}
              </div>
            </div>
          ` : ''}
          
          ${issue.admin_notes ? `
            <div class="border-t pt-4">
              <h4 class="font-semibold mb-2">Admin Response</h4>
              <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p class="text-sm text-blue-900">${issue.admin_notes}</p>
                ${issue.resolved_at ? `
                  <p class="text-xs text-gray-500 mt-2">
                    <i class="bi bi-clock"></i> Responded: ${formatRelativeTime(issue.resolved_at)}
                  </p>
                ` : ''}
              </div>
            </div>
          ` : `
            <div class="border-t pt-4">
              <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p class="text-sm text-yellow-800">
                  <i class="bi bi-hourglass-split"></i> This issue is currently under review by our admin team.
                </p>
              </div>
            </div>
          `}
          
          <div class="border-t pt-4 text-xs text-gray-500">
            <p><i class="bi bi-calendar"></i> Reported: ${formatRelativeTime(issue.created_at)}</p>
          </div>
        </div>
      `,
      footer: `
        <button class="btn btn-outline" onclick="this.closest('.modal-backdrop').remove()">Close</button>
      `,
      size: 'lg'
    });
  } catch (error) {
    console.error('Error loading issue details:', error);
    showError('Failed to load issue details');
  }
};

const attachIssueFilterListeners = () => {
  document.querySelectorAll('.issue-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      issueFilters.status = btn.dataset.status;
      loadMyIssues();
    });
  });
};

// Update message badge in navbar
const updateMessageBadge = async () => {
  try {
    const response = await getConversations();
    const conversations = response.data?.conversations || [];
    
    // Count total unread messages
    const totalUnread = conversations.reduce((sum, conv) => sum + (conv.unread_count || 0), 0);
    
    // Use centralized navbar function for consistency
    updateMessagesCount(totalUnread);
  } catch (error) {
    console.error('Error updating message badge:', error);
  }
};

// Update online status in both conversation list and chat header
const updateOnlineStatusDisplay = () => {
  // Always update conversation list if on messaging page
  if (currentPage === 'messaging') {
    loadConversations();
  }
  
  // Update chat header status using online-status module
  const headerStatus = document.getElementById('chat-status');
  if (headerStatus && headerStatus.dataset.userId) {
    const userId = headerStatus.dataset.userId;
    const statusBadge = createStatusBadge(userId, 'User');
    headerStatus.innerHTML = '';
    headerStatus.appendChild(statusBadge);
  }
};

// ============ Messaging ============

const loadConversations = async () => {
  const container = document.getElementById('conversations-list');
  if (!container) return;
  
  try {
    const response = await getConversations();
    const conversations = response.data?.conversations || [];
    
    if (conversations.length === 0) {
      container.innerHTML = '<p class="text-center text-gray-500 py-4">No conversations yet</p>';
      return;
    }
    
    container.innerHTML = conversations.map(conv => {
      const userId = conv.other_party_id;
      return `
      <div class="conversation-item p-3 hover:bg-gray-100 cursor-pointer rounded-lg"
           data-order-id="${conv.order_id}"
           data-user-id="${userId}"
           onclick="window.openConversation('${conv.order_id}')">
        <div class="flex items-center gap-3">
          <div class="flex-1">
            <div class="flex items-center gap-2">
              <p class="font-semibold">${conv.other_party}</p>
              <span class="status-badge-container" data-user-id="${userId}"></span>
            </div>
            <p class="text-sm text-gray-600 truncate">${conv.last_message || 'No messages yet'}</p>
          </div>
          ${conv.unread_count > 0 ? `
            <span class="badge badge-danger" data-conversation-badge="${conv.order_id}">${conv.unread_count}</span>
          ` : `
            <span class="badge badge-danger" data-conversation-badge="${conv.order_id}" style="display: none;"></span>
          `}
        </div>
      </div>
    `;
    }).join('');
    
    // Add status badges to conversation items - THIS HAPPENS AFTER HTML IS SET
    await new Promise(resolve => setTimeout(resolve, 0)); // Ensure DOM is updated
    
    document.querySelectorAll('.status-badge-container').forEach(container => {
      const userId = container.dataset.userId;
      if (userId) {
        const badge = createStatusBadge(userId);
        container.innerHTML = '';
        container.appendChild(badge);
      } else {
        container.innerHTML = '<span class="text-xs text-gray-400">-</span>';
      }
    });
    
  } catch (error) {
    console.error('Error loading conversations:', error);
  }
};

// Update a single conversation's badge and message preview
const updateConversationBadge = async (orderId) => {
  try {
    const response = await getConversations();
    const conversations = response.data?.conversations || [];
    const conversation = conversations.find(c => c.order_id === orderId);
    
    if (conversation) {
      const badge = document.querySelector(`[data-conversation-badge="${orderId}"]`);
      if (badge) {
        if (conversation.unread_count > 0) {
          badge.textContent = conversation.unread_count;
          badge.style.display = 'inline-block';
        } else {
          badge.style.display = 'none';
        }
      }
      
      // Update last message preview
      const item = document.querySelector(`[data-order-id="${orderId}"]`);
      if (item) {
        const messagePreview = item.querySelector('p:nth-child(2)');
        if (messagePreview) {
          messagePreview.textContent = conversation.last_message || 'No messages yet';
        }
      }
    }
  } catch (error) {
    console.error('Error updating conversation badge:', error);
  }
};

window.openConversation = async (orderId) => {
  // Get the user ID from the conversation element's data attribute for consistency
  const conversationItem = document.querySelector(`[data-order-id="${orderId}"]`);
  const userId = conversationItem?.dataset.userId;
  
  // Store userId globally to ensure consistency in openOrderChat
  window.conversationUserId = userId;
  
  window.openOrderChat(orderId, userId);
};

window.openOrderChat = async (orderId, userId) => {
  currentConversation = orderId;
  
  // Join conversation room via socket for real-time updates
  try {
    const { default: socketService } = await import('../services/socket.service.js');
    socketService.joinConversation(orderId);
  } catch (error) {
    console.warn('Failed to join socket conversation:', error);
  }
  
  // Navigate to messaging page first
  window.location.hash = '#messaging';
  
  // Wait for the messaging section to be visible, then open the chat
  setTimeout(async () => {
    const chatWindow = document.getElementById('chat-window');
    
    if (!chatWindow) {
      console.error('Chat window element not found');
      return;
    }
    
    try {
      // Mark messages as read immediately when opening conversation
      try {
        const markReadResponse = await markMessagesAsRead(orderId);
        updateConversationBadge(orderId);
        
        // Immediately update navbar badge
        updateMessageBadge();
      } catch (error) {
        console.error('Failed to mark messages as read:', error);
      }
      
      // Get fresh message data
      const response = await getOrderMessages(orderId);
      const messages = response.data?.messages || [];
      const userRole = response.data?.user_role || 'buyer';
      const orderStatus = response.data?.order_status;
      const isCancelled = orderStatus === 'cancelled';
      
      chatWindow.innerHTML = `
        <div class="flex flex-col h-96">
          <div class="border-b p-4 bg-gray-50" id="chat-header">
            <div class="flex justify-between items-center">
              <div>
                <h3 class="font-bold text-lg" id="chat-user-name">Seller</h3>
              </div>
            </div>
          </div>
          
          <div id="chat-messages" class="flex-1 overflow-y-auto p-4 space-y-3">
            ${messages.map(msg => createMessageBubble(msg, userRole)).join('')}
          </div>
          
          <div class="border-t p-4">
            ${isCancelled ? `
              <div class="p-3 bg-red-50 border border-red-200 rounded-lg text-center text-red-700 text-sm">
                <i class="bi bi-exclamation-circle"></i> This order has been cancelled. No new messages can be sent.
              </div>
            ` : `
              <form id="chat-form" class="flex gap-2">
                <input type="text" 
                       id="message-input" 
                       class="form-control flex-1" 
                       placeholder="Type a message..."
                       required>
                <button type="submit" class="btn btn-primary">
                  <i class="bi bi-send"></i> Send
                </button>
              </form>
            `}
          </div>
        </div>
      `;
      
      // Update chat header with seller info
      const headerName = document.getElementById('chat-user-name');
      if (headerName) {
        const sellerName = response.data?.seller_name || 'Seller';
        headerName.textContent = sellerName;
      }
      
      // Auto-scroll to bottom
      const messagesContainer = document.getElementById('chat-messages');
      if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
      
      // Handle send message
      const chatForm = document.getElementById('chat-form');
      if (chatForm) {
        chatForm.addEventListener('submit', handleSendMessage);
      }
      
    } catch (error) {
      console.error('Error loading messages:', error);
      showError('Failed to load messages');
    }
  }, 100);
};

const createMessageBubble = (message, userRole) => {
  const isSender = message.sender?.role === userRole;
  const alignClass = isSender ? 'justify-end' : 'justify-start';
  const bgClass = isSender ? 'bg-primary text-white' : 'bg-gray-200';
  
  return `
    <div class="flex ${alignClass}">
      <div class="${bgClass} rounded-lg px-4 py-2 max-w-xs">
        <p class="text-sm">${message.message_text}</p>
        <p class="text-xs opacity-75 mt-1">${formatRelativeTime(message.created_at)}</p>
      </div>
    </div>
  `;
};

const handleSendMessage = async (e) => {
  e.preventDefault();
  
  const input = document.getElementById('message-input');
  const messageText = input.value.trim();
  
  if (!messageText) return;
  
  // Clear input immediately
  input.value = '';
  
  try {
    await sendMessage({
      order_id: currentConversation,
      message_text: messageText
    });
    
    // Reload messages
    await window.openOrderChat(currentConversation);
    
    // Focus input for next message
    setTimeout(() => {
      const newInput = document.getElementById('message-input');
      if (newInput) {
        newInput.focus();
      }
    }, 50);
    
  } catch (error) {
    console.error('Error sending message:', error);
    showError('Failed to send message');
    // Restore message if send failed
    input.value = messageText;
  }
};

// ============ Real-time Features ============

const initializeRealTime = async () => {
  try {
    const { initSocket, on, onInitialOnlineUsers, onUserOnline, onUserOffline } = await import('../services/socket.service.js');
    
    // Create a promise that resolves when initial online users are loaded
    let resolveInitialUsers;
    let hasResolved = false; // Prevent double resolution
    initialOnlineUsersPromise = new Promise((resolve) => {
      resolveInitialUsers = () => {
        if (!hasResolved) {
          hasResolved = true;
          resolve();
        }
      };
    });
    
    // Set a timeout to resolve the promise after 10 seconds (in case server never responds)
    const timeoutId = setTimeout(() => {
      resolveInitialUsers();
    }, 10000);
    
    // Initialize socket FIRST before setting up online status listeners
    const socket = initSocket();
    
    // NOW initialize the online-status module (socket exists now)
    initOnlineStatus();
    
    // Initialize live order updates
    initLiveUpdates();
    
    // Register callback to reload orders on real-time updates
    onUpdate((data) => {
      console.log('Order updated, reloading orders...', data);
      if (typeof loadOrders === 'function') {
        loadOrders();
      }
    });
    
    if (socket) {
      // IMPORTANT: Register all socket listeners immediately
      // The socket will connect in the background and fire events when ready
      
      // Listen for initial online users list when socket connects
      onInitialOnlineUsers((data) => {
        if (data.onlineUsers && Array.isArray(data.onlineUsers)) {
          setInitialOnlineUsers(data.onlineUsers);
          clearTimeout(timeoutId);
          resolveInitialUsers();
          loadConversations(); // Refresh conversations to show correct status
        }
      });
      
      // CRITICAL: Use onUserOnline/onUserOffline for guaranteed listener registration
      // These functions use socket.on() directly, ensuring listeners are set before events fire
      onUserOnline((data) => {
        updateOnlineStatusDisplay();
      });
      
      onUserOffline((data) => {
        updateOnlineStatusDisplay();
      });
      
      // Listen for new messages from socket
      on('message_received', (data) => {
        // Check if user is currently viewing this conversation
        const isViewingThisConversation = currentPage === 'messaging' && currentConversation === data.order_id;
        
        // Only update conversations and show badge if NOT currently viewing this conversation
        if (!isViewingThisConversation) {
          // Update conversations list and badges
          loadConversations();
          // Update message badge in navbar
          updateMessageBadge();
          // Show toast for new messages in other conversations (no sound - we play message sound separately)
          showToast('New message received', 'info', 5000, false);
          // Play message sound
          playMessageSound();
        } else {
          // User is viewing the conversation, just add the message to chat
          const chatMessages = document.getElementById('chat-messages');
          if (chatMessages) {
            addMessageBubbleToChat(data);
          }
          
          // Auto-mark incoming messages as read if user is viewing the conversation
          setTimeout(async () => {
            try {
              await markMessagesAsRead(data.order_id);
              // Update badge to reflect the read state
              updateConversationBadge(data.order_id);
              updateMessageBadge();
            } catch (error) {
              // Silently fail
            }
          }, 500);
        }
      });
      
      // Listen for message read receipts
      on('message_read_receipt', (data) => {
        if (currentConversation === data.orderId) {
          // Update badge for current conversation
          updateConversationBadge(data.orderId);
        } else {
          // Reload conversations to update badges in other conversations
          loadConversations();
        }
        // Always update navbar badge
        updateMessageBadge();
      });
      
      // Listen for order updates
      on('order:updated', (data) => {
        showToast(`Order #${data.order_number} status: ${data.status}`, 'info');
        if (currentPage === 'orders') {
          loadOrders();
        }
      });
    }
  } catch (error) {
    console.warn('Real-time features not available:', error);
  }
};

// Add new message bubble to chat in real-time
const addMessageBubbleToChat = (message) => {
  const chatMessages = document.getElementById('chat-messages');
  
  // Get current user from auth
  const currentUser = getCurrentUserSync();
  const currentUserId = currentUser?.id;
  
  // Determine if this is a sent message
  const isSender = message.sender_id === currentUserId;
  
  const alignClass = isSender ? 'justify-end' : 'justify-start';
  const bgClass = isSender ? 'bg-primary text-white' : 'bg-gray-200';
  
  // Get sender name - try multiple possible field names
  const senderName = message.sender?.full_name || message.senderName || message.sender_name || (isSender ? 'You' : 'Seller');
  
  // Format the time properly
  let timeText = 'now';
  if (message.created_at) {
    timeText = formatRelativeTime(message.created_at);
  }
  
  const bubble = `
    <div class="flex ${alignClass}">
      <div class="${bgClass} rounded-lg px-4 py-2 max-w-xs">
        <p class="text-xs opacity-75 mb-1">${isSender ? 'You' : senderName}</p>
        <p class="text-sm">${escapeHtml(message.message_text)}</p>
        <p class="text-xs opacity-75 mt-1">${timeText}</p>
      </div>
    </div>
  `;
  
  chatMessages.insertAdjacentHTML('beforeend', bubble);
  
  // Auto-scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
};

// Helper to safely escape HTML
const escapeHtml = (text) => {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
};

// Helper to get current user synchronously
const getCurrentUserSync = () => {
  try {
    const userStr = localStorage.getItem('agrimarket_user');
    return userStr ? JSON.parse(userStr) : null;
  } catch (error) {
    return null;
  }
};

// ============ Event Listeners ============

let eventListeners = [];

const attachEventListeners = () => {
  // Browse search
  const searchInput = document.getElementById('browse-search');
  if (searchInput) {
    const searchHandler = debounce((e) => {
      browseFilters.search = e.target.value;
      browseFilters.page = 1; // Reset to first page when searching
      loadBrowseProducts();
    }, 500);
    searchInput.addEventListener('input', searchHandler);
    eventListeners.push({ element: searchInput, event: 'input', handler: searchHandler });
  }
  
  // Browse category filter
  const categorySelect = document.getElementById('browse-category');
  if (categorySelect) {
    const categoryHandler = (e) => {
      browseFilters.category = e.target.value;
      browseFilters.page = 1; // Reset to first page when category changes
      loadBrowseProducts();
    };
    categorySelect.addEventListener('change', categoryHandler);
    eventListeners.push({ element: categorySelect, event: 'change', handler: categoryHandler });
  }
  
  // Browse municipality filter
  const municipalitySelect = document.getElementById('browse-municipality');
  if (municipalitySelect) {
    const municipalityHandler = (e) => {
      browseFilters.municipality = e.target.value;
      browseFilters.page = 1;
      loadBrowseProducts();
      if (currentView === 'map') {
        loadProductsOnMap();
      }
    };
    municipalitySelect.addEventListener('change', municipalityHandler);
    eventListeners.push({ element: municipalitySelect, event: 'change', handler: municipalityHandler });
  }
  
  // Product tags checkboxes
  document.querySelectorAll('.product-tag-checkbox').forEach(checkbox => {
    const tagHandler = (e) => {
      const tag = e.target.value;
      if (e.target.checked) {
        if (!browseFilters.tags.includes(tag)) {
          browseFilters.tags.push(tag);
        }
      } else {
        browseFilters.tags = browseFilters.tags.filter(t => t !== tag);
      }
      browseFilters.page = 1;
      loadBrowseProducts();
      if (currentView === 'map') {
        loadProductsOnMap();
      }
    };
    checkbox.addEventListener('change', tagHandler);
    eventListeners.push({ element: checkbox, event: 'change', handler: tagHandler });
  });
  
  // Clear filters button
  const clearFiltersBtn = document.getElementById('clear-filters');
  if (clearFiltersBtn) {
    const clearHandler = () => clearAllFilters();
    clearFiltersBtn.addEventListener('click', clearHandler);
    eventListeners.push({ element: clearFiltersBtn, event: 'click', handler: clearHandler });
  }
  
  // View toggle buttons
  const gridBtn = document.getElementById('view-grid');
  if (gridBtn) {
    const gridHandler = () => toggleView('grid');
    gridBtn.addEventListener('click', gridHandler);
    eventListeners.push({ element: gridBtn, event: 'click', handler: gridHandler });
  }
  
  const mapBtn = document.getElementById('view-map');
  if (mapBtn) {
    const mapHandler = () => toggleView('map');
    mapBtn.addEventListener('click', mapHandler);
    eventListeners.push({ element: mapBtn, event: 'click', handler: mapHandler });
  }
  
  // Browse sort filter
  const sortSelect = document.getElementById('browse-sort');
  if (sortSelect) {
    // Set initial value
    sortSelect.value = `${browseFilters.sort_by}:${browseFilters.sort_order}`;
    const sortHandler = (e) => {
      const [sort_by, sort_order] = e.target.value.split(':');
      browseFilters.sort_by = sort_by;
      browseFilters.sort_order = sort_order;
      browseFilters.page = 1; // Reset to first page when sorting changes
      loadBrowseProducts();
    };
    sortSelect.addEventListener('change', sortHandler);
    eventListeners.push({ element: sortSelect, event: 'change', handler: sortHandler });
  }
};

// Attach order filter button listeners (called each time orders section is loaded)
const attachOrderFilterListeners = () => {
  document.querySelectorAll('.order-filter').forEach(btn => {
    // Remove any existing listeners by cloning the element
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    
    // Add new listener
    newBtn.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Update active state
      document.querySelectorAll('.order-filter').forEach(b => {
        b.classList.remove('active');
      });
      newBtn.classList.add('active');
      
      // Update filter and reload
      orderFilters.status = newBtn.dataset.status;
      loadOrders();
    });
  });
};

const cleanupEventListeners = () => {
  eventListeners.forEach(({ element, event, handler }) => {
    if (element) {
      element.removeEventListener(event, handler);
    }
  });
  eventListeners = [];
};

// Cleanup on page unload only (not on hashchange to preserve event listeners)
window.addEventListener('beforeunload', cleanupEventListeners);

// ============ Cleanup ============

const cleanup = () => {
  // Clean up map instances
  if (productDetailsMap) {
    productDetailsMap.remove();
    productDetailsMap = null;
  }
  
  if (browseMap) {
    browseMap.remove();
    browseMap = null;
  }
  
  // Clean up online status
  cleanupOnlineStatus();
};

// ============ Initialize on Load ============

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Cleanup on page unload
window.addEventListener('beforeunload', cleanup);

// Global helper functions for modal quantity controls
window.incrementQuantity = (inputId, maxQuantity) => {
  try {
    const input = document.getElementById(inputId);
    if (input) {
      const currentValue = parseInt(input.value) || 1;
      const newValue = Math.min(currentValue + 1, maxQuantity || 999);
      input.value = newValue;
    }
  } catch (error) {
    console.error('Error incrementing quantity:', error);
  }
};

window.decrementQuantity = (inputId) => {
  try {
    const input = document.getElementById(inputId);
    if (input) {
      const currentValue = parseInt(input.value) || 1;
      const newValue = Math.max(currentValue - 1, 1);
      input.value = newValue;
    }
  } catch (error) {
    console.error('Error decrementing quantity:', error);
  }
};

window.handleAddToCartFromDynamicModal = async (productId) => {
  try {
    const quantityInput = document.getElementById('dynamic-product-quantity');
    const quantity = quantityInput ? parseInt(quantityInput.value) || 1 : 1;
    
    // Find the product from current products list
    const filters = { ...browseFilters };
    if (filters.tags && filters.tags.length > 0) {
      filters.tags = filters.tags.join(',');
    } else {
      delete filters.tags;
    }
    
    const response = await listProducts({ ...filters, limit: 100 });
    const product = response.data?.products.find(p => p.id === productId);
    
    if (!product) {
      showError('Product not found');
      return;
    }
    
    await handleAddToCart(product, quantity);
    
    // Close modal after successful add to cart
    const modals = document.querySelectorAll('.modal-backdrop');
    modals.forEach(modal => modal.remove());
    
    showToast('Product added to cart!', 'success');
    
  } catch (error) {
    console.error('Error adding product to cart from dynamic modal:', error);
    showError('Failed to add product to cart');
  }
};

window.handleAddToCartFromModal = async (productId) => {
  try {
    const quantityInput = document.getElementById('product-quantity');
    const quantity = quantityInput ? parseInt(quantityInput.value) || 1 : 1;
    
    // Find the product from current products list
    const filters = { ...browseFilters };
    if (filters.tags && filters.tags.length > 0) {
      filters.tags = filters.tags.join(',');
    } else {
      delete filters.tags;
    }
    
    const response = await listProducts({ ...filters, limit: 100 });
    const product = response.data?.products.find(p => p.id === productId);
    
    if (!product) {
      showError('Product not found');
      return;
    }
    
    await handleAddToCart(product, quantity);
    
    // Close product modal after successful add to cart
    closeProductDetailsModal();
    
  } catch (error) {
    console.error('Error adding product to cart from modal:', error);
    showError('Failed to add product to cart');
  }
};

export { init, loadBrowseProducts, loadCart, loadOrders };
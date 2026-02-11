// assets/js/pages/seller.main.js
// Seller Dashboard Main Script

import { renderNavbar, updateOrdersCount, updateMessagesCount } from '../components/navbar.js';
import { showToast, showError, showSuccess } from '../components/toast.js';
import { showSpinner, hideSpinner } from '../components/loading-spinner.js';
import { createModal, closeModal } from '../components/modal.js';
import { openIssueModal } from '../components/issue-modal.js';
import { requireAuth, requireVerification, getUser, getToken, getUserId } from '../core/auth.js';
import { formatCurrency, formatDate, formatRelativeTime } from '../utils/formatters.js';
import { validateRequired, validateNumber } from '../utils/validators.js';
import { ENDPOINTS, buildUrl } from '../config/api.js';

// Services
import { 
  getMyProducts, 
  createProduct, 
  updateProduct, 
  deleteProduct,
  getSellerAnalytics,
  getSalesOverTime,
  getTopProducts
} from '../services/product.service.js';
import { getOrders, getOrderById, updateOrderStatus, confirmOrder } from '../services/order.service.js';
import { getDashboardStats } from '../services/user.service.js';
import { 
  getConversations,
  getOrderMessages,
  sendMessage,
  markMessagesAsRead
} from '../services/message.service.js';
import { getMyIssues, getIssue } from '../services/issue.service.js';
import { PRODUCT_CATEGORIES, UNIT_TYPES, RIZAL_MUNICIPALITIES } from '../utils/constants.js';
import {
  initOnlineStatus,
  createStatusBadge,
  isUserOnline,
  onStatusChange,
  setInitialOnlineUsers,
  cleanup as cleanupOnlineStatus
} from '../features/real-time/online-status.js';
import { initLiveUpdates, onUpdate } from '../features/real-time/live-updates.js';
import { getDeliveryProofUrl, getIssueEvidenceUrl } from '../utils/image-helpers.js';
import { initNotificationSounds, playMessageSound } from '../features/notifications/notification-sound.js';

// ============ State ============

let currentPage = 'products'; // Track current section
let currentProducts = [];
let currentOrders = [];
let currentStats = null;
let editingProduct = null;
let currentConversation = null;
let onlineUsers = new Set(); // Track online users
let initialOnlineUsersPromise = Promise.resolve(); // Promise that resolves when initial online users are loaded
let orderFilters = {
  status: 'all',
  page: 1
};
let issueFilters = {
  status: 'all'
};
let currentIssues = [];

// ============ Initialization ============

const init = async () => {
  // Check authentication and verification
  if (!requireAuth(['seller'])) {
    return;
  }
  
  // Setup navigation first - this allows hash-based routing to work immediately
  setupNavigation();
  
  // Initialize notification sounds
  initNotificationSounds();
  
  // Initialize real-time features (socket) BEFORE rendering navbar
  initializeRealTime();
  
  // NOW initialize components that depend on socket
  renderNavbar();
  
  // Load initial data (non-blocking)
  loadDashboardStats().catch(err => console.error('Error loading stats:', err));
  loadProducts().catch(err => console.error('Error loading products:', err));
  loadOrders().catch(err => console.error('Error loading orders:', err));
  updateMessageBadge().catch(err => console.error('Error updating message badge:', err));
  
  // Attach event listeners
  attachEventListeners();
};

// ============ Navigation ============

const setupNavigation = () => {
  const handleHashChange = () => {
    const hash = window.location.hash.slice(1) || 'products';
    showPage(hash);
  };
  
  window.addEventListener('hashchange', handleHashChange);
  
  // Cleanup charts when page is unloaded
  window.addEventListener('beforeunload', cleanupCharts);
  
  // Handle initial navigation
  if (document.readyState === 'complete') {
    handleHashChange();
  } else {
    window.addEventListener('load', handleHashChange);
  }
};

const showPage = (page) => {
  // Update current page tracking
  currentPage = page;
  
  // Clean up charts when leaving analytics page
  if (page !== 'analytics') {
    cleanupCharts();
  }
  
  // Close conversation when leaving messaging section
  if (page !== 'messaging') {
    currentConversation = null;
    const chatWindow = document.getElementById('chat-window');
    if (chatWindow) {
      chatWindow.innerHTML = '';
    }
  }
  
  // Hide all sections
  document.querySelectorAll('section').forEach(section => {
    section.style.display = 'none';
  });
  
  // Show requested section
  const section = document.getElementById(page);
  
  if (section) {
    section.style.display = 'block';
    
    // Load page-specific data
    switch(page) {
      case 'products':
        loadProducts();
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
      case 'analytics':
        loadAnalytics();
        break;
      case 'profile':
        loadProfile();
        break;
      default:
        // Invalid route - redirect to 404 page
        window.location.href = '/404.html';
        break;
    }
  } else {
    // Section not found - redirect to 404 page
    window.location.href = '/404.html';
  }
};

// ============ Dashboard Stats ============

const loadDashboardStats = async () => {
  try {
    const response = await getDashboardStats();
    currentStats = response.data?.stats || {};
    
    // Update stat cards (only if elements exist)
    const statProducts = document.getElementById('stat-products');
    const statPending = document.getElementById('stat-pending');
    const statSales = document.getElementById('stat-sales');
    
    if (statProducts) statProducts.textContent = currentStats.total_products || 0;
    if (statPending) statPending.textContent = currentStats.pending_orders || 0;
    if (statSales) statSales.textContent = formatCurrency(currentStats.total_sales || 0);
    
  } catch (error) {
    console.error('Error loading stats:', error);
  }
};

// ============ Product Management ============

const loadProducts = async () => {
  const tbody = document.getElementById('products-table-body');
  const mobileView = document.getElementById('products-mobile-view');
  if (!tbody && !mobileView) return;
  
  // Show loading state for both views
  if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8"><div class="loading-spinner mx-auto"></div></td></tr>';
  if (mobileView) mobileView.innerHTML = '<div class="text-center py-8"><div class="loading-spinner mx-auto"></div></div>';
  
  try {
    const response = await getMyProducts();
    currentProducts = response.data?.products || [];
    
    if (currentProducts.length === 0) {
      // Empty state for both views
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="text-center py-12">
              <i class="bi bi-inbox text-6xl text-gray-400"></i>
              <p class="text-gray-500 mt-4">No products yet</p>
            </td>
          </tr>
        `;
      }
      if (mobileView) {
        mobileView.innerHTML = `
          <div class="text-center py-12">
            <i class="bi bi-inbox text-6xl text-gray-400"></i>
            <p class="text-gray-500 mt-4">No products yet</p>
          </div>
        `;
      }
      return;
    }
    
    // Populate both views
    if (tbody) tbody.innerHTML = currentProducts.map(product => createProductRow(product)).join('');
    if (mobileView) mobileView.innerHTML = currentProducts.map(product => createProductCard(product)).join('');
    
  } catch (error) {
    console.error('Error loading products:', error);
    
    // Handle verification required error
    if (error.status === 403 && error.message?.includes('verification')) {
      const verificationContent = `
        <div class="alert alert-warning">
          <i class="bi bi-shield-exclamation text-6xl"></i>
          <h3 class="font-bold mt-4">Account Verification Required</h3>
          <p class="text-sm mt-2">You need to verify your seller account before you can manage products.</p>
          <a href="/verification.html" class="btn btn-primary mt-4">
            <i class="bi bi-shield-check"></i> Verify Account
          </a>
        </div>
      `;
      
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="text-center py-12">
              ${verificationContent}
            </td>
          </tr>
        `;
      }
      if (mobileView) {
        mobileView.innerHTML = `<div class="text-center py-12">${verificationContent}</div>`;
      }
      return;
    }
    
    // General error state for both views
    const errorMessage = error.message || 'Failed to load products';
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-8 text-danger">
            ${errorMessage}
          </td>
        </tr>
      `;
    }
    if (mobileView) {
      mobileView.innerHTML = `<div class="text-center py-8 text-danger">${errorMessage}</div>`;
    }
  }
};

const createProductRow = (product) => {
  const statusColors = {
    active: 'success',
    paused: 'warning',
    draft: 'secondary'
  };
  
  return `
    <tr data-product-id="${product.id}">
      <td>
        <div class="flex items-center gap-3">
          <img src="${product.photo_path || product.photos?.[0] || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22200%22%3E%3Crect fill=%22%23f0f0f0%22 width=%22300%22 height=%22200%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2216%22 fill=%22%23999%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Image%3C/text%3E%3C/svg%3E'}" 
               alt="${product.name}"
               class="w-12 h-12 object-cover rounded">
          <div>
            <p class="font-semibold">${product.name}</p>
            <p class="text-sm text-gray-600">${product.municipality}</p>
          </div>
        </div>
      </td>
      <td>${product.category}</td>
      <td>${formatCurrency(product.price_per_unit)} / ${product.unit_type}</td>
      <td>${product.available_quantity}</td>
      <td>
        <span class="badge badge-${statusColors[product.status] || 'secondary'}">
          ${product.status}
        </span>
      </td>
      <td>
        <div class="flex gap-2">
          <button class="btn btn-sm btn-outline" onclick="window.editProduct('${product.id}')">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-sm btn-danger" onclick="window.deleteProduct('${product.id}')">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `;
};

const createProductCard = (product) => {
  const statusColors = {
    active: 'success',
    paused: 'warning',
    draft: 'secondary'
  };
  
  return `
    <div class="card mb-4" data-product-id="${product.id}">
      <div class="card-body">
        <div class="flex items-start gap-3 mb-3">
          <img src="${product.photo_path || product.photos?.[0] || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22200%22%3E%3Crect fill=%22%23f0f0f0%22 width=%22300%22 height=%22200%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2216%22 fill=%22%23999%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Image%3C/text%3E%3C/svg%3E'}" 
               alt="${product.name}"
               class="w-16 h-16 object-cover rounded">
          <div class="flex-1">
            <h3 class="font-semibold text-lg">${product.name}</h3>
            <p class="text-sm text-gray-600 mb-1"><i class="bi bi-geo-alt"></i> ${product.municipality}</p>
            <p class="text-sm text-gray-600">${product.category}</p>
          </div>
        </div>
        
        <div class="grid grid-cols-2 gap-4 mb-3 text-sm">
          <div>
            <span class="text-gray-600">Price:</span>
            <p class="font-semibold">${formatCurrency(product.price_per_unit)} / ${product.unit_type}</p>
          </div>
          <div>
            <span class="text-gray-600">Stock:</span>
            <p class="font-semibold">${product.available_quantity}</p>
          </div>
        </div>
        
        <div class="flex items-center justify-between">
          <span class="badge badge-${statusColors[product.status] || 'secondary'}">
            ${product.status}
          </span>
          <div class="flex gap-2">
            <button class="btn btn-sm btn-outline" onclick="window.editProduct('${product.id}')">
              <i class="bi bi-pencil"></i> Edit
            </button>
            <button class="btn btn-sm btn-danger" onclick="window.deleteProduct('${product.id}')">
              <i class="bi bi-trash"></i> Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
};

// ============ Product Modal (Create/Edit) ============

window.showProductModal = (productId = null) => {
  editingProduct = productId ? currentProducts.find(p => p.id === productId) : null;
  
  // Get seller's municipality from user data
  const user = getUser();
  const sellerMunicipality = user?.seller_profile?.municipality || 'Not set';
  
  const modalContent = `
    <form id="product-form" class="space-y-4">
      <!-- Basic Info -->
      <div class="form-group">
        <label class="form-label">Product Name <span class="text-danger">*</span></label>
        <input type="text" id="product-name" class="form-control" 
               value="${editingProduct?.name || ''}" required>
        <div class="invalid-feedback"></div>
      </div>
      
      <div class="grid grid-cols-2 gap-4">
        <div class="form-group">
          <label class="form-label">Category <span class="text-danger">*</span></label>
          <select id="product-category" class="form-select" required>
            <option value="">Select category</option>
            ${Object.entries(PRODUCT_CATEGORIES).map(([key, value]) => `
              <option value="${value}" ${editingProduct?.category === value ? 'selected' : ''}>
                ${value.replace('_', ' ')}
              </option>
            `).join('')}
          </select>
        </div>
        
        <div class="form-group">
          <label class="form-label">Municipality <span class="text-danger">*</span></label>
          <input type="text" id="product-municipality" class="form-control" 
                 value="${sellerMunicipality}" readonly>
          <input type="hidden" id="product-municipality-value" value="${sellerMunicipality}">
          <p class="text-sm text-gray-600 mt-1">Municipality is fixed to your profile location</p>
        </div>
      </div>
      
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea id="product-description" class="form-control" rows="3">${editingProduct?.description || ''}</textarea>
      </div>
      
      <!-- Pricing -->
      <div class="grid grid-cols-2 gap-4">
        <div class="form-group">
          <label class="form-label">Price per Unit <span class="text-danger">*</span></label>
          <input type="number" id="product-price" class="form-control" 
                 value="${editingProduct?.price_per_unit || ''}" 
                 step="0.01" min="0" required>
          <div class="invalid-feedback"></div>
        </div>
        
        <div class="form-group">
          <label class="form-label">Unit Type <span class="text-danger">*</span></label>
          <select id="product-unit" class="form-select" required>
            ${Object.entries(UNIT_TYPES).map(([key, value]) => `
              <option value="${value}" ${editingProduct?.unit_type === value ? 'selected' : ''}>
                ${value}
              </option>
            `).join('')}
          </select>
        </div>
      </div>
      
      <div class="form-group">
        <label class="form-label">Stock Quantity <span class="text-danger">*</span></label>
        <input type="number" id="product-stock" class="form-control" 
               value="${editingProduct?.available_quantity || ''}" 
               min="0" required>
        <div class="invalid-feedback"></div>
      </div>
      
      <!-- Photos -->
      <div class="form-group">
        <label class="form-label">Product Photos</label>
        <input type="file" id="product-photos" class="form-control" 
               accept="image/jpeg,image/jpg,image/png" multiple>
        <p class="text-sm text-gray-600 mt-1">Max 5 photos, 5MB each</p>
        ${editingProduct?.photos?.length > 0 ? `
          <div class="flex gap-2 mt-2">
            ${editingProduct.photos.map(photo => `
              <img src="${photo}" alt="Product" class="w-20 h-20 object-cover rounded">
            `).join('')}
          </div>
        ` : ''}
      </div>
      
      <!-- Tags -->
      <div class="form-group">
        <label class="form-label">Tags</label>
        <div class="flex gap-2 flex-wrap">
          <label class="flex items-center gap-1">
            <input type="checkbox" name="tags" value="fresh" 
                   ${editingProduct?.tags?.includes('fresh') ? 'checked' : ''}>
            <span class="text-sm">Fresh</span>
          </label>
          <label class="flex items-center gap-1">
            <input type="checkbox" name="tags" value="organic"
                   ${editingProduct?.tags?.includes('organic') ? 'checked' : ''}>
            <span class="text-sm">Organic</span>
          </label>
          <label class="flex items-center gap-1">
            <input type="checkbox" name="tags" value="recently_harvested"
                   ${editingProduct?.tags?.includes('recently_harvested') ? 'checked' : ''}>
            <span class="text-sm">Recently Harvested</span>
          </label>
        </div>
      </div>
      
      <!-- Status -->
      <div class="form-group">
        <label class="form-label">Status</label>
        <select id="product-status" class="form-select">
          <option value="active" ${editingProduct?.status === 'active' ? 'selected' : ''}>Active</option>
          <option value="paused" ${editingProduct?.status === 'paused' ? 'selected' : ''}>Paused</option>
          <option value="draft" ${editingProduct?.status === 'draft' ? 'selected' : ''}>Draft</option>
        </select>
      </div>
    </form>
  `;
  
  const footer = `
    <button class="btn btn-outline" onclick="this.closest('.modal-backdrop').remove()">Cancel</button>
    <button class="btn btn-primary" id="btn-save-product">
      <i class="bi bi-check-circle"></i> ${editingProduct ? 'Update' : 'Create'} Product
    </button>
  `;
  
  const modal = createModal({
    title: editingProduct ? 'Edit Product' : 'Create New Product',
    content: modalContent,
    footer: footer,
    size: 'lg'
  });
  
  // Handle save
  const btnSave = document.getElementById('btn-save-product');
  btnSave.addEventListener('click', handleSaveProduct);
};

const handleSaveProduct = async () => {
  const form = document.getElementById('product-form');
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  
  // Get selected tags
  const tags = Array.from(document.querySelectorAll('input[name="tags"]:checked'))
    .map(cb => cb.value);
  
  const photosInput = document.getElementById('product-photos');
  const hasNewPhotos = photosInput.files.length > 0;
  
  // Build FormData or regular object based on whether we have files
  let requestData;
  
  if (hasNewPhotos) {
    // Use FormData for file upload
    requestData = new FormData();
    requestData.append('name', document.getElementById('product-name').value);
    requestData.append('category', document.getElementById('product-category').value);
    requestData.append('municipality', document.getElementById('product-municipality-value').value);
    requestData.append('description', document.getElementById('product-description').value);
    requestData.append('price_per_unit', document.getElementById('product-price').value);
    requestData.append('unit_type', document.getElementById('product-unit').value);
    requestData.append('available_quantity', document.getElementById('product-stock').value);
    requestData.append('tags', tags);
    requestData.append('status', document.getElementById('product-status').value);
    
    // Append files
    Array.from(photosInput.files).forEach(file => {
      requestData.append('photo', file);
    });
  } else {
    // Use regular JSON object
    requestData = {
      name: document.getElementById('product-name').value,
      category: document.getElementById('product-category').value,
      municipality: document.getElementById('product-municipality-value').value,
      description: document.getElementById('product-description').value,
      price_per_unit: parseFloat(document.getElementById('product-price').value),
      unit_type: document.getElementById('product-unit').value,
      available_quantity: parseInt(document.getElementById('product-stock').value),
      tags: tags,
      status: document.getElementById('product-status').value
    };
  }
  
  try {
    const btnSave = document.getElementById('btn-save-product');
    btnSave.disabled = true;
    btnSave.innerHTML = '<i class="bi bi-hourglass-split"></i> Saving...';
    
    let response;
    if (editingProduct) {
      // For updates, use upload() if we have files, otherwise use regular put()
      if (hasNewPhotos) {
        const { upload } = await import('../core/http.js');
        response = await upload(
          ENDPOINTS.PRODUCTS.UPDATE(editingProduct.id), 
          requestData,
          { method: 'PUT' }
        );
      } else {
        response = await updateProduct(editingProduct.id, requestData);
      }
    } else {
      // For creates, use upload() if we have files, otherwise use service function
      if (hasNewPhotos) {
        const { upload } = await import('../core/http.js');
        response = await upload(ENDPOINTS.PRODUCTS.CREATE, requestData);
      } else {
        response = await createProduct(requestData);
      }
    }
    
    if (response.success) {
      showSuccess(editingProduct ? 'Product updated!' : 'Product created!');
      
      // Close modal
      document.querySelector('.modal-backdrop')?.remove();
      
      // Reload products
      await loadProducts();
      await loadDashboardStats();
    }
    
  } catch (error) {
    console.error('Error saving product:', error);
    showError(error.message || 'Failed to save product');
    
    const btnSave = document.getElementById('btn-save-product');
    btnSave.disabled = false;
    btnSave.innerHTML = '<i class="bi bi-check-circle"></i> Save Product';
  }
};

window.editProduct = (productId) => {
  window.showProductModal(productId);
};

window.deleteProduct = async (productId) => {
  // Show confirmation modal
  const modal = createModal({
    title: '⚠️ Delete Product',
    content: '<p class="text-gray-700">Are you sure you want to delete this product? This action cannot be undone.</p>',
    footer: `
      <button class="btn btn-outline" onclick="this.closest('.modal-backdrop').remove()">Cancel</button>
      <button class="btn btn-danger" id="btn-confirm-delete">
        <i class="bi bi-trash"></i> Delete
      </button>
    `,
    size: 'sm'
  });
  
  const btnConfirm = document.getElementById('btn-confirm-delete');
  btnConfirm.addEventListener('click', async () => {
    try {
      btnConfirm.disabled = true;
      btnConfirm.innerHTML = '<i class="bi bi-hourglass-split"></i> Deleting...';
      
      await deleteProduct(productId);
      showSuccess('Product deleted successfully');
      
      // Close modal
      document.querySelector('.modal-backdrop').remove();
      
      // Reload products
      await loadProducts();
      await loadDashboardStats();
    } catch (error) {
      console.error('Error deleting product:', error);
      showError('Failed to delete product');
      btnConfirm.disabled = false;
      btnConfirm.innerHTML = '<i class="bi bi-trash"></i> Delete';
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
  
  container.innerHTML = '<div class="text-center py-8"><div class="loading-spinner mx-auto"></div></div>';
  
  try {
    // Don't send status if it's 'all' - backend doesn't accept it
    const filters = { ...orderFilters };
    if (filters.status === 'all') {
      delete filters.status;
    }
    
    const response = await getOrders(filters);
    currentOrders = response.data?.orders || [];
    
    // Update navbar orders badge
    const pendingCount = currentOrders.filter(o => o.status === 'pending').length;
    updateOrdersCount(pendingCount);
    
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
    container.innerHTML = '<div class="text-center py-8 text-danger">Failed to load orders</div>';
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
  
  return `
    <div class="card mb-4" data-order-id="${order.id}">
      <div class="card-body">
        <div class="flex justify-between items-start mb-4">
          <div>
            <h4 class="font-bold text-lg">Order #${order.order_number}</h4>
            <p class="text-sm text-gray-600">
              <i class="bi bi-person"></i> ${order.buyer?.user?.full_name || 'Unknown Buyer'}
            </p>
            <p class="text-sm text-gray-600">${formatDate(order.created_at)}</p>
          </div>
          <span class="badge badge-${statusColors[order.status]}">${order.status.toUpperCase()}</span>
        </div>
        
        <div class="mb-4">
          <p class="text-sm font-semibold mb-2">Order Items:</p>
          <ul class="text-sm space-y-1">
            ${order.items.map(item => `
              <li>• ${item.product_name} (${item.quantity} ${item.unit_type}) - ${formatCurrency(item.subtotal)}</li>
            `).join('')}
          </ul>
        </div>
        
        ${order.preferred_date || order.preferred_time ? `
          <div class="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p class="text-sm font-semibold text-blue-800">
              <i class="bi bi-calendar-check"></i> Preferred Delivery
            </p>
            ${order.preferred_date ? `<p class="text-sm mt-1">${new Date(order.preferred_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</p>` : ''}
            ${order.preferred_time ? `<p class="text-sm">${order.preferred_time.charAt(0).toUpperCase() + order.preferred_time.slice(1)}</p>` : ''}
          </div>
        ` : ''}
        
        ${order.seller_delivery_proof_url ? `
          <div class="mb-4 p-3 bg-green-50 rounded-lg border border-green-200">
            <p class="text-sm font-semibold mb-2 text-green-800">
              <i class="bi bi-check-circle-fill"></i> Delivery Proof Attached
            </p>
            <img src="${getDeliveryProofUrl(order.seller_delivery_proof_url)}" 
                 alt="Delivery Proof" 
                 class="w-full max-w-xs h-48 object-cover rounded-lg border cursor-pointer"
                 onclick="window.open('${getDeliveryProofUrl(order.seller_delivery_proof_url)}', '_blank')">
            <p class="text-xs text-gray-600 mt-1">Click image to view full size</p>
          </div>
        ` : ''}
        
        ${order.buyer_delivery_proof_url ? `
          <div class="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p class="text-sm font-semibold mb-2 text-blue-800">
              <i class="bi bi-check-circle-fill"></i> Buyer Receipt Confirmation
            </p>
            <img src="${getDeliveryProofUrl(order.buyer_delivery_proof_url)}" 
                 alt="Buyer Proof" 
                 class="w-full max-w-xs h-48 object-cover rounded-lg border cursor-pointer"
                 onclick="window.open('${getDeliveryProofUrl(order.buyer_delivery_proof_url)}', '_blank')">
            <p class="text-xs text-gray-600 mt-1">Click image to view full size</p>
          </div>
        ` : ''}
        
        <div class="flex justify-between items-center mb-4">
          <p class="text-lg font-bold">Total: ${formatCurrency(order.total_amount)}</p>
          <p class="text-sm text-gray-600">
            <i class="bi bi-truck"></i> ${order.delivery_option}
          </p>
        </div>
        
        <div class="flex gap-2 flex-wrap">
          ${order.status === 'pending' ? `
            <button class="btn btn-sm btn-success" onclick="window.confirmOrder('${order.id}')">
              <i class="bi bi-check-circle"></i> Confirm Order
            </button>
          ` : ''}
          ${order.status === 'confirmed' ? `
            <button class="btn btn-sm btn-primary" onclick="window.markOrderReady('${order.id}')">
              <i class="bi bi-box-seam"></i> Mark as Ready
            </button>
          ` : ''}
          ${order.status === 'ready' && !order.seller_confirmed ? `
            <button class="btn btn-sm btn-success" onclick="window.completeOrder('${order.id}')">
              <i class="bi bi-check-all"></i> Complete Order
            </button>
          ` : ''}
          ${order.status === 'ready' && order.seller_confirmed && !order.buyer_confirmed ? `
            <div class="btn btn-sm btn-outline cursor-default">
              <i class="bi bi-hourglass-split"></i> Waiting for Buyer Confirmation
            </div>
          ` : ''}
          ${order.status === 'completed' ? `
            <div class="btn btn-sm btn-success cursor-default">
              <i class="bi bi-check-circle-fill"></i> Order Completed
            </div>
            <button class="btn btn-sm btn-warning" onclick="window.reportOrderIssue('${order.id}', '${order.order_number}')">
              <i class="bi bi-flag"></i> Report Issue
            </button>
          ` : ''}
          <button class="btn btn-sm btn-outline" onclick="window.viewOrderDetails('${order.id}')">
            <i class="bi bi-eye"></i> View Details
          </button>
          ${order.status !== 'completed' ? `
            <button class="btn btn-sm btn-primary" onclick="window.messageCustomer('${order.id}')">
              <i class="bi bi-chat"></i> Message
            </button>
          ` : ''}
        </div>
      </div>
    </div>
  `;
};

window.confirmOrder = async (orderId) => {
  try {
    await updateOrderStatus(orderId, 'confirmed');
    showSuccess('Order confirmed!');
    await loadOrders();
    await loadDashboardStats();
  } catch (error) {
    console.error('Error confirming order:', error);
    showError('Failed to confirm order');
  }
};

window.markOrderReady = async (orderId) => {
  try {
    await updateOrderStatus(orderId, 'ready');
    showSuccess('Order marked as ready for pickup/delivery');
    await loadOrders();
  } catch (error) {
    console.error('Error updating order:', error);
    showError(error.message || 'Failed to update order');
  }
};

window.completeOrder = async (orderId) => {
  const order = currentOrders.find(o => o.id === orderId);
  if (!order) {
    showError('Order not found');
    return;
  }

  // Show confirmation modal with REQUIRED image upload for delivery proof
  const modal = createModal({
    title: '✓ Complete Order - Delivery Confirmation',
    content: `
      <div class="space-y-4">
        <p class="text-gray-700">Confirm that this order has been delivered/picked up by the buyer?</p>
        
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p class="text-sm text-gray-600">Order #${order.order_number}</p>
          <p class="font-bold text-lg mt-1">${formatCurrency(order.total_amount)}</p>
          <p class="text-sm text-gray-600 mt-2">
            ${order.items.length} item(s) • ${order.buyer?.user?.full_name || 'Unknown Buyer'}
          </p>
        </div>
        
        <div class="form-group">
          <label class="form-label">
            <i class="bi bi-camera" style="margin-right: 4px;"></i>
            Upload Delivery Proof (Image) <span class="text-danger">*</span>
          </label>
          <input type="file" id="delivery-proof-complete" class="form-control" 
                 accept="image/jpeg,image/jpg,image/png" required>
          <p class="text-sm text-gray-600 mt-1">
            <i class="bi bi-info-circle"></i> <strong>Required:</strong> Upload proof that items were delivered (photo of delivered items, buyer receiving, or customer signature)
          </p>
          <div id="image-preview-complete" class="mt-2"></div>
        </div>
        
        <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p class="text-sm text-yellow-800">
            <i class="bi bi-shield-check"></i> <strong>Important:</strong> This proof will be shared with the buyer to prevent disputes.
          </p>
        </div>
      </div>
    `,
    footer: `
      <button class="btn btn-outline" onclick="this.closest('.modal-backdrop').remove()">Cancel</button>
      <button class="btn btn-success" id="btn-confirm-complete">
        <i class="bi bi-check-all"></i> Confirm Delivery & Complete
      </button>
    `,
    size: 'md'
  });
  
  // Handle image preview
  const fileInput = document.getElementById('delivery-proof-complete');
  const imagePreview = document.getElementById('image-preview-complete');
  
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
  
  const btnConfirm = document.getElementById('btn-confirm-complete');
  btnConfirm.addEventListener('click', async () => {
    const file = fileInput.files[0];
    
    if (!file) {
      showError('Please upload delivery proof image - this is required to complete the order');
      return;
    }
    
    try {
      btnConfirm.disabled = true;
      btnConfirm.innerHTML = '<i class="bi bi-hourglass-split"></i> Uploading & Completing...';
      
      await confirmOrder(orderId, file);
      showSuccess('Order completed with delivery proof!');
      
      // Close modal
      document.querySelector('.modal-backdrop').remove();
      
      // Reload orders
      await loadOrders();
      await loadDashboardStats();
    } catch (error) {
      console.error('Error completing order:', error);
      showError(error.message || 'Failed to complete order');
      btnConfirm.disabled = false;
      btnConfirm.innerHTML = '<i class="bi bi-check-all"></i> Confirm Delivery & Complete';
    }
  });
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
            <button class="btn btn-sm btn-outline" onclick="window.viewSellerIssueDetails('${issue.id}')">
              <i class="bi bi-eye"></i> View Details
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
};

window.viewSellerIssueDetails = async (issueId) => {
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

window.messageCustomer = (orderId) => {
  currentConversation = orderId;
  
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
      const response = await getOrderMessages(orderId);
      const messages = response.data?.messages || [];
      
      chatWindow.innerHTML = `
        <div class="flex flex-col h-96">
          <div id="chat-messages" class="flex-1 overflow-y-auto p-4 space-y-3">
            ${messages.map(msg => createMessageBubble(msg)).join('')}
          </div>
          
          <div class="border-t p-4">
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
          </div>
        </div>
      `;
      
      // Auto-scroll to bottom
      const messagesContainer = document.getElementById('chat-messages');
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      
      // Handle send message
      const chatForm = document.getElementById('chat-form');
      chatForm.addEventListener('submit', handleSendMessage);
      
    } catch (error) {
      console.error('Error loading messages:', error);
      showError('Failed to load messages');
    }
  }, 100);
};

window.viewOrderDetails = async (orderId) => {
  try {
    // Fetch fresh order data to get latest delivery proof images
    const response = await getOrderById(orderId);
    const order = response.data?.order;
    
    if (!order) {
      showError('Order not found');
      return;
    }

    // Fetch product reviews for this order
    let productReviews = [];
    try {
      const token = getToken();
      const reviewsResponse = await fetch(`/api/orders/${orderId}/reviews`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const reviewsResult = await reviewsResponse.json();
      if (reviewsResult.success && reviewsResult.data) {
        productReviews = reviewsResult.data.reviews || [];
      }
    } catch (err) {
      console.error('Error fetching reviews:', err);
    }

    const detailsHtml = `
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <p class="text-sm text-gray-600">Order Number</p>
          <p class="font-bold text-lg">#${order.order_number}</p>
        </div>
        <div>
          <p class="text-sm text-gray-600">Status</p>
          <p class="font-bold text-lg">
            <span class="badge badge-${order.status === 'pending' ? 'warning' : order.status === 'confirmed' ? 'info' : order.status === 'ready' ? 'primary' : order.status === 'completed' ? 'success' : 'danger'}">
              ${order.status.toUpperCase()}
            </span>
          </p>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <p class="text-sm text-gray-600">Order Date</p>
          <p class="font-semibold">${formatDate(order.created_at)}</p>
        </div>
        <div>
          <p class="text-sm text-gray-600">Delivery Option</p>
          <p class="font-semibold">${order.delivery_option}</p>
        </div>
      </div>

      <div>
        <p class="text-sm text-gray-600 mb-2">Buyer Information</p>
        <div class="bg-gray-50 p-3 rounded-lg space-y-1">
          <p class="font-semibold">${order.buyer?.user?.full_name || 'Unknown'}</p>
          ${order.buyer?.user?.email ? `<p class="text-sm text-gray-600"><i class="bi bi-envelope"></i> ${order.buyer.user.email}</p>` : ''}
          ${order.buyer?.user?.phone_number ? `<p class="text-sm text-gray-600"><i class="bi bi-telephone"></i> ${order.buyer.user.phone_number}</p>` : ''}
        </div>
      </div>

      <div>
        <p class="text-sm text-gray-600 mb-2">Delivery Address</p>
        <div class="bg-gray-50 p-3 rounded-lg">
          <p class="text-sm">${order.delivery_address || 'Not provided'}</p>
          <p class="text-sm text-gray-600">${order.delivery_location_name || ''}</p>
        </div>
      </div>

      ${order.preferred_date || order.preferred_time ? `
        <div>
          <p class="text-sm text-gray-600 mb-2">
            <i class="bi bi-calendar-check"></i> Buyer's Preferred Delivery
          </p>
          <div class="bg-blue-50 p-3 rounded-lg border border-blue-200">
            ${order.preferred_date ? `<p class="text-sm font-semibold"><i class="bi bi-calendar3"></i> ${new Date(order.preferred_date).toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>` : ''}
            ${order.preferred_time ? `<p class="text-sm mt-1"><i class="bi bi-clock"></i> ${order.preferred_time.charAt(0).toUpperCase() + order.preferred_time.slice(1)}</p>` : ''}
          </div>
        </div>
      ` : ''}

      <div>
        <p class="text-sm text-gray-600 mb-2">Order Items</p>
        <div class="space-y-2">
          ${order.items.map(item => `
            <div class="flex justify-between items-start bg-gray-50 p-2 rounded">
              <div>
                <p class="font-semibold">${item.product_name}</p>
                <p class="text-sm text-gray-600">${item.quantity} ${item.unit_type}</p>
              </div>
              <p class="font-semibold">${formatCurrency(item.subtotal)}</p>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="border-t pt-4">
        <div class="flex justify-between items-center">
          <p class="text-lg font-bold">Total Amount:</p>
          <p class="text-2xl font-bold text-success">${formatCurrency(order.total_amount)}</p>
        </div>
      </div>

      ${order.notes ? `
        <div>
          <p class="text-sm text-gray-600 mb-2">Buyer Notes</p>
          <div class="bg-gray-50 p-3 rounded-lg">
            <p class="text-sm">${order.notes}</p>
          </div>
        </div>
      ` : ''}

      ${productReviews.length > 0 ? `
        <div class="border-t pt-4">
          <p class="text-sm text-gray-600 mb-3">
            <i class="bi bi-star-fill text-warning"></i> Buyer Ratings & Reviews
          </p>
          <div class="space-y-3">
            ${productReviews.map(review => `
              <div class="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                <div class="flex items-start justify-between mb-2">
                  <div class="flex-1">
                    <p class="font-semibold text-sm">${review.product_name}</p>
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
                  <p class="text-sm text-gray-700 mt-2 italic">"${review.comment}"</p>
                ` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${order.seller_delivery_proof_url ? `
        <div class="border-t pt-4">
          <p class="text-sm text-gray-600 mb-2">
            <i class="bi bi-image"></i> Your Delivery Proof (Seller)
          </p>
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
          <p class="text-sm text-gray-600 mb-2">
            <i class="bi bi-image"></i> Buyer's Receipt Proof
          </p>
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

  const modal = createModal({
    title: `Order Details - #${order.order_number}`,
    content: detailsHtml,
    size: 'lg',
    footer: `
      <button class="btn btn-outline" data-modal-close>Close</button>
    `
  });
  
  } catch (error) {
    console.error('Error loading order details:', error);
    showError(error.message || 'Failed to load order details');
  }
};

// ============ Analytics ============

let salesChart = null;
let topProductsChart = null;

const loadAnalytics = async () => {
  try {
    showSpinner();
    
    // Load stats if not already loaded
    if (!currentStats) {
      await loadDashboardStats();
    }
    
    // Update stat cards
    const statProducts = document.getElementById('stat-products');
    const statPending = document.getElementById('stat-pending');  
    const statSales = document.getElementById('stat-sales');
    
    if (statProducts) statProducts.textContent = currentStats.total_products || 0;
    if (statPending) statPending.textContent = currentStats.pending_orders || 0;
    if (statSales) statSales.textContent = formatCurrency(currentStats.total_sales || 0);
    
    // Load and render charts
    await Promise.all([
      loadSalesChart(),
      loadTopProductsChart()
    ]);
    
  } catch (error) {
    console.error('Error loading analytics:', error);
    showError('Failed to load analytics data');
  } finally {
    hideSpinner();
  }
};

const loadSalesChart = async () => {
  try {
    const response = await getSalesOverTime('last_30_days');
    const chartData = response.data.sales;
    
    // Destroy existing chart if it exists
    if (salesChart) {
      salesChart.destroy();
    }
    
    const ctx = document.getElementById('sales-chart');
    if (!ctx) return;
    
    salesChart = new Chart(ctx, {
      type: 'line',
      data: chartData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          title: {
            display: true,
            text: 'Sales Overview (Last 30 Days)'
          },
          legend: {
            position: 'top',
          }
        },
        scales: {
          x: {
            display: true,
            title: {
              display: true,
              text: 'Date'
            }
          },
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: 'Sales (₱)'
            }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'Orders'
            },
            grid: {
              drawOnChartArea: false,
            },
          }
        }
      }
    });
    
  } catch (error) {
    console.error('Error loading sales chart:', error);
    // Show fallback message
    const chartContainer = document.getElementById('sales-chart')?.parentElement;
    if (chartContainer) {
      chartContainer.innerHTML = '<div class="text-center text-gray-500 py-8">Unable to load sales chart</div>';
    }
  }
};

const loadTopProductsChart = async () => {
  try {
    // First try to get products by sales
    let response = await getTopProducts(10, 'sales');
    console.log('Full top products response:', response); // Debug log
    console.log('Response structure:', {
      hasData: !!response.data,
      hasChartData: !!response.data?.chartData,
      hasAnalytics: !!response.data?.analytics,
      responseKeys: response ? Object.keys(response) : 'no response'
    });
    
    // Check if response has the expected structure
    if (!response || !response.success) {
      throw new Error('API call failed: ' + (response?.message || 'Unknown error'));
    }
    
    if (!response.data) {
      throw new Error('No data in response');
    }
    
    // Handle different response structures
    let chartData, products;
    if (response.data.chartData) {
      chartData = response.data.chartData;
      products = response.data.products;
    } else if (response.data.analytics) {
      chartData = response.data.analytics.chartData;
      products = response.data.analytics.products;
    } else {
      throw new Error('No chart data found in response structure');
    }
    
    let chartTitle = 'Top Products by Sales';
    
    // If no sales data, fallback to views or orders
    if (!chartData || !chartData.labels || chartData.labels.length === 0 || 
        (chartData.datasets && chartData.datasets[0] && chartData.datasets[0].data && 
         chartData.datasets[0].data.length > 0 && chartData.datasets[0].data.every(val => val === 0))) {
      
      console.log('No sales data, trying views...');
      // Try by views
      response = await getTopProducts(5, 'views');
      if (response && response.success && response.data && response.data.chartData && 
          response.data.chartData.labels && response.data.chartData.labels.length > 0) {
        chartData = response.data.chartData;
        chartTitle = 'Top Products by Views';
      } else {
        console.log('No views data, trying orders...');
        // Try by orders as last resort
        response = await getTopProducts(5, 'orders');
        if (response && response.success && response.data && response.data.chartData && 
            response.data.chartData.labels && response.data.chartData.labels.length > 0) {
          chartData = response.data.chartData;
          chartTitle = 'Top Products by Orders';
        }
      }
    }
    
    // Check if we still have no data to display
    if (!chartData || !chartData.labels || chartData.labels.length === 0) {
      const chartContainer = document.getElementById('products-chart')?.parentElement;
      if (chartContainer) {
        chartContainer.innerHTML = '<div class="text-center text-gray-500 py-8"><i class="bi bi-box text-4xl mb-2 block"></i><p>No active products yet</p><p class="text-sm">Add some products to see analytics</p></div>';
      }
      return;
    }
    
    // Destroy existing chart if it exists
    if (topProductsChart) {
      topProductsChart.destroy();
    }
    
    const ctx = document.getElementById('products-chart');
    if (!ctx) {
      console.error('Canvas element not found!');
      return;
    }
    
    console.log('Creating chart with data:', chartData);
    
    topProductsChart = new Chart(ctx, {
      type: 'doughnut',
      data: chartData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: chartTitle
          },
          legend: {
            position: 'right',
            labels: {
              boxWidth: 12,
              usePointStyle: true
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.label || '';
                const isMonetary = chartTitle.includes('Sales');
                const value = isMonetary ? formatCurrency(context.parsed || 0) : (context.parsed || 0);
                const dataset = context.dataset;
                if (dataset.data.length === 0) return label;
                const total = dataset.data.reduce((sum, val) => sum + val, 0);
                if (total === 0) return `${label}: ${isMonetary ? '₱0' : '0'}`;
                const percentage = ((context.parsed / total) * 100).toFixed(1);
                return `${label}: ${value} (${percentage}%)`;
              }
            }
          }
        }
      }
    });
    
    console.log('Chart created successfully');
    
  } catch (error) {
    console.error('Detailed error loading top products chart:', error);
    console.log('Error stack:', error.stack);
    
    // Show fallback message
    const chartContainer = document.getElementById('products-chart')?.parentElement;
    if (chartContainer) {
      chartContainer.innerHTML = `<div class="text-center text-gray-500 py-8">
        <i class="bi bi-exclamation-triangle text-4xl mb-2 block text-warning"></i>
        <p>Unable to load top products chart</p>
        <p class="text-sm">Error: ${error.message}</p>
        <p class="text-xs">Check browser console for details</p>
      </div>`;
    }
  }
};

const cleanupCharts = () => {
  // Destroy existing charts to prevent memory leaks
  if (salesChart) {
    salesChart.destroy();
    salesChart = null;
  }
  
  if (topProductsChart) {
    topProductsChart.destroy(); 
    topProductsChart = null;
  }
};

// ============ Profile ============

const loadProfile = async () => {
  const profileContent = document.getElementById('profile-content');
  if (!profileContent) return;
  
  try {
    const user = getUser();
    if (!user) {
      profileContent.innerHTML = '<p class="text-center text-gray-500">Unable to load profile</p>';
      return;
    }
    
    profileContent.innerHTML = `
      <div class="card">
        <div class="card-body">
          <h3 class="text-xl font-bold mb-4">Seller Information</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label class="block text-sm text-gray-600 mb-2">Full Name</label>
              <p class="text-lg font-semibold">${user.full_name || 'N/A'}</p>
            </div>
            <div>
              <label class="block text-sm text-gray-600 mb-2">Email</label>
              <p class="text-lg font-semibold">${user.email || 'N/A'}</p>
            </div>
            <div>
              <label class="block text-sm text-gray-600 mb-2">Phone Number</label>
              <p class="text-lg font-semibold">${user.phone_number || 'N/A'}</p>
            </div>
            <div>
              <label class="block text-sm text-gray-600 mb-2">Status</label>
              <p class="text-lg font-semibold"><span class="badge badge-success">${user.status || 'N/A'}</span></p>
            </div>
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Error loading profile:', error);
    profileContent.innerHTML = '<p class="text-center text-red-500">Error loading profile</p>';
  }
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

// Direct badge update (without fetching conversations)
const updateMessageBadgeDirectly = (count) => {
  // Use centralized navbar function for consistency
  updateMessagesCount(count);
};

// ============ Messaging ============

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

// Update conversation preview with new message (for real-time updates)
const updateConversationPreview = (orderId, messageText) => {
  const item = document.querySelector(`[data-order-id="${orderId}"]`);
  if (item) {
    const messagePreview = item.querySelector('p:nth-child(2)');
    if (messagePreview) {
      messagePreview.textContent = messageText;

    }
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
  
  // Use userId from parameter, global storage, or will get from API response
  if (!userId && window.conversationUserId) {
    userId = window.conversationUserId;
  }
  
  // Ensure socket is initialized and connected
  try {
    const { initSocket } = await import('../services/socket.service.js');
    const socket = initSocket();
    
    if (!socket) {
      console.error('Failed to initialize socket');
      showError('Real-time messaging not available');
    } else {
      // Give socket a moment to establish connection
      setTimeout(async () => {
        try {
          const { default: socketService } = await import('../services/socket.service.js');
          socketService.joinConversation(orderId);
        } catch (err) {
          console.error('Failed to join conversation:', err);
        }
      }, 100);
    }
  } catch (error) {
    console.warn('Failed to initialize socket connection:', error);
  }
  
  const chatWindow = document.getElementById('chat-window');
  
  if (!chatWindow) {
    console.error('Chat window element not found');
    return;
  }
  
  try {
    // Mark messages as read immediately when opening conversation
    try {
        const markReadResponse = await markMessagesAsRead(orderId);
      // Immediately update the conversation badge to hide it
      updateConversationBadge(orderId);
      
      // Immediately update navbar badge
      updateMessageBadge();
    } catch (error) {
      console.error('Failed to mark messages as read:', error);
      showError('Failed to mark messages as read');
    }
    
    // Resolve buyerId early - use passed userId, global storage, or will get from response
    let buyerId = userId || window.conversationUserId;
    
    // Get fresh message data
    const response = await getOrderMessages(orderId);
    const messages = response.data?.messages || [];
    const userRole = response.data?.user_role || 'seller';
    const buyerName = response.data?.buyer_name || 'Buyer';
    const orderStatus = response.data?.order_status;
    const isCancelled = orderStatus === 'cancelled';
    
    // If still no buyerId, get from response
    if (!buyerId && response.data?.buyer_id) {
      buyerId = response.data.buyer_id;
    }
    
    chatWindow.innerHTML = `
      <div class="flex flex-col h-96">
        <div class="border-b p-4 bg-gray-50" id="chat-header">
          <div class="flex justify-between items-center">
            <div>
              <h3 class="font-bold text-lg" id="chat-user-name">${buyerName}</h3>
              <p class="text-sm text-gray-600">Order #${orderId}</p>
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
    
    // Auto-scroll to bottom
    const messagesContainer = document.getElementById('chat-messages');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Handle send message
    const chatForm = document.getElementById('chat-form');
    chatForm.addEventListener('submit', handleSendMessage);
    
  } catch (error) {
    console.error('Error loading messages:', error);
    showError('Failed to load messages');
  }
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
    
    // Reload conversations list to show the new message
    await loadConversations();
    
    // Reopen the chat with the latest messages
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
    const { initSocket, on, onInitialOnlineUsers, onUserOnline, onUserOffline, onNotification } = await import('../services/socket.service.js');
    
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
      
      // Listen for new orders
      on('order:new', (data) => {
        showToast(`New order received: #${data.order_number}`, 'success');
        loadOrders();
        loadDashboardStats();
      });
      
      // Listen for cancelled orders
      on('order:cancelled', (data) => {
        showToast(`Order #${data.order_number} was cancelled`, 'warning');
        loadOrders();
      });
      
      // Listen for new messages from socket
      on('message_received', (data) => {
        // Check if user is currently viewing this conversation
        const isViewingThisConversation = currentPage === 'messaging' && currentConversation === data.order_id;
        
        // Only show notification and update badge if NOT currently viewing this conversation
        if (!isViewingThisConversation) {
          // Show notification toast for new messages
          if (data) {
            const senderName = data.sender?.full_name || data.sender_name || 'Buyer';
            const messagePreview = data.message_text?.substring(0, 50) || 'New message';
            showToast(`📨 ${senderName}: ${messagePreview}`, 'info', 5000, false);
          }
          
          // Play message sound
          playMessageSound();
          
          // Reload conversations to update message preview and badges from server
          loadConversations();
          
          // Update message badge in navbar
          updateMessageBadge();
        } else {
          // User is viewing the conversation, just add the message to chat in real-time
          const chatMessages = document.getElementById('chat-messages');
          if (chatMessages) {
            addMessageBubbleToChat(data);
          }
          
          // Auto-mark incoming messages as read if user is viewing the conversation
          setTimeout(async () => {
            try {
              await markMessagesAsRead(data.order_id);
              
              // Update badge after marking as read
              updateConversationBadge(data.order_id);
              updateMessageBadge();
            } catch (error) {
              console.error('Failed to auto-mark message as read:', error);
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
      
      // Listen for notifications
      onNotification((data) => {

        if (data.type === 'new_message' || data.type === 'message') {
          // Additional notification handling
          updateMessageBadge();
        }
      });
      
      // Also listen for generic notification event
      on('notification', (data) => {

        if (data.type === 'message' || data.type === 'new_message') {
          updateMessageBadge();
        }
      });
      
      // Listen for notification:new event (alternative)
      on('notification:new', (data) => {

        if (data.type === 'message' || data.type === 'new_message') {
          updateMessageBadge();
        }
      });
    }
  } catch (error) {
    // Silently fail
  }
};

// Add new message bubble to chat in real-time
const addMessageBubbleToChat = (message) => {
  const chatMessages = document.getElementById('chat-messages');
  if (!chatMessages) {
    return;
  }
  
  // Get current user from auth
  const currentUser = getCurrentUserSync();
  const currentUserId = currentUser?.id;
  
  // Determine if this is a sent message
  const isSender = message.sender_id === currentUserId;
  
  const alignClass = isSender ? 'justify-end' : 'justify-start';
  const bgClass = isSender ? 'bg-primary text-white' : 'bg-gray-200';
  
  // Get sender name - try multiple possible field names
  const senderName = message.sender?.full_name || message.senderName || message.sender_name || (isSender ? 'You' : 'Buyer');
  
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

let eventListeners = [];

const attachEventListeners = () => {
  const btnCreateProduct = document.getElementById('btn-create-product');
  if (btnCreateProduct) {
    const createHandler = () => window.showProductModal();
    btnCreateProduct.addEventListener('click', createHandler);
    eventListeners.push({ element: btnCreateProduct, event: 'click', handler: createHandler });
  }
};

const cleanupEventListeners = () => {
  eventListeners.forEach(({ element, event, handler }) => {
    if (element) {
      element.removeEventListener(event, handler);
    }
  });
  eventListeners = [];
};

// Cleanup on page unload or navigation
window.addEventListener('beforeunload', cleanupEventListeners);
window.addEventListener('hashchange', cleanupEventListeners);

// ============ Initialize on Load ============

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export { init, loadProducts, loadOrders };
// assets/js/pages/seller.main.js
// Seller Dashboard Main Script

import { renderNavbar, updateOrdersCount, updateMessagesCount } from '../components/navbar.js';
import { showToast, showError, showSuccess, showWarning } from '../components/toast.js';
import { showSpinner, hideSpinner } from '../components/loading-spinner.js';
import { createModal } from '../components/modal.js';
import { openIssueModal } from '../components/issue-modal.js';
import { requireAuth, requireVerification, getUser, getToken, getUserId } from '../core/auth.js';
import { formatCurrency, formatDate, formatRelativeTime } from '../utils/formatters.js';
import { ENDPOINTS, buildUrl } from '../config/api.js';

// Services
import { 
  getMyProducts, 
  createProduct, 
  updateProduct, 
  deleteProduct as deleteProductRequest,
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
  sendMessageWithAttachment,
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
import { getDeliveryProofUrl, getIssueEvidenceUrl, getMessageAttachmentUrl } from '../utils/image-helpers.js';
import { initNotificationSounds, playMessageSound } from '../features/notifications/notification-sound.js';

// ============ State ============

let currentPage = 'products'; // Track current section
let currentProducts = [];
let currentOrders = [];
let currentStats = null;
let editingProduct = null;
let removedExistingPhotos = new Set();
let currentConversation = null;
let currentConversationOrderIds = [];
let currentConversationSendOrderId = null;
let selectedMessageAttachment = null;
let hasAttachmentPreviewDelegation = false;
let socketEmit = null;
let isTypingActive = false;
let typingStopTimer = null;
let typingIndicatorHideTimer = null;
const typingPreviewByOrderId = new Map();
const typingPreviewTimers = new Map();
let onlineUsers = new Set(); // Track online users
let initialOnlineUsersPromise = Promise.resolve(); // Promise that resolves when initial online users are loaded
let orderFilters = {
  status: 'all',
  page: 1,
  limit: 20
};
let ordersTotalPages = 1;
let ordersTotalItems = 0;
let ordersStatsCollapsed = false;
let issuesStatsCollapsed = false;
let productsFiltersCollapsed = false;
let productFilters = {
  search: '',
  status: 'all',
  category: 'all',
  stock: 'all'
};
let pendingServerProductFilters = {
  status: 'all',
  category: 'all'
};
let allLoadedProducts = [];
let selectedProductIds = new Set();
let productUndoDeletes = new Map();
let productFeedbackTimer = null;
let productSearchSuggestions = [];
let issueFilters = {
  status: 'all',
  search: '',
  sort: 'newest'
};
let currentIssues = [];
let currentConversations = []; // Cache conversations data
let conversationFilters = {
  search: '',
  unreadOnly: false,
  sort: 'newest'
};
let messagingMobileView = 'list';
let productSearchDebounceTimer = null;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeOrderRef = (value) => String(value ?? '').trim();

const isUuidOrderRef = (value) => UUID_PATTERN.test(normalizeOrderRef(value));

const getCanonicalOrderId = (order) => {
  if (!order || typeof order !== 'object') return '';
  const candidates = [order.id, order.order_id, order.orderId, order.uuid, order.order_uuid]
    .map(normalizeOrderRef)
    .filter(Boolean);
  const uuidCandidate = candidates.find(isUuidOrderRef);
  if (uuidCandidate) return uuidCandidate;
  return candidates[0] || normalizeOrderRef(order.order_number);
};

const matchesOrderReference = (order, orderRef) => {
  const normalizedRef = normalizeOrderRef(orderRef);
  if (!normalizedRef) return false;
  return [
    order?.id,
    order?.order_id,
    order?.orderId,
    order?.uuid,
    order?.order_uuid,
    order?.order_number
  ].map(normalizeOrderRef).includes(normalizedRef);
};

const findOrderByReference = (orderRef) => {
  const normalizedRef = normalizeOrderRef(orderRef);
  if (!normalizedRef) return null;
  return currentOrders.find((order) => matchesOrderReference(order, normalizedRef)) || null;
};

const resolveOrderApiId = (orderRef) => {
  const normalizedRef = normalizeOrderRef(orderRef);
  if (!normalizedRef) return '';
  if (isUuidOrderRef(normalizedRef)) return normalizedRef;

  const matchedOrder = findOrderByReference(normalizedRef);
  if (matchedOrder) {
    const canonical = getCanonicalOrderId(matchedOrder);
    if (canonical) return canonical;
  }

  const matchedConversation = currentConversations.find((conv) => {
    const refs = [
      conv?.order_id,
      conv?.order_number,
      ...(Array.isArray(conv?.order_ids) ? conv.order_ids : [])
    ].map(normalizeOrderRef);
    return refs.includes(normalizedRef);
  });

  if (matchedConversation) {
    const conversationId = [
      matchedConversation?.order_id,
      ...(Array.isArray(matchedConversation?.order_ids) ? matchedConversation.order_ids : [])
    ].map(normalizeOrderRef).find(Boolean);
    if (conversationId) return conversationId;
  }

  return normalizedRef;
};

const debounce = (fn, delay = 200) => {
  let timeoutId = null;
  return (...args) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

const isMessagingMobileViewport = () => window.matchMedia('(max-width: 767px)').matches;

const syncMessagingPanelsVisibility = () => {
  const messagingSection = document.getElementById('messaging');
  const conversationsPanel = document.getElementById('conversations-panel');
  const chatPanel = document.getElementById('chat-panel');
  if (!messagingSection || !conversationsPanel || !chatPanel) return;

  if (!isMessagingMobileViewport()) {
    conversationsPanel.classList.remove('hidden');
    chatPanel.classList.remove('hidden');
    messagingSection.classList.remove('is-mobile-chat-open');
    return;
  }

  const hasRenderedChat = Boolean(chatPanel.querySelector('.buyer-chat-shell'));
  const showChat = messagingMobileView === 'chat' && (Boolean(currentConversation) || hasRenderedChat);
  conversationsPanel.classList.toggle('hidden', showChat);
  chatPanel.classList.toggle('hidden', !showChat);
  messagingSection.classList.toggle('is-mobile-chat-open', showChat);
};

const setMessagingMobileView = (view) => {
  messagingMobileView = view === 'chat' ? 'chat' : 'list';
  syncMessagingPanelsVisibility();
};

const applyConversationFiltersToUi = () => {
  const searchInput = document.getElementById('conversation-search');
  const unreadOnly = document.getElementById('conversation-unread-only');
  const sortSelect = document.getElementById('conversation-sort');
  const clearBtn = document.getElementById('conversation-search-clear');
  if (searchInput) searchInput.value = conversationFilters.search || '';
  if (unreadOnly) unreadOnly.checked = Boolean(conversationFilters.unreadOnly);
  if (sortSelect) sortSelect.value = conversationFilters.sort || 'newest';
  if (clearBtn) clearBtn.classList.toggle('is-visible', Boolean((conversationFilters.search || '').trim()));
};

const applyIssueFiltersToUi = () => {
  const searchInput = document.getElementById('issues-search');
  const sortSelect = document.getElementById('issues-sort');
  if (searchInput) searchInput.value = issueFilters.search || '';
  if (sortSelect) sortSelect.value = issueFilters.sort || 'newest';
};

const renderMessagingEmptyState = () => `
  <div class="buyer-chat-empty-state">
    <i class="bi bi-chat-left-text"></i>
    <p class="title">Select a conversation to start messaging</p>
    <p class="subtitle">Choose a thread on the left or jump to your latest unread conversation.</p>
    <button type="button" class="btn btn-outline btn-sm" onclick="window.openLatestUnreadConversation?.()">
      <i class="bi bi-lightning-charge"></i> Open latest unread
    </button>
  </div>
`;

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
  loadOrderStats().catch(err => console.error('Error loading order stats:', err));
  loadOrders().catch(err => console.error('Error loading orders:', err));
  updateMessageBadge().catch(err => console.error('Error updating message badge:', err));
  
  // Attach event listeners
  attachEventListeners();
  initializeProductFilterControls();
  applyConversationFiltersToUi();
  applyIssueFiltersToUi();
  applyProductsFiltersCollapsedState();
  applyIssuesStatsCollapsedState();
};

// ============ Navigation ============

const setupNavigation = () => {
  const handleHashChange = () => {
    const hash = window.location.hash.slice(1) || 'products';
    showPage(hash);
  };
  
  window.addEventListener('hashchange', handleHashChange);
  window.addEventListener('resize', syncMessagingPanelsVisibility);
  window.addEventListener('resize', updateCreateProductFabVisibility);
  window.addEventListener('resize', applyProductsFiltersCollapsedState);
  window.addEventListener('resize', applyOrdersStatsCollapsedState);
  window.addEventListener('resize', applyIssuesStatsCollapsedState);
  
  // Cleanup charts when page is unloaded
  window.addEventListener('beforeunload', cleanupCharts);
  
  // Handle initial navigation
  if (document.readyState === 'complete') {
    handleHashChange();
  } else {
    window.addEventListener('load', handleHashChange);
  }
};

const updateCreateProductFabVisibility = () => {
  const fabButton = document.getElementById('btn-create-product-fab');
  if (!fabButton) return;

  const isMobileViewport = window.matchMedia('(max-width: 767px)').matches;
  const shouldShowFab = isMobileViewport && currentPage === 'products';
  fabButton.style.setProperty('display', shouldShowFab ? 'inline-flex' : 'none', 'important');
};

const showPage = (page) => {
  // Update current page tracking
  currentPage = page;
  
  // Update URL hash to persist section on reload
  if (window.location.hash.slice(1) !== page) {
    window.location.hash = page;
  }
  
  // Clean up charts when leaving analytics page
  if (page !== 'analytics') {
    cleanupCharts();
  }
  
  // Close conversation when leaving messaging section
  if (page !== 'messaging') {
    stopTypingSignal();
    hideTypingIndicator();
    currentConversation = null;
    currentConversationOrderIds = [];
    currentConversationSendOrderId = null;
    messagingMobileView = 'list';
    const chatWindow = document.getElementById('chat-window');
    if (chatWindow) {
      chatWindow.innerHTML = renderMessagingEmptyState();
    }
  }
  
  // Hide all sections by setting display: none with !important
  const mainContent = document.querySelector('.container.mx-auto');
  if (mainContent) {
    mainContent.querySelectorAll('section').forEach(section => {
      section.style.setProperty('display', 'none', 'important');
    });
  }
  
  // Show requested section
  const section = document.getElementById(page);
  updateCreateProductFabVisibility();
  
  if (section) {
    section.style.setProperty('display', 'block', 'important');
    
    // Load page-specific data
    switch(page) {
      case 'products':
        loadProducts();
        applyProductsFiltersCollapsedState();
        break;
      case 'orders':
        loadOrderStats();
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
        syncMessagingPanelsVisibility();
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

const initializeProductFilterControls = () => {
  const statusFilter = document.getElementById('product-status-filter');
  const categoryFilter = document.getElementById('product-category-filter');
  const stockFilter = document.getElementById('product-stock-filter');
  const searchInput = document.getElementById('product-search');
  const resetButton = document.getElementById('btn-reset-product-filters');
  const applyButton = document.getElementById('btn-apply-product-filters');
  const suggestionsContainer = document.getElementById('product-search-suggestions');
  const bulkCategorySelect = document.getElementById('bulk-category-select');
  const selectAllCheckbox = document.getElementById('products-select-all');
  const tableBody = document.getElementById('products-table-body');
  const mobileView = document.getElementById('products-mobile-view');
  const fabButton = document.getElementById('btn-create-product-fab');
  const bulkPauseButton = document.getElementById('btn-bulk-pause');
  const bulkDeleteButton = document.getElementById('btn-bulk-delete');
  const bulkCategoryApplyButton = document.getElementById('btn-bulk-category-apply');

  const categories = [...new Set(Object.values(PRODUCT_CATEGORIES || {}))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  if (categoryFilter && categoryFilter.dataset.optionsLoaded !== '1') {
    categoryFilter.innerHTML = `
      <option value="all">All categories</option>
      ${categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category.replace(/_/g, ' '))}</option>`).join('')}
    `;
    categoryFilter.dataset.optionsLoaded = '1';
  }
  if (bulkCategorySelect && bulkCategorySelect.dataset.optionsLoaded !== '1') {
    bulkCategorySelect.innerHTML = `
      <option value="">Change category...</option>
      ${categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category.replace(/_/g, ' '))}</option>`).join('')}
    `;
    bulkCategorySelect.dataset.optionsLoaded = '1';
  }

  if (statusFilter) statusFilter.value = pendingServerProductFilters.status;
  if (categoryFilter) categoryFilter.value = pendingServerProductFilters.category;
  if (stockFilter) stockFilter.value = productFilters.stock;
  if (searchInput) searchInput.value = productFilters.search;
  updateProductFilterApplyButtonState();

  if (statusFilter && statusFilter.dataset.bound !== '1') {
    statusFilter.dataset.bound = '1';
    statusFilter.addEventListener('change', () => {
      pendingServerProductFilters.status = statusFilter.value || 'all';
      updateProductFilterApplyButtonState();
    });
  }

  if (categoryFilter && categoryFilter.dataset.bound !== '1') {
    categoryFilter.dataset.bound = '1';
    categoryFilter.addEventListener('change', () => {
      pendingServerProductFilters.category = categoryFilter.value || 'all';
      updateProductFilterApplyButtonState();
    });
  }

  if (stockFilter && stockFilter.dataset.bound !== '1') {
    stockFilter.dataset.bound = '1';
    stockFilter.addEventListener('change', () => {
      productFilters.stock = stockFilter.value || 'all';
      renderSearchSuggestions();
      renderProductsFromCache();
    });
  }

  if (searchInput && searchInput.dataset.bound !== '1') {
    searchInput.dataset.bound = '1';
    searchInput.addEventListener('input', (event) => {
      productFilters.search = (event.target?.value || '').trim();
      renderSearchSuggestions();
      if (productSearchDebounceTimer) {
        clearTimeout(productSearchDebounceTimer);
      }
      productSearchDebounceTimer = setTimeout(() => {
        renderProductsFromCache();
      }, 180);
    });
    searchInput.addEventListener('focus', () => {
      renderSearchSuggestions();
    });
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        closeProductSuggestions();
        renderProductsFromCache();
      }
      if (event.key === 'Escape') {
        closeProductSuggestions();
      }
    });
  }

  if (suggestionsContainer && suggestionsContainer.dataset.bound !== '1') {
    suggestionsContainer.dataset.bound = '1';
    suggestionsContainer.addEventListener('click', (event) => {
      const option = event.target.closest('[data-product-suggestion]');
      if (!option) return;
      const selectedValue = option.dataset.productSuggestion || '';
      if (searchInput) {
        searchInput.value = selectedValue;
      }
      productFilters.search = selectedValue;
      closeProductSuggestions();
      renderProductsFromCache();
    });
  }

  if (applyButton && applyButton.dataset.bound !== '1') {
    applyButton.dataset.bound = '1';
    applyButton.addEventListener('click', () => {
      productFilters.status = pendingServerProductFilters.status;
      productFilters.category = pendingServerProductFilters.category;
      clearProductSelections();
      loadProducts();
    });
  }

  if (resetButton && resetButton.dataset.bound !== '1') {
    resetButton.dataset.bound = '1';
    resetButton.addEventListener('click', () => {
      productFilters = {
        search: '',
        status: 'all',
        category: 'all',
        stock: 'all'
      };
      pendingServerProductFilters = {
        status: 'all',
        category: 'all'
      };
      clearProductSelections();
      closeProductSuggestions();
      initializeProductFilterControls();
      loadProducts();
    });
  }

  if (selectAllCheckbox && selectAllCheckbox.dataset.bound !== '1') {
    selectAllCheckbox.dataset.bound = '1';
    selectAllCheckbox.addEventListener('change', () => {
      const shouldSelect = Boolean(selectAllCheckbox.checked);
      currentProducts.forEach((product) => {
        if (shouldSelect) {
          selectedProductIds.add(String(product.id));
        } else {
          selectedProductIds.delete(String(product.id));
        }
      });
      syncProductSelectionUi();
      applyProductSelectionToDom();
    });
  }

  if (tableBody && tableBody.dataset.bound !== '1') {
    tableBody.dataset.bound = '1';
    tableBody.addEventListener('click', handleProductActionEvents);
    tableBody.addEventListener('change', handleProductSelectionEvents);
  }
  if (mobileView && mobileView.dataset.bound !== '1') {
    mobileView.dataset.bound = '1';
    mobileView.addEventListener('click', handleProductActionEvents);
    mobileView.addEventListener('change', handleProductSelectionEvents);
  }

  if (fabButton && fabButton.dataset.bound !== '1') {
    fabButton.dataset.bound = '1';
    fabButton.addEventListener('click', () => window.showProductModal());
  }
  if (bulkPauseButton && bulkPauseButton.dataset.bound !== '1') {
    bulkPauseButton.dataset.bound = '1';
    bulkPauseButton.addEventListener('click', () => handleBulkPauseProducts());
  }
  if (bulkDeleteButton && bulkDeleteButton.dataset.bound !== '1') {
    bulkDeleteButton.dataset.bound = '1';
    bulkDeleteButton.addEventListener('click', () => handleBulkDeleteProducts());
  }
  if (bulkCategoryApplyButton && bulkCategoryApplyButton.dataset.bound !== '1') {
    bulkCategoryApplyButton.dataset.bound = '1';
    bulkCategoryApplyButton.addEventListener('click', () => handleBulkCategoryUpdate());
  }

  if (document.body && document.body.dataset.productSuggestionBound !== '1') {
    document.body.dataset.productSuggestionBound = '1';
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.seller-search-wrap')) {
        closeProductSuggestions();
      }
    });
  }
};

const getStockMeta = (quantity) => {
  if (quantity <= 0) return { shortLabel: 'Out', label: 'Out of stock', className: 'badge-danger' };
  if (quantity <= 10) return { shortLabel: 'Low', label: 'Low stock', className: 'badge-warning' };
  return { shortLabel: 'OK', label: 'In stock', className: 'badge-success' };
};

const formatListingStatus = (status) => {
  const normalized = String(status || 'draft').toLowerCase();
  if (normalized === 'pending_approval') return 'Pending Approval';
  if (normalized === 'rejected_by_admin') return 'Needs Changes';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const highlightMatchHtml = (value, query) => {
  const safeValue = escapeHtml(value || '');
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return safeValue;
  const escaped = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safeValue.replace(new RegExp(`(${escaped})`, 'ig'), '<mark>$1</mark>');
};

const updateProductFilterApplyButtonState = () => {
  const applyButton = document.getElementById('btn-apply-product-filters');
  if (!applyButton) return;
  const isDirty = (
    pendingServerProductFilters.status !== productFilters.status
    || pendingServerProductFilters.category !== productFilters.category
  );
  applyButton.disabled = !isDirty;
  applyButton.classList.toggle('btn-primary', isDirty);
  applyButton.classList.toggle('btn-outline', !isDirty);
};

const closeProductSuggestions = () => {
  const container = document.getElementById('product-search-suggestions');
  if (!container) return;
  container.classList.remove('is-open');
  container.innerHTML = '';
};

const buildProductSearchSuggestions = (products = []) => {
  const query = String(productFilters.search || '').trim().toLowerCase();
  if (!query) {
    productSearchSuggestions = [];
    return;
  }

  const source = [];
  products.forEach((product) => {
    [product?.name, product?.category, product?.municipality, product?.unit_type]
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .forEach((item) => source.push(item));
  });

  productSearchSuggestions = [...new Set(source)]
    .filter((item) => item.toLowerCase().includes(query))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 8);
};

const renderSearchSuggestions = () => {
  buildProductSearchSuggestions(allLoadedProducts);
  const container = document.getElementById('product-search-suggestions');
  if (!container) return;
  if (!productSearchSuggestions.length) {
    closeProductSuggestions();
    return;
  }

  const query = productFilters.search || '';
  container.innerHTML = productSearchSuggestions.map((value) => `
    <button type="button" class="seller-search-suggestion" data-product-suggestion="${escapeHtml(value)}" role="option">
      ${highlightMatchHtml(value, query)}
    </button>
  `).join('');
  container.classList.add('is-open');
};

const showProductInlineFeedback = (message = '', type = 'info', duration = 2600) => {
  const feedback = document.getElementById('products-feedback');
  if (!feedback) return;

  feedback.textContent = message;
  feedback.classList.remove('is-success', 'is-error');
  if (type === 'success') feedback.classList.add('is-success');
  if (type === 'error') feedback.classList.add('is-error');

  if (productFeedbackTimer) clearTimeout(productFeedbackTimer);
  if (!message || duration <= 0) return;
  productFeedbackTimer = setTimeout(() => {
    feedback.textContent = '';
    feedback.classList.remove('is-success', 'is-error');
  }, duration);
};

const applyClientProductFilters = (products = []) => {
  const normalizedSearch = (productFilters.search || '').toLowerCase();

  return products.filter((product) => {
    const stock = Number(product.available_quantity) || 0;
    if (productFilters.stock === 'low' && (stock <= 0 || stock > 10)) {
      return false;
    }
    if (productFilters.stock === 'out' && stock > 0) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    const searchableText = [
      product.name,
      product.category,
      product.municipality,
      product.unit_type
    ]
      .map((item) => String(item || '').toLowerCase())
      .join(' ');

    return searchableText.includes(normalizedSearch);
  });
};

const renderProductSummary = (totalProducts, filteredProducts) => {
  const summaryElement = document.getElementById('products-summary');
  if (!summaryElement) return;

  const draftCount = filteredProducts.filter((product) => product.status === 'draft').length;
  const pausedCount = filteredProducts.filter((product) => product.status === 'paused').length;
  const activeCount = filteredProducts.filter((product) => product.status === 'active').length;
  const pendingCount = filteredProducts.filter((product) => product.status === 'pending_approval').length;
  const rejectedCount = filteredProducts.filter((product) => product.status === 'rejected_by_admin').length;
  const lowStockCount = filteredProducts.filter((product) => {
    const quantity = Number(product.available_quantity) || 0;
    return quantity > 0 && quantity <= 10;
  }).length;
  const outOfStockCount = filteredProducts.filter((product) => (Number(product.available_quantity) || 0) === 0).length;

  summaryElement.innerHTML = `
    <span class="seller-summary-chip seller-summary-chip--primary"><strong>${filteredProducts.length}</strong> shown</span>
    <span class="seller-summary-chip"><strong>${totalProducts}</strong> total</span>
    <span class="seller-summary-chip"><strong>${activeCount}</strong> active</span>
    <span class="seller-summary-chip"><strong>${draftCount}</strong> draft</span>
    <span class="seller-summary-chip"><strong>${pausedCount}</strong> paused</span>
    <span class="seller-summary-chip"><strong>${pendingCount}</strong> pending approval</span>
    <span class="seller-summary-chip"><strong>${rejectedCount}</strong> needs changes</span>
    <span class="seller-summary-chip"><strong>${lowStockCount}</strong> low stock</span>
    <span class="seller-summary-chip"><strong>${outOfStockCount}</strong> out of stock</span>
  `;
};

const loadProducts = async () => {
  const tbody = document.getElementById('products-table-body');
  const mobileView = document.getElementById('products-mobile-view');
  if (!tbody && !mobileView) return;

  initializeProductFilterControls();
  updateProductFilterApplyButtonState();

  const skeletonRows = Array.from({ length: 4 }).map(() => `
    <tr>
      <td colspan="8" class="py-3">
        <div class="home-skeleton shimmer h-10 rounded-lg"></div>
      </td>
    </tr>
  `).join('');
  const skeletonCards = Array.from({ length: 3 }).map(() => `
    <div class="seller-product-card p-3">
      <div class="home-skeleton shimmer h-4 rounded mb-2"></div>
      <div class="home-skeleton shimmer h-4 rounded mb-2"></div>
      <div class="home-skeleton shimmer h-9 rounded"></div>
    </div>
  `).join('');
  if (tbody) tbody.innerHTML = skeletonRows;
  if (mobileView) mobileView.innerHTML = skeletonCards;
  
  try {
    const serverFilters = {};
    if (productFilters.status !== 'all') {
      serverFilters.status = productFilters.status;
    }
    if (productFilters.category !== 'all') {
      serverFilters.category = productFilters.category;
    }

    const response = await getMyProducts(serverFilters);
    const allProducts = response.data?.products || [];
    allLoadedProducts = allProducts.filter((product) => !productUndoDeletes.has(String(product.id)));
    renderSearchSuggestions();
    renderProductsFromCache();
    showProductInlineFeedback('', 'info', 0);
    
  } catch (error) {
    console.error('Error loading products:', error);
    allLoadedProducts = [];
    currentProducts = [];
    closeProductSuggestions();
    renderProductSummary(0, []);
    
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
            <td colspan="8" class="text-center py-12">
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
          <td colspan="8" class="text-center py-8 text-danger">
            ${errorMessage}
          </td>
        </tr>
      `;
    }
    if (mobileView) {
      mobileView.innerHTML = `<div class="text-center py-8 text-danger">${errorMessage}</div>`;
    }
    showProductInlineFeedback(errorMessage, 'error');
  }
};

const createProductRow = (product) => {
  const statusColors = {
    active: 'success',
    paused: 'warning',
    draft: 'secondary',
    pending_approval: 'warning',
    rejected_by_admin: 'danger'
  };
  const productName = product.name || 'Unnamed Product';
  const municipality = product.municipality || 'Unknown';
  const category = product.category || 'other';
  const unitType = product.unit_type || 'unit';
  const listingStatus = formatListingStatus(product.status);
  const quantity = Number(product.available_quantity) || 0;
  const photoSrc = escapeHtml(product.photo_path || product.photos?.[0] || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22200%22%3E%3Crect fill=%22%23f0f0f0%22 width=%22300%22 height=%22200%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2216%22 fill=%22%23999%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Image%3C/text%3E%3C/svg%3E');
  const stockMeta = getStockMeta(quantity);
  const isPendingReview = product.status === 'pending_approval';
  const isRejected = product.status === 'rejected_by_admin';
  const isDraftPendingFallback = product.status === 'draft';
  const canToggleStatus = !isPendingReview && !isRejected && !isDraftPendingFallback;
  const nextStatus = product.status === 'active' ? 'paused' : 'active';
  const nextStatusLabel = product.status === 'active' ? 'Pause' : 'Activate';
  const nextStatusIcon = product.status === 'active' ? 'bi-pause-circle' : 'bi-play-circle';
  const nextStatusClass = product.status === 'active' ? 'btn-warning' : 'btn-success';
  const search = productFilters.search || '';
  
  return `
    <tr data-product-id="${escapeHtml(product.id)}">
      <td class="seller-select-col">
        <input type="checkbox" data-product-select="true" data-product-id="${escapeHtml(product.id)}" aria-label="Select ${escapeHtml(productName)}">
      </td>
      <td>
        <div class="flex items-center gap-3">
          <img src="${photoSrc}" 
               alt="${escapeHtml(productName)}"
               class="w-12 h-12 object-cover rounded">
          <div>
            <p class="font-semibold seller-product-name">${highlightMatchHtml(productName, search)}</p>
            <p class="text-sm text-gray-600 seller-product-meta">${highlightMatchHtml(municipality, search)}</p>
          </div>
        </div>
      </td>
      <td class="seller-product-category">${highlightMatchHtml(category, search)}</td>
      <td class="seller-price-cell"><strong>${formatCurrency(product.price_per_unit)}</strong> / ${escapeHtml(unitType)}</td>
      <td class="seller-stock-cell"><strong>${quantity}</strong></td>
      <td><span class="badge ${stockMeta.className}">${stockMeta.label}</span></td>
      <td>
        <span class="badge badge-${statusColors[product.status] || 'secondary'}">
          ${escapeHtml(listingStatus)}
        </span>
      </td>
      <td>
        <div class="seller-action-group">
          ${canToggleStatus ? `
            <button class="btn btn-sm ${nextStatusClass} seller-action-btn" data-product-action="toggle-status" data-product-id="${escapeHtml(product.id)}" data-next-status="${escapeHtml(nextStatus)}" title="${nextStatusLabel} product">
              <i class="bi ${nextStatusIcon}"></i> ${nextStatusLabel}
            </button>
          ` : isRejected ? `
            <button class="btn btn-sm btn-primary seller-action-btn" data-product-action="resubmit" data-product-id="${escapeHtml(product.id)}" title="Resubmit for admin review">
              <i class="bi bi-arrow-repeat"></i> Resubmit
            </button>
          ` : isDraftPendingFallback ? `
            <span class="text-xs text-warning font-semibold px-1 py-2">Pending admin review</span>
          ` : `
            <span class="text-xs text-warning font-semibold px-1 py-2">Awaiting admin review</span>
          `}
          <button class="btn btn-sm btn-outline seller-action-btn" data-product-action="edit" data-product-id="${escapeHtml(product.id)}" title="Edit product">
            <i class="bi bi-pencil"></i> Edit
          </button>
          <button class="btn btn-sm btn-danger seller-action-btn" data-product-action="delete" data-product-id="${escapeHtml(product.id)}" title="Delete product">
            <i class="bi bi-trash"></i> Delete
          </button>
        </div>
      </td>
    </tr>
  `;
};

const createProductMobileCard = (product) => {
  const statusColors = {
    active: 'success',
    paused: 'warning',
    draft: 'secondary',
    pending_approval: 'warning',
    rejected_by_admin: 'danger'
  };
  const productName = product.name || 'Unnamed Product';
  const municipality = product.municipality || 'Unknown';
  const category = product.category || 'other';
  const unitType = product.unit_type || 'unit';
  const listingStatus = formatListingStatus(product.status);
  const quantity = Number(product.available_quantity) || 0;
  const photoSrc = escapeHtml(product.photo_path || product.photos?.[0] || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22200%22%3E%3Crect fill=%22%23f0f0f0%22 width=%22300%22 height=%22200%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2216%22 fill=%22%23999%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Image%3C/text%3E%3C/svg%3E');
  const stockMeta = getStockMeta(quantity);
  const isPendingReview = product.status === 'pending_approval';
  const isRejected = product.status === 'rejected_by_admin';
  const isDraftPendingFallback = product.status === 'draft';
  const canToggleStatus = !isPendingReview && !isRejected && !isDraftPendingFallback;
  const nextStatus = product.status === 'active' ? 'paused' : 'active';
  const nextStatusLabel = product.status === 'active' ? 'Pause' : 'Activate';
  const nextStatusClass = product.status === 'active' ? 'btn-warning' : 'btn-success';
  const nextStatusIcon = product.status === 'active' ? 'bi-pause-circle' : 'bi-play-circle';
  const search = productFilters.search || '';
  return `
    <article class="seller-product-card" data-product-id="${escapeHtml(product.id)}">
      <div class="seller-product-card-head">
        <input type="checkbox" data-product-select="true" data-product-id="${escapeHtml(product.id)}" aria-label="Select ${escapeHtml(productName)}">
        <img src="${photoSrc}" alt="${escapeHtml(productName)}" class="seller-product-card-image object-cover rounded-lg border">
        <div class="seller-product-card-meta">
          <p class="font-semibold seller-product-name mb-0">${highlightMatchHtml(productName, search)}</p>
          <p class="text-xs text-gray-600 seller-product-meta mb-1">${highlightMatchHtml(municipality, search)}</p>
          <span class="badge badge-${statusColors[product.status] || 'secondary'}">${escapeHtml(listingStatus)}</span>
          <span class="badge ${stockMeta.className} ml-1">${stockMeta.shortLabel}</span>
        </div>
      </div>
      <div class="seller-product-card-grid">
        <div class="seller-product-card-stat">
          <span>Category</span>
          <strong class="seller-product-category">${highlightMatchHtml(category, search)}</strong>
        </div>
        <div class="seller-product-card-stat">
          <span>Price</span>
          <strong>${formatCurrency(product.price_per_unit)} / ${escapeHtml(unitType)}</strong>
        </div>
        <div class="seller-product-card-stat">
          <span>Stock</span>
          <strong>${quantity}</strong>
        </div>
        <div class="seller-product-card-stat">
          <span>Stock Status</span>
          <strong>${stockMeta.label}</strong>
        </div>
      </div>
      <div class="seller-product-card-actions">
        ${canToggleStatus ? `
          <button class="btn btn-sm ${nextStatusClass}" data-product-action="toggle-status" data-product-id="${escapeHtml(product.id)}" data-next-status="${escapeHtml(nextStatus)}">
            <i class="bi ${nextStatusIcon}"></i> ${nextStatusLabel}
          </button>
        ` : isRejected ? `
          <button class="btn btn-sm btn-primary" data-product-action="resubmit" data-product-id="${escapeHtml(product.id)}">
            <i class="bi bi-arrow-repeat"></i> Resubmit
          </button>
        ` : isDraftPendingFallback ? `
          <button class="btn btn-sm btn-outline" disabled>
            <i class="bi bi-hourglass-split"></i> Pending Review
          </button>
        ` : `
          <button class="btn btn-sm btn-outline" disabled>
            <i class="bi bi-hourglass-split"></i> Pending Review
          </button>
        `}
        <button class="btn btn-sm btn-outline" data-product-action="edit" data-product-id="${escapeHtml(product.id)}">
          <i class="bi bi-pencil"></i> Edit
        </button>
        <button class="btn btn-sm btn-danger" data-product-action="delete" data-product-id="${escapeHtml(product.id)}">
          <i class="bi bi-trash"></i> Delete
        </button>
      </div>
    </article>
  `;
};

const syncProductSelectionUi = () => {
  const selectedCountElement = document.getElementById('products-selected-count');
  const bulkActions = document.getElementById('products-bulk-actions');
  const selectAllCheckbox = document.getElementById('products-select-all');
  const currentProductIds = new Set(currentProducts.map((product) => String(product.id)));
  selectedProductIds.forEach((id) => {
    if (!currentProductIds.has(id)) selectedProductIds.delete(id);
  });

  const selectedCount = selectedProductIds.size;
  if (selectedCountElement) {
    selectedCountElement.textContent = `${selectedCount} selected`;
  }
  if (bulkActions) {
    bulkActions.classList.toggle('hidden', selectedCount === 0);
  }
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = Boolean(currentProducts.length) && selectedCount === currentProducts.length;
    selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < currentProducts.length;
  }
};

const applyProductSelectionToDom = () => {
  document.querySelectorAll('[data-product-select]').forEach((checkbox) => {
    const productId = checkbox.getAttribute('data-product-id');
    checkbox.checked = selectedProductIds.has(String(productId));
  });
};

const clearProductSelections = () => {
  selectedProductIds = new Set();
  syncProductSelectionUi();
  applyProductSelectionToDom();
};

const renderProductEmptyState = (isFiltered) => {
  const tbody = document.getElementById('products-table-body');
  const mobileView = document.getElementById('products-mobile-view');
  const message = isFiltered ? 'No products matched your current filters.' : 'No products yet.';
  const cta = isFiltered
    ? '<p class="text-xs text-gray-500 mt-2">Try resetting filters or updating your search.</p>'
    : '<button class="btn btn-primary btn-sm seller-product-empty-cta" data-product-action="create"><i class="bi bi-plus-circle"></i> Add your first product</button>';

  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-12">
          <i class="bi bi-inbox text-5xl text-gray-400"></i>
          <p class="text-gray-600 mt-3">${message}</p>
          ${cta}
        </td>
      </tr>
    `;
  }
  if (mobileView) {
    mobileView.innerHTML = `
      <div class="text-center py-10">
        <i class="bi bi-inbox text-5xl text-gray-400"></i>
        <p class="text-gray-600 mt-3">${message}</p>
        ${cta}
      </div>
    `;
  }
};

const renderProductsFromCache = () => {
  currentProducts = applyClientProductFilters(allLoadedProducts);
  renderProductSummary(allLoadedProducts.length, currentProducts);
  if (!currentProducts.length) {
    renderProductEmptyState(Boolean(productFilters.search || productFilters.stock !== 'all'));
    clearProductSelections();
    return;
  }

  const tbody = document.getElementById('products-table-body');
  const mobileView = document.getElementById('products-mobile-view');
  if (tbody) tbody.innerHTML = currentProducts.map((product) => createProductRow(product)).join('');
  if (mobileView) mobileView.innerHTML = currentProducts.map((product) => createProductMobileCard(product)).join('');
  syncProductSelectionUi();
  applyProductSelectionToDom();
};

const handleProductSelectionEvents = (event) => {
  const checkbox = event.target.closest('[data-product-select]');
  if (!checkbox) return;
  const productId = checkbox.getAttribute('data-product-id');
  if (!productId) return;
  if (checkbox.checked) {
    selectedProductIds.add(String(productId));
  } else {
    selectedProductIds.delete(String(productId));
  }
  syncProductSelectionUi();
};

const handleProductActionEvents = (event) => {
  const actionButton = event.target.closest('[data-product-action]');
  if (!actionButton) return;
  const action = actionButton.getAttribute('data-product-action');
  const productId = actionButton.getAttribute('data-product-id');
  if (action === 'create') {
    window.showProductModal();
    return;
  }
  if (!productId) return;
  if (action === 'edit') {
    window.editProduct(productId);
    return;
  }
  if (action === 'toggle-status') {
    const nextStatus = actionButton.getAttribute('data-next-status') || 'paused';
    window.toggleProductStatus(productId, nextStatus);
    return;
  }
  if (action === 'resubmit') {
    window.resubmitProductListing(productId);
    return;
  }
  if (action === 'delete') {
    window.deleteProduct(productId);
  }
};

const removeUndoDeleteToast = (productId) => {
  const container = document.getElementById('seller-product-undo-toast-container');
  if (!container) return;
  const toast = [...container.querySelectorAll('[data-undo-product-id]')]
    .find((item) => item.dataset.undoProductId === String(productId));
  if (toast) toast.remove();
};

const undoDeleteProduct = (productId) => {
  const id = String(productId);
  const pendingDelete = productUndoDeletes.get(id);
  if (!pendingDelete) return;
  clearTimeout(pendingDelete.timeoutId);
  productUndoDeletes.delete(id);
  if (!allLoadedProducts.some((item) => String(item.id) === id)) {
    allLoadedProducts.push(pendingDelete.product);
  }
  removeUndoDeleteToast(id);
  renderProductsFromCache();
  showSuccess('Delete undone');
};

const renderUndoDeleteToast = (productId, productName) => {
  let container = document.getElementById('seller-product-undo-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'seller-product-undo-toast-container';
    container.style.cssText = 'position:fixed;left:1rem;bottom:1rem;z-index:1300;display:flex;flex-direction:column;gap:.5rem;max-width:calc(100vw - 2rem);';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'card';
  toast.dataset.undoProductId = String(productId);
  toast.style.cssText = 'padding:.55rem .7rem;border:1px solid #cfe3d8;background:#fff;box-shadow:0 12px 20px rgba(15,59,40,.14);';
  toast.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="text-sm"><strong>${escapeHtml(productName || 'Product')}</strong> removed.</span>
      <button type="button" class="btn btn-outline btn-sm ml-auto" data-product-undo="${escapeHtml(productId)}">Undo</button>
    </div>
  `;
  container.appendChild(toast);
  toast.addEventListener('click', (event) => {
    const undoButton = event.target.closest('[data-product-undo]');
    if (!undoButton) return;
    undoDeleteProduct(undoButton.getAttribute('data-product-undo'));
  });
};

const queueDeleteProduct = (productId) => {
  const id = String(productId);
  if (productUndoDeletes.has(id)) return;

  const product = allLoadedProducts.find((item) => String(item.id) === id) || currentProducts.find((item) => String(item.id) === id);
  if (!product) return;

  allLoadedProducts = allLoadedProducts.filter((item) => String(item.id) !== id);
  selectedProductIds.delete(id);
  renderProductsFromCache();
  syncProductSelectionUi();
  showProductInlineFeedback('Product queued for deletion. Undo is available for 6 seconds.', 'success');
  renderUndoDeleteToast(id, product.name || 'Product');

  const timeoutId = setTimeout(async () => {
    try {
      await deleteProductRequest(id);
      productUndoDeletes.delete(id);
      removeUndoDeleteToast(id);
      showSuccess('Product deleted successfully');
      await loadDashboardStats();
    } catch (error) {
      console.error('Error deleting product:', error);
      productUndoDeletes.delete(id);
      removeUndoDeleteToast(id);
      if (!allLoadedProducts.some((item) => String(item.id) === id)) {
        allLoadedProducts.push(product);
      }
      renderProductsFromCache();
      showError(error.message || 'Failed to delete product');
      if (error.status === 500 || error.status === 409) {
        showWarning('This product has linked orders/data. You can pause it instead.');
      }
    }
  }, 6000);

  productUndoDeletes.set(id, {
    timeoutId,
    product
  });
};

const handleBulkPauseProducts = async () => {
  const ids = [...selectedProductIds];
  if (!ids.length) return;
  try {
    const results = await Promise.allSettled(
      ids.map((id) => updateProduct(id, { status: 'paused' }))
    );
    const successCount = results.filter((result) => result.status === 'fulfilled').length;
    const failCount = results.length - successCount;
    clearProductSelections();
    await Promise.all([loadProducts(), loadDashboardStats()]);
    if (successCount > 0) {
      showProductInlineFeedback(`${successCount} product(s) paused.${failCount ? ` ${failCount} failed.` : ''}`, failCount ? 'error' : 'success');
    }
  } catch (error) {
    console.error('Error bulk pausing products:', error);
    showError(error.message || 'Bulk pause failed');
  }
};

const handleBulkDeleteProducts = async () => {
  const ids = [...selectedProductIds];
  if (!ids.length) return;
  const modal = createModal({
    title: 'Delete Selected Products',
    content: `<p class="text-gray-700">Delete ${ids.length} selected product(s)? You can undo each delete for 6 seconds.</p>`,
    footer: `
      <button class="btn btn-outline" data-modal-close>Cancel</button>
      <button class="btn btn-danger" id="btn-confirm-bulk-delete"><i class="bi bi-trash"></i> Delete Selected</button>
    `,
    size: 'sm'
  });
  const confirmButton = document.getElementById('btn-confirm-bulk-delete');
  if (!confirmButton) return;
  confirmButton.addEventListener('click', () => {
    ids.forEach((id) => queueDeleteProduct(id));
    clearProductSelections();
    modal.close();
  }, { once: true });
};

const handleBulkCategoryUpdate = async () => {
  const ids = [...selectedProductIds];
  if (!ids.length) return;
  const select = document.getElementById('bulk-category-select');
  const category = select?.value || '';
  if (!category) {
    showWarning('Select a category first.');
    return;
  }

  try {
    const results = await Promise.allSettled(
      ids.map((id) => updateProduct(id, { category }))
    );
    const successCount = results.filter((result) => result.status === 'fulfilled').length;
    const failCount = results.length - successCount;
    clearProductSelections();
    if (select) select.value = '';
    await loadProducts();
    if (successCount > 0) {
      showProductInlineFeedback(`${successCount} product(s) moved to ${category.replace(/_/g, ' ')}.${failCount ? ` ${failCount} failed.` : ''}`, failCount ? 'error' : 'success');
    }
  } catch (error) {
    console.error('Error bulk updating category:', error);
    showError(error.message || 'Bulk category update failed');
  }
};

// ============ Product Photo Handlers ============

const setupPhotoInputHandler = () => {
  const photosInput = document.getElementById('product-photos');
  if (!photosInput) return;

  const syncFilesToInput = (files) => {
    const dataTransfer = new DataTransfer();
    files.forEach(file => dataTransfer.items.add(file));
    photosInput.files = dataTransfer.files;
  };

  const renderPreview = (files) => {
    const preview = document.getElementById('photo-preview');
    const warning = document.getElementById('photo-warning');
    if (!preview || !warning) return;

    preview.innerHTML = '';
    warning.style.display = 'none';

    files.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = function(e) {
        const img = document.createElement('div');
        img.className = 'relative w-20 h-20';
        img.innerHTML = `
          <img src="${e.target.result}" alt="Preview ${index + 1}" class="w-full h-full object-cover rounded">
          <span class="absolute top-0 right-0 bg-primary text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">${index + 1}</span>
        `;
        preview.appendChild(img);
      };
      reader.readAsDataURL(file);
    });
  };

  photosInput.addEventListener('change', function() {
    const newFiles = Array.from(this.files);
    const warning = document.getElementById('photo-warning');
    if (!warning) return;

    const currentFiles = Array.isArray(photosInput.__selectedFiles) ? photosInput.__selectedFiles : [];
    const mergedFiles = [...currentFiles];

    // Append newly selected files, skip exact duplicates
    newFiles.forEach(file => {
      const alreadySelected = mergedFiles.some(existing =>
        existing.name === file.name &&
        existing.size === file.size &&
        existing.lastModified === file.lastModified
      );

      if (!alreadySelected) {
        mergedFiles.push(file);
      }
    });

    if (mergedFiles.length > 3) {
      warning.style.display = 'block';
      warning.textContent = `⚠️ Only 3 images allowed. ${mergedFiles.length - 3} file(s) will be ignored.`;
    }

    const limitedFiles = mergedFiles.slice(0, 3);
    photosInput.__selectedFiles = limitedFiles;
    syncFilesToInput(limitedFiles);
    renderPreview(limitedFiles);
  });
};

window.removeExistingPhoto = (encodedPhotoUrl) => {
  let photoUrl;
  try {
    photoUrl = decodeURIComponent(encodedPhotoUrl);
  } catch (error) {
    photoUrl = encodedPhotoUrl;
  }

  removedExistingPhotos.add(photoUrl);

  const photoCard = document.querySelector(`[data-existing-photo="${encodedPhotoUrl}"]`);
  if (photoCard) {
    photoCard.remove();
  }

  const existingPhotosContainer = document.getElementById('existing-photos-container');
  if (existingPhotosContainer && existingPhotosContainer.querySelectorAll('[data-existing-photo]').length === 0) {
    existingPhotosContainer.innerHTML = '<p class="text-sm text-gray-500">No existing photos left. Save to apply this change.</p>';
  }

  showToast('Photo removed. Click Save to apply changes.', 'info');
};

// ============ Product Modal (Create/Edit) ============

window.showProductModal = (productId = null) => {
  editingProduct = productId ? currentProducts.find(p => p.id === productId) : null;
  removedExistingPhotos = new Set();
  
  // Get seller's municipality from user data
  const user = getUser();
  const sellerMunicipality = user?.seller_profile?.municipality || 'Not set';
  
  const modalContent = `
    <form id="product-form" class="space-y-4 seller-product-form">
      <!-- Basic Info -->
      <div class="form-group">
        <label class="form-label">Product Name <span class="text-danger">*</span></label>
        <input type="text" id="product-name" class="form-control" 
               value="${editingProduct?.name || ''}" required>
        <div class="invalid-feedback"></div>
      </div>
      
      <div class="grid grid-cols-2 gap-4 seller-product-form-grid">
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
      <div class="grid grid-cols-2 gap-4 seller-product-form-grid">
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
        <label class="form-label">Product Photos <span class="text-danger">*</span></label>
        <div class="mb-3">
          <input type="file" id="product-photos" class="form-control" 
                 accept="image/jpeg,image/jpg,image/png" multiple>
          <p class="text-sm text-gray-600 mt-1">Upload up to 3 product images (JPG, PNG). Max 5MB each.</p>
          <div id="photo-preview" class="flex gap-2 mt-3 flex-wrap"></div>
          <div id="photo-warning" class="text-sm text-warning mt-2" style="display: none;"></div>
        </div>
        ${editingProduct?.photos?.length > 0 ? `
          <div class="mt-3" id="existing-photos-container">
            <p class="text-sm font-semibold mb-2">Current Photos:</p>
            <div class="flex gap-2 flex-wrap">
              ${editingProduct.photos.map(photo => `
                <div class="relative" data-existing-photo="${encodeURIComponent(photo)}">
                  <img src="${escapeHtml(photo)}" alt="Product" class="w-20 h-20 object-cover rounded">
                  <button type="button" class="absolute -top-2 -right-2 bg-danger text-white rounded-full w-6 h-6 flex items-center justify-center text-xs"
                          onclick="removeExistingPhoto('${encodeURIComponent(photo)}')" title="Remove this image">
                    <i class="bi bi-x"></i>
                  </button>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
      
      <!-- Tags -->
      <div class="form-group">
        <label class="form-label">Tags</label>
        <div class="seller-product-tags">
          <label class="seller-product-tag">
            <input type="checkbox" name="tags" value="fresh" 
                   ${editingProduct?.tags?.includes('fresh') ? 'checked' : ''}>
            <span class="text-sm">Fresh</span>
          </label>
          <label class="seller-product-tag">
            <input type="checkbox" name="tags" value="organic"
                   ${editingProduct?.tags?.includes('organic') ? 'checked' : ''}>
            <span class="text-sm">Organic</span>
          </label>
          <label class="seller-product-tag">
            <input type="checkbox" name="tags" value="recently_harvested"
                   ${editingProduct?.tags?.includes('recently_harvested') ? 'checked' : ''}>
            <span class="text-sm">Recently Harvested</span>
          </label>
        </div>
      </div>
      
      ${!editingProduct ? `
        <div class="form-group">
          <label class="form-label">Listing Workflow</label>
          <div class="alert alert-info text-sm">
            New product listings are submitted for admin review first.
            Status controls become available after approval.
          </div>
        </div>
      ` : ['active', 'paused', 'draft'].includes(String(editingProduct?.status || '').toLowerCase()) ? `
        <div class="form-group">
          <label class="form-label">Status</label>
          <select id="product-status" class="form-select">
            <option value="active" ${editingProduct?.status === 'active' ? 'selected' : ''}>Active</option>
            <option value="paused" ${editingProduct?.status === 'paused' ? 'selected' : ''}>Paused</option>
            <option value="draft" ${editingProduct?.status === 'draft' ? 'selected' : ''}>Draft</option>
          </select>
        </div>
      ` : `
        <div class="form-group">
          <label class="form-label">Status</label>
          <div class="alert alert-warning text-sm mb-0">
            This listing is under admin review. Status changes are disabled until approved.
          </div>
        </div>
      `}
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
  
  // Setup photo input handler for preview and validation
  setupPhotoInputHandler();
  
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
  const selectedPhotoFiles = Array.isArray(photosInput.__selectedFiles)
    ? photosInput.__selectedFiles
    : Array.from(photosInput.files || []);
  const hasNewPhotos = selectedPhotoFiles.length > 0;
  const hasRemovedExistingPhotos = !!editingProduct && removedExistingPhotos.size > 0;
  const statusElement = document.getElementById('product-status');
  const selectedStatus = statusElement ? statusElement.value : '';
  
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
    if (selectedStatus) {
      requestData.append('status', selectedStatus);
    }
    
    // Append files
    selectedPhotoFiles.forEach(file => {
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
      tags: tags
    };
    if (selectedStatus) {
      requestData.status = selectedStatus;
    }

    if (hasRemovedExistingPhotos) {
      const existingPhotos = Array.isArray(editingProduct.photos) ? editingProduct.photos : [];
      const remainingPhotos = existingPhotos.filter(photo => !removedExistingPhotos.has(photo));
      requestData.photos = remainingPhotos;
      requestData.photo_path = remainingPhotos[0] || null;
    }
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
      const successMessage = response.message || (editingProduct ? 'Product updated!' : 'Product created!');
      showSuccess(successMessage);
      
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

window.toggleProductStatus = async (productId, nextStatus) => {
  try {
    await updateProduct(productId, { status: nextStatus });
    showSuccess(`Product set to ${nextStatus}`);
    showProductInlineFeedback(`Listing status updated to ${nextStatus}.`, 'success');
    await Promise.all([loadProducts(), loadDashboardStats()]);
  } catch (error) {
    console.error('Error updating product status:', error);
    showProductInlineFeedback(error.message || 'Failed to update product status', 'error');
    showError(error.message || 'Failed to update product status');
  }
};

window.resubmitProductListing = async (productId) => {
  try {
    await updateProduct(productId, { status: 'pending_approval' });
    showSuccess('Product resubmitted for admin review.');
    showProductInlineFeedback('Listing is back in review queue.', 'success');
    await Promise.all([loadProducts(), loadDashboardStats()]);
  } catch (error) {
    console.error('Error resubmitting product listing:', error);
    showProductInlineFeedback(error.message || 'Failed to resubmit listing', 'error');
    showError(error.message || 'Failed to resubmit listing');
  }
};

window.deleteProduct = async (productId) => {
  const targetProduct = currentProducts.find((item) => String(item.id) === String(productId))
    || allLoadedProducts.find((item) => String(item.id) === String(productId));
  const productName = targetProduct?.name || 'this product';

  const modal = createModal({
    title: 'Delete Product',
    content: `<p class="text-gray-700">Delete <strong>${escapeHtml(productName)}</strong>? You can undo this for 6 seconds.</p>`,
    footer: `
      <button class="btn btn-outline" data-modal-close>Cancel</button>
      <button class="btn btn-danger" id="btn-confirm-delete">
        <i class="bi bi-trash"></i> Delete
      </button>
    `,
    size: 'sm'
  });
  
  const btnConfirm = document.getElementById('btn-confirm-delete');
  if (!btnConfirm) return;
  btnConfirm.addEventListener('click', async () => {
    btnConfirm.disabled = true;
    btnConfirm.innerHTML = '<i class="bi bi-hourglass-split"></i> Queuing...';
    queueDeleteProduct(productId);
    modal.close();
  });
};

// ============ Orders Management ============

const isDesktopSellerViewport = () => window.matchMedia('(min-width: 768px)').matches;

const applyProductsFiltersCollapsedState = () => {
  const filtersContent = document.getElementById('products-filters-content');
  const toggleButton = document.getElementById('products-filters-toggle');
  if (!filtersContent || !toggleButton) return;

  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  if (!isMobile) {
    filtersContent.classList.remove('is-collapsed');
    toggleButton.setAttribute('hidden', 'hidden');
    toggleButton.setAttribute('aria-expanded', 'true');
    toggleButton.innerHTML = '<i class="bi bi-chevron-up"></i><span>Hide Filters</span>';
    return;
  }

  toggleButton.removeAttribute('hidden');
  filtersContent.classList.toggle('is-collapsed', productsFiltersCollapsed);
  toggleButton.setAttribute('aria-expanded', String(!productsFiltersCollapsed));
  toggleButton.innerHTML = productsFiltersCollapsed
    ? '<i class="bi bi-chevron-down"></i><span>Show Filters</span>'
    : '<i class="bi bi-chevron-up"></i><span>Hide Filters</span>';
};

const applyOrdersStatsCollapsedState = () => {
  const statsContainer = document.getElementById('orders-stats');
  const toggleButton = document.getElementById('orders-stats-toggle');
  if (!statsContainer || !toggleButton) return;

  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  if (!isMobile) {
    statsContainer.classList.remove('is-collapsed');
    toggleButton.setAttribute('hidden', 'hidden');
    toggleButton.setAttribute('aria-expanded', 'true');
    toggleButton.innerHTML = '<i class="bi bi-chevron-up"></i><span>Hide Stats</span>';
    return;
  }

  toggleButton.removeAttribute('hidden');
  statsContainer.classList.toggle('is-collapsed', ordersStatsCollapsed);
  toggleButton.setAttribute('aria-expanded', String(!ordersStatsCollapsed));
  toggleButton.innerHTML = ordersStatsCollapsed
    ? '<i class="bi bi-chevron-down"></i><span>Show Stats</span>'
    : '<i class="bi bi-chevron-up"></i><span>Hide Stats</span>';
};

const applyIssuesStatsCollapsedState = () => {
  const statsContainer = document.getElementById('issues-stats');
  const toggleButton = document.getElementById('issues-stats-toggle');
  if (!statsContainer || !toggleButton) return;

  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  if (!isMobile) {
    statsContainer.classList.remove('is-collapsed');
    toggleButton.setAttribute('hidden', 'hidden');
    toggleButton.setAttribute('aria-expanded', 'true');
    toggleButton.innerHTML = '<i class="bi bi-chevron-up"></i><span>Hide Stats</span>';
    return;
  }

  toggleButton.removeAttribute('hidden');
  statsContainer.classList.toggle('is-collapsed', issuesStatsCollapsed);
  toggleButton.setAttribute('aria-expanded', String(!issuesStatsCollapsed));
  toggleButton.innerHTML = issuesStatsCollapsed
    ? '<i class="bi bi-chevron-down"></i><span>Show Stats</span>'
    : '<i class="bi bi-chevron-up"></i><span>Hide Stats</span>';
};

const renderOrdersStatsFallback = () => `
  <div class="bg-white rounded-lg border border-gray-200 shadow-sm p-3 seller-stat-card"><p class="text-xs text-gray-500 flex items-center gap-1 seller-stat-label"><i class="bi bi-receipt"></i> Total Orders</p><p class="text-lg font-bold mt-1 seller-stat-value">-</p></div>
  <div class="bg-white rounded-lg border border-gray-200 shadow-sm p-3 seller-stat-card"><p class="text-xs text-gray-500 flex items-center gap-1 seller-stat-label"><i class="bi bi-hourglass-split"></i> Pending</p><p class="text-lg font-bold mt-1 seller-stat-value">-</p></div>
  <div class="bg-white rounded-lg border border-gray-200 shadow-sm p-3 seller-stat-card"><p class="text-xs text-gray-500 flex items-center gap-1 seller-stat-label"><i class="bi bi-box-seam"></i> Ready</p><p class="text-lg font-bold mt-1 seller-stat-value">-</p></div>
  <div class="bg-white rounded-lg border border-gray-200 shadow-sm p-3 seller-stat-card"><p class="text-xs text-gray-500 flex items-center gap-1 seller-stat-label"><i class="bi bi-check-circle"></i> Completed</p><p class="text-lg font-bold mt-1 seller-stat-value">-</p></div>
`;

const loadOrderStats = async () => {
  const statsContainer = document.getElementById('orders-stats');
  if (!statsContainer) return;

  try {
    const [allRes, pendingRes, readyRes, completedRes] = await Promise.all([
      getOrders({ page: 1, limit: 1 }).catch(() => null),
      getOrders({ status: 'pending', page: 1, limit: 1 }).catch(() => null),
      getOrders({ status: 'ready', page: 1, limit: 1 }).catch(() => null),
      getOrders({ status: 'completed', page: 1, limit: 1 }).catch(() => null)
    ]);

    const cards = [
      { label: 'Total Orders', value: Number.parseInt(allRes?.total, 10) || 0, icon: 'receipt' },
      { label: 'Pending', value: Number.parseInt(pendingRes?.total, 10) || 0, icon: 'hourglass-split' },
      { label: 'Ready', value: Number.parseInt(readyRes?.total, 10) || 0, icon: 'box-seam' },
      { label: 'Completed', value: Number.parseInt(completedRes?.total, 10) || 0, icon: 'check-circle' }
    ];

    statsContainer.innerHTML = cards.map((card) => `
      <div class="bg-white rounded-lg border border-gray-200 shadow-sm p-3 seller-stat-card">
        <p class="text-xs text-gray-500 flex items-center gap-1 seller-stat-label">
          <i class="bi bi-${card.icon}"></i> ${card.label}
        </p>
        <p class="text-lg font-bold mt-1 seller-stat-value">${card.value}</p>
      </div>
    `).join('');
  } catch (error) {
    statsContainer.innerHTML = renderOrdersStatsFallback();
  }

  applyOrdersStatsCollapsedState();
};

const renderOrdersSkeletons = (count = 3) => {
  const container = document.getElementById('orders-list');
  if (!container) return;
  container.innerHTML = Array.from({ length: count }).map(() => `
    <div class="card seller-order-card">
      <div class="card-body">
        <div class="seller-order-loading-row">
          <div class="seller-order-loading-col">
            <div class="home-skeleton shimmer seller-order-loading-title"></div>
            <div class="home-skeleton shimmer seller-order-loading-line"></div>
            <div class="home-skeleton shimmer seller-order-loading-line"></div>
          </div>
          <div class="seller-order-loading-aside">
            <div class="home-skeleton shimmer seller-order-loading-line"></div>
            <div class="home-skeleton shimmer seller-order-loading-title"></div>
          </div>
        </div>
        <div class="home-skeleton shimmer seller-order-loading-actions"></div>
      </div>
    </div>
  `).join('');
};

const renderOrdersPagination = () => {
  const paginationContainer = document.getElementById('orders-pagination');
  if (!paginationContainer) return;

  if (ordersTotalPages <= 1) {
    paginationContainer.innerHTML = '';
    return;
  }

  paginationContainer.innerHTML = `
    <p class="text-xs sm:text-sm text-gray-600">Page ${orderFilters.page} of ${ordersTotalPages} (${ordersTotalItems} orders)</p>
    <div class="flex items-center gap-2">
      <button class="btn btn-sm btn-outline" id="orders-prev-page" ${orderFilters.page <= 1 ? 'disabled' : ''}>Prev</button>
      <button class="btn btn-sm btn-outline" id="orders-next-page" ${orderFilters.page >= ordersTotalPages ? 'disabled' : ''}>Next</button>
    </div>
  `;

  const prevBtn = document.getElementById('orders-prev-page');
  const nextBtn = document.getElementById('orders-next-page');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      orderFilters.page = Math.max(1, orderFilters.page - 1);
      loadOrders();
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      orderFilters.page = Math.min(ordersTotalPages, orderFilters.page + 1);
      loadOrders();
    });
  }
};

const loadOrders = async () => {
  const container = document.getElementById('orders-list');
  const paginationContainer = document.getElementById('orders-pagination');
  if (!container) return;
  
  // Update active filter button state
  document.querySelectorAll('.order-filter').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.status === orderFilters.status || (btn.dataset.status === 'all' && !orderFilters.status)) {
      btn.classList.add('active');
    }
  });

  renderOrdersSkeletons(isDesktopSellerViewport() ? 3 : 2);
  if (paginationContainer) paginationContainer.innerHTML = '';
  
  try {
    // Don't send status if it's 'all' - backend doesn't accept it
    const filters = { ...orderFilters };
    if (filters.status === 'all') {
      delete filters.status;
    }

    const [response, pendingResponse] = await Promise.all([
      getOrders(filters),
      getOrders({ status: 'pending', page: 1, limit: 1 }).catch(() => null)
    ]);
    currentOrders = response.data?.orders || [];

    const totalOrders = Number.parseInt(response.total, 10) || currentOrders.length;
    const totalPages = Math.max(1, Number.parseInt(response.total_pages, 10) || 1);
    const serverPage = Math.max(1, Number.parseInt(response.page, 10) || orderFilters.page || 1);
    const serverLimit = Math.max(1, Number.parseInt(response.limit, 10) || orderFilters.limit || 20);
    orderFilters.page = serverPage;
    orderFilters.limit = serverLimit;
    ordersTotalItems = totalOrders;
    ordersTotalPages = totalPages;
    renderOrdersPagination();
    
    // Update navbar orders badge using global pending count, not current page/filter slice.
    const pendingCount = Math.max(
      0,
      Number.parseInt(pendingResponse?.total, 10) ||
      Number.parseInt(pendingResponse?.results, 10) ||
      currentOrders.filter(o => o.status === 'pending').length
    );
    updateOrdersCount(pendingCount);

    // Recover if requested page is now out-of-range after status/filter changes.
    if (currentOrders.length === 0 && totalOrders > 0 && orderFilters.page > totalPages) {
      orderFilters.page = 1;
      await loadOrders();
      return;
    }
    
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

    container.innerHTML = `${currentOrders.map(order => createOrderCard(order)).join('')}`;
    
    // Attach filter listeners after rendering
    attachOrderFilterListeners();
    
  } catch (error) {
    console.error('Error loading orders:', error);
    container.innerHTML = '<div class="text-center py-8 text-danger">Failed to load orders</div>';
    if (paginationContainer) paginationContainer.innerHTML = '';
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
  const status = String(order?.status || 'unknown');
  const statusClass = statusColors[status] || 'secondary';
  const safeOrderNumber = escapeHtml(order?.order_number || 'N/A');
  const safeBuyerName = escapeHtml(order?.buyer?.user?.full_name || 'Unknown Buyer');
  const safeDeliveryOption = escapeHtml(order?.delivery_option || 'Not specified');
  const canonicalOrderId = getCanonicalOrderId(order);
  const safeOrderId = String(canonicalOrderId || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const safeOrderNumberJs = String(order?.order_number || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const items = Array.isArray(order?.items) ? order.items : [];
  const itemsCount = items.length;
  const totalAmount = Number(order?.total_amount || 0);
  const createdDateLabel = order?.created_at
    ? new Date(order.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'N/A';
  const preferredLabel = order?.preferred_date
    ? `${new Date(order.preferred_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}${order?.preferred_time ? ` • ${order.preferred_time}` : ''}`
    : 'Not set';
  const paymentLabel = order?.payment_method ? String(order.payment_method).toUpperCase() : 'COD';
  const deliveryOptionLabel = order?.delivery_option === 'pickup'
    ? 'Pickup'
    : order?.delivery_option === 'drop-off'
      ? 'Drop-off'
      : 'Unspecified';
  
  return `
    <div class="card seller-order-card" data-order-id="${escapeHtml(canonicalOrderId || '')}">
      <div class="card-body">
        <div class="seller-order-shell">
          <div class="seller-order-main">
            <div class="flex justify-between items-start mb-4 seller-order-head">
              <div class="seller-order-head-copy">
                <h4 class="font-bold text-lg seller-order-title">Order #${safeOrderNumber}</h4>
                <p class="text-sm text-gray-600">${formatRelativeTime(order?.created_at)}</p>
              </div>
              <span class="badge badge-${statusClass} seller-order-badge">${escapeHtml(status.toUpperCase())}</span>
            </div>

            <div class="mb-4 seller-order-meta">
              <p class="text-sm text-gray-600 mb-2">
                <i class="bi bi-person"></i> ${safeBuyerName}
              </p>
              <p class="text-sm text-gray-600">
                <i class="bi bi-box"></i> ${itemsCount} item${itemsCount === 1 ? '' : 's'} • ${formatCurrency(totalAmount)}
              </p>
              ${order.preferred_date ? `
                <p class="text-sm text-primary mt-1">
                  <i class="bi bi-calendar-check"></i> Preferred: ${preferredLabel}
                </p>
              ` : ''}
            </div>

            <div class="seller-order-meta-grid mb-4">
              <div class="seller-order-meta-chip">
                <span>Created</span>
                <strong>${createdDateLabel}</strong>
              </div>
              <div class="seller-order-meta-chip">
                <span>Delivery</span>
                <strong>${deliveryOptionLabel}</strong>
              </div>
              <div class="seller-order-meta-chip">
                <span>Payment</span>
                <strong>${paymentLabel}</strong>
              </div>
              <div class="seller-order-meta-chip">
                <span>Preferred</span>
                <strong>${preferredLabel}</strong>
              </div>
            </div>
          </div>

          <aside class="seller-order-aside">
            <p class="seller-order-aside-label">Order Total</p>
            <p class="seller-order-aside-total">${formatCurrency(totalAmount)}</p>
            <p class="seller-order-aside-items">${itemsCount} item${itemsCount === 1 ? '' : 's'}</p>
          </aside>
        </div>

        <div class="mb-4">
          <p class="text-sm font-semibold mb-2">Order Items:</p>
          <ul class="text-sm space-y-1">
            ${items.map(item => `
              <li>• ${escapeHtml(item?.product_name || 'Unknown Product')} (${escapeHtml(String(item?.quantity ?? 0))} ${escapeHtml(item?.unit_type || 'unit')}) - ${formatCurrency(item?.subtotal)}</li>
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
          <div class="seller-order-proof seller-order-proof--seller">
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
          <div class="seller-order-proof seller-order-proof--buyer">
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
            <i class="bi bi-truck"></i> ${safeDeliveryOption}
          </p>
        </div>
        
        <div class="flex gap-2 flex-wrap seller-order-actions seller-order-actions-desktop">
          ${status === 'pending' ? `
            <button class="btn btn-sm btn-success" onclick="window.confirmOrder('${safeOrderId}')">
              <i class="bi bi-check-circle"></i> Confirm Order
            </button>
          ` : ''}
          ${status === 'confirmed' ? `
            <button class="btn btn-sm btn-primary" onclick="window.markOrderReady('${safeOrderId}')">
              <i class="bi bi-box-seam"></i> Mark as Ready
            </button>
          ` : ''}
          ${status === 'ready' && !order.seller_confirmed ? `
            <button class="btn btn-sm btn-success" onclick="window.completeOrder('${safeOrderId}')">
              <i class="bi bi-check-all"></i> Complete Order
            </button>
          ` : ''}
          ${status === 'ready' && order.seller_confirmed && !order.buyer_confirmed ? `
            <div class="btn btn-sm btn-outline cursor-default">
              <i class="bi bi-hourglass-split"></i> Waiting for Buyer Confirmation
            </div>
          ` : ''}
          ${status === 'completed' ? `
            <div class="btn btn-sm btn-success cursor-default">
              <i class="bi bi-check-circle-fill"></i> Order Completed
            </div>
            <button class="btn btn-sm btn-warning" onclick="window.reportOrderIssue('${safeOrderId}', '${safeOrderNumberJs}')">
              <i class="bi bi-flag"></i> Report Issue
            </button>
          ` : ''}
          <button class="btn btn-sm btn-outline" onclick="window.viewOrderDetails('${safeOrderId}')">
            <i class="bi bi-eye"></i> View Details
          </button>
          ${status !== 'completed' && status !== 'cancelled' ? `
            <button class="btn btn-sm btn-primary" onclick="window.messageCustomer('${safeOrderId}')">
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
    await Promise.all([loadOrders(), loadOrderStats()]);
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
    await Promise.all([loadOrders(), loadOrderStats()]);
  } catch (error) {
    console.error('Error updating order:', error);
    showError(error.message || 'Failed to update order');
  }
};

window.completeOrder = async (orderId) => {
  const order = findOrderByReference(orderId);
  if (!order) {
    showError('Order not found');
    return;
  }
  const targetOrderId = resolveOrderApiId(orderId);
  if (!targetOrderId) {
    showError('Unable to resolve order ID');
    return;
  }
  const safeOrderNumber = escapeHtml(order.order_number || 'N/A');
  const safeBuyerName = escapeHtml(order.buyer?.user?.full_name || 'Unknown Buyer');
  const orderItems = Array.isArray(order.items) ? order.items : [];

  // Show confirmation modal with REQUIRED image upload for delivery proof
  const modal = createModal({
    title: '✓ Complete Order - Delivery Confirmation',
    content: `
      <div class="space-y-4">
        <p class="text-gray-700">Confirm that this order has been delivered/picked up by the buyer?</p>
        
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p class="text-sm text-gray-600">Order #${safeOrderNumber}</p>
          <p class="font-bold text-lg mt-1">${formatCurrency(order.total_amount)}</p>
          <p class="text-sm text-gray-600 mt-2">
            ${orderItems.length} item(s) • ${safeBuyerName}
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
      
      await confirmOrder(targetOrderId, file);
      showSuccess('Order completed with delivery proof!');
      
      // Close modal
      document.querySelector('.modal-backdrop').remove();
      
      // Reload orders
      await Promise.all([loadOrders(), loadOrderStats()]);
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

const ISSUE_STATUS_CONFIG = {
  under_review: { color: 'warning', icon: 'hourglass-split', label: 'Under Review' },
  resolved: { color: 'success', icon: 'check-circle-fill', label: 'Resolved' },
  rejected: { color: 'danger', icon: 'x-circle-fill', label: 'Rejected' }
};

const normalizeIssueStatus = (status) => {
  const key = String(status || 'under_review').toLowerCase();
  return ISSUE_STATUS_CONFIG[key] ? key : 'under_review';
};

const getIssueSearchText = (issue) => {
  const orderNumber = issue?.order?.order_number || issue?.order_number || '';
  const buyerName = issue?.order?.buyer?.user?.full_name || issue?.buyer?.user?.full_name || '';
  return [
    issue?.id,
    issue?.issue_type,
    issue?.description,
    orderNumber,
    buyerName
  ].map(value => String(value || '').toLowerCase()).join(' ');
};

const getIssueSortTimestamp = (issue) => {
  const lastUpdated = issue?.updated_at || issue?.resolved_at || issue?.created_at;
  const ts = Date.parse(lastUpdated);
  return Number.isFinite(ts) ? ts : 0;
};

const getIssueResolutionDays = (issue) => {
  const created = Date.parse(issue?.created_at || '');
  const resolved = Date.parse(issue?.resolved_at || issue?.updated_at || '');
  if (!Number.isFinite(created) || !Number.isFinite(resolved) || resolved < created) return null;
  return Math.max(1, Math.round((resolved - created) / (1000 * 60 * 60 * 24)));
};

const getIssueExpectedResponseDays = (issue) => {
  const created = Date.parse(issue?.created_at || '');
  if (!Number.isFinite(created)) return 3;
  const elapsed = (Date.now() - created) / (1000 * 60 * 60 * 24);
  if (elapsed < 1) return 2;
  if (elapsed < 2) return 1;
  return 0;
};

const buildIssueAttachmentsHtml = (issue) => {
  const attachments = Array.isArray(issue?.evidence_urls) ? issue.evidence_urls : [];
  if (attachments.length === 0) return '';

  return `
    <div class="seller-issue-attachments mt-3">
      <p class="seller-issue-attachments-title"><i class="bi bi-paperclip"></i> Attachments (${attachments.length})</p>
      <div class="seller-issue-attachments-grid">
        ${attachments.slice(0, 3).map((url) => {
      const fullUrl = getIssueEvidenceUrl(url);
      const ext = String(url || '').split('.').pop()?.toUpperCase() || 'FILE';
      return `
          <a class="seller-issue-attachment" href="${fullUrl}" target="_blank" rel="noopener">
            <img src="${fullUrl}" alt="Issue attachment">
            <span>${ext} • preview</span>
          </a>
        `;
    }).join('')}
      </div>
    </div>
  `;
};

const renderIssueStats = (issues = []) => {
  const container = document.getElementById('issues-stats');
  if (!container) return;

  const openCount = issues.filter((issue) => normalizeIssueStatus(issue.status) === 'under_review').length;
  const reviewCount = openCount;
  const resolvedIssues = issues.filter((issue) => normalizeIssueStatus(issue.status) === 'resolved');
  const resolvedCount = resolvedIssues.length;
  const avgResolutionDays = resolvedCount > 0
    ? Math.round(resolvedIssues.reduce((sum, issue) => sum + (getIssueResolutionDays(issue) || 0), 0) / resolvedCount)
    : 0;

  const cards = [
    { label: 'Open', value: openCount, icon: 'inbox' },
    { label: 'Under Review', value: reviewCount, icon: 'hourglass-split' },
    { label: 'Resolved', value: resolvedCount, icon: 'check-circle' },
    { label: 'Avg Resolution', value: `${avgResolutionDays}d`, icon: 'clock-history' }
  ];

  container.innerHTML = cards.map(card => `
    <div class="seller-issue-stat-card">
      <p class="seller-issue-stat-label"><i class="bi bi-${card.icon}"></i> ${card.label}</p>
      <p class="seller-issue-stat-value">${card.value}</p>
    </div>
  `).join('');
};

const updateIssueFilterCounts = (issues = []) => {
  const counts = {
    all: issues.length,
    under_review: issues.filter(issue => normalizeIssueStatus(issue.status) === 'under_review').length,
    resolved: issues.filter(issue => normalizeIssueStatus(issue.status) === 'resolved').length,
    rejected: issues.filter(issue => normalizeIssueStatus(issue.status) === 'rejected').length
  };

  document.querySelectorAll('.issue-filter').forEach((btn) => {
    const status = btn.dataset.status || 'all';
    const baseLabel = btn.dataset.baseLabel || btn.textContent.trim().replace(/\s*\(\d+\)$/, '');
    btn.dataset.baseLabel = baseLabel;
    btn.textContent = `${baseLabel} (${counts[status] ?? 0})`;
  });
};

const renderIssueSkeletons = (count = 3) => {
  const container = document.getElementById('issues-list');
  if (!container) return;
  container.innerHTML = Array.from({ length: count }).map(() => `
    <div class="card seller-issue-card">
      <div class="card-body seller-issue-body">
        <div class="home-skeleton shimmer home-skeleton-title"></div>
        <div class="home-skeleton shimmer home-skeleton-line mt-2"></div>
        <div class="home-skeleton shimmer home-skeleton-line mt-2"></div>
        <div class="home-skeleton shimmer home-skeleton-actions mt-3"></div>
      </div>
    </div>
  `).join('');
};

const loadMyIssues = async () => {
  const container = document.getElementById('issues-list');
  if (!container) return;

  document.querySelectorAll('.issue-filter').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.status === issueFilters.status || (btn.dataset.status === 'all' && !issueFilters.status)) {
      btn.classList.add('active');
    }
  });

  renderIssueSkeletons();

  try {
    const response = await getMyIssues({ status: issueFilters.status });
    const allIssues = response.data?.issues || [];
    renderIssueStats(allIssues);
    applyIssuesStatsCollapsedState();
    updateIssueFilterCounts(allIssues);

    let issues = [...allIssues];
    if (issueFilters.status && issueFilters.status !== 'all') {
      issues = issues.filter(issue => normalizeIssueStatus(issue.status) === issueFilters.status);
    }

    const searchTerm = String(issueFilters.search || '').trim().toLowerCase();
    if (searchTerm) {
      issues = issues.filter((issue) => getIssueSearchText(issue).includes(searchTerm));
    }

    if (issueFilters.sort === 'oldest') {
      issues.sort((a, b) => getIssueSortTimestamp(a) - getIssueSortTimestamp(b));
    } else if (issueFilters.sort === 'updated') {
      issues.sort((a, b) => {
        const aUpdated = Date.parse(a?.updated_at || a?.created_at || '');
        const bUpdated = Date.parse(b?.updated_at || b?.created_at || '');
        return (Number.isFinite(bUpdated) ? bUpdated : 0) - (Number.isFinite(aUpdated) ? aUpdated : 0);
      });
    } else {
      issues.sort((a, b) => getIssueSortTimestamp(b) - getIssueSortTimestamp(a));
    }

    currentIssues = issues;
    applyIssueFiltersToUi();

    if (currentIssues.length === 0) {
      const filteredState = issueFilters.status !== 'all' || searchTerm.length > 0;
      container.innerHTML = `
        <div class="text-center py-12">
          <i class="bi bi-flag text-6xl text-gray-400"></i>
          <p class="font-semibold mt-4">${filteredState ? 'No matching issues' : 'No issues reported'}</p>
          <p class="text-sm text-gray-600 mt-2">Submitted disputes and resolutions will appear here.</p>
          <p class="text-xs text-gray-500 mt-2">Issues can be filed from completed orders only.</p>
          <div class="mt-4 flex items-center justify-center gap-2 flex-wrap">
            ${filteredState
        ? '<button class="btn btn-primary" onclick="window.resetIssueFilters()">View All Issues</button>'
        : '<a href="#orders" class="btn btn-primary">View Orders</a>'}
            <button class="btn btn-outline" onclick="window.openIssueResolutionGuide()">How issue resolution works</button>
          </div>
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
        <button class="btn btn-primary mt-4" onclick="window.loadIssuesFromUI()">Retry</button>
      </div>
    `;
  }
};

const createIssueCard = (issue) => {
  const issueStatus = normalizeIssueStatus(issue.status);
  const statusConfig = ISSUE_STATUS_CONFIG[issueStatus];
  const priority = String(issue.priority || 'medium').toLowerCase();
  const priorityLabel = priority.toUpperCase();
  const priorityClass = priority === 'urgent' || priority === 'high'
    ? 'seller-issue-priority--high'
    : priority === 'low'
      ? 'seller-issue-priority--low'
      : 'seller-issue-priority--medium';
  const timelineLabel = issueStatus === 'resolved'
    ? 'Reported -> Under Review -> Resolved'
    : issueStatus === 'rejected'
      ? 'Reported -> Under Review -> Rejected'
      : 'Reported -> Under Review -> Awaiting Resolution';
  const assignedRole = issueStatus === 'under_review'
    ? (issue.assigned_role || 'Support')
    : 'Resolution Team';
  const resolutionDays = getIssueResolutionDays(issue);
  const expectedDays = getIssueExpectedResponseDays(issue);
  const relatedOrderId = issue?.order_id || issue?.order?.id || '';
  const updatedAtTs = Date.parse(issue?.updated_at || issue?.created_at || '');
  const isRecentUpdate = Number.isFinite(updatedAtTs) && (Date.now() - updatedAtTs) <= (1000 * 60 * 60 * 24);
  const safeIssueId = String(issue?.id || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  return `
    <div class="card seller-issue-card hover:shadow-lg transition-shadow ${isRecentUpdate ? 'is-recent-update' : ''}" data-issue-id="${issue.id}">
      <div class="card-body seller-issue-body">
        <div class="seller-issue-topline">
          <div class="seller-issue-head-copy">
            <h3 class="font-bold text-lg seller-issue-title">${escapeHtml(issue.issue_type || 'Issue')}</h3>
            <p class="seller-issue-subid">Issue #${escapeHtml(issue.id || 'N/A')} • Order #${escapeHtml(issue.order?.order_number || 'N/A')}</p>
          </div>
          <div class="seller-issue-chips">
            <span class="badge badge-${statusConfig.color} seller-issue-status">
              <i class="bi bi-${statusConfig.icon}"></i> ${statusConfig.label}
            </span>
            <span class="seller-issue-priority ${priorityClass}">${priorityLabel}</span>
          </div>
        </div>

        <p class="text-sm text-gray-600 mb-3 seller-issue-desc">${escapeHtml(issue.description || '')}</p>

        <div class="seller-issue-timeline">${timelineLabel}</div>

        <div class="seller-issue-meta-grid">
          <div class="seller-issue-meta-item"><i class="bi bi-calendar"></i> Reported: ${formatRelativeTime(issue.created_at)}</div>
          <div class="seller-issue-meta-item"><i class="bi bi-clock-history"></i> Last updated: ${formatRelativeTime(issue.updated_at || issue.created_at)}</div>
          <div class="seller-issue-meta-item"><i class="bi bi-person-badge"></i> Assigned: ${escapeHtml(assignedRole)}</div>
          ${issueStatus === 'under_review'
      ? `<div class="seller-issue-meta-item"><i class="bi bi-alarm"></i> Expected response: ${expectedDays > 0 ? `~${expectedDays} day(s)` : 'within 24 hours'}</div>`
      : `<div class="seller-issue-meta-item"><i class="bi bi-check2-circle"></i> ${resolutionDays ? `Resolved in ${resolutionDays} day(s)` : 'Resolution posted'}</div>`}
        </div>

        ${buildIssueAttachmentsHtml(issue)}

        <details class="seller-issue-details mt-3">
          <summary>Quick details</summary>
          <div class="seller-issue-details-body">
            ${issue.resolution ? `
              <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg mb-2">
                <p class="text-sm font-semibold text-blue-800 mb-1"><i class="bi bi-person-badge"></i> Resolution</p>
                <p class="text-sm text-blue-900">${escapeHtml(issue.resolution)}</p>
              </div>
            ` : ''}
            ${issue.outcome_action ? `
              <div class="p-3 bg-green-50 border border-green-200 rounded-lg">
                <p class="text-sm font-semibold text-green-800 mb-1"><i class="bi bi-cash-coin"></i> Outcome Action</p>
                <p class="text-sm text-green-900">
                  ${escapeHtml(String(issue.outcome_action).replace(/_/g, ' '))}
                  ${issue.outcome_amount ? ` - ${formatCurrency(issue.outcome_amount)}` : ''}
                </p>
                ${issue.outcome_notes ? `<p class="text-xs text-green-800 mt-1">${escapeHtml(issue.outcome_notes)}</p>` : ''}
              </div>
            ` : ''}
          </div>
        </details>

        <div class="seller-issue-actions">
          <button class="btn btn-sm btn-primary" onclick="window.viewSellerIssueDetails('${safeIssueId}')">
            <i class="bi bi-eye"></i> View Issue
          </button>
          ${relatedOrderId ? `
            <button class="btn btn-sm btn-outline" onclick="window.openOrderChat('${relatedOrderId}')">
              <i class="bi bi-chat-dots"></i> Open Related Messages
            </button>
          ` : ''}
        </div>
      </div>
    </div>
  `;
};

window.openIssueResolutionGuide = () => {
  createModal({
    title: 'How Issue Resolution Works',
    content: `
      <div class="space-y-3 text-sm text-gray-700">
        <p><strong>1.</strong> Report issue from a completed order.</p>
        <p><strong>2.</strong> Include complete details and evidence attachments.</p>
        <p><strong>3.</strong> Support reviews and coordinates with buyer.</p>
        <p><strong>4.</strong> Resolution is posted with final action and notes.</p>
        <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-900">
          Typical review window is 1-3 business days depending on complexity.
        </div>
      </div>
    `,
    footer: '<button class="btn btn-primary" data-modal-close>Got it</button>',
    size: 'md'
  });
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
    
    const safeIssueType = escapeHtml(issue?.issue_type || 'Issue');
    const safeStatus = escapeHtml(String(issue?.status || 'unknown').replace('_', ' ').toUpperCase());
    const safeOrderNumber = escapeHtml(issue?.order?.order_number || 'N/A');
    const safePriority = escapeHtml(String(issue?.priority || 'medium').toUpperCase());
    const safeDescription = escapeHtml(issue?.description || '');
    const safeResolution = escapeHtml(issue?.resolution || '');
    const safeOutcomeAction = escapeHtml(String(issue?.outcome_action || '').replace(/_/g, ' '));
    const safeOutcomeNotes = escapeHtml(issue?.outcome_notes || '');

    const modal = createModal({
      title: 'Issue Details',
      content: `
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-bold">${safeIssueType}</h3>
            <span class="badge badge-${statusColors[issue.status] || 'secondary'}">
              ${safeStatus}
            </span>
          </div>
          
          <div class="border-t pt-4">
            <h4 class="font-semibold mb-2">Order Information</h4>
            <p class="text-sm"><i class="bi bi-receipt"></i> Order #${safeOrderNumber}</p>
            <p class="text-sm"><i class="bi bi-cash"></i> ${formatCurrency(issue.order?.total_amount || 0)}</p>
            <p class="text-sm"><i class="bi bi-flag"></i> Priority: ${safePriority}</p>
            ${issue.sla_due_at ? `<p class="text-sm"><i class="bi bi-alarm"></i> SLA Due: ${formatRelativeTime(issue.sla_due_at)}</p>` : ''}
            ${issue.status === 'under_review' ? `<p class="text-sm"><i class="bi bi-exclamation-circle"></i> SLA: ${issue.is_overdue ? 'OVERDUE' : 'On Track'}</p>` : ''}
          </div>
          
          <div class="border-t pt-4">
            <h4 class="font-semibold mb-2">Description</h4>
            <p class="text-sm text-gray-700">${safeDescription}</p>
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
          
          ${issue.resolution ? `
            <div class="border-t pt-4">
              <h4 class="font-semibold mb-2">Resolution</h4>
              <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p class="text-sm text-blue-900">${safeResolution}</p>
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

          ${issue.outcome_action ? `
            <div class="border-t pt-4">
              <h4 class="font-semibold mb-2">Outcome Action</h4>
              <div class="p-3 bg-green-50 border border-green-200 rounded-lg">
                <p class="text-sm text-green-900">
                  ${safeOutcomeAction}
                  ${issue.outcome_amount ? ` - ${formatCurrency(issue.outcome_amount)}` : ''}
                </p>
                ${issue.outcome_notes ? `<p class="text-xs text-green-800 mt-2">${safeOutcomeNotes}</p>` : ''}
              </div>
            </div>
          ` : ''}
          
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
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => {
      issueFilters.status = newBtn.dataset.status;
      loadMyIssues();
    });
  });
};

window.messageCustomer = (orderId) => {
  stopTypingSignal();
  hideTypingIndicator();
  currentConversation = orderId;

  window.location.hash = '#messaging';
  setMessagingMobileView('chat');
  setTimeout(() => {
    window.openOrderChat(orderId);
  }, 80);
};

window.viewOrderDetails = async (orderId) => {
  try {
    const targetOrderId = resolveOrderApiId(orderId);
    if (!targetOrderId) {
      showError('Unable to resolve order ID');
      return;
    }
    // Fetch fresh order data to get latest delivery proof images
    const response = await getOrderById(targetOrderId);
    const order = response.data?.order;
    
    if (!order) {
      showError('Order not found');
      return;
    }

    // Fetch product reviews for this order
    let productReviews = [];
    try {
      const token = getToken();
      const reviewsUrl = buildUrl(`/orders/${targetOrderId}/reviews`);
      const reviewsResponse = await fetch(reviewsUrl, {
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

    const safeOrderNumber = escapeHtml(order.order_number || 'N/A');
    const safeStatus = escapeHtml(String(order.status || 'unknown').toUpperCase());
    const safeDeliveryOption = escapeHtml(order.delivery_option || 'Not specified');
    const safeBuyerName = escapeHtml(order.buyer?.user?.full_name || 'Unknown');
    const safeBuyerEmail = escapeHtml(order.buyer?.user?.email || '');
    const safeBuyerPhone = escapeHtml(order.buyer?.user?.phone_number || '');
    const safeDeliveryAddress = escapeHtml(order.delivery_address || 'Not provided');
    const safeDeliveryLocation = escapeHtml(order.delivery_location_name || '');
    const safeOrderNotes = escapeHtml(order.order_notes || '');
    const orderItems = Array.isArray(order.items) ? order.items : [];

    const detailsHtml = `
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <p class="text-sm text-gray-600">Order Number</p>
          <p class="font-bold text-lg">#${safeOrderNumber}</p>
        </div>
        <div>
          <p class="text-sm text-gray-600">Status</p>
          <p class="font-bold text-lg">
            <span class="badge badge-${order.status === 'pending' ? 'warning' : order.status === 'confirmed' ? 'info' : order.status === 'ready' ? 'primary' : order.status === 'completed' ? 'success' : 'danger'}">
              ${safeStatus}
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
          <p class="font-semibold">${safeDeliveryOption}</p>
        </div>
      </div>

      <div>
        <p class="text-sm text-gray-600 mb-2">Buyer Information</p>
        <div class="bg-gray-50 p-3 rounded-lg space-y-1">
          <p class="font-semibold">${safeBuyerName}</p>
          ${safeBuyerEmail ? `<p class="text-sm text-gray-600"><i class="bi bi-envelope"></i> ${safeBuyerEmail}</p>` : ''}
          ${safeBuyerPhone ? `<p class="text-sm text-gray-600"><i class="bi bi-telephone"></i> ${safeBuyerPhone}</p>` : ''}
        </div>
      </div>

      <div>
        <p class="text-sm text-gray-600 mb-2">Delivery Address</p>
        <div class="bg-gray-50 p-3 rounded-lg">
          <p class="text-sm">${safeDeliveryAddress}</p>
          <p class="text-sm text-gray-600">${safeDeliveryLocation}</p>
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

      ${order.order_notes ? `
        <div>
          <p class="text-sm text-gray-600 mb-2">
            <i class="bi bi-chat-left-text"></i> Buyer's Special Notes
          </p>
          <div class="bg-blue-50 p-3 rounded-lg border border-blue-200">
            <p class="text-sm italic">"${safeOrderNotes}"</p>
          </div>
        </div>
      ` : ''}

      <div>
        <p class="text-sm text-gray-600 mb-2">Order Items</p>
        <div class="space-y-2">
          ${orderItems.map(item => `
            <div class="flex justify-between items-start bg-gray-50 p-2 rounded">
              <div>
                <p class="font-semibold">${escapeHtml(item?.product_name || 'Unknown Product')}</p>
                <p class="text-sm text-gray-600">${escapeHtml(String(item?.quantity ?? 0))} ${escapeHtml(item?.unit_type || 'unit')}</p>
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
                    <p class="font-semibold text-sm">${escapeHtml(review.product_name || 'Product')}</p>
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
                  <p class="text-sm text-gray-700 mt-2 italic">"${escapeHtml(review.comment)}"</p>
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
    title: `Order Details - #${escapeHtml(order.order_number || 'N/A')}`,
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
let funnelChart = null;
let bestTimeChart = null;
let promoImpactChart = null;
let analyticsListenersAttached = false;
let latestAnalyticsSnapshot = null;
let analyticsExportMenuOpen = false;
const ANALYTICS_STORAGE_KEY = 'agrimarket_seller_analytics_settings';
const analyticsState = {
  range: 'last_30_days',
  compareMode: 'week',
  customFrom: '',
  customTo: '',
  defaultMargin: 30,
  goalSales: 0,
  goalOrders: 0,
  promoStartDate: '',
  promoDiscount: 0
};

const getAnalyticsRangeLabel = () => {
  switch (analyticsState.range) {
    case 'last_7_days':
      return 'previous 7 days';
    case 'last_30_days':
      return 'previous 30 days';
    case 'last_90_days':
      return 'previous 90 days';
    case 'last_365_days':
      return 'previous year';
    case 'custom':
      return analyticsState.customFrom && analyticsState.customTo
        ? `${analyticsState.customFrom} to ${analyticsState.customTo}`
        : 'custom period';
    default:
      return 'previous period';
  }
};

const updateAnalyticsBaselineText = () => {
  const baselineEl = document.getElementById('analytics-compare-baseline');
  if (!baselineEl) return;
  baselineEl.textContent = `vs ${getAnalyticsRangeLabel()}`;
};

const updateAnalyticsFreshness = ({ loading = false, failed = false } = {}) => {
  const freshnessEl = document.getElementById('analytics-last-updated');
  if (!freshnessEl) return;
  freshnessEl.classList.toggle('is-loading', loading);
  if (loading) {
    freshnessEl.textContent = 'Updating data...';
    return;
  }
  if (failed) {
    freshnessEl.textContent = 'Update failed. Try refresh.';
    return;
  }
  freshnessEl.textContent = `Updated ${new Date().toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`;
};

const updateAnalyticsQuickRangeUi = () => {
  const now = new Date();
  const ytdStart = toLocalIsoDate(new Date(now.getFullYear(), 0, 1));
  const ytdEnd = toLocalIsoDate(now);
  const chips = document.querySelectorAll('[data-analytics-quick-range]');
  chips.forEach((chip) => {
    const value = chip.dataset.analyticsQuickRange || '';
    const isYtd = value === 'ytd'
      && analyticsState.range === 'custom'
      && analyticsState.customFrom === ytdStart
      && analyticsState.customTo === ytdEnd;
    const isActive = value === analyticsState.range || isYtd;
    chip.classList.toggle('is-active', Boolean(isActive));
  });
};

const closeAnalyticsExportMenu = () => {
  const menu = document.getElementById('analytics-export-menu');
  const toggle = document.getElementById('btn-analytics-export-toggle');
  analyticsExportMenuOpen = false;
  if (menu) menu.hidden = true;
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
};

const toggleAnalyticsExportMenu = () => {
  const menu = document.getElementById('analytics-export-menu');
  const toggle = document.getElementById('btn-analytics-export-toggle');
  if (!menu || !toggle) return;
  analyticsExportMenuOpen = !analyticsExportMenuOpen;
  menu.hidden = !analyticsExportMenuOpen;
  toggle.setAttribute('aria-expanded', analyticsExportMenuOpen ? 'true' : 'false');
};

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const toInt = (value) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
};

const parseDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const toLocalIsoDate = (value) => {
  const d = new Date(value);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

const getOrderAmount = (order) => {
  const total = toNumber(order?.total_amount);
  if (total > 0) return total;
  const items = Array.isArray(order?.items) ? order.items : [];
  return items.reduce((sum, item) => sum + toNumber(item?.subtotal), 0);
};

const loadAnalyticsSettings = () => {
  try {
    const raw = localStorage.getItem(ANALYTICS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    analyticsState.range = parsed.range || analyticsState.range;
    analyticsState.compareMode = parsed.compareMode || analyticsState.compareMode;
    analyticsState.customFrom = parsed.customFrom || '';
    analyticsState.customTo = parsed.customTo || '';
    analyticsState.defaultMargin = Math.min(95, Math.max(0, toNumber(parsed.defaultMargin ?? analyticsState.defaultMargin)));
    analyticsState.goalSales = Math.max(0, toNumber(parsed.goalSales || 0));
    analyticsState.goalOrders = Math.max(0, toInt(parsed.goalOrders || 0));
    analyticsState.promoStartDate = parsed.promoStartDate || '';
    analyticsState.promoDiscount = Math.min(95, Math.max(0, toNumber(parsed.promoDiscount || 0)));
  } catch (error) {
    console.warn('Failed to load analytics settings:', error);
  }
};

const saveAnalyticsSettings = () => {
  try {
    localStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(analyticsState));
  } catch (error) {
    console.warn('Failed to save analytics settings:', error);
  }
};

const getAnalyticsDateRange = () => {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(now);

  switch (analyticsState.range) {
    case 'last_7_days':
      start.setDate(start.getDate() - 6);
      break;
    case 'last_30_days':
      start.setDate(start.getDate() - 29);
      break;
    case 'last_90_days':
      start.setDate(start.getDate() - 89);
      break;
    case 'last_365_days':
      start.setDate(start.getDate() - 364);
      break;
    case 'custom': {
      const customStart = parseDate(analyticsState.customFrom);
      const customEnd = parseDate(analyticsState.customTo);
      if (customStart && customEnd && customStart <= customEnd) {
        customStart.setHours(0, 0, 0, 0);
        customEnd.setHours(23, 59, 59, 999);
        return { start: customStart, end: customEnd, label: `${analyticsState.customFrom} to ${analyticsState.customTo}` };
      }
      start.setDate(start.getDate() - 29);
      break;
    }
    default:
      start.setDate(start.getDate() - 29);
      break;
  }

  start.setHours(0, 0, 0, 0);
  return { start, end, label: analyticsState.range.replace(/_/g, ' ') };
};

const isInRange = (value, range) => {
  const d = parseDate(value);
  return !!d && d >= range.start && d <= range.end;
};

const getPeriodRanges = () => {
  const now = new Date();
  if (analyticsState.compareMode === 'month') {
    const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { currentStart, currentEnd, previousStart, previousEnd };
  }

  const weekday = now.getDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const currentStart = new Date(now);
  currentStart.setDate(now.getDate() + mondayOffset);
  currentStart.setHours(0, 0, 0, 0);
  const currentEnd = new Date(currentStart);
  currentEnd.setDate(currentEnd.getDate() + 6);
  currentEnd.setHours(23, 59, 59, 999);
  const previousStart = new Date(currentStart);
  previousStart.setDate(previousStart.getDate() - 7);
  const previousEnd = new Date(currentEnd);
  previousEnd.setDate(previousEnd.getDate() - 7);
  return { currentStart, currentEnd, previousStart, previousEnd };
};

const fetchAnalyticsOrders = async () => {
  const tryConfigs = [
    { limit: 100, page: 1 },
    { limit: 50, page: 1 },
    { page: 1 },
    {}
  ];

  let firstResponse = null;
  for (const filters of tryConfigs) {
    try {
      firstResponse = await getOrders(filters);
      break;
    } catch (error) {
      // Try next fallback config
    }
  }

  if (!firstResponse) {
    throw new Error('Unable to fetch orders for analytics');
  }

  const firstBatch = Array.isArray(firstResponse.data?.orders) ? firstResponse.data.orders : [];
  const baseLimit = toInt(
    firstResponse.limit ||
    firstResponse.data?.limit ||
    firstResponse.data?.pagination?.limit ||
    firstBatch.length ||
    100
  ) || 100;
  const firstPage = Math.max(
    1,
    toInt(firstResponse.page || firstResponse.data?.page || firstResponse.data?.pagination?.page || 1)
  );
  const reportedTotalPages = Math.max(
    0,
    toInt(firstResponse.total_pages || firstResponse.data?.total_pages || firstResponse.data?.pagination?.total_pages)
  );

  if (firstBatch.length === 0) {
    return [];
  }

  // Prefer API-reported page count; keep a high safety cap when metadata is absent.
  const safetyMaxPages = 500;
  const targetPages = reportedTotalPages > 0 ? Math.min(reportedTotalPages, safetyMaxPages) : safetyMaxPages;
  if (reportedTotalPages <= 1 && firstBatch.length < baseLimit) {
    return firstBatch;
  }

  const allOrders = [...firstBatch];
  let page = firstPage + 1;

  while (page <= targetPages) {
    try {
      const response = await getOrders({ page, limit: baseLimit });
      const batch = response.data?.orders || [];
      if (!Array.isArray(batch) || batch.length === 0) break;
      allOrders.push(...batch);
      // For APIs without total_pages metadata, stop once we hit a short page.
      if (reportedTotalPages <= 0 && batch.length < baseLimit) break;
      page += 1;
    } catch (error) {
      break;
    }
  }

  return allOrders;
};

const loadAnalytics = async () => {
  try {
    setupAnalyticsEventListeners();
    updateAnalyticsBaselineText();
    updateAnalyticsFreshness({ loading: true });
    showSpinner();

    const [analyticsRes, productsRes, ordersRes] = await Promise.allSettled([
      getSellerAnalytics(),
      getMyProducts(),
      fetchAnalyticsOrders()
    ]);

    const analytics = analyticsRes.status === 'fulfilled' ? (analyticsRes.value?.data || {}) : {};
    const products = productsRes.status === 'fulfilled' ? (productsRes.value?.data?.products || []) : (currentProducts || []);
    const allOrders = ordersRes.status === 'fulfilled' ? (ordersRes.value || []) : (currentOrders || []);
    const range = getAnalyticsDateRange();
    const orders = allOrders.filter(order => isInRange(order.created_at, range));
    const completedOrders = orders.filter(order => order.status === 'completed');
    const pendingOrders = orders.filter(order => order.status === 'pending').length;
    const totalSales = completedOrders.reduce((sum, order) => sum + getOrderAmount(order), 0);

    latestAnalyticsSnapshot = {
      analytics,
      products,
      allOrders,
      orders,
      completedOrders,
      range
    };

    const statProducts = document.getElementById('stat-products');
    const statPending = document.getElementById('stat-pending');
    const statSales = document.getElementById('stat-sales');
    if (statProducts) statProducts.textContent = products.length;
    if (statPending) statPending.textContent = pendingOrders;
    if (statSales) statSales.textContent = formatCurrency(totalSales);

    await Promise.all([
      loadSalesChart(),
      loadTopProductsChart()
    ]);

    renderAnalyticsPrimaryDeltas();
    renderCompareSummaryCards();
    renderFunnelChartCard();
    renderBestSellingTimeChart();
    renderProductPerformanceTable();
    renderLowStockForecastCard();
    renderCustomerInsightsCard();
    renderProfitAnalyticsCard();
    renderGoalTrackingCard();
    renderPromoImpactCard();
    updateAnalyticsFreshness();
    
  } catch (error) {
    console.error('Error loading analytics:', error);
    showError('Failed to load analytics data');
    updateAnalyticsFreshness({ failed: true });
  } finally {
    hideSpinner();
  }
};

const loadSalesChart = async () => {
  try {
    const supportedApiRanges = new Set(['last_7_days', 'last_30_days', 'last_90_days']);
    let chartData = null;

    if (supportedApiRanges.has(analyticsState.range)) {
      try {
        const response = await getSalesOverTime(analyticsState.range);
        chartData = response?.data?.sales || null;
      } catch (error) {
        console.warn('Sales chart API fallback to local data:', error);
      }
    }

    if (!chartData?.labels?.length && latestAnalyticsSnapshot) {
      chartData = buildSalesChartFromOrders(latestAnalyticsSnapshot.orders, latestAnalyticsSnapshot.range);
    }

    if (!chartData?.labels?.length) {
      chartData = {
        labels: ['No Data'],
        datasets: [
          { label: 'Sales', data: [0], borderColor: '#d1d5db', backgroundColor: 'rgba(209,213,219,0.2)', yAxisID: 'y' },
          { label: 'Orders', data: [0], borderColor: '#9ca3af', backgroundColor: 'rgba(156,163,175,0.2)', yAxisID: 'y1' }
        ]
      };
    }
    
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
            text: `Sales Overview (${latestAnalyticsSnapshot?.range?.label || analyticsState.range.replace(/_/g, ' ')})`
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
    const ctx = document.getElementById('sales-chart');
    if (ctx) {
      if (salesChart) salesChart.destroy();
      salesChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: ['No Data'],
          datasets: [{ label: 'Sales', data: [0], borderColor: '#d1d5db' }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: { display: true, text: 'Unable to load sales chart' },
            legend: { display: false },
            tooltip: { enabled: false }
          }
        }
      });
    }
  }
};

const loadTopProductsChart = async () => {
  try {
    // First try to get products by sales
    let response = await getTopProducts(10, 'sales');
    
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
      
      // Try by views
      response = await getTopProducts(5, 'views');
      if (response && response.success && response.data && response.data.chartData && 
          response.data.chartData.labels && response.data.chartData.labels.length > 0) {
        chartData = response.data.chartData;
        chartTitle = 'Top Products by Views';
      } else {
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
      const ctx = document.getElementById('products-chart');
      if (!ctx) return;
      if (topProductsChart) {
        topProductsChart.destroy();
      }
      topProductsChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['No Data'],
          datasets: [{ data: [1], backgroundColor: ['#e5e7eb'] }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: { display: true, text: 'No active products yet' },
            legend: { display: false },
            tooltip: { enabled: false }
          }
        }
      });
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
    
  } catch (error) {
    console.error('Detailed error loading top products chart:', error);
    const ctx = document.getElementById('products-chart');
    if (ctx) {
      if (topProductsChart) topProductsChart.destroy();
      topProductsChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Error'],
          datasets: [{ data: [1], backgroundColor: ['#fecaca'] }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: { display: true, text: 'Unable to load top products chart' },
            legend: { display: false },
            tooltip: { enabled: false }
          }
        }
      });
    }
  }
};

const buildSalesChartFromOrders = (orders, range) => {
  const keys = [];
  const salesMap = new Map();
  const ordersMap = new Map();
  const cursor = new Date(range.start);

  while (cursor <= range.end) {
    const key = toLocalIsoDate(cursor);
    keys.push(key);
    salesMap.set(key, 0);
    ordersMap.set(key, 0);
    cursor.setDate(cursor.getDate() + 1);
  }

  orders.forEach(order => {
    const orderDate = parseDate(order?.created_at);
    if (!orderDate) return;
    const key = toLocalIsoDate(orderDate);
    if (!ordersMap.has(key)) return;
    ordersMap.set(key, ordersMap.get(key) + 1);
    if (order.status === 'completed') {
      salesMap.set(key, salesMap.get(key) + getOrderAmount(order));
    }
  });

  const labels = keys.map(key => {
    const d = new Date(key);
    return `${d.toLocaleString('en-PH', { month: 'short' })} ${d.getDate()}`;
  });

  return {
    labels,
    datasets: [
      {
        label: 'Sales',
        data: keys.map(key => Number(salesMap.get(key).toFixed(2))),
        borderColor: '#16a34a',
        backgroundColor: 'rgba(22,163,74,0.15)',
        yAxisID: 'y',
        fill: true,
        tension: 0.25
      },
      {
        label: 'Orders',
        data: keys.map(key => ordersMap.get(key)),
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37,99,235,0.15)',
        yAxisID: 'y1',
        fill: false,
        tension: 0.2
      }
    ]
  };
};

const setupAnalyticsEventListeners = () => {
  if (analyticsListenersAttached) return;

  loadAnalyticsSettings();
  const rangeSelect = document.getElementById('analytics-range');
  const compareSelect = document.getElementById('analytics-compare-mode');
  const customFrom = document.getElementById('analytics-custom-from');
  const customTo = document.getElementById('analytics-custom-to');
  const customFromWrap = document.getElementById('analytics-custom-from-wrap');
  const customToWrap = document.getElementById('analytics-custom-to-wrap');
  const refreshBtn = document.getElementById('btn-analytics-refresh');
  const quickRangeChips = document.querySelectorAll('[data-analytics-quick-range]');
  const exportToggleBtn = document.getElementById('btn-analytics-export-toggle');
  const exportCsvBtn = document.getElementById('btn-export-analytics-csv');
  const exportAllCsvBtn = document.getElementById('btn-export-analytics-csv-all');
  const exportChartPngBtn = document.getElementById('btn-export-analytics-chart-png');
  const exportPdfBtn = document.getElementById('btn-export-analytics-pdf');
  const marginInput = document.getElementById('analytics-default-margin');
  const goalSales = document.getElementById('goal-sales-target');
  const goalOrders = document.getElementById('goal-orders-target');
  const saveGoals = document.getElementById('btn-save-goals');
  const promoStart = document.getElementById('promo-start-date');
  const promoDiscount = document.getElementById('promo-discount');
  const promoAnalyze = document.getElementById('btn-apply-promo-impact');

  const toggleCustom = () => {
    const show = analyticsState.range === 'custom';
    if (customFromWrap) customFromWrap.style.display = show ? '' : 'none';
    if (customToWrap) customToWrap.style.display = show ? '' : 'none';
  };

  if (rangeSelect) rangeSelect.value = analyticsState.range;
  if (compareSelect) compareSelect.value = analyticsState.compareMode;
  if (customFrom) customFrom.value = analyticsState.customFrom;
  if (customTo) customTo.value = analyticsState.customTo;
  if (marginInput) marginInput.value = analyticsState.defaultMargin;
  if (goalSales) goalSales.value = analyticsState.goalSales || '';
  if (goalOrders) goalOrders.value = analyticsState.goalOrders || '';
  if (promoStart) promoStart.value = analyticsState.promoStartDate || '';
  if (promoDiscount) promoDiscount.value = analyticsState.promoDiscount || 0;
  toggleCustom();
  updateAnalyticsQuickRangeUi();
  updateAnalyticsBaselineText();

  if (rangeSelect) {
    rangeSelect.addEventListener('change', async () => {
      analyticsState.range = rangeSelect.value;
      if (analyticsState.range !== 'custom') {
        analyticsState.customFrom = '';
        analyticsState.customTo = '';
      }
      toggleCustom();
      saveAnalyticsSettings();
      updateAnalyticsQuickRangeUi();
      updateAnalyticsBaselineText();
      await loadAnalytics();
    });
  }

  if (compareSelect) {
    compareSelect.addEventListener('change', async () => {
      analyticsState.compareMode = compareSelect.value;
      saveAnalyticsSettings();
      updateAnalyticsBaselineText();
      renderCompareSummaryCards();
      renderAnalyticsPrimaryDeltas();
    });
  }

  if (customFrom) {
    customFrom.addEventListener('change', () => {
      analyticsState.customFrom = customFrom.value || '';
      saveAnalyticsSettings();
      updateAnalyticsQuickRangeUi();
      updateAnalyticsBaselineText();
    });
  }

  if (customTo) {
    customTo.addEventListener('change', () => {
      analyticsState.customTo = customTo.value || '';
      saveAnalyticsSettings();
      updateAnalyticsQuickRangeUi();
      updateAnalyticsBaselineText();
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      if (customFrom) analyticsState.customFrom = customFrom.value || '';
      if (customTo) analyticsState.customTo = customTo.value || '';
      if (promoStart) analyticsState.promoStartDate = promoStart.value || '';
      if (promoDiscount) analyticsState.promoDiscount = Math.min(95, Math.max(0, toNumber(promoDiscount.value)));
      saveAnalyticsSettings();
      await loadAnalytics();
    });
  }

  if (quickRangeChips.length) {
    quickRangeChips.forEach((chip) => {
      chip.addEventListener('click', async () => {
        const quickRange = chip.dataset.analyticsQuickRange || '';
        if (quickRange === 'ytd') {
          const now = new Date();
          analyticsState.range = 'custom';
          analyticsState.customFrom = toLocalIsoDate(new Date(now.getFullYear(), 0, 1));
          analyticsState.customTo = toLocalIsoDate(now);
          if (customFrom) customFrom.value = analyticsState.customFrom;
          if (customTo) customTo.value = analyticsState.customTo;
        } else if (quickRange) {
          analyticsState.range = quickRange;
          analyticsState.customFrom = '';
          analyticsState.customTo = '';
          if (customFrom) customFrom.value = '';
          if (customTo) customTo.value = '';
        }
        if (rangeSelect) rangeSelect.value = analyticsState.range;
        toggleCustom();
        saveAnalyticsSettings();
        updateAnalyticsQuickRangeUi();
        updateAnalyticsBaselineText();
        await loadAnalytics();
      });
    });
  }

  if (marginInput) {
    marginInput.addEventListener('change', () => {
      analyticsState.defaultMargin = Math.min(95, Math.max(0, toNumber(marginInput.value)));
      marginInput.value = analyticsState.defaultMargin;
      saveAnalyticsSettings();
      renderProfitAnalyticsCard();
    });
  }

  if (saveGoals) {
    saveGoals.addEventListener('click', () => {
      analyticsState.goalSales = Math.max(0, toNumber(goalSales?.value));
      analyticsState.goalOrders = Math.max(0, toInt(goalOrders?.value));
      saveAnalyticsSettings();
      renderGoalTrackingCard();
      showSuccess('Goals saved.');
    });
  }

  if (promoAnalyze) {
    promoAnalyze.addEventListener('click', () => {
      analyticsState.promoStartDate = promoStart?.value || '';
      analyticsState.promoDiscount = Math.min(95, Math.max(0, toNumber(promoDiscount?.value)));
      if (promoDiscount) promoDiscount.value = analyticsState.promoDiscount;
      saveAnalyticsSettings();
      renderPromoImpactCard();
    });
  }

  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', () => {
      if (!latestAnalyticsSnapshot) {
        showError('No analytics data to export.');
        return;
      }
      exportAnalyticsCsv({ includeAll: false });
      closeAnalyticsExportMenu();
    });
  }

  if (exportAllCsvBtn) {
    exportAllCsvBtn.addEventListener('click', () => {
      if (!latestAnalyticsSnapshot) {
        showError('No analytics data to export.');
        return;
      }
      exportAnalyticsCsv({ includeAll: true });
      closeAnalyticsExportMenu();
    });
  }

  if (exportChartPngBtn) {
    exportChartPngBtn.addEventListener('click', () => {
      if (!latestAnalyticsSnapshot) {
        showError('No analytics data to export.');
        return;
      }
      exportAnalyticsChartPng();
      closeAnalyticsExportMenu();
    });
  }

  if (exportPdfBtn) {
    exportPdfBtn.addEventListener('click', () => {
      if (!latestAnalyticsSnapshot) {
        showError('No analytics data to export.');
        return;
      }
      exportAnalyticsPdf();
      closeAnalyticsExportMenu();
    });
  }

  if (exportToggleBtn) {
    exportToggleBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleAnalyticsExportMenu();
    });
  }

  if (document.body && document.body.dataset.analyticsExportMenuBound !== '1') {
    document.body.dataset.analyticsExportMenuBound = '1';
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.seller-analytics-export-wrap')) {
        closeAnalyticsExportMenu();
      }
    });
  }

  analyticsListenersAttached = true;
};

const buildProductPerformanceRows = () => {
  if (!latestAnalyticsSnapshot) return [];
  const { products, orders } = latestAnalyticsSnapshot;
  const map = new Map();
  products.forEach(product => {
    const key = String(product.id || product.name || Math.random());
    map.set(key, {
      id: product.id,
      name: product.name || 'Unnamed Product',
      category: product.category || 'Uncategorized',
      stock: toNumber(product.available_quantity),
      views: toNumber(product.view_count || product.views || product.total_views),
      addToCart: toNumber(product.add_to_cart_count || product.cart_count || product.add_to_cart),
      orderCount: 0,
      completedCount: 0,
      cancelledCount: 0,
      refundedCount: 0,
      revenue: 0,
      soldQty30: 0
    });
  });

  const findEntry = (item) => {
    const byId = item?.product_id != null ? [...map.values()].find(x => String(x.id) === String(item.product_id)) : null;
    if (byId) return byId;
    if (!item?.product_name) return null;
    return [...map.values()].find(x => x.name.toLowerCase() === String(item.product_name).toLowerCase()) || null;
  };

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  orders.forEach(order => {
    const items = Array.isArray(order.items) ? order.items : [];
    items.forEach(item => {
      const row = findEntry(item);
      if (!row) return;
      row.orderCount += 1;
      if (order.status === 'completed') {
        row.completedCount += 1;
        row.revenue += toNumber(item.subtotal);
      }
      if (order.status === 'cancelled') row.cancelledCount += 1;
      if (order.status === 'refunded' || order.status === 'returned') row.refundedCount += 1;
      const orderDate = parseDate(order.created_at);
      if (order.status === 'completed' && orderDate && orderDate >= thirtyDaysAgo) {
        row.soldQty30 += toNumber(item.quantity);
      }
    });
  });

  return [...map.values()].sort((a, b) => b.revenue - a.revenue || b.orderCount - a.orderCount);
};

const calculatePeriodSummary = (orders, start, end) => {
  const scoped = (Array.isArray(orders) ? orders : []).filter(order => {
    const dt = parseDate(order.created_at);
    return dt && dt >= start && dt <= end;
  });
  const completed = scoped.filter(order => order.status === 'completed');
  const pending = scoped.filter(order => order.status === 'pending');
  const sales = completed.reduce((sum, order) => sum + getOrderAmount(order), 0);
  const completionRate = scoped.length ? (completed.length / scoped.length) * 100 : 0;
  return { orders: scoped.length, sales, completionRate, pending: pending.length };
};

const toDeltaText = (curr, prev, suffix = '%') => {
  if (!Number.isFinite(prev) || prev === 0) return 'No baseline yet';
  const pct = ((curr - prev) / prev) * 100;
  const arrow = pct >= 0 ? '↑' : '↓';
  return `${arrow} ${Math.abs(pct).toFixed(1)}${suffix}`;
};

const setKpiDeltaElement = (id, curr, prev) => {
  const el = document.getElementById(id);
  if (!el) return;
  const text = toDeltaText(curr, prev);
  el.textContent = text;
  el.classList.remove('is-up', 'is-down');
  if (text.startsWith('↑')) el.classList.add('is-up');
  if (text.startsWith('↓')) el.classList.add('is-down');
};

const renderAnalyticsPrimaryDeltas = () => {
  if (!latestAnalyticsSnapshot) return;
  const { currentStart, currentEnd, previousStart, previousEnd } = getPeriodRanges();
  const current = calculatePeriodSummary(latestAnalyticsSnapshot.allOrders, currentStart, currentEnd);
  const previous = calculatePeriodSummary(latestAnalyticsSnapshot.allOrders, previousStart, previousEnd);
  setKpiDeltaElement('stat-sales-delta', current.sales, previous.sales);
  setKpiDeltaElement('stat-pending-delta', current.pending, previous.pending);
  const productsDelta = document.getElementById('stat-products-delta');
  if (productsDelta) {
    productsDelta.textContent = 'Catalog size';
    productsDelta.classList.remove('is-up', 'is-down');
  }
};

const renderCompareSummaryCards = () => {
  const container = document.getElementById('analytics-compare-summary');
  if (!container || !latestAnalyticsSnapshot) return;
  const { allOrders } = latestAnalyticsSnapshot;
  const { currentStart, currentEnd, previousStart, previousEnd } = getPeriodRanges();
  const current = calculatePeriodSummary(allOrders, currentStart, currentEnd);
  const previous = calculatePeriodSummary(allOrders, previousStart, previousEnd);
  const baselineLabel = getAnalyticsRangeLabel();
  if (!Array.isArray(allOrders) || allOrders.length === 0) {
    container.innerHTML = `
      <div class="card md:col-span-3">
        <div class="card-body">
          <p class="text-sm text-gray-600 mb-1">No sales yet for this period.</p>
          <p class="font-semibold mb-1">Tips: add clearer photos, include tags, and keep stock updated.</p>
          <p class="text-sm text-gray-500 mb-0">Comparison will appear once orders are recorded.</p>
        </div>
      </div>
    `;
    return;
  }
  const delta = (curr, prev) => prev === 0 ? 0 : ((curr - prev) / prev) * 100;
  const renderDelta = (pct) => `<span class="text-sm ${pct >= 0 ? 'text-success' : 'text-danger'}"><i class="bi ${pct >= 0 ? 'bi-arrow-up-right' : 'bi-arrow-down-right'}"></i> ${Math.abs(pct).toFixed(1)}%</span>`;

  container.innerHTML = `
    <div class="card"><div class="card-body"><p class="text-sm text-gray-600">Sales Comparison</p><p class="text-2xl font-bold">${formatCurrency(current.sales)}</p>${renderDelta(delta(current.sales, previous.sales))}<p class="text-xs text-gray-500 mb-0 mt-1">vs ${escapeHtml(baselineLabel)}</p></div></div>
    <div class="card"><div class="card-body"><p class="text-sm text-gray-600">Orders Comparison</p><p class="text-2xl font-bold">${current.orders}</p>${renderDelta(delta(current.orders, previous.orders))}<p class="text-xs text-gray-500 mb-0 mt-1">vs ${escapeHtml(baselineLabel)}</p></div></div>
    <div class="card"><div class="card-body"><p class="text-sm text-gray-600">Completion Rate</p><p class="text-2xl font-bold">${current.completionRate.toFixed(1)}%</p>${renderDelta(delta(current.completionRate, previous.completionRate))}<p class="text-xs text-gray-500 mb-0 mt-1">vs ${escapeHtml(baselineLabel)}</p></div></div>
  `;
};

const renderFunnelChartCard = () => {
  if (!latestAnalyticsSnapshot) return;
  const canvas = document.getElementById('funnel-chart');
  if (!canvas) return;
  if (funnelChart) funnelChart.destroy();

  const views = latestAnalyticsSnapshot.products.reduce((sum, p) => sum + toNumber(p.view_count || p.views || p.total_views), 0);
  const inquiries = toNumber(latestAnalyticsSnapshot.analytics?.total_inquiries || latestAnalyticsSnapshot.orders.length);
  const orders = latestAnalyticsSnapshot.orders.length;
  const completed = latestAnalyticsSnapshot.completedOrders.length;

  funnelChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['Views', 'Inquiries', 'Orders', 'Completed'],
      datasets: [{
        data: [views, inquiries, orders, completed],
        backgroundColor: ['#bfdbfe', '#93c5fd', '#60a5fa', '#2563eb']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    }
  });
};

const renderBestSellingTimeChart = () => {
  if (!latestAnalyticsSnapshot) return;
  const canvas = document.getElementById('best-time-chart');
  if (!canvas) return;
  if (bestTimeChart) bestTimeChart.destroy();

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const buckets = {
    Morning: Array(7).fill(0),
    Afternoon: Array(7).fill(0),
    Evening: Array(7).fill(0),
    Night: Array(7).fill(0)
  };

  latestAnalyticsSnapshot.completedOrders.forEach(order => {
    const dt = parseDate(order.created_at);
    if (!dt) return;
    const day = dt.getDay();
    const hour = dt.getHours();
    let bucket = 'Night';
    if (hour >= 6 && hour < 12) bucket = 'Morning';
    else if (hour >= 12 && hour < 18) bucket = 'Afternoon';
    else if (hour >= 18) bucket = 'Evening';
    buckets[bucket][day] += 1;
  });

  bestTimeChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: days,
      datasets: [
        { label: 'Morning', data: buckets.Morning, backgroundColor: '#fde047' },
        { label: 'Afternoon', data: buckets.Afternoon, backgroundColor: '#fb923c' },
        { label: 'Evening', data: buckets.Evening, backgroundColor: '#60a5fa' },
        { label: 'Night', data: buckets.Night, backgroundColor: '#818cf8' }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true } } }
  });
};

const renderProductPerformanceTable = () => {
  const tbody = document.getElementById('product-performance-body');
  if (!tbody) return;
  const rows = buildProductPerformanceRows();
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray-500 py-6">No products to analyze.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(row => {
    const cancelRate = row.orderCount ? (row.cancelledCount / row.orderCount) * 100 : 0;
    const refundRate = row.completedCount ? (row.refundedCount / row.completedCount) * 100 : 0;
    return `
      <tr>
        <td>${escapeHtml(row.name)}</td>
        <td>${row.views}</td>
        <td>${row.addToCart}</td>
        <td>${row.orderCount}</td>
        <td>${formatCurrency(row.revenue)}</td>
        <td>${cancelRate.toFixed(1)}%</td>
        <td>${refundRate.toFixed(1)}%</td>
      </tr>
    `;
  }).join('');
};

const renderLowStockForecastCard = () => {
  const container = document.getElementById('low-stock-forecast');
  if (!container) return;
  const rows = buildProductPerformanceRows();
  const forecast = rows
    .map(row => {
      const avg = row.soldQty30 / 30;
      const daysLeft = avg > 0 ? row.stock / avg : Infinity;
      return { ...row, avg, daysLeft };
    })
    .filter(row => row.stock <= 10 || row.daysLeft <= 7)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  if (!forecast.length) {
    container.innerHTML = '<p class="text-sm text-gray-600">No urgent low-stock items.</p>';
    return;
  }

  container.innerHTML = forecast.slice(0, 8).map(item => `
    <div class="border rounded-lg p-3 mb-2">
      <div class="flex items-center justify-between">
        <p class="font-semibold">${escapeHtml(item.name)}</p>
        <span class="badge badge-${item.stock <= 5 ? 'danger' : 'warning'}">Stock: ${item.stock}</span>
      </div>
      <p class="text-sm text-gray-600">Avg sold/day: ${item.avg.toFixed(2)} | Days left: ${Number.isFinite(item.daysLeft) ? item.daysLeft.toFixed(1) : 'N/A'}</p>
    </div>
  `).join('');
};

const renderCustomerInsightsCard = () => {
  const container = document.getElementById('customer-insights');
  if (!container || !latestAnalyticsSnapshot) return;
  const byBuyer = new Map();
  const byMunicipality = new Map();

  latestAnalyticsSnapshot.orders.forEach(order => {
    const buyerId = String(order.buyer?.id || order.buyer_id || order.user_id || 'unknown');
    const buyerName = order.buyer?.user?.full_name || order.buyer?.full_name || 'Unknown Buyer';
    const municipality = order.buyer?.municipality || order.delivery_municipality || order.buyer?.user?.municipality || 'Unknown';

    byMunicipality.set(municipality, (byMunicipality.get(municipality) || 0) + 1);
    const info = byBuyer.get(buyerId) || { name: buyerName, count: 0, sales: 0 };
    info.count += 1;
    if (order.status === 'completed') info.sales += getOrderAmount(order);
    byBuyer.set(buyerId, info);
  });

  const buyers = [...byBuyer.values()];
  const repeat = buyers.filter(b => b.count > 1).length;
  const repeatRate = buyers.length ? (repeat / buyers.length) * 100 : 0;
  const avgOrderValue = latestAnalyticsSnapshot.completedOrders.length
    ? latestAnalyticsSnapshot.completedOrders.reduce((sum, order) => sum + getOrderAmount(order), 0) / latestAnalyticsSnapshot.completedOrders.length
    : 0;
  const topMunicipalities = [...byMunicipality.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const topBuyers = buyers.sort((a, b) => b.sales - a.sales || b.count - a.count).slice(0, 3);

  container.innerHTML = `
    <div class="grid grid-cols-2 gap-3 mb-3">
      <div class="p-3 rounded bg-gray-50"><p class="text-xs text-gray-600">Repeat Buyers</p><p class="font-bold">${repeatRate.toFixed(1)}%</p></div>
      <div class="p-3 rounded bg-gray-50"><p class="text-xs text-gray-600">Avg Order Value</p><p class="font-bold">${formatCurrency(avgOrderValue)}</p></div>
    </div>
    <div class="mb-3">
      <p class="text-sm font-semibold">Top Municipalities</p>
      ${topMunicipalities.length ? topMunicipalities.map(([name, count]) => `<p class="text-sm text-gray-600">${escapeHtml(name)} - ${count} orders</p>`).join('') : '<p class="text-sm text-gray-500">No data.</p>'}
    </div>
    <div>
      <p class="text-sm font-semibold">Top Buyers</p>
      ${topBuyers.length ? topBuyers.map(b => `<p class="text-sm text-gray-600">${escapeHtml(b.name)} - ${b.count} orders (${formatCurrency(b.sales)})</p>`).join('') : '<p class="text-sm text-gray-500">No data.</p>'}
    </div>
  `;
};

const renderProfitAnalyticsCard = () => {
  const container = document.getElementById('profit-analytics');
  if (!container) return;
  const rows = buildProductPerformanceRows();
  const margin = Math.min(0.95, Math.max(0, analyticsState.defaultMargin / 100));
  const byCategory = new Map();
  let gross = 0;
  let cost = 0;
  let profit = 0;

  rows.forEach(row => {
    const estimatedCost = row.revenue * margin;
    const estimatedProfit = row.revenue - estimatedCost;
    gross += row.revenue;
    cost += estimatedCost;
    profit += estimatedProfit;

    const cat = byCategory.get(row.category) || { sales: 0, cost: 0, profit: 0 };
    cat.sales += row.revenue;
    cat.cost += estimatedCost;
    cat.profit += estimatedProfit;
    byCategory.set(row.category, cat);
  });

  container.innerHTML = `
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
      <div class="p-3 rounded bg-gray-50"><p class="text-xs text-gray-600">Gross Sales</p><p class="font-bold">${formatCurrency(gross)}</p></div>
      <div class="p-3 rounded bg-gray-50"><p class="text-xs text-gray-600">Estimated Cost</p><p class="font-bold">${formatCurrency(cost)}</p></div>
      <div class="p-3 rounded bg-gray-50"><p class="text-xs text-gray-600">Estimated Profit</p><p class="font-bold">${formatCurrency(profit)}</p></div>
    </div>
    <div class="overflow-x-auto">
      <table class="table w-full">
        <thead><tr><th>Category</th><th>Sales</th><th>Cost</th><th>Profit</th></tr></thead>
        <tbody>
          ${[...byCategory.entries()].map(([category, data]) => `
            <tr>
              <td>${escapeHtml(category)}</td>
              <td>${formatCurrency(data.sales)}</td>
              <td>${formatCurrency(data.cost)}</td>
              <td>${formatCurrency(data.profit)}</td>
            </tr>
          `).join('') || '<tr><td colspan="4" class="text-center text-gray-500 py-4">No category data.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
};

const renderGoalTrackingCard = () => {
  const container = document.getElementById('goal-tracking');
  if (!container || !latestAnalyticsSnapshot) return;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const monthOrders = latestAnalyticsSnapshot.allOrders.filter(order => {
    const dt = parseDate(order.created_at);
    return dt && dt >= monthStart && dt <= monthEnd;
  });
  const monthCompleted = monthOrders.filter(order => order.status === 'completed');
  const monthSales = monthCompleted.reduce((sum, order) => sum + getOrderAmount(order), 0);
  const elapsedDays = Math.max(1, now.getDate());
  const projectedSales = (monthSales / elapsedDays) * monthEnd.getDate();
  const projectedOrders = (monthOrders.length / elapsedDays) * monthEnd.getDate();
  const salesPct = analyticsState.goalSales > 0 ? Math.min(100, (monthSales / analyticsState.goalSales) * 100) : 0;
  const ordersPct = analyticsState.goalOrders > 0 ? Math.min(100, (monthOrders.length / analyticsState.goalOrders) * 100) : 0;

  container.innerHTML = `
    <div class="mb-3">
      <div class="flex justify-between text-sm"><span>Sales Progress</span><span>${analyticsState.goalSales > 0 ? `${salesPct.toFixed(1)}%` : 'Set target'}</span></div>
      <div class="w-full bg-gray-200 rounded h-2 mt-1"><div class="bg-green-500 h-2 rounded" style="width:${salesPct}%"></div></div>
      <p class="text-xs text-gray-600 mt-1">Current: ${formatCurrency(monthSales)} | Projected: ${formatCurrency(projectedSales)}</p>
    </div>
    <div class="mb-2">
      <div class="flex justify-between text-sm"><span>Orders Progress</span><span>${analyticsState.goalOrders > 0 ? `${ordersPct.toFixed(1)}%` : 'Set target'}</span></div>
      <div class="w-full bg-gray-200 rounded h-2 mt-1"><div class="bg-blue-500 h-2 rounded" style="width:${ordersPct}%"></div></div>
      <p class="text-xs text-gray-600 mt-1">Current: ${monthOrders.length} | Projected: ${projectedOrders.toFixed(0)}</p>
    </div>
  `;
};

const renderPromoImpactCard = () => {
  const summary = document.getElementById('promo-impact-summary');
  const canvas = document.getElementById('promo-impact-chart');
  if (!summary || !canvas || !latestAnalyticsSnapshot) return;
  if (promoImpactChart) promoImpactChart.destroy();

  const start = parseDate(analyticsState.promoStartDate);
  if (!start) {
    summary.innerHTML = '<p class="text-sm text-gray-600">Select promo start date then click Analyze.</p>';
    return;
  }
  start.setHours(0, 0, 0, 0);
  const now = new Date();
  const afterDays = Math.max(1, Math.ceil((now - start) / (24 * 60 * 60 * 1000)));
  const beforeEnd = new Date(start);
  beforeEnd.setDate(beforeEnd.getDate() - 1);
  beforeEnd.setHours(23, 59, 59, 999);
  const beforeStart = new Date(beforeEnd);
  beforeStart.setDate(beforeStart.getDate() - (afterDays - 1));
  beforeStart.setHours(0, 0, 0, 0);

  const calc = (from, to) => {
    const scoped = latestAnalyticsSnapshot.allOrders.filter(order => {
      const d = parseDate(order.created_at);
      return d && d >= from && d <= to;
    });
    const completed = scoped.filter(order => order.status === 'completed');
    return {
      orders: scoped.length,
      sales: completed.reduce((sum, order) => sum + getOrderAmount(order), 0)
    };
  };

  const before = calc(beforeStart, beforeEnd);
  const after = calc(start, now);

  promoImpactChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['Orders', 'Sales'],
      datasets: [
        { label: 'Before', data: [before.orders, before.sales], backgroundColor: '#93c5fd' },
        { label: 'After', data: [after.orders, after.sales], backgroundColor: '#34d399' }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });

  const orderDelta = before.orders === 0 ? 0 : ((after.orders - before.orders) / before.orders) * 100;
  const salesDelta = before.sales === 0 ? 0 : ((after.sales - before.sales) / before.sales) * 100;
  summary.innerHTML = `
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div class="p-3 rounded bg-gray-50"><p class="text-xs text-gray-600">Promo Discount</p><p class="font-bold">${analyticsState.promoDiscount}%</p></div>
      <div class="p-3 rounded bg-gray-50"><p class="text-xs text-gray-600">Orders Change</p><p class="font-bold ${orderDelta >= 0 ? 'text-success' : 'text-danger'}">${orderDelta.toFixed(1)}%</p></div>
      <div class="p-3 rounded bg-gray-50"><p class="text-xs text-gray-600">Sales Change</p><p class="font-bold ${salesDelta >= 0 ? 'text-success' : 'text-danger'}">${salesDelta.toFixed(1)}%</p></div>
    </div>
  `;
};

const csvLine = (values) => values.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const exportAnalyticsCsv = ({ includeAll = false } = {}) => {
  if (!latestAnalyticsSnapshot) return;
  const rows = buildProductPerformanceRows();
  const lines = [
    csvLine(['Metric', 'Value']),
    csvLine(['Range', latestAnalyticsSnapshot.range.label]),
    csvLine(['Total Products', latestAnalyticsSnapshot.products.length]),
    csvLine(['Total Orders', latestAnalyticsSnapshot.orders.length]),
    csvLine(['Total Sales', latestAnalyticsSnapshot.completedOrders.reduce((s, o) => s + getOrderAmount(o), 0).toFixed(2)]),
    '',
    csvLine(['Product', 'Views', 'Add-to-cart', 'Orders', 'Revenue', 'Cancel Rate %', 'Refund Rate %'])
  ];

  rows.forEach(row => {
    const cancelRate = row.orderCount ? (row.cancelledCount / row.orderCount) * 100 : 0;
    const refundRate = row.completedCount ? (row.refundedCount / row.completedCount) * 100 : 0;
    lines.push(csvLine([
      row.name,
      row.views,
      row.addToCart,
      row.orderCount,
      row.revenue.toFixed(2),
      cancelRate.toFixed(2),
      refundRate.toFixed(2)
    ]));
  });

  if (includeAll) {
    const { currentStart, currentEnd, previousStart, previousEnd } = getPeriodRanges();
    const current = calculatePeriodSummary(latestAnalyticsSnapshot.allOrders, currentStart, currentEnd);
    const previous = calculatePeriodSummary(latestAnalyticsSnapshot.allOrders, previousStart, previousEnd);
    lines.push('');
    lines.push(csvLine(['Comparison Metric', 'Current', 'Previous']));
    lines.push(csvLine(['Sales', current.sales.toFixed(2), previous.sales.toFixed(2)]));
    lines.push(csvLine(['Orders', current.orders, previous.orders]));
    lines.push(csvLine(['Pending', current.pending, previous.pending]));
    lines.push(csvLine(['Completion Rate %', current.completionRate.toFixed(2), previous.completionRate.toFixed(2)]));
  }

  downloadBlob(
    new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }),
    includeAll ? `seller-analytics-all-${toLocalIsoDate(new Date())}.csv` : `seller-analytics-${toLocalIsoDate(new Date())}.csv`
  );
  showSuccess('Analytics CSV exported.');
};

const exportAnalyticsChartPng = () => {
  const canvas = document.getElementById('sales-chart');
  if (!canvas || typeof canvas.toDataURL !== 'function') {
    showError('Sales chart is not available for export.');
    return;
  }
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = `sales-chart-${toLocalIsoDate(new Date())}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  showSuccess('Sales chart exported.');
};

const exportAnalyticsPdf = () => {
  if (!latestAnalyticsSnapshot) return;
  const report = window.open('', '_blank');
  if (!report) {
    showError('Popup blocked. Allow popups to export PDF.');
    return;
  }

  const rows = buildProductPerformanceRows().slice(0, 10).map(row => `
    <tr><td>${escapeHtml(row.name)}</td><td>${row.orderCount}</td><td>${formatCurrency(row.revenue)}</td><td>${row.stock}</td></tr>
  `).join('');

  report.document.write(`
    <html><head><title>Seller Analytics Report</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { border: 1px solid #e5e7eb; padding: 8px; font-size: 12px; text-align: left; }
      .muted { color: #6b7280; }
    </style></head><body>
      <h1>Seller Analytics Report</h1>
      <p class="muted">Generated: ${new Date().toLocaleString('en-PH')} | Range: ${escapeHtml(latestAnalyticsSnapshot.range.label)}</p>
      <p><strong>Total Products:</strong> ${latestAnalyticsSnapshot.products.length}</p>
      <p><strong>Total Orders:</strong> ${latestAnalyticsSnapshot.orders.length}</p>
      <p><strong>Total Sales:</strong> ${formatCurrency(latestAnalyticsSnapshot.completedOrders.reduce((s, o) => s + getOrderAmount(o), 0))}</p>
      <h3>Top Product Performance</h3>
      <table>
        <thead><tr><th>Product</th><th>Orders</th><th>Revenue</th><th>Stock</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4">No data</td></tr>'}</tbody>
      </table>
    </body></html>
  `);
  report.document.close();
  report.focus();
  report.print();
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
  if (funnelChart) {
    funnelChart.destroy();
    funnelChart = null;
  }
  if (bestTimeChart) {
    bestTimeChart.destroy();
    bestTimeChart = null;
  }
  if (promoImpactChart) {
    promoImpactChart.destroy();
    promoImpactChart = null;
  }
  latestAnalyticsSnapshot = null;
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
      <div class="bg-white border border-gray-200 rounded-xl p-5 sm:p-6">
        <h3 class="text-xl font-semibold mb-5">Seller Information</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label class="block text-sm text-gray-600 mb-1">Full Name</label>
            <p class="text-base sm:text-lg font-medium text-gray-900">${user.full_name || 'N/A'}</p>
          </div>
          <div>
            <label class="block text-sm text-gray-600 mb-1">Email</label>
            <p class="text-base sm:text-lg font-medium text-gray-900">${user.email || 'N/A'}</p>
          </div>
          <div>
            <label class="block text-sm text-gray-600 mb-1">Phone Number</label>
            <p class="text-base sm:text-lg font-medium text-gray-900">${user.phone_number || 'N/A'}</p>
          </div>
          <div>
            <label class="block text-sm text-gray-600 mb-1">Status</label>
            <p class="text-base sm:text-lg font-medium text-gray-900">${user.status || 'N/A'}</p>
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Error loading profile:', error);
    profileContent.innerHTML = '<p class="text-center text-gray-600">Error loading profile</p>';
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
  // First, update the conversations data in the background
  await updateConversationsData();
  
  // Then render if container exists
  const container = document.getElementById('conversations-list');
  if (!container) return;
  
  renderConversationsList(container);
  syncMessagingPanelsVisibility();
};

const mergeConversationMessages = (messageResponses = []) => {
  const allMessages = messageResponses
    .flatMap(response => response?.data?.messages || [])
    .filter(Boolean);

  const uniqueById = new Map();
  allMessages.forEach((message) => {
    if (message?.id) {
      uniqueById.set(message.id, message);
    }
  });

  return Array.from(uniqueById.values()).sort((a, b) =>
    new Date(a.created_at) - new Date(b.created_at)
  );
};

const scrollChatToBottom = (container) => {
  if (!container) return;

  const doScroll = () => {
    container.scrollTop = container.scrollHeight;
  };

  doScroll();
  requestAnimationFrame(doScroll);
  setTimeout(doScroll, 30);
  setTimeout(doScroll, 120);
};

// Fetch and cache conversations data (always executes, even if DOM doesn't exist)
const updateConversationsData = async () => {
  try {
    const response = await getConversations();
    currentConversations = response.data?.conversations || [];
  } catch (error) {
    console.error('Error updating conversations data:', error);
  }
};

const setConversationTypingPreview = (orderId, isTyping, displayName = 'Buyer') => {
  const key = orderId ? String(orderId) : '';
  if (!key) return;

  const existingTimer = typingPreviewTimers.get(key);
  if (existingTimer) {
    clearTimeout(existingTimer);
    typingPreviewTimers.delete(key);
  }

  if (isTyping) {
    const safeName = (displayName || 'Buyer').trim() || 'Buyer';
    typingPreviewByOrderId.set(key, safeName);
    const timeoutId = setTimeout(() => {
      typingPreviewByOrderId.delete(key);
      typingPreviewTimers.delete(key);
      const container = document.getElementById('conversations-list');
      if (container) {
        renderConversationsList(container);
      }
    }, 3500);
    typingPreviewTimers.set(key, timeoutId);
  } else {
    typingPreviewByOrderId.delete(key);
  }

  const container = document.getElementById('conversations-list');
  if (container) {
    renderConversationsList(container);
  }
};

const getConversationSortTimestamp = (conv) => {
  const candidates = [conv?.last_message_at, conv?.updated_at, conv?.created_at];
  for (const candidate of candidates) {
    const ts = Date.parse(candidate || '');
    if (Number.isFinite(ts)) return ts;
  }
  return 0;
};

const formatConversationTimestamp = (conv) => {
  const ts = getConversationSortTimestamp(conv);
  if (!ts) return '';
  return formatRelativeTime(new Date(ts).toISOString());
};

const updateConversationCountBadge = (visibleCount, totalCount = visibleCount) => {
  const countEl = document.getElementById('conversation-count');
  if (!countEl) return;
  if (visibleCount === totalCount) {
    countEl.textContent = `${totalCount} conversation${totalCount === 1 ? '' : 's'}`;
    return;
  }
  countEl.textContent = `${visibleCount} of ${totalCount} conversation${totalCount === 1 ? '' : 's'}`;
};

// Render conversations list using cached data
const renderConversationsList = (container) => {
  const searchTerm = (conversationFilters.search || '').trim().toLowerCase();
  let filteredConversations = currentConversations.filter((conv) => {
    if (conversationFilters.unreadOnly && !(conv.unread_count > 0)) return false;
    if (!searchTerm) return true;

    const haystack = [
      conv.other_party,
      conv.last_message,
      conv.order_number
    ].map(value => String(value || '').toLowerCase()).join(' ');

    return haystack.includes(searchTerm);
  });

  if ((conversationFilters.sort || 'newest') === 'unread') {
    filteredConversations.sort((a, b) => {
      const unreadA = Number(a.unread_count || 0);
      const unreadB = Number(b.unread_count || 0);
      if (unreadA !== unreadB) return unreadB - unreadA;
      return getConversationSortTimestamp(b) - getConversationSortTimestamp(a);
    });
  } else {
    filteredConversations.sort((a, b) => getConversationSortTimestamp(b) - getConversationSortTimestamp(a));
  }

  updateConversationCountBadge(filteredConversations.length, currentConversations.length);

  if (filteredConversations.length === 0) {
    container.innerHTML = `
      <div class="text-center py-4 text-gray-500">
        ${currentConversations.length === 0 ? 'No conversations yet' : 'No conversations matched your filter'}
      </div>
    `;
    return;
  }

  container.innerHTML = filteredConversations.map(conv => {
    const userId = conv.other_party_id;
    const normalizedOrderId = String(conv.order_id || '');
    const orderIds = (conv.order_ids || []).map(String);
    const activeThreadOrderIds = currentConversationOrderIds.map(String);
    const isActiveConversation = orderIds.some(id => activeThreadOrderIds.includes(id))
      || String(currentConversation) === normalizedOrderId;
    const typingDisplayName = typingPreviewByOrderId.get(String(conv.order_id));
    const previewText = typingDisplayName
      ? `${typingDisplayName} is typing...`
      : (conv.last_message || 'No messages yet');
    const previewClass = typingDisplayName
      ? 'text-sm text-primary truncate italic'
      : 'text-sm text-gray-600 truncate';
    const orderNumber = conv.order_number || `ORD-${normalizedOrderId.padStart(6, '0')}`;
    const relativeTime = formatConversationTimestamp(conv);
    return `
      <div class="conversation-item buyer-conversation-item p-3 hover:bg-gray-100 cursor-pointer rounded-lg ${isActiveConversation ? 'is-active' : ''}"
           data-order-id="${normalizedOrderId}"
           data-user-id="${userId}"
           data-order-count="${conv.order_count || 1}"
           data-active-order-count="${conv.active_order_count || 0}"
           data-order-ids="${(conv.order_ids || []).join(',')}"
           data-active-order-ids="${(conv.active_order_ids || []).join(',')}"
           data-latest-order-number="${conv.order_number || ''}"
           onclick="window.openConversation('${normalizedOrderId}')">
        <div class="buyer-conversation-row">
          <div class="buyer-conversation-main">
            <div class="buyer-conversation-topline">
              <p class="font-semibold buyer-conversation-name">${escapeHtml(conv.other_party || 'Buyer')}</p>
              <span class="status-badge-container" data-user-id="${userId}"></span>
              ${relativeTime ? `<span class="buyer-conversation-time">${escapeHtml(relativeTime)}</span>` : ''}
            </div>
            <div class="buyer-conversation-meta-row">
              <span class="buyer-conversation-order-chip">${escapeHtml(orderNumber)}</span>
              ${Number(conv.order_count || 0) > 1 ? `<span class="buyer-conversation-thread-count">${Number(conv.order_count)} orders</span>` : ''}
            </div>
            <p class="${previewClass}" data-conversation-preview="${conv.order_id}">${previewText}</p>
          </div>
          ${conv.unread_count > 0 ? `
            <span class="badge badge-danger buyer-conversation-unread" data-conversation-badge="${conv.order_id}">${conv.unread_count}</span>
          ` : `
            <span class="badge badge-danger buyer-conversation-unread" data-conversation-badge="${conv.order_id}" style="display: none;"></span>
          `}
        </div>
      </div>
    `;
  }).join('');
  
  // Add status badges to conversation items
  new Promise(resolve => setTimeout(resolve, 0)).then(() => {
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
  });
};

window.openLatestUnreadConversation = () => {
  if (!Array.isArray(currentConversations) || currentConversations.length === 0) return;
  const sorted = [...currentConversations].sort((a, b) => getConversationSortTimestamp(b) - getConversationSortTimestamp(a));
  const target = sorted.find((conv) => Number(conv.unread_count || 0) > 0) || sorted[0];
  if (target?.order_id) {
    window.openConversation(String(target.order_id));
  }
};

const applyActiveConversationHighlight = () => {
  const selectedOrderId = currentConversation ? String(currentConversation) : null;
  const selectedThreadOrderIds = currentConversationOrderIds.map(String);

  document.querySelectorAll('#conversations-list .conversation-item').forEach((item) => {
    const itemOrderId = String(item.dataset.orderId || '');
    const itemOrderIds = String(item.dataset.orderIds || '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean);

    const isActive = (selectedOrderId && itemOrderId === selectedOrderId)
      || itemOrderIds.some(id => selectedThreadOrderIds.includes(id));

    item.classList.toggle('is-active', Boolean(isActive));
  });
};

// Update a single conversation's badge and message preview
const updateConversationBadge = async (orderId) => {
  try {
    const normalizedOrderId = String(orderId);
    // First update the cached data
    await updateConversationsData();
    
    // Then find the conversation in cache
    const conversation = currentConversations.find(c => String(c.order_id) === normalizedOrderId);
    
    if (conversation) {
      const badge = document.querySelector(`[data-conversation-badge="${normalizedOrderId}"]`);
      if (badge) {
        if (conversation.unread_count > 0) {
          badge.textContent = conversation.unread_count;
          badge.style.display = 'inline-block';
        } else {
          badge.style.display = 'none';
        }
      }
      
      // Update last message preview
      const item = document.querySelector(`[data-order-id="${normalizedOrderId}"]`);
      if (item) {
        const messagePreview = item.querySelector('[data-conversation-preview]');
        if (messagePreview) {
          const typingDisplayName = typingPreviewByOrderId.get(normalizedOrderId);
          const previewText = typingDisplayName
            ? `${typingDisplayName} is typing...`
            : (conversation.last_message || 'No messages yet');
          messagePreview.textContent = previewText;
          messagePreview.classList.toggle('text-primary', Boolean(typingDisplayName));
          messagePreview.classList.toggle('italic', Boolean(typingDisplayName));
          messagePreview.classList.toggle('text-gray-600', !typingDisplayName);
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
    const messagePreview = item.querySelector('[data-conversation-preview]');
    if (messagePreview) {
      if (typingPreviewByOrderId.has(String(orderId))) return;
      messagePreview.textContent = messageText;

    }
  }
};

window.openConversation = async (orderId) => {
  // Get the user ID from the conversation element's data attribute for consistency
  const conversationItem = document.querySelector(`[data-order-id="${orderId}"]`);
  const userId = conversationItem?.dataset.userId;
  const orderCount = Number(conversationItem?.dataset.orderCount || 1);
  const activeOrderCount = Number(conversationItem?.dataset.activeOrderCount || 0);
  const orderIds = (conversationItem?.dataset.orderIds || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
  const activeOrderIds = (conversationItem?.dataset.activeOrderIds || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
  const latestOrderNumber = conversationItem?.dataset.latestOrderNumber || orderId;
  
  // Store userId globally to ensure consistency in openOrderChat
  window.conversationUserId = userId;
  window.currentConversationMeta = {
    sourceOrderId: orderId,
    orderCount,
    activeOrderCount,
    orderIds,
    activeOrderIds,
    latestOrderNumber
  };
  currentConversation = orderId;
  applyActiveConversationHighlight();
  setMessagingMobileView('chat');
  window.openOrderChat(orderId, userId);
};

window.openOrderChat = async (orderId, userId) => {
  stopTypingSignal();
  hideTypingIndicator();
  currentConversation = orderId;
  applyActiveConversationHighlight();
  setMessagingMobileView('chat');
  
  // Use userId from parameter, global storage, or will get from API response
  if (!userId && window.conversationUserId) {
    userId = window.conversationUserId;
  }
  
  // Ensure socket is initialized and connected
  try {
    const { initSocket } = await import('../services/socket.service.js');
    const socket = initSocket();
    
    if (!socket) {
      console.warn('Realtime connection not ready. Chat will continue without live updates until connection is established.');
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
    const conversationMeta = window.currentConversationMeta || null;
    const activeConversation = currentConversations.find(conv => conv.order_id === orderId);
    const cachedOrderIds = Array.isArray(activeConversation?.order_ids) ? activeConversation.order_ids : [];
    const threadOrderIds = (conversationMeta?.sourceOrderId === orderId && conversationMeta?.orderIds?.length)
      ? conversationMeta.orderIds
      : (cachedOrderIds.length ? cachedOrderIds : [orderId]);
    const uniqueThreadOrderIds = [...new Set(threadOrderIds.filter(Boolean))];
    const activeThreadOrderIds = (conversationMeta?.sourceOrderId === orderId && conversationMeta?.activeOrderIds?.length)
      ? conversationMeta.activeOrderIds
      : [];

    // Mark messages as read immediately when opening conversation
    try {
      await Promise.allSettled(uniqueThreadOrderIds.map(id => markMessagesAsRead(id)));
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
    
    currentConversationOrderIds = uniqueThreadOrderIds;
    currentConversationSendOrderId = activeThreadOrderIds[0] || orderId;
    window.currentConversationUnreadCount = Number(activeConversation?.unread_count || 0);
    applyActiveConversationHighlight();

    // Join all order rooms in grouped conversation so real-time updates
    // cover every order in this thread.
    try {
      const { default: socketService } = await import('../services/socket.service.js');
      uniqueThreadOrderIds.forEach(id => socketService.joinConversation(id));
    } catch (error) {
      console.warn('Failed to join grouped conversation rooms:', error);
    }

    // Get message data from all orders in this grouped conversation
    const loadThreadMessages = async (forceRefresh = false) => {
      const params = forceRefresh ? { limit: 100, before: Date.now() } : {};
      const responses = await Promise.allSettled(
        uniqueThreadOrderIds.map(id => getOrderMessages(id, params))
      );
      return responses
        .filter(result => result.status === 'fulfilled')
        .map(result => result.value);
    };

    let successfulResponses = await loadThreadMessages(false);
    let messages = mergeConversationMessages(successfulResponses);

    // Fallback for stale cache/partial failures: force-refresh each order fetch once.
    if (messages.length === 0 && uniqueThreadOrderIds.length > 1) {
      successfulResponses = await loadThreadMessages(true);
      messages = mergeConversationMessages(successfulResponses);
    }

    const response = successfulResponses[0] || await getOrderMessages(orderId, { limit: 100, before: Date.now() });
    const userRole = response.data?.user_role || 'seller';
    const buyerName = response.data?.buyer_name || 'Buyer';
    const activeOrderCount = activeConversation?.active_order_count ?? activeThreadOrderIds.length;
    const isCancelled = activeOrderCount === 0;
    const activeOrderNumber = activeConversation?.order_number || response?.data?.order_number || `ORD-${String(orderId).padStart(6, '0')}`;
    const headerStatusLabel = activeOrderCount === 0 ? 'Order Closed' : 'Active';
    
    // If still no buyerId, get from response
    if (!buyerId && response.data?.buyer_id) {
      buyerId = response.data.buyer_id;
    }
    
    chatWindow.innerHTML = `
      <div class="buyer-chat-shell flex flex-col">
        <div class="border-b p-4 bg-gray-50" id="chat-header">
          <div class="flex justify-between items-center gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <button type="button" class="btn btn-outline btn-sm buyer-chat-back" id="chat-back-btn" aria-label="Back to conversations">
                <i class="bi bi-chevron-left"></i>
              </button>
              <div class="buyer-chat-title-wrap">
                <h3 class="font-bold text-lg" id="chat-user-name">${escapeHtml(buyerName)}</h3>
                <p class="buyer-chat-submeta">
                  <span class="buyer-chat-order-chip">${escapeHtml(activeOrderNumber)}</span>
                  <span class="buyer-chat-thread-count">${activeOrderCount > 1 ? `${activeOrderCount} active orders` : '1 active order'}</span>
                  <span class="buyer-chat-thread-status">${headerStatusLabel}</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        <div id="chat-messages" class="flex-1 overflow-y-auto p-4 space-y-3">
          ${messages.map(msg => createMessageBubble(msg, userRole)).join('')}
        </div>

        <div class="border-t p-4 buyer-chat-composer">
          ${isCancelled ? `
            <div class="p-3 bg-red-50 border border-red-200 rounded-lg text-center text-red-700 text-sm">
              <i class="bi bi-exclamation-circle"></i> This order has been cancelled. No new messages can be sent.
            </div>
          ` : `
            <div class="space-y-2">
              <div id="message-attachment-preview" class="hidden"></div>
              <form id="chat-form" class="flex gap-2 buyer-chat-form" autocomplete="off">
                <input type="file" id="message-attachment" class="hidden" accept="image/jpeg,image/jpg,image/png">
                <button type="button" class="btn btn-outline px-3" id="btn-attach-message" title="Attach image">
                  <i class="bi bi-paperclip"></i>
                </button>
                <input type="text"
                       id="message-input"
                       class="form-control flex-1 buyer-chat-input"
                       autocomplete="off"
                       autocorrect="off"
                       autocapitalize="off"
                       spellcheck="false"
                       maxlength="500"
                       placeholder="Message buyer about ${escapeHtml(activeOrderNumber)}...">
                <button type="submit" class="btn btn-primary" id="btn-send-message">
                  <i class="bi bi-send"></i> <span class="buyer-send-label">Send</span>
                </button>
              </form>
              <div class="buyer-chat-composer-meta">
                <span id="message-send-hint" class="buyer-chat-send-hint">Messages are sent securely.</span>
                <span id="message-char-counter" class="buyer-chat-char-counter">0/500</span>
              </div>
            </div>
          `}
        </div>
      </div>
    `;
    
    // Auto-scroll to bottom
    const messagesContainer = document.getElementById('chat-messages');
    setupLazyMessageRendering(messagesContainer, messages, userRole);
    scrollChatToBottom(messagesContainer);
    initAttachmentPreviewDelegation();
    
    // Handle send message
    const chatForm = document.getElementById('chat-form');
    if (chatForm) {
      chatForm.addEventListener('submit', handleSendMessage);
    }
    const chatBackBtn = document.getElementById('chat-back-btn');
    if (chatBackBtn) {
      chatBackBtn.addEventListener('click', () => {
        setMessagingMobileView('list');
      });
    }
    updateMessageComposerHint('Messages are sent securely.', 'neutral');
    setMessageSendingState(false);
    setupMessageAttachmentUI();
    setupTypingInputHandlers();
    hideTypingIndicator();
    syncMessagingPanelsVisibility();
    
  } catch (error) {
    console.error('Error loading messages:', error);
    showError('Failed to load messages');
  }
};

const createMessageBubble = (message, userRole, options = {}) => {
  const isSender = message.sender?.role === userRole;
  const alignClass = isSender ? 'justify-end' : 'justify-start';
  const bgClass = isSender ? 'bg-primary text-white' : 'bg-gray-200';
  const textMarkup = message.message_text
    ? `<p class="text-sm">${escapeHtml(message.message_text)}</p>`
    : '';
  const attachmentMarkup = renderMessageAttachment(message);
  const deliveryState = options.deliveryState || (isSender ? 'delivered' : '');
  const deliveryMarkup = isSender
    ? `<span class="buyer-chat-delivery ${deliveryState === 'failed' ? 'is-failed' : ''}">
        ${deliveryState === 'failed' ? 'Failed • tap retry' : deliveryState === 'sending' ? 'Sending…' : 'Delivered'}
      </span>`
    : '';
  
  return `
    <div class="flex ${alignClass} buyer-chat-row">
      <div class="${bgClass} rounded-lg px-4 py-2 max-w-xs">
        ${textMarkup}
        ${attachmentMarkup}
        <div class="buyer-chat-bubble-meta">
          <p class="text-xs opacity-75 mt-1">${formatRelativeTime(message.created_at)}</p>
          ${deliveryMarkup}
        </div>
      </div>
    </div>
  `;
};

const CHAT_MESSAGE_BATCH_SIZE = 40;

const setupLazyMessageRendering = (messagesContainer, messages, userRole) => {
  if (!messagesContainer) return;
  const unreadCount = Math.max(0, Number(window.currentConversationUnreadCount || 0));
  const unreadDividerIndex = unreadCount > 0 && unreadCount < messages.length
    ? messages.length - unreadCount
    : -1;

  let renderedStart = Math.max(0, messages.length - CHAT_MESSAGE_BATCH_SIZE);
  const renderRange = (start, end) => messages
    .slice(start, end)
    .map((msg, offset) => {
      const absoluteIndex = start + offset;
      const withDivider = absoluteIndex === unreadDividerIndex
        ? '<div class="buyer-chat-unread-divider">New messages</div>'
        : '';
      return `${withDivider}${createMessageBubble(msg, userRole)}`;
    })
    .join('');

  messagesContainer.innerHTML = renderRange(renderedStart, messages.length);

  if (messagesContainer.__lazyScrollHandler) {
    messagesContainer.removeEventListener('scroll', messagesContainer.__lazyScrollHandler);
  }

  const onScrollLoadOlder = () => {
    if (renderedStart === 0 || messagesContainer.scrollTop > 60) return;

    const previousHeight = messagesContainer.scrollHeight;
    const previousTop = messagesContainer.scrollTop;
    const nextStart = Math.max(0, renderedStart - CHAT_MESSAGE_BATCH_SIZE);
    const olderMarkup = renderRange(nextStart, renderedStart);
    messagesContainer.insertAdjacentHTML('afterbegin', olderMarkup);
    renderedStart = nextStart;

    const newHeight = messagesContainer.scrollHeight;
    messagesContainer.scrollTop = newHeight - previousHeight + previousTop;
  };

  messagesContainer.__lazyScrollHandler = onScrollLoadOlder;
  messagesContainer.addEventListener('scroll', onScrollLoadOlder, { passive: true });
};

const formatFileSize = (bytes) => {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return 'Size unknown';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const getAttachmentMeta = (message, attachmentUrl) => {
  const attachmentPath = message?.attachment_path || '';
  const fallbackName = attachmentPath.split('/').pop() || 'attachment';
  const urlName = (() => {
    try {
      return new URL(attachmentUrl).pathname.split('/').pop() || fallbackName;
    } catch (error) {
      return fallbackName;
    }
  })();
  const ext = (urlName.split('.').pop() || '').toUpperCase();
  const isImage = message?.message_type === 'image' || /\.(jpe?g|png|gif|webp)$/i.test(attachmentUrl);
  const typeLabel = isImage ? 'Image' : (ext || 'File');
  const sizeText = formatFileSize(message?.attachment_size || message?.file_size || message?.attachment_bytes);
  return { isImage, typeLabel, sizeText, fileName: urlName };
};

const initAttachmentPreviewDelegation = () => {
  if (hasAttachmentPreviewDelegation) return;
  const chatWindow = document.getElementById('chat-window');
  if (!chatWindow) return;

  chatWindow.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-attachment-preview="true"]');
    if (!trigger) return;
    const attachmentUrl = trigger.getAttribute('data-attachment-url');
    const attachmentName = trigger.getAttribute('data-attachment-name') || 'Attachment';
    if (!attachmentUrl) return;
    openAttachmentPreviewModal(attachmentUrl, attachmentName);
  });

  hasAttachmentPreviewDelegation = true;
};

const openAttachmentPreviewModal = (attachmentUrl, attachmentName) => {
  const content = `
    <div class="space-y-3">
      <img src="${attachmentUrl}" alt="${escapeHtml(attachmentName)}" class="w-full max-h-[70vh] object-contain rounded-lg border" loading="eager" decoding="async">
      <div class="flex justify-end">
        <a href="${attachmentUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm">
          <i class="bi bi-box-arrow-up-right"></i> Open Original
        </a>
      </div>
    </div>
  `;

  createModal({
    title: attachmentName,
    content,
    size: 'lg'
  });
};

const setupMessageAttachmentUI = () => {
  const fileInput = document.getElementById('message-attachment');
  const attachBtn = document.getElementById('btn-attach-message');
  if (!fileInput || !attachBtn) return;

  selectedMessageAttachment = null;
  clearMessageAttachmentUI();

  attachBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) {
      selectedMessageAttachment = null;
      clearMessageAttachmentUI();
      return;
    }

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    const maxSize = 5 * 1024 * 1024;

    if (!validTypes.includes(file.type)) {
      showError('Only JPG and PNG images are allowed.');
      fileInput.value = '';
      selectedMessageAttachment = null;
      clearMessageAttachmentUI();
      return;
    }

    if (file.size > maxSize) {
      showError('Image is too large. Max file size is 5MB.');
      fileInput.value = '';
      selectedMessageAttachment = null;
      clearMessageAttachmentUI();
      return;
    }

    selectedMessageAttachment = file;
    const preview = document.getElementById('message-attachment-preview');
    if (preview) {
      preview.classList.remove('hidden');
      preview.innerHTML = `
        <div class="flex items-center justify-between bg-blue-50 border border-blue-200 rounded px-3 py-2 text-sm">
          <span class="truncate pr-3"><i class="bi bi-image"></i> ${escapeHtml(file.name)}</span>
          <button type="button" class="text-danger" id="btn-remove-attachment" title="Remove image">
            <i class="bi bi-x-circle"></i>
          </button>
        </div>
      `;
      const removeBtn = document.getElementById('btn-remove-attachment');
      if (removeBtn) {
        removeBtn.addEventListener('click', () => {
          fileInput.value = '';
          selectedMessageAttachment = null;
          clearMessageAttachmentUI();
        });
      }
    }
  });
};

const clearMessageAttachmentUI = () => {
  const preview = document.getElementById('message-attachment-preview');
  if (preview) {
    preview.classList.add('hidden');
    preview.innerHTML = '';
  }
};

const getTypingOrderId = () => currentConversationSendOrderId || currentConversationOrderIds[0] || currentConversation;

const stopTypingSignal = () => {
  if (typingStopTimer) {
    clearTimeout(typingStopTimer);
    typingStopTimer = null;
  }

  if (!isTypingActive) return;

  const orderId = getTypingOrderId();
  if (socketEmit && orderId) {
    socketEmit('typing:status', { orderId, isTyping: false });
  }

  isTypingActive = false;
};

const scheduleTypingStop = () => {
  if (typingStopTimer) {
    clearTimeout(typingStopTimer);
  }
  typingStopTimer = setTimeout(() => {
    stopTypingSignal();
  }, 1200);
};

const handleTypingInput = (event) => {
  const inputValue = event?.target?.value?.trim() || '';
  const orderId = getTypingOrderId();
  if (!socketEmit || !orderId) return;

  if (!inputValue) {
    stopTypingSignal();
    return;
  }

  if (!isTypingActive) {
    socketEmit('typing:status', { orderId, isTyping: true });
    isTypingActive = true;
  }

  scheduleTypingStop();
};

const setupTypingInputHandlers = () => {
  const input = document.getElementById('message-input');
  if (!input || input.dataset.typingBound === '1') return;

  input.dataset.typingBound = '1';
  const charCounter = document.getElementById('message-char-counter');
  if (charCounter) {
    charCounter.textContent = `${(input.value || '').length}/500`;
  }
  input.addEventListener('input', handleTypingInput);
  input.addEventListener('input', () => {
    if (charCounter) {
      charCounter.textContent = `${(input.value || '').length}/500`;
    }
  });
  input.addEventListener('blur', () => {
    stopTypingSignal();
  });
};

const updateMessageComposerHint = (text, tone = 'neutral') => {
  const hint = document.getElementById('message-send-hint');
  if (!hint) return;
  hint.textContent = text;
  hint.classList.remove('is-muted', 'is-error');
  if (tone === 'muted') hint.classList.add('is-muted');
  if (tone === 'error') hint.classList.add('is-error');
};

const setMessageSendingState = (isSending) => {
  const sendBtn = document.getElementById('btn-send-message');
  if (!sendBtn) return;
  sendBtn.disabled = Boolean(isSending);
  sendBtn.innerHTML = isSending
    ? '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> <span class="buyer-send-label">Sending...</span>'
    : '<i class="bi bi-send"></i> <span class="buyer-send-label">Send</span>';
};

const hideTypingIndicator = () => {
  const indicator = document.getElementById('typing-indicator');
  if (!indicator) return;
  indicator.classList.add('hidden');
};

const showTypingIndicator = (displayName = 'Buyer') => {
  const chatMessages = document.getElementById('chat-messages');
  if (!chatMessages) return;

  let indicator = document.getElementById('typing-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'typing-indicator';
    indicator.className = 'flex justify-start hidden';
    indicator.innerHTML = `
      <div class="bg-gray-100 text-gray-600 rounded-lg px-3 py-2 text-xs italic">
        <span id="typing-indicator-text"></span>
      </div>
    `;
  }

  // Always keep typing indicator at the bottom of the chat list.
  chatMessages.appendChild(indicator);

  const text = indicator.querySelector('#typing-indicator-text');
  if (text) {
    text.textContent = `${displayName} is typing...`;
  }

  indicator.classList.remove('hidden');
  scrollChatToBottom(chatMessages);

  if (typingIndicatorHideTimer) {
    clearTimeout(typingIndicatorHideTimer);
  }
  typingIndicatorHideTimer = setTimeout(() => {
    hideTypingIndicator();
  }, 2500);
};

const renderMessageAttachment = (message) => {
  if (!message?.attachment_path) return '';

  const attachmentUrl = getMessageAttachmentUrl(message.attachment_path);
  if (!attachmentUrl) return '';

  const { isImage, typeLabel, sizeText, fileName } = getAttachmentMeta(message, attachmentUrl);
  if (isImage) {
    return `
      <div class="mt-2">
        <button type="button" class="block w-full text-left border-0 bg-transparent p-0" data-attachment-preview="true" data-attachment-url="${attachmentUrl}" data-attachment-name="${escapeHtml(fileName)}">
          <img src="${attachmentUrl}" alt="${escapeHtml(fileName)}" class="w-48 max-w-full rounded-lg border cursor-zoom-in" loading="lazy" decoding="async">
        </button>
        <div class="mt-1 flex items-center gap-2 text-xs opacity-80">
          <span class="px-2 py-0.5 rounded bg-black/20">${typeLabel}</span>
          <span>${sizeText}</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="mt-2">
      <a href="${attachmentUrl}" target="_blank" rel="noopener noreferrer" class="underline break-all">
        <i class="bi bi-paperclip"></i> ${escapeHtml(fileName)}
      </a>
      <div class="mt-1 flex items-center gap-2 text-xs opacity-80">
        <span class="px-2 py-0.5 rounded bg-black/20">${typeLabel}</span>
        <span>${sizeText}</span>
      </div>
    </div>
  `;
};

const handleSendMessage = async (e) => {
  e.preventDefault();
  
  const input = document.getElementById('message-input');
  const fileInput = document.getElementById('message-attachment');
  const messageText = input.value.trim();
  const attachment = selectedMessageAttachment || fileInput?.files?.[0] || null;
  
  if (!messageText && !attachment) return;
  
  // Clear input immediately
  input.value = '';
  if (fileInput) {
    fileInput.value = '';
  }
  stopTypingSignal();
  hideTypingIndicator();
  selectedMessageAttachment = null;
  clearMessageAttachmentUI();
  setMessageSendingState(true);
  updateMessageComposerHint('Sending message...', 'muted');
  
  try {
    const targetOrderId = currentConversationSendOrderId || currentConversation;
    if (!targetOrderId) {
      showError('No active order available for this conversation');
      input.value = messageText;
      return;
    }

    if (attachment) {
      await sendMessageWithAttachment({
        order_id: targetOrderId,
        message_text: messageText,
        attachment
      });
    } else {
      await sendMessage({
        order_id: targetOrderId,
        message_text: messageText
      });
    }
    
    const currentUser = getCurrentUserSync();
    const optimisticMessage = {
      order_id: targetOrderId,
      sender_id: currentUser?.id,
      sender: {
        id: currentUser?.id,
        role: 'seller'
      },
      message_text: messageText || (attachment ? 'Sent an attachment.' : ''),
      created_at: new Date().toISOString()
    };
    addMessageBubbleToChat(optimisticMessage);

    // Reload conversations list to show the new message
    await loadConversations();
    
    // Focus input for next message
    setTimeout(() => {
      const newInput = document.getElementById('message-input');
      if (newInput) {
        newInput.focus();
      }
    }, 50);
    updateMessageComposerHint('Messages are sent securely.', 'neutral');
    
  } catch (error) {
    console.error('Error sending message:', error);
    showError(error.message || 'Failed to send message');
    updateMessageComposerHint('Failed to send. You can retry.', 'error');
    // Restore message if send failed
    input.value = messageText;
    if (attachment && fileInput) {
      selectedMessageAttachment = attachment;
      const dt = new DataTransfer();
      dt.items.add(attachment);
      fileInput.files = dt.files;
      const preview = document.getElementById('message-attachment-preview');
      if (preview) {
        preview.classList.remove('hidden');
        preview.innerHTML = `
          <div class="flex items-center justify-between bg-blue-50 border border-blue-200 rounded px-3 py-2 text-sm">
            <span class="truncate pr-3"><i class="bi bi-image"></i> ${escapeHtml(attachment.name)}</span>
            <button type="button" class="text-danger" id="btn-remove-attachment" title="Remove image">
              <i class="bi bi-x-circle"></i>
            </button>
          </div>
        `;
        const removeBtn = document.getElementById('btn-remove-attachment');
        if (removeBtn) {
          removeBtn.addEventListener('click', () => {
            fileInput.value = '';
            selectedMessageAttachment = null;
            clearMessageAttachmentUI();
          });
        }
      }
    }
  } finally {
    setMessageSendingState(false);
  }
};

// ============ Real-time Features ============

const initializeRealTime = async () => {
  try {
    const { initSocket, on, onInitialOnlineUsers, onUserOnline, onUserOffline, onNotification, onTypingStatus, emit } = await import('../services/socket.service.js');
    
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
      if (typeof loadOrders === 'function') {
        loadOrders();
      }
    });
    
    if (socket) {
      socketEmit = emit;
      // Prevent duplicate message toasts when the same event arrives from both
      // message channel and notification channel.
      let lastMessageToastOrderKey = null;
      let lastMessageToastAt = 0;
      const showMessageToastOnce = (orderKey) => {
        const now = Date.now();
        const normalizedKey = String(orderKey || 'global');
        const isDuplicate = lastMessageToastOrderKey === normalizedKey && (now - lastMessageToastAt) < 1500;

        if (isDuplicate) return;

        lastMessageToastOrderKey = normalizedKey;
        lastMessageToastAt = now;
        showToast('New message received', 'info', 5000, false);
        playMessageSound();
      };

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

      onTypingStatus((data) => {
        if (!data || String(data.userId) === String(getUserId())) return;

        const referenceOrderId = data.orderId ? String(data.orderId) : null;
        const remoteName = (data.userName || data.senderName || document.getElementById('chat-user-name')?.textContent || 'Buyer').trim() || 'Buyer';
        if (referenceOrderId) {
          setConversationTypingPreview(referenceOrderId, Boolean(data.isTyping), remoteName);
        }
        const isCurrentThreadOrder = referenceOrderId
          ? currentConversationOrderIds.map(String).includes(referenceOrderId)
          : false;
        const isViewingThisConversation = currentPage === 'messaging' && isCurrentThreadOrder;

        if (!isViewingThisConversation) {
          hideTypingIndicator();
          return;
        }

        if (data.isTyping) {
          showTypingIndicator(remoteName);
        } else {
          hideTypingIndicator();
        }
      });

      // Listen for new orders
      on('order:new', (data) => {
        showToast(`New order received: #${data.order_number}`, 'success');
        loadOrders();
        loadOrderStats();
        loadDashboardStats();
      });
      
      // Listen for cancelled orders
      on('order:cancelled', (data) => {
        loadOrders();
        loadOrderStats();
      });
      
      // Listen for new messages from socket
      on('message_received', (data) => {
        // ALWAYS update conversations data, even if UI isn't visible
        (async () => {
          if (data?.order_id) {
            setConversationTypingPreview(data.order_id, false);
          }
          await updateConversationsData();
          
          // Check if user is currently viewing this conversation
          const isCurrentThreadOrder = currentConversationOrderIds
            .map(String)
            .includes(String(data.order_id));
          const isViewingThisConversation = currentPage === 'messaging' && isCurrentThreadOrder;
          
          // ALWAYS update the conversations list preview on the left side (real-time)
          const container = document.getElementById('conversations-list');
          if (container) {
            renderConversationsList(container);
          }
          
          const currentUserId = String(getCurrentUserSync()?.id || '');
          const senderId = String(data?.sender_id || data?.sender?.id || '');
          const isOwnMessage = Boolean(currentUserId && senderId && currentUserId === senderId);

          // Only show notification and update badge if NOT currently viewing this conversation
          if (!isViewingThisConversation && !isOwnMessage) {
            // Update message badge in navbar
            updateMessageBadge();
            // Show toast/sound only once for duplicate realtime sources
            showMessageToastOnce(data.order_id);
          } else if (!isOwnMessage) {
            // User is viewing the conversation, add the message to chat in real-time
            hideTypingIndicator();
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
        })();
      });
      
      // Listen for message read receipts
      on('message_read_receipt', (data) => {
        if (currentConversationOrderIds.map(String).includes(String(data.orderId))) {
          // Update badge for current conversation
          updateConversationBadge(currentConversation);
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
          updateMessageBadge();
          (async () => {
            await updateConversationsData();
            const container = document.getElementById('conversations-list');
            if (container) {
              renderConversationsList(container);
            }
          })();
          const referenceOrderId = data.reference_id || data.referenceId || data.order_id;
          const isCurrentThreadOrder = referenceOrderId
            ? currentConversationOrderIds.map(String).includes(String(referenceOrderId))
            : false;
          const isViewingThisConversation = currentPage === 'messaging' && isCurrentThreadOrder;

          if (!isViewingThisConversation) {
            showMessageToastOnce(referenceOrderId);
          }
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
  const normalized = {
    ...message,
    sender: {
      ...(message?.sender || {}),
      role: message?.sender?.role || (message?.sender_id === currentUserId ? 'seller' : 'buyer')
    }
  };
  const bubble = createMessageBubble(normalized, 'seller');
  
  const typingIndicator = chatMessages.querySelector('#typing-indicator');
  if (typingIndicator) {
    // Keep typing indicator at the very bottom while new messages arrive.
    typingIndicator.insertAdjacentHTML('beforebegin', bubble);
  } else {
    chatMessages.insertAdjacentHTML('beforeend', bubble);
  }

  
  // Auto-scroll to bottom
  scrollChatToBottom(chatMessages);
};

// Helper to safely escape HTML
const escapeHtml = (text) => {
  const safeText = typeof text === 'string' ? text : String(text || '');
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return safeText.replace(/[&<>"']/g, m => map[m]);
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
      orderFilters.page = 1;
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

  const productsFiltersToggle = document.getElementById('products-filters-toggle');
  if (productsFiltersToggle) {
    const productsFiltersToggleHandler = () => {
      productsFiltersCollapsed = !productsFiltersCollapsed;
      applyProductsFiltersCollapsedState();
    };
    productsFiltersToggle.addEventListener('click', productsFiltersToggleHandler);
    eventListeners.push({ element: productsFiltersToggle, event: 'click', handler: productsFiltersToggleHandler });
  }

  const ordersStatsToggle = document.getElementById('orders-stats-toggle');
  if (ordersStatsToggle) {
    const orderStatsToggleHandler = () => {
      ordersStatsCollapsed = !ordersStatsCollapsed;
      applyOrdersStatsCollapsedState();
    };
    ordersStatsToggle.addEventListener('click', orderStatsToggleHandler);
    eventListeners.push({ element: ordersStatsToggle, event: 'click', handler: orderStatsToggleHandler });
  }

  const issuesStatsToggle = document.getElementById('issues-stats-toggle');
  if (issuesStatsToggle) {
    const issuesStatsToggleHandler = () => {
      issuesStatsCollapsed = !issuesStatsCollapsed;
      applyIssuesStatsCollapsedState();
    };
    issuesStatsToggle.addEventListener('click', issuesStatsToggleHandler);
    eventListeners.push({ element: issuesStatsToggle, event: 'click', handler: issuesStatsToggleHandler });
  }

  const issuesSearch = document.getElementById('issues-search');
  if (issuesSearch) {
    const issuesSearchHandler = debounce((e) => {
      issueFilters.search = (e.target.value || '').trim();
      if (currentPage === 'my-issues') loadMyIssues();
    }, 240);
    issuesSearch.addEventListener('input', issuesSearchHandler);
    eventListeners.push({ element: issuesSearch, event: 'input', handler: issuesSearchHandler });
  }

  const issuesSort = document.getElementById('issues-sort');
  if (issuesSort) {
    const issuesSortHandler = (e) => {
      issueFilters.sort = e.target.value || 'newest';
      if (currentPage === 'my-issues') loadMyIssues();
    };
    issuesSort.addEventListener('change', issuesSortHandler);
    eventListeners.push({ element: issuesSort, event: 'change', handler: issuesSortHandler });
  }

  const conversationSearch = document.getElementById('conversation-search');
  const conversationSearchClear = document.getElementById('conversation-search-clear');
  if (conversationSearch) {
    const conversationSearchHandler = debounce((e) => {
      conversationFilters.search = e.target.value || '';
      if (conversationSearchClear) {
        conversationSearchClear.classList.toggle('is-visible', Boolean((conversationFilters.search || '').trim()));
      }
      if (currentPage === 'messaging') {
        const container = document.getElementById('conversations-list');
        if (container) renderConversationsList(container);
      }
    }, 250);
    conversationSearch.addEventListener('input', conversationSearchHandler);
    eventListeners.push({ element: conversationSearch, event: 'input', handler: conversationSearchHandler });
  }

  const conversationUnreadOnly = document.getElementById('conversation-unread-only');
  if (conversationUnreadOnly) {
    const unreadOnlyHandler = (e) => {
      conversationFilters.unreadOnly = Boolean(e.target.checked);
      if (currentPage === 'messaging') {
        const container = document.getElementById('conversations-list');
        if (container) renderConversationsList(container);
      }
    };
    conversationUnreadOnly.addEventListener('change', unreadOnlyHandler);
    eventListeners.push({ element: conversationUnreadOnly, event: 'change', handler: unreadOnlyHandler });
  }

  const conversationSort = document.getElementById('conversation-sort');
  if (conversationSort) {
    const conversationSortHandler = (e) => {
      conversationFilters.sort = e.target.value || 'newest';
      if (currentPage === 'messaging') {
        const container = document.getElementById('conversations-list');
        if (container) renderConversationsList(container);
      }
    };
    conversationSort.addEventListener('change', conversationSortHandler);
    eventListeners.push({ element: conversationSort, event: 'change', handler: conversationSortHandler });
  }

  if (conversationSearchClear && conversationSearch) {
    const conversationSearchClearHandler = () => {
      conversationFilters.search = '';
      conversationSearch.value = '';
      conversationSearchClear.classList.remove('is-visible');
      if (currentPage === 'messaging') {
        const container = document.getElementById('conversations-list');
        if (container) renderConversationsList(container);
      }
    };
    conversationSearchClear.addEventListener('click', conversationSearchClearHandler);
    eventListeners.push({ element: conversationSearchClear, event: 'click', handler: conversationSearchClearHandler });
  }
};

window.resetIssueFilters = () => {
  issueFilters = { status: 'all', search: '', sort: 'newest' };
  applyIssueFiltersToUi();
  if (currentPage === 'my-issues') {
    loadMyIssues();
  }
};

window.loadIssuesFromUI = () => {
  loadMyIssues();
};

window.loadConversationsFromUI = () => {
  loadConversations();
};

window.resetConversationFilters = () => {
  conversationFilters = { search: '', unreadOnly: false, sort: 'newest' };
  applyConversationFiltersToUi();
  if (currentPage === 'messaging') {
    const container = document.getElementById('conversations-list');
    if (container) renderConversationsList(container);
  }
};

window.backToConversationList = () => {
  setMessagingMobileView('list');
};

const cleanupEventListeners = () => {
  eventListeners.forEach(({ element, event, handler }) => {
    if (element) {
      element.removeEventListener(event, handler);
    }
  });
  eventListeners = [];
};

// Cleanup only when leaving the page/app lifecycle.
// Do not cleanup on hash navigation, because this page uses hash routing
// and removing listeners there makes "Add Product" stop working.
window.addEventListener('beforeunload', cleanupEventListeners);

// ============ Initialize on Load ============

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export { init, loadProducts, loadOrders };

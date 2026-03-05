// assets/js/pages/buyer.main.js
import '../config/tile-cache.js';
// Buyer Dashboard Main Script

import { renderNavbar, updateCartCount, updateMessagesCount } from '../components/navbar.js';
import { showToast, showError, showSuccess } from '../components/toast.js';
import { showSpinner, hideSpinner } from '../components/loading-spinner.js';
import { createProductCard, renderProductCards } from '../components/product-card.js';
import { createModal, closeModal } from '../components/modal.js';
import { createCarousel } from '../components/carousel.js';
import { requireAuth, getToken, isVerified, getStatus } from '../core/auth.js';
import { formatCurrency, formatRelativeTime } from '../utils/formatters.js';
import { debounce } from '../utils/helpers.js';
import { MUNICIPALITY_COORDINATES, RIZAL_MUNICIPALITIES, PRODUCT_TAGS } from '../utils/constants.js';
import { ENDPOINTS, buildUrl } from '../config/api.js';

// Services
import { listProducts, getProduct, incrementViewCount } from '../services/product.service.js';
import {
  getCart,
  addToCart as addToCartService,
  updateCartItem,
  removeFromCart,
  clearCart,
  getCartCount,
  validateCart
} from '../services/cart.service.js';
import {
  createOrder,
  getOrders,
  getOrderById,
  cancelOrder,
  confirmOrder,
  rateOrder,
  getOrderStats
} from '../services/order.service.js';
import {
  getConversations,
  getOrderMessages,
  sendMessage,
  sendMessageWithAttachment,
  markMessagesAsRead
} from '../services/message.service.js';
import { getMyIssues, getIssue } from '../services/issue.service.js';
import { getProfile, updateBuyerProfile } from '../services/user.service.js';
import { getUserId } from '../core/auth.js';
import { getDeliveryProofUrl, getIssueEvidenceUrl, getMessageAttachmentUrl } from '../utils/image-helpers.js';

// Store
import cartStore from '../store/cart.store.js';

let mapServiceModulePromise = null;
const loadMapServiceModule = () => {
  if (!mapServiceModulePromise) {
    mapServiceModulePromise = import('../services/map.service.js');
  }
  return mapServiceModulePromise;
};

const calculateDistanceLazy = async (...args) => {
  const { calculateDistance } = await loadMapServiceModule();
  return calculateDistance(...args);
};

const getRouteLazy = async (...args) => {
  const { getRoute } = await loadMapServiceModule();
  return getRoute(...args);
};

const geocodeAddressLazy = async (...args) => {
  const { geocodeAddress } = await loadMapServiceModule();
  return geocodeAddress(...args);
};

let notificationSoundModulePromise = null;
const loadNotificationSoundModule = () => {
  if (!notificationSoundModulePromise) {
    notificationSoundModulePromise = import('../features/notifications/notification-sound.js');
  }
  return notificationSoundModulePromise;
};

const initNotificationSoundsLazy = async () => {
  const mod = await loadNotificationSoundModule();
  if (typeof mod.initNotificationSounds === 'function') {
    mod.initNotificationSounds();
  }
};

const playMessageSoundLazy = async () => {
  const mod = await loadNotificationSoundModule();
  if (typeof mod.playMessageSound === 'function') {
    await mod.playMessageSound();
  }
};

let onlineStatusModulePromise = null;
const loadOnlineStatusModule = () => {
  if (!onlineStatusModulePromise) {
    onlineStatusModulePromise = import('../features/real-time/online-status.js');
  }
  return onlineStatusModulePromise;
};

const createFallbackStatusBadge = (userId) => {
  const badge = document.createElement('span');
  badge.className = 'status-badge inline-flex items-center gap-2 px-2 py-1 rounded text-sm';
  badge.dataset.userId = userId;
  badge.style.cssText = 'background-color:#f8f9fa;color:#6c757d;';
  badge.innerHTML = '<i class="bi bi-circle-fill" style="font-size:0.5rem;"></i><span>Offline</span>';
  return badge;
};

let onlineStatusApi = {
  initOnlineStatus: () => {},
  createStatusBadge: (userId) => createFallbackStatusBadge(userId),
  setInitialOnlineUsers: () => {},
  cleanup: () => {}
};

const hydrateOnlineStatusApi = async () => {
  const mod = await loadOnlineStatusModule();
  onlineStatusApi = {
    initOnlineStatus: mod.initOnlineStatus || (() => {}),
    createStatusBadge: mod.createStatusBadge || ((userId) => createFallbackStatusBadge(userId)),
    setInitialOnlineUsers: mod.setInitialOnlineUsers || (() => {}),
    cleanup: mod.cleanup || (() => {})
  };
  return onlineStatusApi;
};

let liveUpdatesModulePromise = null;
const loadLiveUpdatesModule = () => {
  if (!liveUpdatesModulePromise) {
    liveUpdatesModulePromise = import('../features/real-time/live-updates.js');
  }
  return liveUpdatesModulePromise;
};

let liveUpdatesApi = {
  initLiveUpdates: () => {},
  onUpdate: () => () => {}
};

const hydrateLiveUpdatesApi = async () => {
  const mod = await loadLiveUpdatesModule();
  liveUpdatesApi = {
    initLiveUpdates: mod.initLiveUpdates || (() => {}),
    onUpdate: mod.onUpdate || (() => () => {})
  };
  return liveUpdatesApi;
};

// ============ State ============

let currentPage = 'browse';
let currentConversation = null;
let currentConversationOrderIds = [];
let currentConversationSendOrderId = null;
let selectedMessageAttachment = null;
let hasAttachmentPreviewDelegation = false;
let socketEmit = null;
let isTypingActive = false;
let typingStopTimer = null;
let typingIndicatorHideTimer = null;
let isSendingMessage = false;
let lastFailedMessageDraft = null;
const typingPreviewByOrderId = new Map();
const typingPreviewTimers = new Map();
let onlineStatusRenderQueued = false;
let onlineUsers = new Set(); // Track online users
let initialOnlineUsersPromise = Promise.resolve(); // Promise that resolves when initial online users are loaded
const UI_STATE_STORAGE_KEY = 'agrimarket_buyer_ui_state_v1';
const DEFAULT_BROWSE_FILTERS = {
  search: '',
  category: '',
  municipality: '',
  tags: [],
  sort_by: 'created_at',
  sort_order: 'desc',
  page: 1,
  limit: 12
};
const DEFAULT_ORDER_FILTERS = {
  status: 'all',
  page: 1,
  limit: 10
};
let browseFilters = { ...DEFAULT_BROWSE_FILTERS };
let draftBrowseFilters = { ...DEFAULT_BROWSE_FILTERS };
let currentView = 'grid'; // 'grid' or 'map'
let browseFiltersCollapsed = true;
let browseDesktopFiltersHidden = false;
const DESKTOP_BROWSE_FILTERS_TOP = 84;
let browseMap = null;
let browseMapMarkerLayer = null;
let selectedBrowseMarker = null;
let useMapBounds = false;
let pendingMapBounds = null;
let mapBoundsPromptVisible = false;
let orderFilters = { ...DEFAULT_ORDER_FILTERS };
let issueFilters = {
  status: 'all',
  search: '',
  sort: 'newest'
};
let conversationFilters = {
  search: '',
  unreadOnly: false,
  sort: 'newest'
};
let browseTotalPages = 1;
let browseTotalItems = 0;
let ordersTotalPages = 1;
let ordersTotalItems = 0;
let currentCart = null;
let cartSelectedItemIds = new Set();
let cartQuantityUpdateLocks = new Set();
let cartLastQuantityUpdateAt = new Map();
let cartItemUpdateErrors = new Map();
let cartPriceChangeByItemId = new Map();
let cartLastUpdatedItemId = null;
let currentOrders = [];
let currentIssues = [];
let currentConversations = []; // Cache conversations data
let messagingMobileView = 'list';
let productDetailsMap = null;
let userLocation = null;

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

  // Keep chat panel open on mobile if a chat shell is already rendered.
  // This prevents layout fallback to compact stacked mode during async/race updates.
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

const clampToPositiveInt = (value, fallback = 1) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const safeString = (value, fallback = '') => {
  if (typeof value === 'string') return value;
  return fallback;
};

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

let ordersStatsCollapsed = false;
let issuesStatsCollapsed = false;

const saveBuyerUiState = () => {
  try {
    const payload = {
      currentPage,
      currentView,
      browseFiltersCollapsed: Boolean(browseFiltersCollapsed),
      browseDesktopFiltersHidden: Boolean(browseDesktopFiltersHidden),
      ordersStatsCollapsed: Boolean(ordersStatsCollapsed),
      issuesStatsCollapsed: Boolean(issuesStatsCollapsed),
      browseFilters: {
        search: safeString(browseFilters.search),
        category: safeString(browseFilters.category),
        municipality: safeString(browseFilters.municipality),
        tags: Array.isArray(browseFilters.tags) ? browseFilters.tags : [],
        sort_by: safeString(browseFilters.sort_by, DEFAULT_BROWSE_FILTERS.sort_by),
        sort_order: safeString(browseFilters.sort_order, DEFAULT_BROWSE_FILTERS.sort_order),
        page: clampToPositiveInt(browseFilters.page, 1),
        limit: clampToPositiveInt(browseFilters.limit, DEFAULT_BROWSE_FILTERS.limit)
      },
      orderFilters: {
        status: safeString(orderFilters.status, DEFAULT_ORDER_FILTERS.status),
        page: clampToPositiveInt(orderFilters.page, 1),
        limit: clampToPositiveInt(orderFilters.limit, DEFAULT_ORDER_FILTERS.limit)
      },
      issueFilters: {
        status: safeString(issueFilters.status, 'all'),
        search: safeString(issueFilters.search),
        sort: safeString(issueFilters.sort, 'newest')
      },
      conversationFilters: {
        search: safeString(conversationFilters.search),
        unreadOnly: Boolean(conversationFilters.unreadOnly),
        sort: safeString(conversationFilters.sort, 'newest')
      }
    };
    localStorage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    // Ignore storage failures
  }
};

const restoreBuyerUiState = () => {
  try {
    const raw = localStorage.getItem(UI_STATE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);

    if (parsed && typeof parsed === 'object') {
      if (parsed.browseFilters && typeof parsed.browseFilters === 'object') {
        browseFilters = {
          ...DEFAULT_BROWSE_FILTERS,
          ...parsed.browseFilters,
          tags: Array.isArray(parsed.browseFilters.tags) ? parsed.browseFilters.tags : [],
          page: clampToPositiveInt(parsed.browseFilters.page, 1),
          limit: clampToPositiveInt(parsed.browseFilters.limit, DEFAULT_BROWSE_FILTERS.limit)
        };
      }

      if (parsed.orderFilters && typeof parsed.orderFilters === 'object') {
        orderFilters = {
          ...DEFAULT_ORDER_FILTERS,
          ...parsed.orderFilters,
          page: clampToPositiveInt(parsed.orderFilters.page, 1),
          limit: clampToPositiveInt(parsed.orderFilters.limit, DEFAULT_ORDER_FILTERS.limit)
        };
      }

      if (parsed.issueFilters && typeof parsed.issueFilters === 'object') {
        issueFilters = {
          status: safeString(parsed.issueFilters.status, 'all'),
          search: safeString(parsed.issueFilters.search),
          sort: safeString(parsed.issueFilters.sort, 'newest')
        };
      }

      if (parsed.conversationFilters && typeof parsed.conversationFilters === 'object') {
        conversationFilters = {
          search: safeString(parsed.conversationFilters.search),
          unreadOnly: Boolean(parsed.conversationFilters.unreadOnly),
          sort: safeString(parsed.conversationFilters.sort, 'newest')
        };
      }

      if (parsed.currentView === 'map' || parsed.currentView === 'grid') {
        currentView = parsed.currentView;
      }

      if (typeof parsed.browseFiltersCollapsed === 'boolean') {
        browseFiltersCollapsed = parsed.browseFiltersCollapsed;
      }

      if (typeof parsed.browseDesktopFiltersHidden === 'boolean') {
        browseDesktopFiltersHidden = parsed.browseDesktopFiltersHidden;
      }

      if (typeof parsed.ordersStatsCollapsed === 'boolean') {
        ordersStatsCollapsed = parsed.ordersStatsCollapsed;
      }

      if (typeof parsed.issuesStatsCollapsed === 'boolean') {
        issuesStatsCollapsed = parsed.issuesStatsCollapsed;
      }

      if (['browse', 'cart', 'orders', 'messaging', 'my-issues'].includes(parsed.currentPage)) {
        currentPage = parsed.currentPage;
      }
    }
  } catch (error) {
    // Ignore corrupted state
  }
};

const renderSectionEmptyState = ({
  icon = 'inbox',
  title = 'No data found',
  subtitle = '',
  primaryActionHtml = '',
  secondaryActionHtml = ''
} = {}) => {
  return `
    <div class="text-center py-12">
      <i class="bi bi-${icon} text-6xl text-gray-400"></i>
      <p class="text-gray-600 mt-4 font-semibold">${escapeHtml(title)}</p>
      ${subtitle ? `<p class="text-sm text-gray-500 mt-2">${escapeHtml(subtitle)}</p>` : ''}
      ${(primaryActionHtml || secondaryActionHtml) ? `
        <div class="mt-4 flex flex-wrap justify-center gap-2">
          ${primaryActionHtml || ''}
          ${secondaryActionHtml || ''}
        </div>
      ` : ''}
    </div>
  `;
};

const renderSectionErrorState = ({
  title = 'Failed to load data',
  retryHandler = ''
} = {}) => {
  return `
    <div class="text-center py-12">
      <i class="bi bi-exclamation-circle text-6xl text-danger"></i>
      <p class="text-danger mt-4 font-semibold">${escapeHtml(title)}</p>
      ${retryHandler
        ? `<button class="btn btn-primary mt-4" onclick="${retryHandler}">Retry</button>`
        : ''}
    </div>
  `;
};

const renderPaginationControls = ({
  containerId,
  currentPageValue,
  totalPages,
  totalItems,
  onPrev,
  onNext,
  label = 'items'
}) => {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!totalPages || totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  const canPrev = currentPageValue > 1;
  const canNext = currentPageValue < totalPages;
  const itemLabel = `${Number(totalItems) || 0} ${label}`;

  container.innerHTML = `
    <p class="text-sm text-gray-600">${escapeHtml(itemLabel)} • Page ${currentPageValue} of ${totalPages}</p>
    <div class="flex items-center gap-2">
      <button class="btn btn-outline btn-sm" id="${containerId}-prev" ${canPrev ? '' : 'disabled'}>
        <i class="bi bi-chevron-left"></i> Previous
      </button>
      <button class="btn btn-outline btn-sm" id="${containerId}-next" ${canNext ? '' : 'disabled'}>
        Next <i class="bi bi-chevron-right"></i>
      </button>
    </div>
  `;

  const prevBtn = document.getElementById(`${containerId}-prev`);
  const nextBtn = document.getElementById(`${containerId}-next`);
  if (prevBtn && canPrev) prevBtn.addEventListener('click', onPrev);
  if (nextBtn && canNext) nextBtn.addEventListener('click', onNext);
};

const applyBrowseFiltersToUi = () => {
  const searchInput = document.getElementById('browse-search');
  const categorySelect = document.getElementById('browse-category');
  const municipalitySelect = document.getElementById('browse-municipality');
  const sortSelect = document.getElementById('browse-sort');

  if (searchInput) searchInput.value = draftBrowseFilters.search || '';
  if (categorySelect) categorySelect.value = draftBrowseFilters.category || '';
  if (municipalitySelect) municipalitySelect.value = draftBrowseFilters.municipality || '';
  if (sortSelect) sortSelect.value = `${browseFilters.sort_by}:${browseFilters.sort_order}`;

  document.querySelectorAll('.product-tag-checkbox').forEach(checkbox => {
    checkbox.checked = Array.isArray(draftBrowseFilters.tags) && draftBrowseFilters.tags.includes(checkbox.value);
  });
};

const syncDraftFiltersFromApplied = () => {
  draftBrowseFilters = {
    ...browseFilters,
    tags: Array.isArray(browseFilters.tags) ? [...browseFilters.tags] : []
  };
};

const updateBrowseQueryParams = () => {
  const params = new URLSearchParams(window.location.search);
  const setOrDelete = (key, value) => {
    if (value === '' || value === null || value === undefined) {
      params.delete(key);
    } else {
      params.set(key, String(value));
    }
  };

  setOrDelete('search', browseFilters.search);
  setOrDelete('category', browseFilters.category);
  setOrDelete('municipality', browseFilters.municipality);
  setOrDelete('sort_by', browseFilters.sort_by);
  setOrDelete('sort_order', browseFilters.sort_order);
  setOrDelete('page', browseFilters.page > 1 ? browseFilters.page : '');
  setOrDelete('tags', Array.isArray(browseFilters.tags) && browseFilters.tags.length > 0 ? browseFilters.tags.join(',') : '');

  const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}${window.location.hash}`;
  window.history.replaceState({}, '', newUrl);
};

const applyBrowseFiltersFromQuery = () => {
  const params = new URLSearchParams(window.location.search);
  if ([...params.keys()].length === 0) return;

  browseFilters.search = params.get('search') || browseFilters.search;
  browseFilters.category = params.get('category') || browseFilters.category;
  browseFilters.municipality = params.get('municipality') || browseFilters.municipality;
  browseFilters.sort_by = params.get('sort_by') || browseFilters.sort_by;
  browseFilters.sort_order = params.get('sort_order') || browseFilters.sort_order;
  browseFilters.page = clampToPositiveInt(params.get('page'), browseFilters.page);

  if (params.has('tags')) {
    const tagsParam = params.get('tags');
    browseFilters.tags = tagsParam
      ? tagsParam.split(',').map(tag => tag.trim()).filter(Boolean)
      : [];
  }
};

const applyBrowseFilters = async ({ resetPage = true } = {}) => {
  browseFilters = {
    ...browseFilters,
    ...draftBrowseFilters,
    tags: Array.isArray(draftBrowseFilters.tags) ? [...draftBrowseFilters.tags] : []
  };

  if (resetPage) {
    browseFilters.page = 1;
  }

  saveBuyerUiState();
  updateBrowseQueryParams();
  renderActiveFilterChips();
  await loadBrowseProducts();

  if (currentView === 'map') {
    await loadProductsOnMap();
  }
};

const renderActiveFilterChips = () => {
  const chipsContainer = document.getElementById('active-filter-chips');
  if (!chipsContainer) return;

  const chips = [];

  if (browseFilters.category) {
    chips.push({ key: 'category', label: `Category: ${browseFilters.category}` });
  }
  if (browseFilters.municipality) {
    chips.push({ key: 'municipality', label: `Municipality: ${browseFilters.municipality}` });
  }
  if (browseFilters.search) {
    chips.push({ key: 'search', label: `Search: ${browseFilters.search}` });
  }
  if (Array.isArray(browseFilters.tags)) {
    browseFilters.tags.forEach(tag => chips.push({ key: `tag:${tag}`, label: `Tag: ${tag}` }));
  }

  if (chips.length === 0) {
    chipsContainer.classList.add('hidden');
    chipsContainer.innerHTML = '';
    return;
  }

  chipsContainer.classList.remove('hidden');
  chipsContainer.innerHTML = `
    ${chips.map(chip => `
      <button class="buyer-filter-chip" data-chip-key="${escapeHtml(chip.key)}">
        ${escapeHtml(chip.label)} <i class="bi bi-x-lg"></i>
      </button>
    `).join('')}
    <button id="chips-clear-all" class="buyer-filter-chip buyer-filter-chip-clear">Clear all</button>
  `;

  chipsContainer.querySelectorAll('[data-chip-key]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const chipKey = btn.getAttribute('data-chip-key');
      if (!chipKey) return;
      if (chipKey.startsWith('tag:')) {
        const tag = chipKey.replace('tag:', '');
        browseFilters.tags = browseFilters.tags.filter(item => item !== tag);
      } else {
        browseFilters[chipKey] = '';
      }
      syncDraftFiltersFromApplied();
      applyBrowseFiltersToUi();
      await applyBrowseFilters({ resetPage: true });
    });
  });

  const clearBtn = document.getElementById('chips-clear-all');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      clearAllFilters({ reload: false });
      await applyBrowseFilters({ resetPage: true });
    });
  }
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

const applyBrowseFiltersCollapsedState = () => {
  const filtersCard = document.getElementById('browse-filters-card');
  const filtersToggle = document.getElementById('browse-filters-toggle');
  const desktopFiltersToggle = document.getElementById('browse-filters-toggle-desktop');
  const browseLayout = document.getElementById('browse-layout');
  if (!filtersCard || !browseLayout) return;

  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  const isDesktop = window.matchMedia('(min-width: 1024px)').matches;

  if (isMobile) {
    browseLayout.classList.remove('filters-hidden');
    filtersToggle?.removeAttribute('hidden');
    desktopFiltersToggle?.setAttribute('hidden', 'hidden');
    filtersCard.classList.toggle('is-collapsed', browseFiltersCollapsed);
    if (filtersToggle) {
      filtersToggle.setAttribute('aria-expanded', String(!browseFiltersCollapsed));
      filtersToggle.innerHTML = browseFiltersCollapsed
        ? '<i class="bi bi-chevron-down"></i> Show Filters'
        : '<i class="bi bi-chevron-up"></i> Hide Filters';
    }
    syncBrowseDesktopFiltersStickyFallback();
    return;
  }

  filtersCard.classList.remove('is-collapsed');

  if (isDesktop) {
    browseLayout.classList.toggle('filters-hidden', browseDesktopFiltersHidden);
    filtersToggle?.setAttribute('hidden', 'hidden');
    if (desktopFiltersToggle) {
      desktopFiltersToggle.removeAttribute('hidden');
      desktopFiltersToggle.setAttribute('aria-expanded', String(!browseDesktopFiltersHidden));
      desktopFiltersToggle.innerHTML = browseDesktopFiltersHidden
        ? '<i class="bi bi-layout-sidebar-inset"></i> Show Filters'
        : '<i class="bi bi-layout-sidebar"></i> Hide Filters';
    }
    syncBrowseDesktopFiltersStickyFallback();
    return;
  }

  browseLayout.classList.remove('filters-hidden');
  filtersToggle?.setAttribute('hidden', 'hidden');
  desktopFiltersToggle?.setAttribute('hidden', 'hidden');
  if (filtersToggle) {
    filtersToggle.setAttribute('aria-expanded', 'true');
    filtersToggle.innerHTML = '<i class="bi bi-chevron-up"></i> Hide Filters';
  }
  syncBrowseDesktopFiltersStickyFallback();
};

const resetBrowseDesktopFiltersStickyFallback = () => {
  const sidebar = document.getElementById('browse-filters-sidebar');
  const filtersCard = document.getElementById('browse-filters-card');
  if (!sidebar || !filtersCard) return;

  sidebar.style.removeProperty('min-height');
  filtersCard.style.removeProperty('position');
  filtersCard.style.removeProperty('top');
  filtersCard.style.removeProperty('left');
  filtersCard.style.removeProperty('width');
  filtersCard.style.removeProperty('max-height');
  filtersCard.style.removeProperty('overflow-y');
  filtersCard.style.removeProperty('z-index');
};

const syncBrowseDesktopFiltersStickyFallback = () => {
  const sidebar = document.getElementById('browse-filters-sidebar');
  const filtersCard = document.getElementById('browse-filters-card');
  if (!sidebar || !filtersCard) return;

  const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
  const shouldUseFallback = isDesktop && currentPage === 'browse' && !browseDesktopFiltersHidden;

  if (!shouldUseFallback) {
    resetBrowseDesktopFiltersStickyFallback();
    return;
  }

  const sidebarRect = sidebar.getBoundingClientRect();
  const shouldFix = sidebarRect.top <= DESKTOP_BROWSE_FILTERS_TOP;

  if (!shouldFix) {
    resetBrowseDesktopFiltersStickyFallback();
    return;
  }

  const sidebarWidth = Math.round(sidebarRect.width || sidebar.offsetWidth || 0);
  const sidebarLeft = Math.round(sidebarRect.left);
  if (!sidebarWidth) {
    resetBrowseDesktopFiltersStickyFallback();
    return;
  }

  sidebar.style.minHeight = `${Math.ceil(filtersCard.offsetHeight)}px`;
  filtersCard.style.setProperty('position', 'fixed', 'important');
  filtersCard.style.setProperty('top', `${DESKTOP_BROWSE_FILTERS_TOP}px`, 'important');
  filtersCard.style.setProperty('left', `${sidebarLeft}px`, 'important');
  filtersCard.style.setProperty('width', `${sidebarWidth}px`, 'important');
  filtersCard.style.setProperty('max-height', `calc(100vh - ${DESKTOP_BROWSE_FILTERS_TOP + 12}px)`, 'important');
  filtersCard.style.setProperty('overflow-y', 'auto', 'important');
  filtersCard.style.setProperty('z-index', '40', 'important');
};

const refreshBrowseDesktopUiImmediate = () => {
  applyBrowseFiltersCollapsedState();
  syncBrowseDesktopFiltersStickyFallback();
  updateBrowseBackToTopVisibility();

  requestAnimationFrame(() => {
    syncBrowseDesktopFiltersStickyFallback();
    updateBrowseBackToTopVisibility();
  });

  setTimeout(() => {
    syncBrowseDesktopFiltersStickyFallback();
    updateBrowseBackToTopVisibility();
  }, 90);
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

const updateBrowseBackToTopVisibility = () => {
  const button = document.getElementById('browse-back-to-top-btn');
  if (!button) return;

  const browseSection = document.getElementById('browse');
  const isBrowseVisible = Boolean(
    browseSection &&
    currentPage === 'browse' &&
    browseSection.style.display !== 'none' &&
    currentView === 'grid'
  );

  if (!isBrowseVisible) {
    button.classList.remove('is-visible');
    button.setAttribute('aria-hidden', 'true');
    return;
  }

  const sectionTop = (browseSection.getBoundingClientRect().top || 0) + window.scrollY;
  const firstCard = document.querySelector('#browse-products .product-card, #browse-products > *');
  const cardHeight = Math.max(140, Math.round(firstCard?.getBoundingClientRect?.().height || 180));
  const revealAfter = Math.max(sectionTop + (cardHeight * 5), sectionTop + 720);
  const show = window.scrollY > revealAfter;

  button.classList.toggle('is-visible', show);
  button.setAttribute('aria-hidden', show ? 'false' : 'true');
};

const scrollBrowseToTop = () => {
  const browseSection = document.getElementById('browse');
  if (!browseSection) return;

  const navbar = document.getElementById('main-navbar');
  const navbarHeight = Math.max(0, Math.round(navbar?.getBoundingClientRect?.().height || 0));
  const targetTop = Math.max(
    0,
    Math.round((browseSection.getBoundingClientRect().top || 0) + window.scrollY - navbarHeight - 8)
  );

  window.scrollTo({ top: targetTop, behavior: 'smooth' });
};

// ============ Product Reviews ============
async function viewProductReviews(productId, productName) {
  try {
    showSpinner(null, 'md', 'primary', 'Loading reviews...');

    const token = getToken();
    const reviewsUrl = buildUrl(`/products/${productId}/reviews?page=1&limit=20`);
    const response = await fetch(reviewsUrl, {
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
                  ${[1, 2, 3, 4, 5].map(star => `<i class="bi bi-star${star <= review.rating ? '-fill' : ''}"></i>`).join('')}
                </div>
              </div>
              ${review.comment ? `<p class="text-sm text-gray-700 mt-2">${review.comment}</p>` : ''}
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

window.viewProductReviews = viewProductReviews;

// ============ Initialization ============

const init = async () => {
  // Check authentication
  if (!requireAuth(['buyer'])) return;

  restoreBuyerUiState();
  applyBrowseFiltersFromQuery();
  syncDraftFiltersFromApplied();

  // Initialize cart store
  cartStore.init();

  // Initialize notification sounds (lazy-loaded)
  initNotificationSoundsLazy().catch(() => {});

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
      cartStore.set(response.data?.cart?.items || []);
    }
  } catch (error) {
    console.warn('Could not load cart:', error);
  }

  // Populate municipality filter
  populateMunicipalityFilter();
  applyBrowseFiltersToUi();
  renderActiveFilterChips();
  applyConversationFiltersToUi();
  applyIssueFiltersToUi();
  applyIssuesStatsCollapsedState();

  // Restore saved section when no explicit hash is provided
  if (!window.location.hash || window.location.hash === '#') {
    window.location.hash = currentPage || 'browse';
  }

  // Load initial data (products will be loaded by showPage via navigation)
  await updateCartUI();
  await updateMessageBadge();
  loadOrderStats();

  // Attach event listeners
  attachEventListeners();
  updateBrowseBackToTopVisibility();
  requestAnimationFrame(() => applyCartSummaryStickyState());
  setTimeout(() => applyCartSummaryStickyState(), 120);
};

// ============ Navigation ============

const setupNavigation = () => {
  // Handle hash navigation
  const handleHashChange = () => {
    const hash = window.location.hash.slice(1) || 'browse';
    showPage(hash);
  };

  window.addEventListener('hashchange', handleHashChange);
  window.addEventListener('resize', syncMessagingPanelsVisibility);

  // Call initial navigation immediately (DOM is ready since init() is called after DOMContentLoaded)
  handleHashChange();
};

const showPage = (page) => {
  // Define valid sections for buyer dashboard
  const validSections = ['browse', 'cart', 'orders', 'messaging', 'my-issues'];

  // Update current page tracking
  currentPage = page;

  // Update URL hash to persist section on reload
  if (window.location.hash.slice(1) !== page) {
    window.location.hash = page;
  }

  // Close conversation when leaving messaging section (same behavior as seller page)
  if (page !== 'messaging') {
    stopTypingSignal();
    hideTypingIndicator();
    currentConversation = null;
    currentConversationOrderIds = [];
    currentConversationSendOrderId = null;
    messagingMobileView = 'list';
    const chatWindow = document.getElementById('chat-window');
    if (chatWindow) {
      chatWindow.innerHTML = `
        <div class="buyer-chat-empty-state">
          <i class="bi bi-chat-left-text"></i>
          <p class="title">Select a conversation to start messaging</p>
          <p class="subtitle">Choose a thread on the left or jump to your latest unread conversation.</p>
          <button type="button" class="btn btn-outline btn-sm" onclick="window.openLatestUnreadConversation?.()">
            <i class="bi bi-lightning-charge"></i> Open latest unread
          </button>
        </div>
      `;
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

  if (section && validSections.includes(page)) {
    saveBuyerUiState();
    section.style.setProperty('display', 'block', 'important');

    // Load page-specific data
    switch (page) {
      case 'browse':
        loadBrowseProducts();
        toggleView(currentView);
        refreshBrowseDesktopUiImmediate();
        break;
      case 'cart':
        loadCart();
        startCartSummaryStickyEnforcer();
        requestAnimationFrame(() => applyCartSummaryStickyState());
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
        break;
      case 'my-issues':
        loadMyIssues();
        stopCartSummaryStickyEnforcer();
        break;
    }

    if (page !== 'cart') {
      stopCartSummaryStickyEnforcer();
    }

    if (page === 'messaging') {
      syncMessagingPanelsVisibility();
    }

    if (page !== 'browse') {
      resetBrowseDesktopFiltersStickyFallback();
    }

    updateBrowseBackToTopVisibility();
  } else {
    // Section not found or invalid route - redirect to 404 page
    window.location.href = '/404.html';
  }
};

// ============ Browse Products ============

const renderBrowseSkeletons = (count = 6) => {
  const container = document.getElementById('browse-products');
  if (!container) return;
  container.innerHTML = Array.from({ length: count }).map(() => `
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
};

const isDesktopBuyerViewport = () => window.matchMedia('(min-width: 1024px)').matches;

const applyCartSummaryStickyState = () => {
  const cartSection = document.getElementById('cart');
  if (!cartSection) return;

  const summaryWrap = document.querySelector('#cart .buyer-cart-summary-wrap');
  const summaryCard = document.querySelector('#cart .buyer-cart-summary-wrap .card');
  if (!summaryWrap || !summaryCard) {
    if (summaryWrap) {
      summaryWrap.style.removeProperty('min-height');
    }
    cartSection.style.removeProperty('padding-bottom');
    return;
  }

  const isCartVisible = cartSection.getClientRects().length > 0
    && window.getComputedStyle(cartSection).display !== 'none'
    && !cartSection.hidden;

  if (!isCartVisible) {
    summaryCard.style.removeProperty('position');
    summaryCard.style.removeProperty('top');
    summaryCard.style.removeProperty('left');
    summaryCard.style.removeProperty('right');
    summaryCard.style.removeProperty('bottom');
    summaryCard.style.removeProperty('width');
    summaryCard.style.removeProperty('z-index');
    summaryWrap.style.removeProperty('min-height');
    cartSection.style.removeProperty('padding-bottom');
    return;
  }

  const isMobileViewport = window.matchMedia('(max-width: 767.98px)').matches;
  cartSection.style.setProperty('transform', 'none', 'important');

  if (isMobileViewport) {
    const summaryHeight = Math.ceil(summaryCard.getBoundingClientRect().height || 0);
    const extraBottomPadding = Math.max(summaryHeight + 20, 170);

    summaryCard.style.setProperty('position', 'fixed', 'important');
    summaryCard.style.setProperty('left', '0.5rem', 'important');
    summaryCard.style.setProperty('right', '0.5rem', 'important');
    summaryCard.style.setProperty('bottom', 'max(0.5rem, env(safe-area-inset-bottom))', 'important');
    summaryCard.style.setProperty('top', 'auto', 'important');
    summaryCard.style.setProperty('z-index', '1200', 'important');
    summaryCard.style.setProperty('height', 'auto', 'important');
    summaryCard.style.setProperty('max-height', 'none', 'important');
    summaryCard.style.setProperty('overflow', 'visible', 'important');
    summaryCard.style.removeProperty('width');
    summaryWrap.style.removeProperty('min-height');
    cartSection.style.setProperty('padding-bottom', `${extraBottomPadding}px`, 'important');
    return;
  }

  summaryCard.style.setProperty('height', 'auto', 'important');
  summaryCard.style.setProperty('max-height', 'none', 'important');
  summaryCard.style.setProperty('overflow', 'visible', 'important');

  const wrapRect = summaryWrap.getBoundingClientRect();
  const fixedLeft = Math.max(8, Math.round(wrapRect.left));
  const fixedWidth = Math.max(220, Math.round(wrapRect.width));
  const summaryHeight = Math.ceil(summaryCard.getBoundingClientRect().height || 0);

  summaryCard.style.setProperty('position', 'fixed', 'important');
  summaryCard.style.setProperty('top', '84px', 'important');
  summaryCard.style.setProperty('left', `${fixedLeft}px`, 'important');
  summaryCard.style.setProperty('right', 'auto', 'important');
  summaryCard.style.setProperty('bottom', 'auto', 'important');
  summaryCard.style.setProperty('width', `${fixedWidth}px`, 'important');
  summaryCard.style.setProperty('z-index', '10', 'important');
  summaryWrap.style.setProperty('min-height', `${summaryHeight}px`, 'important');
  cartSection.style.removeProperty('padding-bottom');
};

let cartSummaryStickyEnforcerId = null;

const startCartSummaryStickyEnforcer = () => {
  if (cartSummaryStickyEnforcerId) return;
  cartSummaryStickyEnforcerId = window.setInterval(() => {
    applyCartSummaryStickyState();
  }, 280);
};

const stopCartSummaryStickyEnforcer = () => {
  if (!cartSummaryStickyEnforcerId) return;
  window.clearInterval(cartSummaryStickyEnforcerId);
  cartSummaryStickyEnforcerId = null;
};

const renderCartSkeletons = (count = 3) => {
  const container = document.getElementById('cart-items');
  if (!container) return;
  container.innerHTML = Array.from({ length: count }).map(() => `
    <div class="card buyer-cart-card">
      <div class="card-body">
        <div class="buyer-loading-skeleton-row">
          <div class="home-skeleton shimmer buyer-loading-skeleton-thumb"></div>
          <div class="buyer-loading-skeleton-col">
            <div class="home-skeleton shimmer buyer-loading-skeleton-title"></div>
            <div class="home-skeleton shimmer buyer-loading-skeleton-line w-60"></div>
            <div class="home-skeleton shimmer buyer-loading-skeleton-line w-40"></div>
          </div>
          <div class="buyer-loading-skeleton-actions">
            <div class="home-skeleton shimmer buyer-loading-skeleton-line w-32"></div>
            <div class="home-skeleton shimmer buyer-loading-skeleton-line w-24"></div>
          </div>
        </div>
      </div>
    </div>
  `).join('');
};

const renderOrdersSkeletons = (count = 3) => {
  const container = document.getElementById('orders-list');
  if (!container) return;
  container.innerHTML = Array.from({ length: count }).map(() => `
    <div class="card buyer-order-card">
      <div class="card-body">
        <div class="buyer-loading-skeleton-row">
          <div class="buyer-loading-skeleton-col">
            <div class="home-skeleton shimmer buyer-loading-skeleton-title"></div>
            <div class="home-skeleton shimmer buyer-loading-skeleton-line w-50"></div>
            <div class="home-skeleton shimmer buyer-loading-skeleton-line w-70"></div>
          </div>
          <div class="buyer-loading-skeleton-aside">
            <div class="home-skeleton shimmer buyer-loading-skeleton-line w-24"></div>
            <div class="home-skeleton shimmer buyer-loading-skeleton-title"></div>
          </div>
        </div>
        <div class="home-skeleton shimmer buyer-loading-skeleton-actions-bar"></div>
      </div>
    </div>
  `).join('');
};

const renderConversationSkeletons = (count = 6) => {
  const container = document.getElementById('conversations-list');
  if (!container) return;
  container.innerHTML = Array.from({ length: count }).map(() => `
    <div class="buyer-conversation-item p-3">
      <div class="buyer-loading-skeleton-row">
        <div class="home-skeleton shimmer buyer-loading-skeleton-avatar"></div>
        <div class="buyer-loading-skeleton-col">
          <div class="home-skeleton shimmer buyer-loading-skeleton-line w-55"></div>
          <div class="home-skeleton shimmer buyer-loading-skeleton-line w-75"></div>
          <div class="home-skeleton shimmer buyer-loading-skeleton-line w-45"></div>
        </div>
      </div>
    </div>
  `).join('');
};

const renderChatWindowSkeleton = () => {
  const chatWindow = document.getElementById('chat-window');
  if (!chatWindow) return;
  const sellerSkeletonRows = [70, 55, 60, 50];
  const buyerSkeletonRows = [45, 32];
  chatWindow.innerHTML = `
    <div class="buyer-chat-shell flex flex-col">
      <div class="border-b p-4 bg-gray-50">
        <div class="home-skeleton shimmer buyer-loading-skeleton-title"></div>
      </div>
      <div id="chat-messages" class="flex-1 overflow-y-auto p-4 space-y-3" aria-busy="true" aria-live="polite">
        ${sellerSkeletonRows.map((width) => `
          <div class="buyer-loading-skeleton-message">
            <div class="home-skeleton shimmer buyer-loading-skeleton-line w-${width}"></div>
            <div class="home-skeleton shimmer buyer-loading-skeleton-line w-40"></div>
          </div>
        `).join('')}
        ${buyerSkeletonRows.map((width) => `
          <div class="buyer-loading-skeleton-message is-self">
            <div class="home-skeleton shimmer buyer-loading-skeleton-line w-${width}"></div>
            <div class="home-skeleton shimmer buyer-loading-skeleton-line w-30"></div>
          </div>
        `).join('')}
      </div>
      <div class="border-t p-4">
        <div class="home-skeleton shimmer buyer-loading-skeleton-actions-bar"></div>
      </div>
    </div>
  `;
};

const loadBrowseProducts = async ({ append = false } = {}) => {
  const container = document.getElementById('browse-products');
  if (!container) return;

  if (!append) {
    renderBrowseSkeletons(window.innerWidth >= 1200 ? 6 : 3);
  }

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
    browseTotalItems = Number(response.total) || products.length;
    browseTotalPages = Math.max(1, Number(response.total_pages) || Math.ceil(browseTotalItems / (browseFilters.limit || 12)));

    // Update products count
    updateProductsCount(browseTotalItems);
    renderBrowsePagination();
    updateBrowseQueryParams();
    saveBuyerUiState();

    if (products.length === 0) {
      container.innerHTML = renderSectionEmptyState({
        icon: 'inbox',
        title: 'No products found',
        subtitle: 'Try removing tags or municipality filters.',
        primaryActionHtml: '<button class="btn btn-primary" onclick="window.clearBrowseFilters()">Clear Filters</button>'
      });
      updateBrowseBackToTopVisibility();
      return;
    }

    if (append) {
      products.forEach(product => {
        const card = createProductCard(product, {
          showActions: true,
          showSeller: true,
          enableMobileDetailsCollapse: true,
          onView: viewProductDetails,
          onAddToCart: handleAddToCart,
          onViewReviews: viewProductReviews
        });
        container.appendChild(card);
      });
    } else {
      renderProductCards(products, container, {
        showActions: true,
        showSeller: true,
        enableMobileDetailsCollapse: true,
        onView: viewProductDetails,
        onAddToCart: handleAddToCart,
        onViewReviews: viewProductReviews
      });
    }

    updateBrowseBackToTopVisibility();

  } catch (error) {
    console.error('Error loading products:', error);
    container.innerHTML = renderSectionErrorState({
      title: 'Failed to load products',
      retryHandler: 'window.loadBrowseProductsFromUI?.()'
    });
    updateBrowseBackToTopVisibility();
  }
};

// Update products count display
const updateProductsCount = (count) => {
  const countEl = document.getElementById('products-count');
  if (countEl) {
    countEl.textContent = `${count} product${count !== 1 ? 's' : ''} found`;
  }
};

const renderBrowsePagination = () => {
  renderPaginationControls({
    containerId: 'browse-pagination',
    currentPageValue: browseFilters.page,
    totalPages: browseTotalPages,
    totalItems: browseTotalItems,
    label: 'products',
    onPrev: () => {
      browseFilters.page = Math.max(1, browseFilters.page - 1);
      syncDraftFiltersFromApplied();
      loadBrowseProducts();
      if (currentView === 'map') loadProductsOnMap();
    },
    onNext: () => {
      browseFilters.page = Math.min(browseTotalPages, browseFilters.page + 1);
      syncDraftFiltersFromApplied();
      loadBrowseProducts();
      if (currentView === 'map') loadProductsOnMap();
    }
  });

  const container = document.getElementById('browse-pagination');
  if (!container) return;

  const canLoadMore = browseFilters.page < browseTotalPages;
  if (!canLoadMore) return;

  const loadMoreBtn = document.createElement('button');
  loadMoreBtn.id = 'browse-load-more';
  loadMoreBtn.className = 'btn btn-primary btn-sm';
  loadMoreBtn.innerHTML = '<i class="bi bi-plus-circle"></i> Load more';
  loadMoreBtn.addEventListener('click', async () => {
    browseFilters.page = Math.min(browseTotalPages, browseFilters.page + 1);
    syncDraftFiltersFromApplied();
    await loadBrowseProducts({ append: true });
  });
  container.appendChild(loadMoreBtn);
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
const clearAllFilters = ({ reload = true } = {}) => {
  // Reset filter values
  browseFilters = { ...DEFAULT_BROWSE_FILTERS };
  syncDraftFiltersFromApplied();

  // Reset UI
  applyBrowseFiltersToUi();
  renderActiveFilterChips();

  updateBrowseQueryParams();
  saveBuyerUiState();

  // Reload products
  if (reload) {
    loadBrowseProducts();
    if (currentView === 'map') {
      loadProductsOnMap();
    }
  }
};

// Toggle between grid and map view
const toggleView = (view) => {
  currentView = view;
  saveBuyerUiState();

  const gridContainer = document.getElementById('browse-products');
  const mapContainer = document.getElementById('browse-map-container');
  const gridBtn = document.getElementById('view-grid');
  const mapBtn = document.getElementById('view-map');

  if (view === 'grid') {
    gridContainer?.classList.remove('hidden');
    mapContainer?.classList.add('hidden');
    gridBtn?.classList.add('active');
    mapBtn?.classList.remove('active');
    gridBtn?.setAttribute('aria-selected', 'true');
    mapBtn?.setAttribute('aria-selected', 'false');
  } else {
    gridContainer?.classList.add('hidden');
    mapContainer?.classList.remove('hidden');
    gridBtn?.classList.remove('active');
    mapBtn?.classList.add('active');
    gridBtn?.setAttribute('aria-selected', 'false');
    mapBtn?.setAttribute('aria-selected', 'true');

    // Initialize map if not already done
    if (!browseMap) {
      initBrowseMap();
    } else {
      setTimeout(() => browseMap?.invalidateSize(), 0);
      loadProductsOnMap();
    }
  }

  updateBrowseBackToTopVisibility();
  syncBrowseDesktopFiltersStickyFallback();
  requestAnimationFrame(() => syncBrowseDesktopFiltersStickyFallback());
};

const escapeAttribute = (text) => escapeHtml(text).replace(/"/g, '&quot;');

const getProductCountLabel = (count, includePrefix = true) => {
  const numericCount = Number(count) || 0;
  const unitLabel = numericCount === 1 ? 'product' : 'products';
  return includePrefix ? `View All ${numericCount} ${unitLabel}` : `${numericCount} ${unitLabel}`;
};

const getSellerActivityLabel = (products = []) => {
  const latestTimestamp = products.reduce((latest, product) => {
    const value = product.updated_at || product.created_at;
    const ts = value ? Date.parse(value) : NaN;
    if (!Number.isFinite(ts)) return latest;
    return ts > latest ? ts : latest;
  }, 0);

  if (!latestTimestamp) return 'Updated recently';
  const hoursAgo = (Date.now() - latestTimestamp) / (1000 * 60 * 60);
  if (hoursAgo <= 24) return 'Active today';
  if (hoursAgo <= 72) return 'Active this week';
  return 'Updated recently';
};

const createBrowseMarkerIcon = ({ sellerName, productsCount }) => {
  const label = `${sellerName} • ${productsCount} ${productsCount === 1 ? 'product' : 'products'}`;
  return L.divIcon({
    className: 'browse-marker-wrap',
    html: `
      <button type="button" class="browse-marker-btn" aria-label="${escapeAttribute(label)}">
        <i class="bi bi-shop"></i>
        <span class="browse-marker-count">${productsCount}</span>
      </button>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -14]
  });
};

const applyBrowseMarkerState = (marker, state = 'default') => {
  const icon = marker?._icon;
  if (!icon) return;
  icon.classList.remove('is-hover', 'is-selected');
  if (state === 'hover') icon.classList.add('is-hover');
  if (state === 'selected') icon.classList.add('is-selected');
};

const setBrowseMapLoading = (isLoading) => {
  const loadingEl = document.getElementById('browse-map-loading');
  if (!loadingEl) return;
  loadingEl.classList.toggle('hidden', !isLoading);
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
    tileLayer.on('tileerror', function (error, tile) {
      // Silently handle tile errors
    });

    const zoomInBtn = mapContainer.querySelector('.leaflet-control-zoom-in');
    const zoomOutBtn = mapContainer.querySelector('.leaflet-control-zoom-out');
    zoomInBtn?.setAttribute('aria-label', 'Zoom in');
    zoomOutBtn?.setAttribute('aria-label', 'Zoom out');

    // Load and display products on map
    setTimeout(() => browseMap?.invalidateSize(), 0);
    browseMap.on('moveend', () => {
      if (!useMapBounds) return;
      pendingMapBounds = browseMap.getBounds();
      toggleMapSearchPrompt(true);
    });
    browseMap.on('popupopen', (event) => {
      selectedBrowseMarker = event?.popup?._source || null;
      if (selectedBrowseMarker) {
        applyBrowseMarkerState(selectedBrowseMarker, 'selected');
        browseMap.panInside(selectedBrowseMarker.getLatLng(), {
          paddingTopLeft: [26, 86],
          paddingBottomRight: [26, 42]
        });
      }
      const closeBtn = event?.popup?._container?.querySelector('.leaflet-popup-close-button');
      closeBtn?.setAttribute('aria-label', 'Close popup');
    });
    browseMap.on('popupclose', () => {
      if (selectedBrowseMarker) {
        applyBrowseMarkerState(selectedBrowseMarker, 'default');
      }
      selectedBrowseMarker = null;
    });
    loadProductsOnMap();
  } catch (error) {
    console.error('Error initializing browse map:', error);
  }
};

const toggleMapSearchPrompt = (show) => {
  const btn = document.getElementById('search-map-area');
  const resetBtn = document.getElementById('reset-map-area');
  const statusChip = document.getElementById('map-bounds-status');
  if (!btn || !resetBtn || !statusChip) return;
  mapBoundsPromptVisible = Boolean(show);
  btn.classList.toggle('hidden', !mapBoundsPromptVisible);
  resetBtn.classList.toggle('hidden', !useMapBounds);
  statusChip.classList.toggle('hidden', !useMapBounds);
};

const resetMapAreaView = async () => {
  if (!browseMap) return;
  browseMap.setView([14.6037, 121.3084], 11);
  pendingMapBounds = null;
  toggleMapSearchPrompt(false);
  await loadProductsOnMap();
};

const filterProductsByBounds = (products) => {
  if (!useMapBounds || !pendingMapBounds) return products;

  return products.filter(product => {
    const coords = MUNICIPALITY_COORDINATES[product.municipality];
    if (!coords) return false;
    return pendingMapBounds.contains([coords.latitude, coords.longitude]);
  });
};

const fetchAllProductsForMap = async (filters) => {
  const limit = 100;
  const maxPages = 50;
  const allProducts = [];
  let page = 1;
  let reportedTotal = null;

  while (page <= maxPages) {
    const response = await listProducts({ ...filters, page, limit });
    const products = response.data?.products || [];
    const parsedTotal = Number(response.total);

    if (Number.isFinite(parsedTotal)) {
      reportedTotal = parsedTotal;
    }

    allProducts.push(...products);

    if (products.length < limit) break;
    if (reportedTotal !== null && allProducts.length >= reportedTotal) break;

    page += 1;
  }

  return allProducts;
};

// Load products on map
const loadProductsOnMap = async () => {
  if (!browseMap) return;

  setBrowseMapLoading(true);
  try {
    // Get current products
    const filters = { ...browseFilters };
    if (filters.tags && filters.tags.length > 0) {
      filters.tags = filters.tags.join(',');
    } else {
      delete filters.tags;
    }

    delete filters.page;
    delete filters.limit;
    const allMapProducts = await fetchAllProductsForMap(filters);
    const products = filterProductsByBounds(allMapProducts);

    if (browseMapMarkerLayer) {
      browseMap.removeLayer(browseMapMarkerLayer);
      browseMapMarkerLayer = null;
    }
    selectedBrowseMarker = null;

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

    const markers = [];

    // Add one marker per seller per location
    Object.values(sellerGroups).forEach(sellerGroup => {
      const { seller_name, seller_verified, municipality, coordinates, products } = sellerGroup;
      const safeSellerName = escapeHtml(seller_name);
      const safeMunicipality = escapeHtml(municipality);
      const encodedSellerName = encodeURIComponent(String(seller_name ?? ''));
      const encodedMunicipality = encodeURIComponent(String(municipality ?? ''));
      const productsCount = products.length;
      const topProducts = products.slice(0, 2);
      const activityLabel = getSellerActivityLabel(products);
      const ratingValue = Number(products[0]?.seller?.rating);
      const reviewCountValue = Number(products[0]?.seller?.reviews_count);
      const ratingLabel = Number.isFinite(ratingValue) ? `${ratingValue.toFixed(1)} • ${Number.isFinite(reviewCountValue) ? reviewCountValue : 0} reviews` : '';

      const marker = L.marker([coordinates.latitude, coordinates.longitude], {
        icon: createBrowseMarkerIcon({
          sellerName: seller_name || 'Seller',
          productsCount
        }),
        keyboard: true
      });

      const productRows = topProducts.map((product) => `
        <div class="product-row">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="product-name">${escapeHtml(product.name || 'Unnamed Product')}</div>
              <div class="product-price">${formatCurrency(product.price_per_unit)}/${escapeHtml(product.unit_type || 'unit')}</div>
            </div>
            <button
              class="quick-link"
              type="button"
              aria-label="Quick view ${escapeAttribute(product.name || 'product')}"
              onclick="window.viewProductFromMap('${encodeURIComponent(String(product.id ?? ''))}')"
            >
              Quick View
            </button>
          </div>
        </div>
      `).join('');

      const popupContent = `
        <div class="browse-seller-popup">
          <div class="head">
            <h4 class="seller-name">${safeSellerName}</h4>
            ${seller_verified ? '<i class="bi bi-patch-check-fill text-success" title="Verified seller"></i>' : ''}
          </div>
          <div class="meta"><i class="bi bi-geo-alt"></i> ${safeMunicipality}</div>
          <div class="trust">
            <i class="bi bi-activity"></i> ${activityLabel}
            ${ratingLabel ? `<span>• ${escapeHtml(ratingLabel)}</span>` : ''}
          </div>
          ${productRows || '<div class="text-sm text-gray-500 mb-2">No products yet</div>'}
          <button
            class="btn btn-primary primary-cta"
            type="button"
            aria-label="${escapeAttribute(getProductCountLabel(productsCount))}"
            onclick="window.viewAllSellerProducts('${encodedSellerName}', '${encodedMunicipality}')"
          >
            <i class="bi bi-grid-3x3-gap"></i> ${getProductCountLabel(productsCount)}
          </button>
        </div>
      `;

      marker.bindPopup(popupContent, {
        maxWidth: 320,
        className: 'seller-popup',
        autoPan: true,
        autoPanPaddingTopLeft: [24, 88],
        autoPanPaddingBottomRight: [24, 24]
      });

      marker.on('mouseover', () => {
        if (selectedBrowseMarker === marker) return;
        applyBrowseMarkerState(marker, 'hover');
      });
      marker.on('mouseout', () => {
        if (selectedBrowseMarker === marker) return;
        applyBrowseMarkerState(marker, 'default');
      });
      marker.on('click', () => {
        if (selectedBrowseMarker && selectedBrowseMarker !== marker) {
          applyBrowseMarkerState(selectedBrowseMarker, 'default');
        }
        selectedBrowseMarker = marker;
        applyBrowseMarkerState(marker, 'selected');
      });
      marker.on('add', () => {
        const markerButton = marker?._icon?.querySelector('.browse-marker-btn');
        if (!markerButton) return;
        markerButton.tabIndex = 0;
        markerButton.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            marker.openPopup();
          }
        });
      });

      markers.push(marker);
    });

    if (markers.length > 0) {
      if (typeof L.markerClusterGroup === 'function') {
        const clusterLayer = L.markerClusterGroup({
          showCoverageOnHover: false,
          spiderfyOnMaxZoom: true,
          removeOutsideVisibleBounds: true,
          maxClusterRadius: 45
        });
        markers.forEach(marker => clusterLayer.addLayer(marker));
        browseMapMarkerLayer = clusterLayer;
      } else {
        browseMapMarkerLayer = L.layerGroup(markers);
      }
      browseMap.addLayer(browseMapMarkerLayer);
    }

    if (useMapBounds && products.length === 0) {
      showToast('No sellers in this map area. Try zooming out.', 'info');
    }

    toggleMapSearchPrompt(false);
  } catch (error) {
    console.error('Error loading products on map:', error);
  } finally {
    setBrowseMapLoading(false);
  }
};

const decodeMapParam = (value) => {
  try {
    return decodeURIComponent(String(value ?? ''));
  } catch (error) {
    return String(value ?? '');
  }
};

// Global function to view product from map
window.viewProductFromMap = async (productId) => {
  try {
    const normalizedProductId = decodeMapParam(productId);
    const filters = { ...browseFilters };
    if (filters.tags && filters.tags.length > 0) {
      filters.tags = filters.tags.join(',');
    } else {
      delete filters.tags;
    }

    delete filters.page;
    delete filters.limit;
    const allProducts = await fetchAllProductsForMap(filters);
    const product = allProducts.find(p => String(p.id) === normalizedProductId);

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
    const decodedSellerName = decodeMapParam(sellerName);
    const decodedMunicipality = decodeMapParam(municipality);
    const safeSellerName = escapeHtml(decodedSellerName);
    const safeMunicipality = escapeHtml(decodedMunicipality);

    const filters = { ...browseFilters };
    if (filters.tags && filters.tags.length > 0) {
      filters.tags = filters.tags.join(',');
    } else {
      delete filters.tags;
    }

    delete filters.page;
    delete filters.limit;
    const allProducts = await fetchAllProductsForMap(filters);

    // Filter products by seller and municipality
    const sellerProducts = allProducts.filter(product =>
      product.seller_name === decodedSellerName && product.municipality === decodedMunicipality
    );

    if (sellerProducts.length === 0) {
      showError('No products found for this seller');
      return;
    }

    const primarySellerProduct = sellerProducts[0] || {};
    const primarySeller = primarySellerProduct?.seller || {};
    const sellerRating = Number(primarySeller?.rating);
    const sellerReviewCount = Number(primarySeller?.reviews_count);
    const summaryRating = Number.isFinite(sellerRating) ? `${sellerRating.toFixed(1)} (${Number.isFinite(sellerReviewCount) ? sellerReviewCount : 0})` : 'N/A';
    const sellerSinceRaw =
      primarySeller?.verified_since ||
      primarySeller?.verified_at ||
      primarySeller?.created_at ||
      primarySellerProduct?.created_at;
    const parsedSellerSince = sellerSinceRaw ? Date.parse(sellerSinceRaw) : NaN;
    const sellerSince = Number.isFinite(parsedSellerSince)
      ? String(new Date(parsedSellerSince).getFullYear())
      : (primarySellerProduct.seller_verified ? 'Verified' : 'N/A');
    const isSingleProduct = sellerProducts.length === 1;

    const modalInstance = createModal({
      title: `${safeSellerName} - ${safeMunicipality}`,
      content: `
        <div class="space-y-3">
          <div class="seller-products-summary">
            <div class="item">
              <div class="label">Status</div>
              <div class="value">${primarySellerProduct.seller_verified ? 'Verified' : 'Seller'}</div>
            </div>
            <div class="item">
              <div class="label">Rating</div>
              <div class="value">${escapeHtml(summaryRating)}</div>
            </div>
            <div class="item">
              <div class="label">Verified Since</div>
              <div class="value">${escapeHtml(String(sellerSince))}</div>
            </div>
          </div>

          <div class="seller-products-grid ${isSingleProduct ? 'single' : ''}">
            ${sellerProducts.map(product => `
              <div class="seller-product-card">
                <div class="seller-product-title">${escapeHtml(product.name || 'Unnamed Product')}</div>
                <div class="seller-product-desc">${escapeHtml(product.description || 'No description available')}</div>
                <div class="seller-product-price">${formatCurrency(product.price_per_unit)} per ${escapeHtml(product.unit_type || 'unit')}</div>
                ${isSingleProduct ? '' : `
                  <div class="seller-product-actions">
                    <button
                      type="button"
                      class="btn btn-outline"
                      aria-label="View Product ${escapeAttribute(product.name || 'item')}"
                      onclick="window.viewProductFromModal('${product.id}')"
                    >
                      <i class="bi bi-eye"></i> View Product
                    </button>
                    <button
                      type="button"
                      class="btn btn-primary"
                      aria-label="Add to Cart ${escapeAttribute(product.name || 'item')}"
                      onclick="window.addToCartFromModal('${product.id}')"
                    >
                      <i class="bi bi-cart-plus"></i> Add to Cart
                    </button>
                  </div>
                `}
              </div>
            `).join('')}
          </div>
        </div>
      `,
      size: 'lg',
      footer: isSingleProduct
        ? `
          <button
            type="button"
            class="btn btn-outline"
            aria-label="View Product ${escapeAttribute(sellerProducts[0]?.name || 'item')}"
            onclick="window.viewProductFromModal('${sellerProducts[0]?.id || ''}')"
          >
            <i class="bi bi-eye"></i> View Product
          </button>
          <button
            type="button"
            class="btn btn-primary"
            aria-label="Add to Cart ${escapeAttribute(sellerProducts[0]?.name || 'item')}"
            onclick="window.addToCartFromModal('${sellerProducts[0]?.id || ''}')"
          >
            <i class="bi bi-cart-plus"></i> Add to Cart
          </button>
        `
        : null
    });

    modalInstance.backdrop.classList.add('seller-products-modal');
    const closeButton = modalInstance.backdrop.querySelector('.modal-close');
    closeButton?.setAttribute('aria-label', 'Close seller products modal');

  } catch (error) {
    console.error('Error viewing seller products:', error);
    showError('Failed to load seller products');
  }
};

// Helper functions for modal actions
window.viewProductFromModal = async (productId) => {
  try {
    const response = await getProduct(productId);
    const product = response?.data?.product;

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
    const response = await getProduct(productId);
    const product = response?.data?.product;

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
        title: `Product Name: ${product.name}` || 'Product Details',
        content: `
          <div class="product-view-modal-grid grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
            <!-- Map Section -->
            <div class="product-view-modal-map bg-gray-50 rounded-lg h-52 sm:h-64 lg:h-80 relative overflow-hidden">
              <div id="dynamic-product-map" class="w-full h-full rounded-lg"></div>
              <div class="absolute bottom-2 left-2 right-2 sm:bottom-3 sm:left-3 sm:right-3">
                <div id="dynamic-distance-display" class="product-view-distance bg-white/90 backdrop-blur-sm rounded px-3 py-2 text-sm">
                  <i class="bi bi-geo-alt"></i> Calculating distance...
                </div>
              </div>
            </div>
            
            <!-- Product Info -->
            <div id="dynamic-product-info" class="product-view-modal-info space-y-4">
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
    resetProductMapSizeState();
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
    // Prepare photos array
    const photos = product.photos && product.photos.length > 0
      ? product.photos
      : (product.photo_path ? [product.photo_path] : []);

    // Create carousel HTML
    const carouselHtml = createCarousel(photos, product.name, {
      height: '340px',
      objectFit: 'cover',
      showIndicators: photos.length > 1,
      showArrows: photos.length > 1,
      autoPlay: true
    });

    container.innerHTML = `
      ${carouselHtml}
      
      <div class="flex items-start justify-between mb-4">
        <h3 class="text-3xl font-bold">${product.name || 'Unknown Product'}</h3>
        ${product.seller_verified ? '<span class="verified-badge"><i class="bi bi-patch-check-fill"></i> Verified</span>' : ''}
      </div>

      <div class="product-primary-panel">
        <p class="product-price">${formatCurrency(product.price_per_unit || 0)} <span class="text-lg font-normal">per ${product.unit_type || 'unit'}</span></p>
        <div class="product-primary-meta">
          <div class="product-primary-meta-item">
            <span class="label">Available Stock</span>
            <span class="value">${product.available_quantity || 0}</span>
          </div>
          <div class="quantity-selector product-qty-row">
            <label>Quantity:</label>
            <div class="flex items-center gap-2 product-qty-controls">
              <button type="button" class="btn btn-sm btn-outline product-qty-btn" onclick="decrementQuantity('product-quantity')">-</button>
              <input type="number" id="product-quantity" value="1" min="1" max="${product.available_quantity || 1}" class="form-control product-qty-input" style="width: 80px; text-align: center;">
              <span class="text-sm text-gray-600 product-qty-unit">${product.unit_type || 'units'}</span>
              <button type="button" class="btn btn-sm btn-outline product-qty-btn" onclick="incrementQuantity('product-quantity', ${product.available_quantity || 1})">+</button>
            </div>
          </div>
        </div>
        <div class="product-cta-wrap">
          <button id="add-to-cart-btn" class="btn btn-primary w-full" onclick="handleAddToCartFromModal('${product.id}')">
            <i class="bi bi-cart-plus"></i> Add to Cart
          </button>
        </div>
      </div>

      <div class="product-secondary-panel">
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
            <div class="label">Category</div>
            <div class="value"><i class="bi bi-tag"></i> ${product.category || 'Uncategorized'}</div>
          </div>
        
          <div class="product-detail-item">
            <div class="label">Location</div>
            <div class="value"><i class="bi bi-geo-alt"></i> ${product.municipality || 'Unknown'}</div>
          </div>
        </div>
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
    // Prepare photos array
    const photos = product.photos && product.photos.length > 0
      ? product.photos
      : (product.photo_path ? [product.photo_path] : []);

    // Create carousel HTML
    const carouselHtml = createCarousel(photos, product.name, {
      height: '280px',
      objectFit: 'cover',
      showIndicators: photos.length > 1,
      showArrows: photos.length > 1,
      autoPlay: false
    });

    container.innerHTML = `
      <div class="product-view-info space-y-4">
        <!-- Product Carousel -->
        <div class="product-view-carousel bg-gray-100 rounded-lg overflow-hidden">
          ${carouselHtml}
        </div>
        
        <!-- Product Info -->
        <div class="product-view-info-content space-y-3">
          <div class="flex items-start justify-between">
            <h3 class="text-xl font-bold text-gray-900">${product.name || 'Unknown Product'}</h3>
            ${product.seller_verified ? '<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800"><i class="bi bi-patch-check-fill mr-1"></i> Verified</span>' : ''}
          </div>
          
          <p class="text-2xl font-bold text-primary">${formatCurrency(product.price_per_unit || 0)} <span class="text-lg font-normal text-gray-600">per ${product.unit_type || 'unit'}</span></p>
          
          ${product.description ? `<p class="text-gray-700">${product.description}</p>` : ''}
          
          <!-- Details Grid -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
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
            <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
              <label class="font-medium">Quantity:</label>
              <div class="flex items-center gap-2 flex-wrap">
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

    setTimeout(() => {
      map.invalidateSize();
    }, 120);

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
    const forceDistancePanelVisible = () => {
      const mapSection = document.querySelector('#product-details-modal .product-map-section');
      const distanceInfo = document.querySelector('#product-details-modal .distance-info');
      const distanceDisplay = document.getElementById('distance-display');
      const distanceContext = document.getElementById('distance-context');
      if (!mapSection || !distanceInfo || !distanceDisplay) return;

      const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
      if (!isDesktop) return;

      mapSection.style.setProperty('position', 'relative', 'important');
      distanceInfo.style.setProperty('position', 'absolute', 'important');
      distanceInfo.style.setProperty('left', '0.75rem', 'important');
      distanceInfo.style.setProperty('right', '0.75rem', 'important');
      distanceInfo.style.setProperty('top', 'auto', 'important');
      distanceInfo.style.setProperty('bottom', '0.75rem', 'important');
      distanceInfo.style.setProperty('transform', 'none', 'important');
      distanceInfo.style.setProperty('z-index', '1200', 'important');
      distanceInfo.style.setProperty('padding', '0', 'important');
      distanceInfo.style.setProperty('background', 'transparent', 'important');
      distanceInfo.style.setProperty('border-top', 'none', 'important');
      distanceInfo.style.setProperty('display', 'block', 'important');
      distanceInfo.style.setProperty('visibility', 'visible', 'important');
      distanceInfo.style.setProperty('opacity', '1', 'important');
      distanceInfo.style.setProperty('pointer-events', 'none', 'important');

      distanceDisplay.style.setProperty('display', 'flex', 'important');
      distanceDisplay.style.setProperty('width', '100%', 'important');
      distanceDisplay.style.setProperty('max-width', '420px', 'important');
      distanceDisplay.style.setProperty('margin', '0 auto', 'important');
      distanceDisplay.style.setProperty('min-height', '64px', 'important');
      distanceDisplay.style.setProperty('padding', '0.65rem 0.8rem', 'important');
      distanceDisplay.style.setProperty('border-radius', '12px', 'important');
      distanceDisplay.style.setProperty('font-weight', '800', 'important');
      distanceDisplay.style.setProperty('text-align', 'center', 'important');
      distanceDisplay.style.setProperty('line-height', '1.35', 'important');
      distanceDisplay.style.setProperty('color', '#ffffff', 'important');
      distanceDisplay.style.setProperty('background', 'linear-gradient(180deg, #1b7a3d 0%, #146334 100%)', 'important');
      distanceDisplay.style.setProperty('box-shadow', '0 12px 24px rgba(9, 49, 30, 0.32)', 'important');
      distanceDisplay.style.setProperty('visibility', 'visible', 'important');
      distanceDisplay.style.setProperty('opacity', '1', 'important');
      distanceDisplay.style.setProperty('pointer-events', 'auto', 'important');

      if (distanceContext) {
        distanceContext.style.setProperty('margin-top', '0.36rem', 'important');
        distanceContext.style.setProperty('text-align', 'center', 'important');
        distanceContext.style.setProperty('font-size', '0.74rem', 'important');
        distanceContext.style.setProperty('color', 'rgba(232, 247, 237, 0.96)', 'important');
        distanceContext.style.setProperty('text-shadow', '0 1px 2px rgba(0, 0, 0, 0.24)', 'important');
        distanceContext.style.setProperty('visibility', 'visible', 'important');
        distanceContext.style.setProperty('opacity', '1', 'important');
      }
    };
    forceDistancePanelVisible();


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
    tileLayer.on('tileerror', function (error, tile) {
      // Silently handle tile errors
    });

    const markers = [];

    const safeSellerName = escapeHtml(product.seller_name || 'Seller');
    const safeMunicipality = escapeHtml(product.municipality || 'Unknown');
    const safeProductName = escapeHtml(product.name || 'Product');
    const safeUnitType = escapeHtml(product.unit_type || 'unit');
    const sellerProductCount = Number(product.seller_product_count || product.total_products || 1);
    const productCountLabel = sellerProductCount === 1 ? '1 product available' : `${sellerProductCount} products available`;
    const updatedDateRaw = product.updated_at || product.created_at;
    const updatedDate = updatedDateRaw ? new Date(updatedDateRaw) : null;
    const updatedLabel = Number.isFinite(updatedDate?.getTime())
      ? updatedDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Recently updated';

    // Add seller marker with primary icon
    if (sellerCoords) {
      const sellerIcon = L.divIcon({
        className: 'custom-marker seller-marker',
        html: `
          <button class="marker-pin seller-pin" type="button" aria-label="Seller location: ${escapeAttribute(product.seller_name || 'Seller')}">
            <i class="bi bi-shop-window"></i>
            <span class="marker-ring" aria-hidden="true"></span>
          </button>
        `,
        iconSize: [40, 46],
        iconAnchor: [20, 44],
        popupAnchor: [0, -34]
      });

      const sellerMarker = L.marker([sellerCoords.lat, sellerCoords.lng], { icon: sellerIcon })
        .addTo(productDetailsMap)
        .bindPopup(`
          <div class="product-modal-map-popup seller-popup-card">
            <div class="popup-topline">
              <span class="popup-badge"><i class="bi bi-patch-check-fill"></i> Verified seller</span>
              <span class="popup-updated">Updated ${updatedLabel}</span>
            </div>
            <h4 class="popup-title">${safeSellerName}</h4>
            <p class="popup-meta"><i class="bi bi-geo-alt"></i> ${safeMunicipality}</p>
            <div class="popup-product">
              <strong>${safeProductName}</strong>
              <span>${formatCurrency(product.price_per_unit || 0)} / ${safeUnitType}</span>
            </div>
            <p class="popup-trust"><i class="bi bi-box-seam"></i> ${productCountLabel}</p>
          </div>
        `, {
          className: 'product-modal-popup',
          maxWidth: 310,
          autoPan: true,
          autoPanPaddingTopLeft: [24, 88],
          autoPanPaddingBottomRight: [24, 24]
        });

      markers.push(sellerMarker);

    }

    // Add user marker with blue icon
    if (userLocation) {
      const userIcon = L.divIcon({
        className: 'custom-marker user-marker',
        html: `
          <button class="marker-pin user-pin" type="button" aria-label="Your location">
            <i class="bi bi-person-fill"></i>
          </button>
        `,
        iconSize: [38, 42],
        iconAnchor: [19, 40],
        popupAnchor: [0, -30]
      });

      const userMarker = L.marker([userLocation.latitude, userLocation.longitude], { icon: userIcon })
        .addTo(productDetailsMap)
        .bindPopup(`
          <div class="product-modal-map-popup user-popup-card">
            <h4 class="popup-title"><i class="bi bi-person-fill"></i> Your Location</h4>
            <p class="popup-meta"><i class="bi bi-geo-alt"></i> ${escapeHtml(userLocation.address || 'Current Location')}</p>
            <p class="popup-trust"><i class="bi bi-signpost-2"></i> Buyer pin</p>
          </div>
        `, {
          className: 'product-modal-popup',
          maxWidth: 290,
          autoPan: true,
          autoPanPaddingTopLeft: [24, 88],
          autoPanPaddingBottomRight: [24, 24]
        });

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

    setTimeout(() => {
      if (productDetailsMap) {
        productDetailsMap.invalidateSize();
        forceDistancePanelVisible();
      }
    }, 150);
    window.requestAnimationFrame(forceDistancePanelVisible);
    setTimeout(forceDistancePanelVisible, 420);

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
  const distanceContext = document.getElementById('distance-context');
  if (distanceContext) {
    const addressLabel = userLoc?.address || 'your saved location';
    distanceContext.innerHTML = `From ${escapeHtml(addressLabel)}. <button type="button" onclick="window.refreshBuyerLocation?.()">Set location</button>`;
  }

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

    const response = await calculateDistanceLazy(
      userLoc.latitude,
      userLoc.longitude,
      parseFloat(product.latitude),
      parseFloat(product.longitude)
    );



    if (response && response.success && response.data && typeof response.data.distance_km === 'number') {
      const distanceKm = response.data.distance_km;
      // Conservative provisional estimate while route ETA is loading
      const estimatedTime = Math.round((distanceKm * 5) + 8);



      distanceDisplay.innerHTML = `
        <div>
          <div><i class="bi bi-geo-alt"></i> ${distanceKm.toFixed(1)} km away</div>
          <div class="text-sm mt-1"><i class="bi bi-clock"></i> ~${estimatedTime} mins travel (est.)</div>
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

      const estimatedTime = Math.round((fallbackDistance * 6) + 10); // Conservative fallback with traffic allowance



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

const estimateTrafficAwareEtaMinutes = (baseMinutes, distanceKm = 0) => {
  if (!Number.isFinite(baseMinutes) || baseMinutes <= 0) return null;

  const hour = new Date().getHours();
  const isPeak = (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 20);
  const isShoulder = (hour >= 6 && hour < 7) || (hour > 9 && hour < 16) || (hour > 20 && hour <= 22);

  const trafficMultiplier = isPeak ? 1.3 : (isShoulder ? 1.18 : 1.1);
  const stopAndTurnBuffer = distanceKm < 3 ? 4 : (distanceKm < 10 ? 7 : 10);
  const trafficAdjusted = Math.round((baseMinutes * trafficMultiplier) + stopAndTurnBuffer);
  const conservativeFloor = Math.round((distanceKm * 4.5) + 5);

  return Math.max(trafficAdjusted, conservativeFloor);
};

const displayRoute = async (userLoc, product, distance) => {
  try {
    // Only show route for reasonable distances (< 50km to avoid cluttering)
    if (distance > 50 || !productDetailsMap) return;

    const routeResponse = await getRouteLazy(
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

      // Update distance display with traffic-aware route ETA
      if (routeResponse.data.duration_minutes) {
        const distanceDisplay = document.getElementById('distance-display');
        const routeDistanceValue = Number(routeResponse.data.distance_km);
        const routeDurationValue = Number(routeResponse.data.duration_minutes);
        const routeDistanceKm = Number.isFinite(routeDistanceValue)
          ? routeDistanceValue
          : distance;
        const etaMinutes = estimateTrafficAwareEtaMinutes(
          routeDurationValue,
          routeDistanceKm
        );

        distanceDisplay.innerHTML = `
          <div>
            <div><i class="bi bi-geo-alt"></i> ${routeDistanceKm.toFixed(1)} km away</div>
            <div class="text-sm mt-1"><i class="bi bi-clock"></i> ~${etaMinutes || routeResponse.data.duration_minutes} mins by car (traffic-aware)</div>
            ${routeResponse.data.note ? '<div class="text-xs text-gray-300 mt-1">* Route API fallback estimate</div>' : ''}
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
    const mapSizeBtn = document.getElementById('toggle-map-size-btn');

    if (!modal || !closeBtn) {
      console.warn('Modal or close button not found, skipping close handlers setup');
      return;
    }

    // Close button handler
    closeBtn.onclick = closeProductDetailsModal;
    if (mapSizeBtn) {
      mapSizeBtn.onclick = toggleProductMapSize;
    }

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
    resetProductMapSizeState();

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

const toggleProductMapSize = () => {
  const modalPanel = document.querySelector('#product-details-modal .product-details-modal');
  const mapSizeBtn = document.getElementById('toggle-map-size-btn');
  if (!modalPanel || !mapSizeBtn) return;

  const isExpanded = modalPanel.classList.toggle('map-expanded');
  mapSizeBtn.innerHTML = isExpanded
    ? '<i class="bi bi-fullscreen-exit"></i> Collapse map'
    : '<i class="bi bi-arrows-fullscreen"></i> Expand map';

  setTimeout(() => {
    if (productDetailsMap) {
      productDetailsMap.invalidateSize();
    }
  }, 180);
};

const resetProductMapSizeState = () => {
  const modalPanel = document.querySelector('#product-details-modal .product-details-modal');
  const mapSizeBtn = document.getElementById('toggle-map-size-btn');
  if (modalPanel) {
    modalPanel.classList.remove('map-expanded');
  }

  if (mapSizeBtn) {
    mapSizeBtn.innerHTML = '<i class="bi bi-arrows-fullscreen"></i> Expand map';
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

  renderCartSkeletons(isDesktopBuyerViewport() ? 3 : 2);
  requestAnimationFrame(() => applyCartSummaryStickyState());

  try {
    const previousPrices = new Map((currentCart?.items || []).map((item) => [
      item.id,
      Number(item.product?.price_per_unit || 0)
    ]));
    const response = await getCart();
    currentCart = response.data?.cart || { items: [], total: 0 };
    const nextItems = currentCart?.items || [];

    cartPriceChangeByItemId = new Map();
    nextItems.forEach((item) => {
      const prev = previousPrices.get(item.id);
      const next = Number(item.product?.price_per_unit || 0);
      if (Number.isFinite(prev) && Number.isFinite(next) && prev > 0 && Math.abs(prev - next) > 0.0001) {
        cartPriceChangeByItemId.set(item.id, { oldPrice: prev, newPrice: next });
      }
    });
    const existingSelection = new Set(nextItems.map((item) => item.id).filter((id) => cartSelectedItemIds.has(id)));
    cartSelectedItemIds = existingSelection.size > 0
      ? existingSelection
      : new Set(nextItems.map((item) => item.id));

    renderCart();
    requestAnimationFrame(() => applyCartSummaryStickyState());

  } catch (error) {
    console.error('Error loading cart:', error);
    showError('Failed to load cart');
    container.innerHTML = renderSectionErrorState({
      title: 'Failed to load cart',
      retryHandler: 'window.loadCartFromUI?.()'
    });
    requestAnimationFrame(() => applyCartSummaryStickyState());
  }
};

const getUnitPrice = (item) => Number(item?.product?.price_per_unit || 0);

const getCartItemSubtotal = (item) => getUnitPrice(item) * Number(item?.quantity || 0);

const getSelectedCartItems = () => {
  const items = currentCart?.items || [];
  return items.filter((item) => cartSelectedItemIds.has(item.id));
};

const calculateCartSummary = () => {
  const selectedItems = getSelectedCartItems();
  const subtotal = selectedItems.reduce((sum, item) => sum + getCartItemSubtotal(item), 0);
  const shippingEstimate = selectedItems.length > 0 ? 49 : 0;
  const grandTotal = subtotal + shippingEstimate;
  return { selectedItems, subtotal, shippingEstimate, grandTotal };
};

const pulseElement = (el) => {
  if (!el) return;
  el.classList.remove('buyer-cart-total-pulse');
  void el.offsetWidth;
  el.classList.add('buyer-cart-total-pulse');
};

const refreshCartSummaryUI = () => {
  const subtotalEl = document.getElementById('cart-subtotal');
  const totalEl = document.getElementById('cart-total');
  const shippingEl = document.getElementById('cart-shipping-estimate');
  const grandTotalEl = document.getElementById('cart-grand-total');
  const selectedInfoEl = document.getElementById('cart-selected-info');
  const btnCheckout = document.getElementById('btn-checkout');
  const cartItems = currentCart?.items || [];
  const {
    selectedItems,
    subtotal,
    shippingEstimate,
    grandTotal
  } = calculateCartSummary();

  if (subtotalEl) {
    subtotalEl.textContent = formatCurrency(subtotal);
    pulseElement(subtotalEl);
  }
  if (shippingEl) shippingEl.textContent = formatCurrency(shippingEstimate);
  if (grandTotalEl) {
    grandTotalEl.textContent = formatCurrency(grandTotal);
    pulseElement(grandTotalEl);
  }
  if (totalEl) totalEl.textContent = formatCurrency(grandTotal);
  if (selectedInfoEl) {
    selectedInfoEl.textContent = `${selectedItems.length} selected item${selectedItems.length === 1 ? '' : 's'} of ${cartItems.length}`;
  }

  if (btnCheckout) {
    const allSelected = selectedItems.length === cartItems.length;
    btnCheckout.disabled = selectedItems.length === 0;
    btnCheckout.innerHTML = selectedItems.length === 0
      ? '<i class="bi bi-slash-circle"></i> Select item(s) first'
      : allSelected
        ? '<i class="bi bi-bag-check"></i> Proceed to Checkout'
        : '<i class="bi bi-info-circle"></i> Partial checkout preview';
  }
};

const getSellerGroups = (items = []) => {
  const map = new Map();
  items.forEach((item) => {
    const sellerId = item?.seller_id || 'unknown-seller';
    if (!map.has(sellerId)) {
      map.set(sellerId, {
        sellerId,
        sellerName: item?.product?.seller?.user?.full_name || 'Unknown Seller',
        items: []
      });
    }
    map.get(sellerId).items.push(item);
  });
  return Array.from(map.values());
};

const getCartItemAlerts = (item) => {
  const alerts = [];
  const stock = Number(item?.product?.available_quantity || 0);
  const quantity = Number(item?.quantity || 0);
  const priceChange = cartPriceChangeByItemId.get(item.id);
  const updateError = cartItemUpdateErrors.get(item.id);

  if (Number.isFinite(stock) && stock > 0 && stock <= 5) {
    alerts.push(`<div class="buyer-cart-alert buyer-cart-alert--warn"><i class="bi bi-exclamation-circle"></i> Low stock: ${stock} left</div>`);
  }
  if (Number.isFinite(stock) && stock <= 0) {
    alerts.push('<div class="buyer-cart-alert buyer-cart-alert--danger"><i class="bi bi-x-octagon"></i> Out of stock right now</div>');
  } else if (Number.isFinite(stock) && quantity > stock) {
    alerts.push(`<div class="buyer-cart-alert buyer-cart-alert--danger"><i class="bi bi-exclamation-triangle"></i> Quantity exceeds stock (${stock} available)</div>`);
  }
  if (priceChange) {
    alerts.push(`<div class="buyer-cart-alert buyer-cart-alert--info"><i class="bi bi-arrow-repeat"></i> Price updated: ${formatCurrency(priceChange.oldPrice)} -> ${formatCurrency(priceChange.newPrice)}</div>`);
  }
  if (updateError?.message) {
    alerts.push(`
      <div class="buyer-cart-alert buyer-cart-alert--danger">
        <i class="bi bi-wifi-off"></i> ${escapeHtml(updateError.message)}
        <button class="btn btn-sm btn-outline ml-2" onclick="window.retryCartItemUpdate('${item.id}')">Retry</button>
      </div>
    `);
  }
  return alerts.join('');
};

const renderCart = () => {
  const container = document.getElementById('cart-items');
  if (!container) return;
  const items = currentCart?.items || [];

  if (!currentCart || items.length === 0) {
    container.innerHTML = renderSectionEmptyState({
      icon: 'cart-x',
      title: 'Your cart is empty',
      subtitle: 'Add products first before checking out. We will keep your totals synced here.',
      primaryActionHtml: '<a href="#browse" class="btn btn-primary"><i class="bi bi-grid"></i> Browse Products</a>'
    });
    cartSelectedItemIds.clear();
    refreshCartSummaryUI();
    attachCheckoutListener();
    return;
  }

  const allSelected = items.every((item) => cartSelectedItemIds.has(item.id));
  const sellerGroups = getSellerGroups(items);
  const cartWarnings = items.filter((item) => {
    const stock = Number(item?.product?.available_quantity || 0);
    return cartPriceChangeByItemId.has(item.id) || stock <= 0 || item.quantity > stock;
  });
  container.innerHTML = `
    <div class="buyer-cart-toolbar">
      <label class="buyer-cart-select-all">
        <input type="checkbox" class="buyer-cart-checkbox-input" ${allSelected ? 'checked' : ''} onchange="window.toggleSelectAllCartItems(this.checked)">
        <span>Select all items</span>
      </label>
      <span class="buyer-cart-toolbar-meta">${sellerGroups.length} seller${sellerGroups.length === 1 ? '' : 's'}</span>
    </div>
    ${cartWarnings.length > 0 ? `
      <div class="buyer-cart-alert buyer-cart-alert--warn mb-2">
        <i class="bi bi-exclamation-diamond"></i>
        ${cartWarnings.length} cart update${cartWarnings.length === 1 ? '' : 's'} need your review before checkout.
      </div>
    ` : ''}
    ${sellerGroups.map((group) => {
      const sellerSubtotal = group.items.reduce((sum, item) => sum + getCartItemSubtotal(item), 0);
      return `
        <div class="buyer-seller-group">
          <div class="buyer-seller-group__head">
            <h4><i class="bi bi-shop"></i> ${escapeHtml(group.sellerName)}</h4>
            <p>${group.items.length} item${group.items.length === 1 ? '' : 's'} • Subtotal ${formatCurrency(sellerSubtotal)}</p>
          </div>
          <div class="space-y-3">
            ${group.items.map((item) => {
              const unitPrice = getUnitPrice(item);
              const lineTotal = getCartItemSubtotal(item);
              const isSelected = cartSelectedItemIds.has(item.id);
              const maxStock = Number(item?.product?.available_quantity || 0);
              const isUpdating = cartQuantityUpdateLocks.has(item.id);
              return `
                <div class="card buyer-cart-card ${isUpdating ? 'is-updating' : ''}" data-item-id="${item.id}">
                  <div class="card-body">
                    <div class="flex gap-4 buyer-cart-layout">
                      <div class="buyer-cart-check">
                        <input type="checkbox" class="buyer-cart-checkbox-input" ${isSelected ? 'checked' : ''} onchange="window.toggleCartItemSelection('${item.id}', this.checked)">
                      </div>
                      <img src="${item.product?.photo_path || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22200%22%3E%3Crect fill=%22%23f0f0f0%22 width=%22300%22 height=%22200%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2220%22 fill=%22%23999%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Image%3C/text%3E%3C/svg%3E'}"
                           alt="${escapeHtml(item.product?.name || 'Product')}"
                           class="w-24 h-24 object-cover rounded-lg buyer-cart-thumb">
                      <div class="flex-1 buyer-cart-meta">
                        <h4 class="font-bold text-lg">${escapeHtml(item.product?.name || 'Product')}</h4>
                        <p class="buyer-cart-seller text-sm">${escapeHtml(group.sellerName)}</p>
                        <p class="buyer-cart-unit-price mt-2"><span>Unit:</span> ${formatCurrency(unitPrice)} / ${escapeHtml(item.product?.unit_type || 'unit')}</p>
                        ${getCartItemAlerts(item)}
                      </div>
                      <div class="flex flex-col items-end gap-2 buyer-cart-actions">
                        <div class="flex items-center gap-2 buyer-qty-controls">
                          <button class="btn btn-sm btn-outline" ${isUpdating ? 'disabled' : ''} onclick="window.updateCartQuantity('${item.id}', ${item.quantity - 1})">
                            <i class="bi bi-dash"></i>
                          </button>
                          <input type="number"
                                 value="${item.quantity}"
                                 min="1"
                                 max="${maxStock}"
                                 ${isUpdating ? 'disabled' : ''}
                                 class="w-16 text-center form-control buyer-qty-input"
                                 onchange="window.updateCartQuantity('${item.id}', this.value)">
                          <button class="btn btn-sm btn-outline" ${isUpdating ? 'disabled' : ''} onclick="window.updateCartQuantity('${item.id}', ${item.quantity + 1})">
                            <i class="bi bi-plus"></i>
                          </button>
                        </div>
                        <p class="buyer-cart-line-total-label">Subtotal</p>
                        <p class="text-lg font-bold buyer-cart-line-total">${formatCurrency(lineTotal)}</p>
                        <button class="btn btn-sm btn-danger buyer-cart-remove" title="Remove item" aria-label="Remove item" onclick="window.removeCartItem('${item.id}')">
                          <i class="bi bi-trash"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('')}
  `;

  refreshCartSummaryUI();
  attachCheckoutListener();
  applyCartSummaryStickyState();
  if (cartLastUpdatedItemId) {
    const updatedRow = container.querySelector(`[data-item-id="${cartLastUpdatedItemId}"]`);
    if (updatedRow) {
      updatedRow.classList.add('just-updated');
      setTimeout(() => {
        updatedRow.classList.remove('just-updated');
      }, 900);
    }
    cartLastUpdatedItemId = null;
  }
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
window.toggleCartItemSelection = (itemId, checked) => {
  if (checked) {
    cartSelectedItemIds.add(itemId);
  } else {
    cartSelectedItemIds.delete(itemId);
  }
  refreshCartSummaryUI();
};

window.toggleSelectAllCartItems = (checked) => {
  const items = currentCart?.items || [];
  if (checked) {
    cartSelectedItemIds = new Set(items.map((item) => item.id));
  } else {
    cartSelectedItemIds.clear();
  }
  renderCart();
};

window.retryCartItemUpdate = async (itemId) => {
  const retryMeta = cartItemUpdateErrors.get(itemId);
  if (!retryMeta || !Number.isFinite(retryMeta.retryQuantity)) return;
  await window.updateCartQuantity(itemId, retryMeta.retryQuantity);
};

window.updateCartQuantity = async (itemId, quantity) => {
  quantity = parseInt(quantity, 10);
  const now = Date.now();
  const lastAttempt = cartLastQuantityUpdateAt.get(itemId) || 0;

  if (now - lastAttempt < 350 || cartQuantityUpdateLocks.has(itemId)) {
    return;
  }
  cartLastQuantityUpdateAt.set(itemId, now);

  if (!Number.isFinite(quantity) || quantity < 1) {
    cartItemUpdateErrors.set(itemId, {
      message: 'Please enter a valid quantity (minimum 1).',
      retryQuantity: 1
    });
    renderCart();
    await loadCart();
    return;
  }

  const item = currentCart?.items?.find(cartItem => cartItem.id === itemId);
  const maxQty = parseInt(item?.product?.available_quantity, 10);
  if (Number.isFinite(maxQty) && maxQty > 0 && quantity > maxQty) {
    cartItemUpdateErrors.set(itemId, {
      message: `Only ${maxQty} item${maxQty !== 1 ? 's are' : ' is'} available.`,
      retryQuantity: maxQty
    });
    renderCart();
    return;
  }

  try {
    cartQuantityUpdateLocks.add(itemId);
    cartItemUpdateErrors.delete(itemId);
    renderCart();
    await updateCartItem(itemId, quantity);
    await loadCart();
    await updateCartUI();
    cartLastUpdatedItemId = itemId;
  } catch (error) {
    console.error('Error updating cart:', error);
    cartItemUpdateErrors.set(itemId, {
      message: error?.message || 'Failed to update cart. Please retry.',
      retryQuantity: quantity
    });
    renderCart();
  } finally {
    cartQuantityUpdateLocks.delete(itemId);
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

const promptCartWarnings = async (warnings = [], contextTitle = 'Cart updates found') => {
  if (!Array.isArray(warnings) || warnings.length === 0) return true;

  return new Promise((resolve) => {
    const warningItems = warnings.map((warning) => {
      const type = warning?.type === 'price_increase'
        ? '<span class="text-danger"><i class="bi bi-arrow-up-right"></i> Price Increased</span>'
        : warning?.type === 'price_decrease'
          ? '<span class="text-success"><i class="bi bi-arrow-down-right"></i> Price Decreased</span>'
          : '<span class="text-warning"><i class="bi bi-info-circle"></i> Update</span>';
      const oldPrice = Number(warning?.oldPrice);
      const newPrice = Number(warning?.newPrice);

      return `
        <div class="border rounded-lg p-3">
          <div class="flex items-center justify-between gap-2">
            <p class="font-semibold text-sm">${escapeHtml(warning?.product || 'Product')}</p>
            <p class="text-xs">${type}</p>
          </div>
          ${Number.isFinite(oldPrice) && Number.isFinite(newPrice) ? `
            <p class="text-sm text-gray-700 mt-1">${formatCurrency(oldPrice)} -> ${formatCurrency(newPrice)}</p>
          ` : ''}
          ${warning?.message ? `<p class="text-xs text-gray-600 mt-1">${escapeHtml(warning.message)}</p>` : ''}
        </div>
      `;
    }).join('');

    const continueId = `btn-warnings-continue-${Date.now()}`;
    const cancelId = `btn-warnings-cancel-${Date.now()}`;
    const modal = createModal({
      title: contextTitle,
      content: `
        <div class="space-y-3">
          <p class="text-sm text-gray-700">We found updates in your cart. Please review before continuing.</p>
          <div class="space-y-2 max-h-72 overflow-y-auto">${warningItems}</div>
        </div>
      `,
      footer: `
        <button class="btn btn-outline" id="${cancelId}">Review Cart</button>
        <button class="btn btn-primary" id="${continueId}">Continue</button>
      `,
      size: 'md'
    });

    const continueBtn = document.getElementById(continueId);
    const cancelBtn = document.getElementById(cancelId);

    continueBtn?.addEventListener('click', () => {
      modal.close();
      resolve(true);
    });
    cancelBtn?.addEventListener('click', () => {
      modal.close();
      resolve(false);
    });
  });
};

const handleCheckout = async () => {
  // Cart state should be validated first so users get the correct message.
  if (!currentCart || currentCart.items.length === 0) {
    showError('Your cart is empty');
    return;
  }

  const selectedItems = getSelectedCartItems();
  if (selectedItems.length === 0) {
    showError('Select at least one item before checkout.');
    return;
  }

  const selectedSellerIds = [...new Set(selectedItems.map(item => item.seller_id))];
  const hasPartialSellerSelection = selectedSellerIds.some((sellerId) => {
    const allSellerItems = currentCart.items.filter(item => item.seller_id === sellerId);
    const selectedSellerItems = selectedItems.filter(item => item.seller_id === sellerId);
    return selectedSellerItems.length !== allSellerItems.length;
  });
  if (hasPartialSellerSelection) {
    showError('Partial checkout per seller is not available yet. Select all items from the same seller to continue.');
    return;
  }

  try {
    const validationResponse = await validateCart();
    const validation = validationResponse?.data?.validation;

    if (validation) {
      if (Array.isArray(validation.warnings) && validation.warnings.length > 0) {
        const continueCheckout = await promptCartWarnings(validation.warnings, 'Cart changes before checkout');
        if (!continueCheckout) {
          await loadCart();
          await updateCartUI();
          return;
        }
      }

      if (!validation.valid) {
        const firstIssue = validation.issues?.[0] || 'Some items in your cart are no longer available.';
        showError(`${firstIssue} Please review your cart and try again.`);
        await loadCart();
        await updateCartUI();
        return;
      }
    }
  } catch (validationError) {
    console.error('Failed to validate cart before checkout:', validationError);
    showError('Unable to validate your cart right now. Please try again.');
    return;
  }

  // Get unique sellers in cart
  const uniqueSellers = [...new Set(selectedItems.map(item => item.seller_id))];

  if (uniqueSellers.length === 0) {
    showError('No items in cart');
    return;
  }

  // Check if buyer is verified before allowing checkout
  if (!isVerified()) {
    const status = getStatus();
    let message = 'Kailangang maging verified buyer ka muna bago makapag-checkout. Mangyaring kumpletohin ang iyong verification.';

    if (status === 'verification_pending' || status === 'pending') {
      message = 'Ang iyong account verification ay kasalukuyang pino-process. Mangyaring maghintay para sa approval bago makapag-checkout.';
    } else if (status === 'rejected') {
      message = 'Ang iyong verification ay na-reject. Mangyaring mag-resubmit ng iyong mga documents sa profile section.';
    }

    showError(message);

    // Delay redirect slightly so the user sees the message
    setTimeout(() => {
      window.location.href = '/verification.html';
    }, 3000);
    return;
  }

  // If only one seller, proceed directly
  if (uniqueSellers.length === 1) {
    const sellerItem = selectedItems.find(item => item.seller_id === uniqueSellers[0]);
    const sellerName = sellerItem?.product?.seller?.user?.full_name || 'Unknown Seller';
    showCheckoutModal(uniqueSellers[0], sellerName, selectedItems);
    return;
  }

  // If multiple sellers, show selection modal
  const modalContent = `
    <div class="space-y-4">
      <p class="text-gray-700 font-semibold">Your cart contains items from multiple sellers.</p>
      <p class="text-sm text-gray-600">Please select a seller to place an order. You can place separate orders for items from other sellers.</p>
      <div id="seller-list" class="space-y-2">
        ${uniqueSellers.map(sellerId => {
    const sellerItem = selectedItems.find(item => item.seller_id === sellerId);
    const sellerName = sellerItem?.product?.seller?.user?.full_name || 'Unknown Seller';
    const safeSellerName = escapeHtml(sellerName);
    const sellerItems = selectedItems.filter(item => item.seller_id === sellerId);
    const subtotal = sellerItems.reduce((sum, item) => sum + ((item.product?.price_per_unit || 0) * item.quantity), 0);
    return `
            <div class="border rounded-lg p-4 cursor-pointer hover:bg-gray-50" onclick="window.selectSellerForCheckout('${sellerId}', '${encodeURIComponent(sellerName)}')">
              <div class="flex justify-between items-center">
                <div>
                  <p class="font-semibold">${safeSellerName}</p>
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

  const selectSellerCancelId = `btn-select-seller-cancel-${Date.now()}`;
  const footer = `
    <button class="btn btn-outline" id="${selectSellerCancelId}">Cancel</button>
  `;

  const modal = createModal({
    title: 'Select Seller',
    content: modalContent,
    footer: footer,
    size: 'md'
  });
  const selectSellerCancelBtn = document.getElementById(selectSellerCancelId);
  selectSellerCancelBtn?.addEventListener('click', () => modal.close());
};

window.selectSellerForCheckout = async (sellerId, sellerNameEncoded) => {
  const sellerName = decodeURIComponent(sellerNameEncoded || '');
  closeTopModalBackdrop();
  showCheckoutModal(sellerId, sellerName, getSelectedCartItems());
};

const showCheckoutModal = (sellerId, sellerName, checkoutItems = null) => {
  const safeSellerName = escapeHtml(sellerName || 'Unknown Seller');
  const sourceItems = Array.isArray(checkoutItems) && checkoutItems.length > 0
    ? checkoutItems
    : (currentCart?.items || []);
  // Filter cart items for this seller
  const sellerItems = sourceItems.filter(item => item.seller_id === sellerId);
  const subtotal = sellerItems.reduce((sum, item) => sum + ((item.product?.price_per_unit || 0) * item.quantity), 0);

  const modalContent = `
    <form id="checkout-form" class="space-y-4">
      <div class="alert alert-info">
        <p class="font-semibold">Order Summary</p>
        <p class="text-sm">${sellerItems.length} item${sellerItems.length !== 1 ? 's' : ''} from <strong>${safeSellerName}</strong></p>
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
          <label class="form-label">Preferred Date</label>
          <input type="date" id="preferred-date" class="form-control" required min="${new Date().toISOString().split('T')[0]}">
          <small class="text-gray-500">When do you want to receive the order?</small>
        </div>
        
        <div class="form-group">
          <label class="form-label">Preferred Time</label>
          <select id="preferred-time" class="form-select" required>
            <option value="" disabled selected>Select preferred time</option>
            <option value="morning">Morning (8AM - 12PM)</option>
            <option value="afternoon">Afternoon (12PM - 5PM)</option>
            <option value="evening">Evening (5PM - 8PM)</option>
          </select>
        </div>
      </div>
      
      <div class="form-group">
        <label class="form-label">Notes</label>
        <textarea id="order-notes" class="form-control" rows="2" minlength="3" required placeholder="Special instructions for the seller..."></textarea>
      </div>
    </form>
  `;

  const checkoutCancelId = `btn-checkout-cancel-${Date.now()}`;
  const footer = `
    <button class="btn btn-outline" id="${checkoutCancelId}">Cancel</button>
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
  const checkoutCancelBtn = document.getElementById(checkoutCancelId);
  checkoutCancelBtn?.addEventListener('click', () => modal.close());

  // Store user coordinates for order creation
  let userDeliveryCoordinates = { latitude: null, longitude: null };
  let savedPreferredDeliveryOption = 'drop-off';

  // Load and populate user's address from profile
  const loadUserAddress = async () => {
    try {
      const response = await getProfile();

      // Handle different response structures
      const userData = response?.data?.user || response?.user || response?.data || response;
      const addressField = document.getElementById('delivery-address');

      if (addressField && userData) {
        const preferredOption = userData.buyer_profile?.preferred_delivery_option || userData.preferred_delivery_option;
        if (preferredOption === 'pickup' || preferredOption === 'drop-off') {
          savedPreferredDeliveryOption = preferredOption;
          const deliveryOptionSelect = document.getElementById('delivery-option');
          if (deliveryOptionSelect) {
            deliveryOptionSelect.value = preferredOption;
          }
        }

        // For buyers, the address is stored in buyer_profile.delivery_address
        const fullAddress = userData.buyer_profile?.delivery_address || userData.delivery_address || userData.address || '';

        // Get coordinates from profile if available
        const profileLat = userData.buyer_profile?.delivery_latitude || userData.delivery_latitude || userData.latitude;
        const profileLng = userData.buyer_profile?.delivery_longitude || userData.delivery_longitude || userData.longitude;

        if (profileLat && profileLng) {
          // Use coordinates from profile
          userDeliveryCoordinates.latitude = parseFloat(profileLat);
          userDeliveryCoordinates.longitude = parseFloat(profileLng);
        } else if (fullAddress) {
          // Try to geocode the address to get coordinates
          const geocodeResult = await geocodeAddress(fullAddress);

          if (geocodeResult.success && geocodeResult.data) {
            userDeliveryCoordinates.latitude = geocodeResult.data.latitude;
            userDeliveryCoordinates.longitude = geocodeResult.data.longitude;
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

    const deliveryOption = document.getElementById('delivery-option')?.value;
    const paymentMethod = document.getElementById('payment-method')?.value;
    const deliveryAddress = (document.getElementById('delivery-address')?.value || '').trim();
    const preferredDateValue = document.getElementById('preferred-date')?.value;
    const preferredTimeValue = document.getElementById('preferred-time')?.value;
    const orderNotesValue = (document.getElementById('order-notes')?.value || '').trim();

    if (!sellerId || typeof sellerId !== 'string' || !sellerId.trim()) {
      showError('Invalid seller selected. Please reopen checkout and try again.');
      return;
    }

    if (!deliveryOption) {
      showError('Please select a delivery option.');
      return;
    }

    const hasInvalidProfileAddress = deliveryAddress.toLowerCase().includes('no address found') ||
      deliveryAddress.toLowerCase().includes('error loading address');
    if (!deliveryAddress || deliveryAddress.length < 10 || hasInvalidProfileAddress) {
      showError('Please set a valid delivery address in your profile before checkout.');
      return;
    }

    if (!preferredDateValue) {
      showError('Please select your preferred delivery date.');
      return;
    }

    if (!preferredTimeValue) {
      showError('Please select your preferred delivery time.');
      return;
    }

    if (!orderNotesValue || orderNotesValue.length < 3) {
      showError('Please add notes with at least 3 characters.');
      return;
    }

    try {
      const validationResponse = await validateCart();
      const validation = validationResponse?.data?.validation;

      if (Array.isArray(validation?.warnings) && validation.warnings.length > 0) {
        const continuePlaceOrder = await promptCartWarnings(validation.warnings, 'Cart changes before placing order');
        if (!continuePlaceOrder) {
          await loadCart();
          await updateCartUI();
          return;
        }
      }

      if (validation && !validation.valid) {
        const firstIssue = validation.issues?.[0] || 'Some items in your cart are no longer available.';
        showError(`${firstIssue} Please review your cart and try again.`);
        await loadCart();
        await updateCartUI();
        return;
      }
    } catch (validationError) {
      console.error('Failed to validate cart before placing order:', validationError);
      showError('Unable to validate your cart right now. Please try again.');
      return;
    }

    const orderData = {
      seller_id: sellerId,
      delivery_option: deliveryOption,
      payment_method: paymentMethod
    };

    if (deliveryAddress) {
      orderData.delivery_address = deliveryAddress;
    }

    if (Number.isFinite(userDeliveryCoordinates.latitude) && Number.isFinite(userDeliveryCoordinates.longitude)) {
      orderData.delivery_latitude = userDeliveryCoordinates.latitude;
      orderData.delivery_longitude = userDeliveryCoordinates.longitude;
    }

    orderData.preferred_date = preferredDateValue;
    orderData.preferred_time = preferredTimeValue;
    orderData.order_notes = orderNotesValue;

    if ((deliveryOption === 'pickup' || deliveryOption === 'drop-off') && deliveryOption !== savedPreferredDeliveryOption) {
      updateBuyerProfile({ preferred_delivery_option: deliveryOption }).catch(() => {
        // Non-blocking preference save
      });
    }


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
        loadOrderStats();

        // Navigate to orders page
        setTimeout(() => {
          window.location.hash = 'orders';
        }, 300);
      } else {
        throw new Error(response.message || 'Failed to place order');
      }
    } catch (error) {
      console.error('Error placing order:', error);
      const firstValidationError = Array.isArray(error?.errors) && error.errors.length > 0
        ? error.errors[0]?.message
        : null;

      if (firstValidationError) {
        showError(firstValidationError);
      } else if (error?.message === 'Validation failed') {
        showError('Please complete the required checkout details and try again.');
      } else {
        showError(error.message || 'Failed to place order');
      }
      btnPlaceOrder.disabled = false;
      btnPlaceOrder.innerHTML = '<i class="bi bi-check-circle"></i> Place Order';
    }
  });
};

// ============ Orders Management ============

const loadOrderStats = async () => {
  const statsContainer = document.getElementById('orders-stats');
  if (!statsContainer) return;

  try {
    const response = await getOrderStats();
    const stats = response?.data?.stats || {};
    const cards = [
      { label: 'Total Orders', value: stats.total_orders || 0, icon: 'receipt' },
      { label: 'Pending', value: stats.pending_orders || 0, icon: 'hourglass-split' },
      { label: 'Completed', value: stats.completed_orders || 0, icon: 'check-circle' },
      { label: 'Total Spent', value: formatCurrency(stats.total_spent || 0), icon: 'cash-stack' }
    ];

    statsContainer.innerHTML = cards.map(card => `
      <div class="bg-white rounded-lg border border-gray-200 shadow-sm p-3 buyer-stat-card">
        <p class="text-xs text-gray-500 flex items-center gap-1 buyer-stat-label">
          <i class="bi bi-${card.icon}"></i> ${card.label}
        </p>
        <p class="text-lg font-bold mt-1 buyer-stat-value">${card.value}</p>
      </div>
    `).join('');
    applyOrdersStatsCollapsedState();
  } catch (error) {
    statsContainer.innerHTML = cardsFallback();
    applyOrdersStatsCollapsedState();
  }
};

const cardsFallback = () => {
  return `
    <div class="bg-white rounded-lg border border-gray-200 shadow-sm p-3 buyer-stat-card"><p class="text-xs text-gray-500 buyer-stat-label">Total Orders</p><p class="text-lg font-bold mt-1 buyer-stat-value">-</p></div>
    <div class="bg-white rounded-lg border border-gray-200 shadow-sm p-3 buyer-stat-card"><p class="text-xs text-gray-500 buyer-stat-label">Pending</p><p class="text-lg font-bold mt-1 buyer-stat-value">-</p></div>
    <div class="bg-white rounded-lg border border-gray-200 shadow-sm p-3 buyer-stat-card"><p class="text-xs text-gray-500 buyer-stat-label">Completed</p><p class="text-lg font-bold mt-1 buyer-stat-value">-</p></div>
    <div class="bg-white rounded-lg border border-gray-200 shadow-sm p-3 buyer-stat-card"><p class="text-xs text-gray-500 buyer-stat-label">Total Spent</p><p class="text-lg font-bold mt-1 buyer-stat-value">-</p></div>
  `;
};

const renderOrdersPagination = () => {
  renderPaginationControls({
    containerId: 'orders-pagination',
    currentPageValue: orderFilters.page,
    totalPages: ordersTotalPages,
    totalItems: ordersTotalItems,
    label: 'orders',
    onPrev: () => {
      orderFilters.page = Math.max(1, orderFilters.page - 1);
      saveBuyerUiState();
      loadOrders();
    },
    onNext: () => {
      orderFilters.page = Math.min(ordersTotalPages, orderFilters.page + 1);
      saveBuyerUiState();
      loadOrders();
    }
  });
};

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

  renderOrdersSkeletons(isDesktopBuyerViewport() ? 3 : 2);

  try {
    // Don't send status if it's 'all' - backend doesn't accept it
    const filters = { ...orderFilters };
    filters.page = clampToPositiveInt(orderFilters.page, 1);
    filters.limit = clampToPositiveInt(orderFilters.limit, DEFAULT_ORDER_FILTERS.limit);
    if (filters.status === 'all') {
      delete filters.status;
    }

    const response = await getOrders(filters);
    currentOrders = response.data?.orders || [];
    ordersTotalItems = Number(response.total) || currentOrders.length;
    ordersTotalPages = Math.max(1, Number(response.total_pages) || Math.ceil(ordersTotalItems / (filters.limit || DEFAULT_ORDER_FILTERS.limit)));
    renderOrdersPagination();
    saveBuyerUiState();

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

      container.innerHTML = renderSectionEmptyState({
        icon: 'receipt',
        title: emptyMessage,
        subtitle: 'Your orders will appear here after checkout.',
        primaryActionHtml: orderFilters.status !== 'all'
          ? '<button class="btn btn-primary" onclick="window.resetOrderFilters()">View All Orders</button>'
          : '<a href="#browse" class="btn btn-primary">Start Shopping</a>'
      });
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
    container.innerHTML = renderSectionErrorState({
      title: 'Failed to load orders',
      retryHandler: 'window.loadOrdersFromUI?.()'
    });
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
  const safeSellerName = escapeHtml(sellerName);
  const isCompleted = order.status === 'completed';
  const hasRating = order.buyer_rating && order.buyer_rating > 0;
  const itemsCount = order.items?.length || 0;
  const totalAmount = Number(order.total_amount || 0);
  const createdDateLabel = new Date(order.created_at).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  const preferredLabel = order.preferred_date
    ? `${new Date(order.preferred_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}${order.preferred_time ? ` • ${order.preferred_time}` : ''}`
    : 'Not set';
  const deliveryOptionLabel = order.delivery_option === 'pickup'
    ? 'Pickup'
    : order.delivery_option === 'drop-off'
      ? 'Drop-off'
      : 'Unspecified';
  const paymentLabel = order.payment_method ? String(order.payment_method).toUpperCase() : 'COD';

  // Debug log for completed orders
  if (isCompleted) {
  }

  return `
    <div class="card buyer-order-card" data-order-id="${order.id}">
      <div class="card-body">
        <div class="buyer-order-shell">
          <div class="buyer-order-main">
            <div class="flex justify-between items-start mb-4 buyer-order-head">
              <div class="buyer-order-head-copy">
                <h4 class="font-bold text-lg buyer-order-title">Order #${order.order_number}</h4>
                <p class="text-sm text-gray-600">${formatRelativeTime(order.created_at)}</p>
              </div>
              <span class="badge badge-${statusColor} buyer-order-badge">${order.status.toUpperCase()}</span>
            </div>

            <div class="mb-4 buyer-order-meta">
              <p class="text-sm text-gray-600 mb-2">
                <i class="bi bi-shop"></i> ${safeSellerName}
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

            <div class="buyer-order-meta-grid mb-4">
              <div class="buyer-order-meta-chip">
                <span>Created</span>
                <strong>${createdDateLabel}</strong>
              </div>
              <div class="buyer-order-meta-chip">
                <span>Delivery</span>
                <strong>${deliveryOptionLabel}</strong>
              </div>
              <div class="buyer-order-meta-chip">
                <span>Payment</span>
                <strong>${paymentLabel}</strong>
              </div>
              <div class="buyer-order-meta-chip">
                <span>Preferred</span>
                <strong>${preferredLabel}</strong>
              </div>
            </div>
          </div>

          <aside class="buyer-order-aside">
            <p class="buyer-order-aside-label">Order Total</p>
            <p class="buyer-order-aside-total">${formatCurrency(totalAmount)}</p>
            <p class="buyer-order-aside-items">${itemsCount} item${itemsCount === 1 ? '' : 's'}</p>
          </aside>
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
        
        ${order.has_unavailable_product && order.status === 'pending' ? `
          <div class="mb-4 p-4 bg-yellow-50 rounded-lg border-l-4 border-yellow-400">
            <p class="text-sm font-semibold mb-2 text-yellow-800">
              <i class="bi bi-exclamation-triangle"></i> Product Unavailable
            </p>
            <p class="text-sm text-yellow-700 mb-3">
              The following product(s) in your order have been ${order.unavailable_products[0]?.status === 'draft' ? 'temporarily unavailable (draft)' : 'paused'} by the seller:
            </p>
            <ul class="text-sm text-yellow-700 mb-3 ml-4">
              ${order.unavailable_products.map(prod => `
                <li class="mb-1"><i class="bi bi-dash"></i> ${prod.name} <span class="text-xs italic">(${prod.status})</span></li>
              `).join('')}
            </ul>
            <button class="btn btn-sm btn-outline-warning" onclick="window.openOrderChat('${order.id}')">
              <i class="bi bi-chat-dots"></i> Ask Seller About This
            </button>
          </div>
        ` : ''}

        <div class="flex gap-2 flex-wrap buyer-order-actions buyer-order-actions-desktop">
          <button class="btn btn-sm btn-outline buyer-order-action-main" onclick="window.viewOrderDetails('${order.id}')">
            <i class="bi bi-eye"></i> View Details
          </button>
          ${order.status !== 'cancelled' && order.status !== 'completed' ? `
            <button class="btn btn-sm btn-primary buyer-order-action-main" onclick="window.openOrderChat('${order.id}')">
              <i class="bi bi-chat"></i> Message Seller
            </button>
          ` : ''}
          ${order.status === 'pending' ? `
            <button class="btn btn-sm btn-danger buyer-order-action-danger" onclick="window.cancelOrder('${order.id}')">
              <i class="bi bi-x-circle"></i> Cancel
            </button>
          ` : ''}
          ${order.status === 'ready' && !order.buyer_confirmed ? `
            <button class="btn btn-sm btn-success buyer-order-action-main" onclick="window.confirmOrderReceived('${order.id}')">
              <i class="bi bi-check-circle"></i> Confirm Received
            </button>
          ` : ''}
          ${order.status === 'ready' && order.buyer_confirmed && !order.seller_confirmed ? `
            <div class="btn btn-sm btn-outline cursor-default buyer-order-action-main">
              <i class="bi bi-hourglass-split"></i> Waiting for Seller Confirmation
            </div>
          ` : ''}
          ${isCompleted ? `
            <div class="btn btn-sm btn-success cursor-default buyer-order-action-main">
              <i class="bi bi-check-circle-fill"></i> Order Completed
            </div>
          ` : ''}
          ${isCompleted ? `
            <button class="btn btn-sm btn-outline buyer-order-action-main" onclick="window.orderAgain('${order.id}')">
              <i class="bi bi-arrow-repeat"></i> Order Again
            </button>
          ` : ''}
          ${isCompleted && !hasRating ? `
            <button class="btn btn-sm btn-warning buyer-order-action-main" onclick="window.rateOrderModal('${order.id}', '${order.order_number}')">
              <i class="bi bi-star"></i> Rate Order
            </button>
          ` : ''}
          ${isCompleted && hasRating ? `
            <div class="btn btn-sm btn-outline cursor-default buyer-order-action-main">
              <i class="bi bi-star-fill text-warning"></i> Rated ${order.buyer_rating}/5
            </div>
          ` : ''}
          ${isCompleted ? `
            <button class="btn btn-sm btn-danger buyer-order-action-danger" onclick="window.reportOrderIssue('${order.id}', '${order.order_number}')">
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
    const targetOrderId = resolveOrderApiId(orderId);
    if (!targetOrderId) {
      showError('Unable to resolve order ID');
      return;
    }

    const response = await getOrderById(targetOrderId);
    const order = response.data?.order;

    if (!order) {
      showError('Order not found');
      return;
    }

    const statusColors = {
      pending: 'warning',
      confirmed: 'info',
      ready: 'primary',
      completed: 'success',
      cancelled: 'danger'
    };
    const statusClass = statusColors[order.status] || 'secondary';

    const modalContent = `
      <div class="buyer-order-details-modal">
        <div class="buyer-order-details-topbar">
          <h3 class="buyer-order-details-title">Order #${order.order_number}</h3>
          <button type="button" class="buyer-order-details-close" data-modal-close aria-label="Close order details">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>

        <div class="buyer-order-details-scroll space-y-3">
          <div class="buyer-order-details-status">
            <span class="badge badge-${statusClass}">${order.status.toUpperCase()}</span>
          </div>

          <section class="buyer-order-details-card">
            <h4 class="buyer-order-details-section-title">Seller Information</h4>
            <p class="text-sm"><i class="bi bi-shop"></i> ${order.seller?.user?.full_name || 'Unknown Seller'}</p>
            <p class="text-sm"><i class="bi bi-geo-alt"></i> ${order.seller?.municipality || 'Not provided'}</p>
            ${order.seller?.rating && order.seller.rating > 0 ? `
              <div class="flex items-center gap-2 mt-2 flex-wrap">
                <div class="flex gap-1 text-warning text-sm">
                  ${[1, 2, 3, 4, 5].map(star =>
        `<i class="bi bi-star${star <= Math.round(order.seller.rating) ? '-fill' : ''}"></i>`
      ).join('')}
                </div>
                <span class="text-sm font-semibold">${order.seller.rating.toFixed(1)} / 5.0</span>
                <button class="btn btn-sm btn-outline text-xs" onclick="window.viewSellerReviews('${order.seller.id}', '${encodeURIComponent(order.seller.user.full_name)}')">
                  View Reviews
                </button>
              </div>
            ` : ''}
          </section>

          <section class="buyer-order-details-card">
            <h4 class="buyer-order-details-section-title">Order Items</h4>
            ${order.has_unavailable_product && order.status === 'pending' ? `
              <div class="mb-3 p-3 bg-yellow-50 rounded-lg border-l-4 border-yellow-400">
                <p class="text-sm font-semibold text-yellow-800 mb-2">
                  <i class="bi bi-exclamation-triangle"></i> Product Unavailable
                </p>
                <p class="text-sm text-yellow-700 mb-2">
                  The following product(s) have been ${order.unavailable_products[0]?.status === 'draft' ? 'temporarily unavailable (draft)' : 'paused'} by the seller:
                </p>
                <ul class="text-sm text-yellow-700 ml-4">
                  ${order.unavailable_products.map(prod => `
                    <li><i class="bi bi-dash"></i> ${prod.name} <span class="text-xs italic">(${prod.status})</span></li>
                  `).join('')}
                </ul>
              </div>
            ` : ''}
            <div class="space-y-2">
              ${order.items.map(item => `
                <div class="buyer-order-item-row ${item.product_status === 'paused' || item.product_status === 'draft' ? 'text-yellow-700 bg-yellow-50 p-2 rounded' : ''}">
                  <span>${item.product_name} (${item.quantity} ${item.unit_type})${item.product_status === 'paused' || item.product_status === 'draft' ? ` <span class="text-xs italic">[${item.product_status}]</span>` : ''}</span>
                  <span class="font-semibold">${formatCurrency(item.subtotal)}</span>
                </div>
              `).join('')}
            </div>

            <div class="buyer-order-total-row">
              <span>Total</span>
              <span class="text-primary">${formatCurrency(order.total_amount)}</span>
            </div>
          </section>

          <section class="buyer-order-details-card">
            <h4 class="buyer-order-details-section-title">Delivery Details</h4>
            <p class="text-sm"><strong>Option:</strong> ${order.delivery_option}</p>
            <p class="text-sm"><strong>Address:</strong> ${order.delivery_address}</p>
            ${order.preferred_date ? `<p class="text-sm"><strong>Preferred Date:</strong> ${new Date(order.preferred_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</p>` : ''}
            ${order.preferred_time ? `<p class="text-sm"><strong>Preferred Time:</strong> ${order.preferred_time.charAt(0).toUpperCase() + order.preferred_time.slice(1)}</p>` : ''}
            <p class="text-sm"><strong>Payment:</strong> ${order.payment_method}</p>
            ${order.order_notes ? `<p class="text-sm mt-2"><strong>Notes:</strong> ${order.order_notes}</p>` : ''}
          </section>

          ${order.buyer_rating ? `
            <section class="buyer-order-details-card">
              <h4 class="buyer-order-details-section-title">
                <i class="bi bi-star-fill text-warning"></i> Your Rating
              </h4>
              <div class="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                <div class="flex items-center gap-2 mb-2">
                  <div class="flex gap-1 text-warning">
                    ${[1, 2, 3, 4, 5].map(star =>
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
            </section>
          ` : ''}

          ${order.seller_delivery_proof_url ? `
            <section class="buyer-order-details-card">
              <h4 class="buyer-order-details-section-title">
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
            </section>
          ` : ''}

          ${order.buyer_delivery_proof_url ? `
            <section class="buyer-order-details-card">
              <h4 class="buyer-order-details-section-title">
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
            </section>
          ` : ''}
        </div>

        <div class="buyer-order-details-footer">
          ${order.status !== 'cancelled' && order.status !== 'completed' ? `
            <button type="button" class="btn btn-primary btn-sm" onclick="window.openOrderChat('${order.id}')">
              <i class="bi bi-chat"></i> Message Seller
            </button>
          ` : ''}
          <button type="button" class="btn btn-outline btn-sm" data-modal-close>
            Close
          </button>
        </div>
      </div>
    `;

    createModal({
      title: 'Order Details',
      content: modalContent,
      size: 'md',
      showCloseButton: false
    });

  } catch (error) {
    console.error('Error loading order details:', error);
    showError(error.message || 'Failed to load order details');
  }
};

window.orderAgain = async (orderId) => {
  try {
    const targetOrderId = resolveOrderApiId(orderId);
    if (!targetOrderId) {
      showError('Unable to resolve order ID');
      return;
    }

    const response = await getOrderById(targetOrderId);
    const order = response.data?.order;

    if (!order || !Array.isArray(order.items) || order.items.length === 0) {
      showError('No order items found to reorder.');
      return;
    }

    const addedItems = [];
    const failedItems = [];

    for (const item of order.items) {
      if (!item?.product_id) {
        failedItems.push(`${item?.product_name || 'Unknown product'}: missing product reference`);
        continue;
      }

      if (item.product_status === 'paused' || item.product_status === 'draft') {
        failedItems.push(`${item.product_name}: currently ${item.product_status}`);
        continue;
      }

      const quantity = clampToPositiveInt(item.quantity, 1);
      try {
        await addToCartService(item.product_id, quantity);
        addedItems.push(`${item.product_name} (${quantity})`);
      } catch (error) {
        failedItems.push(`${item.product_name}: ${error?.message || 'cannot add right now'}`);
      }
    }

    if (addedItems.length > 0) {
      showSuccess(`Added ${addedItems.length} item(s) to cart.`);
      await updateCartUI();
      if (currentPage === 'cart') {
        await loadCart();
      }
    }

    if (failedItems.length > 0) {
      createModal({
        title: 'Order Again Summary',
        content: `
          <div class="space-y-3">
            ${addedItems.length > 0 ? `
              <div class="p-3 rounded-lg border border-green-200 bg-green-50">
                <p class="font-semibold text-green-800 mb-1"><i class="bi bi-check-circle"></i> Added</p>
                <ul class="text-sm text-green-900">
                  ${addedItems.map(entry => `<li>${escapeHtml(entry)}</li>`).join('')}
                </ul>
              </div>
            ` : ''}
            <div class="p-3 rounded-lg border border-yellow-200 bg-yellow-50">
              <p class="font-semibold text-yellow-800 mb-1"><i class="bi bi-exclamation-triangle"></i> Not Added</p>
              <ul class="text-sm text-yellow-900">
                ${failedItems.map(entry => `<li>${escapeHtml(entry)}</li>`).join('')}
              </ul>
            </div>
          </div>
        `,
        size: 'md',
        footer: '<button class="btn btn-secondary" data-modal-close>Close</button>'
      });
    }

    if (addedItems.length > 0) {
      window.location.hash = 'cart';
    }
  } catch (error) {
    console.error('Order again failed:', error);
    showError(error?.message || 'Failed to reorder items.');
  }
};

window.cancelOrder = async (orderId) => {
  const targetOrderId = resolveOrderApiId(orderId);
  if (!targetOrderId) {
    showError('Unable to resolve order ID');
    return;
  }

  const modalContent = `
    <div class="space-y-4">
      <p class="text-gray-700 mb-4">Please provide a reason for cancellation:</p>
      <textarea id="cancel-reason" class="form-control" rows="3" placeholder="Enter cancellation reason..." required></textarea>
    </div>
  `;

  const cancelOrderCancelId = `btn-cancel-order-cancel-${Date.now()}`;
  const footer = `
    <button class="btn btn-outline" id="${cancelOrderCancelId}">Cancel</button>
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
  const cancelOrderCancelBtn = document.getElementById(cancelOrderCancelId);
  cancelOrderCancelBtn?.addEventListener('click', () => modal.close());

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
        await cancelOrder(targetOrderId, reason);

        // Close modal immediately after success
        modal.close();

        // Show success message
        showSuccess('Order cancelled successfully');

        // Reload orders (don't await to avoid blocking)
        loadOrders().catch(err => console.error('Error reloading orders:', err));
        loadOrderStats();
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
    const targetOrderId = resolveOrderApiId(orderId);
    if (!targetOrderId) {
      showError('Unable to resolve order ID');
      return;
    }

    // Fetch fresh order data to get latest delivery proof
    const response = await getOrderById(targetOrderId);
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

        await confirmOrder(targetOrderId, file);

        // Close modal using the modal's close method
        modal.close();

        // Show success message
        showSuccess('Order confirmed! Waiting for seller confirmation.');

        // Reload orders to get updated status
        await loadOrders();
        loadOrderStats();
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
window.rateOrderModal = async (orderId, orderNumber) => {
  try {
    const targetOrderId = resolveOrderApiId(orderId);
    if (!targetOrderId) {
      showError('Unable to resolve order ID');
      return;
    }

    // Fetch order details to get products
    const response = await getOrderById(targetOrderId);
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

        const response = await rateOrder(targetOrderId, reviews);

        if (response && response.success !== false) {
          // Close modal using the modal's close method
          modal.close();

          // Show success message
          showSuccess('Reviews submitted successfully!');

          // Reload orders
          setTimeout(() => {
            loadOrders().catch(err => console.error('Error reloading orders:', err));
            loadOrderStats();
          }, 300);
        } else {
          throw new Error(response?.message || 'Failed to submit reviews');
        }

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
window.viewSellerReviews = async (sellerId, sellerNameEncoded) => {
  try {
    const sellerName = decodeURIComponent(sellerNameEncoded || '');
    const token = getToken();
    const reviewsUrl = buildUrl(`/products/seller/${sellerId}/reviews?limit=50`);
    const response = await fetch(reviewsUrl, {
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
                ${[1, 2, 3, 4, 5].map(star =>
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
window.reportOrderIssue = async (orderId, orderNumber) => {
  try {
    const { openIssueModal } = await import('../components/issue-modal.js');
    openIssueModal(orderId, orderNumber);
  } catch (error) {
    console.error('Error loading issue modal:', error);
    showError('Failed to open issue form');
  }
};

// ============ My Issues Management ============

const ISSUE_STATUS_CONFIG = {
  under_review: { color: 'warning', icon: 'hourglass-split', label: 'Under Review' },
  resolved: { color: 'success', icon: 'check-circle-fill', label: 'Resolved' },
  rejected: { color: 'danger', icon: 'x-circle-fill', label: 'Rejected' }
};

const ISSUE_PRIORITY_ORDER = { low: 1, medium: 2, high: 3, urgent: 4 };

const normalizeIssueStatus = (status) => {
  const key = String(status || 'under_review').toLowerCase();
  return ISSUE_STATUS_CONFIG[key] ? key : 'under_review';
};

const getIssueSearchText = (issue) => {
  const orderNumber = issue?.order?.order_number || issue?.order_number || '';
  const sellerName = issue?.order?.seller?.user?.full_name || issue?.seller?.user?.full_name || '';
  return [
    issue?.id,
    issue?.issue_type,
    issue?.description,
    orderNumber,
    sellerName
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
    <div class="buyer-issue-attachments mt-3">
      <p class="buyer-issue-attachments-title"><i class="bi bi-paperclip"></i> Attachments (${attachments.length})</p>
      <div class="buyer-issue-attachments-grid">
        ${attachments.slice(0, 3).map((url) => {
      const fullUrl = getIssueEvidenceUrl(url);
      const ext = String(url || '').split('.').pop()?.toUpperCase() || 'FILE';
      return `
          <button type="button" class="buyer-issue-attachment" onclick="window.previewIssueAttachment('${encodeURIComponent(fullUrl)}', '${encodeURIComponent(ext)}')">
            <img src="${fullUrl}" alt="Issue attachment">
            <span>${ext} • preview</span>
          </button>
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
    <div class="buyer-issue-stat-card">
      <p class="buyer-issue-stat-label"><i class="bi bi-${card.icon}"></i> ${card.label}</p>
      <p class="buyer-issue-stat-value">${card.value}</p>
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
    <div class="card buyer-issue-card">
      <div class="card-body buyer-issue-body">
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
        ? '<button class="btn btn-primary buyer-issues-empty-cta" onclick="window.resetIssueFilters()">View All Issues</button>'
        : '<a href="#orders" class="btn btn-primary buyer-issues-empty-cta">View Orders</a>'}
            <button class="btn btn-outline buyer-issues-empty-cta" onclick="window.openIssueResolutionGuide()">How issue resolution works</button>
          </div>
        </div>
      `;
      attachIssueFilterListeners();
      saveBuyerUiState();
      return;
    }

    saveBuyerUiState();
    container.innerHTML = currentIssues.map(issue => createIssueCard(issue)).join('');
    attachIssueFilterListeners();
  } catch (error) {
    console.error('Error loading issues:', error);
    container.innerHTML = renderSectionErrorState({
      title: 'Failed to load issues',
      retryHandler: 'window.loadIssuesFromUI?.()'
    });
  }
};

const createIssueCard = (issue) => {
  const issueStatus = normalizeIssueStatus(issue.status);
  const statusConfig = ISSUE_STATUS_CONFIG[issueStatus];
  const priority = String(issue.priority || 'medium').toLowerCase();
  const priorityLabel = priority.toUpperCase();
  const priorityClass = priority === 'urgent' || priority === 'high'
    ? 'buyer-issue-priority--high'
    : priority === 'low'
      ? 'buyer-issue-priority--low'
      : 'buyer-issue-priority--medium';
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

  return `
    <div class="card buyer-issue-card hover:shadow-lg transition-shadow ${isRecentUpdate ? 'is-recent-update' : ''}" data-issue-id="${issue.id}">
      <div class="card-body buyer-issue-body">
        <div class="buyer-issue-topline">
          <div class="buyer-issue-head-copy">
            <h3 class="font-bold text-lg buyer-issue-title">${escapeHtml(issue.issue_type || 'Issue')}</h3>
            <p class="buyer-issue-subid">Issue #${escapeHtml(issue.id || 'N/A')} • Order #${escapeHtml(issue.order?.order_number || 'N/A')}</p>
          </div>
          <div class="buyer-issue-chips">
            <span class="badge badge-${statusConfig.color} buyer-issue-status">
              <i class="bi bi-${statusConfig.icon}"></i> ${statusConfig.label}
            </span>
            <span class="buyer-issue-priority ${priorityClass}">${priorityLabel}</span>
          </div>
        </div>

        <p class="text-sm text-gray-600 mb-3 buyer-issue-desc">${escapeHtml(issue.description || '')}</p>

        <div class="buyer-issue-timeline">${timelineLabel}</div>

        <div class="buyer-issue-meta-grid">
          <div class="buyer-issue-meta-item"><i class="bi bi-calendar"></i> Reported: ${formatRelativeTime(issue.created_at)}</div>
          <div class="buyer-issue-meta-item"><i class="bi bi-clock-history"></i> Last updated: ${formatRelativeTime(issue.updated_at || issue.created_at)}</div>
          <div class="buyer-issue-meta-item"><i class="bi bi-person-badge"></i> Assigned: ${escapeHtml(assignedRole)}</div>
          ${issueStatus === 'under_review'
      ? `<div class="buyer-issue-meta-item"><i class="bi bi-alarm"></i> Expected response: ${expectedDays > 0 ? `~${expectedDays} day(s)` : 'within 24 hours'}</div>`
      : `<div class="buyer-issue-meta-item"><i class="bi bi-check2-circle"></i> ${resolutionDays ? `Resolved in ${resolutionDays} day(s)` : 'Resolution posted'}</div>`}
        </div>

        ${buildIssueAttachmentsHtml(issue)}

        <details class="buyer-issue-details mt-3">
          <summary>Quick details</summary>
          <div class="buyer-issue-details-body">
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

        <div class="buyer-issue-actions">
          <button class="btn btn-sm btn-primary buyer-issue-view-btn" onclick="window.viewIssueDetails('${issue.id}')">
            <i class="bi bi-eye"></i> View Issue
          </button>
          ${relatedOrderId ? `
            <button class="btn btn-sm btn-outline buyer-issue-bridge-btn" onclick="window.openOrderChat('${relatedOrderId}')">
              <i class="bi bi-chat-dots"></i> Open Related Messages
            </button>
          ` : ''}
        </div>
      </div>
    </div>
  `;
};

window.previewIssueAttachment = (encodedUrl, encodedLabel = '') => {
  const fullUrl = decodeURIComponent(encodedUrl || '');
  const label = decodeURIComponent(encodedLabel || 'FILE');
  if (!fullUrl) return;

  createModal({
    title: `Attachment Preview (${label})`,
    content: `
      <div class="space-y-3">
        <img src="${fullUrl}" alt="Issue attachment" class="w-full max-h-[65vh] object-contain rounded-lg border">
        <p class="text-xs text-gray-600">Type: ${escapeHtml(label)} • Click "Open Full Size" for original file.</p>
      </div>
    `,
    footer: `
      <button class="btn btn-outline" data-modal-close>Close</button>
      <a href="${fullUrl}" target="_blank" rel="noopener" class="btn btn-primary">Open Full Size</a>
    `,
    size: 'lg'
  });
};

window.openIssueResolutionGuide = () => {
  createModal({
    title: 'How Issue Resolution Works',
    content: `
      <div class="space-y-3 text-sm text-gray-700">
        <p><strong>1.</strong> Report issue from a completed order.</p>
        <p><strong>2.</strong> Include complete details and evidence attachments.</p>
        <p><strong>3.</strong> Support reviews and coordinates with seller.</p>
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

window.viewIssueDetails = async (issueId) => {
  try {
    const response = await getIssue(issueId);
    const issue = response.data?.issue;

    if (!issue) {
      showError('Issue not found');
      return;
    }

    const issueStatus = String(issue.status || 'under_review');
    const safeIssueType = escapeHtml(issue.issue_type || 'Issue');
    const safeIssueDescription = escapeHtml(issue.description || '');
    const safeIssueResolution = escapeHtml(issue.resolution || '');
    const safeOutcomeAction = escapeHtml(String(issue.outcome_action || '').replace(/_/g, ' '));
    const safeOutcomeNotes = escapeHtml(issue.outcome_notes || '');
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
            <h3 class="text-xl font-bold">${safeIssueType}</h3>
            <span class="badge badge-${statusColors[issueStatus] || 'secondary'}">
              ${issueStatus.replace('_', ' ').toUpperCase()}
            </span>
          </div>
          
          <div class="border-t pt-4">
            <h4 class="font-semibold mb-2">Order Information</h4>
            <p class="text-sm"><i class="bi bi-receipt"></i> Order #${issue.order?.order_number || 'N/A'}</p>
            <p class="text-sm"><i class="bi bi-cash"></i> ${formatCurrency(issue.order?.total_amount || 0)}</p>
            <p class="text-sm"><i class="bi bi-flag"></i> Priority: ${(issue.priority || 'medium').toUpperCase()}</p>
            ${issue.sla_due_at ? `<p class="text-sm"><i class="bi bi-alarm"></i> SLA Due: ${formatRelativeTime(issue.sla_due_at)}</p>` : ''}
            ${issueStatus === 'under_review' ? `<p class="text-sm"><i class="bi bi-exclamation-circle"></i> SLA: ${issue.is_overdue ? 'OVERDUE' : 'On Track'}</p>` : ''}
          </div>
          
          <div class="border-t pt-4">
            <h4 class="font-semibold mb-2">Description</h4>
            <p class="text-sm text-gray-700">${safeIssueDescription}</p>
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
                <p class="text-sm text-blue-900">${safeIssueResolution}</p>
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
        <button class="btn btn-outline" data-modal-close>Close</button>
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
      document.querySelectorAll('.issue-filter').forEach(b => b.classList.remove('active'));
      newBtn.classList.add('active');
      issueFilters.status = newBtn.dataset.status;
      saveBuyerUiState();
      loadMyIssues();
    });
  });
};

window.resetIssueFilters = () => {
  issueFilters.status = 'all';
  issueFilters.search = '';
  issueFilters.sort = 'newest';
  applyIssueFiltersToUi();
  saveBuyerUiState();
  loadMyIssues();
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
  if (onlineStatusRenderQueued) return;
  onlineStatusRenderQueued = true;

  requestAnimationFrame(() => {
    onlineStatusRenderQueued = false;

    // Re-render from cached data to avoid API spam on frequent presence events
    if (currentPage === 'messaging') {
      const conversationsList = document.getElementById('conversations-list');
      if (conversationsList) {
        renderConversationsList(conversationsList);
      }
    }

    // Update chat header status using online-status module
    const headerStatus = document.getElementById('chat-status');
    if (headerStatus && headerStatus.dataset.userId) {
      const userId = headerStatus.dataset.userId;
      const statusBadge = onlineStatusApi.createStatusBadge(userId, 'User');
      headerStatus.innerHTML = '';
      headerStatus.appendChild(statusBadge);
    }
  });
};

// ============ Messaging ============

const loadConversations = async () => {
  const container = document.getElementById('conversations-list');
  if (container) {
    renderConversationSkeletons(isDesktopBuyerViewport() ? 6 : 4);
  }

  // First, update the conversations data in the background
  const loaded = await updateConversationsData();

  // Then render if container exists
  if (!container) return;

  if (!loaded && currentConversations.length === 0) {
    container.innerHTML = renderSectionErrorState({
      title: 'Failed to load conversations',
      retryHandler: 'window.loadConversationsFromUI?.()'
    });
    return;
  }

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
    return true;
  } catch (error) {
    console.error('Error updating conversations data:', error);
    return false;
  }
};

const setConversationTypingPreview = (orderId, isTyping, displayName = 'Seller') => {
  const key = orderId ? String(orderId) : '';
  if (!key) return;

  const existingTimer = typingPreviewTimers.get(key);
  if (existingTimer) {
    clearTimeout(existingTimer);
    typingPreviewTimers.delete(key);
  }

  if (isTyping) {
    const safeName = (displayName || 'Seller').trim() || 'Seller';
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
    container.innerHTML = renderSectionEmptyState({
      icon: 'chat-left-text',
      title: currentConversations.length === 0 ? 'No conversations yet' : 'No conversations matched your filter',
      subtitle: currentConversations.length === 0
        ? 'Start chatting from your orders.'
        : 'Try adjusting search text or unread-only filter.',
      primaryActionHtml: '<button class="btn btn-outline btn-sm" onclick="window.resetConversationFilters?.()">Reset Filters</button>'
    });
    return;
  }

  container.innerHTML = filteredConversations.map(conv => {
    const userId = conv.other_party_id;
    const safeUserId = escapeHtml(String(userId || ''));
    const orderId = String(conv.order_id || '');
    const safeOrderId = escapeHtml(orderId);
    const encodedOrderId = encodeURIComponent(orderId);
    const safeOtherParty = escapeHtml(conv.other_party || 'Seller');
    const conversationOrderIds = Array.isArray(conv.order_ids) && conv.order_ids.length
      ? conv.order_ids.map(String)
      : [orderId];
    const safeOrderIdsCsv = escapeHtml((conv.order_ids || []).map(String).join(','));
    const safeActiveOrderIdsCsv = escapeHtml((conv.active_order_ids || []).map(String).join(','));
    const activeThreadOrderIds = currentConversationOrderIds.map(String);
    const isActiveConversation = conversationOrderIds.some(id => activeThreadOrderIds.includes(id))
      || String(currentConversation) === String(conv.order_id);
    const typingDisplayName = typingPreviewByOrderId.get(String(conv.order_id));
    const previewText = typingDisplayName
      ? `${typingDisplayName} is typing...`
      : (conv.last_message || 'No messages yet');
    const safePreviewText = escapeHtml(previewText);
    const orderNumber = conv.order_number || `ORD-${String(conv.order_id || '').padStart(6, '0')}`;
    const relativeTime = formatConversationTimestamp(conv);
    const previewClass = typingDisplayName
      ? 'text-sm text-primary truncate italic'
      : 'text-sm text-gray-600 truncate';
    return `
    <div class="conversation-item buyer-conversation-item p-3 hover:bg-gray-100 cursor-pointer rounded-lg ${isActiveConversation ? 'is-active' : ''}"
         data-order-id="${safeOrderId}"
         data-user-id="${safeUserId}"
         data-order-count="${conv.order_count || 1}"
         data-active-order-count="${conv.active_order_count || 0}"
         data-order-number="${escapeHtml(orderNumber)}"
         data-order-ids="${safeOrderIdsCsv}"
         data-active-order-ids="${safeActiveOrderIdsCsv}"
         onclick="window.openConversation(decodeURIComponent('${encodedOrderId}'))">
      <div class="buyer-conversation-row">
        <div class="buyer-conversation-main">
          <div class="buyer-conversation-topline">
            <p class="font-semibold buyer-conversation-name">${safeOtherParty}</p>
            <span class="status-badge-container" data-user-id="${safeUserId}"></span>
            ${relativeTime ? `<span class="buyer-conversation-time">${escapeHtml(relativeTime)}</span>` : ''}
          </div>
          <div class="buyer-conversation-meta-row">
            <span class="buyer-conversation-order-chip">${escapeHtml(orderNumber)}</span>
            ${Number(conv.order_count || 0) > 1 ? `<span class="buyer-conversation-thread-count">${Number(conv.order_count)} orders</span>` : ''}
          </div>
          <p class="${previewClass}" data-conversation-preview="${safeOrderId}">${safePreviewText}</p>
        </div>
        ${conv.unread_count > 0 ? `
          <span class="badge badge-danger buyer-conversation-unread" data-conversation-badge="${safeOrderId}">${conv.unread_count}</span>
        ` : `
          <span class="badge badge-danger buyer-conversation-unread" data-conversation-badge="${safeOrderId}" style="display: none;"></span>
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
        const badge = onlineStatusApi.createStatusBadge(userId);
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
  const target = [...currentConversations]
    .sort((a, b) => getConversationSortTimestamp(b) - getConversationSortTimestamp(a))
    .find((conv) => Number(conv.unread_count || 0) > 0)
    || [...currentConversations].sort((a, b) => getConversationSortTimestamp(b) - getConversationSortTimestamp(a))[0];
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

  // Store userId globally to ensure consistency in openOrderChat
  window.conversationUserId = userId;
  window.currentConversationMeta = {
    sourceOrderId: orderId,
    orderCount,
    activeOrderCount,
    orderIds,
    activeOrderIds
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

    renderChatWindowSkeleton();

    try {
      const conversationMeta = window.currentConversationMeta || null;
      const threadOrderIds = (conversationMeta?.sourceOrderId === orderId && conversationMeta?.orderIds?.length)
        ? conversationMeta.orderIds
        : [orderId];
      const activeThreadOrderIds = (conversationMeta?.sourceOrderId === orderId && conversationMeta?.activeOrderIds?.length)
        ? conversationMeta.activeOrderIds
        : [];

      // Mark messages as read immediately when opening conversation
      try {
        await Promise.allSettled(threadOrderIds.map(id => markMessagesAsRead(id)));
        updateConversationBadge(orderId);

        // Immediately update navbar badge
        updateMessageBadge();
      } catch (error) {
        console.error('Failed to mark messages as read:', error);
      }

      currentConversationOrderIds = threadOrderIds;
      currentConversationSendOrderId = activeThreadOrderIds[0] || orderId;
      applyActiveConversationHighlight();

      // Join all order rooms in grouped conversation so real-time updates cover every order in this thread.
      try {
        const { default: socketService } = await import('../services/socket.service.js');
        threadOrderIds.forEach(id => socketService.joinConversation(id));
      } catch (error) {
        console.warn('Failed to join grouped conversation rooms:', error);
      }

      // Get fresh message data from all orders in this grouped conversation
      const messageResponses = await Promise.allSettled(
        threadOrderIds.map(id => getOrderMessages(id))
      );
      const successfulResponses = messageResponses
        .filter(result => result.status === 'fulfilled')
        .map(result => result.value);
      const response = successfulResponses[0] || await getOrderMessages(orderId);
      const messages = mergeConversationMessages(successfulResponses);
      const userRole = response.data?.user_role || 'buyer';
      const activeConversation = currentConversations.find(conv => conv.order_id === orderId);
      window.currentConversationUnreadCount = Number(activeConversation?.unread_count || 0);
      const activeOrderCount = activeConversation?.active_order_count ?? activeThreadOrderIds.length;
      const activeOrderNumber = activeConversation?.order_number || response?.data?.order_number || `ORD-${String(orderId).padStart(6, '0')}`;
      const headerStatusLabel = activeOrderCount === 0 ? 'Order Closed' : 'Active';
      const isCancelled = activeOrderCount === 0;

      chatWindow.innerHTML = `
        <div class="buyer-chat-shell flex flex-col">
          <div class="border-b p-4 bg-gray-50" id="chat-header">
            <div class="flex justify-between items-center gap-2">
              <div class="flex items-center gap-2 min-w-0">
                <button type="button" class="btn btn-outline btn-sm buyer-chat-back" id="chat-back-btn" aria-label="Back to conversations">
                  <i class="bi bi-chevron-left"></i>
                </button>
                <div class="buyer-chat-title-wrap">
                  <h3 class="font-bold text-lg" id="chat-user-name">Seller</h3>
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
                         placeholder="Message seller about ${escapeHtml(activeOrderNumber)}...">
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

      // Update chat header with seller info
      const headerName = document.getElementById('chat-user-name');
      if (headerName) {
        const sellerName = (
          response.data?.seller_name
          || activeConversation?.other_party
          || currentConversations.find(conv =>
            String(conv.order_id) === String(orderId)
          )?.other_party
          || 'Seller'
        );
        headerName.textContent = sellerName;
      }

      // Auto-scroll to bottom
      const messagesContainer = document.getElementById('chat-messages');
      if (messagesContainer) {
        setupLazyMessageRendering(messagesContainer, messages, userRole);
        scrollChatToBottom(messagesContainer);
      }
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
      setupMessageAttachmentUI();
      setupTypingInputHandlers();
      hideTypingIndicator();
      syncMessagingPanelsVisibility();

    } catch (error) {
      console.error('Error loading messages:', error);
      showError('Failed to load messages');
    }
  }, 100);
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

const updateMessageComposerHint = (text = '', mode = 'neutral') => {
  const hint = document.getElementById('message-send-hint');
  if (!hint) return;
  hint.textContent = text || 'Messages are sent securely.';
  hint.classList.remove('is-error', 'is-muted');
  if (mode === 'error') hint.classList.add('is-error');
  if (mode === 'muted') hint.classList.add('is-muted');
};

const updateMessageCharCounter = () => {
  const input = document.getElementById('message-input');
  const counter = document.getElementById('message-char-counter');
  if (!input || !counter) return;
  const length = (input.value || '').length;
  counter.textContent = `${length}/500`;
  counter.classList.toggle('is-near-limit', length >= 450);
};

const setMessageSendingState = (isSending) => {
  const sendBtn = document.getElementById('btn-send-message');
  const input = document.getElementById('message-input');
  const attachBtn = document.getElementById('btn-attach-message');
  if (!sendBtn) return;
  sendBtn.disabled = Boolean(isSending);
  if (input) input.disabled = Boolean(isSending);
  if (attachBtn) attachBtn.disabled = Boolean(isSending);
  sendBtn.innerHTML = isSending
    ? '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> <span class="buyer-send-label">Sending...</span>'
    : '<i class="bi bi-send"></i> <span class="buyer-send-label">Send</span>';
};

window.retryLastFailedMessage = async () => {
  if (!lastFailedMessageDraft || isSendingMessage) return;
  const input = document.getElementById('message-input');
  if (!input) return;
  input.value = lastFailedMessageDraft.messageText || '';
  selectedMessageAttachment = lastFailedMessageDraft.attachment || null;
  if (selectedMessageAttachment) {
    const preview = document.getElementById('message-attachment-preview');
    if (preview) {
      preview.classList.remove('hidden');
      preview.innerHTML = `
        <div class="flex items-center justify-between bg-blue-50 border border-blue-200 rounded px-3 py-2 text-sm">
          <span class="truncate pr-3"><i class="bi bi-image"></i> ${escapeHtml(selectedMessageAttachment.name)}</span>
          <button type="button" class="text-danger" id="btn-remove-attachment" title="Remove image">
            <i class="bi bi-x-circle"></i>
          </button>
        </div>
      `;
    }
  }
  updateMessageCharCounter();
  await handleSendMessage({ preventDefault: () => {} });
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
  input.addEventListener('input', (event) => {
    handleTypingInput(event);
    updateMessageCharCounter();
  });
  input.addEventListener('blur', () => {
    stopTypingSignal();
  });
  updateMessageCharCounter();
};

const hideTypingIndicator = () => {
  const indicator = document.getElementById('typing-indicator');
  if (!indicator) return;
  indicator.classList.add('hidden');
};

const showTypingIndicator = (displayName = 'Seller') => {
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
  e?.preventDefault?.();
  if (isSendingMessage) return;

  const input = document.getElementById('message-input');
  const fileInput = document.getElementById('message-attachment');
  if (!input) return;
  const messageText = input.value.trim();
  const attachment = selectedMessageAttachment || fileInput?.files?.[0] || null;

  if (!messageText && !attachment) return;

  isSendingMessage = true;
  setMessageSendingState(true);
  updateMessageComposerHint('Sending message...', 'muted');
  lastFailedMessageDraft = null;

  // Clear input immediately
  input.value = '';
  if (fileInput) {
    fileInput.value = '';
  }
  stopTypingSignal();
  hideTypingIndicator();
  selectedMessageAttachment = null;
  clearMessageAttachmentUI();
  updateMessageCharCounter();

  try {
    const targetOrderId = currentConversationSendOrderId || currentConversation;
    if (!targetOrderId) {
      showError('No active order available for this conversation');
      input.value = messageText;
      updateMessageCharCounter();
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
        role: 'buyer'
      },
      message_text: messageText || (attachment ? 'Sent an attachment.' : ''),
      created_at: new Date().toISOString()
    };
    addMessageBubbleToChat(optimisticMessage);
    await loadConversations();
    updateMessageComposerHint('Message delivered.', 'muted');

    // Focus input for next message
    setTimeout(() => {
      const newInput = document.getElementById('message-input');
      if (newInput) {
        newInput.focus();
      }
    }, 50);

  } catch (error) {
    console.error('Error sending message:', error);
    showError(error.message || 'Failed to send message');
    updateMessageComposerHint('Failed to send. You can retry.', 'error');
    lastFailedMessageDraft = { messageText, attachment };
    // Restore message if send failed
    input.value = messageText;
    updateMessageCharCounter();
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
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
      chatMessages.insertAdjacentHTML('beforeend', `
        <div class="flex justify-end buyer-chat-row">
          <div class="bg-primary text-white rounded-lg px-4 py-2 max-w-xs">
            ${messageText ? `<p class="text-sm">${escapeHtml(messageText)}</p>` : '<p class="text-sm italic">Attachment message</p>'}
            <div class="buyer-chat-bubble-meta">
              <p class="text-xs opacity-75 mt-1">just now</p>
              <button type="button" class="buyer-chat-retry-btn" onclick="window.retryLastFailedMessage?.()">Failed • Retry</button>
            </div>
          </div>
        </div>
      `);
      scrollChatToBottom(chatMessages);
    }
  } finally {
    isSendingMessage = false;
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
    await Promise.all([hydrateOnlineStatusApi(), hydrateLiveUpdatesApi()]);
    onlineStatusApi.initOnlineStatus();

    // Initialize live order updates
    liveUpdatesApi.initLiveUpdates();

    // Register callback to reload orders on real-time updates
    liveUpdatesApi.onUpdate((data) => {
      console.log('Order updated, reloading orders...', data);
      if (typeof loadOrders === 'function') {
        loadOrders();
      }
      loadOrderStats();
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
        playMessageSoundLazy().catch(() => {});
      };

      // IMPORTANT: Register all socket listeners immediately
      // The socket will connect in the background and fire events when ready

      // Listen for initial online users list when socket connects
      onInitialOnlineUsers((data) => {
        if (data.onlineUsers && Array.isArray(data.onlineUsers)) {
          onlineStatusApi.setInitialOnlineUsers(data.onlineUsers);
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
        const remoteName = (data.userName || data.senderName || document.getElementById('chat-user-name')?.textContent || 'Seller').trim() || 'Seller';
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
            // User is viewing the conversation, add the message to chat
            hideTypingIndicator();
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

      // Listen for direct notification events (covers messages from conversations not currently joined via socket rooms)
      onNotification((data) => {
        if (data.type === 'new_message' || data.type === 'message') {
          updateMessageBadge();

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

      // Listen for order updates
      on('order:updated', (data) => {
        showToast(`Order #${data.order_number} status: ${data.status}`, 'info');
        loadOrderStats();
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
  if (!chatMessages) return;

  // Get current user from auth
  const currentUser = getCurrentUserSync();
  const currentUserId = currentUser?.id;
  const normalized = {
    ...message,
    sender: {
      ...(message?.sender || {}),
      role: message?.sender?.role || (message?.sender_id === currentUserId ? 'buyer' : 'seller')
    }
  };
  const bubble = createMessageBubble(normalized, 'buyer');

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

const closeTopModalBackdrop = () => {
  const topBackdrop = document.querySelector('.modal-backdrop:last-of-type');
  if (!topBackdrop) return;
  if (typeof closeModal === 'function') {
    closeModal(topBackdrop);
    return;
  }
  topBackdrop.remove();
};

// ============ Event Listeners ============

let eventListeners = [];

const attachEventListeners = () => {
  const bindTap = (element, handler) => {
    if (!element || typeof handler !== 'function') return;
    const wrappedHandler = (event) => {
      if (event.type === 'touchend') {
        event.preventDefault();
      }
      handler(event);
    };
    element.addEventListener('click', wrappedHandler);
    eventListeners.push({ element, event: 'click', handler: wrappedHandler });
    element.addEventListener('touchend', wrappedHandler, { passive: false });
    eventListeners.push({ element, event: 'touchend', handler: wrappedHandler });
  };

  const browseFiltersToggle = document.getElementById('browse-filters-toggle');
  const browseDesktopFiltersToggle = document.getElementById('browse-filters-toggle-desktop');
  const toggleFiltersHandler = () => {
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
    if (isDesktop) {
      browseDesktopFiltersHidden = !browseDesktopFiltersHidden;
    } else {
      browseFiltersCollapsed = !browseFiltersCollapsed;
    }
    saveBuyerUiState();
    refreshBrowseDesktopUiImmediate();
  };

  [browseFiltersToggle, browseDesktopFiltersToggle].forEach((toggle) => {
    bindTap(toggle, toggleFiltersHandler);
  });

  const resizeHandler = () => {
    applyBrowseFiltersCollapsedState();
    syncBrowseDesktopFiltersStickyFallback();
    updateBrowseBackToTopVisibility();
    applyCartSummaryStickyState();
  };
  window.addEventListener('resize', resizeHandler);
  eventListeners.push({ element: window, event: 'resize', handler: resizeHandler });

  const scrollStickyFallbackHandler = () => {
    syncBrowseDesktopFiltersStickyFallback();
    updateBrowseBackToTopVisibility();
    applyCartSummaryStickyState();
  };
  window.addEventListener('scroll', scrollStickyFallbackHandler, { passive: true });
  eventListeners.push({ element: window, event: 'scroll', handler: scrollStickyFallbackHandler });

  const browseBackToTopBtn = document.getElementById('browse-back-to-top-btn');
  if (browseBackToTopBtn) {
    const backToTopHandler = () => scrollBrowseToTop();
    browseBackToTopBtn.addEventListener('click', backToTopHandler);
    eventListeners.push({ element: browseBackToTopBtn, event: 'click', handler: backToTopHandler });
  }

  const resizeOrderStatsHandler = () => applyOrdersStatsCollapsedState();
  window.addEventListener('resize', resizeOrderStatsHandler);
  eventListeners.push({ element: window, event: 'resize', handler: resizeOrderStatsHandler });

  const resizeIssueStatsHandler = () => applyIssuesStatsCollapsedState();
  window.addEventListener('resize', resizeIssueStatsHandler);
  eventListeners.push({ element: window, event: 'resize', handler: resizeIssueStatsHandler });

  const orderStatsToggle = document.getElementById('orders-stats-toggle');
  if (orderStatsToggle) {
    const orderStatsToggleHandler = () => {
      ordersStatsCollapsed = !ordersStatsCollapsed;
      saveBuyerUiState();
      applyOrdersStatsCollapsedState();
    };
    orderStatsToggle.addEventListener('click', orderStatsToggleHandler);
    eventListeners.push({ element: orderStatsToggle, event: 'click', handler: orderStatsToggleHandler });
  }

  const issuesStatsToggle = document.getElementById('issues-stats-toggle');
  if (issuesStatsToggle) {
    const issuesStatsToggleHandler = () => {
      issuesStatsCollapsed = !issuesStatsCollapsed;
      saveBuyerUiState();
      applyIssuesStatsCollapsedState();
    };
    issuesStatsToggle.addEventListener('click', issuesStatsToggleHandler);
    eventListeners.push({ element: issuesStatsToggle, event: 'click', handler: issuesStatsToggleHandler });
  }

  // Browse search
  const searchInput = document.getElementById('browse-search');
  if (searchInput) {
    const searchHandler = debounce((e) => {
      draftBrowseFilters.search = e.target.value;
      applyBrowseFilters({ resetPage: true });
    }, 300);
    searchInput.addEventListener('input', searchHandler);
    eventListeners.push({ element: searchInput, event: 'input', handler: searchHandler });
  }

  // Browse category filter
  const categorySelect = document.getElementById('browse-category');
  if (categorySelect) {
    const categoryHandler = (e) => {
      draftBrowseFilters.category = e.target.value;
    };
    categorySelect.addEventListener('change', categoryHandler);
    eventListeners.push({ element: categorySelect, event: 'change', handler: categoryHandler });
  }

  // Browse municipality filter
  const municipalitySelect = document.getElementById('browse-municipality');
  if (municipalitySelect) {
    const municipalityHandler = (e) => {
      draftBrowseFilters.municipality = e.target.value;
    };
    municipalitySelect.addEventListener('change', municipalityHandler);
    eventListeners.push({ element: municipalitySelect, event: 'change', handler: municipalityHandler });
  }

  // Product tags checkboxes
  document.querySelectorAll('.product-tag-checkbox').forEach(checkbox => {
    const tagHandler = (e) => {
      const tag = e.target.value;
      if (e.target.checked) {
        if (!draftBrowseFilters.tags.includes(tag)) {
          draftBrowseFilters.tags.push(tag);
        }
      } else {
        draftBrowseFilters.tags = draftBrowseFilters.tags.filter(t => t !== tag);
      }
    };
    checkbox.addEventListener('change', tagHandler);
    eventListeners.push({ element: checkbox, event: 'change', handler: tagHandler });
  });

  // Clear filters button
  const clearFiltersBtn = document.getElementById('clear-filters');
  if (clearFiltersBtn) {
    const clearHandler = async () => {
      clearAllFilters({ reload: false });
      await applyBrowseFilters({ resetPage: true });
    };
    clearFiltersBtn.addEventListener('click', clearHandler);
    eventListeners.push({ element: clearFiltersBtn, event: 'click', handler: clearHandler });
  }

  const applyFiltersBtn = document.getElementById('apply-filters');
  if (applyFiltersBtn) {
    const applyHandler = () => applyBrowseFilters({ resetPage: true });
    applyFiltersBtn.addEventListener('click', applyHandler);
    eventListeners.push({ element: applyFiltersBtn, event: 'click', handler: applyHandler });
  }

  const resetFiltersBtn = document.getElementById('reset-filters');
  if (resetFiltersBtn) {
    const resetHandler = async () => {
      clearAllFilters({ reload: false });
      await applyBrowseFilters({ resetPage: true });
    };
    resetFiltersBtn.addEventListener('click', resetHandler);
    eventListeners.push({ element: resetFiltersBtn, event: 'click', handler: resetHandler });
  }

  // View toggle buttons
  const gridBtn = document.getElementById('view-grid');
  if (gridBtn) {
    const gridHandler = () => toggleView('grid');
    bindTap(gridBtn, gridHandler);
  }

  const mapBtn = document.getElementById('view-map');
  if (mapBtn) {
    const mapHandler = () => toggleView('map');
    bindTap(mapBtn, mapHandler);
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
      syncDraftFiltersFromApplied();
      saveBuyerUiState();
      loadBrowseProducts();
      if (currentView === 'map') {
        loadProductsOnMap();
      }
    };
    sortSelect.addEventListener('change', sortHandler);
    eventListeners.push({ element: sortSelect, event: 'change', handler: sortHandler });
  }

  const useMapBoundsCheckbox = document.getElementById('use-map-bounds');
  if (useMapBoundsCheckbox) {
    const mapBoundsHandler = (e) => {
      useMapBounds = Boolean(e.target.checked);
      pendingMapBounds = useMapBounds && browseMap ? browseMap.getBounds() : null;
      if (useMapBounds) {
        toggleMapSearchPrompt(true);
      } else {
        toggleMapSearchPrompt(false);
        loadProductsOnMap();
      }
    };
    useMapBoundsCheckbox.addEventListener('change', mapBoundsHandler);
    eventListeners.push({ element: useMapBoundsCheckbox, event: 'change', handler: mapBoundsHandler });
  }

  const searchMapAreaBtn = document.getElementById('search-map-area');
  if (searchMapAreaBtn) {
    const searchAreaHandler = async () => {
      if (!browseMap) return;
      pendingMapBounds = browseMap.getBounds();
      await loadProductsOnMap();
    };
    searchMapAreaBtn.addEventListener('click', searchAreaHandler);
    eventListeners.push({ element: searchMapAreaBtn, event: 'click', handler: searchAreaHandler });
  }

  const resetMapAreaBtn = document.getElementById('reset-map-area');
  if (resetMapAreaBtn) {
    const resetMapHandler = async () => {
      await resetMapAreaView();
    };
    resetMapAreaBtn.addEventListener('click', resetMapHandler);
    eventListeners.push({ element: resetMapAreaBtn, event: 'click', handler: resetMapHandler });
  }

  const escapeHandler = (event) => {
    if (event.key !== 'Escape') return;
    if (browseMap) {
      browseMap.closePopup();
    }
    const staticModal = document.getElementById('product-details-modal');
    if (staticModal && !staticModal.classList.contains('hidden')) {
      closeProductDetailsModal();
      return;
    }
    const topBackdrop = document.querySelector('.modal-backdrop:last-of-type');
    if (topBackdrop && topBackdrop.id !== 'product-details-modal') {
      closeModal(topBackdrop);
    }
  };
  window.addEventListener('keydown', escapeHandler);
  eventListeners.push({ element: window, event: 'keydown', handler: escapeHandler });

  const issuesSearch = document.getElementById('issues-search');
  if (issuesSearch) {
    const issuesSearchHandler = debounce((e) => {
      issueFilters.search = (e.target.value || '').trim();
      saveBuyerUiState();
      if (currentPage === 'my-issues') loadMyIssues();
    }, 240);
    issuesSearch.addEventListener('input', issuesSearchHandler);
    eventListeners.push({ element: issuesSearch, event: 'input', handler: issuesSearchHandler });
  }

  const issuesSort = document.getElementById('issues-sort');
  if (issuesSort) {
    const issuesSortHandler = (e) => {
      issueFilters.sort = e.target.value || 'newest';
      saveBuyerUiState();
      if (currentPage === 'my-issues') loadMyIssues();
    };
    issuesSort.addEventListener('change', issuesSortHandler);
    eventListeners.push({ element: issuesSort, event: 'change', handler: issuesSortHandler });
  }

  // Conversation search filter
  const conversationSearch = document.getElementById('conversation-search');
  const conversationSearchClear = document.getElementById('conversation-search-clear');
  if (conversationSearch) {
    const conversationSearchHandler = debounce((e) => {
      conversationFilters.search = e.target.value || '';
      saveBuyerUiState();
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

  // Conversation unread-only filter
  const conversationUnreadOnly = document.getElementById('conversation-unread-only');
  if (conversationUnreadOnly) {
    const unreadOnlyHandler = (e) => {
      conversationFilters.unreadOnly = Boolean(e.target.checked);
      saveBuyerUiState();
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
      saveBuyerUiState();
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
      saveBuyerUiState();
      if (currentPage === 'messaging') {
        const container = document.getElementById('conversations-list');
        if (container) renderConversationsList(container);
      }
    };
    conversationSearchClear.addEventListener('click', conversationSearchClearHandler);
    eventListeners.push({ element: conversationSearchClear, event: 'click', handler: conversationSearchClearHandler });
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
      orderFilters.page = 1;
      saveBuyerUiState();
      loadOrders();
    });
  });
};

window.resetOrderFilters = () => {
  orderFilters.status = 'all';
  orderFilters.page = 1;
  saveBuyerUiState();
  loadOrders();
};

window.loadOrdersFromUI = () => {
  loadOrders();
};

window.loadCartFromUI = () => {
  loadCart();
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
  saveBuyerUiState();
  if (currentPage === 'messaging') {
    const container = document.getElementById('conversations-list');
    if (container) renderConversationsList(container);
  }
};

window.backToConversationList = () => {
  setMessagingMobileView('list');
};

window.clearBrowseFilters = () => {
  clearAllFilters({ reload: false });
  applyBrowseFilters({ resetPage: true });
};

window.loadBrowseProductsFromUI = () => {
  loadBrowseProducts();
};

window.refreshBuyerLocation = async () => {
  userLocation = null;
  await getUserLocation();
  showToast('Location refreshed.', 'success');
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
  stopCartSummaryStickyEnforcer();

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
  onlineStatusApi.cleanup();
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

    const response = await getProduct(productId);
    const product = response?.data?.product;

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

    const response = await getProduct(productId);
    const product = response?.data?.product;

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

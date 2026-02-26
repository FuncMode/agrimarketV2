// assets/js/features/notifications/notification-center.js
import { getMyNotifications, markAsRead, markAllAsRead, deleteNotification } from '../../services/notification.service.js';
import { createModal } from '../../components/modal.js';
import { formatRelativeTime } from '../../utils/formatters.js';
import { showToast } from '../../components/toast.js';
import { updateUnreadCount } from '../../components/notification-bell.js';

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const escapeAttribute = (value = '') => escapeHtml(value).replace(/`/g, '&#96;');

const NOTIFICATION_FILTERS = {
  ALL: 'all',
  UNREAD: 'unread',
  ORDERS: 'orders'
};

const LOADING_SKELETON_COUNT = 5;

const truncateOrderId = (orderId = '') => {
  const normalized = String(orderId || '').trim();
  if (!normalized) return '';
  if (normalized.length <= 12) return normalized;
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
};

const getNotificationOrderId = (notification = {}) => {
  const direct = notification.order_id || notification.orderId || notification?.metadata?.order_id;
  if (direct) return String(direct);

  const source = `${notification.title || ''} ${notification.message || ''}`;
  const match = source.match(/ORD-[A-Z0-9-]+/i);
  return match ? match[0] : '';
};

const getDateGroupLabel = (dateInput) => {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return 'Earlier';

  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffInDays = Math.floor((startToday - startTarget) / (1000 * 60 * 60 * 24));

  if (diffInDays <= 0) return 'Today';
  if (diffInDays === 1) return 'Yesterday';
  return 'Earlier';
};

const getFilteredNotifications = (notifications, activeFilter) => {
  if (activeFilter === NOTIFICATION_FILTERS.UNREAD) {
    return notifications.filter(item => !item.is_read);
  }
  if (activeFilter === NOTIFICATION_FILTERS.ORDERS) {
    return notifications.filter(item => item.type === 'order' || Boolean(getNotificationOrderId(item)));
  }
  return notifications;
};

const groupNotificationsByDate = (notifications = []) => {
  const grouped = { Today: [], Yesterday: [], Earlier: [] };
  notifications.forEach((notification) => {
    const label = getDateGroupLabel(notification.created_at);
    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(notification);
  });
  return grouped;
};

const createNotificationStyles = () => `
  <style>
    .notification-center-layout {
      display: flex;
      flex-direction: column;
      height: min(68vh, 620px);
      overflow: hidden;
    }
    .notification-center-header {
      position: sticky;
      top: 0;
      z-index: 5;
      background: #fff;
      border-bottom: 1px solid #e5e7eb;
      padding: 0.75rem 0 0.9rem;
    }
    .notification-center-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin-bottom: 0.75rem;
    }
    .notification-filter-row {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .notification-filter-tab {
      border: 1px solid #d1d5db;
      background: #fff;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 600;
      color: #4b5563;
      padding: 0.35rem 0.75rem;
      transition: all 0.2s ease;
    }
    .notification-filter-tab.is-active {
      border-color: #16a34a;
      color: #166534;
      background: #f0fdf4;
    }
    .notification-filter-tab:focus-visible,
    .notification-item:focus-visible,
    .notification-content:focus-visible,
    .btn-delete-notification:focus-visible,
    .notification-order-link:focus-visible,
    #btn-mark-all-read:focus-visible,
    .modal-close:focus-visible {
      outline: 2px solid #16a34a;
      outline-offset: 2px;
    }
    .notification-feed {
      flex: 1;
      overflow-y: auto;
      padding-right: 0.25rem;
    }
    .notification-group-title {
      position: sticky;
      top: 0;
      z-index: 2;
      background: linear-gradient(180deg, #ffffff 85%, rgba(255,255,255,0.88) 100%);
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #4b5563;
      padding: 0.6rem 0 0.35rem;
      margin-top: 0.35rem;
    }
    .notification-item {
      transition: all 0.22s ease;
      border: 1px solid #e5e7eb;
      background: #ffffff;
    }
    .notification-item.unread {
      border-color: #86efac;
      background: #f0fdf4;
      box-shadow: inset 0 0 0 1px rgba(34, 197, 94, 0.1);
    }
    .notification-item:hover {
      border-color: #cbd5e1;
      transform: translateY(-1px);
    }
    .notification-message {
      font-size: 0.9rem;
      line-height: 1.45;
      color: #374151;
      margin-top: 0.15rem;
      word-break: break-word;
    }
    .notification-time {
      font-size: 0.75rem;
      color: #6b7280;
      margin-top: 0.4rem;
    }
    .notification-order-id {
      display: inline-block;
      max-width: 12ch;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      vertical-align: bottom;
      font-weight: 700;
      color: #166534;
      background: #dcfce7;
      border-radius: 0.35rem;
      padding: 0.05rem 0.35rem;
      margin-left: 0.2rem;
    }
    .notification-actions {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      margin-top: 0.5rem;
    }
    .notification-order-link {
      border: 0;
      background: transparent;
      color: #166534;
      font-size: 0.78rem;
      font-weight: 700;
      padding: 0;
      text-decoration: underline;
      cursor: pointer;
    }
    .notification-unread-dot {
      width: 0.45rem;
      height: 0.45rem;
      border-radius: 999px;
      background: #16a34a;
      margin-top: 0.45rem;
      flex-shrink: 0;
    }
    .btn-delete-notification {
      opacity: 0;
      transition: opacity 0.2s ease;
    }
    .notification-item:hover .btn-delete-notification,
    .btn-delete-notification:focus-visible {
      opacity: 1;
    }
    .notification-empty-state {
      border: 1px dashed #d1d5db;
      border-radius: 0.75rem;
      color: #6b7280;
      text-align: center;
      padding: 2rem 1rem;
      margin-top: 0.5rem;
      background: #f9fafb;
    }
    .notification-skeleton-list {
      display: grid;
      gap: 0.75rem;
      margin-top: 0.2rem;
    }
    .notification-skeleton-item {
      border-radius: 0.75rem;
      border: 1px solid #e5e7eb;
      padding: 0.9rem;
      background: #fff;
      overflow: hidden;
      position: relative;
    }
    .notification-skeleton-item::after {
      content: '';
      position: absolute;
      inset: 0;
      transform: translateX(-100%);
      background: linear-gradient(90deg, transparent, rgba(148, 163, 184, 0.16), transparent);
      animation: notif-skeleton-slide 1.1s infinite;
    }
    .notification-skeleton-line {
      height: 0.6rem;
      border-radius: 0.35rem;
      background: #e5e7eb;
      margin-bottom: 0.5rem;
    }
    .notification-skeleton-line.w-55 { width: 55%; }
    .notification-skeleton-line.w-80 { width: 80%; }
    .notification-skeleton-line.w-35 { width: 35%; margin-bottom: 0; }
    #btn-mark-all-read[disabled] {
      cursor: not-allowed;
      opacity: 0.55;
    }
    @keyframes notif-skeleton-slide {
      100% { transform: translateX(100%); }
    }
    @media (max-width: 640px) {
      .notification-center-layout {
        height: min(74vh, 560px);
      }
      .notification-center-header {
        padding: 0.55rem 0 0.72rem;
      }
      .notification-center-meta {
        flex-direction: column;
        align-items: stretch;
        gap: 0.55rem;
        margin-bottom: 0.62rem;
      }
      #notifications-count-label {
        font-size: 0.88rem !important;
        line-height: 1.25;
      }
      #btn-mark-all-read {
        width: 100%;
        min-height: 38px;
        justify-content: center;
        font-size: 0.82rem;
        padding: 0.45rem 0.72rem;
      }
      .notification-filter-row {
        flex-wrap: nowrap;
        overflow-x: auto;
        gap: 0.38rem;
        padding-bottom: 0.2rem;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: thin;
      }
      .notification-filter-tab {
        flex: 0 0 auto;
        font-size: 0.76rem;
        padding: 0.34rem 0.62rem;
      }
      .notification-feed {
        padding-right: 0;
        padding-bottom: 0.28rem;
      }
      .notification-group-title {
        font-size: 0.72rem;
        padding: 0.5rem 0 0.28rem;
        margin-top: 0.22rem;
      }
      .notification-item {
        padding: 0.72rem !important;
        border-radius: 0.68rem;
      }
      .notification-item > .flex {
        gap: 0.62rem !important;
      }
      .notification-item > .flex > i.bi {
        font-size: 1.1rem !important;
        line-height: 1.1;
        margin-top: 0.1rem;
      }
      .notification-content {
        min-width: 0;
      }
      .notification-content > .font-semibold {
        font-size: 0.96rem;
        line-height: 1.25;
      }
      .notification-message {
        font-size: 0.86rem;
        line-height: 1.35;
        margin-top: 0.12rem;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
        overflow: hidden;
      }
      .notification-order-id {
        max-width: 15ch;
        margin-left: 0;
        margin-top: 0.25rem;
        font-size: 0.72rem;
      }
      .notification-actions {
        margin-top: 0.34rem;
      }
      .notification-order-link {
        font-size: 0.75rem;
      }
      .notification-time {
        margin-top: 0.3rem;
        font-size: 0.72rem;
      }
      .notification-unread-dot {
        margin-top: 0.36rem;
      }
      .btn-delete-notification {
        opacity: 0.72;
      }
      .btn-delete-notification i {
        font-size: 1rem !important;
      }
    }
  </style>
`;

const createLoadingSkeletonMarkup = () => `
  <div class="notification-skeleton-list" aria-hidden="true">
    ${Array.from({ length: LOADING_SKELETON_COUNT }).map(() => `
      <div class="notification-skeleton-item">
        <div class="notification-skeleton-line w-55"></div>
        <div class="notification-skeleton-line w-80"></div>
        <div class="notification-skeleton-line w-35"></div>
      </div>
    `).join('')}
  </div>
`;

const createCenterShellMarkup = () => `
  ${createNotificationStyles()}
  <div class="notification-center-layout">
    <div class="notification-center-header">
      <div class="notification-center-meta">
        <p id="notifications-count-label" class="text-sm text-gray-600">Loading notifications...</p>
        <button id="btn-mark-all-read" class="btn btn-sm btn-outline" disabled aria-label="Mark all unread notifications as read">
          <i class="bi bi-check-all"></i> Mark all as read
        </button>
      </div>
      <div class="notification-filter-row" role="tablist" aria-label="Notification filters">
        <button class="notification-filter-tab is-active" role="tab" aria-selected="true" data-filter="${NOTIFICATION_FILTERS.ALL}" type="button">All</button>
        <button class="notification-filter-tab" role="tab" aria-selected="false" data-filter="${NOTIFICATION_FILTERS.UNREAD}" type="button">Unread</button>
        <button class="notification-filter-tab" role="tab" aria-selected="false" data-filter="${NOTIFICATION_FILTERS.ORDERS}" type="button">Orders</button>
      </div>
    </div>
    <div id="notifications-feed" class="notification-feed" aria-live="polite">${createLoadingSkeletonMarkup()}</div>
  </div>
`;

const createDateGroupMarkup = (label, notifications) => {
  if (!notifications.length) return '';
  return `
    <section class="notification-group" aria-label="${escapeAttribute(label)} notifications">
      <h4 class="notification-group-title">${escapeHtml(label)}</h4>
      <div class="space-y-2">
        ${notifications.map(item => createNotificationItem(item)).join('')}
      </div>
    </section>
  `;
};

const createEmptyStateMarkup = (filterName) => {
  const copy = {
    [NOTIFICATION_FILTERS.ALL]: 'No notifications yet.',
    [NOTIFICATION_FILTERS.UNREAD]: 'No unread notifications.',
    [NOTIFICATION_FILTERS.ORDERS]: 'No order notifications yet.'
  };
  return `
    <div class="notification-empty-state" role="status">
      <i class="bi bi-inbox text-2xl mb-2 block" aria-hidden="true"></i>
      <p>${copy[filterName] || copy[NOTIFICATION_FILTERS.ALL]}</p>
    </div>
  `;
};

const updateFilterTabsUI = (activeFilter) => {
  document.querySelectorAll('.notification-filter-tab').forEach((tab) => {
    const isActive = tab.dataset.filter === activeFilter;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
};

const renderNotificationFeed = (notifications, activeFilter) => {
  const feed = document.getElementById('notifications-feed');
  const countLabel = document.getElementById('notifications-count-label');
  const btnMarkAll = document.getElementById('btn-mark-all-read');
  if (!feed) return;

  const filtered = getFilteredNotifications(notifications, activeFilter);
  const unreadCount = notifications.filter(item => !item.is_read).length;
  const filteredLabel = activeFilter === NOTIFICATION_FILTERS.ALL
    ? `${notifications.length} notification${notifications.length === 1 ? '' : 's'}`
    : `${filtered.length} shown of ${notifications.length}`;

  if (countLabel) countLabel.textContent = filteredLabel;
  if (btnMarkAll) btnMarkAll.disabled = unreadCount === 0;
  updateFilterTabsUI(activeFilter);

  if (filtered.length === 0) {
    feed.innerHTML = createEmptyStateMarkup(activeFilter);
    return;
  }

  const grouped = groupNotificationsByDate(filtered);
  feed.innerHTML = [
    createDateGroupMarkup('Today', grouped.Today || []),
    createDateGroupMarkup('Yesterday', grouped.Yesterday || []),
    createDateGroupMarkup('Earlier', grouped.Earlier || [])
  ].join('');
};

const trapFocusInModal = (container, event) => {
  if (event.key !== 'Tab') return;

  const focusable = [...container.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter(el => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true');

  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};

const showNotificationCenter = async () => {
  let notifications = [];
  let activeFilter = NOTIFICATION_FILTERS.ALL;

  const modal = createModal({
    title: 'Notifications',
    content: createCenterShellMarkup(),
    size: 'md'
  });

  const isMobileViewport = window.matchMedia('(max-width: 767px)').matches;
  modal.body.style.padding = isMobileViewport ? '0 0.9rem 0.85rem' : '0 1.5rem 1.1rem';
  modal.body.style.overflow = 'hidden';
  modal.body.style.maxHeight = isMobileViewport ? '78vh' : '72vh';

  const closeBtn = modal.modal.querySelector('.modal-close');
  if (closeBtn) {
    closeBtn.setAttribute('aria-label', 'Close notifications');
    closeBtn.setAttribute('title', 'Close');
  }

  const onModalKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      modal.close();
      return;
    }
    trapFocusInModal(modal.modal, event);
  };
  modal.backdrop.addEventListener('keydown', onModalKeyDown);

  const initializeEventHandlers = () => {
    const btnMarkAll = document.getElementById('btn-mark-all-read');
    if (btnMarkAll) {
      btnMarkAll.addEventListener('click', async () => {
        if (btnMarkAll.disabled) return;
        try {
          await markAllAsRead();
          notifications = notifications.map(item => ({ ...item, is_read: true }));
          renderNotificationFeed(notifications, activeFilter);
          await updateUnreadCount();
          showToast('All notifications marked as read', 'success');
        } catch (error) {
          console.error('Error marking all as read:', error);
          showToast('Failed to mark all notifications as read', 'error');
        }
      });
    }

    document.querySelectorAll('.notification-filter-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        activeFilter = tab.dataset.filter || NOTIFICATION_FILTERS.ALL;
        renderNotificationFeed(notifications, activeFilter);
      });
    });

    const feed = document.getElementById('notifications-feed');
    if (!feed) return;

    feed.addEventListener('click', async (event) => {
      const deleteBtn = event.target.closest('.btn-delete-notification');
      if (deleteBtn) {
        event.stopPropagation();
        const notifId = deleteBtn.dataset.notificationId;
        const target = notifications.find(item => String(item.id) === String(notifId));
        const wasUnread = target ? !target.is_read : false;

        try {
          await deleteNotification(notifId);
          notifications = notifications.filter(item => String(item.id) !== String(notifId));
          renderNotificationFeed(notifications, activeFilter);
          if (wasUnread) await updateUnreadCount();
          showToast('Notification deleted', 'success');
        } catch (error) {
          console.error('Error deleting notification:', error);
          showToast('Failed to delete notification', 'error');
        }
        return;
      }

      const viewOrderBtn = event.target.closest('.notification-order-link');
      if (viewOrderBtn) {
        event.preventDefault();
        const orderId = viewOrderBtn.dataset.orderId || '';
        if (orderId && typeof window.viewOrderDetails === 'function') {
          modal.close();
          setTimeout(() => window.viewOrderDetails(orderId), 0);
        } else {
          showToast('Order view is not available right now', 'info');
        }
        return;
      }

      const content = event.target.closest('.notification-content');
      if (!content) return;

      const item = content.closest('.notification-item');
      const notifId = item?.dataset?.notificationId;
      if (!notifId) return;

      const target = notifications.find(entry => String(entry.id) === String(notifId));
      if (!target || target.is_read) return;

      try {
        await markAsRead(notifId);
        notifications = notifications.map(entry => (
          String(entry.id) === String(notifId)
            ? { ...entry, is_read: true }
            : entry
        ));
        renderNotificationFeed(notifications, activeFilter);
        await updateUnreadCount();
      } catch (error) {
        console.error('Error marking as read:', error);
      }
    });

    feed.addEventListener('keydown', (event) => {
      const content = event.target.closest('.notification-content');
      if (!content) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        content.click();
      }
    });
  };

  initializeEventHandlers();

  try {
    const response = await getMyNotifications({ limit: 20 });
    notifications = response.data?.notifications || [];
    renderNotificationFeed(notifications, activeFilter);

    const firstFocusable = modal.modal.querySelector('.notification-filter-tab, #btn-mark-all-read, .modal-close');
    if (firstFocusable) firstFocusable.focus();
  } catch (error) {
    console.error('Error loading notifications:', error);
    const feed = document.getElementById('notifications-feed');
    const countLabel = document.getElementById('notifications-count-label');
    if (feed) {
      feed.innerHTML = `
        <div class="notification-empty-state" role="alert">
          <i class="bi bi-exclamation-circle text-2xl mb-2 block" aria-hidden="true"></i>
          <p>Unable to load notifications. Please try again.</p>
        </div>
      `;
    }
    if (countLabel) countLabel.textContent = 'Failed to load notifications';
  }
};

const createNotificationItem = (notification) => {
  const icons = {
    order: 'bi-cart',
    message: 'bi-chat',
    verification: 'bi-shield-check',
    issue: 'bi-exclamation-triangle',
    system: 'bi-info-circle'
  };
  
  const icon = icons[notification.type] || 'bi-bell';
  const unreadClass = notification.is_read ? '' : 'unread';
  const title = escapeHtml(notification.title || '');
  const message = escapeHtml(notification.message || '');
  const notificationId = escapeHtml(notification.id || '');
  const orderId = getNotificationOrderId(notification);
  const hasOrderId = Boolean(orderId);
  const shortOrderId = truncateOrderId(orderId);
  const orderTokenMarkup = hasOrderId
    ? `<span class="notification-order-id" title="${escapeAttribute(orderId)}">${escapeHtml(shortOrderId)}</span>`
    : '';
  const orderAction = hasOrderId
    ? `<button class="notification-order-link" type="button" data-order-id="${escapeAttribute(orderId)}" aria-label="View order ${escapeAttribute(orderId)}">View order</button>`
    : '';
  const orderTokenLine = hasOrderId ? `<div>${orderTokenMarkup}</div>` : '';
  const itemAriaLabel = `${title}. ${notification.message || ''}. ${formatRelativeTime(notification.created_at)}.`;
  
  return `
    <article class="notification-item ${unreadClass} p-4 rounded-lg transition relative"
         data-notification-id="${notificationId}"
         aria-label="${escapeAttribute(itemAriaLabel)}">
      <div class="flex gap-3">
        <i class="bi ${icon} text-2xl text-primary"></i>
        <div class="flex-1 cursor-pointer notification-content" role="button" tabindex="0" aria-label="Open notification: ${escapeAttribute(title)}">
          <p class="font-semibold">${title}</p>
          <p class="notification-message">${message}</p>
          ${orderTokenLine}
          <div class="notification-actions">
            ${orderAction}
          </div>
          <p class="notification-time">${formatRelativeTime(notification.created_at)}</p>
        </div>
        <div class="flex items-start gap-2">
          ${!notification.is_read ? '<span class="notification-unread-dot" aria-label="Unread notification"></span>' : ''}
          <button class="btn-delete-notification text-gray-400 hover:text-red-500 transition" 
                  data-notification-id="${notificationId}"
                  aria-label="Delete this notification"
                  title="Delete notification">
            <i class="bi bi-trash text-lg"></i>
          </button>
        </div>
      </div>
    </article>
  `;
};

export { showNotificationCenter, createNotificationItem };

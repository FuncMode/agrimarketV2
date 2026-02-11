// assets/js/features/notifications/notification-toast.js
// Toast Notifications for Real-time Events

import { showToast, showSuccess, showWarning, showInfo } from '../../components/toast.js';
import { 
  playNotificationSound, 
  playMessageSound, 
  playSuccessSound,
  playWarningSound,
  playErrorSound 
} from './notification-sound.js';
import { formatRelativeTime } from '../../utils/formatters.js';

// ============ Toast Configuration ============

const TOAST_TYPES = {
  ORDER_NEW: 'order_new',
  ORDER_UPDATE: 'order_update',
  ORDER_CANCELLED: 'order_cancelled',
  MESSAGE_RECEIVED: 'message_received',
  VERIFICATION_UPDATE: 'verification_update',
  ISSUE_UPDATE: 'issue_update',
  SYSTEM: 'system'
};

const TOAST_ICONS = {
  order_new: 'bi-bag-check',
  order_update: 'bi-arrow-repeat',
  order_cancelled: 'bi-x-circle',
  message_received: 'bi-chat-dots',
  verification_update: 'bi-shield-check',
  issue_update: 'bi-exclamation-triangle',
  system: 'bi-info-circle'
};

// ============ Show Notification Toast ============

/**
 * Show a notification toast
 * @param {Object} notification - Notification data
 * @param {Object} options - Display options
 */
const showNotificationToast = (notification, options = {}) => {
  const {
    playSound = true,
    duration = 5000,
    onClick = null
  } = options;
  
  const { type, title, message, data } = notification;
  
  // Determine toast type
  let toastType = 'info';
  let soundType = 'notification';
  
  switch (type) {
    case TOAST_TYPES.ORDER_NEW:
      toastType = 'success';
      soundType = 'success';
      break;
    case TOAST_TYPES.ORDER_UPDATE:
      toastType = 'info';
      soundType = 'notification';
      break;
    case TOAST_TYPES.ORDER_CANCELLED:
      toastType = 'warning';
      soundType = 'warning';
      break;
    case TOAST_TYPES.MESSAGE_RECEIVED:
      toastType = 'info';
      soundType = 'message';
      break;
    case TOAST_TYPES.VERIFICATION_UPDATE:
      toastType = data?.status === 'verified' ? 'success' : 'warning';
      soundType = data?.status === 'verified' ? 'success' : 'notification';
      break;
    case TOAST_TYPES.ISSUE_UPDATE:
      toastType = 'warning';
      soundType = 'notification';
      break;
  }
  
  // Create toast content
  const content = createNotificationToastContent(notification);
  
  // Show toast (without playing sound in toast.js since we'll play it here)
  const toastId = showToast(content, toastType, duration, false);
  
  // Play sound based on determined sound type
  if (playSound) {
    try {
      switch (soundType) {
        case 'success':
          playSuccessSound();
          break;
        case 'message':
          playMessageSound();
          break;
        case 'warning':
          playWarningSound();
          break;
        case 'error':
          playErrorSound();
          break;
        case 'notification':
        default:
          playNotificationSound();
          break;
      }
    } catch (error) {
      console.debug('Could not play notification sound:', error);
    }
  }
  
  // Add click handler if provided
  if (onClick && toastId) {
    const toastElement = document.getElementById(toastId);
    if (toastElement) {
      toastElement.style.cursor = 'pointer';
      toastElement.addEventListener('click', () => {
        onClick(notification);
      });
    }
  }
  
  return toastId;
};

/**
 * Create notification toast HTML content
 */
const createNotificationToastContent = (notification) => {
  const { type, title, message, data, created_at } = notification;
  const icon = TOAST_ICONS[type] || 'bi-bell';
  
  return `
    <div class="flex items-start gap-3">
      <i class="${icon} text-2xl"></i>
      <div class="flex-1">
        <p class="font-bold">${title}</p>
        <p class="text-sm">${message}</p>
        ${created_at ? `<p class="text-xs opacity-75 mt-1">${formatRelativeTime(created_at)}</p>` : ''}
      </div>
    </div>
  `;
};

// ============ Specific Notification Toasts ============

/**
 * Show new order toast (for sellers)
 */
const showNewOrderToast = (orderData) => {
  const notification = {
    type: TOAST_TYPES.ORDER_NEW,
    title: 'New Order Received!',
    message: `Order #${orderData.order_number} from ${orderData.buyer_name}`,
    data: orderData,
    created_at: new Date()
  };
  
  return showNotificationToast(notification, {
    playSound: true,
    duration: 7000,
    onClick: (notif) => {
      // Navigate to order details
      if (typeof window.viewOrderDetails === 'function') {
        window.viewOrderDetails(notif.data.order_id);
      }
    }
  });
};

/**
 * Show order update toast (for buyers)
 */
const showOrderUpdateToast = (orderData) => {
  const statusMessages = {
    confirmed: 'Your order has been confirmed!',
    ready: 'Your order is ready for pickup/delivery!',
    completed: 'Your order has been completed!',
    cancelled: 'Your order was cancelled'
  };
  
  const notification = {
    type: orderData.status === 'cancelled' ? TOAST_TYPES.ORDER_CANCELLED : TOAST_TYPES.ORDER_UPDATE,
    title: 'Order Update',
    message: statusMessages[orderData.status] || `Order #${orderData.order_number} status: ${orderData.status}`,
    data: orderData,
    created_at: new Date()
  };
  
  return showNotificationToast(notification, {
    playSound: true,
    duration: 6000,
    onClick: (notif) => {
      if (typeof window.viewOrderDetails === 'function') {
        window.viewOrderDetails(notif.data.order_id);
      }
    }
  });
};

/**
 * Show new message toast
 */
const showMessageToast = (messageData) => {
  const notification = {
    type: TOAST_TYPES.MESSAGE_RECEIVED,
    title: 'New Message',
    message: `${messageData.sender_name}: ${messageData.message_text.substring(0, 50)}${messageData.message_text.length > 50 ? '...' : ''}`,
    data: messageData,
    created_at: messageData.created_at
  };
  
  return showNotificationToast(notification, {
    playSound: true,
    duration: 5000,
    onClick: (notif) => {
      if (typeof window.openOrderChat === 'function') {
        window.openOrderChat(notif.data.order_id);
      }
    }
  });
};

/**
 * Show verification update toast
 */
const showVerificationUpdateToast = (verificationData) => {
  const messages = {
    verified: 'Your account has been verified!',
    rejected: 'Your verification was rejected. Please resubmit.',
    pending: 'Your verification is under review'
  };
  
  const notification = {
    type: TOAST_TYPES.VERIFICATION_UPDATE,
    title: 'Verification Update',
    message: messages[verificationData.status] || 'Verification status updated',
    data: verificationData,
    created_at: new Date()
  };
  
  return showNotificationToast(notification, {
    playSound: verificationData.status === 'verified',
    duration: verificationData.status === 'verified' ? 7000 : 6000
  });
};

/**
 * Show issue update toast
 */
const showIssueUpdateToast = (issueData) => {
  const messages = {
    resolved: 'Your issue has been resolved',
    rejected: 'Your issue was rejected',
    pending: 'Your issue is under review'
  };
  
  const notification = {
    type: TOAST_TYPES.ISSUE_UPDATE,
    title: 'Issue Update',
    message: messages[issueData.status] || `Issue #${issueData.id} status updated`,
    data: issueData,
    created_at: new Date()
  };
  
  return showNotificationToast(notification, {
    playSound: true,
    duration: 6000,
    onClick: (notif) => {
      if (typeof window.viewIssue === 'function') {
        window.viewIssue(notif.data.id);
      }
    }
  });
};

/**
 * Show system notification toast
 */
const showSystemToast = (message, data = {}) => {
  const notification = {
    type: TOAST_TYPES.SYSTEM,
    title: 'System Notification',
    message: message,
    data: data,
    created_at: new Date()
  };
  
  return showNotificationToast(notification, {
    playSound: false,
    duration: 5000
  });
};

// ============ Batch Notifications ============

/**
 * Show toast for multiple notifications
 */
const showBatchNotificationToast = (notifications) => {
  if (!notifications || notifications.length === 0) return;
  
  if (notifications.length === 1) {
    return showNotificationToast(notifications[0]);
  }
  
  // Group by type
  const grouped = notifications.reduce((acc, notif) => {
    if (!acc[notif.type]) acc[notif.type] = [];
    acc[notif.type].push(notif);
    return acc;
  }, {});
  
  // Show summary toast
  const types = Object.keys(grouped);
  const totalCount = notifications.length;
  
  const summaryMessage = types.map(type => {
    const count = grouped[type].length;
    const typeName = type.replace('_', ' ').toLowerCase();
    return `${count} ${typeName}${count > 1 ? 's' : ''}`;
  }).join(', ');
  
  return showInfo(`You have ${totalCount} new notifications: ${summaryMessage}`, 6000);
};

// ============ Toast Queue Management ============

let toastQueue = [];
let isProcessingQueue = false;

/**
 * Add notification to queue
 */
const queueNotificationToast = (notification, options = {}) => {
  toastQueue.push({ notification, options });
  processToastQueue();
};

/**
 * Process toast queue
 */
const processToastQueue = async () => {
  if (isProcessingQueue || toastQueue.length === 0) return;
  
  isProcessingQueue = true;
  
  while (toastQueue.length > 0) {
    const { notification, options } = toastQueue.shift();
    showNotificationToast(notification, options);
    
    // Delay between toasts
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  isProcessingQueue = false;
};

/**
 * Clear toast queue
 */
const clearToastQueue = () => {
  toastQueue = [];
};

// ============ Exports ============

export {
  // Main function
  showNotificationToast,
  
  // Specific toasts
  showNewOrderToast,
  showOrderUpdateToast,
  showMessageToast,
  showVerificationUpdateToast,
  showIssueUpdateToast,
  showSystemToast,
  showBatchNotificationToast,
  
  // Queue management
  queueNotificationToast,
  processToastQueue,
  clearToastQueue,
  
  // Constants
  TOAST_TYPES
};

export default {
  show: showNotificationToast,
  showNewOrder: showNewOrderToast,
  showOrderUpdate: showOrderUpdateToast,
  showMessage: showMessageToast,
  showVerification: showVerificationUpdateToast,
  showIssue: showIssueUpdateToast,
  showSystem: showSystemToast,
  showBatch: showBatchNotificationToast,
  queue: queueNotificationToast,
  clearQueue: clearToastQueue
};
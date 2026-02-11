// assets/js/features/real-time/live-updates.js
// Live Order Status Updates

import { 
  onOrderUpdate, 
  onNewOrder, 
  onOrderCancelled 
} from '../../services/socket.service.js';
import { showToast, showSuccess, showWarning } from '../../components/toast.js';
import { formatCurrency } from '../../utils/formatters.js';
import { playNotificationSound } from '../notifications/notification-sound.js';
import { getRole } from '../../core/auth.js';

let orderUpdateCallbacks = [];
let unsubscribeFunctions = [];

// ============ Initialize Live Updates ============

const initLiveUpdates = () => {
  const role = getRole();
  
  // Buyer-specific updates
  if (role === 'buyer') {
    setupBuyerUpdates();
  }
  
  // Seller-specific updates
  if (role === 'seller') {
    setupSellerUpdates();
  }
  

};

// ============ Buyer Updates ============

const setupBuyerUpdates = () => {
  // Order status changed
  const unsubUpdate = onOrderUpdate((data) => {
    handleOrderUpdate(data);
  });
  unsubscribeFunctions.push(unsubUpdate);
  
  // Order cancelled by seller
  const unsubCancel = onOrderCancelled((data) => {
    handleOrderCancelled(data);
  });
  unsubscribeFunctions.push(unsubCancel);
};

const handleOrderUpdate = (data) => {
  const { order_id, order_number, status, previous_status } = data;
  
  // Show notification based on status
  const statusMessages = {
    confirmed: {
      message: `Order #${order_number} has been confirmed by the seller!`,
      type: 'success'
    },
    ready: {
      message: `Order #${order_number} is ready for ${data.delivery_option === 'pickup' ? 'pickup' : 'delivery'}!`,
      type: 'success'
    },
    completed: {
      message: `Order #${order_number} has been completed. Thank you!`,
      type: 'success'
    }
  };
  
  const notification = statusMessages[status];
  if (notification) {
    showToast(notification.message, notification.type);
  }
  
  // Update UI if on orders page
  updateOrderUI(order_id, data);
  
  // Trigger callbacks
  triggerCallbacks('update', data);
};

const handleOrderCancelled = (data) => {
  const { order_number, reason } = data;
  
  showWarning(`Order #${order_number} was cancelled. Reason: ${reason || 'Not specified'}`);
  
  // Update UI
  updateOrderUI(data.order_id, data);
  
  // Trigger callbacks
  triggerCallbacks('cancelled', data);
};

// ============ Seller Updates ============

const setupSellerUpdates = () => {
  // New order received
  const unsubNew = onNewOrder((data) => {
    handleNewOrder(data);
  });
  unsubscribeFunctions.push(unsubNew);
  
  // Order cancelled by buyer
  const unsubCancel = onOrderCancelled((data) => {
    handleOrderCancelledSeller(data);
  });
  unsubscribeFunctions.push(unsubCancel);
  
  // Order update (buyer-side)
  const unsubUpdate = onOrderUpdate((data) => {
    // Seller can see updates too
    updateOrderUI(data.order_id, data);
    
    // Trigger callbacks for seller
    triggerCallbacks('update', data);
  });
  unsubscribeFunctions.push(unsubUpdate);
};

const handleNewOrder = (data) => {
  const { order_number, buyer_name, total_amount, items_count } = data;
  
  // Play notification sound
  playNotificationSound();
  
  // Show notification with action button
  const notification = document.createElement('div');
  notification.className = 'toast toast-success';
  notification.innerHTML = `
    <div class="flex items-center gap-3">
      <i class="bi bi-bag-check text-2xl"></i>
      <div class="flex-1">
        <p class="font-bold">New Order Received!</p>
        <p class="text-sm">Order #${order_number} from ${buyer_name}</p>
        <p class="text-sm">${items_count} items • ${formatCurrency(total_amount)}</p>
      </div>
      <button class="btn btn-sm btn-primary" onclick="window.viewNewOrder('${data.order_id}')">
        View Order
      </button>
    </div>
  `;
  
  const toastContainer = document.getElementById('toast-container') || createToastContainer();
  toastContainer.appendChild(notification);
  
  // Auto-remove after 10 seconds
  setTimeout(() => {
    notification.remove();
  }, 10000);
  
  // Update dashboard stats
  updateDashboardStats();
  
  // Trigger callbacks
  triggerCallbacks('new', data);
};

const handleOrderCancelledSeller = (data) => {
  const { order_number, buyer_name } = data;
  
  showWarning(`Order #${order_number} was cancelled by ${buyer_name}`);
  
  // Update UI
  updateOrderUI(data.order_id, data);
  
  // Update stats
  updateDashboardStats();
  
  // Trigger callbacks
  triggerCallbacks('cancelled', data);
};

// ============ UI Updates ============

const updateOrderUI = (orderId, orderData) => {
  // Find order element
  const orderElement = document.querySelector(`[data-order-id="${orderId}"]`);
  
  if (orderElement) {
    // Update status badge
    const statusBadge = orderElement.querySelector('.badge');
    if (statusBadge && orderData.status) {
      const statusColors = {
        pending: 'warning',
        confirmed: 'info',
        ready: 'primary',
        completed: 'success',
        cancelled: 'danger'
      };
      
      statusBadge.className = `badge badge-${statusColors[orderData.status] || 'secondary'}`;
      statusBadge.textContent = orderData.status.toUpperCase();
    }
    
    // Add visual feedback
    orderElement.classList.add('animate-pulse');
    setTimeout(() => {
      orderElement.classList.remove('animate-pulse');
    }, 1000);
  }
};

const updateDashboardStats = () => {
  // Reload stats if on dashboard
  if (typeof window.loadDashboardStats === 'function') {
    window.loadDashboardStats();
  }
  
  // Reload orders list if visible
  if (typeof window.loadOrders === 'function') {
    window.loadOrders();
  }
};

// ============ Callbacks ============

const onUpdate = (callback) => {
  orderUpdateCallbacks.push({ type: 'update', callback });
  
  return () => {
    orderUpdateCallbacks = orderUpdateCallbacks.filter(cb => cb.callback !== callback);
  };
};

const onNew = (callback) => {
  orderUpdateCallbacks.push({ type: 'new', callback });
  
  return () => {
    orderUpdateCallbacks = orderUpdateCallbacks.filter(cb => cb.callback !== callback);
  };
};

const onCancelled = (callback) => {
  orderUpdateCallbacks.push({ type: 'cancelled', callback });
  
  return () => {
    orderUpdateCallbacks = orderUpdateCallbacks.filter(cb => cb.callback !== callback);
  };
};

const triggerCallbacks = (type, data) => {
  orderUpdateCallbacks
    .filter(cb => cb.type === type)
    .forEach(cb => {
      try {
        cb.callback(data);
      } catch (error) {
        console.error('Error in order update callback:', error);
      }
    });
};

// ============ Helpers ============

const createToastContainer = () => {
  const container = document.createElement('div');
  container.id = 'toast-container';
  container.style.cssText = `
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 1080;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  `;
  document.body.appendChild(container);
  return container;
};

// ============ Global Functions ============

window.viewNewOrder = (orderId) => {
  // Navigate to order or open modal
  if (typeof window.viewOrderDetails === 'function') {
    window.viewOrderDetails(orderId);
  } else {
    window.location.hash = 'orders';
  }
};

// ============ Cleanup ============

const cleanup = () => {
  unsubscribeFunctions.forEach(unsub => {
    if (typeof unsub === 'function') {
      unsub();
    }
  });
  unsubscribeFunctions = [];
  orderUpdateCallbacks = [];
};

// ============ Exports ============

export {
  initLiveUpdates,
  onUpdate,
  onNew,
  onCancelled,
  cleanup
};

export default {
  init: initLiveUpdates,
  onUpdate,
  onNew,
  onCancelled,
  cleanup
};
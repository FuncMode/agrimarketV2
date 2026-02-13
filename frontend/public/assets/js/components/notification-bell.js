// assets/js/components/notification-bell.js
// Notification Bell Icon with Badge and Dropdown

import { getUnreadCount } from '../services/notification.service.js';
import { showNotificationCenter } from '../features/notifications/notification-center.js';
import { onNotification } from '../services/socket.service.js';
import notificationStore from '../store/notification.store.js';

let bellElement = null;
let badgeElement = null;
let unsubscribeSocket = null;

// ============ Initialize Notification Bell ============

const initNotificationBell = async () => {
  bellElement = document.getElementById('notification-bell');
  
  if (!bellElement) {
    console.warn('Notification bell element not found');
    return;
  }
  
  // Initialize notification store
  notificationStore.init();
  
  // Create bell structure if not exists
  if (!bellElement.querySelector('.notification-badge')) {
    bellElement.innerHTML = `
      <i class="bi bi-bell text-xl"></i>
      <span class="notification-badge" style="display: none;">0</span>
    `;
    bellElement.classList.add('notification-bell', 'relative', 'cursor-pointer');
  }
  
  badgeElement = bellElement.querySelector('.notification-badge');
  
  // Load initial count
  await updateUnreadCount();
  
  // Setup click handler
  bellElement.addEventListener('click', handleBellClick);
  
  // Listen for real-time notifications
  setupRealtimeListener();
  
  // Listen for store changes
  notificationStore.onChange(handleStoreChange);
  

};

// ============ Update Unread Count ============

const updateUnreadCount = async () => {
  try {
    const response = await getUnreadCount();
    const count = response.data?.unread_count || response.data?.count || 0;
    
    setUnreadCount(count);
  } catch (error) {
    console.error('Error fetching unread count:', error);
  }
};

const setUnreadCount = (count) => {
  if (!badgeElement) return;
  
  if (count > 0) {
    badgeElement.textContent = count > 99 ? '99+' : count;
    badgeElement.style.display = 'block';
    
    // Add pulsing animation for new notifications
    badgeElement.classList.add('pulse-animation');
    setTimeout(() => {
      badgeElement.classList.remove('pulse-animation');
    }, 1000);
  } else {
    badgeElement.style.display = 'none';
  }
  
  // Note: Store will be updated when full notifications are fetched
  // The unread count is automatically calculated from notifications array
};

// ============ Handle Bell Click ============

const handleBellClick = (e) => {
  e.preventDefault();
  e.stopPropagation();
  
  // Show notification center
  showNotificationCenter();
  
  // Mark bell as viewed (remove animation)
  if (bellElement) {
    bellElement.classList.remove('has-new-notification');
  }
};

// ============ Real-time Updates ============

const setupRealtimeListener = () => {
  // Cleanup previous listener
  if (unsubscribeSocket) {
    unsubscribeSocket();
  }
  
  // Subscribe to new notifications - listen to both possible events
  unsubscribeSocket = onNotification((notification) => {
    handleNewNotification(notification);
  });
};

const handleNewNotification = (notification) => {
  // Update count
  updateUnreadCount();
  
  // Add visual indicator
  if (bellElement) {
    bellElement.classList.add('has-new-notification');
    
    // Ring animation
    bellElement.classList.add('ring-animation');
    setTimeout(() => {
      bellElement.classList.remove('ring-animation');
    }, 1000);
  }
  
  // Update store
  notificationStore.add(notification);
};

// ============ Store Change Handler ============

const handleStoreChange = (newState, oldState) => {
  if (newState && oldState) {
    const newCount = newState.unreadCount || 0;
    const oldCount = oldState.unreadCount || 0;
    
    if (newCount !== oldCount) {
      setUnreadCount(newCount);
    }
  }
};

// ============ Cleanup ============

const cleanup = () => {
  if (bellElement) {
    bellElement.removeEventListener('click', handleBellClick);
  }
  
  if (unsubscribeSocket) {
    unsubscribeSocket();
    unsubscribeSocket = null;
  }
};

// ============ Add CSS Animations ============
// Styles are now handling in components.css
// Keeping this comment block to indicate removal of duplicate styles

// ============ Exports ============

export {
  initNotificationBell,
  updateUnreadCount,
  setUnreadCount,
  cleanup
};

export default {
  init: initNotificationBell,
  updateCount: updateUnreadCount,
  setCount: setUnreadCount,
  cleanup
};
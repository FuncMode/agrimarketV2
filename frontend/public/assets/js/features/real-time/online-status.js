// ========================================
// assets/js/features/real-time/online-status.js
// Online Status Indicator
// ========================================

import { onUserOnline, onUserOffline } from '../../services/socket.service.js';

let onlineUsers = new Set();
let statusCallbacks = new Map();
let unsubscribeFunctions = [];

// ============ Initialize ============

const initOnlineStatus = () => {
  // Listen for online/offline events
  const unsubOnline = onUserOnline((data) => {
    handleUserOnline(data.userId, data.userName);
  });
  unsubscribeFunctions.push(unsubOnline);
  
  const unsubOffline = onUserOffline((data) => {
    handleUserOffline(data.userId);
  });
  unsubscribeFunctions.push(unsubOffline);
};

// ============ Handle Events ============

const handleUserOnline = (userId, userName) => {
  onlineUsers.add(userId);
  
  // Update all status indicators for this user
  updateUserStatus(userId, true);
  
  // Trigger callbacks
  triggerCallbacks(userId, true);
};

const handleUserOffline = (userId) => {
  onlineUsers.delete(userId);
  
  // Update all status indicators for this user
  updateUserStatus(userId, false);
  
  // Trigger callbacks
  triggerCallbacks(userId, false);
};

// ============ Status Indicators ============

const createStatusIndicator = (userId, size = 'sm') => {
  const indicator = document.createElement('span');
  indicator.className = `status-indicator status-${size}`;
  indicator.dataset.userId = userId;
  
  const isOnline = onlineUsers.has(userId);
  indicator.innerHTML = `
    <i class="bi bi-circle-fill ${isOnline ? 'text-success' : 'text-gray-400'}"></i>
  `;
  
  return indicator;
};

const createStatusBadge = (userId, userName = 'User') => {
  const isOnline = onlineUsers.has(userId);
  
  const badge = document.createElement('span');
  badge.className = 'status-badge inline-flex items-center gap-2 px-2 py-1 rounded text-sm';
  badge.dataset.userId = userId;
  badge.style.cssText = `
    background-color: ${isOnline ? '#d4edda' : '#f8f9fa'};
    color: ${isOnline ? '#155724' : '#6c757d'};
  `;
  badge.innerHTML = `
    <i class="bi bi-circle-fill" style="font-size: 0.5rem;"></i>
    <span>${isOnline ? 'Online' : 'Offline'}</span>
  `;
  
  return badge;
};

const updateUserStatus = (userId, isOnline) => {
  // Update all indicators for this user
  const elements = document.querySelectorAll(`[data-user-id="${userId}"]`);
  
  elements.forEach(element => {
    if (element.classList.contains('status-indicator')) {
      element.innerHTML = `
        <i class="bi bi-circle-fill ${isOnline ? 'text-success' : 'text-gray-400'}"></i>
      `;
    } else if (element.classList.contains('status-badge')) {
      element.style.backgroundColor = isOnline ? '#d4edda' : '#f8f9fa';
      element.style.color = isOnline ? '#155724' : '#6c757d';
      element.innerHTML = `
        <i class="bi bi-circle-fill" style="font-size: 0.5rem;"></i>
        <span>${isOnline ? 'Online' : 'Offline'}</span>
      `;
    }
  });
};

// ============ Status Queries ============

const isUserOnline = (userId) => {
  return onlineUsers.has(userId);
};

const getOnlineUsers = () => {
  return Array.from(onlineUsers);
};

const getOnlineCount = () => {
  return onlineUsers.size;
};

// Set initial online users list
const setInitialOnlineUsers = (userIds) => {
  if (Array.isArray(userIds)) {
    userIds.forEach((userId) => {
      onlineUsers.add(userId);
    });
    
    // Update all badges on the page
    userIds.forEach(userId => {
      updateUserStatus(userId, true);
    });
  }
};

// ============ Callbacks ============

const onStatusChange = (userId, callback) => {
  if (!statusCallbacks.has(userId)) {
    statusCallbacks.set(userId, []);
  }
  
  statusCallbacks.get(userId).push(callback);
  
  // Return unsubscribe function
  return () => {
    const callbacks = statusCallbacks.get(userId);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  };
};

const triggerCallbacks = (userId, isOnline) => {
  const callbacks = statusCallbacks.get(userId);
  if (!callbacks) return;
  
  callbacks.forEach(callback => {
    try {
      callback(isOnline);
    } catch (error) {
      console.error('Error in status change callback:', error);
    }
  });
};

// ============ Cleanup ============

const cleanup = () => {
  unsubscribeFunctions.forEach(unsub => {
    if (typeof unsub === 'function') {
      unsub();
    }
  });
  unsubscribeFunctions = [];
  
  onlineUsers.clear();
  statusCallbacks.clear();
};

// ============ Exports ============

export {
  initOnlineStatus,
  createStatusIndicator,
  createStatusBadge,
  isUserOnline,
  getOnlineUsers,
  getOnlineCount,
  onStatusChange,
  setInitialOnlineUsers,
  cleanup
};

export default {
  init: initOnlineStatus,
  createIndicator: createStatusIndicator,
  createBadge: createStatusBadge,
  isOnline: isUserOnline,
  getOnlineUsers,
  getOnlineCount,
  onStatusChange,
  setInitialOnlineUsers,
  cleanup
};
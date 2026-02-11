// assets/js/services/notification.service.js
// Notification Service - In-app notifications

import { get, put, del, post, patch } from '../core/http.js';
import { ENDPOINTS } from '../config/api.js';

// ============ Get Notifications ============

/**
 * Get user's notifications
 * @param {Object} params - Query parameters
 */
const getMyNotifications = async (params = {}) => {
  try {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page);
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.unread_only) queryParams.append('unread_only', 'true');
    if (params.type) queryParams.append('type', params.type);
    
    const queryString = queryParams.toString();
    const url = queryString 
      ? `${ENDPOINTS.NOTIFICATIONS.MY_NOTIFICATIONS}?${queryString}`
      : ENDPOINTS.NOTIFICATIONS.MY_NOTIFICATIONS;
    
    const response = await get(url);
    return response;
  } catch (error) {
    throw error;
  }
};

/**
 * Get single notification by ID
 * @param {String} notificationId - Notification ID
 */
const getNotificationById = async (notificationId) => {
  try {
    const response = await get(`${ENDPOINTS.NOTIFICATIONS.MY_NOTIFICATIONS}/${notificationId}`);
    return response;
  } catch (error) {
    throw error;
  }
};

/**
 * Get unread notification count
 */
const getUnreadCount = async () => {
  try {
    const response = await get(ENDPOINTS.NOTIFICATIONS.UNREAD_COUNT);
    return response;
  } catch (error) {
    throw error;
  }
};

/**
 * Get notifications by type
 * @param {String} type - Notification type (order, message, verification, etc.)
 */
const getNotificationsByType = async (type, params = {}) => {
  try {
    const queryParams = new URLSearchParams();
    queryParams.append('type', type);
    if (params.page) queryParams.append('page', params.page);
    if (params.limit) queryParams.append('limit', params.limit);
    
    const url = `${ENDPOINTS.NOTIFICATIONS.MY_NOTIFICATIONS}?${queryParams.toString()}`;
    const response = await get(url);
    return response;
  } catch (error) {
    throw error;
  }
};

// ============ Mark as Read ============

/**
 * Mark notification as read
 * @param {String} notificationId - Notification ID
 */
const markAsRead = async (notificationId) => {
  try {
    const response = await patch(ENDPOINTS.NOTIFICATIONS.MARK_READ(notificationId));
    return response;
  } catch (error) {
    throw error;
  }
};

/**
 * Mark all notifications as read
 */
const markAllAsRead = async () => {
  try {
    const response = await patch(ENDPOINTS.NOTIFICATIONS.MARK_ALL_READ);
    return response;
  } catch (error) {
    throw error;
  }
};

/**
 * Mark multiple notifications as read
 * @param {Array} notificationIds - Array of notification IDs
 */
const markMultipleAsRead = async (notificationIds) => {
  try {
    const response = await post(ENDPOINTS.NOTIFICATIONS.MARK_ALL_READ, {
      notification_ids: notificationIds
    });
    return response;
  } catch (error) {
    throw error;
  }
};

// ============ Delete Notifications ============

/**
 * Delete a notification
 * @param {String} notificationId - Notification ID
 */
const deleteNotification = async (notificationId) => {
  try {
    const response = await del(ENDPOINTS.NOTIFICATIONS.DELETE(notificationId));
    return response;
  } catch (error) {
    throw error;
  }
};

/**
 * Delete all read notifications
 */
const deleteAllRead = async () => {
  try {
    const response = await del(`${ENDPOINTS.NOTIFICATIONS.MY_NOTIFICATIONS}/read`);
    return response;
  } catch (error) {
    throw error;
  }
};

/**
 * Delete multiple notifications
 * @param {Array} notificationIds - Array of notification IDs
 */
const deleteMultiple = async (notificationIds) => {
  try {
    const response = await post(`${ENDPOINTS.NOTIFICATIONS.MY_NOTIFICATIONS}/delete-multiple`, {
      notification_ids: notificationIds
    });
    return response;
  } catch (error) {
    throw error;
  }
};

// ============ Notification Settings ============

/**
 * Get notification preferences
 */
const getNotificationPreferences = async () => {
  try {
    const response = await get(`${ENDPOINTS.NOTIFICATIONS.MY_NOTIFICATIONS}/preferences`);
    return response;
  } catch (error) {
    throw error;
  }
};

/**
 * Update notification preferences
 * @param {Object} preferences - Notification preferences
 */
const updateNotificationPreferences = async (preferences) => {
  try {
    const response = await put(`${ENDPOINTS.NOTIFICATIONS.MY_NOTIFICATIONS}/preferences`, preferences);
    return response;
  } catch (error) {
    throw error;
  }
};

// ============ Test Notification ============

/**
 * Send test notification (for testing purposes)
 */
const sendTestNotification = async () => {
  try {
    const response = await post(ENDPOINTS.NOTIFICATIONS.TEST);
    return response;
  } catch (error) {
    throw error;
  }
};

// ============ Notification Statistics ============

/**
 * Get notification statistics
 */
const getNotificationStats = async () => {
  try {
    const response = await get(`${ENDPOINTS.NOTIFICATIONS.MY_NOTIFICATIONS}/stats`);
    return response;
  } catch (error) {
    throw error;
  }
};

// ============ Helpers ============

/**
 * Check if notification is unread
 * @param {Object} notification - Notification object
 */
const isUnread = (notification) => {
  return !notification.is_read;
};

/**
 * Group notifications by type
 * @param {Array} notifications - Array of notifications
 */
const groupByType = (notifications) => {
  return notifications.reduce((acc, notification) => {
    const type = notification.type || 'other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(notification);
    return acc;
  }, {});
};

/**
 * Group notifications by date
 * @param {Array} notifications - Array of notifications
 */
const groupByDate = (notifications) => {
  return notifications.reduce((acc, notification) => {
    const date = new Date(notification.created_at).toLocaleDateString();
    if (!acc[date]) acc[date] = [];
    acc[date].push(notification);
    return acc;
  }, {});
};

/**
 * Filter notifications
 * @param {Array} notifications - Array of notifications
 * @param {Object} filters - Filter criteria
 */
const filterNotifications = (notifications, filters = {}) => {
  let filtered = [...notifications];
  
  if (filters.unread_only) {
    filtered = filtered.filter(n => !n.is_read);
  }
  
  if (filters.type) {
    filtered = filtered.filter(n => n.type === filters.type);
  }
  
  if (filters.from_date) {
    const fromDate = new Date(filters.from_date);
    filtered = filtered.filter(n => new Date(n.created_at) >= fromDate);
  }
  
  if (filters.to_date) {
    const toDate = new Date(filters.to_date);
    filtered = filtered.filter(n => new Date(n.created_at) <= toDate);
  }
  
  return filtered;
};

/**
 * Sort notifications
 * @param {Array} notifications - Array of notifications
 * @param {String} sortBy - Sort field (created_at, type, is_read)
 * @param {String} order - Sort order (asc, desc)
 */
const sortNotifications = (notifications, sortBy = 'created_at', order = 'desc') => {
  const sorted = [...notifications];
  
  sorted.sort((a, b) => {
    let compareA = a[sortBy];
    let compareB = b[sortBy];
    
    // Handle dates
    if (sortBy === 'created_at') {
      compareA = new Date(compareA);
      compareB = new Date(compareB);
    }
    
    // Handle booleans
    if (sortBy === 'is_read') {
      compareA = compareA ? 1 : 0;
      compareB = compareB ? 1 : 0;
    }
    
    if (order === 'asc') {
      return compareA > compareB ? 1 : -1;
    } else {
      return compareA < compareB ? 1 : -1;
    }
  });
  
  return sorted;
};

// ============ Notification Types ============

const NOTIFICATION_TYPES = {
  ORDER: 'order',
  MESSAGE: 'message',
  VERIFICATION: 'verification',
  ISSUE: 'issue',
  SYSTEM: 'system',
  PAYMENT: 'payment',
  PRODUCT: 'product'
};

// ============ Exports ============

export {
  // Get notifications
  getMyNotifications,
  getNotificationById,
  getUnreadCount,
  getNotificationsByType,
  getNotificationStats,
  
  // Mark as read
  markAsRead,
  markAllAsRead,
  markMultipleAsRead,
  
  // Delete
  deleteNotification,
  deleteAllRead,
  deleteMultiple,
  
  // Preferences
  getNotificationPreferences,
  updateNotificationPreferences,
  
  // Test
  sendTestNotification,
  
  // Helpers
  isUnread,
  groupByType,
  groupByDate,
  filterNotifications,
  sortNotifications,
  
  // Constants
  NOTIFICATION_TYPES
};

export default {
  get: getMyNotifications,
  getById: getNotificationById,
  getUnreadCount,
  getByType: getNotificationsByType,
  getStats: getNotificationStats,
  markAsRead,
  markAllAsRead,
  delete: deleteNotification,
  deleteAllRead,
  getPreferences: getNotificationPreferences,
  updatePreferences: updateNotificationPreferences,
  helpers: {
    isUnread,
    groupByType,
    groupByDate,
    filter: filterNotifications,
    sort: sortNotifications
  },
  TYPES: NOTIFICATION_TYPES
};
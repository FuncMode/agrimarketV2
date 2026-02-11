import { state, STATE_KEYS } from '../core/state.js';

const initNotificationStore = () => {
  state.set(STATE_KEYS.NOTIFICATIONS, {
    notifications: [],
    unreadCount: 0,
    lastFetchTime: null
  });
};

const setNotifications = (notifications) => {
  const unreadCount = notifications.filter(n => !n.is_read).length;
  
  state.set(STATE_KEYS.NOTIFICATIONS, {
    notifications,
    unreadCount,
    lastFetchTime: Date.now()
  });
};

const addNotification = (notification) => {
  const current = state.get(STATE_KEYS.NOTIFICATIONS) || {
    notifications: [],
    unreadCount: 0,
    lastFetchTime: null
  };
  
  // Add to beginning of array
  const notifications = [notification, ...current.notifications];
  const unreadCount = notifications.filter(n => !n.is_read).length;
  
  state.set(STATE_KEYS.NOTIFICATIONS, {
    notifications,
    unreadCount,
    lastFetchTime: Date.now()
  });
};

const markAsRead = (notificationId) => {
  const current = state.get(STATE_KEYS.NOTIFICATIONS) || {
    notifications: [],
    unreadCount: 0,
    lastFetchTime: null
  };
  
  const notifications = current.notifications.map(n =>
    n.id === notificationId ? { ...n, is_read: true } : n
  );
  
  const unreadCount = notifications.filter(n => !n.is_read).length;
  
  state.set(STATE_KEYS.NOTIFICATIONS, {
    notifications,
    unreadCount,
    lastFetchTime: current.lastFetchTime
  });
};

const markAllAsRead = () => {
  const current = state.get(STATE_KEYS.NOTIFICATIONS) || {
    notifications: [],
    unreadCount: 0,
    lastFetchTime: null
  };
  
  const notifications = current.notifications.map(n => ({ ...n, is_read: true }));
  
  state.set(STATE_KEYS.NOTIFICATIONS, {
    notifications,
    unreadCount: 0,
    lastFetchTime: current.lastFetchTime
  });
};

const removeNotification = (notificationId) => {
  const current = state.get(STATE_KEYS.NOTIFICATIONS) || {
    notifications: [],
    unreadCount: 0,
    lastFetchTime: null
  };
  
  const notifications = current.notifications.filter(n => n.id !== notificationId);
  const unreadCount = notifications.filter(n => !n.is_read).length;
  
  state.set(STATE_KEYS.NOTIFICATIONS, {
    notifications,
    unreadCount,
    lastFetchTime: current.lastFetchTime
  });
};

const clearNotifications = () => {
  state.set(STATE_KEYS.NOTIFICATIONS, {
    notifications: [],
    unreadCount: 0,
    lastFetchTime: null
  });
};

const getNotifications = () => {
  const current = state.get(STATE_KEYS.NOTIFICATIONS);
  return current ? current.notifications : [];
};

const getUnreadCount = () => {
  const current = state.get(STATE_KEYS.NOTIFICATIONS);
  return current ? current.unreadCount : 0;
};

const onNotificationsChange = (callback) => {
  return state.subscribe(STATE_KEYS.NOTIFICATIONS, callback);
};

export default {
  init: initNotificationStore,
  set: setNotifications,
  add: addNotification,
  markAsRead,
  markAllAsRead,
  remove: removeNotification,
  clear: clearNotifications,
  get: getNotifications,
  getUnreadCount,
  onChange: onNotificationsChange
};
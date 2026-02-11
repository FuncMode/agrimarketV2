// assets/js/core/state.js
// Simple Reactive State Manager for Global App State

class StateManager {
  constructor() {
    this.state = {};
    this.subscribers = {};
  }
  
  // Get state value
  get(key) {
    return this.state[key];
  }
  
  // Set state value and notify subscribers
  set(key, value) {
    const oldValue = this.state[key];
    this.state[key] = value;
    
    // Notify subscribers if value changed
    if (oldValue !== value) {
      this.notify(key, value, oldValue);
    }
    
    return value;
  }
  
  // Update state (merge objects)
  update(key, updates) {
    const current = this.get(key) || {};
    const newValue = { ...current, ...updates };
    return this.set(key, newValue);
  }
  
  // Delete state value
  delete(key) {
    const value = this.state[key];
    delete this.state[key];
    this.notify(key, undefined, value);
    return value;
  }
  
  // Subscribe to state changes
  subscribe(key, callback) {
    if (!this.subscribers[key]) {
      this.subscribers[key] = [];
    }
    
    this.subscribers[key].push(callback);
    
    // Return unsubscribe function
    return () => {
      this.subscribers[key] = this.subscribers[key].filter(cb => cb !== callback);
    };
  }
  
  // Notify subscribers of changes
  notify(key, newValue, oldValue) {
    if (!this.subscribers[key]) return;
    
    this.subscribers[key].forEach(callback => {
      try {
        callback(newValue, oldValue);
      } catch (error) {
        console.error(`Error in subscriber for "${key}":`, error);
      }
    });
  }
  
  // Reset all state
  reset() {
    const keys = Object.keys(this.state);
    keys.forEach(key => this.delete(key));
  }
  
  // Get all state (for debugging)
  getAll() {
    return { ...this.state };
  }
}

// Create singleton instance
const state = new StateManager();

// ============ Common State Keys ============

const STATE_KEYS = {
  USER: 'user',
  CART: 'cart',
  NOTIFICATIONS: 'notifications',
  UNREAD_COUNT: 'unreadCount',
  SOCKET: 'socket',
  LOADING: 'loading',
  ERROR: 'error'
};

// ============ Helper Functions ============

// User state
const setUserState = (userData) => state.set(STATE_KEYS.USER, userData);
const getUserState = () => state.get(STATE_KEYS.USER);
const clearUserState = () => state.delete(STATE_KEYS.USER);

// Cart state
const setCartState = (cartData) => state.set(STATE_KEYS.CART, cartData);
const getCartState = () => state.get(STATE_KEYS.CART);
const updateCartState = (updates) => state.update(STATE_KEYS.CART, updates);
const clearCartState = () => state.delete(STATE_KEYS.CART);

// Notifications state
const setNotificationsState = (notifications) => state.set(STATE_KEYS.NOTIFICATIONS, notifications);
const getNotificationsState = () => state.get(STATE_KEYS.NOTIFICATIONS);
const clearNotificationsState = () => state.delete(STATE_KEYS.NOTIFICATIONS);

// Unread count state
const setUnreadCount = (count) => state.set(STATE_KEYS.UNREAD_COUNT, count);
const getUnreadCount = () => state.get(STATE_KEYS.UNREAD_COUNT) || 0;

// Socket state
const setSocketState = (socketData) => state.set(STATE_KEYS.SOCKET, socketData);
const getSocketState = () => state.get(STATE_KEYS.SOCKET);

// Loading state
const setLoading = (isLoading) => state.set(STATE_KEYS.LOADING, isLoading);
const isLoading = () => state.get(STATE_KEYS.LOADING) || false;

// Error state
const setError = (error) => state.set(STATE_KEYS.ERROR, error);
const getError = () => state.get(STATE_KEYS.ERROR);
const clearError = () => state.delete(STATE_KEYS.ERROR);

// ============ Exports ============

export {
  state,
  STATE_KEYS,
  
  // User helpers
  setUserState,
  getUserState,
  clearUserState,
  
  // Cart helpers
  setCartState,
  getCartState,
  updateCartState,
  clearCartState,
  
  // Notifications helpers
  setNotificationsState,
  getNotificationsState,
  clearNotificationsState,
  
  // Unread count helpers
  setUnreadCount,
  getUnreadCount,
  
  // Socket helpers
  setSocketState,
  getSocketState,
  
  // Loading helpers
  setLoading,
  isLoading,
  
  // Error helpers
  setError,
  getError,
  clearError
};

export default state;
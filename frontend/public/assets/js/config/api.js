// assets/js/config/api.js
// API Configuration - Base URL and Endpoint Mapping

import ENV from './env.js';

const API_BASE = 'https://agrimarket-production-04b3.up.railway.app/api';

const ENDPOINTS = {
  // Auth endpoints
  AUTH: {
    SIGNUP: '/auth/signup',
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    ME: '/auth/me',
    FORGOT_PASSWORD: '/auth/forgot-password',
    RESET_PASSWORD: '/auth/reset-password'
  },
  
  // User endpoints
  USERS: {
    PROFILE: '/users/profile',
    UPDATE_PROFILE: '/users/profile',
    SELLER_PROFILE: '/users/seller-profile',
    BUYER_PROFILE: '/users/buyer-profile',
    STATS: '/users/stats',
    SELLERS: '/users/sellers',
    SELLER_BY_ID: (id) => `/users/sellers/${id}`,
    DELETE_ACCOUNT: '/users/account',
    ONLINE: '/users/online'
  },
  
  // Verification endpoints
  VERIFICATION: {
    SUBMIT: '/verifications/submit',
    STATUS: '/verifications/status',
    ADMIN_PENDING: '/verifications/admin/pending',
    ADMIN_STATS: '/verifications/admin/stats',
    ADMIN_DETAILS: (id) => `/verifications/admin/${id}`,
    ADMIN_APPROVE: (id) => `/verifications/admin/${id}/approve`,
    ADMIN_REJECT: (id) => `/verifications/admin/${id}/reject`,
    ADMIN_MORE_EVIDENCE: (id) => `/verifications/admin/${id}/more-evidence`
  },
  
  // Product endpoints
  PRODUCTS: {
    LIST: '/products',
    BY_ID: (id) => `/products/${id}`,
    CREATE: '/products',
    UPDATE: (id) => `/products/${id}`,
    DELETE: (id) => `/products/${id}`,
    MY_PRODUCTS: '/products/seller/my-products',
    STATS: '/products/seller/stats',
    ANALYTICS: '/products/seller/analytics',
    SALES_OVER_TIME: '/products/seller/sales-over-time',
    TOP_PRODUCTS: '/products/seller/top-products'
  },
  
  // Cart endpoints (buyer only)
  CART: {
    GET: '/cart',
    ADD: '/cart',
    UPDATE: (itemId) => `/cart/${itemId}`,
    REMOVE: (itemId) => `/cart/${itemId}`,
    CLEAR: '/cart',
    COUNT: '/cart/count',
    VALIDATE: '/cart/validate'
  },
  
  // Order endpoints
  ORDERS: {
    LIST: '/orders',
    CREATE: '/orders',
    BY_ID: (id) => `/orders/${id}`,
    UPDATE_STATUS: (id) => `/orders/${id}/status`,
    CONFIRM: (id) => `/orders/${id}/confirm`,
    CANCEL: (id) => `/orders/${id}/cancel`,
    STATS: '/orders/stats',
    RATE: (id) => `/orders/${id}/rate`
  },
  
  // Message endpoints
  MESSAGES: {
    BY_ORDER: (orderId) => `/messages/${orderId}`,
    SEND: '/messages',
    MARK_READ: (orderId) => `/messages/${orderId}/read`,
    DELETE: (messageId) => `/messages/${messageId}`,
    CONVERSATIONS: '/messages/conversations',
    UNREAD_COUNT: '/messages/unread-count'
  },
  
  // Map endpoints
  MAP: {
    SELLERS: '/map/sellers',
    MUNICIPALITIES: '/map/municipalities',
    DISTANCE: '/map/distance',
    ROUTE: '/map/route',
    SEARCH_ADDRESSES: '/map/search-addresses',
    GEOCODE: '/map/geocode',
    REVERSE_GEOCODE: '/map/reverse-geocode',
    NEARBY_SELLERS: '/map/nearby-sellers'
  },
  
  // Issue endpoints
  ISSUES: {
    CREATE: '/issues',
    MY_ISSUES: '/issues/my-issues',
    BY_ID: (id) => `/issues/${id}`,
    BY_ORDER: (orderId) => `/issues/order/${orderId}`,
    ADD_EVIDENCE: (id) => `/issues/${id}/evidence`,
    ADMIN_PENDING: '/issues/admin/pending',
    ADMIN_RESOLVED: '/issues/admin/resolved',
    ADMIN_REJECTED: '/issues/admin/rejected',
    ADMIN_STATS: '/issues/admin/stats',
    ADMIN_RESOLVE: (id) => `/issues/admin/${id}/resolve`,
    ADMIN_REJECT: (id) => `/issues/admin/${id}/reject`
  },
  
  // Notification endpoints
  NOTIFICATIONS: {
    MY_NOTIFICATIONS: '/notifications/my-notifications',
    MARK_READ: (id) => `/notifications/${id}/read`,
    MARK_ALL_READ: '/notifications/read-all',
    DELETE: (id) => `/notifications/${id}`,
    UNREAD_COUNT: '/notifications/unread-count',
    TEST: '/notifications/test'
  },
  
  // Admin endpoints
  ADMIN: {
    DASHBOARD: '/admin/dashboard',
    STATS: '/admin/stats',
    USERS: '/admin/users',
    USER_DETAILS: (id) => `/admin/users/${id}`,
    SUSPEND_USER: (id) => `/admin/users/${id}/suspend`,
    BAN_USER: (id) => `/admin/users/${id}/ban`,
    REINSTATE_USER: (id) => `/admin/users/${id}/reinstate`,
    DELETE_USER: (id) => `/admin/users/${id}`,
    LOGS: '/admin/logs',
    SOCKET_CONNECTIONS: '/admin/socket/connections',
    IP_BLOCKING: '/admin/security/ip-blocking',
    DATABASE_STATS: '/admin/database/stats'
  },
  
  // Logging endpoints
  LOGS: {
    ADMIN: '/logs/admin',
    AUDIT: (recordId) => `/logs/audit/${recordId}`,
    SECURITY: '/logs/security',
    AUTH_FAILURES: '/logs/auth-failures',
    AUDIT_STATS: '/logs/stats/audit',
    STATS: '/logs/stats',
    SEARCH: '/logs/search',
    USER_ACTIVITY: (userId) => `/logs/user/${userId}`,
    SUSPICIOUS: (userId) => `/logs/user/${userId}/suspicious`,
    EXPORT: '/logs/export',
    CLEANUP: '/logs/cleanup'
  },
  
  // Health check
  HEALTH: '/health'
};

// Build full URL
const buildUrl = (endpoint) => `${API_BASE}${endpoint}`;

// Export configuration
export { API_BASE, ENDPOINTS, buildUrl };
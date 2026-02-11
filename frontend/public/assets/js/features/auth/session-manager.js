// assets/js/features/auth/session-manager.js
// Session Management - Token refresh, auto-logout, activity monitoring

import { 
  checkTokenExpiration, 
  logout, 
  redirectToLogin,
  getToken,
  isTokenExpired,
  decodeToken
} from '../../core/auth.js';
import { showToast } from '../../components/toast.js';

// Configuration
const SESSION_CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes
const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes of inactivity
const TOKEN_REFRESH_BEFORE = 10 * 60 * 1000; // Refresh 10 minutes before expiry

// State
let sessionCheckTimer = null;
let inactivityTimer = null;
let lastActivityTime = Date.now();
let isRefreshing = false;

// ============ Session Monitoring ============

const initSessionManager = () => {
  // Start session checking
  startSessionCheck();
  
  // Start inactivity monitoring
  startInactivityMonitor();
  
  // Listen for auth changes
  window.addEventListener('auth:login', handleLogin);
  window.addEventListener('auth:logout', handleLogout);
  

};

const startSessionCheck = () => {
  if (sessionCheckTimer) {
    clearInterval(sessionCheckTimer);
  }
  
  sessionCheckTimer = setInterval(() => {
    checkSession();
  }, SESSION_CHECK_INTERVAL);
  
  // Also check immediately
  checkSession();
};

const stopSessionCheck = () => {
  if (sessionCheckTimer) {
    clearInterval(sessionCheckTimer);
    sessionCheckTimer = null;
  }
};

const checkSession = async () => {
  const token = getToken();
  
  if (!token) {
    stopSessionCheck();
    return;
  }
  
  // Check if token is expired
  if (isTokenExpired(token)) {
    handleSessionExpired();
    return;
  }
  
  // Check if token needs refresh
  const decoded = decodeToken(token);
  if (decoded && decoded.exp) {
    const expiresIn = (decoded.exp * 1000) - Date.now();
    
    if (expiresIn < TOKEN_REFRESH_BEFORE && !isRefreshing) {
      await attemptTokenRefresh();
    }
  }
};

const handleSessionExpired = () => {
  showToast('Your session has expired. Please login again.', 'warning');
  logout();
  
  setTimeout(() => {
    redirectToLogin(window.location.pathname);
  }, 2000);
};

// ============ Token Refresh ============

const attemptTokenRefresh = async () => {
  if (isRefreshing) return;
  
  isRefreshing = true;
  
  try {
    // Import auth service
    const { post } = await import('../../core/http.js');
    const { ENDPOINTS } = await import('../../config/api.js');
    
    // Call refresh endpoint
    const response = await post(ENDPOINTS.AUTH.REFRESH_TOKEN || '/auth/refresh');
    
    if (response.success && response.data?.token) {
      const { setToken } = await import('../../core/auth.js');
      setToken(response.data.token);
      

    }
  } catch (error) {
    console.error('Failed to refresh token:', error);
    // Don't force logout on refresh failure - let natural expiry handle it
  } finally {
    isRefreshing = false;
  }
};

// ============ Inactivity Monitoring ============

const startInactivityMonitor = () => {
  // Update activity on user actions
  const activityEvents = [
    'mousedown',
    'mousemove',
    'keypress',
    'scroll',
    'touchstart',
    'click'
  ];
  
  activityEvents.forEach(event => {
    document.addEventListener(event, handleActivity, { passive: true });
  });
  
  // Start inactivity timer
  resetInactivityTimer();
};

const handleActivity = () => {
  lastActivityTime = Date.now();
  resetInactivityTimer();
};

const resetInactivityTimer = () => {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
  }
  
  inactivityTimer = setTimeout(() => {
    handleInactivityTimeout();
  }, INACTIVITY_TIMEOUT);
};

const handleInactivityTimeout = () => {
  const token = getToken();
  
  if (!token) return;
  
  showToast('You have been logged out due to inactivity.', 'warning');
  logout();
  
  setTimeout(() => {
    redirectToLogin(window.location.pathname);
  }, 2000);
};

// ============ Event Handlers ============

const handleLogin = () => {
  startSessionCheck();
  resetInactivityTimer();
  lastActivityTime = Date.now();
};

const handleLogout = () => {
  stopSessionCheck();
  
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }
};

// ============ Manual Controls ============

const extendSession = async () => {
  lastActivityTime = Date.now();
  resetInactivityTimer();
  await checkSession();
};

const getSessionInfo = () => {
  const token = getToken();
  
  if (!token) {
    return {
      active: false,
      timeUntilExpiry: null,
      lastActivity: null
    };
  }
  
  const decoded = decodeToken(token);
  const timeUntilExpiry = decoded?.exp ? (decoded.exp * 1000) - Date.now() : null;
  const timeSinceActivity = Date.now() - lastActivityTime;
  
  return {
    active: true,
    timeUntilExpiry,
    lastActivity: lastActivityTime,
    timeSinceActivity,
    willExpireIn: timeUntilExpiry ? Math.floor(timeUntilExpiry / 1000 / 60) : null, // minutes
    inactiveSince: Math.floor(timeSinceActivity / 1000 / 60) // minutes
  };
};

// ============ Cleanup ============

const cleanup = () => {
  stopSessionCheck();
  
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }
  
  window.removeEventListener('auth:login', handleLogin);
  window.removeEventListener('auth:logout', handleLogout);
};

// ============ Auto-init ============

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSessionManager);
} else {
  initSessionManager();
}

// ============ Exports ============

export {
  initSessionManager,
  checkSession,
  extendSession,
  getSessionInfo,
  cleanup
};

export default {
  init: initSessionManager,
  check: checkSession,
  extend: extendSession,
  getInfo: getSessionInfo,
  cleanup
};
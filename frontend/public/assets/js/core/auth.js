// assets/js/core/auth.js
// Authentication Module - JWT Storage, Role Management, Redirects

const TOKEN_KEY = 'agrimarket_token';
const USER_KEY = 'agrimarket_user';
const REMEMBERED_EMAIL_KEY = 'agrimarket_remembered_email';
const REMEMBER_ME_KEY = 'agrimarket_remember_me';

// ============ Token Management ============

const setToken = (token) => {
  if (!token) return false;
  try {
    localStorage.setItem(TOKEN_KEY, token);
    return true;
  } catch (error) {
    console.error('Error saving token:', error);
    return false;
  }
};

const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (error) {
    console.error('Error retrieving token:', error);
    return null;
  }
};

const removeToken = () => {
  try {
    localStorage.removeItem(TOKEN_KEY);
    return true;
  } catch (error) {
    console.error('Error removing token:', error);
    return false;
  }
};

// ============ User Data Management ============

const setUser = (userData) => {
  if (!userData) return false;
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(userData));
    return true;
  } catch (error) {
    console.error('Error saving user data:', error);
    return false;
  }
};

const getUser = () => {
  try {
    const userData = localStorage.getItem(USER_KEY);
    // Handle cases where userData is null, "undefined", or empty string
    if (!userData || userData === 'undefined' || userData === '') {
      return null;
    }
    return JSON.parse(userData);
  } catch (error) {
    console.error('Error retrieving user data:', error);
    // Clear the corrupted data
    try {
      localStorage.removeItem(USER_KEY);
    } catch (e) {
      console.error('Error clearing corrupted user data:', e);
    }
    return null;
  }
};

const removeUser = () => {
  try {
    localStorage.removeItem(USER_KEY);
    return true;
  } catch (error) {
    console.error('Error removing user data:', error);
    return false;
  }
};

// ============ Authentication Status ============

const isAuthenticated = () => {
  const token = getToken();
  const user = getUser();
  return !!(token && user);
};

const getRole = () => {
  const user = getUser();
  return user?.role || null;
};

const getStatus = () => {
  const user = getUser();
  return user?.status || null;
};

const getUserId = () => {
  const user = getUser();
  return user?.id || null;
};

const isVerified = () => {
  const status = getStatus();
  return status === 'verified';
};

// ============ Role Checks ============

const isBuyer = () => getRole() === 'buyer';
const isSeller = () => getRole() === 'seller';
const isAdmin = () => getRole() === 'admin';

const hasRole = (...roles) => {
  const userRole = getRole();
  return roles.includes(userRole);
};

// ============ Login/Logout ============

const login = (token, userData) => {
  const tokenSaved = setToken(token);
  const userSaved = setUser(userData);
  
  if (tokenSaved && userSaved) {
    // Dispatch custom event for reactive components
    window.dispatchEvent(new CustomEvent('auth:login', { 
      detail: { user: userData } 
    }));
    return true;
  }
  
  return false;
};

const logout = (clearRemembered = false) => {
  const tokenRemoved = removeToken();
  const userRemoved = removeUser();
  
  // Clear remembered credentials if requested (e.g., on explicit logout)
  if (clearRemembered) {
    clearRememberedEmail();
  }
  
  if (tokenRemoved && userRemoved) {
    // Dispatch custom event
    window.dispatchEvent(new CustomEvent('auth:logout'));
    return true;
  }
  
  return false;
};

// ============ Redirects ============

const redirectToDashboard = () => {
  const role = getRole();
  
  if (!role) {
    window.location.href = '/index.html';
    return;
  }
  
  const dashboards = {
    buyer: '/buyer.html',
    seller: '/seller.html',
    admin: '/admin.html'
  };
  
  window.location.href = dashboards[role] || '/index.html';
};

const redirectToLogin = (returnUrl = null) => {
  const url = returnUrl 
    ? `/index.html?return=${encodeURIComponent(returnUrl)}`
    : '/index.html';
  window.location.href = url;
};

const redirectToVerification = () => {
  window.location.href = '/verification.html';
};

// ============ Page Access Control ============

const requireAuth = (allowedRoles = []) => {
  if (!isAuthenticated()) {
    redirectToLogin(window.location.pathname);
    return false;
  }
  
  if (allowedRoles.length > 0 && !hasRole(...allowedRoles)) {
    // Redirect to appropriate dashboard
    redirectToDashboard();
    return false;
  }
  
  return true;
};

const requireVerification = () => {
  if (!isAuthenticated()) {
    redirectToLogin();
    return false;
  }
  
  if (!isVerified()) {
    const status = getStatus();
    
    // If unverified or verification pending, redirect to verification page
    if (status === 'unverified' || status === 'verification_pending') {
      redirectToVerification();
      return false;
    }
    
    // If rejected, show message but allow access
    if (status === 'rejected') {
      console.warn('Verification rejected. Please resubmit documents.');
    }
  }
  
  return true;
};

const guestOnly = () => {
  if (isAuthenticated()) {
    redirectToDashboard();
    return false;
  }
  return true;
};

// ============ JWT Decode (Simple) ============

const decodeToken = (token) => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Error decoding token:', error);
    return null;
  }
};

const isTokenExpired = (token) => {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) return true;
  
  const currentTime = Math.floor(Date.now() / 1000);
  return decoded.exp < currentTime;
};

const checkTokenExpiration = () => {
  const token = getToken();
  if (!token) return false;
  
  if (isTokenExpired(token)) {
    logout();
    redirectToLogin();
    return false;
  }
  
  return true;
};

// ============ Auto-check on page load ============

const initAuthCheck = () => {
  // Check token expiration on page load
  checkTokenExpiration();
  
  // Set up periodic check every 5 minutes
  setInterval(checkTokenExpiration, 5 * 60 * 1000);
};

// Run on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuthCheck);
} else {
  initAuthCheck();
}

// ============ Remember Me Functionality ============

const setRememberedEmail = (email) => {
  if (!email) return false;
  try {
    localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
    localStorage.setItem(REMEMBER_ME_KEY, 'true');
    return true;
  } catch (error) {
    console.error('Error saving remembered email:', error);
    return false;
  }
};

const getRememberedEmail = () => {
  try {
    const rememberMe = localStorage.getItem(REMEMBER_ME_KEY);
    if (rememberMe === 'true') {
      return localStorage.getItem(REMEMBERED_EMAIL_KEY);
    }
    return null;
  } catch (error) {
    console.error('Error retrieving remembered email:', error);
    return null;
  }
};

const clearRememberedEmail = () => {
  try {
    localStorage.removeItem(REMEMBERED_EMAIL_KEY);
    localStorage.removeItem(REMEMBER_ME_KEY);
    return true;
  } catch (error) {
    console.error('Error clearing remembered email:', error);
    return false;
  }
};

const isRememberMeEnabled = () => {
  try {
    return localStorage.getItem(REMEMBER_ME_KEY) === 'true';
  } catch (error) {
    console.error('Error checking remember me status:', error);
    return false;
  }
};

// ============ Exports ============

export {
  // Token management
  setToken,
  getToken,
  removeToken,
  
  // User management
  setUser,
  getUser,
  removeUser,
  
  // Authentication status
  isAuthenticated,
  getRole,
  getStatus,
  getUserId,
  isVerified,
  
  // Role checks
  isBuyer,
  isSeller,
  isAdmin,
  hasRole,
  
  // Login/Logout
  login,
  logout,
  
  // Redirects
  redirectToDashboard,
  redirectToLogin,
  redirectToVerification,
  
  // Access control
  requireAuth,
  requireVerification,
  guestOnly,
  
  // Token utilities
  decodeToken,
  isTokenExpired,
  checkTokenExpiration,
  
  // Remember Me
  setRememberedEmail,
  getRememberedEmail,
  clearRememberedEmail,
  isRememberMeEnabled
};
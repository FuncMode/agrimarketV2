// assets/js/utils/security.js
// Security Utilities

/**
 * Sanitize HTML to prevent XSS attacks
 * This is a basic sanitizer - for production, consider using DOMPurify
 */
export const sanitizeHTML = (str) => {
  if (!str) return '';
  
  const temp = document.createElement('div');
  temp.textContent = str;
  return temp.innerHTML;
};

/**
 * Escape HTML entities
 */
export const escapeHTML = (str) => {
  if (!str) return '';
  
  const htmlEscapes = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;'
  };
  
  return str.replace(/[&<>"'\/]/g, (match) => htmlEscapes[match]);
};

/**
 * Validate URL to prevent javascript: and data: URLs
 */
export const isValidURL = (url) => {
  if (!url) return false;
  
  try {
    const parsed = new URL(url, window.location.origin);
    // Only allow http, https, and relative URLs
    return ['http:', 'https:', 'blob:'].includes(parsed.protocol);
  } catch {
    // Relative URLs will throw, check if it starts with /
    return url.startsWith('/') && !url.startsWith('//');
  }
};

/**
 * Check if running on HTTPS
 */
export const isSecureContext = () => {
  return window.isSecureContext || window.location.protocol === 'https:';
};

/**
 * Generate a random nonce for CSP
 */
export const generateNonce = () => {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * Validate input against common injection patterns
 */
export const detectInjection = (input) => {
  if (!input) return false;
  
  const dangerousPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<iframe/gi,
    /eval\(/gi,
    /expression\(/gi
  ];
  
  return dangerousPatterns.some(pattern => pattern.test(input));
};

/**
 * Secure localStorage wrapper
 */
export const secureStorage = {
  setItem: (key, value) => {
    try {
      // Could add encryption here in the future
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
      return false;
    }
  },
  
  getItem: (key) => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (e) {
      console.error('Failed to read from localStorage:', e);
      return null;
    }
  },
  
  removeItem: (key) => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.error('Failed to remove from localStorage:', e);
      return false;
    }
  },
  
  clear: () => {
    try {
      localStorage.clear();
      return true;
    } catch (e) {
      console.error('Failed to clear localStorage:', e);
      return false;
    }
  }
};

/**
 * Check for mixed content warnings
 */
export const checkMixedContent = () => {
  if (window.location.protocol === 'https:') {
    const resources = performance.getEntriesByType('resource');
    const insecureResources = resources.filter(r => 
      r.name.startsWith('http://') && !r.name.includes('localhost')
    );
    
    if (insecureResources.length > 0) {
      console.warn('⚠️ Mixed content detected:', insecureResources.map(r => r.name));
    }
  }
};

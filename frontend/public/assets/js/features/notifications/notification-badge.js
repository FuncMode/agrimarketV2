// assets/js/components/notification-badge.js
// Notification Badge Component - Reusable badge for any element

/**
 * Create and attach a notification badge to an element
 * @param {String|HTMLElement} target - Target element or selector
 * @param {Number} count - Number to display in badge
 * @param {Object} options - Configuration options
 */
const createBadge = (target, count = 0, options = {}) => {
  const {
    maxCount = 99,
    color = 'danger', // danger, primary, success, warning, info
    position = 'top-right', // top-right, top-left, bottom-right, bottom-left
    size = 'md', // sm, md, lg
    pulse = false,
    hide = false
  } = options;
  
  // Get target element
  let element = typeof target === 'string' ? document.querySelector(target) : target;
  
  if (!element) {
    console.error('Badge target element not found');
    return null;
  }
  
  // Ensure target is positioned
  const computedStyle = window.getComputedStyle(element);
  if (computedStyle.position === 'static') {
    element.style.position = 'relative';
  }
  
  // Remove existing badge if present
  const existingBadge = element.querySelector('.notification-badge');
  if (existingBadge) {
    existingBadge.remove();
  }
  
  // Create badge
  const badge = document.createElement('span');
  badge.className = `notification-badge badge-${color} badge-${size} badge-${position}`;
  
  if (pulse) {
    badge.classList.add('badge-pulse');
  }
  
  // Set text
  const displayCount = count > maxCount ? `${maxCount}+` : count;
  badge.textContent = displayCount;
  
  // Hide if count is 0 or hide option is true
  if (count === 0 || hide) {
    badge.style.display = 'none';
  }
  
  // Append to target
  element.appendChild(badge);
  
  return badge;
};

/**
 * Update existing badge count
 * @param {String|HTMLElement} target - Target element or selector
 * @param {Number} count - New count to display
 */
const updateBadge = (target, count, options = {}) => {
  const element = typeof target === 'string' ? document.querySelector(target) : target;
  
  if (!element) return null;
  
  const badge = element.querySelector('.notification-badge');
  
  if (!badge) {
    // Create new badge if doesn't exist
    return createBadge(target, count, options);
  }
  
  const { maxCount = 99, pulse = false } = options;
  const displayCount = count > maxCount ? `${maxCount}+` : count;
  
  badge.textContent = displayCount;
  
  // Show/hide based on count
  if (count > 0) {
    badge.style.display = 'block';
    
    if (pulse) {
      badge.classList.add('badge-pulse');
      setTimeout(() => {
        badge.classList.remove('badge-pulse');
      }, 1000);
    }
  } else {
    badge.style.display = 'none';
  }
  
  return badge;
};

/**
 * Remove badge from element
 * @param {String|HTMLElement} target - Target element or selector
 */
const removeBadge = (target) => {
  const element = typeof target === 'string' ? document.querySelector(target) : target;
  
  if (!element) return;
  
  const badge = element.querySelector('.notification-badge');
  if (badge) {
    badge.remove();
  }
};

/**
 * Show badge
 * @param {String|HTMLElement} target - Target element or selector
 */
const showBadge = (target) => {
  const element = typeof target === 'string' ? document.querySelector(target) : target;
  
  if (!element) return;
  
  const badge = element.querySelector('.notification-badge');
  if (badge) {
    badge.style.display = 'block';
  }
};

/**
 * Hide badge
 * @param {String|HTMLElement} target - Target element or selector
 */
const hideBadge = (target) => {
  const element = typeof target === 'string' ? document.querySelector(target) : target;
  
  if (!element) return;
  
  const badge = element.querySelector('.notification-badge');
  if (badge) {
    badge.style.display = 'none';
  }
};

/**
 * Get badge count
 * @param {String|HTMLElement} target - Target element or selector
 */
const getBadgeCount = (target) => {
  const element = typeof target === 'string' ? document.querySelector(target) : target;
  
  if (!element) return 0;
  
  const badge = element.querySelector('.notification-badge');
  if (!badge) return 0;
  
  const text = badge.textContent;
  if (text.includes('+')) {
    return parseInt(text.replace('+', ''));
  }
  
  return parseInt(text) || 0;
};

// ============ Add Badge Styles ============

if (!document.getElementById('notification-badge-styles')) {
  const style = document.createElement('style');
  style.id = 'notification-badge-styles';
  style.textContent = `
    .notification-badge {
      position: absolute;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      border-radius: 9999px;
      line-height: 1;
      white-space: nowrap;
      pointer-events: none;
      z-index: 10;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    /* Sizes */
    .notification-badge.badge-sm {
      min-width: 1rem;
      height: 1rem;
      padding: 0.125rem 0.25rem;
      font-size: 0.625rem;
    }
    
    .notification-badge.badge-md {
      min-width: 1.25rem;
      height: 1.25rem;
      padding: 0.125rem 0.375rem;
      font-size: 0.75rem;
    }
    
    .notification-badge.badge-lg {
      min-width: 1.5rem;
      height: 1.5rem;
      padding: 0.25rem 0.5rem;
      font-size: 0.875rem;
    }
    
    /* Positions */
    .notification-badge.badge-top-right {
      top: -6px;
      right: -6px;
    }
    
    .notification-badge.badge-top-left {
      top: -6px;
      left: -6px;
    }
    
    .notification-badge.badge-bottom-right {
      bottom: -6px;
      right: -6px;
    }
    
    .notification-badge.badge-bottom-left {
      bottom: -6px;
      left: -6px;
    }
    
    /* Colors */
    .notification-badge.badge-danger {
      background-color: var(--color-danger);
      color: white;
    }
    
    .notification-badge.badge-primary {
      background-color: var(--color-primary);
      color: white;
    }
    
    .notification-badge.badge-success {
      background-color: var(--color-success);
      color: white;
    }
    
    .notification-badge.badge-warning {
      background-color: var(--color-warning);
      color: var(--color-dark);
    }
    
    .notification-badge.badge-info {
      background-color: var(--color-info);
      color: white;
    }
    
    /* Animation */
    .notification-badge.badge-pulse {
      animation: badge-pulse 1s ease;
    }
    
    @keyframes badge-pulse {
      0%, 100% { 
        transform: scale(1);
        opacity: 1;
      }
      50% { 
        transform: scale(1.3);
        opacity: 0.8;
      }
    }
  `;
  document.head.appendChild(style);
}

// ============ Exports ============

export {
  createBadge,
  updateBadge,
  removeBadge,
  showBadge,
  hideBadge,
  getBadgeCount
};

export default {
  create: createBadge,
  update: updateBadge,
  remove: removeBadge,
  show: showBadge,
  hide: hideBadge,
  getCount: getBadgeCount
};
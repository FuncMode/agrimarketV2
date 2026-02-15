// General utility functions

export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

export const throttle = (func, limit) => {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

export const generateId = () => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Failed to copy:', error);
    return false;
  }
};

export const downloadFile = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};

export const getQueryParams = () => {
  const params = new URLSearchParams(window.location.search);
  const result = {};
  for (const [key, value] of params) {
    result[key] = value;
  }
  return result;
};

export const setQueryParam = (key, value) => {
  const url = new URL(window.location);
  url.searchParams.set(key, value);
  window.history.pushState({}, '', url);
};

export const removeQueryParam = (key) => {
  const url = new URL(window.location);
  url.searchParams.delete(key);
  window.history.pushState({}, '', url);
};

export const scrollToTop = (smooth = true) => {
  window.scrollTo({
    top: 0,
    behavior: smooth ? 'smooth' : 'auto'
  });
};

export const scrollToElement = (elementId, smooth = true) => {
  const element = document.getElementById(elementId);
  if (element) {
    element.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
      block: 'start'
    });
  }
};

export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const retry = async (fn, retries = 3, delay = 1000) => {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;
    await sleep(delay);
    return retry(fn, retries - 1, delay);
  }
};

export const attachPasswordToggleHandler = (toggleElement, inputElement) => {
  if (!toggleElement || !inputElement) return;

  // Click to toggle visibility
  toggleElement.addEventListener('click', (e) => {
    e.preventDefault();
    const isPassword = inputElement.type === 'password';
    inputElement.type = isPassword ? 'text' : 'password';
    
    const icon = toggleElement.querySelector('i');
    if (icon) {
      icon.className = `bi bi-eye${isPassword ? '-slash' : ''} text-gray-400 hover:text-gray-600 transition-colors`;
    }
  });

  // Show/hide toggle based on input state
  inputElement.addEventListener('input', () => {
    toggleElement.style.opacity = inputElement.value.length > 0 ? '1' : '0.7';
  });

  // Focus ring for accessibility
  toggleElement.addEventListener('focus', function() {
    this.style.outline = '2px solid #16a34a';
    this.style.outlineOffset = '2px';
  });

  toggleElement.addEventListener('blur', function() {
    this.style.outline = 'none';
  });
};

export const updateBadgeDisplay = (badgeElement, count, options = {}) => {
  if (!badgeElement) return;

  const { maxCount = 99, animate = true } = options;

  if (count > 0) {
    badgeElement.textContent = count > maxCount ? `${maxCount}+` : count;
    badgeElement.style.display = 'block';

    if (animate) {
      badgeElement.classList.add('pulse-animation', 'badge-pulse');
      setTimeout(() => {
        badgeElement.classList.remove('pulse-animation', 'badge-pulse');
      }, 1000);
    }
  } else {
    badgeElement.style.display = 'none';
  }
};
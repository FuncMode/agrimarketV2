
const createSpinner = (size = 'md', color = 'primary') => {
  const spinner = document.createElement('div');
  spinner.className = `loading-spinner loading-spinner-${size}`;
  
  const colors = {
    primary: 'var(--color-primary)',
    secondary: 'var(--color-secondary)',
    white: '#ffffff',
    dark: 'var(--color-dark)'
  };
  
  spinner.style.cssText = `
    border: 3px solid var(--color-gray-300);
    border-top: 3px solid ${colors[color] || colors.primary};
    border-radius: 50%;
    animation: spin 1s linear infinite;
  `;
  
  const sizes = {
    sm: { width: '20px', height: '20px', borderWidth: '2px' },
    md: { width: '40px', height: '40px', borderWidth: '3px' },
    lg: { width: '60px', height: '60px', borderWidth: '4px' }
  };
  
  const sizeStyle = sizes[size] || sizes.md;
  Object.assign(spinner.style, sizeStyle);
  
  return spinner;
};

const showPageLoader = (message = 'Loading...') => {
  hidePageLoader();
  
  const overlay = document.createElement('div');
  overlay.id = 'page-loader-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(255, 255, 255, 0.9);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    gap: 1rem;
  `;
  
  const spinner = createSpinner('lg', 'primary');
  const text = document.createElement('p');
  text.textContent = message;
  text.style.cssText = `
    color: var(--color-dark);
    font-size: 1rem;
    margin: 0;
    font-weight: 500;
  `;
  
  overlay.appendChild(spinner);
  overlay.appendChild(text);
  document.body.appendChild(overlay);
  
  document.body.style.overflow = 'hidden';
};

const hidePageLoader = () => {
  const overlay = document.getElementById('page-loader-overlay');
  if (overlay) {
    overlay.remove();
    document.body.style.overflow = '';
  }
};

const showSpinner = (element, size = 'md', color = 'primary', message = null) => {
  if (typeof element === 'string') {
    element = document.querySelector(element);
  }
  
  if (!element) return;
  
  element.dataset.originalContent = element.innerHTML;
  
  const container = document.createElement('div');
  container.className = 'spinner-container';
  container.style.cssText = `
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 2rem;
  `;
  
  const spinner = createSpinner(size, color);
  container.appendChild(spinner);
  
  if (message) {
    const text = document.createElement('p');
    text.textContent = message;
    text.style.cssText = `
      color: var(--color-gray-600);
      margin: 0;
      font-size: 0.875rem;
    `;
    container.appendChild(text);
  }
  
  element.innerHTML = '';
  element.appendChild(container);
};

const hideSpinner = (element) => {
  if (typeof element === 'string') {
    element = document.querySelector(element);
  }
  
  if (!element) return;
  
  const originalContent = element.dataset.originalContent;
  if (originalContent) {
    element.innerHTML = originalContent;
    delete element.dataset.originalContent;
  }
};

const inlineSpinner = (size = 'sm', color = 'primary') => {
  const colors = {
    primary: 'var(--color-primary)',
    secondary: 'var(--color-secondary)',
    white: '#ffffff',
    dark: 'var(--color-dark)'
  };
  
  const sizes = {
    sm: '16px',
    md: '24px',
    lg: '32px'
  };
  
  return `
    <div class="inline-spinner" style="
      display: inline-block;
      width: ${sizes[size] || sizes.sm};
      height: ${sizes[size] || sizes.sm};
      border: 2px solid var(--color-gray-300);
      border-top: 2px solid ${colors[color] || colors.primary};
      border-radius: 50%;
      animation: spin 1s linear infinite;
    "></div>
  `;
};

if (!document.getElementById('spinner-animations')) {
  const style = document.createElement('style');
  style.id = 'spinner-animations';
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

export {
  createSpinner,
  showPageLoader,
  hidePageLoader,
  showSpinner,
  hideSpinner,
  inlineSpinner
};
// assets/js/components/toast.js
// Toast Notification Component

import { 
  playNotificationSound, 
  playSuccessSound, 
  playWarningSound, 
  playErrorSound 
} from '../features/notifications/notification-sound.js';

let toastContainer = null;
let toastId = 0;

const initToastContainer = () => {
  if (!toastContainer) {
    toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      toastContainer.className = 'fixed top-4 right-4 z-50 space-y-2';
      toastContainer.style.cssText = `
        position: fixed;
        top: 1rem;
        right: 1rem;
        z-index: 1080;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      `;
      document.body.appendChild(toastContainer);
    }
  }
  return toastContainer;
};

const createToast = (message, type = 'info', duration = 4000, playSound = true) => {
  const container = initToastContainer();
  const id = `toast-${++toastId}`;
  
  // Play sound based on type
  if (playSound) {
    console.log(`[Toast] Attempting to play sound. Type: ${type}`);
    try {
      switch (type) {
        case 'success':
          playSuccessSound();
          break;
        case 'error':
          playErrorSound();
          break;
        case 'warning':
          playWarningSound();
          break;
        case 'info':
        default:
          playNotificationSound();
          break;
      }
    } catch (error) {
      console.warn('[Toast] Could not play sound:', error);
    }
  } else {
    console.log(`[Toast] Sound disabled for this toast. Type: ${type}`);
  }
  
  const icons = {
    success: '<i class="bi bi-check-circle-fill text-success"></i>',
    error: '<i class="bi bi-x-circle-fill text-danger"></i>',
    warning: '<i class="bi bi-exclamation-triangle-fill text-warning"></i>',
    info: '<i class="bi bi-info-circle-fill text-info"></i>'
  };
  
  const toast = document.createElement('div');
  toast.id = id;
  toast.className = `toast toast-${type}`;
  toast.style.cssText = `
    min-width: 300px;
    padding: 1rem 1.25rem;
    background: white;
    border-radius: 0.75rem;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
    display: flex;
    align-items: center;
    gap: 1rem;
    animation: slideInDown 0.3s ease;
    border-left: 4px solid;
  `;
  
  // Set border color based on type
  const borderColors = {
    success: '#28a745',
    error: '#dc3545',
    warning: '#ffc107',
    info: '#17a2b8'
  };
  toast.style.borderColor = borderColors[type] || borderColors.info;
  
  toast.innerHTML = `
    <div class="toast-icon" style="font-size: 1.5rem; flex-shrink: 0;">
      ${icons[type] || icons.info}
    </div>
    <div class="toast-content" style="flex: 1; color: #212529;">
      ${message}
    </div>
    <button class="toast-close" style="background: none; border: none; font-size: 1.25rem; cursor: pointer; color: #6c757d; padding: 0;">
      <i class="bi bi-x"></i>
    </button>
  `;
  
  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => removeToast(id));
  
  container.appendChild(toast);
  
  // Auto-remove after duration
  if (duration > 0) {
    setTimeout(() => removeToast(id), duration);
  }
  
  return id;
};

const removeToast = (id) => {
  const toast = document.getElementById(id);
  if (toast) {
    toast.style.animation = 'slideOutUp 0.3s ease';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }
};

// Convenience functions
const showToast = (message, type = 'info', duration = 4000, playSound = true) => {
  return createToast(message, type, duration, playSound);
};

const showSuccess = (message, duration = 4000, playSound = true) => {
  return createToast(message, 'success', duration, playSound);
};

const showError = (message, duration = 5000, playSound = true) => {
  return createToast(message, 'error', duration, playSound);
};

const showWarning = (message, duration = 4000, playSound = true) => {
  return createToast(message, 'warning', duration, playSound);
};

const showInfo = (message, duration = 4000, playSound = true) => {
  return createToast(message, 'info', duration, playSound);
};

// Add animation CSS if not present
if (!document.getElementById('toast-animations')) {
  const style = document.createElement('style');
  style.id = 'toast-animations';
  style.textContent = `
    @keyframes slideInDown {
      from {
        transform: translateY(-20px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
    
    @keyframes slideOutUp {
      from {
        transform: translateY(0);
        opacity: 1;
      }
      to {
        transform: translateY(-20px);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
}

export {
  showToast,
  showSuccess,
  showError,
  showWarning,
  showInfo,
  createToast,
  removeToast
};
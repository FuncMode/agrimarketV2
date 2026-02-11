// Centralized error handling

import { showToast } from '../components/toast.js';

export const handleError = (error, context = '') => {
  console.error(`Error ${context}:`, error);
  
  const message = error.message || 'An unexpected error occurred';
  const status = error.status || 500;
  
  // Show user-friendly error message
  showToast(message, 'error');
  
  // Log to console in development
  if (window.location.hostname === 'localhost') {
    console.error('Full error:', error);
  }
  
  // Return formatted error
  return {
    success: false,
    message,
    status,
    errors: error.errors || null
  };
};

export const handleAPIError = (error) => {
  if (error.status === 401) {
    showToast('Session expired. Please login again.', 'error');
    // Redirect to login after a delay
    setTimeout(() => {
      import('./core/auth.js').then(({ redirectToLogin }) => {
        redirectToLogin();
      });
    }, 2000);
    return;
  }
  
  if (error.status === 403) {
    showToast('Access denied. You do not have permission.', 'error');
    return;
  }
  
  if (error.status === 404) {
    showToast('Resource not found.', 'error');
    return;
  }
  
  if (error.status === 429) {
    showToast('Too many requests. Please slow down.', 'warning');
    return;
  }
  
  if (error.status >= 500) {
    showToast('Server error. Please try again later.', 'error');
    return;
  }
  
  // Generic error
  handleError(error);
};

export const handleFormError = (error, formElement) => {
  if (error.errors && Array.isArray(error.errors)) {
    // Show field-specific errors
    error.errors.forEach(err => {
      const field = formElement.querySelector(`[name="${err.field}"]`);
      if (field) {
        field.classList.add('is-invalid');
        const feedback = field.nextElementSibling;
        if (feedback && feedback.classList.contains('invalid-feedback')) {
          feedback.textContent = err.message;
          feedback.style.display = 'block';
        }
      }
    });
  } else {
    // Show general error
    handleError(error);
  }
};
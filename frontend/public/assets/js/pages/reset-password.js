// assets/js/pages/reset-password.js
// Password Reset Page Script

import { post } from '../core/http.js';
import { ENDPOINTS } from '../config/api.js';
import { showToast, showError, showSuccess } from '../components/toast.js';
import { validatePassword, passwordsMatch } from '../utils/validators.js';
import { getQueryParams } from '../utils/helpers.js';

// ============ State ============

let resetToken = null;
let userEmail = null;

// ============ Initialization ============

const init = () => {

  
  // Get token from URL
  const params = getQueryParams();
  resetToken = params.token;
  userEmail = params.email;
  
  if (!resetToken || !userEmail) {
    showError('Invalid or missing reset link. Please request a new password reset.');
    setTimeout(() => {
      window.location.href = '/index.html';
    }, 3000);
    return;
  }
  
  // Populate email field
  const emailInput = document.getElementById('email');
  if (emailInput) {
    emailInput.value = decodeURIComponent(userEmail);
  }
  
  // Attach event listeners
  attachEventListeners();
  

};

// ============ Event Listeners ============

const attachEventListeners = () => {
  const form = document.getElementById('reset-password-form');
  if (form) {
    form.addEventListener('submit', handleResetPassword);
  }
  
  // Attach password toggle listeners and hide/show on input
  document.querySelectorAll('.password-toggle').forEach(btn => {
    const targetId = btn.getAttribute('data-target');
    const input = document.getElementById(targetId);
    
    // Click handler
    btn.addEventListener('click', handlePasswordToggle);
    
    // Show/hide toggle on input activity
    if (input) {
      input.addEventListener('focus', () => {
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
      });
      
      input.addEventListener('input', () => {
        btn.style.opacity = '0.5';
        btn.style.pointerEvents = 'none';
      });
      
      input.addEventListener('blur', () => {
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
      });
    }
    
    // Hover effects
    btn.addEventListener('mouseenter', function() {
      if (this.style.opacity !== '0.5') {
        this.style.backgroundColor = 'var(--color-gray-200)';
      }
    });
    btn.addEventListener('mouseleave', function() {
      this.style.backgroundColor = 'transparent';
    });
  });
};

const handlePasswordToggle = (e) => {
  e.preventDefault();
  const targetId = e.currentTarget.getAttribute('data-target');
  const input = document.getElementById(targetId);
  if (!input) return;
  
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  
  const icon = e.currentTarget.querySelector('i');
  if (icon) {
    icon.className = `bi bi-eye${isPassword ? '-slash' : ''}`;
  }
};

// ============ Form Handling ============

const handleResetPassword = async (e) => {
  e.preventDefault();
  
  // Clear previous errors
  clearErrors();
  
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;
  
  // Validate password
  const passwordValidation = validatePassword(newPassword);
  if (!passwordValidation.valid) {
    showFieldError('new-password', passwordValidation.message);
    return;
  }
  
  // Validate passwords match
  const matchValidation = passwordsMatch(newPassword, confirmPassword);
  if (!matchValidation.valid) {
    showFieldError('confirm-password', matchValidation.message);
    return;
  }
  
  // Disable submit button
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Resetting Password...';
  
  try {
    const response = await post(ENDPOINTS.AUTH.RESET_PASSWORD, {
      token: resetToken,
      email: userEmail,
      new_password: newPassword,
      confirm_password: confirmPassword
    });
    
    if (response.success) {
      showSuccess('Password reset successfully! Redirecting to login...');
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        window.location.href = '/index.html';
      }, 2000);
    }
  } catch (error) {
    console.error('Error resetting password:', error);
    
    // Check for specific error types
    if (error.status === 400) {
      showError(error.message || 'Invalid reset token or token has expired');
    } else if (error.status === 404) {
      showError('Reset token not found. Please request a new password reset.');
    } else {
      showError(error.message || 'Failed to reset password. Please try again.');
    }
    
    // Re-enable submit button
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnText;
  }
};

// ============ Error Handling ============

const showFieldError = (fieldId, message) => {
  const field = document.getElementById(fieldId);
  if (!field) return;
  
  field.classList.add('is-invalid');
  
  const feedback = field.parentElement.querySelector('.invalid-feedback');
  if (feedback) {
    feedback.textContent = message;
    feedback.style.display = 'block';
  }
};

const clearFieldError = (fieldId) => {
  const field = document.getElementById(fieldId);
  if (!field) return;
  
  field.classList.remove('is-invalid');
  
  const feedback = field.parentElement.querySelector('.invalid-feedback');
  if (feedback) {
    feedback.style.display = 'none';
  }
};

const clearErrors = () => {
  document.querySelectorAll('.is-invalid').forEach(field => {
    field.classList.remove('is-invalid');
  });
  
  document.querySelectorAll('.invalid-feedback').forEach(feedback => {
    feedback.style.display = 'none';
  });
};

// ============ Password Strength Indicator ============

const updatePasswordStrength = (password) => {
  const strengthIndicator = document.getElementById('password-strength');
  if (!strengthIndicator) return;
  
  let strength = 0;
  
  // Check length
  if (password.length >= 8) strength++;
  if (password.length >= 12) strength++;
  
  // Check character types
  if (/[a-z]/.test(password)) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[@$!%*?&#]/.test(password)) strength++;
  
  // Calculate strength level
  let level = 'weak';
  let color = 'var(--color-danger)';
  let width = '33%';
  
  if (strength >= 4) {
    level = 'strong';
    color = 'var(--color-success)';
    width = '100%';
  } else if (strength >= 3) {
    level = 'medium';
    color = 'var(--color-warning)';
    width = '66%';
  }
  
  // Update UI
  strengthIndicator.innerHTML = `
    <div class="password-strength-bar" style="
      background-color: ${color};
      width: ${width};
      height: 4px;
      border-radius: 2px;
      transition: all 0.3s ease;
    "></div>
    <p style="font-size: 0.875rem; margin-top: var(--spacing-sm); margin-bottom: 0; color: ${color};">
      Password strength: <strong>${level}</strong>
    </p>
  `;
};

// Add password strength indicator to new password field
const newPasswordField = document.getElementById('new-password');
if (newPasswordField) {
  const strengthContainer = document.getElementById('password-strength');
  if (strengthContainer) {
    newPasswordField.addEventListener('input', (e) => {
      updatePasswordStrength(e.target.value);
    });
  }
}

// ============ Initialize on Load ============

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export { init, handleResetPassword };
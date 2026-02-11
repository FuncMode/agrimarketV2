// assets/js/features/auth/password-reset.js
import { post } from '../../core/http.js';
import { ENDPOINTS } from '../../config/api.js';
import { createModal } from '../../components/modal.js';
import { showToast, showError } from '../../components/toast.js';
import { validateEmail } from '../../utils/validators.js';

const showForgotPasswordModal = () => {
  const modalContent = `
    <form id="forgot-password-form" class="space-y-4">
      <p class="text-gray-600">
        Enter your email address and we'll send you a link to reset your password.
      </p>
      
      <div class="form-group">
        <label class="form-label">Email Address</label>
        <input 
          type="email" 
          id="forgot-email" 
          class="form-control"
          placeholder="your@email.com"
          required
        >
        <div class="invalid-feedback"></div>
      </div>
      
      <button type="submit" class="btn btn-primary w-full">
        <i class="bi bi-envelope"></i> Send Reset Link
      </button>
    </form>
  `;
  
  const modal = createModal({
    title: 'Forgot Password',
    content: modalContent,
    size: 'sm'
  });
  
  const form = document.getElementById('forgot-password-form');
  form.addEventListener('submit', handleForgotPassword);
};

const handleForgotPassword = async (e) => {
  e.preventDefault();
  
  const email = document.getElementById('forgot-email').value;
  
  const validation = validateEmail(email);
  if (!validation.valid) {
    showError(validation.message);
    return;
  }
  
  try {
    const response = await post(ENDPOINTS.AUTH.FORGOT_PASSWORD, { email });
    
    if (response.success) {
      showToast('Password reset link sent to your email!', 'success');
      setTimeout(() => {
        window.location.href = '/index.html';
      }, 2000);
    }
  } catch (error) {
    showError(error.message || 'Failed to send reset link');
  }
};

export { showForgotPasswordModal, handleForgotPassword };
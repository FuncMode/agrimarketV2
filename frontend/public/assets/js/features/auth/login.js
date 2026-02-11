// assets/js/features/auth/login.js
import { post } from '../../core/http.js';
import { ENDPOINTS } from '../../config/api.js';
import { login, redirectToDashboard, setRememberedEmail, getRememberedEmail, clearRememberedEmail, isRememberMeEnabled } from '../../core/auth.js';
import { createModal, closeModal } from '../../components/modal.js';
import { showToast, showError } from '../../components/toast.js';
import { validateEmail, validateRequired } from '../../utils/validators.js';

const showLoginModal = () => {
  const modalContent = `
    <form id="login-form" class="space-y-6">
      <!-- Header Section -->
      <div class="text-center pb-4 border-b border-gray-100">
        <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <i class="bi bi-box-arrow-in-right text-2xl text-green-600"></i>
        </div>
        <h3 class="text-lg font-semibold text-gray-900 mb-1">Welcome Back</h3>
        <p class="text-sm text-gray-600">Sign in to your AgriMarket account</p>
      </div>

      <!-- Login Fields -->
      <div class="space-y-4">
        <div class="form-group">
          <label class="form-label text-base font-medium text-gray-900">Email Address</label>
          <div class="relative">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <i class="bi bi-envelope text-gray-400"></i>
            </div>
            <input 
              type="email" 
              id="login-email" 
              name="email"
              class="form-control pl-10"
              placeholder="your@email.com"
              required
            >
          </div>
          <div class="invalid-feedback"></div>
        </div>
        
        <div class="form-group">
          <label class="form-label text-base font-medium text-gray-900">Password</label>
          <div class="relative">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <i class="bi bi-lock text-gray-400"></i>
            </div>
            <input 
              type="password" 
              id="login-password" 
              name="password"
              class="form-control pl-10 pr-12"
              placeholder="Enter your password"
              required
            >
            <button type="button" class="password-toggle absolute inset-y-0 right-0 pr-3 flex items-center" data-target="login-password">
              <i class="bi bi-eye text-gray-400 hover:text-gray-600 transition-colors"></i>
            </button>
          </div>
          <div class="invalid-feedback"></div>
        </div>
      </div>
      
      <!-- Remember Me & Forgot Password -->
      <div class="flex items-center justify-between py-2">
        <div class="flex items-center space-x-2">
          <input type="checkbox" id="remember-me" class="form-check-input text-green-600 focus:ring-green-500 border-gray-300 rounded">
          <label for="remember-me" class="text-sm text-gray-700 cursor-pointer">
            Remember me for 30 days
          </label>
        </div>
        <a href="#" id="forgot-password" class="text-sm text-green-600 font-medium hover:text-green-700 transition-colors">
          Forgot password?
        </a>
      </div>
      
      <!-- Submit Button -->
      <button type="submit" class="btn btn-primary w-full py-3 text-lg font-medium bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 transform hover:scale-[1.02] transition-all duration-200 shadow-lg hover:shadow-xl">
        <i class="bi bi-box-arrow-in-right mr-2"></i>
        Sign In
      </button>
      
      <!-- Divider -->
      <div class="relative flex items-center justify-center py-4">
        <div class="absolute inset-0 flex items-center">
          <div class="w-full border-t border-gray-200"></div>
        </div>
        <div class="relative px-4 bg-white">
          <span class="text-xs text-gray-500 uppercase tracking-wide">New to AgriMarket?</span>
        </div>
      </div>
      
      <!-- Signup Link -->
      <div class="text-center pt-2">
        <p class="text-sm text-gray-600">
          Don't have an account? 
          <a href="#" id="switch-to-signup" class="text-green-600 font-semibold hover:text-green-700 transition-colors ml-1">
            Create your account
          </a>
        </p>
      </div>
    </form>
    
    <style>
      .form-control:focus, .form-select:focus {
        border-color: #16a34a !important;
        box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.1) !important;
      }
      
      .password-toggle {
        background: none !important;
        border: none !important;
        cursor: pointer !important;
        padding: 0.5rem !important;
        border-radius: 0.375rem !important;
        transition: all 150ms ease !important;
      }
      
      .password-toggle:hover {
        background-color: rgba(0, 0, 0, 0.05) !important;
      }
      
      .password-toggle:focus {
        outline: 2px solid #16a34a !important;
        outline-offset: 2px !important;
      }
      
      .form-check-input:checked {
        background-color: #16a34a !important;
        border-color: #16a34a !important;
      }
      
      .form-check-input:focus {
        box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.1) !important;
      }
      
      /* Smooth focus transitions */
      .form-control, .form-select {
        transition: border-color 150ms ease, box-shadow 150ms ease !important;
      }
      
      /* Enhanced hover states */
      a:hover {
        text-decoration: none !important;
      }
      
      /* Button enhancement */
      .btn:active {
        transform: scale(0.98) !important;
      }
    </style>
  `;
  
  const modal = createModal({
    title: '',
    content: modalContent,
    size: 'md',
    showHeader: false
  });
  
  // Pre-fill form if credentials are remembered
  const rememberedEmail = getRememberedEmail();
  const emailInput = modal.body.querySelector('#login-email');
  const rememberCheckbox = modal.body.querySelector('#remember-me');
  
  if (rememberedEmail && emailInput) {
    emailInput.value = rememberedEmail;
    if (rememberCheckbox) {
      rememberCheckbox.checked = isRememberMeEnabled();
    }
  }
  
  // Attach event listeners
  const form = modal.body.querySelector('#login-form');
  form.addEventListener('submit', handleLogin);
  
  // Attach password toggle
  const passwordToggle = modal.body.querySelector('.password-toggle');
  if (passwordToggle) {
    passwordToggle.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = passwordToggle.getAttribute('data-target');
      const input = modal.body.querySelector(`#${targetId}`);
      if (!input) return;
      
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      
      const icon = passwordToggle.querySelector('i');
      if (icon) {
        icon.className = `bi bi-eye${isPassword ? '-slash' : ''} text-gray-400 hover:text-gray-600 transition-colors`;
      }
    });
    
    // Enhanced hover and focus effects
    const passwordInput = modal.body.querySelector('#login-password');
    if (passwordInput) {
      // Show/hide toggle based on input state
      passwordInput.addEventListener('input', () => {
        passwordToggle.style.opacity = passwordInput.value.length > 0 ? '1' : '0.7';
      });
      
      // Enhanced hover effects for better UX
      passwordToggle.addEventListener('mouseenter', function() {
        this.style.backgroundColor = 'rgba(0, 0, 0, 0.08)';
        this.style.transform = 'scale(1.1)';
      });
      
      passwordToggle.addEventListener('mouseleave', function() {
        this.style.backgroundColor = 'transparent';
        this.style.transform = 'scale(1)';
      });
      
      // Focus ring for accessibility
      passwordToggle.addEventListener('focus', function() {
        this.style.outline = '2px solid #16a34a';
        this.style.outlineOffset = '2px';
      });
      
      passwordToggle.addEventListener('blur', function() {
        this.style.outline = 'none';
      });
    }
  }
  
  const switchSignup = modal.body.querySelector('#switch-to-signup');
  switchSignup.addEventListener('click', (e) => {
    e.preventDefault();
    modal.close();
    import('./signup.js').then(m => m.showSignupModal());
  });
  
  const forgotPassword = modal.body.querySelector('#forgot-password');
  forgotPassword.addEventListener('click', (e) => {
    e.preventDefault();
    modal.close();
    import('./password-reset.js').then(m => m.showForgotPasswordModal());
  });
};

const handleLogin = async (e) => {
  e.preventDefault();
  
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const rememberMe = document.getElementById('remember-me').checked;
  
  // Validate
  const emailValidation = validateEmail(email);
  const passwordValidation = validateRequired(password, 'Password');
  
  if (!emailValidation.valid) {
    showError(emailValidation.message);
    return;
  }
  
  if (!passwordValidation.valid) {
    showError(passwordValidation.message);
    return;
  }
  
  try {
    const response = await post(ENDPOINTS.AUTH.LOGIN, { email, password });
    
    if (response.success) {
      const { token, user } = response.data;
      
      // Handle Remember Me functionality
      if (rememberMe) {
        setRememberedEmail(email);
        showToast('Login successful! We\'ll remember you next time.', 'success');
      } else {
        // Clear any previously stored credentials if remember me is not checked
        clearRememberedEmail();
        showToast('Login successful!', 'success');
      }
      
      // Save auth state
      login(token, user);
      
      // Close modal and redirect
      setTimeout(() => {
        redirectToDashboard();
      }, 1000);
    }
  } catch (error) {
    showError(error.message || 'Login failed');
  }
};

export { showLoginModal, handleLogin };
// assets/js/features/auth/signup.js
import { post } from '../../core/http.js';
import { ENDPOINTS } from '../../config/api.js';
import { login, redirectToDashboard } from '../../core/auth.js';
import { createModal } from '../../components/modal.js';
import { showToast, showError } from '../../components/toast.js';
import { 
  validateEmail, 
  validatePassword, 
  validateFullName, 
  validatePhone,
  passwordsMatch 
} from '../../utils/validators.js';
import { RIZAL_MUNICIPALITIES, MUNICIPALITY_COORDINATES } from '../../utils/constants.js';

const showSignupModal = () => {
  const modalContent = `
    <form id="signup-form" class="space-y-6">
      <!-- Header Section -->
      <div class="text-center pb-4 border-b border-gray-100">
        <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <i class="bi bi-person-plus text-2xl text-green-600"></i>
        </div>
        <h3 class="text-lg font-semibold text-gray-900 mb-1">Join AgriMarket</h3>
        <p class="text-sm text-gray-600">Connect with farmers and fresh produce</p>
      </div>

      <!-- Role Selection -->
      <div class="form-group">
        <label class="form-label text-base font-medium text-gray-900 mb-3 block">Choose your role</label>
        <div class="grid grid-cols-2 gap-3">
          <label class="relative cursor-pointer group">
            <input type="radio" name="role" value="buyer" checked class="absolute opacity-0">
            <div class="role-card border-2 border-gray-200 rounded-xl p-4 text-center transition-all duration-200 hover:border-green-300 hover:bg-green-50 group-focuses:ring-2 group-focus:ring-green-500 group-focus:ring-offset-2">
              <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-2 group-hover:bg-blue-200 transition-colors">
                <i class="bi bi-cart3 text-xl text-blue-600"></i>
              </div>
              <span class="font-medium text-gray-900 block">Buyer</span>
              <span class="text-xs text-gray-500 mt-1 block">Buy fresh products</span>
            </div>
          </label>
          <label class="relative cursor-pointer group">
            <input type="radio" name="role" value="seller" class="absolute opacity-0">
            <div class="role-card border-2 border-gray-200 rounded-xl p-4 text-center transition-all duration-200 hover:border-green-300 hover:bg-green-50 group-focuses:ring-2 group-focus:ring-green-500 group-focus:ring-offset-2">
              <div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-2 group-hover:bg-green-200 transition-colors">
                <i class="bi bi-shop text-xl text-green-600"></i>
              </div>
              <span class="font-medium text-gray-900 block">Seller</span>
              <span class="text-xs text-gray-500 mt-1 block">Sell your harvest</span>
            </div>
          </label>
        </div>
      </div>
      
      <!-- Personal Information -->
      <div class="space-y-4">
        <h4 class="text-sm font-medium text-gray-900 uppercase tracking-wide">Personal Information</h4>
        
        <div class="form-group">
          <label class="form-label">Full Name</label>
          <div class="relative">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <i class="bi bi-person text-gray-400"></i>
            </div>
            <input type="text" id="signup-name" class="form-control pl-10" placeholder="Enter your full name" required>
          </div>
          <div class="invalid-feedback"></div>
        </div>
        
        <div class="form-group">
          <label class="form-label">Email Address</label>
          <div class="relative">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <i class="bi bi-envelope text-gray-400"></i>
            </div>
            <input type="email" id="signup-email" class="form-control pl-10" placeholder="your@email.com" required>
          </div>
          <div class="invalid-feedback"></div>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Phone Number</label>
            <div class="relative">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <i class="bi bi-phone text-gray-400"></i>
              </div>
              <input type="tel" id="signup-phone" class="form-control pl-10" placeholder="09XXXXXXXXX" required>
            </div>
            <div class="invalid-feedback"></div>
          </div>
          
          <div class="form-group">
            <label class="form-label">Municipality</label>
            <div class="relative">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <i class="bi bi-geo-alt text-gray-400"></i>
              </div>
              <select id="signup-municipality" class="form-select pl-10" required>
                <option value="">Select municipality</option>
                ${RIZAL_MUNICIPALITIES.map(m => `<option value="${m}">${m}</option>`).join('')}
              </select>
            </div>
            <div class="invalid-feedback"></div>
          </div>
        </div>
      </div>
      
      <!-- Seller-specific Fields -->
      <div id="seller-fields" class="space-y-4" style="display: none;">
        <div class="bg-green-50 border border-green-200 rounded-lg p-4">
          <h4 class="text-sm font-medium text-green-900 mb-3 flex items-center">
            <i class="bi bi-shop text-green-600 mr-2"></i>
            Farm Details
          </h4>
          <div class="form-group mb-0">
            <label class="form-label">Farm Type</label>
            <select id="signup-farm-type" class="form-select">
              <option value="farm">Farm (Crops & Vegetables)</option>
              <option value="fishery">Fishery (Fish & Seafood)</option>
              <option value="cooperative">Cooperative</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
      </div>
      
      <!-- Security -->
      <div class="space-y-4">
        <h4 class="text-sm font-medium text-gray-900 uppercase tracking-wide">Security</h4>
        
        <div class="form-group">
          <label class="form-label">Password</label>
          <div class="relative">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <i class="bi bi-lock text-gray-400"></i>
            </div>
            <input type="password" id="signup-password" class="form-control pl-10 pr-12" placeholder="Create a strong password" required>
            <button type="button" class="password-toggle absolute inset-y-0 right-0 pr-3 flex items-center" data-target="signup-password">
              <i class="bi bi-eye text-gray-400 hover:text-gray-600 transition-colors"></i>
            </button>
          </div>
          <div class="invalid-feedback"></div>
          <div class="mt-1 text-xs text-gray-500">
            Must be at least 8 characters with letters and numbers
          </div>
        </div>
        
        <div class="form-group">
          <label class="form-label">Confirm Password</label>
          <div class="relative">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <i class="bi bi-shield-check text-gray-400"></i>
            </div>
            <input type="password" id="signup-confirm-password" class="form-control pl-10 pr-12" placeholder="Confirm your password" required>
            <button type="button" class="password-toggle absolute inset-y-0 right-0 pr-3 flex items-center" data-target="signup-confirm-password">
              <i class="bi bi-eye text-gray-400 hover:text-gray-600 transition-colors"></i>
            </button>
          </div>
          <div class="invalid-feedback"></div>
        </div>
      </div>
      
      <!-- Terms Agreement -->
      <div class="form-group">
        <div class="flex items-start space-x-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <input type="checkbox" id="agree-terms" class="form-check-input mt-1 text-green-600 focus:ring-green-500 border-gray-300 rounded" required>
          <label for="agree-terms" class="text-sm text-gray-700 leading-relaxed">
            I agree to AgriMarket's 
            <a href="/terms.html" class="text-green-600 font-medium hover:text-green-700 underline" target="_blank">Terms of Service</a> 
            and 
            <a href="/privacy.html" class="text-green-600 font-medium hover:text-green-700 underline" target="_blank">Privacy Policy</a>
          </label>
        </div>
      </div>
      
      <!-- Submit Button -->
      <button type="submit" class="btn btn-primary w-full py-3 text-lg font-medium bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 transform hover:scale-[1.02] transition-all duration-200 shadow-lg hover:shadow-xl">
        <i class="bi bi-person-plus mr-2"></i>
        Create My Account
      </button>
      
      <!-- Login Link -->
      <div class="text-center pt-4 border-t border-gray-100">
        <p class="text-sm text-gray-600">
          Already have an account? 
          <a href="#" id="switch-to-login" class="text-green-600 font-semibold hover:text-green-700 transition-colors">
            Sign in instead
          </a>
        </p>
      </div>
    </form>
    
    <style>
      .role-card input:checked + div {
        border-color: #16a34a !important;
        background-color: #f0fdf4 !important;
        box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.1);
      }
      
      .role-card input:checked + div .bg-blue-100,
      .role-card input:checked + div .bg-green-100 {
        background-color: #dcfce7 !important;
      }
      
      .role-card input:checked + div i {
        color: #16a34a !important;
      }
      
      .form-control:focus, .form-select:focus {
        border-color: #16a34a !important;
        box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.1) !important;
      }
      
      .password-toggle {
        background: none !important;
        border: none !important;
        cursor: pointer !important;
        padding: 0 !important;
        width: auto !important;
        height: auto !important;
        border-radius: 0.375rem !important;
        transition: all 150ms ease !important;
      }
      
      .password-toggle:hover {
        background-color: rgba(0, 0, 0, 0.05) !important;
      }
    </style>
  `;
  
  const modal = createModal({
    title: '',
    content: modalContent,
    size: 'lg',
    showHeader: false
  });
  
  // Show/hide seller fields based on role
  const roleInputs = modal.body.querySelectorAll('input[name="role"]');
  const sellerFields = modal.body.querySelector('#seller-fields');
  
  roleInputs.forEach(input => {
    input.addEventListener('change', (e) => {
      sellerFields.style.display = e.target.value === 'seller' ? 'block' : 'none';
    });
  });
  
  // Handle municipality selection to auto-populate coordinates for sellers
  const municipalitySelect = modal.body.querySelector('#signup-municipality');
  municipalitySelect.addEventListener('change', (e) => {
    const municipality = e.target.value;
    if (municipality) {
      const coords = MUNICIPALITY_COORDINATES[municipality];
      // Store coords in the select element for later use in handleSignup
      municipalitySelect.dataset.latitude = coords ? coords.latitude : null;
      municipalitySelect.dataset.longitude = coords ? coords.longitude : null;
    }
  });
  
  // Handle form submission
  const form = modal.body.querySelector('#signup-form');
  form.addEventListener('submit', handleSignup);
  
  // Attach password toggles for both password fields
  modal.body.querySelectorAll('.password-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = btn.getAttribute('data-target');
      const input = modal.body.querySelector(`#${targetId}`);
      if (!input) return;
      
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      
      const icon = btn.querySelector('i');
      if (icon) {
        icon.className = `bi bi-eye${isPassword ? '-slash' : ''} text-gray-400 hover:text-gray-600 transition-colors`;
      }
    });
    
    // Enhanced hover and focus effects
    const targetId = btn.getAttribute('data-target');
    const input = modal.body.querySelector(`#${targetId}`);
    if (input) {
      // Show/hide toggle based on input state
      input.addEventListener('input', () => {
        btn.style.opacity = input.value.length > 0 ? '1' : '0.7';
      });
      
      // Hover effects for better UX
      btn.addEventListener('mouseenter', function() {
        this.style.backgroundColor = 'rgba(0, 0, 0, 0.08)';
        this.style.transform = 'scale(1.1)';
      });
      
      btn.addEventListener('mouseleave', function() {
        this.style.backgroundColor = 'transparent';
        this.style.transform = 'scale(1)';
      });
      
      // Focus ring for accessibility
      btn.addEventListener('focus', function() {
        this.style.outline = '2px solid #16a34a';
        this.style.outlineOffset = '2px';
      });
      
      btn.addEventListener('blur', function() {
        this.style.outline = 'none';
      });
    }
  });
  
  // Switch to login
  const switchLogin = document.getElementById('switch-to-login');
  switchLogin.addEventListener('click', (e) => {
    e.preventDefault();
    modal.close();
    import('./login.js').then(m => m.showLoginModal());
  });
};

const handleSignup = async (e) => {
  e.preventDefault();
  
  const municipalitySelect = document.getElementById('signup-municipality');
  const coords = MUNICIPALITY_COORDINATES[municipalitySelect.value];
  
  // Check if user agreed to terms
  const agreedToTerms = document.getElementById('agree-terms').checked;
  if (!agreedToTerms) {
    showError('Please agree to the Terms of Service and Privacy Policy to continue.');
    return;
  }
  
  const formData = {
    role: document.querySelector('input[name="role"]:checked').value,
    full_name: document.getElementById('signup-name').value,
    email: document.getElementById('signup-email').value,
    phone_number: document.getElementById('signup-phone').value,
    municipality: municipalitySelect.value,
    password: document.getElementById('signup-password').value,
    confirm_password: document.getElementById('signup-confirm-password').value,
    agreed_to_terms: agreedToTerms
  };
  
  // Add location coordinates from municipality
  if (coords) {
    formData.latitude = coords.latitude;
    formData.longitude = coords.longitude;
  }
  
  // Add seller-specific fields
  if (formData.role === 'seller') {
    formData.farm_type = document.getElementById('signup-farm-type').value;
  }
  
  // Validate
  const validations = [
    validateFullName(formData.full_name),
    validateEmail(formData.email),
    validatePhone(formData.phone_number),
    validatePassword(formData.password),
    passwordsMatch(formData.password, formData.confirm_password)
  ];
  
  for (const validation of validations) {
    if (!validation.valid) {
      showError(validation.message);
      return;
    }
  }
  
  try {
    const response = await post(ENDPOINTS.AUTH.SIGNUP, formData);
    
    if (response.success) {
      const { token, user } = response.data;
      
      login(token, user);
      showToast('Account created successfully!', 'success');
      
      // Show verification prompt for sellers
      if (user.role === 'seller') {
        setTimeout(() => {
          showVerificationPrompt();
        }, 1000);
      } else {
        setTimeout(() => {
          redirectToDashboard();
        }, 1000);
      }
    }
  } catch (error) {
    showError(error.message || 'Signup failed');
  }
};

const showVerificationPrompt = () => {
  const modalContent = `
    <div class="text-center py-4">
      <div class="w-20 h-20 bg-gradient-to-r from-green-100 to-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <i class="bi bi-shield-check text-4xl text-green-600"></i>
      </div>
      <h3 class="text-2xl font-bold text-gray-900 mb-3">Verify Your Account</h3>
      <p class="text-gray-600 mb-6 max-w-md mx-auto leading-relaxed">
        Get verified to unlock all seller features and build trust with buyers. 
        Upload your ID and selfie - it only takes 2 minutes!
      </p>
      
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-left max-w-md mx-auto">
        <p class="text-sm text-blue-800 mb-2">
          <i class="bi bi-info-circle text-blue-600"></i>
          <strong class="ml-1">What you'll need:</strong>
        </p>
        <ul class="text-sm text-blue-700 space-y-1 ml-6">
          <li>✓ Government-issued ID</li>
          <li>✓ A selfie holding your ID</li>
          <li>✓ 2-3 minutes of your time</li>
        </ul>
      </div>

      <div class="flex flex-col sm:flex-row gap-3 justify-center">
        <button type="button" id="btn-verify-now" class="btn btn-primary btn-lg px-8 py-3">
          <i class="bi bi-shield-check"></i>
          Verify Now
        </button>
        <button type="button" id="btn-skip-verification" class="btn btn-outline btn-lg px-8 py-3">
          <i class="bi bi-arrow-right"></i>
          Skip for Now
        </button>
      </div>
      
      <p class="text-xs text-gray-500 mt-4">
        You can verify your account anytime from your dashboard
      </p>
    </div>
  `;

  const modal = createModal({
    title: 'Account Verification',
    content: modalContent,
    showCloseButton: true,
    closeOnBackdrop: false,
    size: 'md'
  });

  // Event listeners
  const btnVerifyNow = modal.body.querySelector('#btn-verify-now');
  const btnSkip = modal.body.querySelector('#btn-skip-verification');

  btnVerifyNow.addEventListener('click', () => {
    modal.close();
    window.location.href = '/verification.html';
  });

  btnSkip.addEventListener('click', () => {
    modal.close();
    redirectToDashboard();
  });
};

export { showSignupModal, handleSignup };
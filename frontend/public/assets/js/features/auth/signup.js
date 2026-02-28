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
import { attachPasswordToggleHandler } from '../../utils/helpers.js';
import { RIZAL_MUNICIPALITIES, MUNICIPALITY_COORDINATES } from '../../utils/constants.js';

const showSignupModal = () => {
  const modalContent = `
    <form id="signup-form" class="auth-ui auth-signup space-y-5">
      <section class="auth-head">
        <div class="auth-head__icon">
          <i class="bi bi-person-plus"></i>
        </div>
        <div>
          <h3 class="auth-head__title">Create Your Account</h3>
          <p class="auth-head__subtitle">Start trading fresh local produce in minutes.</p>
        </div>
      </section>

      <section class="auth-block">
        <h4 class="auth-block__title">Choose your role</h4>
        <div class="auth-role-grid">
          <label class="auth-role-item">
            <input type="radio" name="role" value="buyer" checked>
            <span class="auth-role-card">
              <span class="auth-role-icon">
                <img src="/assets/images/buyer.png" alt="Buyer" class="w-9 h-9 object-contain">
              </span>
              <span class="auth-role-name">Buyer</span>
              <span class="auth-role-note">Buy fresh products</span>
            </span>
          </label>
          <label class="auth-role-item">
            <input type="radio" name="role" value="seller">
            <span class="auth-role-card">
              <span class="auth-role-icon">
                <img src="/assets/images/seller.png" alt="Seller" class="w-9 h-9 object-contain">
              </span>
              <span class="auth-role-name">Seller</span>
              <span class="auth-role-note">Sell your harvest</span>
            </span>
          </label>
        </div>
      </section>

      <section class="auth-block auth-block--soft">
        <h4 class="auth-block__title">Personal Information</h4>

        <div class="form-group auth-group">
          <label class="form-label auth-label" for="signup-name">Full Name</label>
          <div class="auth-field-wrap">
            <span class="auth-field-icon"><i class="bi bi-person"></i></span>
            <input type="text" id="signup-name" class="form-control auth-field" placeholder="Enter your full name" required>
          </div>
          <div class="invalid-feedback"></div>
        </div>

        <div class="form-group auth-group">
          <label class="form-label auth-label" for="signup-email">Email Address</label>
          <div class="auth-field-wrap">
            <span class="auth-field-icon"><i class="bi bi-envelope"></i></span>
            <input type="email" id="signup-email" class="form-control auth-field" placeholder="you@example.com" required>
          </div>
          <div class="invalid-feedback"></div>
        </div>

        <div class="auth-grid-2">
          <div class="form-group auth-group">
            <label class="form-label auth-label" for="signup-phone">Phone Number</label>
            <div class="auth-field-wrap">
              <span class="auth-field-icon"><i class="bi bi-phone"></i></span>
              <input type="tel" id="signup-phone" class="form-control auth-field" placeholder="09XXXXXXXXX" required>
            </div>
            <div class="invalid-feedback"></div>
          </div>

          <div class="form-group auth-group">
            <label class="form-label auth-label" for="signup-municipality">Municipality</label>
            <div class="auth-field-wrap">
              <span class="auth-field-icon"><i class="bi bi-geo-alt"></i></span>
              <select id="signup-municipality" class="form-select auth-field" required>
                <option value="">Select municipality</option>
                ${RIZAL_MUNICIPALITIES.map(m => `<option value="${m}">${m}</option>`).join('')}
              </select>
            </div>
            <div class="invalid-feedback"></div>
          </div>
        </div>
      </section>

      <section id="seller-fields" class="auth-block auth-seller-block" style="display: none;">
        <h4 class="auth-block__title">
          <i class="bi bi-shop mr-1"></i>
          Farm Details
        </h4>
        <div class="form-group auth-group mb-0">
          <label class="form-label auth-label" for="signup-farm-type">Farm Type</label>
          <select id="signup-farm-type" class="form-select auth-field">
            <option value="farm">Farm (Crops & Vegetables)</option>
            <option value="fishery">Fishery (Fish & Seafood)</option>
            <option value="cooperative">Cooperative</option>
            <option value="other">Other</option>
          </select>
        </div>
      </section>

      <section class="auth-block">
        <h4 class="auth-block__title">Security</h4>

        <div class="form-group auth-group">
          <label class="form-label auth-label" for="signup-password">Password</label>
          <div class="auth-field-wrap">
            <span class="auth-field-icon"><i class="bi bi-lock"></i></span>
            <input type="password" id="signup-password" class="form-control auth-field auth-field--with-toggle" placeholder="Create a strong password" minlength="8" pattern="(?=.*[A-Za-z])(?=.*\\d)(?=.*[@$!%*?&#]).{8,}" title="Use at least 8 characters with letters, numbers, and one special character (@$!%*?&#)." required>
            <button type="button" class="password-toggle auth-pass-toggle" data-target="signup-password" aria-label="Toggle password visibility">
              <i class="bi bi-eye"></i>
            </button>
          </div>
          <div class="invalid-feedback"></div>
          <div class="auth-hint">At least 8 characters with letters, numbers, and one special character (@$!%*?&#).</div>
        </div>

        <div class="form-group auth-group mb-0">
          <label class="form-label auth-label" for="signup-confirm-password">Confirm Password</label>
          <div class="auth-field-wrap">
            <span class="auth-field-icon"><i class="bi bi-shield-check"></i></span>
            <input type="password" id="signup-confirm-password" class="form-control auth-field auth-field--with-toggle" placeholder="Confirm your password" required>
            <button type="button" class="password-toggle auth-pass-toggle" data-target="signup-confirm-password" aria-label="Toggle password visibility">
              <i class="bi bi-eye"></i>
            </button>
          </div>
          <div class="invalid-feedback"></div>
        </div>
      </section>

      <section class="auth-terms-wrap">
        <label for="agree-terms" class="auth-terms">
          <input type="checkbox" id="agree-terms" class="form-check-input auth-check" required>
          <span>
            I agree to AgriMarket's
            <a href="/terms.html" class="auth-link auth-link-strong" target="_blank">Terms of Service</a>
            and
            <a href="/privacy.html" class="auth-link auth-link-strong" target="_blank">Privacy Policy</a>.
          </span>
        </label>
      </section>

      <button type="submit" class="btn btn-primary w-full auth-submit">
        <i class="bi bi-person-plus"></i>
        <span>Create My Account</span>
      </button>

      <p class="auth-switch text-center">
        Already have an account?
        <a href="#" id="switch-to-login" class="auth-link auth-link-strong">Sign in instead</a>
      </p>
    </form>
    
    <style>
      .auth-ui {
        --auth-accent: #18794e;
        --auth-accent-strong: #10613d;
        --auth-border: #d9e6dc;
        --auth-muted: #62716a;
        --auth-ink: #123327;
        font-family: "Plus Jakarta Sans", system-ui, sans-serif;
      }

      .auth-head {
        display: flex;
        align-items: center;
        gap: 0.8rem;
        padding: 0.9rem 0.95rem;
        border: 1px solid #d6e6db;
        border-radius: 12px;
        background: linear-gradient(145deg, #f2faf5, #ffffff);
      }

      .auth-head__icon {
        width: 2.7rem;
        height: 2.7rem;
        border-radius: 0.85rem;
        background: #def3e5;
        color: var(--auth-accent);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2rem;
      }

      .auth-head__title {
        margin: 0;
        color: var(--auth-ink);
        font-size: 1.08rem;
        font-weight: 800;
        line-height: 1.2;
      }

      .auth-head__subtitle {
        margin: 0.2rem 0 0;
        color: var(--auth-muted);
        font-size: 0.84rem;
      }

      .auth-block {
        border: 1px solid #dce8df;
        border-radius: 12px;
        padding: 0.85rem;
        background: #fff;
        display: grid;
        gap: 0.82rem;
      }

      .auth-block--soft {
        background: #fcfefc;
      }

      .auth-seller-block {
        background: #f4fbf7;
        border-color: #cfe6d8;
      }

      .auth-block__title {
        margin: 0;
        color: #224134;
        font-size: 0.78rem;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        font-weight: 800;
      }

      .auth-role-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.65rem;
      }

      .auth-role-item input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
      }

      .auth-role-card {
        border: 1.5px solid #d7e5dc;
        border-radius: 12px;
        padding: 0.8rem;
        display: grid;
        justify-items: center;
        text-align: center;
        gap: 0.25rem;
        cursor: pointer;
        transition: border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease;
      }

      .auth-role-icon {
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 0.7rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #f4faf6;
      }

      .auth-role-name {
        color: #173a2c;
        font-weight: 700;
        font-size: 0.9rem;
      }

      .auth-role-note {
        color: #6a7c73;
        font-size: 0.74rem;
      }

      .auth-role-item input:checked + .auth-role-card {
        border-color: var(--auth-accent);
        background: #f0f9f4;
        box-shadow: 0 0 0 3px rgba(24, 121, 78, 0.14);
      }

      .auth-group {
        margin-bottom: 0;
      }

      .auth-label {
        color: #213f32;
        font-size: 0.84rem;
        font-weight: 700;
        margin-bottom: 0.38rem;
      }

      .auth-grid-2 {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.7rem;
      }

      .auth-field-wrap {
        position: relative;
      }

      .auth-field-icon {
        position: absolute;
        left: 0.75rem;
        top: 50%;
        transform: translateY(-50%);
        color: #6d8176;
        pointer-events: none;
      }

      .auth-field {
        padding-left: 2.2rem !important;
        min-height: 46px;
        border-radius: 11px !important;
        border: 1px solid var(--auth-border) !important;
        background: #fdfefd;
      }

      .auth-field--with-toggle {
        padding-right: 2.6rem !important;
      }

      .auth-field:focus {
        border-color: var(--auth-accent) !important;
        box-shadow: 0 0 0 3px rgba(24, 121, 78, 0.14) !important;
        background: #fff;
      }

      .auth-field:hover {
        border-color: #9ec9af !important;
        box-shadow: none !important;
      }

      .auth-pass-toggle {
        position: absolute;
        right: 0.48rem;
        top: 50%;
        transform: translateY(-50%);
        width: 2rem !important;
        height: 2rem !important;
        border: 0 !important;
        background: transparent !important;
        color: #6f7c76;
        border-radius: 8px !important;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .auth-pass-toggle:hover {
        background: #edf4ef !important;
        color: var(--auth-accent-strong);
      }

      .auth-hint {
        font-size: 0.74rem;
        color: #73837b;
      }

      .auth-terms-wrap {
        border: 1px solid #dce8df;
        border-radius: 12px;
        background: #f8fbf9;
        padding: 0.75rem 0.85rem;
      }

      .auth-terms {
        display: flex;
        align-items: flex-start;
        gap: 0.58rem;
        color: #4f6259;
        font-size: 0.81rem;
        line-height: 1.45;
        cursor: pointer;
      }

      .auth-check {
        width: 1rem;
        height: 1rem;
        min-width: 1rem !important;
        min-height: 1rem !important;
        border-radius: 4px !important;
        margin-top: 0.12rem;
        flex: 0 0 1rem;
      }

      .auth-check:checked {
        background-color: var(--auth-accent) !important;
        border-color: var(--auth-accent) !important;
      }

      .auth-check:focus {
        box-shadow: 0 0 0 3px rgba(24, 121, 78, 0.14) !important;
      }

      .auth-link {
        color: var(--auth-accent);
        text-decoration: none;
      }

      .auth-link:hover {
        color: var(--auth-accent-strong);
        text-decoration: none;
      }

      .auth-link-strong {
        font-weight: 700;
      }

      .auth-submit {
        min-height: 48px;
        border-radius: 12px !important;
        font-size: 0.97rem;
        font-weight: 700;
        background: linear-gradient(90deg, #16784d, #1f9a63) !important;
        border: none !important;
        box-shadow: 0 12px 22px rgba(20, 104, 67, 0.22) !important;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.48rem;
      }

      .auth-submit:hover {
        background: linear-gradient(90deg, #116740, #1a8556) !important;
        transform: translateY(-1px);
      }

      .auth-switch {
        margin: 0;
        color: #55675f;
        font-size: 0.86rem;
      }

      @media (max-width: 767.98px) {
        .auth-head {
          padding: 0.75rem 0.8rem;
        }

        .auth-head__title {
          font-size: 1rem;
        }

        .auth-head__subtitle {
          font-size: 0.8rem;
        }

        .auth-role-grid {
          grid-template-columns: 1fr;
        }

        .auth-grid-2 {
          grid-template-columns: 1fr;
        }

        .auth-block {
          padding: 0.75rem;
        }

        .auth-submit {
          min-height: 46px;
          font-size: 0.92rem;
        }
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
  form.addEventListener('submit', (e) => handleSignup(e, modal));
  
  // Attach password toggles for both password fields
  modal.body.querySelectorAll('.password-toggle').forEach(btn => {
    const targetId = btn.getAttribute('data-target');
    const input = modal.body.querySelector(`#${targetId}`);
    if (input) {
      attachPasswordToggleHandler(btn, input);
    }
  });
  
  // Switch to login
  const switchLogin = modal.body.querySelector('#switch-to-login');
  switchLogin.addEventListener('click', (e) => {
    e.preventDefault();
    modal.close();
    import('./login.js').then(m => m.showLoginModal());
  });
};

const handleSignup = async (e, signupModal) => {
  e.preventDefault();
  const form = e.currentTarget;
  const municipalitySelect = form.querySelector('#signup-municipality');
  const coords = MUNICIPALITY_COORDINATES[municipalitySelect.value];
  
  // Check if user agreed to terms
  const agreedToTerms = form.querySelector('#agree-terms').checked;
  if (!agreedToTerms) {
    showError('Please agree to the Terms of Service and Privacy Policy to continue.');
    return;
  }
  
  const formData = {
    role: form.querySelector('input[name="role"]:checked').value,
    full_name: form.querySelector('#signup-name').value,
    email: form.querySelector('#signup-email').value,
    phone_number: form.querySelector('#signup-phone').value,
    municipality: municipalitySelect.value,
    password: form.querySelector('#signup-password').value,
    confirm_password: form.querySelector('#signup-confirm-password').value,
    agreed_to_terms: agreedToTerms
  };
  
  // Add location coordinates from municipality
  if (coords) {
    formData.latitude = coords.latitude;
    formData.longitude = coords.longitude;
  }
  
  // Add seller-specific fields
  if (formData.role === 'seller') {
    formData.farm_type = form.querySelector('#signup-farm-type').value;
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
      
      // Close the signup modal
      if (signupModal && signupModal.close) {
        signupModal.close();
      }
      
      // Show verification prompt for BOTH buyer and seller
      showVerificationPrompt();
    }
  } catch (error) {
    showError(error.message || 'Signup failed');
  }
};

const showVerificationPrompt = () => {
  const modalContent = `
    <div class="verify-prompt">
      <div class="verify-prompt__hero">
        <div class="verify-prompt__icon">
          <i class="bi bi-shield-check"></i>
        </div>
        <div class="verify-prompt__hero-content">
          <p class="verify-prompt__kicker">Next Step</p>
          <h3 class="verify-prompt__title">Verify Your Account</h3>
          <p class="verify-prompt__subtitle">
            Build trust faster and unlock full marketplace features.
            Upload your ID and selfie in about 2 minutes.
          </p>
        </div>
      </div>

      <div class="verify-prompt__checklist">
        <p class="verify-prompt__checklist-title">
          <i class="bi bi-info-circle"></i>
          What you'll need
        </p>
        <ul class="verify-prompt__list">
          <li>✓ Government-issued ID</li>
          <li>✓ A selfie holding your ID</li>
          <li>✓ 2-3 minutes of your time</li>
        </ul>
      </div>

      <div class="verify-prompt__actions">
        <button type="button" id="btn-verify-now" class="btn btn-primary btn-lg verify-prompt__btn-primary">
          <i class="bi bi-shield-check"></i>
          <span>Verify Now</span>
        </button>
        <button type="button" id="btn-skip-verification" class="btn btn-outline btn-lg verify-prompt__btn-outline">
          <i class="bi bi-arrow-right"></i>
          <span>Skip for Now</span>
        </button>
      </div>

      <p class="verify-prompt__footnote">
        You can verify your account anytime from your dashboard
      </p>
    </div>

    <style>
      .verify-prompt {
        --vp-accent: #17784d;
        --vp-accent-dark: #10603c;
        --vp-border: #d7e6dc;
        --vp-text: #173a2c;
        --vp-muted: #5f6f67;
        font-family: "Plus Jakarta Sans", system-ui, sans-serif;
      }

      .verify-prompt__hero {
        border: 1px solid var(--vp-border);
        border-radius: 14px;
        padding: 0.9rem;
        background: linear-gradient(145deg, #f3faf5 0%, #ffffff 70%);
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 0.85rem;
        align-items: start;
      }

      .verify-prompt__icon {
        width: 3rem;
        height: 3rem;
        border-radius: 0.95rem;
        background: #dff3e6;
        color: var(--vp-accent);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 1.35rem;
      }

      .verify-prompt__kicker {
        margin: 0;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #2f7b57;
        font-size: 0.67rem;
        font-weight: 800;
      }

      .verify-prompt__title {
        margin: 0.2rem 0 0.22rem;
        color: var(--vp-text);
        font-size: 1.25rem;
        font-weight: 800;
        line-height: 1.15;
      }

      .verify-prompt__subtitle {
        margin: 0;
        color: var(--vp-muted);
        font-size: 0.89rem;
        line-height: 1.45;
      }

      .verify-prompt__checklist {
        margin-top: 0.9rem;
        border: 1px solid #d6e4f7;
        border-radius: 12px;
        background: #f4f8ff;
        padding: 0.78rem 0.88rem;
      }

      .verify-prompt__checklist-title {
        margin: 0 0 0.4rem;
        color: #1f4cb4;
        font-weight: 800;
        font-size: 0.88rem;
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
      }

      .verify-prompt__list {
        margin: 0;
        padding-left: 1.12rem;
        color: #2c58be;
        font-size: 0.86rem;
        line-height: 1.45;
      }

      .verify-prompt__actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.65rem;
        margin-top: 1rem;
      }

      .verify-prompt__btn-primary,
      .verify-prompt__btn-outline {
        min-height: 44px;
        border-radius: 12px !important;
        font-weight: 700;
        font-size: 0.92rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.4rem;
      }

      .verify-prompt__btn-primary {
        background: linear-gradient(90deg, var(--vp-accent), #1f9b63) !important;
        border: none !important;
        box-shadow: 0 10px 18px rgba(20, 104, 67, 0.22) !important;
      }

      .verify-prompt__btn-primary:hover {
        background: linear-gradient(90deg, var(--vp-accent-dark), #1a8456) !important;
      }

      .verify-prompt__btn-outline {
        border: 1px solid #b8d4c5 !important;
        color: #245f44 !important;
        background: #fff !important;
      }

      .verify-prompt__btn-outline:hover {
        background: #f2faf5 !important;
      }

      .verify-prompt__footnote {
        margin: 0.72rem 0 0;
        font-size: 0.76rem;
        color: #7b8a82;
        text-align: center;
      }

      @media (max-width: 767.98px) {
        .verify-prompt__hero {
          grid-template-columns: 1fr;
          text-align: center;
        }

        .verify-prompt__icon {
          margin: 0 auto;
        }

        .verify-prompt__actions {
          grid-template-columns: 1fr;
        }
      }
    </style>
  `;

  const modal = createModal({
    title: 'Account Verification',
    content: modalContent,
    showCloseButton: false,
    closeOnBackdrop: false,
    size: 'md'
  });

  // Attach click handlers to buttons
  setTimeout(() => {
    const btnVerifyNow = modal.body.querySelector('#btn-verify-now');
    const btnSkip = modal.body.querySelector('#btn-skip-verification');

    if (btnVerifyNow) {
      btnVerifyNow.addEventListener('click', () => {
        modal.close();
        window.location.href = '/verification.html';
      });
    }

    if (btnSkip) {
      btnSkip.addEventListener('click', () => {
        modal.close();
        redirectToDashboard();
      });
    }
  }, 50);
};

export { showSignupModal, handleSignup };

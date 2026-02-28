// assets/js/features/auth/login.js
import { post } from '../../core/http.js';
import { ENDPOINTS } from '../../config/api.js';
import { login, redirectToDashboard, setRememberedEmail, getRememberedEmail, clearRememberedEmail, isRememberMeEnabled } from '../../core/auth.js';
import { createModal, closeModal } from '../../components/modal.js';
import { showToast, showError } from '../../components/toast.js';
import { validateEmail, validateRequired } from '../../utils/validators.js';
import { attachPasswordToggleHandler } from '../../utils/helpers.js';

const showLoginModal = () => {
  const modalContent = `
    <form id="login-form" class="auth-ui auth-login space-y-5">
      <section class="auth-head">
        <div class="auth-head__icon">
          <i class="bi bi-box-arrow-in-right"></i>
        </div>
        <div>
          <h3 class="auth-head__title">Welcome Back</h3>
          <p class="auth-head__subtitle">Sign in to continue buying and selling on AgriMarket.</p>
        </div>
      </section>

      <section class="auth-section">
        <div class="form-group auth-group">
          <label class="form-label auth-label" for="login-email">Email Address</label>
          <div class="auth-field-wrap">
            <span class="auth-field-icon"><i class="bi bi-envelope"></i></span>
            <input
              type="email"
              id="login-email"
              name="email"
              class="form-control auth-field"
              placeholder="you@example.com"
              required
            >
          </div>
          <div class="invalid-feedback"></div>
        </div>

        <div class="form-group auth-group">
          <label class="form-label auth-label" for="login-password">Password</label>
          <div class="auth-field-wrap">
            <span class="auth-field-icon"><i class="bi bi-lock"></i></span>
            <input
              type="password"
              id="login-password"
              name="password"
              class="form-control auth-field auth-field--with-toggle"
              placeholder="Enter your password"
              required
            >
            <button type="button" class="password-toggle auth-pass-toggle" data-target="login-password" aria-label="Toggle password visibility">
              <i class="bi bi-eye"></i>
            </button>
          </div>
          <div class="invalid-feedback"></div>
        </div>
      </section>

      <section class="auth-meta-row">
        <label for="remember-me" class="auth-check-wrap">
          <input type="checkbox" id="remember-me" class="form-check-input auth-check">
          <span>Remember me for 30 days</span>
        </label>
        <a href="#" id="forgot-password" class="auth-link">Forgot password?</a>
      </section>

      <button type="submit" class="btn btn-primary w-full auth-submit">
        <i class="bi bi-box-arrow-in-right"></i>
        <span>Sign In</span>
      </button>

      <div class="auth-divider"><span>New to AgriMarket?</span></div>

      <p class="auth-switch text-center">
        Don't have an account?
        <a href="#" id="switch-to-signup" class="auth-link auth-link-strong">Create your account</a>
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
        padding: 0.85rem 0.95rem;
        border: 1px solid #d6e6db;
        border-radius: 12px;
        background: linear-gradient(145deg, #f2faf5, #ffffff);
      }

      .auth-head__icon {
        width: 2.6rem;
        height: 2.6rem;
        border-radius: 0.8rem;
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
        font-weight: 800;
        font-size: 1.08rem;
        line-height: 1.2;
      }

      .auth-head__subtitle {
        margin: 0.2rem 0 0;
        color: var(--auth-muted);
        font-size: 0.84rem;
      }

      .auth-section {
        display: grid;
        gap: 0.85rem;
      }

      .auth-group {
        margin-bottom: 0;
      }

      .auth-label {
        color: #213f32;
        font-size: 0.85rem;
        font-weight: 700;
        margin-bottom: 0.4rem;
      }

      .auth-field-wrap {
        position: relative;
      }

      .auth-field-icon {
        position: absolute;
        left: 0.78rem;
        top: 50%;
        transform: translateY(-50%);
        color: #6d8176;
        pointer-events: none;
      }

      .auth-field {
        padding-left: 2.25rem !important;
        min-height: 46px;
        border: 1px solid var(--auth-border) !important;
        border-radius: 11px !important;
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
        right: 0.5rem;
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

      .auth-meta-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.65rem;
      }

      .auth-check-wrap {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        color: #4b5e55;
        font-size: 0.82rem;
        cursor: pointer;
      }

      .auth-check {
        width: 1rem;
        height: 1rem;
        min-width: 1rem !important;
        min-height: 1rem !important;
        border-radius: 4px !important;
        margin: 0 !important;
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
        font-weight: 600;
        font-size: 0.83rem;
        text-decoration: none;
      }

      .auth-link:hover {
        color: var(--auth-accent-strong);
        text-decoration: none !important;
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

      .auth-divider {
        position: relative;
        text-align: center;
      }

      .auth-divider::before {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        top: 50%;
        border-top: 1px solid #d9e6dc;
      }

      .auth-divider span {
        position: relative;
        background: #fff;
        padding: 0 0.55rem;
        color: #7a8a82;
        font-size: 0.74rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        font-weight: 700;
      }

      .auth-switch {
        margin: 0;
        color: #55675f;
        font-size: 0.87rem;
      }

      .auth-link-strong {
        margin-left: 0.3rem;
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

        .auth-meta-row {
          flex-direction: column;
          align-items: flex-start;
        }

        .auth-link {
          font-size: 0.82rem;
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
  form.addEventListener('submit', (e) => handleLogin(e, modal.body));
  
  // Attach password toggle
  const passwordToggle = modal.body.querySelector('.password-toggle');
  const passwordInput = modal.body.querySelector('#login-password');
  if (passwordToggle && passwordInput) {
    attachPasswordToggleHandler(passwordToggle, passwordInput);
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

const handleLogin = async (e, scope = document) => {
  e.preventDefault();
  
  const emailInput = scope.querySelector('#login-email');
  const passwordInput = scope.querySelector('#login-password');
  const rememberInput = scope.querySelector('#remember-me');

  const email = emailInput ? emailInput.value : '';
  const password = passwordInput ? passwordInput.value : '';
  const rememberMe = rememberInput ? rememberInput.checked : false;
  
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

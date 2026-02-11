import { 
  isAuthenticated, 
  getUser, 
  getRole, 
  isVerified,
  logout,
  redirectToLogin,
  redirectToDashboard 
} from '../core/auth.js';
import { getUnreadCount } from '../core/state.js';
import { createModal, closeModal } from './modal.js';
import { initNotificationBell, updateUnreadCount as updateNotificationBellCount } from './notification-bell.js';

const renderNavbar = () => {
  const navbar = document.getElementById('main-navbar');
  if (!navbar) return;
  
  const authenticated = isAuthenticated();
  const user = getUser();
  const role = getRole();
  const verified = isVerified();
  
  navbar.innerHTML = `
    <div class="navbar-container">
      <!-- Brand -->
      <a href="/index.html" class="navbar-brand">
        <i class="bi bi-basket2-fill"></i>
        AgriMarket
      </a>
      
      <!-- Mobile Menu Toggle -->
      <button class="mobile-menu-toggle" id="mobile-menu-toggle" aria-label="Toggle navigation">
        <span class="hamburger-line"></span>
        <span class="hamburger-line"></span>
        <span class="hamburger-line"></span>
      </button>
      
      <!-- Navigation Menu -->
      <nav class="navbar-nav" id="navbar-nav">
        <ul class="navbar-menu">
          ${renderMenuItems(authenticated, role, verified, user)}
        </ul>
      </nav>
    </div>
  `;
  
  attachNavbarEventListeners();
  
  // Initialize notification bell for authenticated users
  if (authenticated) {
    setTimeout(() => {
      initNotificationBell();
    }, 100);
  }
};

const renderMenuItems = (authenticated, role, verified, user) => {
  if (!authenticated) {
    return `
      <li>
        <button id="btn-login" class="btn btn-outline btn-sm">
          <i class="bi bi-box-arrow-in-right"></i> Login
        </button>
      </li>
      <li>
        <button id="btn-signup" class="btn btn-primary btn-sm">
          <i class="bi bi-person-plus"></i> Sign Up
        </button>
      </li>
    `;
  }
  
  const dashboards = {
    buyer: '/buyer.html',
    seller: '/seller.html',
    admin: '/admin.html'
  };
  
  const dashboardUrl = dashboards[role] || '/index.html';
  
  let menuItems = ``;
  
  if (role === 'buyer') {
    menuItems += `
      <li><a href="/buyer.html#browse" class="navbar-link"><i class="bi bi-grid-3x3-gap"></i> Browse</a></li>
    `;
  } else if (role === 'seller') {
    menuItems += `
      <li><a href="/seller.html#products" class="navbar-link"><i class="bi bi-box-seam"></i> My Products</a></li>
      <li class='sellerMessage'>
        <a href="/seller.html#messaging" class="navbar-link notification-bell">
          <i class="bi bi-chat-dots"></i> Messages
          <span id="messages-count" class="notification-badge" style="display: none;">0</span>
        </a>
      </li>
      <li><a href="/seller.html#analytics" class="navbar-link"><i class="bi bi-graph-up"></i> Analytics</a></li>
    `;
  } else if (role === 'admin') {
    menuItems += `
      <li><a href="/admin.html#verifications" class="navbar-link"><i class="bi bi-shield-check"></i> Verifications</a></li>
      <li><a href="/admin.html#issues" class="navbar-link"><i class="bi bi-flag"></i> Issues</a></li>
      <li><a href="/admin.html#users" class="navbar-link"><i class="bi bi-people"></i> Users</a></li>
    `;
  }
  

  if (role === 'buyer') {
    menuItems += `
      <li class='buyerCart'>
        <a href="/buyer.html#cart" class="navbar-link notification-bell">
          <i class="bi bi-cart3"></i> Cart
          <span id="cart-count" class="notification-badge" style="display: none;">0</span>
        </a>
      </li>
    `;
  }
  
  if (role === 'seller') {
    menuItems += `
      <li class='sellerOrders'>
        <a href="/seller.html#orders" class="navbar-link notification-bell">
          <i class="bi bi-box-seam"></i> Orders
          <span id="orders-count" class="notification-badge" style="display: none;">0</span>
        </a>
      </li>
      <li><a href="/seller.html#my-issues" class="navbar-link"><i class="bi bi-flag"></i> My Issues</a></li>
    `;
  }
  
  if (role === 'buyer') {
    menuItems += `
      <li><a href="/buyer.html#orders" class="navbar-link"><i class="bi bi-receipt"></i> Orders</a></li>  
      <li class='buyerIssues'><a href="/buyer.html#my-issues" class="navbar-link"><i class="bi bi-flag"></i> My Issues</a></li>
      <li class='buyerMessage'>
        <a href="/buyer.html#messaging" class="navbar-link notification-bell">
          <i class="bi bi-chat-dots"></i> Messages
          <span id="messages-count" class="notification-badge" style="display: none;">0</span>
        </a>
      </li>
    `;
  }
  menuItems += `
    <li class='buyerNotif'>
      <a href="#" id="notification-bell" class="navbar-link notification-bell">
        <i class="bi bi-bell"></i>
        <span id="notification-count" class="notification-badge" style="display: none;">0</span>
      </a>
    </li>
    <li>
      <div class="dropdown">
        <button class="btn btn-sm" id="user-dropdown">
          <i class="bi bi-person-circle"></i>
          ${user?.full_name || 'User'}
          ${verified ? '<i class="bi bi-patch-check-fill text-success ml-1"></i>' : ''}
        </button>
        <div class="dropdown-menu" id="user-menu">
          <a href="/profile.html" class="dropdown-item">
            <i class="bi bi-person"></i> Profile
          </a>
          ${!verified ? `
            <a href="/verification.html" class="dropdown-item">
              <i class="bi bi-shield-check"></i> Verify Account
            </a>
          ` : ''}
          <div class="dropdown-divider"></div>
          <button id="btn-logout" class="dropdown-item text-danger">
            <i class="bi bi-box-arrow-right"></i> Logout
          </button>
        </div>
      </div>
    </li>
  `;
  
  return menuItems;
};

const attachNavbarEventListeners = () => {
  const btnLogin = document.getElementById('btn-login');
  if (btnLogin) {
    btnLogin.addEventListener('click', () => {
      showLoginModal();
    });
  }
  
  const btnSignup = document.getElementById('btn-signup');
  if (btnSignup) {
    btnSignup.addEventListener('click', () => {
      showSignupModal();
    });
  }
  
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', handleLogout);
  }
  
  const userDropdown = document.getElementById('user-dropdown');
  const userMenu = document.getElementById('user-menu');
  if (userDropdown && userMenu) {
    userDropdown.addEventListener('click', (e) => {
      e.stopPropagation();
      userMenu.classList.toggle('show');
    });
    
    document.addEventListener('click', (e) => {
      if (!userDropdown.contains(e.target)) {
        userMenu.classList.remove('show');
      }
    });
    
    const dropdownItems = userMenu.querySelectorAll('.dropdown-item');
    dropdownItems.forEach(item => {
      item.addEventListener('click', () => {
        userMenu.classList.remove('show');
      });
    });
  }
  
  // Note: Notification bell click is handled by notification-bell.js component
  
  const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
  const navbarNav = document.getElementById('navbar-nav');
  if (mobileMenuToggle && navbarNav) {
    mobileMenuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      navbarNav.classList.toggle('mobile-menu-open');
      mobileMenuToggle.classList.toggle('menu-open');
    });
    
    document.addEventListener('click', (e) => {
      const navbar = document.getElementById('main-navbar');
      if (navbar && !navbar.contains(e.target)) {
        navbarNav.classList.remove('mobile-menu-open');
        mobileMenuToggle.classList.remove('menu-open');
      }
    });
    
    const navLinks = navbarNav.querySelectorAll('.navbar-link, .dropdown-item');
    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        navbarNav.classList.remove('mobile-menu-open');
        mobileMenuToggle.classList.remove('menu-open');
      });
    });
  }
};

const showLoginModal = () => {
  import('../features/auth/login.js').then(module => {
    if (module.showLoginModal) {
      module.showLoginModal();
    }
  });
};

const showSignupModal = () => {
  import('../features/auth/signup.js').then(module => {
    if (module.showSignupModal) {
      module.showSignupModal();
    }
  });
};

const showNotificationPanel = () => {
  import('../features/notifications/notification-center.js').then(module => {
    if (module.showNotificationCenter) {
      module.showNotificationCenter();
    }
  });
};

const handleLogout = async () => {
  const modal = createModal({
    title: 'Confirm Logout',
    content: `
      <div class="space-y-4">
        <p class="text-gray-700">Are you sure you want to logout?</p>
        <p class="text-sm text-gray-600">You will be redirected to the home page.</p>
      </div>
    `,
    footer: `
      <button class="btn btn-outline" onclick="document.querySelector('.modal-backdrop').remove()">
        <i class="bi bi-x-circle"></i> Cancel
      </button>
      <button class="btn btn-danger" id="confirm-logout-btn">
        <i class="bi bi-box-arrow-right"></i> Logout
      </button>
    `,
    size: 'sm'
  });
  
  const confirmBtn = document.getElementById('confirm-logout-btn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Logging out...';
      
      try {
        const { post } = await import('../core/http.js');
        const { ENDPOINTS } = await import('../config/api.js');
        
        await post(ENDPOINTS.AUTH.LOGOUT);
        
        logout(true); 
        
        window.location.href = '/index.html';
      } catch (error) {
        console.error('Logout error:', error);

        logout(true);
        window.location.href = '/index.html';
      }
    });
  }
};

const updateCartCount = (count) => {
  const cartBadge = document.getElementById('cart-count');
  if (cartBadge) {
    if (count > 0) {
      cartBadge.textContent = count > 99 ? '99+' : count;
      cartBadge.style.display = 'block';
    } else {
      cartBadge.style.display = 'none';
    }
  }
};

const updateNotificationCount = (count) => {
  const notificationBadge = document.getElementById('notification-count');
  if (notificationBadge) {
    if (count > 0) {
      notificationBadge.textContent = count > 99 ? '99+' : count;
      notificationBadge.style.display = 'block';
    } else {
      notificationBadge.style.display = 'none';
    }
  }
  
  // Also update notification bell if initialized
  if (updateNotificationBellCount) {
    updateNotificationBellCount();
  }
};

const updateOrdersCount = (count) => {
  const ordersBadge = document.getElementById('orders-count');
  if (ordersBadge) {
    if (count > 0) {
      ordersBadge.textContent = count > 99 ? '99+' : count;
      ordersBadge.style.display = 'block';
    } else {
      ordersBadge.style.display = 'none';
    }
  }
};

const updateMessagesCount = (count) => {
  const messagesBadge = document.getElementById('messages-count');
  if (messagesBadge) {
    if (count > 0) {
      messagesBadge.textContent = count > 99 ? '99+' : count;
      messagesBadge.style.display = 'block';
    } else {
      messagesBadge.style.display = 'none';
    }
  }
};

window.addEventListener('auth:login', renderNavbar);
window.addEventListener('auth:logout', renderNavbar);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderNavbar);
} else {
  renderNavbar();
}

export {
  renderNavbar,
  updateCartCount,
  updateNotificationCount,
  updateOrdersCount,
  updateMessagesCount
};
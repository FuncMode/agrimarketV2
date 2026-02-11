// assets/js/main-loader.js
// Automatic Page Script Loader
// Auto-loads the appropriate main.js file based on the current page

/**
 * Main loader that automatically loads page-specific scripts
 * based on data-page attribute or current filename
 */
(function() {
  'use strict';
  
  // ============ Configuration ============
  
  const PAGE_SCRIPTS = {
    'index': '/assets/js/pages/index.main.js',
    'buyer': '/assets/js/pages/buyer.main.js',
    'seller': '/assets/js/pages/seller.main.js',
    'admin': '/assets/js/pages/admin.main.js',
    'verification': '/assets/js/pages/verification.main.js',
    'reset-password': '/assets/js/pages/reset-password.js'
  };
  
  // ============ Detect Current Page ============
  
  const detectPageName = () => {
    // Method 1: Check for data-page attribute on body
    const dataPage = document.body.getAttribute('data-page');
    if (dataPage) {
      return dataPage;
    }
    
    // Method 2: Extract from filename
    const path = window.location.pathname;
    const filename = path.split('/').pop();
    const pageName = filename.replace('.html', '');
    
    // Default to 'index' for root or empty
    if (!pageName || pageName === '' || pageName === '/') {
      return 'index';
    }
    
    return pageName;
  };
  
  // ============ Load Script ============
  
  const loadPageScript = (scriptUrl) => {
    return new Promise((resolve, reject) => {
      // Check if script already loaded
      const existingScript = document.querySelector(`script[src="${scriptUrl}"]`);
      if (existingScript) {

        resolve();
        return;
      }
      
      // Create script element
      const script = document.createElement('script');
      script.type = 'module';
      script.src = scriptUrl;
      
      script.onload = () => {

        resolve();
      };
      
      script.onerror = () => {
        console.error('❌ Failed to load page script:', scriptUrl);
        reject(new Error(`Failed to load script: ${scriptUrl}`));
      };
      
      // Append to document
      document.body.appendChild(script);
    });
  };
  
  // ============ Initialize ============
  
  const init = async () => {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }
    

    
    // Detect current page
    const pageName = detectPageName();

    
    // Get script URL for this page
    const scriptUrl = PAGE_SCRIPTS[pageName];
    
    if (!scriptUrl) {
      console.warn('No script mapping found for page:', pageName);

      return;
    }
    
    // Load the script
    try {
      await loadPageScript(scriptUrl);

    } catch (error) {
      console.error('Main loader error:', error);
    }
  };
  
  // ============ Export for Manual Loading ============
  
  window.AgriMarketLoader = {
    load: (pageName) => {
      const scriptUrl = PAGE_SCRIPTS[pageName];
      if (!scriptUrl) {
        console.error('Unknown page:', pageName);
        return Promise.reject(new Error(`Unknown page: ${pageName}`));
      }
      return loadPageScript(scriptUrl);
    },
    pages: Object.keys(PAGE_SCRIPTS),
    detectPage: detectPageName
  };
  
  // ============ Auto-run ============
  
  // Only auto-run if this script is included directly in HTML
  // Check if we should auto-initialize
  const currentScript = document.currentScript;
  const shouldAutoInit = currentScript && currentScript.hasAttribute('data-auto-init');
  
  if (shouldAutoInit !== false) {
    // Auto-initialize by default
    init();
  }
  
})();
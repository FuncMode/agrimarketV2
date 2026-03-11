// assets/js/config/env-loader.js
// Environment Variables Loader (non-module script)
// This must be loaded BEFORE any ES modules that depend on ENV

(function() {
  // Auto-detect API URL based on current domain
  // If on localhost, use localhost; otherwise use current domain
  const isLocalhost = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1';

  // Load from environment variables injected at runtime.
  const envVars = window.__ENV || window.__APP_ENV__ || {};
  const inferredApiBase = isLocalhost
    ? 'http://localhost:3000/api'
    : `${window.location.origin}/api`;
  
  const apiBase = envVars.API_BASE_URL || envVars.VITE_API_BASE_URL || inferredApiBase;

  // Resolve public runtime config from backend when not injected.
  // We use sync XHR here because this script must finish before ES modules boot.
  let remotePublicConfig = {};
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', `${apiBase}/public-config`, false);
    xhr.send(null);

    if (xhr.status >= 200 && xhr.status < 300) {
      const parsed = JSON.parse(xhr.responseText || '{}');
      remotePublicConfig = parsed?.data || {};
    }
  } catch (e) {
    // Ignore and continue with injected env only.
  }
  
  window.ENV = {
    API_BASE_URL: apiBase,
    SUPABASE_URL: envVars.SUPABASE_URL || remotePublicConfig.SUPABASE_URL,
    SUPABASE_ANON_KEY: envVars.SUPABASE_ANON_KEY || remotePublicConfig.SUPABASE_ANON_KEY,
    ENVIRONMENT: isLocalhost ? 'development' : 'production',
    DEBUG: isLocalhost
  };
})();

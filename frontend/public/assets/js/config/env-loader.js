// assets/js/config/env-loader.js
// Environment Variables Loader (non-module script)
// This must be loaded BEFORE any ES modules that depend on ENV

(function() {
  // Auto-detect API URL based on current domain
  // If on localhost, use localhost; otherwise use current domain
  const isLocalhost = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1';
  
  const apiBase = isLocalhost 
    ? 'http://localhost:3000/api'
    : 'https://agrimarketv2-production.up.railway.app/api'; // Production Railway backend
    
  const socketUrl = isLocalhost
    ? 'ws://localhost:3000'
    : 'wss://agrimarketv2-production.up.railway.app'; // Production Railway WebSocket

  // Load from environment variables (injected by server)
  const envVars = window.__ENV || {};
  
  window.ENV = {
    API_BASE_URL: apiBase,
    SUPABASE_URL: envVars.SUPABASE_URL,
    SUPABASE_ANON_KEY: envVars.SUPABASE_ANON_KEY,
    SOCKET_URL: socketUrl,
    ENVIRONMENT: isLocalhost ? 'development' : 'production',
    DEBUG: isLocalhost
  };
})();
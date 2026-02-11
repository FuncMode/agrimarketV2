// assets/js/config/env.js
// Environment Configuration Loader
// This handles environment variables injected via HTML script tags or process.env in Node.js

// Detect environment (browser vs Node.js)
const isBrowser = typeof window !== 'undefined';
const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

// Get environment variables from appropriate source
let envSource = {};

if (isBrowser) {
  // In browser, use window.ENV (set by env-loader.js) or window.__APP_ENV__
  envSource = window.ENV || window.__APP_ENV__ || {};
} else if (isNode) {
  // In Node.js, use process.env
  envSource = process.env;
}

// Create ENV object with environment-based fallback values
// For development: use localhost, for production: use Railway backend
const getDefaultApiUrl = () => {
  if (isBrowser) {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:3000/api';
    }
    // For production (Vercel), don't use current domain, use Railway backend
    // This is the hardcoded production backend URL
    return 'https://agrimarketv2-production.up.railway.app/api';
  }
  return 'http://localhost:3000/api'; // Default for Node.js environment
};

const getDefaultWsUrl = () => {
  if (isBrowser) {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'ws://localhost:3000';
    }
    // For production (Vercel), use Railway backend
    return 'wss://agrimarketv2-production.up.railway.app';
  }
  return 'ws://localhost:3000'; // Default for Node.js environment
};

const ENV = {
  API_BASE_URL: envSource.API_BASE_URL || envSource.VITE_API_BASE_URL || getDefaultApiUrl(),
  WS_URL: envSource.WS_URL || envSource.VITE_WS_URL || getDefaultWsUrl(),
  SUPABASE_URL: envSource.SUPABASE_URL || envSource.VITE_SUPABASE_URL,
  SUPABASE_ANON_KEY: envSource.SUPABASE_ANON_KEY || envSource.VITE_SUPABASE_ANON_KEY,
  APP_NAME: envSource.APP_NAME || envSource.VITE_APP_NAME || 'AgriMarket',
  APP_ENV: envSource.ENVIRONMENT || envSource.VITE_APP_ENV || 'development'
};

// Validate required environment variables
// Only warn if truly missing (handle both browser and node environments)
const hasBothSupabaseVars = Boolean(ENV.SUPABASE_URL && ENV.SUPABASE_ANON_KEY);

if (!hasBothSupabaseVars && !isBrowser) {
  console.warn('⚠️  Warning: SUPABASE_URL and SUPABASE_ANON_KEY are required in environment variables');
}

// Log environment in development
if (ENV.APP_ENV === 'development') {
  const logEnv = {
    API_BASE_URL: ENV.API_BASE_URL,
    WS_URL: ENV.WS_URL,
    SUPABASE_URL: ENV.SUPABASE_URL ? ENV.SUPABASE_URL.substring(0, 20) + '...' : 'NOT SET',
    APP_ENV: ENV.APP_ENV,
    Environment: isBrowser ? 'Browser' : isNode ? 'Node.js' : 'Unknown'
  };

}

export default ENV;
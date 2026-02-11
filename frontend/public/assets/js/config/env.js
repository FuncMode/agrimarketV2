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

// Create ENV object with fallback values
const ENV = {
  API_BASE_URL: envSource.API_BASE_URL || envSource.VITE_API_BASE_URL || 'http://localhost:8080/api',
  WS_URL: 'wss://agrimarket-production-04b3.up.railway.app', // Force Railway WebSocket
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
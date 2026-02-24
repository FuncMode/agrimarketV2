// assets/js/config/supabase.js
// Supabase Client Initialization
// Used primarily for storage access and realtime subscriptions

import ENV from './env.js';
import { getToken } from '../core/auth.js';

const SUPABASE_CONFIG = {
  url: ENV.SUPABASE_URL,
  anonKey: ENV.SUPABASE_ANON_KEY
};

// Initialize Supabase client (loaded from CDN in HTML)
let supabaseClient = null;
let supabaseLibPromise = null;
let realtimeAuthListenersBound = false;

const loadSupabaseLib = async () => {
  if (typeof window !== 'undefined' && window.supabase?.createClient) {
    return window.supabase;
  }

  if (!supabaseLibPromise) {
    supabaseLibPromise = new Promise((resolve) => {
      if (typeof document === 'undefined') {
        resolve(null);
        return;
      }

      const existing = document.querySelector('script[data-supabase-sdk="true"]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.supabase || null), { once: true });
        existing.addEventListener('error', () => resolve(null), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      script.async = true;
      script.defer = true;
      script.dataset.supabaseSdk = 'true';
      script.onload = () => resolve(window.supabase || null);
      script.onerror = () => {
        console.warn('Failed to load Supabase UMD SDK from CDN');
        resolve(null);
      };
      document.head.appendChild(script);
    });
  }

  return supabaseLibPromise;
};

const initSupabase = async () => {
  if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
    console.warn('Supabase config missing. Storage and realtime features may not work.');
    return null;
  }

  const supabaseLib = await loadSupabaseLib();
  if (!supabaseLib?.createClient) {
    console.warn('Supabase library not loaded. Storage and realtime features may not work.');
    return null;
  }

  if (!supabaseClient) {
    supabaseClient = supabaseLib.createClient(
      SUPABASE_CONFIG.url,
      SUPABASE_CONFIG.anonKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false
        },
        realtime: {
          params: {
            eventsPerSecond: 10
          }
        }
      }
    );
  }

  // Keep realtime auth in sync with app JWT so RLS policies using auth.uid() work.
  syncRealtimeAuth();
  bindRealtimeAuthListeners();

  return supabaseClient;
};

const syncRealtimeAuth = () => {
  if (!supabaseClient?.realtime?.setAuth) return;

  const token = getToken();
  if (token) {
    supabaseClient.realtime.setAuth(token);
  } else {
    // Fallback to anon token when logged out.
    supabaseClient.realtime.setAuth(SUPABASE_CONFIG.anonKey);
  }
};

const bindRealtimeAuthListeners = () => {
  if (realtimeAuthListenersBound || typeof window === 'undefined') return;
  realtimeAuthListenersBound = true;

  window.addEventListener('auth:login', syncRealtimeAuth);
  window.addEventListener('auth:logout', syncRealtimeAuth);
};

// Get signed URL for private storage files
const getSignedUrl = async (bucket, path, expiresIn = 3600) => {
  const client = await initSupabase();
  if (!client) return null;
  
  try {
    const { data, error } = await client.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);
    
    if (error) throw error;
    return data.signedUrl;
  } catch (error) {
    console.error('Error getting signed URL:', error);
    return null;
  }
};

// Get public URL for public storage files
const getPublicUrl = (bucket, path) => {
  if (!supabaseClient) return null;

  const { data } = supabaseClient.storage
    .from(bucket)
    .getPublicUrl(path);

  return data?.publicUrl || null;
};

// Storage buckets
const BUCKETS = {
  PRODUCT_PHOTOS: 'product-photos',
  ID_DOCUMENTS: 'id-documents',
  SELFIE_PHOTOS: 'selfie-photos',
  ISSUE_EVIDENCE: 'issue-evidence',
  MESSAGE_ATTACHMENTS: 'message-attachments'
};

export {
  initSupabase,
  getSignedUrl,
  getPublicUrl,
  BUCKETS,
  supabaseClient
};

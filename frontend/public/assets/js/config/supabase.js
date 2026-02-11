// assets/js/config/supabase.js
// Supabase Client Initialization
// Used primarily for storage access and realtime subscriptions

import ENV from './env.js';

const SUPABASE_CONFIG = {
  url: ENV.SUPABASE_URL,
  anonKey: ENV.SUPABASE_ANON_KEY
};

// Initialize Supabase client (loaded from CDN in HTML)
let supabaseClient = null;

const initSupabase = () => {
  if (typeof window.supabase === 'undefined') {
    console.warn('Supabase library not loaded. Storage features may not work.');
    return null;
  }
  
  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(
      SUPABASE_CONFIG.url,
      SUPABASE_CONFIG.anonKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false
        }
      }
    );
  }
  
  return supabaseClient;
};

// Get signed URL for private storage files
const getSignedUrl = async (bucket, path, expiresIn = 3600) => {
  const client = initSupabase();
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
  const client = initSupabase();
  if (!client) return null;
  
  const { data } = client.storage
    .from(bucket)
    .getPublicUrl(path);
  
  return data.publicUrl;
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
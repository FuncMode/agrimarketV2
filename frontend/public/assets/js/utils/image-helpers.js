// assets/js/utils/image-helpers.js
// Helper functions for image URL handling

import ENV from '../config/env.js';

/**
 * Convert a storage path to a full Supabase public URL
 * @param {string} path - The storage path (e.g., "orders/xxx/file.jpg")
 * @param {string} bucket - The storage bucket name (default: 'delivery-proof')
 * @returns {string} - Full public URL or original path if already a URL
 */
export const getStorageUrl = (path, bucket = 'delivery-proof') => {
  if (!path) return '';
  
  // If already a full URL, return as is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  
  // Construct Supabase public URL
  const supabaseUrl = ENV.SUPABASE_URL;
  if (!supabaseUrl) {
    console.error('SUPABASE_URL not configured. Check env-loader.js');
    console.error('Current ENV:', ENV);
    return path;
  }
  
  // Remove leading slash if present
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  
  // Build the full public URL
  const fullUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${cleanPath}`;
  
  return fullUrl;
};

/**
 * Get delivery proof image URL (seller or buyer)
 * @param {string} path - The storage path
 * @returns {string} - Full public URL
 */
export const getDeliveryProofUrl = (path) => {
  return getStorageUrl(path, 'delivery-proof');
};

/**
 * Get product photo URL
 * @param {string} path - The storage path
 * @returns {string} - Full public URL
 */
export const getProductPhotoUrl = (path) => {
  return getStorageUrl(path, 'product-photos');
};

/**
 * Get issue evidence URL
 * @param {string} path - The storage path
 * @returns {string} - Full public URL
 */
export const getIssueEvidenceUrl = (path) => {
  if (!path) return '';
  return getStorageUrl(path, 'issue-evidence');
};

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
  
  // Remove leading slash if present
  let cleanPath = path.startsWith('/') ? path.slice(1) : path;
  // If callers pass "bucket/path", normalize to just "path"
  if (cleanPath.startsWith(`${bucket}/`)) {
    cleanPath = cleanPath.slice(bucket.length + 1);
  }

  // Construct Supabase public URL when runtime env is available
  const supabaseUrl = ENV.SUPABASE_URL;
  if (supabaseUrl) {
    return `${supabaseUrl}/storage/v1/object/public/${bucket}/${cleanPath}`;
  }

  // Fallback: use backend proxy endpoint so browser doesn't need SUPABASE_URL.
  const apiBase = (ENV.API_BASE_URL || '/api').replace(/\/+$/, '');
  const encodedPath = cleanPath
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
  return `${apiBase}/storage/public/${bucket}/${encodedPath}`;
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

/**
 * Get message attachment URL
 * Supports both raw object paths and bucket-prefixed paths.
 * @param {string} path - The storage path
 * @returns {string} - Full public URL
 */
export const getMessageAttachmentUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  let cleanPath = path.startsWith('/') ? path.slice(1) : path;
  if (cleanPath.startsWith('message-attachments/')) {
    cleanPath = cleanPath.slice('message-attachments/'.length);
  }

  return getStorageUrl(cleanPath, 'message-attachments');
};

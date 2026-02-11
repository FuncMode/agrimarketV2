// src\config\storage.js
const { supabaseService } = require('./database');
const path = require('path');
const crypto = require('crypto');

const BUCKETS = {
  PRODUCT_PHOTOS: 'product-photos',
  ID_DOCUMENTS: 'id-documents',
  SELFIE_PHOTOS: 'selfie-photos',
  ISSUE_EVIDENCE: 'issue-evidence',
  MESSAGE_ATTACHMENTS: 'message-attachments',
  DELIVERY_PROOF: 'delivery-proof'
};

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png'
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const validateFile = (fileBuffer, mimeType) => {
  if (!fileBuffer || fileBuffer.length === 0) {
    return { valid: false, error: 'Empty file' };
  }

  if (fileBuffer.length > MAX_FILE_SIZE) {
    return { valid: false, error: 'File too large (max 5MB)' };
  }

  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return { valid: false, error: 'Invalid file type' };
  }

  return { valid: true };
};

const uploadFile = async (bucket, filePath, fileBuffer, contentType) => {
  try {
    const validation = validateFile(fileBuffer, contentType);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error
      };
    }

    const { data, error } = await supabaseService.storage
      .from(bucket)
      .upload(filePath, fileBuffer, {
        contentType,
        upsert: false,
        cacheControl: '3600',
        duplex: 'half'
      });

    if (error) {
      console.error('Supabase upload error:', error);
      return {
        success: false,
        error: error.message
      };
    }

    // Get public URL for all buckets
    const { data: urlData } = supabaseService.storage
      .from(bucket)
      .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl;

    return {
      success: true,
      data: {
        path: data.path,
        fullPath: data.fullPath || filePath,
        publicUrl
      }
    };

  } catch (error) {
    console.error('Upload file error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

const getSignedUrl = async (bucket, filePath, expiresIn = 3600) => {
  try {
    if (!filePath) {
      return {
        success: false,
        error: 'File path is required'
      };
    }

    const { data, error } = await supabaseService.storage
      .from(bucket)
      .createSignedUrl(filePath, expiresIn);

    if (error) {
      console.error(`Signed URL error for ${bucket}/${filePath}:`, error);
      return {
        success: false,
        error: error.message
      };
    }

    if (!data || !data.signedUrl) {
      console.error(`No signed URL returned for ${bucket}/${filePath}`);
      return {
        success: false,
        error: 'No signed URL returned'
      };
    }

    return {
      success: true,
      signedUrl: data.signedUrl
    };

  } catch (error) {
    console.error('Get signed URL error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

const deleteFile = async (bucket, filePath) => {
  try {
    const { data, error } = await supabaseService.storage
      .from(bucket)
      .remove([filePath]);

    if (error) {
      return {
        success: false,
        error: error.message
      };
    }

    return {
      success: true,
      data
    };

  } catch (error) {
    console.error('Delete file error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

const generateSecureFilename = (userId, originalName, prefix = '') => {
  const timestamp = Date.now();
  const randomHash = crypto.randomBytes(8).toString('hex');
  const extension = path.extname(originalName).toLowerCase();
  const sanitizedExt = extension.replace(/[^.a-z0-9]/gi, '');

  const filename = prefix
    ? `${prefix}_${timestamp}_${randomHash}${sanitizedExt}`
    : `${timestamp}_${randomHash}${sanitizedExt}`;

  return `${userId}/${filename}`;
};

const uploadIdDocument = async (userId, fileBuffer, originalName, contentType) => {
  const filePath = generateSecureFilename(userId, originalName, 'id');
  return uploadFile(BUCKETS.ID_DOCUMENTS, filePath, fileBuffer, contentType);
};

const uploadSelfiePhoto = async (userId, fileBuffer, originalName, contentType) => {
  const filePath = generateSecureFilename(userId, originalName, 'selfie');
  return uploadFile(BUCKETS.SELFIE_PHOTOS, filePath, fileBuffer, contentType);
};

const uploadProductPhoto = async (sellerId, fileBuffer, originalName, contentType) => {
  const filePath = generateSecureFilename(sellerId, originalName, 'product');
  return uploadFile(BUCKETS.PRODUCT_PHOTOS, filePath, fileBuffer, contentType);
};

const uploadIssueEvidence = async (issueId, fileBuffer, originalName, contentType) => {
  const timestamp = Date.now();
  const randomHash = crypto.randomBytes(8).toString('hex');
  const extension = path.extname(originalName).toLowerCase();
  const sanitizedExt = extension.replace(/[^.a-z0-9]/gi, '');
  const filePath = `${issueId}/evidence_${timestamp}_${randomHash}${sanitizedExt}`;

  return uploadFile(BUCKETS.ISSUE_EVIDENCE, filePath, fileBuffer, contentType);
};

const uploadMessageAttachment = async (orderId, fileBuffer, originalName, contentType) => {
  const timestamp = Date.now();
  const randomHash = crypto.randomBytes(8).toString('hex');
  const extension = path.extname(originalName).toLowerCase();
  const sanitizedExt = extension.replace(/[^.a-z0-9]/gi, '');
  const filePath = `${orderId}/msg_${timestamp}_${randomHash}${sanitizedExt}`;

  return uploadFile(BUCKETS.MESSAGE_ATTACHMENTS, filePath, fileBuffer, contentType);
};

module.exports = {
  BUCKETS,
  uploadFile,
  getSignedUrl,
  deleteFile,
  generateSecureFilename,
  uploadIdDocument,
  uploadSelfiePhoto,
  uploadProductPhoto,
  uploadIssueEvidence,
  uploadMessageAttachment,
  validateFile
};
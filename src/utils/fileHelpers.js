// src\utils\fileHelpers.js

const path = require('path');
const crypto = require('crypto');

exports.isValidFileType = (filename, allowedTypes) => {
  const ext = path.extname(filename).toLowerCase();
  return allowedTypes.includes(ext);
};

exports.isValidImage = (filename) => {
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  return exports.isValidFileType(filename, allowedExtensions);
};

exports.isValidDocument = (filename) => {
  const allowedExtensions = ['.pdf', '.doc', '.docx', '.txt'];
  return exports.isValidFileType(filename, allowedExtensions);
};

exports.getExtension = (filename) => {
  return path.extname(filename).toLowerCase();
};

exports.getFilenameWithoutExt = (filename) => {
  return path.basename(filename, path.extname(filename));
};

exports.sanitizeFilename = (filename) => {
  return filename
    .replace(/[^a-z0-9._-]/gi, '_')
    .replace(/_{2,}/g, '_') 
    .toLowerCase();
};

exports.generateUniqueFilename = (originalName, userId = null) => {
  const timestamp = Date.now();
  const randomHash = crypto.randomBytes(8).toString('hex');
  const extension = exports.getExtension(originalName);
  const sanitizedName = exports.sanitizeFilename(
    exports.getFilenameWithoutExt(originalName)
  );

  if (userId) {
    return `${userId}_${sanitizedName}_${timestamp}_${randomHash}${extension}`;
  }

  return `${sanitizedName}_${timestamp}_${randomHash}${extension}`;
};

exports.formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

exports.isFileSizeValid = (fileSize, maxSizeInMB = 5) => {
  const maxSizeInBytes = maxSizeInMB * 1024 * 1024;
  return fileSize <= maxSizeInBytes;
};

exports.getMimeType = (filename) => {
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.xml': 'application/xml'
  };

  const ext = exports.getExtension(filename);
  return mimeTypes[ext] || 'application/octet-stream';
};

exports.getExtensionFromMimeType = (mimeType) => {
  const extensions = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'text/plain': '.txt',
    'text/csv': '.csv',
    'application/json': '.json'
  };

  return extensions[mimeType] || '';
};

exports.validateFileBuffer = (buffer) => {
  if (!buffer) {
    return { valid: false, error: 'No file buffer provided' };
  }

  if (buffer.length === 0) {
    return { valid: false, error: 'Empty file buffer' };
  }

  return { valid: true };
};

exports.isImageBuffer = (buffer) => {
  if (!buffer || buffer.length < 4) {
    return false;
  }

  const signatures = {
    jpg: [0xFF, 0xD8, 0xFF],
    png: [0x89, 0x50, 0x4E, 0x47],
    gif: [0x47, 0x49, 0x46],
    webp: [0x52, 0x49, 0x46, 0x46]
  };

  for (const [type, signature] of Object.entries(signatures)) {
    let matches = true;
    for (let i = 0; i < signature.length; i++) {
      if (buffer[i] !== signature[i]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }

  return false;
};

exports.generateFilePath = (userId, category, filename) => {
  const sanitized = exports.sanitizeFilename(filename);
  return `${userId}/${category}/${sanitized}`;
};

exports.parseFilePath = (filePath) => {
  const parts = filePath.split('/');
  const filename = parts[parts.length - 1];
  const directory = parts.slice(0, -1).join('/');

  return {
    filename,
    directory,
    extension: exports.getExtension(filename),
    basename: exports.getFilenameWithoutExt(filename),
    fullPath: filePath
  };
};

exports.createSafeUrl = (filename) => {
  return encodeURIComponent(exports.sanitizeFilename(filename));
};

exports.validateFiles = (files, options = {}) => {
  const {
    maxFiles = 5,
    maxSizePerFile = 5,
    allowedTypes = ['.jpg', '.jpeg', '.png']
  } = options;

  const errors = [];

  if (!files || files.length === 0) {
    return {
      valid: false,
      errors: ['No files provided']
    };
  }

  if (files.length > maxFiles) {
    errors.push(`Too many files. Maximum ${maxFiles} files allowed.`);
  }

  files.forEach((file, index) => {
    if (!exports.isFileSizeValid(file.size, maxSizePerFile)) {
      errors.push(`File ${index + 1}: File too large. Maximum ${maxSizePerFile}MB allowed.`);
    }

    if (!exports.isValidFileType(file.originalname, allowedTypes)) {
      errors.push(`File ${index + 1}: Invalid file type. Allowed: ${allowedTypes.join(', ')}`);
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
};

exports.getFileMetadata = (file) => {
  return {
    originalName: file.originalname || file.name,
    size: file.size,
    sizeFormatted: exports.formatFileSize(file.size),
    mimetype: file.mimetype,
    extension: exports.getExtension(file.originalname || file.name),
    isImage: exports.isValidImage(file.originalname || file.name),
    isDocument: exports.isValidDocument(file.originalname || file.name)
  };
};

exports.hasExtension = (filename, extension) => {
  const fileExt = exports.getExtension(filename);
  const compareExt = extension.startsWith('.') ? extension : `.${extension}`;
  return fileExt === compareExt.toLowerCase();
};

exports.getRelativePath = (fullPath, basePath) => {
  return path.relative(basePath, fullPath);
};

exports.joinPaths = (...paths) => {
  return path.join(...paths);
};

exports.normalizePath = (filePath) => {
  return path.normalize(filePath).replace(/\\/g, '/');
};

exports.isSafePath = (filePath) => {
  const normalized = exports.normalizePath(filePath);
  return !normalized.includes('..');
};

module.exports = exports;
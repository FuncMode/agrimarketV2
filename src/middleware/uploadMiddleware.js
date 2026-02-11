// src\middleware\uploadMiddleware.js
const multer = require('multer');
const path = require('path');
const { AppError } = require('./errorHandler');


const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        'Invalid file type. Only JPG, JPEG, and PNG images are allowed.',
        400
      ),
      false
    );
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, 
    files: 5 
  }
});


const uploadSingle = (fieldName) => {
  return (req, res, next) => {
    const uploadHandler = upload.single(fieldName);
    
    uploadHandler(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError('File too large. Maximum size is 5MB.', 413));
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return next(new AppError(`Unexpected field: ${err.field}. Expected: ${fieldName}`, 400));
        }
        return next(new AppError(err.message, 400));
      }
      
      if (err) {
        return next(err);
      }

      if (!req.file) {
        return next(new AppError(`${fieldName} is required.`, 400));
      }

      next();
    });
  };
};


const uploadMultiple = (fieldName, maxCount = 5) => {
  return (req, res, next) => {
    const uploadHandler = upload.array(fieldName, maxCount);
    
    uploadHandler(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError('File too large. Maximum size is 5MB per file.', 413));
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return next(new AppError(`Too many files. Maximum is ${maxCount}.`, 400));
        }
        return next(new AppError(err.message, 400));
      }
      
      if (err) {
        return next(err);
      }

      if (!req.files || req.files.length === 0) {
        return next(new AppError(`At least one ${fieldName} is required.`, 400));
      }

      next();
    });
  };
};

const uploadFields = (fields) => {
  return (req, res, next) => {
    const uploadHandler = upload.fields(fields);
    
    uploadHandler(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError('File too large. Maximum size is 5MB per file.', 413));
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return next(new AppError(`Unexpected field: ${err.field}`, 400));
        }
        return next(new AppError(err.message, 400));
      }
      
      if (err) {
        return next(err);
      }

      const missingFields = fields.filter(field => {
        return !req.files || !req.files[field.name] || req.files[field.name].length === 0;
      });

      if (missingFields.length > 0) {
        const fieldNames = missingFields.map(f => f.name).join(', ');
        return next(new AppError(`Missing required files: ${fieldNames}`, 400));
      }

      next();
    });
  };
};

const uploadOptional = (fieldName) => {
  return (req, res, next) => {
    const uploadHandler = upload.single(fieldName);
    
    uploadHandler(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError('File too large. Maximum size is 5MB.', 413));
        }
        return next(new AppError(err.message, 400));
      }
      
      if (err) {
        return next(err);
      }

      next();
    });
  };
};

const validateImageDimensions = async (buffer, requirements = {}) => {

  return true;
};


const generateFilename = (originalName, userId) => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  const extension = path.extname(originalName);
  return `${userId}_${timestamp}_${random}${extension}`;
};


module.exports = {
  upload,                
  uploadSingle,          
  uploadMultiple,        
  uploadFields,            
  uploadOptional,         
  validateImageDimensions, 
  generateFilename         
};


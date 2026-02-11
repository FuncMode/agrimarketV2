const { body, param, query, validationResult } = require('express-validator');
const { AppError } = require('../middleware/errorHandler');


const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(err => ({
      field: err.path,
      message: err.msg,
      value: err.value
    }));

    throw new AppError('Validation failed', 400, formattedErrors);
  }
  
  next();
};

const validateEmail = () => {
  return body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail()
    .isLength({ max: 255 }).withMessage('Email must not exceed 255 characters');
};

const validatePassword = (fieldName = 'password') => {
  return body(fieldName)
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number')
    .matches(/[@$!%*?&#]/).withMessage('Password must contain at least one special character (@$!%*?&#)');
};

const validatePhone = () => {
  return body('phone_number')
    .trim()
    .notEmpty().withMessage('Phone number is required')
    .matches(/^(09|\+639)\d{9}$/).withMessage('Invalid phone number. Use format: 09XXXXXXXXX')
    .customSanitizer(value => {
      if (value.startsWith('+639')) {
        return '0' + value.slice(3);
      }
      return value;
    });
};

const validateFullName = () => {
  return body('full_name')
    .trim()
    .notEmpty().withMessage('Full name is required')
    .isLength({ min: 2, max: 255 }).withMessage('Full name must be 2-255 characters')
    .matches(/^[a-zA-Z\s\-\.]+$/).withMessage('Full name can only contain letters, spaces, hyphens, and periods');
};

const validateRole = () => {
  return body('role')
    .notEmpty().withMessage('Role is required')
    .isIn(['buyer', 'seller']).withMessage('Role must be either buyer or seller');
};

const validateMunicipality = () => {
  const rizalMunicipalities = [
    'Angono', 'Antipolo', 'Baras', 'Binangonan', 'Cainta',
    'Cardona', 'Jalajala', 'Morong', 'Pililla', 'Rodriguez',
    'San Mateo', 'Tanay', 'Taytay', 'Teresa'
  ];

  return body('municipality')
    .trim()
    .notEmpty().withMessage('Municipality is required')
    .isIn(rizalMunicipalities).withMessage('Invalid municipality. Must be in Rizal Province.');
};


const validateFarmType = () => {
  return body('farm_type')
    .notEmpty().withMessage('Farm/fishery type is required')
    .isIn(['farm', 'fishery', 'cooperative', 'other'])
    .withMessage('Farm type must be: farm, fishery, cooperative, or other');
};

const validateUUID = (paramName) => {
  return param(paramName)
    .notEmpty().withMessage(`${paramName} is required`)
    .isUUID().withMessage(`Invalid ${paramName} format`);
};

const validateAddress = () => {
  return body('delivery_address')
    .optional()
    .trim()
    .isLength({ min: 10, max: 500 }).withMessage('Address must be 10-500 characters');
};

const validateCoordinates = () => {
  return [
    body('delivery_latitude')
      .optional()
      .isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
    
    body('delivery_longitude')
      .optional()
      .isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude')
  ];
};

const validateTermsAgreement = () => {
  return body('agreed_to_terms')
    .custom((value) => {
      // Accept both boolean true and string "true"
      if (value === true || value === 'true') {
        return true;
      }
      throw new Error('You must agree to the Terms of Service and Privacy Policy');
    });
};

const signupValidation = [
  validateEmail(),
  validatePassword(),
  validateFullName(),
  validatePhone(),
  validateRole(),
  validateTermsAgreement(),
  validate
];

const loginValidation = [
  validateEmail(),
  body('password')
    .notEmpty().withMessage('Password is required'),
  validate
];


const sellerProfileValidation = [
  validateMunicipality(),
  validateFarmType(),
  validate
];


const buyerProfileValidation = [
  validateAddress(),
  ...validateCoordinates(),
  body('preferred_delivery_option')
    .optional()
    .isIn(['pickup', 'drop-off']).withMessage('Delivery option must be pickup or drop-off'),
  validate
];


const forgotPasswordValidation = [
  validateEmail(),
  validate
];

const resetPasswordValidation = [
  body('token')
    .notEmpty().withMessage('Reset token is required'),
  validatePassword('new_password'),
  validate
];

const updateProfileValidation = [
  body('full_name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 255 }).withMessage('Full name must be 2-255 characters')
    .matches(/^[a-zA-Z\s\-\.]+$/).withMessage('Full name can only contain letters, spaces, hyphens, and periods'),
  
  body('phone_number')
    .optional()
    .matches(/^(09|\+639)\d{9}$/).withMessage('Invalid phone number format')
    .customSanitizer(value => {
      if (value && value.startsWith('+639')) {
        return '0' + value.slice(3);
      }
      return value;
    }),
  
  validate
];

const orderQueryValidation = [
  query('status')
    .optional()
    .isIn(['pending', 'confirmed', 'ready', 'completed', 'cancelled'])
    .withMessage('Invalid order status'),

  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be positive')
    .toInt(),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
    .toInt(),

  validate
];

const sellersQueryValidation = [
  query('municipality')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Municipality name too long'),

  query('farm_type')
    .optional()
    .isIn(['farm', 'fishery', 'cooperative', 'other'])
    .withMessage('Invalid farm type'),

  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be positive')
    .toInt(),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
    .toInt(),

  validate
];

module.exports = {
  validate,
  validateEmail,
  validatePassword,
  validatePhone,
  validateFullName,
  validateRole,
  validateMunicipality,
  validateFarmType,
  validateUUID,
  validateAddress,
  validateCoordinates,
  validateTermsAgreement,
  
  signupValidation,
  loginValidation,
  sellerProfileValidation,
  buyerProfileValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  updateProfileValidation,
  orderQueryValidation,
  sellersQueryValidation
};
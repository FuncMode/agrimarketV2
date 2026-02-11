// src\utils\constants.js
const AUTH = {
  MAX_FAILED_LOGIN_ATTEMPTS: 5,
  FAILED_LOGIN_WINDOW_HOURS: 1,
  JWT_EXPIRES_IN: '24h',
  TOKEN_RESET_EXPIRES_HOURS: 1,
  VERIFICATION_TOKEN_EXPIRES_HOURS: 24
};

const FILE_UPLOAD = {
  MAX_FILE_SIZE: 5242880, 
  MAX_PRODUCT_PHOTOS: 5,
  MAX_ID_DOCUMENTS: 2,
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  ALLOWED_DOCUMENT_TYPES: ['image/jpeg', 'image/png', 'application/pdf']
};

const PRODUCT = {
  MAX_PRODUCT_NAME_LENGTH: 200,
  MIN_PRODUCT_NAME_LENGTH: 3,
  MAX_DESCRIPTION_LENGTH: 2000,
  MIN_PRICE: 0.01,
  MAX_PRICE: 999999.99,
  MIN_QUANTITY: 0,
  MAX_QUANTITY: 999999
};

const ORDER = {
  MAX_ITEMS_PER_ORDER: 100,
  ORDER_TIMEOUT_HOURS: 48,
  ORDER_CONFIRMATION_TIMEOUT_HOURS: 72,
  MAX_CANCELLATION_NOTES_LENGTH: 500
};

const MESSAGE = {
  MAX_MESSAGE_LENGTH: 5000,
  MIN_MESSAGE_LENGTH: 1,
  MESSAGES_PER_PAGE: 20
};

const RATING = {
  MIN_RATING: 1,
  MAX_RATING: 5,
  MAX_REVIEW_LENGTH: 1000,
  MIN_WORDS_FOR_REVIEW: 10
};

const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  MIN_LIMIT: 1
};

const USER = {
  MAX_FULL_NAME_LENGTH: 100,
  MIN_FULL_NAME_LENGTH: 2,
  PHONE_NUMBER_LENGTH: 11,
  MAX_ADDRESS_LENGTH: 500,
  PASSWORD_MIN_LENGTH: 8,
  EMAIL_MAX_LENGTH: 255
};

const STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  VERIFIED: 'verified',
  SUSPENDED: 'suspended',
  BANNED: 'banned'
};

const ROLE = {
  BUYER: 'buyer',
  SELLER: 'seller',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin'
};

const ERROR_MESSAGES = {
  UNAUTHORIZED: 'Not authorized. Please login to access this route.',
  FORBIDDEN: 'Access denied. You do not have permission to perform this action.',
  NOT_FOUND: 'Resource not found.',
  INVALID_INPUT: 'Invalid input provided.',
  SERVER_ERROR: 'Internal server error. Please try again later.',
  DUPLICATE_EMAIL: 'Email already in use. Please use a different email.',
  INVALID_CREDENTIALS: 'Invalid email or password.',
  ACCOUNT_BANNED: 'Your account has been banned. Contact admin for more information.',
  ACCOUNT_SUSPENDED: 'Your account is temporarily suspended.',
  VERIFICATION_REQUIRED: 'Account verification required. Please complete verification first.',
  ALREADY_VERIFIED: 'Your account is already verified.'
};

const SUCCESS_MESSAGES = {
  CREATED: 'Resource created successfully.',
  UPDATED: 'Resource updated successfully.',
  DELETED: 'Resource deleted successfully.',
  LOGIN_SUCCESS: 'Login successful.',
  LOGOUT_SUCCESS: 'Logout successful.',
  VERIFICATION_SUBMITTED: 'Verification submitted successfully.',
  ORDER_CREATED: 'Order created successfully.',
  PAYMENT_SUCCESS: 'Payment processed successfully.'
};

module.exports = {
  AUTH,
  FILE_UPLOAD,
  PRODUCT,
  ORDER,
  MESSAGE,
  RATING,
  PAGINATION,
  USER,
  STATUS,
  ROLE,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES
};

// assets/js/utils/messages.js
// Standardized user-facing messages and constants

export const MESSAGES = {
  ERRORS: {
    // Authentication
    AUTH_REQUIRED: 'Please log in to continue',
    UNAUTHORIZED: 'You do not have permission to perform this action',
    INVALID_CREDENTIALS: 'Invalid email or password',
    SESSION_EXPIRED: 'Your session has expired. Please log in again',
    
    // Products
    LOAD_PRODUCTS: 'Failed to load products',
    PRODUCT_NOT_FOUND: 'Product not found',
    CREATE_PRODUCT: 'Failed to create product',
    UPDATE_PRODUCT: 'Failed to update product',
    DELETE_PRODUCT: 'Failed to delete product',
    INVALID_PRODUCT_DATA: 'Please check your product information and try again',
    
    // Cart
    LOAD_CART: 'Failed to load your cart',
    ADD_TO_CART: 'Failed to add item to cart',
    UPDATE_CART: 'Failed to update cart',
    REMOVE_FROM_CART: 'Failed to remove item from cart',
    CLEAR_CART: 'Failed to clear cart',
    CART_EMPTY: 'Your cart is empty',
    
    // Orders
    LOAD_ORDERS: 'Failed to load orders',
    CREATE_ORDER: 'Failed to place order',
    UPDATE_ORDER: 'Failed to update order',
    CANCEL_ORDER: 'Failed to cancel order',
    PLACE_ORDER: 'Failed to place order',
    ORDER_NOT_FOUND: 'Order not found',
    
    // Verification
    LOAD_VERIFICATIONS: 'Failed to load verifications',
    SUBMIT_VERIFICATION: 'Failed to submit verification documents',
    APPROVE_VERIFICATION: 'Failed to approve verification',
    REJECT_VERIFICATION: 'Failed to reject verification',
    REQUEST_EVIDENCE: 'Failed to request evidence',
    
    // Issues
    LOAD_ISSUES: 'Failed to load issues',
    CREATE_ISSUE: 'Failed to report issue',
    RESOLVE_ISSUE: 'Failed to resolve issue',
    
    // Messages
    LOAD_MESSAGES: 'Failed to load messages',
    SEND_MESSAGE: 'Failed to send message',
    DELETE_MESSAGE: 'Failed to delete message',
    LOAD_CONVERSATIONS: 'Failed to load conversations',
    
    // Users
    LOAD_USERS: 'Failed to load users',
    UPDATE_PROFILE: 'Failed to update profile',
    DELETE_ACCOUNT: 'Failed to delete account',
    
    // System
    NETWORK_ERROR: 'Network error. Please check your connection',
    SERVER_ERROR: 'Server error. Please try again later',
    UNKNOWN_ERROR: 'An unexpected error occurred',
    FILE_TOO_LARGE: 'File is too large. Maximum size is 10MB',
    INVALID_FILE_TYPE: 'Invalid file type. Please upload an image or document',
  },

  SUCCESS: {
    // Authentication
    LOGIN_SUCCESS: 'Logged in successfully',
    SIGNUP_SUCCESS: 'Account created successfully',
    LOGOUT_SUCCESS: 'Logged out successfully',
    PASSWORD_RESET: 'Password reset email sent',
    PASSWORD_UPDATED: 'Password updated successfully',
    
    // Products
    PRODUCT_CREATED: 'Product created successfully',
    PRODUCT_UPDATED: 'Product updated successfully',
    PRODUCT_DELETED: 'Product deleted successfully',
    
    // Cart
    ADDED_TO_CART: 'Item added to cart',
    REMOVED_FROM_CART: 'Item removed from cart',
    CART_UPDATED: 'Cart updated',
    CART_CLEARED: 'Cart cleared',
    
    // Orders
    ORDER_PLACED: 'Order placed successfully',
    ORDER_CONFIRMED: 'Order confirmed',
    ORDER_CANCELLED: 'Order cancelled successfully',
    ORDER_COMPLETED: 'Order completed',
    
    // Verification
    VERIFICATION_SUBMITTED: 'Verification documents submitted successfully. You will be notified once reviewed',
    VERIFICATION_APPROVED: 'Verification approved successfully',
    VERIFICATION_REJECTED: 'Verification rejected',
    
    // Issues
    ISSUE_REPORTED: 'Issue reported successfully. We will review it shortly',
    ISSUE_RESOLVED: 'Issue resolved successfully',
    
    // Messages
    MESSAGE_SENT: 'Message sent',
    MESSAGE_DELETED: 'Message deleted',
    
    // Users
    PROFILE_UPDATED: 'Profile updated successfully',
    ACCOUNT_DELETED: 'Account deleted',
  },

  INFO: {
    LOADING: 'Loading...',
    SAVING: 'Saving...',
    PROCESSING: 'Processing...',
    PLEASE_WAIT: 'Please wait...',
    CONFIRM_ACTION: 'Are you sure?',
    CONFIRM_DELETE: 'Are you sure you want to delete this item?',
    CONFIRM_CANCEL_ORDER: 'Are you sure you want to cancel this order?',
    NO_RESULTS: 'No results found',
    NO_ORDERS: 'No orders yet',
    NO_PRODUCTS: 'No products found',
    EMPTY_CART: 'Your cart is empty',
  },

  VALIDATION: {
    REQUIRED_FIELD: 'This field is required',
    INVALID_EMAIL: 'Please enter a valid email address',
    PASSWORD_TOO_SHORT: 'Password must be at least 8 characters',
    PASSWORDS_NOT_MATCH: 'Passwords do not match',
    INVALID_PHONE: 'Please enter a valid phone number',
    INVALID_NUMBER: 'Please enter a valid number',
    POSITIVE_NUMBER: 'Please enter a positive number',
    MINIMUM_CHARACTERS: (n) => `Must be at least ${n} characters`,
    MAXIMUM_CHARACTERS: (n) => `Must not exceed ${n} characters`,
  },

  CONFIRMATION: {
    APPROVE_VERIFICATION: 'Are you sure you want to approve this verification?',
    REJECT_VERIFICATION: 'Are you sure you want to reject this verification?',
    SUSPEND_USER: 'Are you sure you want to suspend this user?',
    BAN_USER: 'Are you sure you want to ban this user?',
    DELETE_PRODUCT: 'Are you sure you want to delete this product?',
  }
};

// Helper function to get error message with fallback
export const getErrorMessage = (errorKey, fallback = MESSAGES.ERRORS.UNKNOWN_ERROR) => {
  const keys = errorKey.split('.');
  let message = MESSAGES;
  
  for (const key of keys) {
    message = message?.[key];
  }
  
  return message || fallback;
};

// Helper function to get success message
export const getSuccessMessage = (messageKey, fallback = 'Operation completed successfully') => {
  const keys = messageKey.split('.');
  let message = MESSAGES;
  
  for (const key of keys) {
    message = message?.[key];
  }
  
  return message || fallback;
};

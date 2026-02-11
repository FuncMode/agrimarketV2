// assets/js/utils/validators.js
// Client-Side Validation Rules

// ============ Email Validation ============

const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validateEmail = (email) => {
  if (!email || email.trim() === '') {
    return { valid: false, message: 'Email is required' };
  }
  
  if (!isValidEmail(email)) {
    return { valid: false, message: 'Please provide a valid email address' };
  }
  
  return { valid: true };
};

// ============ Password Validation ============

const validatePassword = (password) => {
  const errors = [];
  
  if (!password) {
    return { valid: false, message: 'Password is required' };
  }
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  if (!/[@$!%*?&#]/.test(password)) {
    errors.push('Password must contain at least one special character (@$!%*?&#)');
  }
  
  if (errors.length > 0) {
    return { valid: false, message: errors.join('. ') };
  }
  
  return { valid: true };
};

const passwordsMatch = (password, confirmPassword) => {
  if (password !== confirmPassword) {
    return { valid: false, message: 'Passwords do not match' };
  }
  return { valid: true };
};

// ============ Phone Validation ============

const validatePhone = (phone) => {
  if (!phone || phone.trim() === '') {
    return { valid: false, message: 'Phone number is required' };
  }
  
  // Philippine format: 09XXXXXXXXX or +639XXXXXXXXX
  const phoneRegex = /^(09|\+639)\d{9}$/;
  
  if (!phoneRegex.test(phone)) {
    return { valid: false, message: 'Invalid phone number. Use format: 09XXXXXXXXX' };
  }
  
  return { valid: true };
};

// ============ Name Validation ============

const validateFullName = (name) => {
  if (!name || name.trim() === '') {
    return { valid: false, message: 'Full name is required' };
  }
  
  if (name.trim().length < 2) {
    return { valid: false, message: 'Name must be at least 2 characters' };
  }
  
  if (name.length > 255) {
    return { valid: false, message: 'Name is too long (max 255 characters)' };
  }
  
  const nameRegex = /^[a-zA-Z\s\-\.]+$/;
  if (!nameRegex.test(name)) {
    return { valid: false, message: 'Name can only contain letters, spaces, hyphens, and periods' };
  }
  
  return { valid: true };
};

// ============ Required Field ============

const validateRequired = (value, fieldName = 'This field') => {
  if (!value || (typeof value === 'string' && value.trim() === '')) {
    return { valid: false, message: `${fieldName} is required` };
  }
  return { valid: true };
};

// ============ Number Validation ============

const validateNumber = (value, min = null, max = null, fieldName = 'Value') => {
  const num = parseFloat(value);
  
  if (isNaN(num)) {
    return { valid: false, message: `${fieldName} must be a number` };
  }
  
  if (min !== null && num < min) {
    return { valid: false, message: `${fieldName} must be at least ${min}` };
  }
  
  if (max !== null && num > max) {
    return { valid: false, message: `${fieldName} must not exceed ${max}` };
  }
  
  return { valid: true };
};

// ============ Length Validation ============

const validateLength = (value, min, max, fieldName = 'Input') => {
  if (!value) value = '';
  const length = value.toString().length;
  
  if (length < min) {
    return { valid: false, message: `${fieldName} must be at least ${min} characters` };
  }
  
  if (length > max) {
    return { valid: false, message: `${fieldName} must not exceed ${max} characters` };
  }
  
  return { valid: true };
};

// ============ File Validation ============

const validateFile = (file, maxSizeMB = 5, allowedTypes = ['image/jpeg', 'image/png', 'image/jpg']) => {
  if (!file) {
    return { valid: false, message: 'No file selected' };
  }
  
  // Check file size
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    return { valid: false, message: `File size must not exceed ${maxSizeMB}MB` };
  }
  
  // Check file type
  if (!allowedTypes.includes(file.type)) {
    const typesStr = allowedTypes.map(t => t.split('/')[1].toUpperCase()).join(', ');
    return { valid: false, message: `Only ${typesStr} files are allowed` };
  }
  
  return { valid: true };
};

// ============ URL Validation ============

const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// ============ Form Validation Helper ============

const validateForm = (formData, rules) => {
  const errors = {};
  let isValid = true;
  
  for (const [field, validators] of Object.entries(rules)) {
    const value = formData[field];
    
    for (const validator of validators) {
      const result = validator(value);
      if (!result.valid) {
        errors[field] = result.message;
        isValid = false;
        break; // Stop at first error for this field
      }
    }
  }
  
  return { valid: isValid, errors };
};

// ============ Show Error Helper ============

const showFieldError = (fieldId, message) => {
  const field = document.getElementById(fieldId);
  if (!field) return;
  
  // Add error class
  field.classList.add('is-invalid');
  
  // Find or create error message element
  let errorEl = field.nextElementSibling;
  if (!errorEl || !errorEl.classList.contains('invalid-feedback')) {
    errorEl = document.createElement('div');
    errorEl.className = 'invalid-feedback';
    field.parentNode.appendChild(errorEl);
  }
  
  errorEl.textContent = message;
  errorEl.style.display = 'block';
};

const clearFieldError = (fieldId) => {
  const field = document.getElementById(fieldId);
  if (!field) return;
  
  field.classList.remove('is-invalid');
  
  const errorEl = field.nextElementSibling;
  if (errorEl && errorEl.classList.contains('invalid-feedback')) {
    errorEl.style.display = 'none';
  }
};

const showFormErrors = (errors) => {
  // Clear all previous errors
  document.querySelectorAll('.is-invalid').forEach(el => {
    el.classList.remove('is-invalid');
  });
  
  // Show new errors
  for (const [field, message] of Object.entries(errors)) {
    showFieldError(field, message);
  }
};

const clearFormErrors = (formElement) => {
  const fields = formElement.querySelectorAll('.is-invalid');
  fields.forEach(field => {
    field.classList.remove('is-invalid');
  });
  
  const errorMessages = formElement.querySelectorAll('.invalid-feedback');
  errorMessages.forEach(msg => {
    msg.style.display = 'none';
  });
};

// ============ Exports ============

export {
  // Validators
  isValidEmail,
  validateEmail,
  validatePassword,
  passwordsMatch,
  validatePhone,
  validateFullName,
  validateRequired,
  validateNumber,
  validateLength,
  validateFile,
  isValidUrl,
  
  // Form helpers
  validateForm,
  showFieldError,
  clearFieldError,
  showFormErrors,
  clearFormErrors
};
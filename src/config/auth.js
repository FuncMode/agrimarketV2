// src\config\auth.js

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');


const jwtConfig = {
  secret: process.env.JWT_SECRET,
  expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  algorithm: 'HS256'
};

const passwordConfig = {
  saltRounds: 12,
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true
};

const generateToken = (userId, role = null) => {
  const payload = { id: userId };
  if (role) payload.role = role;
  
  return jwt.sign(payload, jwtConfig.secret, {
    expiresIn: jwtConfig.expiresIn,
    algorithm: jwtConfig.algorithm
  });
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, jwtConfig.secret);
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(passwordConfig.saltRounds);
  return bcrypt.hash(password, salt);
};

const comparePassword = async (plainPassword, hashedPassword) => {
  return bcrypt.compare(plainPassword, hashedPassword);
};

const validatePasswordStrength = (password) => {
  const errors = [];

  if (password.length < passwordConfig.minLength) {
    errors.push(`Password must be at least ${passwordConfig.minLength} characters`);
  }

  if (passwordConfig.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (passwordConfig.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (passwordConfig.requireNumbers && !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (passwordConfig.requireSpecialChars && !/[@$!%*?&#]/.test(password)) {
    errors.push('Password must contain at least one special character (@$!%*?&#)');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

const generateResetToken = () => {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
};

const hashResetToken = (token) => {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(token).digest('hex');
};

const sessionConfig = {
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  resetTokenExpiry: 60 * 60 * 1000 // 1 hour
};

module.exports = {
  jwtConfig,
  passwordConfig,
  sessionConfig,
  generateToken,
  verifyToken,
  hashPassword,
  comparePassword,
  validatePasswordStrength,
  generateResetToken,
  hashResetToken
};
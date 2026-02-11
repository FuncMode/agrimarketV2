// src\middleware\authMiddleware.js

const jwt = require('jsonwebtoken');
const { supabase } = require('../config/database');
const { AppError, asyncHandler } = require('./errorHandler');

const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    throw new AppError('Not authorized. Please login to access this route.', 401);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, full_name, phone_number, role, status, created_at')
      .eq('id', decoded.id)
      .single();

    if (error || !user) {
      throw new AppError('User not found or token invalid.', 401);
    }

    if (user.status === 'banned') {
      throw new AppError('Your account has been banned. Contact admin.', 403);
    }

    if (user.status === 'suspended') {
      throw new AppError('Your account is temporarily suspended.', 403);
    }

    req.user = user;
    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      throw new AppError('Invalid token. Please login again.', 401);
    }
    if (error.name === 'TokenExpiredError') {
      throw new AppError('Token expired. Please login again.', 401);
    }
    throw error;
  }
});

const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      throw new AppError(
        `Access denied. This route is only for ${roles.join(', ')} users.`,
        403
      );
    }
    next();
  };
};

const requireVerified = (req, res, next) => {
  if (req.user.status !== 'verified') {
    throw new AppError(
      'Account verification required. Please complete verification first.',
      403
    );
  }
  next();
};

const blockVerified = (req, res, next) => {
  if (req.user.status === 'verified') {
    throw new AppError('Your account is already verified.', 400);
  }
  next();
};

const optionalAuth = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { data: user } = await supabase
      .from('users')
      .select('id, email, full_name, role, status')
      .eq('id', decoded.id)
      .single();

    if (user && user.status !== 'banned') {
      req.user = user;
    } else {
      req.user = null;
    }
  } catch (error) {
    req.user = null;
  }

  next();
};

module.exports = {
  protect,            
  restrictTo,          
  requireVerified,      
  blockVerified,     
  optionalAuth       
};
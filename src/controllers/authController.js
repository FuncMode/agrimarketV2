// src\controllers\authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { supabase, supabaseService } = require('../config/database');
const { AppError, asyncHandler } = require('../middleware/errorHandler');


const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
};

const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
};

const comparePassword = async (plainPassword, hashedPassword) => {
  return bcrypt.compare(plainPassword, hashedPassword);
};


exports.signup = asyncHandler(async (req, res, next) => {
  const {
    email,
    password,
    full_name,
    phone_number,
    role,
    municipality,
    farm_type,
    latitude,
    longitude,
    delivery_address,
    delivery_latitude,
    delivery_longitude,
    preferred_delivery_option,
    agreed_to_terms
  } = req.body;

  const { data: existingUser } = await supabase
    .from('users')
    .select('email')
    .eq('email', email)
    .single();

  if (existingUser) {
    throw new AppError('Email already registered. Please login instead.', 409);
  }

  const password_hash = await hashPassword(password);

  const { data: newUser, error: userError } = await supabaseService
    .from('users')
    .insert([{
      email,
      password_hash,
      full_name,
      phone_number,
      role,
      status: 'unverified',
      agreed_to_terms: true,
      agreed_at: new Date().toISOString()
    }])
    .select()
    .single();

  if (userError) {
    throw new AppError('Failed to create user account.', 500);
  }

  if (role === 'seller') {
    if (!municipality || !farm_type) {
      throw new AppError('Municipality and farm type are required for sellers.', 400);
    }

    const { error: profileError } = await supabaseService
      .from('seller_profiles')
      .insert([{
        user_id: newUser.id,
        municipality,
        farm_type,
        latitude: latitude || null,  
        longitude: longitude || null
      }]);

    if (profileError) {
      await supabaseService
        .from('users')
        .delete()
        .eq('id', newUser.id);

      throw new AppError('Failed to create seller profile.', 500);
    }
  }

  if (role === 'buyer') {
    const { error: profileError } = await supabaseService
      .from('buyer_profiles')
      .insert([{
        user_id: newUser.id,
        delivery_address: delivery_address || null,
        delivery_latitude: delivery_latitude || null,
        delivery_longitude: delivery_longitude || null,
        municipality: municipality || null,
        preferred_delivery_option: preferred_delivery_option || 'drop-off'
      }]);

    if (profileError) {
      await supabaseService
        .from('users')
        .delete()
        .eq('id', newUser.id);

      throw new AppError('Failed to create buyer profile.', 500);
    }
  }

  const token = generateToken(newUser.id);

  res.status(201).json({
    success: true,
    message: 'Account created successfully! Please verify your account.',
    data: {
      user: {
        id: newUser.id,
        email: newUser.email,
        full_name: newUser.full_name,
        phone_number: newUser.phone_number,
        role: newUser.role,
        status: newUser.status
      },
      token
    }
  });

});

exports.login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (error || !user) {
    throw new AppError('Invalid email or password.', 401);
  }

  const isPasswordValid = await comparePassword(password, user.password_hash);

  if (!isPasswordValid) {
    throw new AppError('Invalid email or password.', 401);
  }

  if (user.status === 'banned') {
    throw new AppError('Your account has been banned. Contact admin for assistance.', 403);
  }

  if (user.status === 'suspended') {
    if (user.suspension_end && new Date(user.suspension_end) < new Date()) {
      await supabaseService
        .from('users')
        .update({ status: 'verified', suspension_end: null })
        .eq('id', user.id);
      
      user.status = 'verified';
    } else {
      throw new AppError('Your account is temporarily suspended.', 403);
    }
  }

  const token = generateToken(user.id);

  res.status(200).json({
    success: true,
    message: 'Login successful!',
    data: {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        phone_number: user.phone_number,
        role: user.role,
        status: user.status,
        created_at: user.created_at
      },
      token
    }
  });
});

exports.logout = asyncHandler(async (req, res, next) => {

  res.status(200).json({
    success: true,
    message: 'Logged out successfully. Please delete your token.'
  });

});

exports.changePassword = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!currentPassword || !newPassword || !confirmPassword) {
    throw new AppError('Please provide current password and new password', 400);
  }

  if (newPassword !== confirmPassword) {
    throw new AppError('New passwords do not match', 400);
  }

  if (newPassword.length < 8) {
    throw new AppError('New password must be at least 8 characters long', 400);
  }

  // Get user with password
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('password_hash')
    .eq('id', userId)
    .single();

  if (userError || !user) {
    throw new AppError('User not found', 404);
  }

  // Verify current password
  const isPasswordValid = await comparePassword(currentPassword, user.password_hash);
  if (!isPasswordValid) {
    throw new AppError('Current password is incorrect', 401);
  }

  // Hash new password
  const hashedPassword = await hashPassword(newPassword);

  // Update password
  const { error: updateError } = await supabaseService
    .from('users')
    .update({ password_hash: hashedPassword, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single();

  if (updateError) {
    throw new AppError('Failed to update password', 500);
  }

  res.status(200).json({
    success: true,
    message: 'Password changed successfully'
  });
});


exports.forgotPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body;

  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, full_name')
    .eq('email', email)
    .single();

  if (error || !user) {
    return res.status(200).json({
      success: true,
      message: 'If your email exists, you will receive password reset instructions.'
    });
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  
  const hashedToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  
  const resetTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const { error: updateError } = await supabaseService
    .from('users')
    .update({
      reset_token: hashedToken,
      reset_token_expires: resetTokenExpires.toISOString()
    })
    .eq('id', user.id);

  if (updateError) {
    throw new AppError('Failed to generate reset token. Please try again.', 500);
  }

  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:8080'}/reset-password?token=${resetToken}&email=${encodeURIComponent(user.email)}`;

  // Send password reset email
  const { sendPasswordResetEmail } = require('../services/emailService');
  try {
    await sendPasswordResetEmail(user, resetUrl);
  } catch (emailError) {
    const logger = require('../utils/logger');
    logger.error('Failed to send password reset email', {
      user_id: user.id,
      email: user.email,
      error: emailError.message
    });
    // Don't throw error - still return success to prevent email enumeration
  }

  const logger = require('../utils/logger');
  
  if (process.env.NODE_ENV === 'development') {
    logger.info('Password reset email sent', {
      email: user.email,
      reset_url: resetUrl,
      expires_in: '24 hours'
    });
  } else {
    logger.info('Password reset email sent', {
      user_id: user.id,
      email_domain: user.email.split('@')[1],
      expires_in: '24 hours'
    });
  }

  res.status(200).json({
    success: true,
    message: 'Password reset instructions sent to your email.',
    dev_reset_url: process.env.NODE_ENV === 'development' ? resetUrl : undefined
  });
});


exports.resetPassword = asyncHandler(async (req, res, next) => {
  const { token, new_password } = req.body;

  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, reset_token_expires')
    .eq('reset_token', hashedToken)
    .single();

  if (error || !user) {
    throw new AppError('Invalid or expired reset token.', 400);
  }

  if (!user.reset_token_expires) {
    throw new AppError('Reset token has expired. Please request a new one.', 400);
  }

  const expirationTime = new Date(user.reset_token_expires).getTime();
  const currentTime = new Date().getTime();
  
  if (expirationTime <= currentTime) {
    throw new AppError('Reset token has expired. Please request a new one.', 400);
  }

  const password_hash = await hashPassword(new_password);

  const { error: updateError } = await supabaseService
    .from('users')
    .update({
      password_hash,
      reset_token: null,
      reset_token_expires: null
    })
    .eq('id', user.id);

  if (updateError) {
    throw new AppError('Failed to reset password. Please try again.', 500);
  }

  res.status(200).json({
    success: true,
    message: 'Password reset successful! You can now login with your new password.'
  });
});


exports.getCurrentUser = asyncHandler(async (req, res, next) => {
  res.status(200).json({
    success: true,
    data: {
      user: req.user
    }
  });
});
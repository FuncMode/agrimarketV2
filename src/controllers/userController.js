// src\controllers\userController.js
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const userModel = require('../models/userModel');

exports.getMyProfile = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;

  const { data: user, error } = await userModel.getUserById(userId);

  if (error) {
    console.error('[getMyProfile] getUserById returned error:', error.message);
    throw new AppError('Failed to fetch profile: ' + (error.message || 'Unknown error'), 500);
  }

  if (!user) {
    throw new AppError('User not found', 404);
  }

  res.status(200).json({
    success: true,
    data: {
      user
    }
  });
});

exports.updateMyProfile = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { full_name, phone_number } = req.body;

  if (!full_name && !phone_number) {
    throw new AppError('Please provide at least one field to update.', 400);
  }

  const updates = {};
  if (full_name) updates.full_name = full_name;
  if (phone_number) updates.phone_number = phone_number;

  const { data, error } = await userModel.updateUser(userId, updates);

  if (error) {
    throw new AppError('Failed to update profile.', 500);
  }

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully!',
    data: {
      user: data
    }
  });
});

exports.updateSellerProfile = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { municipality, farm_type, latitude, longitude } = req.body;

  if (!municipality && !farm_type && !latitude && !longitude) {
    throw new AppError('Please provide at least one field to update.', 400);
  }

  const updates = {};
  if (municipality) updates.municipality = municipality;
  if (farm_type) updates.farm_type = farm_type;
  if (latitude !== undefined) updates.latitude = latitude;
  if (longitude !== undefined) updates.longitude = longitude;

  const { data, error } = await userModel.updateSellerProfile(userId, updates);

  if (error) {
    throw new AppError('Failed to update seller profile.', 500);
  }

  res.status(200).json({
    success: true,
    message: 'Seller profile updated successfully!',
    data: {
      seller_profile: data
    }
  });
});


exports.updateBuyerProfile = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const {
    delivery_address,
    delivery_latitude,
    delivery_longitude,
    municipality,
    preferred_delivery_option
  } = req.body;

  if (
    !delivery_address &&
    !delivery_latitude &&
    !delivery_longitude &&
    !municipality &&
    !preferred_delivery_option
  ) {
    throw new AppError('Please provide at least one field to update.', 400);
  }

  const updates = {};
  if (delivery_address) updates.delivery_address = delivery_address;
  if (delivery_latitude !== undefined) updates.delivery_latitude = delivery_latitude;
  if (delivery_longitude !== undefined) updates.delivery_longitude = delivery_longitude;
  if (municipality) updates.municipality = municipality;
  if (preferred_delivery_option) updates.preferred_delivery_option = preferred_delivery_option;

  const { data, error } = await userModel.updateBuyerProfile(userId, updates);

  if (error) {
    throw new AppError('Failed to update buyer profile.', 500);
  }

  res.status(200).json({
    success: true,
    message: 'Buyer profile updated successfully!',
    data: {
      buyer_profile: data
    }
  });
});

exports.getSellerProfile = asyncHandler(async (req, res, next) => {
  const { sellerId } = req.params;

  const { data, error } = await userModel.getSellerProfile(sellerId);

  if (error || !data) {
    throw new AppError('Seller profile not available.', 404);
  }

  if (data.users.status !== 'verified') {
    throw new AppError('Seller profile not available.', 404);
  }

  res.status(200).json({
    success: true,
    data: {
      seller: data
    }
  });
});

exports.getVerifiedSellers = asyncHandler(async (req, res, next) => {
  const { municipality, farm_type, page = 1, limit = 20 } = req.query;

  const filters = {
    page: parseInt(page),
    limit: Math.min(parseInt(limit), 100)
  };
  if (municipality) filters.municipality = municipality;
  if (farm_type) filters.farm_type = farm_type;

  const { data, error, count, total_pages } = await userModel.getVerifiedSellers(filters);

  if (error) {
    throw new AppError('Failed to fetch sellers.', 500);
  }

  res.status(200).json({
    success: true,
    results: data.length,
    total: count || data.length,
    page: parseInt(page),
    limit: filters.limit,
    total_pages: total_pages || 1,
    data: {
      sellers: data
    }
  });
});

exports.getMyStats = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;

  const { data, error } = await userModel.getUserStats(userId);

  if (error) {
    throw new AppError('Failed to fetch statistics.', 500);
  }

  res.status(200).json({
    success: true,
    data: {
      stats: data
    }
  });
});

exports.deleteMyAccount = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;

  const { data, error } = await userModel.changeUserStatus(
    userId,
    'suspended',
    { suspension_end: null }
  );

  if (error) {
    throw new AppError('Failed to delete account.', 500);
  }

  res.status(200).json({
    success: true,
    message: 'Account deleted successfully. We\'re sad to see you go!'
  });

});
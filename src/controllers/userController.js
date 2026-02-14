// src\controllers\userController.js
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const userModel = require('../models/userModel');
const { supabaseService } = require('../config/database');

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

  // Get user details to know their role
  const { data: user, error: userError } = await userModel.getUserById(userId);
  
  if (userError || !user) {
    throw new AppError('User not found.', 404);
  }

  // Delete all related data in proper order (respecting foreign key constraints)
  try {
    // ============ PHASE 1: DELETE FILES FROM STORAGE BUCKETS ============
    
    // Helper function to extract bucket path from Supabase URL
    const extractBucketPath = (url, bucketName) => {
      if (!url) return null;
      try {
        // For URLs like: https://...supabase.co/storage/v1/object/public/bucket-name/path/to/file
        const parts = url.split('/');
        const bucketIndex = parts.findIndex(p => p === bucketName);
        if (bucketIndex > -1) {
          return parts.slice(bucketIndex + 1).join('/');
        }
        return url.split('/').pop(); // Fallback: return just filename
      } catch (e) {
        return null;
      }
    };

    // 1. Delete user avatar from storage
    if (user.avatar_url) {
      try {
        const avatarPath = extractBucketPath(user.avatar_url, 'avatars');
        if (avatarPath) {
          await supabaseService.storage.from('avatars').remove([avatarPath]);
          console.log('[deleteMyAccount] Avatar deleted:', avatarPath);
        }
      } catch (err) {
        console.log('[deleteMyAccount] Avatar deletion error (non-critical):', err.message);
      }
    }

    // 2. Delete verification document files (for BOTH buyers and sellers)
    try {
      const { data: verifications } = await supabaseService
        .from('verification_documents')
        .select('id_photo_path, selfie_path')
        .eq('user_id', userId);

      if (verifications && verifications.length > 0) {
        // Delete ID photos from id-documents bucket
        const idPhotoPaths = verifications
          .map(v => extractBucketPath(v.id_photo_path, 'id-documents'))
          .filter(path => path && path.length > 0);

        if (idPhotoPaths.length > 0) {
          await supabaseService.storage.from('id-documents').remove(idPhotoPaths);
          console.log('[deleteMyAccount] ID photos deleted:', idPhotoPaths.length);
        }

        // Delete selfies from selfie-photos bucket
        const selfiePaths = verifications
          .map(v => extractBucketPath(v.selfie_path, 'selfie-photos'))
          .filter(path => path && path.length > 0);

        if (selfiePaths.length > 0) {
          await supabaseService.storage.from('selfie-photos').remove(selfiePaths);
          console.log('[deleteMyAccount] Selfie photos deleted:', selfiePaths.length);
        }
      }
    } catch (err) {
      console.log('[deleteMyAccount] Verification files deletion error (non-critical):', err.message);
    }

    // 3. Delete delivery proof files if applicable
    try {
      const { data: orders } = await supabaseService
        .from('orders')
        .select('delivery_proof_url')
        .or(`seller_id.eq.${userId},buyer_id.eq.${userId}`)
        .neq('delivery_proof_url', null);

      if (orders && orders.length > 0) {
        const deliveryPaths = orders
          .map(order => extractBucketPath(order.delivery_proof_url, 'delivery-proof'))
          .filter(path => path && path.length > 0);

        if (deliveryPaths.length > 0) {
          await supabaseService.storage.from('delivery-proof').remove(deliveryPaths);
          console.log('[deleteMyAccount] Delivery proofs deleted:', deliveryPaths.length);
        }
      }
    } catch (err) {
      console.log('[deleteMyAccount] Delivery proof deletion error (non-critical):', err.message);
    }

    // 4. Delete message attachment files
    try {
      const { data: messages } = await supabaseService
        .from('messages')
        .select('attachment_url')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .neq('attachment_url', null);

      if (messages && messages.length > 0) {
        const attachmentPaths = messages
          .map(msg => extractBucketPath(msg.attachment_url, 'message-attachments'))
          .filter(path => path && path.length > 0);

        if (attachmentPaths.length > 0) {
          await supabaseService.storage.from('message-attachments').remove(attachmentPaths);
          console.log('[deleteMyAccount] Message attachments deleted:', attachmentPaths.length);
        }
      }
    } catch (err) {
      console.log('[deleteMyAccount] Message attachments deletion error (non-critical):', err.message);
    }

    // 5. Delete issue evidence files
    try {
      const { data: issues } = await supabaseService
        .from('issue_reports')
        .select('evidence_url')
        .eq('user_id', userId)
        .neq('evidence_url', null);

      if (issues && issues.length > 0) {
        const evidencePaths = issues
          .map(issue => extractBucketPath(issue.evidence_url, 'issue-evidence'))
          .filter(path => path && path.length > 0);

        if (evidencePaths.length > 0) {
          await supabaseService.storage.from('issue-evidence').remove(evidencePaths);
          console.log('[deleteMyAccount] Issue evidence files deleted:', evidencePaths.length);
        }
      }
    } catch (err) {
      console.log('[deleteMyAccount] Issue evidence deletion error (non-critical):', err.message);
    }

    // 6. Delete product images if seller
    if (user.role === 'seller' && user.seller_profile?.id) {
      try {
        const { data: sellerProducts } = await supabaseService
          .from('products')
          .select('id, image_url')
          .eq('seller_id', user.seller_profile.id);

        if (sellerProducts && sellerProducts.length > 0) {
          const imagePaths = sellerProducts
            .map(product => extractBucketPath(product.image_url, 'products'))
            .filter(path => path && path.length > 0);

          if (imagePaths.length > 0) {
            await supabaseService.storage.from('products').remove(imagePaths);
            console.log('[deleteMyAccount] Product images deleted:', imagePaths.length);
          }
        }
      } catch (err) {
        console.log('[deleteMyAccount] Product images deletion error (non-critical):', err.message);
      }
    }

    // ============ PHASE 2: DELETE DATABASE RECORDS ============

    // 4. Delete messages sent by this user
    await supabaseService
      .from('messages')
      .delete()
      .eq('sender_id', userId);

    // 5. Delete messages received by this user
    await supabaseService
      .from('messages')
      .delete()
      .eq('receiver_id', userId);

    // 6. Delete notifications
    await supabaseService
      .from('notifications')
      .delete()
      .eq('user_id', userId);

    // 7. Delete verification documents
    await supabaseService
      .from('verification_documents')
      .delete()
      .eq('user_id', userId);

    // 8. Delete issue reports created by this user
    await supabaseService
      .from('issue_reports')
      .delete()
      .eq('user_id', userId);

    // 9. Delete cart items if buyer
    if (user.role === 'buyer' && user.buyer_profile?.id) {
      await supabaseService
        .from('shopping_carts')
        .delete()
        .eq('buyer_id', user.buyer_profile.id);
    }

    // 10. Delete reviews - find all product reviews 
    if (user.role === 'seller' && user.seller_profile?.id) {
      // Get all products for this seller
      const { data: sellerProducts } = await supabaseService
        .from('products')
        .select('id')
        .eq('seller_id', user.seller_profile.id);

      if (sellerProducts && sellerProducts.length > 0) {
        const productIds = sellerProducts.map(p => p.id);
        // Delete reviews for these products
        for (const productId of productIds) {
          await supabaseService
            .from('product_reviews')
            .delete()
            .eq('product_id', productId);
        }
      }
    }

    // 11. Delete audit logs associated with this user
    await supabaseService
      .from('audit_logs')
      .delete()
      .eq('user_id', userId);

    // 12. Delete admin logs where this user is the admin
    await supabaseService
      .from('admin_logs')
      .delete()
      .eq('admin_id', userId);

    // 13. Delete buyer profile (CASCADE will handle related data)
    if (user.role === 'buyer' && user.buyer_profile?.id) {
      await supabaseService
        .from('buyer_profiles')
        .delete()
        .eq('id', user.buyer_profile.id);
    }

    // 14. Delete seller profile (CASCADE will handle products, orders, etc.)
    if (user.role === 'seller' && user.seller_profile?.id) {
      await supabaseService
        .from('seller_profiles')
        .delete()
        .eq('id', user.seller_profile.id);
    }

    // 15. Finally, delete the user account
    const { error: deleteError } = await supabaseService
      .from('users')
      .delete()
      .eq('id', userId);

    if (deleteError) {
      throw new AppError('Failed to delete account: ' + deleteError.message, 500);
    }

    res.status(200).json({
      success: true,
      message: 'Account and all associated data (including files) deleted successfully. We\'re sad to see you go!'
    });
  } catch (error) {
    console.error('[deleteMyAccount] Error deleting account:', error);
    throw new AppError('Failed to delete account: ' + error.message, 500);
  }
});
// src\controllers\productController.js

const { AppError, asyncHandler } = require('../middleware/errorHandler');
const productModel = require('../models/productModel');
const { uploadProductPhoto, deleteFile, BUCKETS } = require('../config/storage');
const { supabase, supabaseService } = require('../config/database');
const emailService = require('../services/emailService');

const LOW_STOCK_THRESHOLD = 10;
const LISTING_REVIEW_PENDING_STATUS = 'pending_approval';
const LISTING_REVIEW_REJECTED_STATUS = 'rejected_by_admin';
const LISTING_REVIEW_PENDING_FALLBACK_STATUS = 'draft';

const isUnsupportedProductStatusError = (error = {}) => {
  const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  if (!text) return false;
  return (
    text.includes('invalid input value for enum') ||
    text.includes('status') && (
      text.includes('check constraint') ||
      text.includes('products_status') ||
      text.includes(LISTING_REVIEW_PENDING_STATUS) ||
      text.includes(LISTING_REVIEW_REJECTED_STATUS)
    )
  );
};

const sendStockAlertsForInterestedBuyers = async (beforeProduct, afterProduct) => {
  const oldQuantity = Number(beforeProduct?.available_quantity);
  const newQuantity = Number(afterProduct?.available_quantity);

  if (!Number.isFinite(oldQuantity) || !Number.isFinite(newQuantity) || oldQuantity === newQuantity) {
    return;
  }

  if (afterProduct?.status !== 'active') {
    return;
  }

  let alertType = null;

  if (oldQuantity === 0 && newQuantity > 0) {
    alertType = 'back_in_stock';
  } else if (oldQuantity > LOW_STOCK_THRESHOLD && newQuantity > 0 && newQuantity <= LOW_STOCK_THRESHOLD) {
    alertType = 'low_stock';
  }

  if (!alertType) {
    return;
  }

  const { data: cartWatchers, error: watcherError } = await supabase
    .from('shopping_carts')
    .select('buyer_id')
    .eq('product_id', afterProduct.id);

  if (watcherError) {
    console.error('Failed to fetch cart watchers for stock alerts:', watcherError);
    return;
  }

  if (!cartWatchers || cartWatchers.length === 0) {
    return;
  }

  const buyerProfileIds = [...new Set(cartWatchers.map((row) => row?.buyer_id).filter(Boolean))];
  if (buyerProfileIds.length === 0) {
    return;
  }

  const { data: buyerProfiles, error: profileError } = await supabase
    .from('buyer_profiles')
    .select('id, user_id')
    .in('id', buyerProfileIds);

  if (profileError) {
    console.error('Failed to resolve buyer profiles for stock alerts:', profileError);
    return;
  }

  const userIds = [...new Set((buyerProfiles || []).map((profile) => profile?.user_id).filter(Boolean))];
  if (userIds.length === 0) {
    return;
  }

  const { data: users, error: userError } = await supabase
    .from('users')
    .select('id, email, full_name, status')
    .in('id', userIds);

  if (userError) {
    console.error('Failed to fetch user emails for stock alerts:', userError);
    return;
  }

  const uniqueUsers = new Map();

  (users || []).forEach((user) => {
    if (!user?.id || !user?.email || user.status === 'banned') return;
    uniqueUsers.set(user.id, user);
  });

  if (uniqueUsers.size === 0) {
    return;
  }

  await Promise.allSettled(
    Array.from(uniqueUsers.values()).map((user) =>
      emailService.sendProductStockAlertEmail(user, afterProduct, alertType)
    )
  );
};

exports.createProduct = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const {
    name,
    description,
    category,
    price_per_unit,
    unit_type,
    available_quantity,
    tags
  } = req.body;

  const { data: sellerProfile, error: profileError } = await supabase
    .from('seller_profiles')
    .select('id, municipality')
    .eq('user_id', userId)
    .single();

  if (profileError || !sellerProfile) {
    throw new AppError('Seller profile not found.', 404);
  }

  // Handle multiple photos (up to 3)
  let photoUrls = [];
  let photoPath = null; // Keep for backward compatibility

  if (req.files && req.files.length > 0) {
    // Limit to 3 photos
    const filesToUpload = req.files.slice(0, 3);
    
    for (const file of filesToUpload) {
      const uploadResult = await uploadProductPhoto(
        sellerProfile.id,
        file.buffer,
        file.originalname,
        file.mimetype
      );

      if (uploadResult.success) {
        photoUrls.push(uploadResult.data.publicUrl);
      } else {
        console.error('Failed to upload photo:', uploadResult.error);
        throw new AppError('Failed to upload one or more photos.', 500);
      }
    }

    // Set photoPath to first image for backward compatibility
    photoPath = photoUrls[0] || null;
  }

  let { data: product, error } = await productModel.createProduct({
    seller_id: sellerProfile.id,
    name,
    description,
    category,
    price_per_unit: parseFloat(price_per_unit),
    unit_type,
    available_quantity: parseInt(available_quantity),
    municipality: sellerProfile.municipality,
    photo_path: photoPath,
    photos: photoUrls,
    status: LISTING_REVIEW_PENDING_STATUS
  });

  // Backward-compat: some databases may not have moderation statuses yet.
  // If so, use draft as pending-review fallback so listing flow still works.
  if (error && isUnsupportedProductStatusError(error)) {
    const retryResult = await productModel.createProduct({
      seller_id: sellerProfile.id,
      name,
      description,
      category,
      price_per_unit: parseFloat(price_per_unit),
      unit_type,
      available_quantity: parseInt(available_quantity),
      municipality: sellerProfile.municipality,
      photo_path: photoPath,
      photos: photoUrls,
      status: LISTING_REVIEW_PENDING_FALLBACK_STATUS
    });
    product = retryResult.data;
    error = retryResult.error;
  }

  if (error) {
    throw new AppError('Failed to create product.', 500);
  }

  if (tags) {
    let tagArray = Array.isArray(tags) ? tags : String(tags).split(',').map(t => t.trim());
    tagArray = tagArray.filter(tag => tag);
    if (tagArray.length > 0) {
      await productModel.addProductTags(product.id, tagArray);
    }
  }

  const { data: completeProduct } = await productModel.getProductById(product.id);

  res.status(201).json({
    success: true,
    message: 'Product submitted for admin review. It will be listed once approved.',
    data: {
      product: completeProduct
    }
  });
});

exports.getAllProducts = asyncHandler(async (req, res, next) => {
  // Parse tags from comma-separated string to array
  let tagsArray = undefined;
  if (req.query.tags) {
    tagsArray = Array.isArray(req.query.tags) 
      ? req.query.tags 
      : String(req.query.tags).split(',').map(t => t.trim()).filter(t => t);
  }
  
  const filters = {
    search: req.query.search,
    category: req.query.category,
    municipality: req.query.municipality,
    seller_id: req.query.seller_id,
    tags: tagsArray,
    min_price: req.query.min_price ? parseFloat(req.query.min_price) : undefined,
    max_price: req.query.max_price ? parseFloat(req.query.max_price) : undefined,
    sort_by: req.query.sort_by,
    sort_order: req.query.sort_order,
    page: req.query.page ? parseInt(req.query.page) : 1,
    limit: req.query.limit ? parseInt(req.query.limit) : 20
  };

  const { data, error, count, page, limit, total_pages } = await productModel.getAllProducts(filters);

  if (error) {
    throw new AppError('Failed to fetch products.', 500);
  }

  // Map seller data to seller_name field for easier frontend access
  const productsWithSellerName = data.map(product => ({
    ...product,
    seller_name: product.seller?.user?.full_name || 'Unknown Seller',
    seller_verified: product.seller?.user?.status === 'verified',
    seller_rating: product.seller?.rating || 0
  }));

  res.status(200).json({
    success: true,
    results: productsWithSellerName.length,
    total: count,
    page,
    limit,
    total_pages,
    data: {
      products: productsWithSellerName
    }
  });
});

exports.getProductById = asyncHandler(async (req, res, next) => {
  const { productId } = req.params;

  const { data: product, error } = await productModel.getProductById(productId);

  if (error || !product) {
    throw new AppError('Product not found.', 404);
  }

  const isOwner = req.user && await productModel.isProductOwner(productId, req.user.id);
  
  if (product.status !== 'active' && !isOwner) {
    throw new AppError('Product not available.', 404);
  }

  if (!isOwner) {
    productModel.incrementViewCount(productId).catch(err => 
      console.error('Failed to increment view count:', err)
    );
  }

  // Get product reviews with buyer info
  const { data: reviews } = await supabase
    .from('product_reviews')
    .select(`
      id,
      rating,
      comment,
      created_at,
      buyer:buyer_profiles!inner (
        user:users!inner (
          full_name
        )
      )
    `)
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(10);

  product.recent_reviews = reviews || [];

  res.status(200).json({
    success: true,
    data: {
      product
    }
  });
});

exports.getMyProducts = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { status, category, page = 1, limit = 20 } = req.query;
  const requestedStatus = status ? String(status).toLowerCase() : undefined;
  const dbStatusFilter = ['pending_approval', 'rejected_by_admin'].includes(requestedStatus)
    ? 'draft'
    : requestedStatus;

  const { data: sellerProfile, error: profileError } = await supabase
    .from('seller_profiles')
    .select('id')
    .eq('user_id', userId)
    .single();

  if (profileError || !sellerProfile) {
    throw new AppError('Seller profile not found.', 404);
  }

  const filters = { 
    status: dbStatusFilter, 
    category,
    page: parseInt(page),
    limit: Math.min(parseInt(limit), 100)
  };
  
  const { data: products, error, count, total_pages } = await productModel.getSellerProducts(sellerProfile.id, filters);

  if (error) {
    throw new AppError('Failed to fetch products.', 500);
  }

  let normalizedProducts = products || [];

  if (normalizedProducts.length > 0) {
    const productIds = normalizedProducts.map((product) => product.id).filter(Boolean);
    const { data: moderationLogs } = await supabase
      .from('admin_logs')
      .select('reference_id, action_type, created_at')
      .in('reference_id', productIds)
      .in('action_type', ['PRODUCT_LISTING_REJECTED', 'PRODUCT_LISTING_APPROVED'])
      .order('created_at', { ascending: false });

    const latestRejectedAtByProductId = new Map();
    const latestApprovedAtByProductId = new Map();
    (moderationLogs || []).forEach((log) => {
      const refId = log?.reference_id;
      if (!refId) return;

      if (log.action_type === 'PRODUCT_LISTING_REJECTED' && !latestRejectedAtByProductId.has(refId)) {
        latestRejectedAtByProductId.set(refId, log.created_at);
      }
      if (log.action_type === 'PRODUCT_LISTING_APPROVED' && !latestApprovedAtByProductId.has(refId)) {
        latestApprovedAtByProductId.set(refId, log.created_at);
      }
    });

    normalizedProducts = normalizedProducts.map((product) => {
      if (product?.status !== 'draft') return product;

      const updatedAtMs = new Date(product.updated_at || product.created_at || 0).getTime();
      const latestApprovedAt = latestApprovedAtByProductId.get(product.id);
      const latestRejectedAt = latestRejectedAtByProductId.get(product.id);
      const approvedAtMs = latestApprovedAt ? new Date(latestApprovedAt).getTime() : NaN;
      const rejectedAtMs = latestRejectedAt ? new Date(latestRejectedAt).getTime() : NaN;

      const hasApprovedLog = Number.isFinite(approvedAtMs);
      const hasRejectedLog = Number.isFinite(rejectedAtMs);

      if (hasRejectedLog && Number.isFinite(updatedAtMs) && updatedAtMs > rejectedAtMs) {
        return { ...product, status: LISTING_REVIEW_PENDING_STATUS };
      }

      if (hasRejectedLog && (!hasApprovedLog || approvedAtMs <= rejectedAtMs)) {
        return { ...product, status: LISTING_REVIEW_REJECTED_STATUS };
      }

      if (hasApprovedLog) {
        return product;
      }

      return { ...product, status: LISTING_REVIEW_PENDING_STATUS };
    });
  }

  if (requestedStatus) {
    normalizedProducts = normalizedProducts.filter((product) => product.status === requestedStatus);
  }

  res.status(200).json({
    success: true,
    results: normalizedProducts.length,
    total: requestedStatus ? normalizedProducts.length : (count || normalizedProducts.length),
    page: parseInt(page),
    limit: filters.limit,
    total_pages: requestedStatus
      ? (normalizedProducts.length ? Math.ceil(normalizedProducts.length / filters.limit) : 0)
      : (total_pages || 1),
    data: {
      products: normalizedProducts
    }
  });
});

exports.updateProduct = asyncHandler(async (req, res, next) => {
  const { productId } = req.params;
  const userId = req.user.id;
  const {
    name,
    description,
    category,
    price_per_unit,
    unit_type,
    available_quantity,
    tags,
    status,
    photos,
    photo_path
  } = req.body;

  const isOwner = await productModel.isProductOwner(productId, userId);
  if (!isOwner) {
    throw new AppError('You do not have permission to update this product.', 403);
  }

  const { data: currentProduct, error: currentProductError } = await productModel.getProductById(productId);
  if (currentProductError || !currentProduct) {
    throw new AppError('Product not found.', 404);
  }

  const updates = {};
  const currentStatus = String(currentProduct.status || '').toLowerCase();
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (category !== undefined) updates.category = category;
  if (price_per_unit !== undefined) updates.price_per_unit = parseFloat(price_per_unit);
  if (unit_type !== undefined) updates.unit_type = unit_type;
  if (available_quantity !== undefined) updates.available_quantity = parseInt(available_quantity);
  if (status !== undefined) {
    const requestedStatus = String(status).toLowerCase();
    if (requestedStatus === LISTING_REVIEW_REJECTED_STATUS) {
      throw new AppError('Rejected status can only be set by admin.', 403);
    }

    if (
      requestedStatus === 'active' &&
      [
        LISTING_REVIEW_PENDING_STATUS,
        LISTING_REVIEW_REJECTED_STATUS,
        LISTING_REVIEW_PENDING_FALLBACK_STATUS
      ].includes(currentStatus)
    ) {
      throw new AppError('This listing requires admin approval before it can be activated.', 403);
    }

    updates.status = requestedStatus;
  }
  if (photo_path !== undefined) updates.photo_path = photo_path || null;
  if (photos !== undefined) {
    if (Array.isArray(photos)) {
      updates.photos = photos;
    } else if (typeof photos === 'string') {
      try {
        const parsedPhotos = JSON.parse(photos);
        updates.photos = Array.isArray(parsedPhotos) ? parsedPhotos : [];
      } catch (error) {
        updates.photos = photos
          .split(',')
          .map(p => p.trim())
          .filter(Boolean);
      }
    } else {
      updates.photos = [];
    }
  }

  if (req.files && req.files.length > 0) {
    const { data: sellerProfile } = await supabase
      .from('seller_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    const oldPhotos = currentProduct?.photos || [];

    // Upload new photos (limit to 3)
    let photoUrls = [];
    const filesToUpload = req.files.slice(0, 3);
    
    for (const file of filesToUpload) {
      const uploadResult = await uploadProductPhoto(
        sellerProfile.id,
        file.buffer,
        file.originalname,
        file.mimetype
      );

      if (uploadResult.success) {
        photoUrls.push(uploadResult.data.publicUrl);
      } else {
        console.error('Failed to upload photo:', uploadResult.error);
        throw new AppError('Failed to upload one or more photos.', 500);
      }
    }

    updates.photos = photoUrls;
    updates.photo_path = photoUrls[0] || currentProduct?.photo_path || null;

    // Delete old photos
    if (oldPhotos.length > 0) {
      for (const oldPhoto of oldPhotos) {
        if (oldPhoto && !photoUrls.includes(oldPhoto)) {
          const pathToDelete = oldPhoto.includes('product-photos/') 
            ? oldPhoto.split('product-photos/')[1] 
            : oldPhoto;
          
          deleteFile(BUCKETS.PRODUCT_PHOTOS, pathToDelete).catch(err =>
            console.error('Failed to delete old photo:', err)
          );
        }
      }
    }
  }

  const listingFields = [
    'name',
    'description',
    'category',
    'price_per_unit',
    'unit_type',
    'available_quantity',
    'photo_path',
    'photos'
  ];
  const touchedListingFields = listingFields.some((field) => updates[field] !== undefined);
  const isResubmittingRejectedListing =
    currentStatus === LISTING_REVIEW_REJECTED_STATUS &&
    touchedListingFields &&
    updates.status === undefined;

  if (isResubmittingRejectedListing) {
    updates.status = LISTING_REVIEW_PENDING_STATUS;
  }

  let { data: updatedProduct, error } = await productModel.updateProduct(productId, updates);

  if (
    error &&
    isUnsupportedProductStatusError(error) &&
    updates.status === LISTING_REVIEW_PENDING_STATUS
  ) {
    const fallbackUpdates = {
      ...updates,
      status: LISTING_REVIEW_PENDING_FALLBACK_STATUS
    };
    const fallbackResult = await productModel.updateProduct(productId, fallbackUpdates);
    updatedProduct = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (error) {
    throw new AppError('Failed to update product.', 500);
  }

  if (tags !== undefined) {
    let tagArray = Array.isArray(tags) ? tags : (tags ? String(tags).split(',').map(t => t.trim()) : []);
    tagArray = tagArray.filter(tag => tag);
    await productModel.updateProductTags(productId, tagArray);
  }

  const { data: completeProduct } = await productModel.getProductById(productId);

  if (updates.available_quantity !== undefined && completeProduct) {
    sendStockAlertsForInterestedBuyers(currentProduct, completeProduct).catch((stockAlertError) => {
      console.error('Failed to send stock alert emails:', stockAlertError);
    });
  }

  res.status(200).json({
    success: true,
    message: isResubmittingRejectedListing
      ? 'Product updated and resubmitted for admin review.'
      : 'Product updated successfully!',
    data: {
      product: completeProduct
    }
  });
});

exports.deleteProduct = asyncHandler(async (req, res, next) => {
  const { productId } = req.params;
  const userId = req.user.id;

  const isOwner = await productModel.isProductOwner(productId, userId);
  if (!isOwner) {
    throw new AppError('You do not have permission to delete this product.', 403);
  }

  const { data, error } = await productModel.deleteProduct(productId);

  if (error) {
    throw new AppError('Failed to delete product.', 500);
  }

  res.status(200).json({
    success: true,
    message: 'Product deleted successfully.'
  });
});

exports.getProductStats = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;

  const { data: sellerProfile, error: profileError } = await supabase
    .from('seller_profiles')
    .select('id')
    .eq('user_id', userId)
    .single();

  if (profileError || !sellerProfile) {
    throw new AppError('Seller profile not found.', 404);
  }

  const { data: stats, error } = await productModel.getProductStats(sellerProfile.id);

  if (error) {
    throw new AppError('Failed to fetch statistics.', 500);
  }

  res.status(200).json({
    success: true,
    data: {
      stats
    }
  });
});

exports.incrementViewCount = asyncHandler(async (req, res, next) => {
  const { productId } = req.params;
  const buyerId = req.user.id;

  // Check if buyer has already viewed this product
  const { data: existingView, error: checkError } = await supabase
    .from('product_views')
    .select('id')
    .eq('product_id', productId)
    .eq('buyer_id', buyerId)
    .single();

  // If buyer has already viewed this product, don't increment
  if (existingView) {
    return res.status(200).json({
      success: true,
      message: 'Product already viewed by this buyer.',
      alreadyViewed: true
    });
  }

  // Buyer hasn't viewed this product yet, so increment the count
  const { data, error } = await productModel.incrementViewCount(productId);

  if (error) {
    throw new AppError('Failed to update view count.', 500);
  }

  // Record this view
  const { error: recordError } = await supabaseService
    .from('product_views')
    .insert([{
      product_id: productId,
      buyer_id: buyerId
    }]);

  if (recordError) {
    console.error('Error recording product view:', recordError);
    // Don't throw error - view count was already incremented
  }

  res.status(200).json({
    success: true,
    message: 'View count incremented.',
    alreadyViewed: false
  });
});

// ============ Analytics Endpoints ============

exports.getSellerAnalytics = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;

  const { data: sellerProfile, error: profileError } = await supabase
    .from('seller_profiles')
    .select('id')
    .eq('user_id', userId)
    .single();

  if (profileError || !sellerProfile) {
    throw new AppError('Seller profile not found.', 404);
  }

  const { data: analytics, error } = await productModel.getSellerAnalytics(sellerProfile.id);

  if (error) {
    throw new AppError('Failed to fetch analytics.', 500);
  }

  res.status(200).json({
    success: true,
    data: {
      analytics
    }
  });
});

exports.getSalesOverTime = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { period = 'last_30_days' } = req.query; // last_7_days, last_30_days, last_90_days

  const { data: sellerProfile, error: profileError } = await supabase
    .from('seller_profiles')
    .select('id')
    .eq('user_id', userId)
    .single();

  if (profileError || !sellerProfile) {
    throw new AppError('Seller profile not found.', 404);
  }

  const { data: sales, error } = await productModel.getSalesOverTime(sellerProfile.id, period);

  if (error) {
    throw new AppError('Failed to fetch sales data.', 500);
  }

  res.status(200).json({
    success: true,
    data: {
      sales,
      period
    }
  });
});

exports.getTopProducts = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { limit = 10, sortBy = 'sales' } = req.query; // sales, views, orders

  const { data: sellerProfile, error: profileError } = await supabase
    .from('seller_profiles')
    .select('id')
    .eq('user_id', userId)
    .single();

  if (profileError || !sellerProfile) {
    throw new AppError('Seller profile not found.', 404);
  }

  const { data: analytics, error } = await productModel.getTopProducts(sellerProfile.id, limit, sortBy);

  if (error) {
    throw new AppError('Failed to fetch top products.', 500);
  }

  res.status(200).json({
    success: true,
    data: {
      ...analytics,  // This includes both products and chartData
      sortBy,
      limit: parseInt(limit)
    }
  });
});

// Get product reviews
exports.getProductReviews = asyncHandler(async (req, res, next) => {
  const { productId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { data: reviews, error, count } = await supabase
    .from('product_reviews')
    .select(`
      id,
      rating,
      comment,
      created_at,
      buyer:buyer_profiles!inner (
        user:users!inner (
          full_name
        )
      )
    `, { count: 'exact' })
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .range(offset, offset + parseInt(limit) - 1);

  if (error) {
    throw new AppError('Failed to fetch reviews.', 500);
  }

  // Format reviews to include buyer_name at top level
  const formattedReviews = (reviews || []).map(review => ({
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    created_at: review.created_at,
    buyer_name: review.buyer?.user?.full_name || 'Anonymous'
  }));

  res.status(200).json({
    success: true,
    results: formattedReviews.length,
    total: count || 0,
    page: parseInt(page),
    limit: parseInt(limit),
    total_pages: count ? Math.ceil(count / parseInt(limit)) : 0,
    data: {
      reviews: formattedReviews
    }
  });
});

// Get seller reviews (all reviews for seller's products)
exports.getSellerReviews = asyncHandler(async (req, res, next) => {
  const { sellerId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { data: reviews, error, count } = await supabase
    .from('product_reviews')
    .select(`
      id,
      rating,
      comment,
      created_at,
      buyer:buyer_profiles!inner (
        user:users!inner (
          full_name
        )
      ),
      product:products!inner (
        id,
        name,
        photo_path
      )
    `, { count: 'exact' })
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })
    .range(offset, offset + parseInt(limit) - 1);

  if (error) {
    throw new AppError('Failed to fetch reviews.', 500);
  }

  // Format reviews to include buyer_name and product_name at top level
  const formattedReviews = (reviews || []).map(review => ({
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    created_at: review.created_at,
    buyer_name: review.buyer?.user?.full_name || 'Anonymous',
    product_id: review.product?.id,
    product_name: review.product?.name,
    product_photo: review.product?.photo_path
  }));

  res.status(200).json({
    success: true,
    results: formattedReviews.length,
    total: count || 0,
    page: parseInt(page),
    limit: parseInt(limit),
    total_pages: count ? Math.ceil(count / parseInt(limit)) : 0,
    data: {
      reviews: formattedReviews
    }
  });
});

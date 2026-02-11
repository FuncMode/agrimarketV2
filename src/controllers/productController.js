// src\controllers\productController.js

const { AppError, asyncHandler } = require('../middleware/errorHandler');
const productModel = require('../models/productModel');
const { uploadProductPhoto, deleteFile, BUCKETS } = require('../config/storage');
const { supabase, supabaseService } = require('../config/database');

exports.createProduct = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const {
    name,
    description,
    category,
    price_per_unit,
    unit_type,
    available_quantity,
    tags,
    status = 'active'
  } = req.body;

  const { data: sellerProfile, error: profileError } = await supabase
    .from('seller_profiles')
    .select('id, municipality')
    .eq('user_id', userId)
    .single();

  if (profileError || !sellerProfile) {
    throw new AppError('Seller profile not found.', 404);
  }

  let photoPath = null;
  if (req.file) {
    const uploadResult = await uploadProductPhoto(
      sellerProfile.id,
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    if (!uploadResult.success) {
      throw new AppError('Failed to upload product photo.', 500);
    }

    photoPath = uploadResult.data.publicUrl;
  }

  const { data: product, error } = await productModel.createProduct({
    seller_id: sellerProfile.id,
    name,
    description,
    category,
    price_per_unit: parseFloat(price_per_unit),
    unit_type,
    available_quantity: parseInt(available_quantity),
    municipality: sellerProfile.municipality,
    photo_path: photoPath,
    status
  });

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
    message: 'Product created successfully!',
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

  const { data: sellerProfile, error: profileError } = await supabase
    .from('seller_profiles')
    .select('id')
    .eq('user_id', userId)
    .single();

  if (profileError || !sellerProfile) {
    throw new AppError('Seller profile not found.', 404);
  }

  const filters = { 
    status, 
    category,
    page: parseInt(page),
    limit: Math.min(parseInt(limit), 100)
  };
  
  const { data: products, error, count, total_pages } = await productModel.getSellerProducts(sellerProfile.id, filters);

  if (error) {
    throw new AppError('Failed to fetch products.', 500);
  }

  res.status(200).json({
    success: true,
    results: products.length,
    total: count || products.length,
    page: parseInt(page),
    limit: filters.limit,
    total_pages: total_pages || 1,
    data: {
      products
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
    status
  } = req.body;

  const isOwner = await productModel.isProductOwner(productId, userId);
  if (!isOwner) {
    throw new AppError('You do not have permission to update this product.', 403);
  }

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (category !== undefined) updates.category = category;
  if (price_per_unit !== undefined) updates.price_per_unit = parseFloat(price_per_unit);
  if (unit_type !== undefined) updates.unit_type = unit_type;
  if (available_quantity !== undefined) updates.available_quantity = parseInt(available_quantity);
  if (status !== undefined) updates.status = status;

  if (req.file) {
    const { data: sellerProfile } = await supabase
      .from('seller_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    const { data: oldProduct } = await productModel.getProductById(productId);
    const oldPhotoPath = oldProduct?.photo_path;

    const uploadResult = await uploadProductPhoto(
      sellerProfile.id,
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    if (!uploadResult.success) {
      throw new AppError('Failed to upload product photo.', 500);
    }

    updates.photo_path = uploadResult.data.publicUrl;

    if (oldPhotoPath && uploadResult.success) {
      const pathToDelete = oldPhotoPath.includes('product-photos/') 
        ? oldPhotoPath.split('product-photos/')[1] 
        : oldPhotoPath;
      
      deleteFile(BUCKETS.PRODUCT_PHOTOS, pathToDelete).catch(err =>
        console.error('Failed to delete old photo:', err)
      );
    }
  }

  const { data: updatedProduct, error } = await productModel.updateProduct(productId, updates);

  if (error) {
    throw new AppError('Failed to update product.', 500);
  }

  if (tags !== undefined) {
    let tagArray = Array.isArray(tags) ? tags : (tags ? String(tags).split(',').map(t => t.trim()) : []);
    tagArray = tagArray.filter(tag => tag);
    await productModel.updateProductTags(productId, tagArray);
  }

  const { data: completeProduct } = await productModel.getProductById(productId);

  res.status(200).json({
    success: true,
    message: 'Product updated successfully!',
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
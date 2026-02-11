// src\controllers\orderController.js
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const orderModel = require('../models/orderModel');
const cartModel = require('../models/cartModel');
const { supabase, supabaseService } = require('../config/database');
const notificationService = require('../services/notificationService');
const emailService = require('../services/emailService');
const { uploadFile, BUCKETS } = require('../config/storage');
const crypto = require('crypto');

exports.createOrder = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const {
    seller_id,
    delivery_option,
    delivery_address,
    delivery_latitude,
    delivery_longitude,
    preferred_date,
    preferred_time,
    order_notes
  } = req.body;

  const { data: buyerProfile, error: profileError } = await supabase
    .from('buyer_profiles')
    .select('id, delivery_address, delivery_latitude, delivery_longitude')
    .eq('user_id', userId)
    .single();

  if (profileError || !buyerProfile) {
    throw new AppError('Buyer profile not found.', 404);
  }

  const validation = await cartModel.validateCartItems(buyerProfile.id);
  if (!validation.valid) {
    throw new AppError(
      `Cart validation failed: ${validation.issues.join(', ')}`,
      400
    );
  }

  const { data: cartItems } = await cartModel.getCartItems(buyerProfile.id);
  const sellerItems = cartItems.filter(item => item.seller_id === seller_id);

  if (sellerItems.length === 0) {
    throw new AppError('No items found for this seller in cart.', 400);
  }

  const invalidItems = sellerItems.filter(item => item.seller_id !== seller_id);
  if (invalidItems.length > 0) {
    throw new AppError('Cart contains items from different sellers.', 400);
  }

  const inactiveProducts = sellerItems.filter(item => item.product.status !== 'active');
  if (inactiveProducts.length > 0) {
    throw new AppError(
      `Some products are no longer available: ${inactiveProducts.map(p => p.product.name).join(', ')}`,
      400
    );
  }

  const subtotal = sellerItems.reduce((sum, item) =>
    sum + (item.quantity * item.price_snapshot), 0
  );
  const deliveryFee = 0;
  const totalAmount = subtotal + deliveryFee;

  let finalDeliveryAddress = delivery_address;
  let finalDeliveryLat = delivery_latitude;
  let finalDeliveryLon = delivery_longitude;

  if (delivery_option === 'drop-off') {
    if (!finalDeliveryAddress) {
      finalDeliveryAddress = buyerProfile.delivery_address;
      finalDeliveryLat = buyerProfile.delivery_latitude;
      finalDeliveryLon = buyerProfile.delivery_longitude;
    }

    if (!finalDeliveryAddress) {
      throw new AppError('Delivery address is required for drop-off option.', 400);
    }
  }

  const orderItems = sellerItems.map(item => ({
    product_id: item.product_id,
    product_name: item.product.name,
    category: item.product.category,
    price_per_unit: item.price_snapshot,
    unit_type: item.product.unit_type,
    quantity: item.quantity,
    subtotal: item.quantity * item.price_snapshot
  }));

  for (const item of orderItems) {
    const { data: currentProduct } = await supabase
      .from('products')
      .select('available_quantity')
      .eq('id', item.product_id)
      .single();

    if (!currentProduct || currentProduct.available_quantity < item.quantity) {
      throw new AppError(
        `Product ${item.product_name} is no longer available in the requested quantity.`,
        400
      );
    }
  }

  const { data: order, error: orderError } = await orderModel.createOrder({
    buyer_id: buyerProfile.id,
    seller_id,
    delivery_option,
    delivery_address: finalDeliveryAddress,
    delivery_latitude: finalDeliveryLat,
    delivery_longitude: finalDeliveryLon,
    preferred_date,
    preferred_time,
    order_notes,
    subtotal,
    delivery_fee: deliveryFee,
    total_amount: totalAmount
  });

  if (orderError) {
    throw new AppError('Failed to create order.', 500);
  }

  const { error: itemsError } = await orderModel.createOrderItems(order.id, orderItems);

  if (itemsError) {
    await supabaseService
      .from('orders')
      .delete()
      .eq('id', order.id);

    throw new AppError('Failed to create order items.', 500);
  }

  const { success: stockUpdateSuccess } = await orderModel.updateProductStock(orderItems);

  if (!stockUpdateSuccess) {
    console.error('Warning: Failed to update product stock for order', order.id);
  }

  await cartModel.clearCartBySeller(buyerProfile.id, seller_id);

  const { data: completeOrder } = await orderModel.getOrderById(order.id);

  await notificationService.sendOrderNotification(userId, completeOrder, 'order_placed');
  
  const { data: seller } = await supabase
    .from('seller_profiles')
    .select('user_id')
    .eq('id', seller_id)
    .single();
  
  // Get socket service to emit real-time updates
  const socketService = req.app.get('socketService');

  if (seller) {
    await notificationService.sendOrderNotification(seller.user_id, completeOrder, 'new_order');
    
    // Emit real-time socket event to seller about new order
    if (socketService) {
      socketService.broadcastNewOrder(seller.user_id, completeOrder);
    }
  }

  // Send email notifications to buyer and seller
  const { data: buyerUser } = await supabase
    .from('users')
    .select('id, email, full_name')
    .eq('id', userId)
    .single();

  const { data: sellerUser } = await supabase
    .from('users')
    .select('id, email, full_name')
    .eq('id', seller?.user_id)
    .single();

  if (buyerUser) {
    await emailService.sendOrderStatusEmail(completeOrder, buyerUser, 'placed').catch(err => 
      console.error('Failed to send buyer order placed email:', err.message)
    );
  }

  if (sellerUser) {
    await emailService.sendOrderStatusEmail(completeOrder, sellerUser, 'placed').catch(err => 
      console.error('Failed to send seller order placed email:', err.message)
    );
  }

  res.status(201).json({
    success: true,
    message: 'Order placed successfully!',
    data: {
      order: completeOrder
    }
  });
});

exports.getMyOrders = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const role = req.user.role;
  const { status, page = 1, limit = 20 } = req.query;

  let orders;
  let profileId;
  let count;
  let total_pages;

  if (role === 'buyer') {
    const { data: profile } = await supabase
      .from('buyer_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!profile) {
      throw new AppError('Buyer profile not found.', 404);
    }

    profileId = profile.id;
    const result = await orderModel.getBuyerOrders(profileId, { 
      status,
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 100)
    });

    if (result.error) {
      throw new AppError('Failed to fetch orders.', 500);
    }

    orders = result.data;
    count = result.count;
    total_pages = result.total_pages;

  } else if (role === 'seller') {
    const { data: profile } = await supabase
      .from('seller_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!profile) {
      throw new AppError('Seller profile not found.', 404);
    }

    profileId = profile.id;
    const result = await orderModel.getSellerOrders(profileId, { 
      status,
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 100)
    });

    if (result.error) {
      throw new AppError('Failed to fetch orders.', 500);
    }

    orders = result.data;
    count = result.count;
    total_pages = result.total_pages;

  } else {
    throw new AppError('Invalid user role.', 400);
  }

  res.status(200).json({
    success: true,
    results: orders.length,
    total: count || orders.length,
    page: parseInt(page),
    limit: Math.min(parseInt(limit), 100),
    total_pages: total_pages || 1,
    data: {
      orders
    }
  });
});

exports.getOrderById = asyncHandler(async (req, res, next) => {
  const { orderId } = req.params;
  const userId = req.user.id;

  const ownership = await orderModel.checkOrderOwnership(orderId, userId);
  if (!ownership.hasAccess) {
    throw new AppError('Order not found.', 404);
  }

  const { data: order, error } = await orderModel.getOrderById(orderId);

  if (error || !order) {
    throw new AppError('Order not found.', 404);
  }

  res.status(200).json({
    success: true,
    data: {
      order,
      user_role: ownership.isBuyer ? 'buyer' : 'seller'
    }
  });
});

exports.updateOrderStatus = asyncHandler(async (req, res, next) => {
  const { orderId } = req.params;
  const { status } = req.body;
  const userId = req.user.id;

  const validStatuses = ['confirmed', 'ready'];
  if (!validStatuses.includes(status)) {
    throw new AppError('Invalid status. Must be: confirmed or ready', 400);
  }

  const ownership = await orderModel.checkOrderOwnership(orderId, userId);
  if (!ownership.isSeller) {
    throw new AppError('You do not have permission to update this order.', 403);
  }

  const { data: currentOrder } = await orderModel.getOrderById(orderId);

  if (!currentOrder) {
    throw new AppError('Order not found.', 404);
  }

  if (currentOrder.status === 'cancelled') {
    throw new AppError('Cannot update cancelled order.', 400);
  }

  if (currentOrder.status === 'completed') {
    throw new AppError('Order is already completed.', 400);
  }

  if (status === 'ready' && currentOrder.status !== 'confirmed') {
    throw new AppError('Order must be confirmed before marking as ready.', 400);
  }

  const { data: order, error } = await orderModel.updateOrderStatus(orderId, status);

  if (error) {
    throw new AppError('Failed to update order status.', 500);
  }

  // Get buyer user_id for notification and socket update
  const { data: buyerProfile } = await supabase
    .from('buyer_profiles')
    .select('user_id')
    .eq('id', order.buyer_id)
    .single();

  // Get socket service to emit real-time update
  const socketService = req.app.get('socketService');

  // Send notification to buyer when seller updates order status
  if (buyerProfile) {
    // Emit real-time socket event to buyer
    if (socketService) {
      socketService.broadcastOrderUpdate(orderId, buyerProfile.user_id, {
        order_number: order.order_number,
        status: status,
        delivery_option: order.delivery_option,
        total_amount: order.total_amount
      });
    }

    if (status === 'confirmed') {
      await notificationService.sendOrderNotification(
        buyerProfile.user_id,
        order,
        'order_confirmed'
      );
      
      // Send email notification to buyer
      const { data: buyerUser } = await supabase
        .from('users')
        .select('id, email, full_name')
        .eq('id', buyerProfile.user_id)
        .single();

      if (buyerUser) {
        await emailService.sendOrderStatusEmail(order, buyerUser, 'confirmed').catch(err => 
          console.error('Failed to send order confirmed email:', err.message)
        );
      }
    } else if (status === 'ready') {
      await notificationService.sendOrderNotification(
        buyerProfile.user_id,
        order,
        'order_ready'
      );
      
      // Send email notification to buyer
      const { data: buyerUser } = await supabase
        .from('users')
        .select('id, email, full_name')
        .eq('id', buyerProfile.user_id)
        .single();

      if (buyerUser) {
        await emailService.sendOrderStatusEmail(order, buyerUser, 'ready').catch(err => 
          console.error('Failed to send order ready email:', err.message)
        );
      }
    }
  }

  res.status(200).json({
    success: true,
    message: `Order marked as ${status}!`,
    data: {
      order
    }
  });
});

exports.confirmOrderCompletion = asyncHandler(async (req, res, next) => {
  const { orderId } = req.params;
  const userId = req.user.id;
  const role = req.user.role;

  const ownership = await orderModel.checkOrderOwnership(orderId, userId);
  if (!ownership.hasAccess) {
    throw new AppError('Order not found.', 404);
  }

  const { data: currentOrder } = await orderModel.getOrderById(orderId);

  if (!currentOrder) {
    throw new AppError('Order not found.', 404);
  }

  if (currentOrder.status !== 'ready') {
    throw new AppError('Order must be ready before confirmation.', 400);
  }

  if (role === 'buyer' && currentOrder.buyer_confirmed) {
    throw new AppError('You have already confirmed this order.', 400);
  }

  if (role === 'seller' && currentOrder.seller_confirmed) {
    throw new AppError('You have already confirmed this order.', 400);
  }

  // Handle delivery proof image upload if provided
  let deliveryProofUrl = null;
  if (req.file) {
    try {
      const timestamp = Date.now();
      const randomString = crypto.randomBytes(8).toString('hex');
      const fileExtension = req.file.originalname.split('.').pop();
      const filePrefix = role === 'buyer' ? 'buyer' : 'seller';
      const fileName = `${orderId}_${filePrefix}_${timestamp}_${randomString}.${fileExtension}`;
      const filePath = `orders/${orderId}/${fileName}`;

      const uploadResult = await uploadFile(
        BUCKETS.DELIVERY_PROOF,
        filePath,
        req.file.buffer,
        req.file.mimetype
      );

      if (!uploadResult.success) {
        throw new AppError(`Failed to upload delivery proof: ${uploadResult.error}`, 500);
      }

      deliveryProofUrl = uploadResult.data.publicUrl || uploadResult.data.path;
    } catch (uploadError) {
      console.error('Delivery proof upload error:', uploadError);
      throw new AppError('Failed to upload delivery proof image.', 500);
    }
  }

  const { data: order, error } = await orderModel.confirmOrder(orderId, role, deliveryProofUrl);

  if (error) {
    throw new AppError('Failed to confirm order.', 500);
  }

  const message = (order.buyer_confirmed && order.seller_confirmed)
    ? 'Order completed! Both parties have confirmed.'
    : 'Order confirmed! Waiting for other party confirmation.';

  // Get socket service for real-time updates
  const socketService = req.app.get('socketService');

  if (order.status === 'completed') {
    await orderModel.updateSellerStats(order.seller_id, parseFloat(order.total_amount));
    
    const { data: seller } = await supabase
      .from('seller_profiles')
      .select('user_id')
      .eq('id', order.seller_id)
      .single();
    
    const { data: buyer } = await supabase
      .from('buyer_profiles')
      .select('user_id')
      .eq('id', order.buyer_id)
      .single();
    
    // Emit real-time socket event for order completion
    if (seller && socketService) {
      socketService.broadcastOrderUpdate(orderId, seller.user_id, {
        order_number: order.order_number,
        status: 'completed',
        delivery_option: order.delivery_option,
        total_amount: order.total_amount
      });
    }

    if (buyer && socketService) {
      socketService.broadcastOrderUpdate(orderId, buyer.user_id, {
        order_number: order.order_number,
        status: 'completed',
        delivery_option: order.delivery_option,
        total_amount: order.total_amount
      });
    }
    
    if (seller) {
      await notificationService.sendOrderNotification(seller.user_id, order, 'order_completed');
      
      // Send email notification to seller
      const { data: sellerUser } = await supabase
        .from('users')
        .select('id, email, full_name')
        .eq('id', seller.user_id)
        .single();

      if (sellerUser) {
        await emailService.sendOrderStatusEmail(order, sellerUser, 'completed').catch(err => 
          console.error('Failed to send seller completion email:', err.message)
        );
      }
    }
    
    if (buyer) {
      await notificationService.sendOrderNotification(buyer.user_id, order, 'order_completed');
      
      const { data: buyerUser } = await supabase
        .from('users')
        .select('id, email, full_name')
        .eq('id', buyer.user_id)
        .single();

      if (buyerUser) {
        await emailService.sendOrderStatusEmail(order, buyerUser, 'completed').catch(err => 
          console.error('Failed to send buyer completion email:', err.message)
        );
      }
    }
  } else {
    // Emit update for confirmation (not yet completed)
    const { data: seller } = await supabase
      .from('seller_profiles')
      .select('user_id')
      .eq('id', order.seller_id)
      .single();
    
    const { data: buyer } = await supabase
      .from('buyer_profiles')
      .select('user_id')
      .eq('id', order.buyer_id)
      .single();

    // Notify the other party
    if (role === 'buyer' && seller && socketService) {
      socketService.broadcastOrderUpdate(orderId, seller.user_id, {
        order_number: order.order_number,
        status: order.status,
        delivery_option: order.delivery_option,
        total_amount: order.total_amount,
        buyer_confirmed: order.buyer_confirmed,
        seller_confirmed: order.seller_confirmed,
        buyer_delivery_proof_url: order.buyer_delivery_proof_url,
        seller_delivery_proof_url: order.seller_delivery_proof_url
      });
    } else if (role === 'seller' && buyer && socketService) {
      socketService.broadcastOrderUpdate(orderId, buyer.user_id, {
        order_number: order.order_number,
        status: order.status,
        delivery_option: order.delivery_option,
        total_amount: order.total_amount,
        buyer_confirmed: order.buyer_confirmed,
        seller_confirmed: order.seller_confirmed,
        buyer_delivery_proof_url: order.buyer_delivery_proof_url,
        seller_delivery_proof_url: order.seller_delivery_proof_url
      });
    }
  }

  res.status(200).json({
    success: true,
    message,
    data: {
      order
    }
  });
});

exports.cancelOrder = asyncHandler(async (req, res, next) => {
  const { orderId } = req.params;
  const { reason } = req.body;
  const userId = req.user.id;

  if (!reason) {
    throw new AppError('Cancellation reason is required.', 400);
  }

  const ownership = await orderModel.checkOrderOwnership(orderId, userId);
  if (!ownership.hasAccess) {
    throw new AppError('Order not found.', 404);
  }

  const { data: currentOrder } = await orderModel.getOrderById(orderId);

  if (!currentOrder) {
    throw new AppError('Order not found.', 404);
  }

  if (!['pending', 'confirmed'].includes(currentOrder.status)) {
    throw new AppError('Cannot cancel order in current status.', 400);
  }

  const { data: order, error } = await orderModel.cancelOrder(orderId, userId, reason);

  if (error) {
    throw new AppError('Failed to cancel order.', 500);
  }

  const orderItems = currentOrder.items.map(item => ({
    product_id: item.product_id,
    quantity: item.quantity
  }));

  await orderModel.restoreProductStock(orderItems);

  const { data: seller } = await supabase
    .from('seller_profiles')
    .select('user_id')
    .eq('id', order.seller_id)
    .single();
  
  const { data: buyer } = await supabase
    .from('buyer_profiles')
    .select('user_id')
    .eq('id', order.buyer_id)
    .single();

  // Get socket service for real-time updates
  const socketService = req.app.get('socketService');

  if (seller) {
    // Emit real-time socket event to seller about order cancellation
    if (socketService) {
      socketService.broadcastOrderCancelled(seller.user_id, {
        id: orderId,
        order_number: order.order_number,
        cancellation_reason: reason,
        cancelled_by: 'buyer'
      });
    }
    
    await notificationService.sendOrderNotification(seller.user_id, order, 'order_cancelled');
    
    try {
      const { data: sellerUser } = await supabase
        .from('users')
        .select('email, full_name')
        .eq('id', seller.user_id)
        .single();
      
      if (sellerUser) {
        await emailService.sendOrderCancellationEmail(sellerUser, order, reason);
      }
    } catch (emailError) {
      console.error('Failed to send cancellation email to seller:', emailError.message);
    }
  }
  
  if (buyer) {
    // Emit real-time socket event to buyer about order cancellation
    if (socketService) {
      socketService.broadcastOrderCancelled(buyer.user_id, {
        id: orderId,
        order_number: order.order_number,
        cancellation_reason: reason,
        cancelled_by: 'seller'
      });
    }
    
    await notificationService.sendOrderNotification(buyer.user_id, order, 'order_cancelled');
    
    try {
      const { data: buyerUser } = await supabase
        .from('users')
        .select('email, full_name')
        .eq('id', buyer.user_id)
        .single();
      
      if (buyerUser) {
        await emailService.sendOrderCancellationEmail(buyerUser, order, reason);
      }
    } catch (emailError) {
      console.error('Failed to send cancellation email to buyer:', emailError.message);
    }
  }

  res.status(200).json({
    success: true,
    message: 'Order cancelled successfully.',
    data: {
      order
    }
  });
});

exports.rateOrder = asyncHandler(async (req, res, next) => {
  const { orderId } = req.params;
  const userId = req.user.id;
  const { reviews } = req.body; // Array of { product_id, rating, comment }

  // Validate reviews array
  if (!reviews || !Array.isArray(reviews) || reviews.length === 0) {
    throw new AppError('Reviews array is required.', 400);
  }

  // Validate each review
  for (const review of reviews) {
    if (!review.product_id || !review.rating) {
      throw new AppError('Each review must have product_id and rating.', 400);
    }
    if (review.rating < 1 || review.rating > 5 || !Number.isInteger(review.rating)) {
      throw new AppError('Rating must be an integer between 1 and 5.', 400);
    }
  }

  // Check order ownership
  const ownership = await orderModel.checkOrderOwnership(orderId, userId);
  if (!ownership.hasAccess || !ownership.isBuyer) {
    throw new AppError('Order not found or you do not have permission to rate this order.', 404);
  }

  // Get order details
  const { data: order, error: orderError } = await orderModel.getOrderById(orderId);
  
  if (orderError || !order) {
    throw new AppError('Order not found.', 404);
  }

  // Check if order is completed
  if (order.status !== 'completed') {
    throw new AppError('You can only rate completed orders.', 400);
  }

  // Get buyer profile
  const { data: buyerProfile } = await supabase
    .from('buyer_profiles')
    .select('id')
    .eq('user_id', userId)
    .single();

  if (!buyerProfile) {
    throw new AppError('Buyer profile not found.', 404);
  }

  // Check if already reviewed
  const { data: existingReviews } = await supabase
    .from('product_reviews')
    .select('id')
    .eq('order_id', orderId)
    .limit(1);

  if (existingReviews && existingReviews.length > 0) {
    throw new AppError('You have already reviewed this order.', 400);
  }

  // Verify all products are from this order
  const orderProductIds = order.items.map(item => item.product_id);
  for (const review of reviews) {
    if (!orderProductIds.includes(review.product_id)) {
      throw new AppError('Invalid product in review.', 400);
    }
  }

  // Create product reviews
  const reviewsToInsert = reviews.map(review => ({
    order_id: orderId,
    product_id: review.product_id,
    buyer_id: buyerProfile.id,
    seller_id: order.seller_id,
    rating: review.rating,
    comment: review.comment || null
  }));

  const { data: createdReviews, error: reviewError } = await supabaseService
    .from('product_reviews')
    .insert(reviewsToInsert)
    .select();

  if (reviewError) {
    console.error('Error creating reviews:', reviewError);
    throw new AppError('Failed to submit reviews.', 500);
  }

  // Update order with rating flag
  await supabaseService
    .from('orders')
    .update({
      buyer_rating: Math.round(reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length),
      buyer_rating_comment: reviews[0].comment || null,
      buyer_rated_at: new Date().toISOString()
    })
    .eq('id', orderId);

  // Get socket service for real-time update
  const socketService = req.app.get('socketService');
  
  // Notify seller about new reviews
  const { data: seller } = await supabase
    .from('seller_profiles')
    .select('user_id')
    .eq('id', order.seller_id)
    .single();

  if (seller && socketService) {
    await notificationService.createNotification(
      seller.user_id,
      'New Review Received',
      `You received ${reviews.length} new review(s) for order #${order.order_number}`,
      'rating',
      orderId
    );
    
    socketService.notifyUser(seller.user_id, {
      type: 'new_rating',
      order_id: orderId,
      total_reviews: reviews.length
    });
  }

  res.status(200).json({
    success: true,
    message: 'Reviews submitted successfully!',
    data: {
      reviews: createdReviews
    }
  });
});

exports.getOrderReviews = asyncHandler(async (req, res, next) => {
  const { orderId } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  // Verify order ownership
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, buyer_id, seller_id, buyer:buyer_profiles!orders_buyer_id_fkey(user_id), seller:seller_profiles!orders_seller_id_fkey(user_id)')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    throw new AppError('Order not found.', 404);
  }

  // Check if user has permission to view these reviews
  const isBuyerOrder = order.buyer?.user_id === userId;
  const isSellerOrder = order.seller?.user_id === userId;

  if (!isBuyerOrder && !isSellerOrder) {
    throw new AppError('You do not have permission to view these reviews.', 403);
  }

  // Get product reviews for this order
  const { data: reviews, error: reviewsError } = await supabase
    .from('product_reviews')
    .select(`
      id,
      order_id,
      product_id,
      rating,
      comment,
      created_at,
      product:products!product_reviews_product_id_fkey(id, name),
      buyer:buyer_profiles!product_reviews_buyer_id_fkey(
        id,
        user:users!buyer_profiles_user_id_fkey(full_name)
      )
    `)
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });

  if (reviewsError) {
    console.error('Error fetching order reviews:', reviewsError);
    throw new AppError('Failed to fetch reviews.', 500);
  }

  // Format the reviews
  const formattedReviews = reviews.map(review => ({
    id: review.id,
    product_id: review.product_id,
    product_name: review.product?.name,
    rating: review.rating,
    comment: review.comment,
    buyer_name: review.buyer?.user?.full_name,
    created_at: review.created_at
  }));

  res.status(200).json({
    success: true,
    data: {
      reviews: formattedReviews
    }
  });
});

exports.getOrderStats = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const role = req.user.role;

  if (!['buyer', 'seller'].includes(role)) {
    throw new AppError('Invalid user role.', 400);
  }

  const { data: stats, error } = await orderModel.getOrderStats(userId, role);

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
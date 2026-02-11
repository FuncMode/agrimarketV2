// src\controllers\cartController.js
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const cartModel = require('../models/cartModel');
const { supabase } = require('../config/database');

exports.addToCart = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { product_id, quantity = 1 } = req.body;

  const { data: buyerProfile, error: profileError } = await supabase
    .from('buyer_profiles')
    .select('id')
    .eq('user_id', userId)
    .single();

  if (profileError || !buyerProfile) {
    throw new AppError('Buyer profile not found.', 404);
  }

  const { data: product, error: productError } = await supabase
    .from('products')
    .select(`
      id,
      seller_id,
      name,
      price_per_unit,
      available_quantity,
      status,
      seller:seller_profiles!inner (
        user:users!inner (status)
      )
    `)
    .eq('id', product_id)
    .single();

  if (productError || !product) {
    throw new AppError('Product not found.', 404);
  }

  if (product.status !== 'active') {
    throw new AppError('This product is not available for purchase.', 400);
  }

  if (product.seller.user.status !== 'verified') {
    throw new AppError('Product seller is not verified.', 400);
  }

  if (product.available_quantity < quantity) {
    if (product.available_quantity === 0) {
      throw new AppError('This product is out of stock.', 400);
    }
    throw new AppError(
      `Only ${product.available_quantity} unit${product.available_quantity === 1 ? '' : 's'} available.`,
      400
    );
  }

  const { data: existingCart } = await supabase
    .from('shopping_carts')
    .select('quantity')
    .eq('buyer_id', buyerProfile.id)
    .eq('product_id', product_id)
    .single();

  if (existingCart) {
    const newQuantity = existingCart.quantity + quantity;
    if (product.available_quantity < newQuantity) {
      if (product.available_quantity === 0) {
        throw new AppError('This product is out of stock.', 400);
      }
      throw new AppError(
        `Cannot add to cart. Only ${product.available_quantity} unit${product.available_quantity === 1 ? '' : 's'} available (you have ${existingCart.quantity} in cart).`,
        400
      );
    }
  }

  const { data: cartItem, error } = await cartModel.addToCart({
    buyer_id: buyerProfile.id,
    product_id,
    seller_id: product.seller_id,
    quantity,
    price_snapshot: product.price_per_unit
  });

  if (error) {
    throw new AppError('Failed to add to cart.', 500);
  }

  const { data: summary } = await cartModel.getCartSummary(buyerProfile.id);

  res.status(201).json({
    success: true,
    message: `${product.name} added to cart!`,
    data: {
      cart_item: cartItem,
      cart_summary: summary
    }
  });
});

exports.getCart = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;

  const { data: buyerProfile, error: profileError } = await supabase
    .from('buyer_profiles')
    .select('id')
    .eq('user_id', userId)
    .single();

  if (profileError || !buyerProfile) {
    throw new AppError('Buyer profile not found.', 404);
  }

  const { data: summary, error } = await cartModel.getCartSummary(buyerProfile.id);

  if (error) {
    throw new AppError('Failed to fetch cart.', 500);
  }

  res.status(200).json({
    success: true,
    data: {
      cart: summary
    }
  });
});

exports.updateCartItem = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { cartItemId } = req.params;
  const { quantity } = req.body;

  if (!quantity || quantity < 1) {
    throw new AppError('Quantity must be at least 1.', 400);
  }

  const { data: buyerProfile, error: profileError } = await supabase
    .from('buyer_profiles')
    .select('id')
    .eq('user_id', userId)
    .single();

  if (profileError || !buyerProfile) {
    throw new AppError('Buyer profile not found.', 404);
  }

  const isOwner = await cartModel.isCartItemOwner(cartItemId, buyerProfile.id);
  if (!isOwner) {
    throw new AppError('Cart item not found.', 404);
  }

  const { data: cartItems } = await cartModel.getCartItems(buyerProfile.id);
  const cartItem = cartItems.find(item => item.id === cartItemId);

  if (!cartItem) {
    throw new AppError('Cart item not found.', 404);
  }

  if (cartItem.product.status !== 'active') {
    throw new AppError('This product is no longer available.', 400);
  }

  if (cartItem.product.available_quantity < quantity) {
    throw new AppError(
      `Only ${cartItem.product.available_quantity} units available.`,
      400
    );
  }

  const { data, error } = await cartModel.updateCartQuantity(cartItemId, quantity);

  if (error) {
    throw new AppError('Failed to update cart.', 500);
  }

  const { data: summary } = await cartModel.getCartSummary(buyerProfile.id);

  res.status(200).json({
    success: true,
    message: 'Cart updated!',
    data: {
      cart_item: data,
      cart_summary: summary
    }
  });
});

exports.removeFromCart = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { cartItemId } = req.params;

  const { data: buyerProfile, error: profileError } = await supabase
    .from('buyer_profiles')
    .select('id')
    .eq('user_id', userId)
    .single();

  if (profileError || !buyerProfile) {
    throw new AppError('Buyer profile not found.', 404);
  }

  const isOwner = await cartModel.isCartItemOwner(cartItemId, buyerProfile.id);
  if (!isOwner) {
    throw new AppError('Cart item not found.', 404);
  }

  const { error } = await cartModel.removeFromCart(cartItemId);

  if (error) {
    throw new AppError('Failed to remove item from cart.', 500);
  }

  const { data: summary } = await cartModel.getCartSummary(buyerProfile.id);

  res.status(200).json({
    success: true,
    message: 'Item removed from cart.',
    data: {
      cart_summary: summary
    }
  });
});

exports.clearCart = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;

  const { data: buyerProfile, error: profileError } = await supabase
    .from('buyer_profiles')
    .select('id')
    .eq('user_id', userId)
    .single();

  if (profileError || !buyerProfile) {
    throw new AppError('Buyer profile not found.', 404);
  }

  const { error } = await cartModel.clearCart(buyerProfile.id);

  if (error) {
    throw new AppError('Failed to clear cart.', 500);
  }

  res.status(200).json({
    success: true,
    message: 'Cart cleared successfully.',
    data: {
      cart_summary: {
        total_items: 0,
        total_unique_products: 0,
        subtotal: 0,
        delivery_fee: 0,
        total: 0,
        seller_groups: [],
        items: []
      }
    }
  });
});

exports.validateCart = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;

  const { data: buyerProfile, error: profileError } = await supabase
    .from('buyer_profiles')
    .select('id')
    .eq('user_id', userId)
    .single();

  if (profileError || !buyerProfile) {
    throw new AppError('Buyer profile not found.', 404);
  }

  const validation = await cartModel.validateCartItems(buyerProfile.id);

  res.status(200).json({
    success: true,
    data: {
      validation
    }
  });
});

exports.getCartCount = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;

  const { data: buyerProfile, error: profileError } = await supabase
    .from('buyer_profiles')
    .select('id')
    .eq('user_id', userId)
    .single();

  if (profileError || !buyerProfile) {
    throw new AppError('Buyer profile not found.', 404);
  }

  const { count, error } = await cartModel.getCartCount(buyerProfile.id);

  if (error) {
    throw new AppError('Failed to get cart count.', 500);
  }

  res.status(200).json({
    success: true,
    data: {
      count
    }
  });
});
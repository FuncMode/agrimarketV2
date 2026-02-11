// src\models\cartModel.js
const { supabase, supabaseService } = require('../config/database');

exports.addToCart = async (cartData) => {
  const {
    buyer_id,
    product_id,
    seller_id,
    quantity,
    price_snapshot
  } = cartData;

  const { data: existing } = await supabase
    .from('shopping_carts')
    .select('*')
    .eq('buyer_id', buyer_id)
    .eq('product_id', product_id)
    .single();

  if (existing) {
    const newQuantity = existing.quantity + quantity;
    
    const { data, error } = await supabaseService
      .from('shopping_carts')
      .update({
        quantity: newQuantity,
        price_snapshot,
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id)
      .select()
      .single();

    return { data, error };
  } else {
    const { data, error } = await supabaseService
      .from('shopping_carts')
      .insert([{
        buyer_id,
        product_id,
        seller_id,
        quantity,
        price_snapshot
      }])
      .select()
      .single();

    return { data, error };
  }
};

exports.getCartItems = async (buyerId) => {
  const { data, error } = await supabase
    .from('shopping_carts')
    .select(`
      *,
      product:products!inner (
        id,
        name,
        category,
        price_per_unit,
        unit_type,
        available_quantity,
        photo_path,
        status,
        municipality,
        seller:seller_profiles!inner (
          id,
          municipality,
          farm_type,
          user:users!inner (
            id,
            full_name,
            phone_number,
            status
          )
        )
      )
    `)
    .eq('buyer_id', buyerId)
    .order('created_at', { ascending: false });

  return { data: data || [], error };
};

exports.getCartSummary = async (buyerId) => {
  const { data: items, error } = await exports.getCartItems(buyerId);

  if (error) {
    return { data: null, error };
  }

  let subtotal = 0;
  let totalItems = 0;
  const sellerGroups = {};

  items.forEach(item => {
    const itemTotal = item.quantity * item.price_snapshot;
    subtotal += itemTotal;
    totalItems += item.quantity;

    if (!sellerGroups[item.seller_id]) {
      sellerGroups[item.seller_id] = {
        seller_id: item.seller_id,
        seller_name: item.product.seller.user.full_name,
        municipality: item.product.seller.municipality,
        items: [],
        subtotal: 0
      };
    }

    sellerGroups[item.seller_id].items.push(item);
    sellerGroups[item.seller_id].subtotal += itemTotal;
  });

  const summary = {
    total_items: totalItems,
    total_unique_products: items.length,
    subtotal: parseFloat(subtotal.toFixed(2)),
    delivery_fee: 0,
    total: parseFloat(subtotal.toFixed(2)),
    seller_groups: Object.values(sellerGroups),
    items
  };

  return { data: summary, error: null };
};

exports.updateCartQuantity = async (cartItemId, quantity) => {
  const { data, error } = await supabaseService
    .from('shopping_carts')
    .update({
      quantity,
      updated_at: new Date().toISOString()
    })
    .eq('id', cartItemId)
    .select()
    .single();

  return { data, error };
};

exports.removeFromCart = async (cartItemId) => {
  const { data, error } = await supabaseService
    .from('shopping_carts')
    .delete()
    .eq('id', cartItemId)
    .select()
    .single();

  return { data, error };
};

exports.clearCart = async (buyerId) => {
  const { data, error } = await supabaseService
    .from('shopping_carts')
    .delete()
    .eq('buyer_id', buyerId);

  return { data, error };
};

exports.clearCartBySeller = async (buyerId, sellerId) => {
  const { data, error } = await supabaseService
    .from('shopping_carts')
    .delete()
    .eq('buyer_id', buyerId)
    .eq('seller_id', sellerId);

  return { data, error };
};

exports.isCartItemOwner = async (cartItemId, buyerId) => {
  const { data, error } = await supabase
    .from('shopping_carts')
    .select('id')
    .eq('id', cartItemId)
    .eq('buyer_id', buyerId)
    .single();

  return !!data && !error;
};

exports.validateCartItems = async (buyerId) => {
  const { data: items, error } = await exports.getCartItems(buyerId);

  if (error) {
    return { valid: false, issues: ['Failed to fetch cart items'], items: [] };
  }

  const issues = [];
  const warnings = [];
  const validItems = [];

  items.forEach(item => {
    const product = item.product;

    if (!product || product.status !== 'active') {
      issues.push(`${item.product?.name || 'Product'} is no longer available`);
      return;
    }

    if (product.seller?.user?.status !== 'verified') {
      issues.push(`${product.name} - seller is not verified`);
      return;
    }

    if (product.available_quantity < item.quantity) {
      if (product.available_quantity === 0) {
        issues.push(`${product.name} is out of stock`);
      } else {
        issues.push(`${product.name} - only ${product.available_quantity} ${product.unit_type} available (you have ${item.quantity} in cart)`);
      }
      return;
    }

    if (product.price_per_unit !== item.price_snapshot) {
      const priceDifference = product.price_per_unit - item.price_snapshot;
      
      if (priceDifference > 0) {
        warnings.push({
          product: product.name,
          type: 'price_increase',
          oldPrice: item.price_snapshot,
          newPrice: product.price_per_unit,
          message: `${product.name} price increased from ₱${item.price_snapshot} to ₱${product.price_per_unit}`
        });
      } else {
        item.price_snapshot = product.price_per_unit;
        warnings.push({
          product: product.name,
          type: 'price_decrease',
          oldPrice: item.price_snapshot,
          newPrice: product.price_per_unit,
          message: `${product.name} price decreased from ₱${item.price_snapshot} to ₱${product.price_per_unit} - automatically updated!`
        });
      }
    }

    validItems.push(item);
  });

  return {
    valid: issues.length === 0,
    issues,
    warnings,
    items: validItems,
    invalid_count: items.length - validItems.length
  };
};

exports.getCartCount = async (buyerId) => {
  const { count, error } = await supabase
    .from('shopping_carts')
    .select('id', { count: 'exact', head: true })
    .eq('buyer_id', buyerId);

  return { count: count || 0, error };
};
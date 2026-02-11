// src\models\orderModel.js
const { supabase, supabaseService } = require('../config/database');

exports.generateOrderNumber = async () => {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');

  const { count } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', `${today.toISOString().split('T')[0]}T00:00:00`)
    .lte('created_at', `${today.toISOString().split('T')[0]}T23:59:59`);

  const orderNum = String((count || 0) + 1).padStart(5, '0');
  return `ORD-${dateStr}-${orderNum}`;
};

exports.createOrder = async (orderData) => {
  const orderNumber = await exports.generateOrderNumber();

  const { data, error } = await supabaseService
    .from('orders')
    .insert([{
      order_number: orderNumber,
      buyer_id: orderData.buyer_id,
      seller_id: orderData.seller_id,
      delivery_option: orderData.delivery_option,
      delivery_address: orderData.delivery_address || null,
      delivery_latitude: orderData.delivery_latitude || null,
      delivery_longitude: orderData.delivery_longitude || null,
      preferred_date: orderData.preferred_date || null,
      preferred_time: orderData.preferred_time || null,
      order_notes: orderData.order_notes || null,
      subtotal: orderData.subtotal,
      delivery_fee: orderData.delivery_fee || 0,
      total_amount: orderData.total_amount,
      payment_method: orderData.payment_method || 'cod',
      payment_status: 'unpaid',
      status: 'pending'
    }])
    .select()
    .single();

  return { data, error };
};

exports.createOrderItems = async (orderId, items) => {
  const orderItems = items.map(item => ({
    order_id: orderId,
    product_id: item.product_id,
    product_name: item.product_name,
    category: item.category,
    price_per_unit: item.price_per_unit,
    unit_type: item.unit_type,
    quantity: item.quantity,
    subtotal: item.subtotal
  }));

  const { data, error } = await supabaseService
    .from('order_items')
    .insert(orderItems)
    .select();

  return { data: data || [], error };
};

exports.getOrderById = async (orderId) => {
  const { data: order, error } = await supabase
    .from('orders')
    .select(`
      *,
      buyer:buyer_profiles!inner (
        id,
        delivery_address,
        municipality,
        user:users!inner (
          id,
          full_name,
          phone_number,
          email
        )
      ),
      seller:seller_profiles!inner (
        id,
        municipality,
        farm_type,
        rating,
        user:users!inner (
          id,
          full_name,
          phone_number,
          email,
          status
        )
      )
    `)
    .eq('id', orderId)
    .single();

  if (error || !order) {
    return { data: null, error: error || new Error('Order not found') };
  }

  const { data: items } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', orderId);

  order.items = items || [];

  return { data: order, error: null };
};

exports.getBuyerOrders = async (buyerId, filters = {}) => {
  const { status, page = 1, limit = 20 } = filters;
  
  let query = supabase
    .from('orders')
    .select(`
      id,
      order_number,
      status,
      delivery_option,
      total_amount,
      payment_status,
      buyer_confirmed,
      seller_confirmed,
      buyer_rating,
      buyer_rating_comment,
      buyer_rated_at,
      seller_delivery_proof_url,
      buyer_delivery_proof_url,
      preferred_date,
      preferred_time,
      created_at,
      confirmed_at,
      completed_at,
      seller:seller_profiles!inner (
        id,
        municipality,
        user:users!inner (
          full_name
        )
      )
    `, { count: 'exact' })
    .eq('buyer_id', buyerId)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (data && data.length > 0) {
    const orderIds = data.map(o => o.id);
    
    // Get all order items for these orders
    const { data: allOrderItems } = await supabase
      .from('order_items')
      .select('*')
      .in('order_id', orderIds);

    // Map items to their respective orders
    data.forEach(order => {
      order.items = (allOrderItems || []).filter(item => item.order_id === order.id);
    });
  } else if (data) {
    // Ensure items array exists for all orders
    data.forEach(order => {
      order.items = [];
    });
  }

  return { 
    data: data || [], 
    error,
    count: count || 0,
    page: parseInt(page),
    limit: parseInt(limit),
    total_pages: count ? Math.ceil(count / limit) : 0
  };
};

exports.getSellerOrders = async (sellerId, filters = {}) => {
  const { status, page = 1, limit = 20 } = filters;
  
  let query = supabase
    .from('orders')
    .select(`
      id,
      order_number,
      status,
      delivery_option,
      delivery_address,
      preferred_date,
      preferred_time,
      total_amount,
      payment_status,
      buyer_confirmed,
      seller_confirmed,
      created_at,
      confirmed_at,
      completed_at,
      buyer:buyer_profiles!inner (
        id,
        delivery_address,
        municipality,
        user:users!inner (
          full_name,
          phone_number
        )
      )
    `, { count: 'exact' })
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (data && data.length > 0) {
    const orderIds = data.map(o => o.id);
    
    // Get all order items for these orders
    const { data: allOrderItems } = await supabase
      .from('order_items')
      .select('*')
      .in('order_id', orderIds);

    // Map items to their respective orders
    data.forEach(order => {
      order.items = (allOrderItems || []).filter(item => item.order_id === order.id);
    });
  } else if (data) {
    // Ensure items array exists for all orders
    data.forEach(order => {
      order.items = [];
    });
  }

  return { 
    data: data || [], 
    error,
    count: count || 0,
    page: parseInt(page),
    limit: parseInt(limit),
    total_pages: count ? Math.ceil(count / limit) : 0
  };
};

exports.updateOrderStatus = async (orderId, status, deliveryProofUrl = null) => {
  const updates = {
    status,
    updated_at: new Date().toISOString()
  };

  if (status === 'confirmed') {
    updates.confirmed_at = new Date().toISOString();
  } else if (status === 'completed') {
    updates.completed_at = new Date().toISOString();
    updates.payment_status = 'paid';
  } else if (status === 'cancelled') {
    updates.cancelled_at = new Date().toISOString();
  }

  // Add seller delivery proof URL if provided (when marking as ready)
  if (deliveryProofUrl && status === 'ready') {
    updates.seller_delivery_proof_url = deliveryProofUrl;
  }

  const { data, error } = await supabaseService
    .from('orders')
    .update(updates)
    .eq('id', orderId)
    .select()
    .single();

  return { data, error };
};

exports.confirmOrder = async (orderId, role, deliveryProofUrl = null) => {
  const updates = {
    updated_at: new Date().toISOString()
  };

  if (role === 'buyer') {
    updates.buyer_confirmed = true;
    updates.buyer_confirmed_at = new Date().toISOString();
    if (deliveryProofUrl) {
      updates.buyer_delivery_proof_url = deliveryProofUrl;
    }
  } else if (role === 'seller') {
    updates.seller_confirmed = true;
    updates.seller_confirmed_at = new Date().toISOString();
    if (deliveryProofUrl) {
      updates.seller_delivery_proof_url = deliveryProofUrl;
    }
  }

  const { data: updatedOrder } = await supabaseService
    .from('orders')
    .update(updates)
    .eq('id', orderId)
    .select('buyer_confirmed, seller_confirmed')
    .single();

  if (updatedOrder && updatedOrder.buyer_confirmed && updatedOrder.seller_confirmed) {
    await supabaseService
      .from('orders')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        payment_status: 'paid'
      })
      .eq('id', orderId);
  }

  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  return { data, error };
};

exports.cancelOrder = async (orderId, cancelledBy, reason) => {
  const { data, error } = await supabaseService
    .from('orders')
    .update({
      status: 'cancelled',
      cancelled_by: cancelledBy,
      cancellation_reason: reason,
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', orderId)
    .select()
    .single();

  return { data, error };
};

exports.updateProductStock = async (items) => {
  try {
    for (const item of items) {
      const { data: product } = await supabase
        .from('products')
        .select('available_quantity, order_count')
        .eq('id', item.product_id)
        .single();

      if (product) {
        const newQuantity = Math.max(0, product.available_quantity - item.quantity);

        await supabaseService
          .from('products')
          .update({
            available_quantity: newQuantity,
            order_count: (product.order_count || 0) + 1,
            updated_at: new Date().toISOString()
          })
          .eq('id', item.product_id);
      }
    }

    return { success: true, error: null };
  } catch (error) {
    console.error('Update product stock error:', error);
    return { success: false, error };
  }
};

exports.restoreProductStock = async (items) => {
  try {
    for (const item of items) {
      const { data: product } = await supabase
        .from('products')
        .select('available_quantity, order_count')
        .eq('id', item.product_id)
        .single();

      if (product) {
        await supabaseService
          .from('products')
          .update({
            available_quantity: product.available_quantity + item.quantity,
            order_count: Math.max(0, (product.order_count || 0) - 1),
            updated_at: new Date().toISOString()
          })
          .eq('id', item.product_id);
      }
    }

    return { success: true, error: null };
  } catch (error) {
    console.error('Restore product stock error:', error);
    return { success: false, error };
  }
};

exports.updateSellerStats = async (sellerId, amount) => {
  const { data: seller } = await supabase
    .from('seller_profiles')
    .select('total_sales, total_orders')
    .eq('id', sellerId)
    .single();

  if (seller) {
    await supabaseService
      .from('seller_profiles')
      .update({
        total_sales: (parseFloat(seller.total_sales) || 0) + amount,
        total_orders: (seller.total_orders || 0) + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', sellerId);
  }

  return { success: true, error: null };
};

exports.checkOrderOwnership = async (orderId, userId) => {
  const { data: order } = await supabase
    .from('orders')
    .select(`
      id,
      buyer:buyer_profiles!inner (user_id),
      seller:seller_profiles!inner (user_id)
    `)
    .eq('id', orderId)
    .single();

  if (!order) {
    return { isBuyer: false, isSeller: false, hasAccess: false };
  }

  const isBuyer = order.buyer.user_id === userId;
  const isSeller = order.seller.user_id === userId;

  return {
    isBuyer,
    isSeller,
    hasAccess: isBuyer || isSeller
  };
};

exports.getOrderStats = async (userId, role) => {
  const stats = {
    total_orders: 0,
    pending_orders: 0,
    confirmed_orders: 0,
    completed_orders: 0,
    cancelled_orders: 0
  };

  if (role === 'buyer') {
    stats.total_spent = 0;
  } else {
    stats.total_earned = 0;
  }

  try {
    let profileId;

    if (role === 'buyer') {
      const { data: profile } = await supabase
        .from('buyer_profiles')
        .select('id')
        .eq('user_id', userId)
        .single();
      profileId = profile?.id;
    } else {
      const { data: profile } = await supabase
        .from('seller_profiles')
        .select('id')
        .eq('user_id', userId)
        .single();
      profileId = profile?.id;
    }

    if (!profileId) return { data: stats, error: null };

    const profileField = role === 'buyer' ? 'buyer_id' : 'seller_id';

    const { data: orders } = await supabase
      .from('orders')
      .select('status, total_amount')
      .eq(profileField, profileId);

    if (orders) {
      stats.total_orders = orders.length;
      stats.pending_orders = orders.filter(o => o.status === 'pending').length;
      stats.confirmed_orders = orders.filter(o => o.status === 'confirmed').length;
      stats.completed_orders = orders.filter(o => o.status === 'completed').length;
      stats.cancelled_orders = orders.filter(o => o.status === 'cancelled').length;

      const completedOrders = orders.filter(o => o.status === 'completed');
      const totalAmount = completedOrders.reduce((sum, o) => sum + parseFloat(o.total_amount), 0);

      if (role === 'buyer') {
        stats.total_spent = parseFloat(totalAmount.toFixed(2));
      } else {
        stats.total_earned = parseFloat(totalAmount.toFixed(2));
      }
    }

    return { data: stats, error: null };

  } catch (error) {
    console.error('Get order stats error:', error);
    return { data: stats, error };
  }
};

exports.rateOrder = async (orderId, rating, comment) => {
  try {
    const { data, error } = await supabaseService
      .from('orders')
      .update({
        buyer_rating: rating,
        buyer_rating_comment: comment,
        buyer_rated_at: new Date().toISOString()
      })
      .eq('id', orderId)
      .select()
      .single();

    if (error) {
      console.error('Rate order error:', error);
      return { data: null, error };
    }

    // Get complete order details
    const { data: completeOrder } = await exports.getOrderById(orderId);

    return { data: completeOrder, error: null };
  } catch (error) {
    console.error('Rate order error:', error);
    return { data: null, error };
  }
};
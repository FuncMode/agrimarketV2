const { supabase, supabaseService } = require('../config/database');
const mapService = require('../services/mapService');

exports.getUserById = async (userId) => {
  try {
    if (!userId) {
      return { data: null, error: new Error('User ID is required') };
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, full_name, phone_number, role, status, created_at, verified_at, suspension_end, ban_reason, agreed_to_terms, agreed_at, updated_at')
      .eq('id', userId)
      .single();

    if (error || !user) {
      console.error('[getUserById] Error or no user:', error);
      return { data: null, error: error || new Error('User not found') };
    }

    // Fetch seller profile if user is a seller
    if (user.role === 'seller') {
      const { data: profile, error: profileError } = await supabase
        .from('seller_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (!profileError && profile) {
        user.seller_profile = profile;
      }
    }

    // Fetch buyer profile if user is a buyer
    if (user.role === 'buyer') {
      const { data: profile, error: profileError } = await supabase
        .from('buyer_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (!profileError && profile) {
        user.buyer_profile = profile;
      }
    }

    return { data: user, error: null };
  } catch (err) {
    console.error('[getUserById] Exception caught:', err);
    return { data: null, error: err };
  }
};

exports.getUserByEmail = async (email) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  return { data, error };
};

exports.updateUser = async (userId, updates) => {
  const allowedFields = ['full_name', 'phone_number'];
  const filteredUpdates = {};

  Object.keys(updates).forEach(key => {
    if (allowedFields.includes(key)) {
      filteredUpdates[key] = updates[key];
    }
  });

  filteredUpdates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseService
    .from('users')
    .update(filteredUpdates)
    .eq('id', userId)
    .select('id, email, full_name, phone_number, role, status, created_at')
    .single();

  return { data, error };
};

exports.updateSellerProfile = async (userId, updates) => {
  const allowedFields = ['municipality', 'farm_type', 'latitude', 'longitude'];
  const filteredUpdates = {};

  Object.keys(updates).forEach(key => {
    if (allowedFields.includes(key)) {
      filteredUpdates[key] = updates[key];
    }
  });

  filteredUpdates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseService
    .from('seller_profiles')
    .update(filteredUpdates)
    .eq('user_id', userId)
    .select('*')
    .single();

  return { data, error };
};

exports.updateBuyerProfile = async (userId, updates) => {
  const allowedFields = [
    'delivery_address',
    'delivery_latitude',
    'delivery_longitude',
    'municipality',
    'preferred_delivery_option'
  ];
  
  const filteredUpdates = {};

  Object.keys(updates).forEach(key => {
    if (allowedFields.includes(key)) {
      filteredUpdates[key] = updates[key];
    }
  });

  filteredUpdates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseService
    .from('buyer_profiles')
    .update(filteredUpdates)
    .eq('user_id', userId)
    .select('*')
    .single();

  return { data, error };
};

exports.getSellerProfile = async (sellerId) => {
  const { data, error } = await supabase
    .from('seller_profiles')
    .select(`
      *,
      users!inner (
        id,
        full_name,
        email,
        phone_number,
        status,
        verified_at,
        created_at
      )
    `)
    .eq('id', sellerId)
    .single();

  if (error || !data) {
    return { data: null, error: error || new Error('Seller not found') };
  }

  const { count: productCount } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('seller_id', sellerId)
    .eq('status', 'active');

  data.product_count = productCount || 0;

  return { data, error: null };
};

exports.getVerifiedSellers = async (filters = {}) => {
  const { municipality, farm_type, page = 1, limit = 20 } = filters;
  
  let query = supabase
    .from('seller_profiles')
    .select(`
      id,
      municipality,
      farm_type,
      latitude,
      longitude,
      total_sales,
      total_orders,
      rating,
      users!inner (
        id,
        full_name,
        status,
        verified_at
      )
    `, { count: 'exact' })
    .eq('users.status', 'verified');

  if (municipality) {
    query = query.eq('municipality', municipality);
  }

  if (farm_type) {
    query = query.eq('farm_type', farm_type);
  }

  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  const formattedData = data.map(seller => {
    
    // Use seller's coordinates, or fallback to municipality coordinates
    let latitude = seller.latitude ? parseFloat(seller.latitude) : null;
    let longitude = seller.longitude ? parseFloat(seller.longitude) : null;
    
    
    if (!latitude || !longitude) {
      const municipalityCoords = mapService.getMunicipalityCoordinates(seller.municipality);
      if (municipalityCoords) {
        latitude = municipalityCoords.latitude;
        longitude = municipalityCoords.longitude;
      }
    }
    
    const formatted = {
      id: seller.id,
      full_name: seller.users?.full_name || '',
      business_name: seller.business_name || (seller.users?.full_name + "'s Farm") || 'Farm',
      municipality: seller.municipality,
      farm_type: seller.farm_type,
      latitude: latitude,
      longitude: longitude,
      verified: seller.users?.status === 'verified',
      rating: parseFloat(seller.rating) || 0,
      total_sales: parseFloat(seller.total_sales) || 0,
      total_orders: seller.total_orders || 0
    };
    
    return formatted;
  });

  return { 
    data: formattedData, 
    error,
    count: count || 0,
    page: parseInt(page),
    limit: parseInt(limit),
    total_pages: count ? Math.ceil(count / limit) : 0
  };
};

exports.deleteUser = async (userId) => {
  const { data, error } = await supabaseService
    .from('users')
    .delete()
    .eq('id', userId)
    .select()
    .single();

  return { data, error };
};

exports.changeUserStatus = async (userId, status, metadata = {}) => {
  const updates = {
    status,
    updated_at: new Date().toISOString()
  };

  if (status === 'verified') {
    updates.verified_at = new Date().toISOString();
  }

  if (status === 'banned' && metadata.ban_reason) {
    updates.ban_reason = metadata.ban_reason;
  }

  if (status === 'suspended' && metadata.suspension_end) {
    updates.suspension_end = metadata.suspension_end;
  }

  const { data, error } = await supabaseService
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select('id, email, full_name, role, status, verified_at')
    .single();

  return { data, error };
};

exports.getUserStats = async (userId) => {
  try {
    if (!userId) {
      return { data: { total_orders: 0, total_products: 0, total_messages: 0, total_issues: 0 }, error: null };
    }

    const stats = {
      total_orders: 0,
      total_products: 0,
      total_messages: 0,
      total_issues: 0,
      completed_orders: 0,
      pending_orders: 0
    };

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return { data: stats, error: null };
    }

    if (user.role === 'seller') {
      const { data: profile, error: profileError } = await supabase
        .from('seller_profiles')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (!profileError && profile) {
        const { count: productCount, error: prodError } = await supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('seller_id', profile.id);

        const { count: orderCount, error: orderError } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('seller_id', profile.id);

        const { count: pendingCount, error: pendingError } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('seller_id', profile.id)
          .eq('status', 'pending');

        const { count: completedCount, error: completedError } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('seller_id', profile.id)
          .eq('status', 'completed');

        const { data: completedOrders, error: completedDataError } = await supabase
          .from('orders')
          .select('total_amount')
          .eq('seller_id', profile.id)
          .eq('status', 'completed');

        stats.total_products = !prodError && productCount ? productCount : 0;
        stats.total_orders = !orderError && orderCount ? orderCount : 0;
        stats.pending_orders = !pendingError && pendingCount ? pendingCount : 0;
        stats.completed_orders = !completedError && completedCount ? completedCount : 0;
        
        if (!completedDataError && completedOrders) {
          stats.total_sales = completedOrders.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
        }
      }
    }

    if (user.role === 'buyer') {
      const { data: profile, error: profileError } = await supabase
        .from('buyer_profiles')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (!profileError && profile) {
        const { count: orderCount, error: orderError } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('buyer_id', profile.id);

        const { count: completedCount, error: completedError } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('buyer_id', profile.id)
          .eq('status', 'completed');

        const { count: pendingCount, error: pendingError } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('buyer_id', profile.id)
          .eq('status', 'pending');

        stats.total_orders = !orderError && orderCount ? orderCount : 0;
        stats.completed_orders = !completedError && completedCount ? completedCount : 0;
        stats.pending_orders = !pendingError && pendingCount ? pendingCount : 0;
      }
    }

    const { count: messageCount, error: msgError } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('sender_id', userId);

    stats.total_messages = !msgError && messageCount ? messageCount : 0;

    return { data: stats, error: null };
  } catch (err) {
    return { 
      data: {
        total_orders: 0,
        total_products: 0,
        total_messages: 0,
        total_issues: 0,
        completed_orders: 0,
        pending_orders: 0
      },
      error: err 
    };
  }
};
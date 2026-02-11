// src\models\productModel.js
const { supabase, supabaseService } = require('../config/database');

exports.createProduct = async (productData) => {
  const { data, error } = await supabaseService
    .from('products')
    .insert([{
      seller_id: productData.seller_id,
      name: productData.name,
      description: productData.description || null,
      category: productData.category,
      price_per_unit: productData.price_per_unit,
      unit_type: productData.unit_type,
      available_quantity: productData.available_quantity,
      municipality: productData.municipality,
      photo_path: productData.photo_path || null,
      status: productData.status || 'active'
    }])
    .select()
    .single();

  return { data, error };
};

exports.getProductById = async (productId) => {
  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      seller:seller_profiles!inner (
        id,
        municipality,
        farm_type,
        total_sales,
        total_orders,
        rating,
        user:users!inner (
          id,
          full_name,
          phone_number,
          email,
          status,
          verified_at
        )
      )
    `)
    .eq('id', productId)
    .single();

  if (data) {
    // Override product's stored municipality with seller's current municipality
    if (data.seller && data.seller.municipality) {
      data.municipality = data.seller.municipality;
    }

    const { data: tags } = await supabase
      .from('product_tags')
      .select('tag')
      .eq('product_id', productId);
    
    data.tags = tags ? tags.map(t => t.tag) : [];
    
    // Ensure rating fields exist
    data.average_rating = data.average_rating || 0;
    data.total_reviews = data.total_reviews || 0;
  }

  return { data, error };
};

exports.getAllProducts = async (filters = {}) => {
  const {
    search,
    category,
    municipality,
    tags,
    min_price,
    max_price,
    sort_by = 'created_at',
    sort_order = 'desc',
    page = 1,
    limit = 20
  } = filters;

  let query = supabase
    .from('products')
    .select(`
      *,
      seller:seller_profiles!inner (
        id,
        municipality,
        farm_type,
        rating,
        user:users!inner (
          id,
          full_name,
          status
        )
      )
    `, { count: 'exact' })
    .eq('status', 'active')
    .eq('seller.user.status', 'verified'); 

  if (search) {
    query = query.ilike('name', `%${search}%`);
  }

  if (category) {
    query = query.eq('category', category);
  }

  if (municipality) {
    query = query.eq('seller.municipality', municipality);
  }

  if (min_price) {
    query = query.gte('price_per_unit', min_price);
  }

  if (max_price) {
    query = query.lte('price_per_unit', max_price);
  }

  const allowedSortFields = ['created_at', 'price_per_unit', 'name', 'view_count', 'order_count'];
  const sortField = allowedSortFields.includes(sort_by) ? sort_by : 'created_at';
  const ascending = sort_order === 'asc';
  
  query = query.order(sortField, { ascending });

  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (data) {
    // Override product's stored municipality with seller's current municipality
    data.forEach(product => {
      if (product.seller && product.seller.municipality) {
        product.municipality = product.seller.municipality;
      }
    });

    // Always fetch tags for all products, regardless of filter
    const productIds = data.map(p => p.id);
    const { data: productTags } = await supabase
      .from('product_tags')
      .select('product_id, tag')
      .in('product_id', productIds);

    data.forEach(product => {
      product.tags = productTags
        ? productTags.filter(pt => pt.product_id === product.id).map(pt => pt.tag)
        : [];
    });
  }

  if (tags && data) {
    const tagArray = Array.isArray(tags) ? tags : [tags];
    const filteredData = data.filter(product => 
      tagArray.some(tag => product.tags.includes(tag))
    );

    return { 
      data: filteredData, 
      error, 
      count: filteredData.length,
      page,
      limit,
      total_pages: Math.ceil(filteredData.length / limit)
    };
  }

  return { 
    data: data || [], 
    error, 
    count,
    page,
    limit,
    total_pages: count ? Math.ceil(count / limit) : 0
  };
};

exports.getSellerProducts = async (sellerId, filters = {}) => {
  const { status, category, page = 1, limit = 20 } = filters;

  let query = supabase
    .from('products')
    .select(`
      *,
      seller:seller_profiles!inner (
        id,
        municipality
      )
    `, { count: 'exact' })
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  if (category) {
    query = query.eq('category', category);
  }

  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (data) {
    // Override product's stored municipality with seller's current municipality
    data.forEach(product => {
      if (product.seller && product.seller.municipality) {
        product.municipality = product.seller.municipality;
      }
    });

    if (data.length > 0) {
      const productIds = data.map(p => p.id);
      const { data: productTags } = await supabase
        .from('product_tags')
        .select('product_id, tag')
        .in('product_id', productIds);

      data.forEach(product => {
        product.tags = productTags
          ? productTags.filter(pt => pt.product_id === product.id).map(pt => pt.tag)
          : [];
      });
    }
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

exports.updateProduct = async (productId, updates) => {
  const allowedFields = [
    'name',
    'description',
    'category',
    'price_per_unit',
    'unit_type',
    'available_quantity',
    'photo_path',
    'status'
  ];

  const filteredUpdates = {};
  Object.keys(updates).forEach(key => {
    if (allowedFields.includes(key) && updates[key] !== undefined) {
      filteredUpdates[key] = updates[key];
    }
  });

  filteredUpdates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseService
    .from('products')
    .update(filteredUpdates)
    .eq('id', productId)
    .select()
    .single();

  return { data, error };
};

exports.deleteProduct = async (productId) => {
  const { data, error } = await supabaseService
    .from('products')
    .delete()
    .eq('id', productId)
    .select()
    .single();

  return { data, error };
};

exports.incrementViewCount = async (productId) => {
  const { data, error } = await supabaseService
    .rpc('increment_view_count', { product_id: productId });

  return { data, error };
};

exports.addProductTags = async (productId, tags) => {
  const validTags = ['fresh', 'organic', 'farmed', 'wild_caught', 'recently_harvested', 'other'];
  
  const filteredTags = tags.filter(tag => validTags.includes(tag));
  
  if (filteredTags.length === 0) {
    return { data: [], error: null };
  }

  const tagRecords = filteredTags.map(tag => ({
    product_id: productId,
    tag
  }));

  const { data, error } = await supabaseService
    .from('product_tags')
    .insert(tagRecords)
    .select();

  return { data: data || [], error };
};

exports.removeProductTags = async (productId) => {
  const { data, error } = await supabaseService
    .from('product_tags')
    .delete()
    .eq('product_id', productId);

  return { data, error };
};

exports.updateProductTags = async (productId, tags) => {
  await exports.removeProductTags(productId);

  if (tags && tags.length > 0) {
    return exports.addProductTags(productId, tags);
  }

  return { data: [], error: null };
};

exports.isProductOwner = async (productId, userId) => {
  const { data, error } = await supabase
    .from('products')
    .select(`
      id,
      seller:seller_profiles!inner (
        user_id
      )
    `)
    .eq('id', productId)
    .single();

  if (error || !data) {
    return false;
  }

  return data.seller.user_id === userId;
};

exports.getProductStats = async (sellerId) => {
  const stats = {
    total_products: 0,
    active_products: 0,
    paused_products: 0,
    draft_products: 0,
    total_views: 0,
    total_orders: 0,
    total_sales: 0
  };

  try {

    const { data: products } = await supabase
      .from('products')
      .select('status, view_count, order_count')
      .eq('seller_id', sellerId);

    if (products) {
      stats.total_products = products.length;
      stats.active_products = products.filter(p => p.status === 'active').length;
      stats.paused_products = products.filter(p => p.status === 'paused').length;
      stats.draft_products = products.filter(p => p.status === 'draft').length;
      stats.total_views = products.reduce((sum, p) => sum + (p.view_count || 0), 0);
      stats.total_orders = products.reduce((sum, p) => sum + (p.order_count || 0), 0);
    }

    // Calculate total sales from completed/delivered orders
    const { data: orders } = await supabase
      .from('orders')
      .select('total_amount, status')
      .eq('seller_id', sellerId)
      .in('status', ['completed', 'delivered']);

    if (orders) {
      stats.total_sales = orders.reduce((sum, order) => sum + (parseFloat(order.total_amount) || 0), 0);
    }

    return { data: stats, error: null };

  } catch (error) {
    console.error('Get product stats error:', error);
    return { data: stats, error };
  }
};

// ============ Analytics Functions ============

exports.getSellerAnalytics = async (sellerId) => {
  try {
    // Get comprehensive analytics data
    const analytics = {
      overview: {
        total_products: 0,
        total_orders: 0,
        total_sales: 0,
        total_views: 0,
        avg_order_value: 0,
        conversion_rate: 0
      },
      recent_activity: {
        orders_last_7_days: 0,
        sales_last_7_days: 0,
        views_last_7_days: 0
      }
    };

    // Basic product stats
    const { data: products } = await supabase
      .from('products')
      .select('id, name, view_count, order_count, price')
      .eq('seller_id', sellerId);

    if (products) {
      analytics.overview.total_products = products.length;
      analytics.overview.total_views = products.reduce((sum, p) => sum + (p.view_count || 0), 0);
      analytics.overview.total_orders = products.reduce((sum, p) => sum + (p.order_count || 0), 0);
    }

    // Sales data
    const { data: orders } = await supabase
      .from('orders')
      .select('total_amount, created_at')
      .eq('seller_id', sellerId)
      .in('status', ['completed', 'delivered']);

    if (orders && orders.length > 0) {
      analytics.overview.total_sales = orders.reduce((sum, order) => sum + parseFloat(order.total_amount), 0);
      analytics.overview.avg_order_value = analytics.overview.total_sales / orders.length;

      // Recent activity (last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const recentOrders = orders.filter(order => new Date(order.created_at) >= new Date(sevenDaysAgo));
      
      analytics.recent_activity.orders_last_7_days = recentOrders.length;
      analytics.recent_activity.sales_last_7_days = recentOrders.reduce((sum, order) => sum + parseFloat(order.total_amount), 0);
    }

    // Conversion rate (orders / views)
    if (analytics.overview.total_views > 0) {
      analytics.overview.conversion_rate = (analytics.overview.total_orders / analytics.overview.total_views * 100);
    }

    return { data: analytics, error: null };

  } catch (error) {
    console.error('Get seller analytics error:', error);
    return { data: null, error };
  }
};

exports.getSalesOverTime = async (sellerId, period = 'last_30_days') => {
  try {
    let daysBack = 30;
    
    switch (period) {
      case 'last_7_days':
        daysBack = 7;
        break;
      case 'last_90_days':
        daysBack = 90;
        break;
      default:
        daysBack = 30;
    }

    const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data: orders } = await supabase
      .from('orders')
      .select('total_amount, created_at')
      .eq('seller_id', sellerId)
      .in('status', ['completed', 'delivered'])
      .gte('created_at', startDate)
      .order('created_at', { ascending: true });

    // Group by date
    const salesByDate = {};
    const dateRange = [];

    // Initialize all dates in range with 0
    for (let i = daysBack - 1; i >= 0; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      dateRange.push(date);
      salesByDate[date] = { sales: 0, orders: 0 };
    }

    // Fill in actual data
    if (orders) {
      orders.forEach(order => {
        const date = order.created_at.split('T')[0];
        if (salesByDate[date]) {
          salesByDate[date].sales += parseFloat(order.total_amount);
          salesByDate[date].orders += 1;
        }
      });
    }

    // Format for Chart.js
    const chartData = {
      labels: dateRange,
      datasets: [
        {
          label: 'Daily Sales (₱)',
          data: dateRange.map(date => salesByDate[date].sales),
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          tension: 0.1
        },
        {
          label: 'Daily Orders',
          data: dateRange.map(date => salesByDate[date].orders),
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          yAxisID: 'y1'
        }
      ]
    };

    return { data: chartData, error: null };

  } catch (error) {
    console.error('Get sales over time error:', error);
    return { data: null, error };
  }
};

exports.getTopProducts = async (sellerId, limit = 10, sortBy = 'sales') => {
  try {
    let selectQuery = 'id, name, price_per_unit, view_count, order_count';
    let orderQuery = 'view_count';

    // Determine sorting
    switch (sortBy) {
      case 'sales':
        orderQuery = 'order_count';
        break;
      case 'views':
        orderQuery = 'view_count';
        break;
      case 'orders':
        orderQuery = 'order_count';
        break;
    }

    const { data: products, error: productError } = await supabase
      .from('products')
      .select(selectQuery)
      .eq('seller_id', sellerId)
      .eq('status', 'active')
      .order(orderQuery, { ascending: false })
      .limit(parseInt(limit));

    if (productError) {
      console.error('Error fetching products:', productError);
      return { data: null, error: productError };
    }

    if (!products || products.length === 0) {
      // Return empty chart data structure instead of null
      return { 
        data: {
          products: [],
          chartData: {
            labels: [],
            datasets: [{
              label: 'No Data',
              data: [],
              backgroundColor: []
            }]
          }
        }, 
        error: null 
      };
    }

    // Get sales data for each product
    const productIds = products.map(p => p.id);
    const { data: orderItems, error: orderError } = await supabase
      .from('order_items')
      .select('product_id, quantity, price_per_unit')
      .in('product_id', productIds);

    if (orderError) {
      console.error('Error fetching order items:', orderError);
    }

    // Calculate total sales per product
    const productSales = {};
    if (orderItems && orderItems.length > 0) {
      orderItems.forEach(item => {
        if (!productSales[item.product_id]) {
          productSales[item.product_id] = 0;
        }
        productSales[item.product_id] += item.quantity * parseFloat(item.price_per_unit);
      });
    }

    // Add sales data to products
    const enrichedProducts = products.map(product => ({
      ...product,
      total_sales: productSales[product.id] || 0
    }));

    // Sort by selected criteria
    if (sortBy === 'sales') {
      enrichedProducts.sort((a, b) => b.total_sales - a.total_sales);
    }

    // Filter out products with no data for the selected criteria
    let filteredProducts = enrichedProducts;
    if (sortBy === 'sales') {
      filteredProducts = enrichedProducts.filter(p => p.total_sales > 0);
    } else if (sortBy === 'views') {
      filteredProducts = enrichedProducts.filter(p => (p.view_count || 0) > 0);
    } else if (sortBy === 'orders') {
      filteredProducts = enrichedProducts.filter(p => (p.order_count || 0) > 0);
    }

    // If no products have data, show all products anyway
    if (filteredProducts.length === 0) {
      filteredProducts = enrichedProducts.slice(0, Math.min(5, enrichedProducts.length));
    }

    // Format for charts
    const chartData = {
      labels: filteredProducts.map(p => p.name.length > 20 ? p.name.substring(0, 17) + '...' : p.name),
      datasets: [
        {
          label: sortBy === 'sales' ? 'Total Sales (₱)' : 
                 sortBy === 'views' ? 'Total Views' : 'Total Orders',
          data: filteredProducts.map(p => {
            switch (sortBy) {
              case 'sales':
                return p.total_sales;
              case 'views':
                return p.view_count || 0;
              case 'orders':
                return p.order_count || 0;
              default:
                return p.total_sales;
            }
          }),
          backgroundColor: [
            'rgba(34, 197, 94, 0.8)',
            'rgba(59, 130, 246, 0.8)',
            'rgba(249, 115, 22, 0.8)',
            'rgba(236, 72, 153, 0.8)',
            'rgba(168, 85, 247, 0.8)',
            'rgba(14, 165, 233, 0.8)',
            'rgba(245, 101, 101, 0.8)',
            'rgba(52, 211, 153, 0.8)',
            'rgba(251, 191, 36, 0.8)',
            'rgba(167, 139, 250, 0.8)'
          ].slice(0, filteredProducts.length),
        }
      ]
    };

    return { 
      data: {
        products: filteredProducts,
        chartData
      }, 
      error: null 
    };

  } catch (error) {
    console.error('Get top products error:', error);
    return { data: null, error };
  }
};
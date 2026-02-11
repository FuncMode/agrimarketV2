// src\controllers\adminController.js

const { AppError, asyncHandler } = require('../middleware/errorHandler');
const userModel = require('../models/userModel');
const adminLogModel = require('../models/adminLogModel');
const verificationModel = require('../models/verificationModel');
const issueModel = require('../models/issueModel');
const { supabase, supabaseService } = require('../config/database');
const notificationService = require('../services/notificationService');

exports.getDashboardStats = asyncHandler(async (req, res, next) => {
  const stats = {
    users: {
      total: 0,
      buyers: 0,
      sellers: 0,
      verified: 0,
      pending_verification: 0,
      suspended: 0,
      banned: 0
    },
    orders: {
      total: 0,
      pending: 0,
      completed: 0,
      cancelled: 0,
      total_revenue: 0
    },
    products: {
      total: 0,
      active: 0,
      paused: 0
    },
    issues: {
      total: 0,
      under_review: 0,
      resolved: 0
    }
  };

  try {
    const [usersResult, ordersResult, productsResult, issueStatsResult] = await Promise.all([
      supabase.from('users').select('role, status'),
      supabase.from('orders').select('status, total_amount'),
      supabase.from('products').select('status'),
      issueModel.getIssueStats()
    ]);

    const users = usersResult.data;
    if (users) {
      // Filter out admin users - only count buyers and sellers
      const nonAdminUsers = users.filter(u => u.role !== 'admin');
      stats.users.total = nonAdminUsers.length;
      stats.users.buyers = nonAdminUsers.filter(u => u.role === 'buyer').length;
      stats.users.sellers = nonAdminUsers.filter(u => u.role === 'seller').length;
      stats.users.verified = nonAdminUsers.filter(u => u.status === 'verified').length;
      stats.users.pending_verification = nonAdminUsers.filter(u => u.status === 'verification_pending').length;
      stats.users.suspended = nonAdminUsers.filter(u => u.status === 'suspended').length;
      stats.users.banned = nonAdminUsers.filter(u => u.status === 'banned').length;
    }

    const orders = ordersResult.data;
    if (orders) {
      stats.orders.total = orders.length;
      stats.orders.pending = orders.filter(o => o.status === 'pending').length;
      stats.orders.completed = orders.filter(o => o.status === 'completed').length;
      stats.orders.cancelled = orders.filter(o => o.status === 'cancelled').length;
      
      const completedOrders = orders.filter(o => o.status === 'completed');
      stats.orders.total_revenue = completedOrders.reduce(
        (sum, o) => sum + parseFloat(o.total_amount), 
        0
      );
    }

    const products = productsResult.data;
    if (products) {
      stats.products.total = products.length;
      stats.products.active = products.filter(p => p.status === 'active').length;
      stats.products.paused = products.filter(p => p.status === 'paused').length;
    }

    const issueStats = issueStatsResult.data;
    if (issueStats) {
      stats.issues = issueStats;
    }

    res.status(200).json({
      success: true,
      data: {
        stats
      }
    });

  } catch (error) {
    throw new AppError('Failed to fetch dashboard statistics.', 500);
  }
});

exports.getAllUsers = asyncHandler(async (req, res, next) => {
  const { role, status, search, page = 1, limit = 20 } = req.query;

  const offset = (page - 1) * limit;

  let query = supabase
    .from('users')
    .select('id, email, full_name, phone_number, role, status, created_at, verified_at, suspension_end, ban_reason, agreed_to_terms, agreed_at, updated_at', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (role) {
    query = query.eq('role', role);
  }

  if (status) {
    query = query.eq('status', status);
  }

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
  }

  query = query.range(offset, offset + parseInt(limit) - 1);

  const { data: users, error, count } = await query;

  if (error) {
    throw new AppError('Failed to fetch users.', 500);
  }

  res.status(200).json({
    success: true,
    results: users.length,
    total: count,
    page: parseInt(page),
    limit: parseInt(limit),
    total_pages: Math.ceil(count / limit),
    data: {
      users
    }
  });
});

exports.getUserDetails = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;

  const { data: user, error } = await userModel.getUserById(userId);

  if (error || !user) {
    throw new AppError('User not found.', 404);
  }

  const { data: logs } = await adminLogModel.getUserLogs(userId, { limit: 10 });

  let orderCount = 0;
  if (user.role === 'buyer') {
    const { count } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('buyer_id', user.buyer_profile?.id);
    orderCount = count || 0;
  } else if (user.role === 'seller') {
    const { count } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('seller_id', user.seller_profile?.id);
    orderCount = count || 0;
  }

  res.status(200).json({
    success: true,
    data: {
      user,
      order_count: orderCount,
      recent_logs: logs || []
    }
  });
});

exports.suspendUser = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const adminId = req.user.id;
  const { suspension_days, reason } = req.body;

  if (!reason) {
    throw new AppError('Suspension reason is required.', 400);
  }

  const { data: user } = await userModel.getUserById(userId);
  if (!user) {
    throw new AppError('User not found.', 404);
  }

  if (user.role === 'admin') {
    throw new AppError('Cannot suspend admin users.', 400);
  }

  const suspensionEnd = new Date();
  suspensionEnd.setDate(suspensionEnd.getDate() + (suspension_days || 7));

  const { data, error } = await userModel.changeUserStatus(
    userId,
    'suspended',
    { suspension_end: suspensionEnd.toISOString() }
  );

  if (error) {
    throw new AppError('Failed to suspend user.', 500);
  }

  await adminLogModel.createLog({
    admin_id: adminId,
    action_type: 'USER_SUSPENDED',
    action_description: `Suspended user ${user.full_name} for ${suspension_days || 7} days. Reason: ${reason}`,
    target_user_id: userId,
    ip_address: req.ip
  });

  await notificationService.createNotification({
    user_id: userId,
    title: 'Account Suspended',
    message: `Your account has been suspended for ${suspension_days || 7} days. Reason: ${reason}. Your account will be automatically reinstated on the suspension end date.`,
    type: 'user_suspended',
    reference_id: userId
  });

  res.status(200).json({
    success: true,
    message: `User suspended for ${suspension_days || 7} days.`,
    data: {
      user: data
    }
  });
});

exports.banUser = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const adminId = req.user.id;
  const { reason } = req.body;

  if (!reason) {
    throw new AppError('Ban reason is required.', 400);
  }

  const { data: user } = await userModel.getUserById(userId);
  if (!user) {
    throw new AppError('User not found.', 404);
  }

  if (user.role === 'admin') {
    throw new AppError('Cannot ban admin users.', 400);
  }

  const { data, error } = await userModel.changeUserStatus(
    userId,
    'banned',
    { ban_reason: reason }
  );

  if (error) {
    throw new AppError('Failed to ban user.', 500);
  }

  await adminLogModel.createLog({
    admin_id: adminId,
    action_type: 'USER_BANNED',
    action_description: `Banned user ${user.full_name}. Reason: ${reason}`,
    target_user_id: userId,
    ip_address: req.ip
  });

  await notificationService.createNotification({
    user_id: userId,
    title: 'Account Banned',
    message: `Your account has been permanently banned. Reason: ${reason}. If you believe this is a mistake, please contact our support team.`,
    type: 'user_banned',
    reference_id: userId
  });

  res.status(200).json({
    success: true,
    message: 'User banned successfully.',
    data: {
      user: data
    }
  });
});

exports.reinstateUser = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const adminId = req.user.id;

  const { data: user } = await userModel.getUserById(userId);
  if (!user) {
    throw new AppError('User not found.', 404);
  }

  if (!['suspended', 'banned'].includes(user.status)) {
    throw new AppError('User is not suspended or banned.', 400);
  }

  const previousStatus = user.status;
  const newStatus = user.verified_at ? 'verified' : 'unverified';

  const { data, error } = await userModel.changeUserStatus(
    userId,
    newStatus,
    { suspension_end: null }
  );

  if (error) {
    throw new AppError('Failed to reinstate user.', 500);
  }

  await adminLogModel.createLog({
    admin_id: adminId,
    action_type: 'USER_REINSTATED',
    action_description: `Reinstated user ${user.full_name} from ${previousStatus} to ${newStatus}`,
    target_user_id: userId,
    ip_address: req.ip
  });

  const reinstatementMessage = previousStatus === 'suspended'
    ? 'Your account suspension has been lifted. Your account is now active.'
    : 'Your account ban has been removed. Your account is now active.';

  await notificationService.createNotification({
    user_id: userId,
    title: 'Account Reinstated',
    message: reinstatementMessage,
    type: 'user_reinstated',
    reference_id: userId
  });

  res.status(200).json({
    success: true,
    message: 'User reinstated successfully.',
    data: {
      user: data
    }
  });
});

exports.deleteUser = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const adminId = req.user.id;
  const { reason } = req.body;

  const { data: user } = await userModel.getUserById(userId);
  if (!user) {
    throw new AppError('User not found.', 404);
  }

  if (user.role === 'admin') {
    throw new AppError('Cannot delete admin users.', 400);
  }

  let hasActiveOrders = false;
  if (user.role === 'buyer') {
    const { count } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('buyer_id', user.buyer_profile?.id)
      .in('status', ['pending', 'confirmed', 'ready']);
    hasActiveOrders = count > 0;
  } else if (user.role === 'seller') {
    const { count } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('seller_id', user.seller_profile?.id)
      .in('status', ['pending', 'confirmed', 'ready']);
    hasActiveOrders = count > 0;
  }

  if (hasActiveOrders) {
    throw new AppError('Cannot delete user with active orders. Please complete or cancel all orders first.', 400);
  }

  const { error } = await userModel.deleteUser(userId);

  if (error) {
    throw new AppError('Failed to delete user.', 500);
  }

  await adminLogModel.createLog({
    admin_id: adminId,
    action_type: 'USER_DELETED',
    action_description: `Deleted user ${user.full_name}. Reason: ${reason || 'Not provided'}`,
    target_user_id: userId,
    ip_address: req.ip
  });

  res.status(200).json({
    success: true,
    message: 'User deleted successfully.'
  });
});

exports.getSystemLogs = asyncHandler(async (req, res, next) => {
  const {
    action_type,
    admin_id,
    target_user_id,
    date_from,
    date_to,
    page = 1,
    limit = 50
  } = req.query;

  const filters = {
    page: parseInt(page),
    limit: parseInt(limit)
  };

  if (action_type) filters.action_type = action_type;
  if (admin_id) filters.admin_id = admin_id;
  if (target_user_id) filters.target_user_id = target_user_id;
  if (date_from) filters.date_from = date_from;
  if (date_to) filters.date_to = date_to;

  const { data: logs, error, count, total_pages } = await adminLogModel.getAllLogs(filters);

  if (error) {
    throw new AppError('Failed to fetch logs.', 500);
  }

  res.status(200).json({
    success: true,
    results: logs.length,
    total: count,
    page: parseInt(page),
    limit: parseInt(limit),
    total_pages,
    data: {
      logs
    }
  });
});

exports.getAdminStats = asyncHandler(async (req, res, next) => {
  const adminId = req.user.id;

  const { data: myLogs } = await adminLogModel.getAdminLogs(adminId, { limit: 10 });
  const { data: logStats } = await adminLogModel.getLogStats({
    date_from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() // Last 30 days
  });

  res.status(200).json({
    success: true,
    data: {
      recent_actions: myLogs || [],
      stats: logStats
    }
  });
});

exports.getSocketConnections = asyncHandler(async (req, res, next) => {
  const socketService = req.app.get('socketService');
  
  if (!socketService) {
    return res.status(200).json({
      success: true,
      data: {
        connected: false,
        message: 'Socket service not available',
        connections: [],
        total_users: 0,
        total_connections: 0
      }
    });
  }

  const connectedUsers = socketService.getConnectedUsers ? socketService.getConnectedUsers() : [];
  const userConnections = socketService.userConnections || {};
  
  const connections = connectedUsers.map(userId => ({
    user_id: userId,
    connection_count: userConnections[userId]?.length || 0,
    socket_ids: userConnections[userId] || []
  }));

  const totalConnections = Object.values(userConnections).reduce(
    (sum, socketIds) => sum + (Array.isArray(socketIds) ? socketIds.length : 0),
    0
  );

  res.status(200).json({
    success: true,
    data: {
      connected: true,
      total_users: connectedUsers.length,
      total_connections: totalConnections,
      connections
    }
  });
});

exports.getIPBlockingStats = asyncHandler(async (req, res, next) => {
  const { ipBlockingService } = require('../middleware/ipBlockingMiddleware');
  
  const stats = ipBlockingService.getStats();
  
  res.status(200).json({
    success: true,
    data: {
      ip_blocking: stats
    }
  });
});

exports.getDatabaseStats = asyncHandler(async (req, res, next) => {
  const dbMonitor = require('../utils/dbMonitor');
  
  const stats = dbMonitor.getStats();
  const healthCheck = await dbMonitor.checkConnection();
  
  res.status(200).json({
    success: true,
    data: {
      database: {
        ...stats,
        current_status: healthCheck.healthy ? 'healthy' : 'unhealthy',
        last_check_duration_ms: healthCheck.duration || 0
      }
    }
  });
});

module.exports = exports;
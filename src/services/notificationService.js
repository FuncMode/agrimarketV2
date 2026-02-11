// src\services\notificationService.js

const { supabase, supabaseService } = require('../config/database');

let socketServiceInstance = null;

exports.setSocketService = (socketService) => {
  socketServiceInstance = socketService;
};

exports.createNotification = async (notificationData) => {
  try {
    const { data, error } = await supabaseService
      .from('notifications')
      .insert([{
        user_id: notificationData.user_id,
        title: notificationData.title,
        message: notificationData.message,
        type: notificationData.type,
        reference_id: notificationData.reference_id || null
      }])
      .select()
      .single();

    if (error) {
      console.error('Failed to create notification:', error);
      return { success: false, error };
    }

    let socketSent = false;
    let socketError = null;
    
    if (socketServiceInstance && socketServiceInstance.notifyUser) {
      try {
        const isConnected = socketServiceInstance.isUserConnected && 
          socketServiceInstance.isUserConnected(notificationData.user_id);
        
        if (isConnected) {
          const sent = socketServiceInstance.notifyUser(notificationData.user_id, {
            id: data.id,
            title: data.title,
            message: data.message,
            type: data.type,
            reference_id: data.reference_id,
            is_read: false,
            created_at: data.created_at
          });
          if (sent) {
            socketSent = true;
          }
        } else {
        }
      } catch (error) {
        socketError = error.message;
        console.error('Failed to send real-time notification:', error);
      }
    } else {
    }

    return { 
      success: true, 
      data,
      socket: {
        sent: socketSent,
        connected: socketServiceInstance && socketServiceInstance.isUserConnected && 
          socketServiceInstance.isUserConnected(notificationData.user_id) || false,
        error: socketError
      }
    };

  } catch (error) {
    console.error('Notification creation error:', error);
    return { success: false, error: error.message };
  }
};

exports.sendOrderNotification = async (userId, order, type) => {
  const notifications = {
    'order_placed': {
      title: 'Order Placed',
      message: `Your order ${order.order_number} has been placed successfully.`
    },
    'order_confirmed': {
      title: 'Order Confirmed',
      message: `Your order ${order.order_number} has been confirmed by the seller.`
    },
    'order_ready': {
      title: 'Order Ready',
      message: `Your order ${order.order_number} is ready for ${order.delivery_option}.`
    },
    'order_completed': {
      title: 'Order Completed',
      message: `Your order ${order.order_number} has been completed. Thank you!`
    },
    'order_cancelled': {
      title: 'Order Cancelled',
      message: `Order ${order.order_number} has been cancelled.`
    },
    'new_order': {
      title: 'New Order Received',
      message: `You have received a new order: ${order.order_number}`
    }
  };

  const notification = notifications[type];
  
  if (!notification) {
    return { success: false, error: 'Invalid notification type' };
  }

  return await exports.createNotification({
    user_id: userId,
    title: notification.title,
    message: notification.message,
    type: 'order',
    reference_id: order.id
  });
};

exports.sendMessageNotification = async (recipientId, sender, orderNumber) => {
  return await exports.createNotification({
    user_id: recipientId,
    title: 'New Message',
    message: `You have a new message from ${sender.full_name} about order ${orderNumber}.`,
    type: 'message',
    reference_id: null
  });
};

exports.sendVerificationNotification = async (userId, status) => {
  const notifications = {
    'approved': {
      title: 'Account Verified',
      message: 'Congratulations! Your account has been verified. You can now access all features.'
    },
    'rejected': {
      title: 'Verification Required',
      message: 'Your verification was not approved. Please submit new documents.'
    },
    'more_evidence': {
      title: 'Additional Evidence Needed',
      message: 'Please provide additional verification documents.'
    }
  };

  const notification = notifications[status];

  if (!notification) {
    return { success: false, error: 'Invalid verification status' };
  }

  return await exports.createNotification({
    user_id: userId,
    title: notification.title,
    message: notification.message,
    type: 'verification',
    reference_id: null
  });
};

exports.sendIssueNotification = async (userId, issue, type, customMessage = null) => {
  const notifications = {
    'issue_created': {
      title: 'Issue Report Received',
      message: `Your issue report has been received and is under review.`
    },
    'issue_resolved': {
      title: 'Issue Resolved',
      message: customMessage || `Your issue report has been resolved.`
    },
    'issue_rejected': {
      title: 'Issue Rejected',
      message: customMessage || `Your issue report has been reviewed.`
    }
  };

  const notification = notifications[type];

  if (!notification) {
    return { success: false, error: 'Invalid issue notification type' };
  }

  return await exports.createNotification({
    user_id: userId,
    title: notification.title,
    message: notification.message,
    type: 'issue',
    reference_id: issue.id
  });
};

exports.sendSystemNotification = async (userId, title, message) => {
  return await exports.createNotification({
    user_id: userId,
    title,
    message,
    type: 'system',
    reference_id: null
  });
};

exports.getUserNotifications = async (userId, filters = {}) => {
  try {
    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (filters.is_read !== undefined) {
      query = query.eq('is_read', filters.is_read);
    }

    if (filters.type) {
      query = query.eq('type', filters.type);
    }

    if (filters.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 20) - 1);
    }

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;

    if (error) {
      return { success: false, error };
    }

    return { success: true, data };

  } catch (error) {
    console.error('Get notifications error:', error);
    return { success: false, error: error.message };
  }
};

exports.markAsRead = async (notificationId, userId) => {
  try {
    const { data, error } = await supabaseService
      .from('notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq('id', notificationId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      return { success: false, error };
    }

    return { success: true, data };

  } catch (error) {
    console.error('Mark as read error:', error);
    return { success: false, error: error.message };
  }
};

exports.markAllAsRead = async (userId) => {
  try {
    const { data, error } = await supabaseService
      .from('notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('is_read', false)
      .select();

    if (error) {
      return { success: false, error };
    }

    return { success: true, count: data ? data.length : 0, data };

  } catch (error) {
    console.error('Mark all as read error:', error);
    return { success: false, error: error.message };
  }
};

exports.deleteNotification = async (notificationId, userId) => {
  try {
    const { data, error } = await supabaseService
      .from('notifications')
      .delete()
      .eq('id', notificationId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      return { success: false, error };
    }

    return { success: true, data };

  } catch (error) {
    console.error('Delete notification error:', error);
    return { success: false, error: error.message };
  }
};

exports.getUnreadCount = async (userId) => {
  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) {
      return { success: false, error };
    }

    return { success: true, count: count || 0 };

  } catch (error) {
    console.error('Get unread count error:', error);
    return { success: false, error: error.message };
  }
};

exports.deleteOldNotifications = async (userId, daysOld = 30) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const { data, error } = await supabaseService
      .from('notifications')
      .delete()
      .eq('user_id', userId)
      .eq('is_read', true)
      .lt('created_at', cutoffDate.toISOString());

    if (error) {
      return { success: false, error };
    }

    return { success: true, data };

  } catch (error) {
    console.error('Delete old notifications error:', error);
    return { success: false, error: error.message };
  }
};

exports.broadcastNotification = async (userIds, title, message, type = 'system') => {
  try {
    const notifications = userIds.map(userId => ({
      user_id: userId,
      title,
      message,
      type,
      reference_id: null
    }));

    const { data, error } = await supabaseService
      .from('notifications')
      .insert(notifications)
      .select();

    if (error) {
      return { success: false, error };
    }

    return { success: true, data };

  } catch (error) {
    console.error('Broadcast notification error:', error);
    return { success: false, error: error.message };
  }
};

module.exports = exports;
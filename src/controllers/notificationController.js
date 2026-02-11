// src\controllers\notificationController.js

const { AppError, asyncHandler } = require('../middleware/errorHandler');
const notificationService = require('../services/notificationService');
const emailService = require('../services/emailService');
const { supabase } = require('../config/database');

exports.getMyNotifications = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { is_read, limit = 20, offset = 0 } = req.query;

  const filters = {};
  if (is_read !== undefined) {
    filters.is_read = is_read === 'true';
  }
  filters.limit = parseInt(limit);
  filters.offset = parseInt(offset);

  const { success, data, error } = await notificationService.getUserNotifications(userId, filters);

  if (!success) {
    throw new AppError('Failed to fetch notifications.', 500);
  }

  res.status(200).json({
    success: true,
    results: data.length,
    data: {
      notifications: data
    }
  });
});

exports.markNotificationAsRead = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { notificationId } = req.params;

  const { success, data, error } = await notificationService.markAsRead(notificationId, userId);

  if (!success) {
    throw new AppError('Failed to mark notification as read.', 500);
  }

  res.status(200).json({
    success: true,
    message: 'Notification marked as read.',
    data: {
      notification: data
    }
  });
});


exports.markAllNotificationsAsRead = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;

  const { success, count, error } = await notificationService.markAllAsRead(userId);

  if (!success) {
    throw new AppError('Failed to mark notifications as read.', 500);
  }

  res.status(200).json({
    success: true,
    message: `Marked ${count} notifications as read.`,
    data: {
      updated: count
    }
  });
});

exports.deleteNotification = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { notificationId } = req.params;

  const { success, error } = await notificationService.deleteNotification(notificationId, userId);

  if (!success) {
    throw new AppError('Failed to delete notification.', 500);
  }

  res.status(200).json({
    success: true,
    message: 'Notification deleted.'
  });
});


exports.getUnreadCount = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;

  const { success, count, error } = await notificationService.getUnreadCount(userId);

  if (!success) {
    throw new AppError('Failed to fetch unread count.', 500);
  }

  res.status(200).json({
    success: true,
    data: {
      unread_count: count
    }
  });
});

exports.testNotification = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { email } = req.body || req.query;

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, email, full_name')
    .eq('id', userId)
    .single();

  if (userError || !user) {
    throw new AppError('User not found.', 404);
  }

  const testEmail = email || user.email;

  const testNotification = {
    user_id: userId,
    title: 'Test Notification',
    message: 'This is a test notification to verify the notification system is working correctly. If you see this, the notification system is functioning properly!',
    type: 'system',
    reference_id: null
  };

  const { success: notifSuccess, data: notification, socket: socketInfo, error: notifError } = 
    await notificationService.createNotification(testNotification);

  if (!notifSuccess) {
    throw new AppError('Failed to create notification.', 500);
  }

  let emailResult = null;
  try {
    emailResult = await emailService.sendTestNotificationEmail(
      { ...user, email: testEmail },
      notification
    );
  } catch (emailError) {
    console.error('Email send error:', emailError);
  }

  const socketService = req.app.get('socketService');
  const socketConnected = socketInfo?.connected || false;
  const socketSent = socketInfo?.sent || false;

  res.status(200).json({
    success: true,
    message: 'Test notification sent successfully!',
    data: {
      notification: {
        id: notification.id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        created_at: notification.created_at
      },
      email: {
        sent: emailResult?.success || false,
        to: testEmail,
        message: emailResult?.message || emailResult?.error || 'Email service not configured'
      },
      socket: {
        connected: socketConnected,
        sent: socketSent,
        message: socketSent 
          ? 'Real-time notification sent via Socket.io' 
          : socketConnected 
            ? 'User connected but notification not sent (check server logs)'
            : 'User not connected to Socket.io (notification saved in database)',
        socketId: socketService?.userConnections?.[userId] || null,
        error: socketInfo?.error || null
      },
      summary: {
        database: 'Notification saved in database',
        socket: socketSent ? 'Real-time notification sent' : socketConnected ? 'Connected but not sent' : 'User not connected',
        email: emailResult?.success ? 'Email sent' : 'Email not sent'
      },
      instructions: socketConnected ? null : {
        message: 'To receive real-time notifications, connect to Socket.io:',
        steps: [
          '1. Connect to WebSocket: ws://localhost:3000 (or your server URL)',
          '2. Authenticate with your JWT token in handshake.auth.token',
          '3. Once connected, notifications will be sent in real-time',
          '4. Listen for "notification" event on the socket'
        ]
      }
    }
  });
});

// src\controllers\messageController.js

const { AppError, asyncHandler } = require('../middleware/errorHandler');
const messageModel = require('../models/messageModel');
const orderModel = require('../models/orderModel');
const { uploadFile, BUCKETS } = require('../config/storage');
const notificationService = require('../services/notificationService');
const emailService = require('../services/emailService');

exports.sendMessage = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { order_id, message_text } = req.body;

  if (!message_text || message_text.trim().length === 0) {
    throw new AppError('Message text is required.', 400);
  }

  const ownership = await orderModel.checkOrderOwnership(order_id, userId);
  if (!ownership.hasAccess) {
    throw new AppError('You do not have access to this order.', 403);
  }

  const { data: order } = await orderModel.getOrderById(order_id);
  if (!order) {
    throw new AppError('Order not found.', 404);
  }

  if (order.status === 'cancelled') {
    throw new AppError('Cannot send messages to cancelled orders.', 400);
  }

  let attachmentPath = null;
  let messageType = 'text';

  if (req.file) {
    const timestamp = Date.now();
    const fileName = `${order_id}/${timestamp}_${req.file.originalname}`;
    
    const uploadResult = await uploadFile(
      BUCKETS.MESSAGE_ATTACHMENTS,
      fileName,
      req.file.buffer,
      req.file.mimetype
    );

    if (!uploadResult.success) {
      throw new AppError('Failed to upload attachment.', 500);
    }

    attachmentPath = uploadResult.data.fullPath;
    messageType = req.file.mimetype.startsWith('image/') ? 'image' : 'file';
  }

  const { data: message, error } = await messageModel.sendMessage({
    order_id,
    sender_id: userId,
    message_text: message_text.trim(),
    message_type: messageType,
    attachment_path: attachmentPath
  });

  if (error) {
    throw new AppError('Failed to send message.', 500);
  }

  const { data: messages } = await messageModel.getOrderMessages(order_id);
  const completeMessage = messages.find(m => m.id === message.id);

  const socketService = req.app.get('socketService');
  if (socketService) {
    socketService.broadcastNewMessage(order_id, completeMessage);
  }

  // Send notification to the recipient (the other party in the order)
  const isBuyer = order.buyer?.user?.id === userId;
  const recipientId = isBuyer ? order.seller?.user?.id : order.buyer?.user?.id;
  const senderName = req.user.full_name || 'Someone';
  
  try {
    await notificationService.createNotification({
      user_id: recipientId,
      title: 'New Message',
      message: `${senderName} sent you a message on Order ${order.order_number}`,
      type: 'new_message',
      reference_id: order_id
    });

    const recipientProfile = isBuyer ? order.seller : order.buyer;
    const recipientEmail = recipientProfile?.user?.email;
    
    if (recipientEmail) {
      const recipientData = {
        full_name: recipientProfile?.user?.full_name || 'User',
        email: recipientEmail
      };
      await emailService.sendNewMessageEmail(recipientData, req.user, order.order_number);
    }
  } catch (notifError) {
    console.error('Failed to send message notification:', notifError.message);
  }

  res.status(201).json({
    success: true,
    message: 'Message sent!',
    data: {
      message: completeMessage
    }
  });

});

exports.getOrderMessages = asyncHandler(async (req, res, next) => {
  const { orderId } = req.params;
  const userId = req.user.id;
  const { limit = 50, offset = 0 } = req.query;

  const ownership = await orderModel.checkOrderOwnership(orderId, userId);
  if (!ownership.hasAccess) {
    throw new AppError('You do not have access to this order.', 403);
  }

  const parsedLimit = Math.min(parseInt(limit) || 50, 100); // Max 100 messages at once
  const parsedOffset = parseInt(offset) || 0;

  const { data: messages, error } = await messageModel.getOrderMessages(
    orderId,
    parsedLimit,
    parsedOffset
  );

  if (error) {
    throw new AppError('Failed to fetch messages.', 500);
  }

  const { count: unreadCount } = await messageModel.getUnreadCount(orderId, userId);

  // Get order details to include buyer and seller IDs, and order status
  const { data: order } = await orderModel.getOrderById(orderId);
  const buyerId = order?.buyer_id;
  const sellerId = order?.seller_id;
  const buyerName = order?.buyer_name;
  const sellerName = order?.seller_name;
  const orderStatus = order?.status;

  res.status(200).json({
    success: true,
    results: messages.length,
    pagination: {
      limit: parsedLimit,
      offset: parsedOffset,
      has_more: messages.length === parsedLimit
    },
    data: {
      messages,
      unread_count: unreadCount,
      user_role: ownership.isBuyer ? 'buyer' : 'seller',
      buyer_id: buyerId,
      seller_id: sellerId,
      buyer_name: buyerName,
      seller_name: sellerName,
      order_status: orderStatus
    }
  });
});

exports.markAsRead = asyncHandler(async (req, res, next) => {
  const { orderId } = req.params;
  const userId = req.user.id;

  const ownership = await orderModel.checkOrderOwnership(orderId, userId);
  if (!ownership.hasAccess) {
    throw new AppError('You do not have access to this order.', 403);
  }

  const { data, error } = await messageModel.markAsRead(orderId, userId);

  if (error) {
    console.error('Error marking messages as read:', error);
    throw new AppError('Failed to mark messages as read.', 500);
  }

  if (data && data.length > 0) {
    const socketService = req.app.get('socketService');
    if (socketService) {
      data.forEach(message => {
        socketService.broadcastMessageRead(orderId, message.id, userId);
      });
    }
  }

  res.status(200).json({
    success: true,
    message: 'Messages marked as read.',
    data: {
      marked_count: data?.length || 0,
      messages: data || []
    }
  });
});

exports.getConversations = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const role = req.user.role;

  if (!['buyer', 'seller'].includes(role)) {
    throw new AppError('Invalid user role.', 400);
  }

  const { data: conversations, error } = await messageModel.getUserConversations(userId, role);

  if (error) {
    throw new AppError('Failed to fetch conversations.', 500);
  }

  const { count: totalUnread } = await messageModel.getTotalUnreadCount(userId);

  res.status(200).json({
    success: true,
    results: conversations.length,
    data: {
      conversations,
      total_unread: totalUnread
    }
  });
});

exports.deleteMessage = asyncHandler(async (req, res, next) => {
  const { messageId } = req.params;
  const userId = req.user.id;

  const isSender = await messageModel.isMessageSender(messageId, userId);
  if (!isSender) {
    throw new AppError('You can only delete your own messages.', 403);
  }

  const { error } = await messageModel.deleteMessage(messageId);

  if (error) {
    throw new AppError('Failed to delete message.', 500);
  }

  res.status(200).json({
    success: true,
    message: 'Message deleted successfully.'
  });

});


exports.getUnreadCount = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;

  const { count, error } = await messageModel.getTotalUnreadCount(userId);

  if (error) {
    throw new AppError('Failed to get unread count.', 500);
  }

  res.status(200).json({
    success: true,
    data: {
      unread_count: count
    }
  });
});
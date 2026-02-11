// src\services\socketService.js
const jwt = require('jsonwebtoken');

module.exports = (io) => {

  const userConnections = {};
  const orderConversations = {};

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      
      if (!token) {
        console.error('Socket connection rejected: No token provided');
        return next(new Error('Authentication error: No token provided'));
      }

      if (!process.env.JWT_SECRET) {
        console.error('Socket connection rejected: JWT_SECRET not configured');
        return next(new Error('Authentication error: JWT_SECRET is required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      socket.userRole = decoded.app_metadata?.role || 'user';
      next();
    } catch (error) {
      console.error(`Socket authentication failed: ${error.message}`);
      next(new Error(`Authentication error: ${error.message}`));
    }
  });

  io.on('connection', (socket) => {
    const isFirstConnection = !userConnections[socket.userId] || userConnections[socket.userId].length === 0;
    
    if (isFirstConnection) {
      userConnections[socket.userId] = [];
      // First connection for this user - broadcast user:online event to all clients
      io.emit('user:online', { userId: socket.userId });
    }
    userConnections[socket.userId].push(socket.id);

    // Send the current list of online users to the newly connected client
    const currentOnlineUsers = Object.keys(userConnections).filter(userId => userConnections[userId].length > 0);
    
    // Emit both events for compatibility
    socket.emit('connected', {
      userId: socket.userId,
      socketId: socket.id,
      message: 'Successfully connected to Socket.io',
      timestamp: new Date().toISOString(),
      onlineUsers: currentOnlineUsers
    });
    
    // Also emit the event that the frontend is explicitly listening for
    socket.emit('users:online:initial', {
      onlineUsers: currentOnlineUsers
    });

    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date().toISOString() });
    });

    socket.on('check_connection', () => {
      socket.emit('connection_status', {
        connected: true,
        userId: socket.userId,
        socketId: socket.id,
        totalConnections: userConnections[socket.userId]?.length || 0,
        timestamp: new Date().toISOString()
      });
    });

    // Note: users:online:initial is sent automatically on connection (see above)
    // No need for explicit request handling

    socket.on('join_conversation', (data) => {
      const { orderId } = data;

      if (!orderId) {
        socket.emit('error', { message: 'Order ID is required' });
        return;
      }

      socket.join(`order_${orderId}`);

      if (!orderConversations[orderId]) {
        orderConversations[orderId] = [];
      }
      orderConversations[orderId].push(socket.id);

      // Notify all users in the conversation
      io.to(`order_${orderId}`).emit('user_joined', {
        userId: socket.userId,
        orderId,
        timestamp: new Date().toISOString()
      });
      
      console.log(`User ${socket.userId} joined conversation order_${orderId}`);
    });

    socket.on('leave_conversation', (data) => {
      const { orderId } = data;

      if (!orderId) return;

      socket.leave(`order_${orderId}`);

      if (orderConversations[orderId]) {
        orderConversations[orderId] = orderConversations[orderId].filter(s => s !== socket.id);
        
        if (orderConversations[orderId].length === 0) {
          delete orderConversations[orderId];
        }
      }

      io.to(`order_${orderId}`).emit('user_left', {
        userId: socket.userId,
        orderId,
        timestamp: new Date().toISOString()
      });
    });

    socket.on('new_message', (data) => {
      const { orderId, message, messageId, attachmentPath, messageType } = data;

      if (!orderId || !message) {
        socket.emit('error', { message: 'Order ID and message text are required' });
        return;
      }

      const messageData = {
        id: messageId,
        order_id: orderId,
        sender_id: socket.userId,
        message_text: message,
        message_type: messageType || 'text',
        attachment_path: attachmentPath || null,
        is_read: false,
        created_at: new Date().toISOString()
      };

      io.to(`order_${orderId}`).emit('message_received', messageData);
    });

    socket.on('message_read', (data) => {
      const { orderId, messageId } = data;

      if (!orderId || !messageId) {
        socket.emit('error', { message: 'Order ID and message ID are required' });
        return;
      }

      io.to(`order_${orderId}`).emit('message_read_receipt', {
        messageId,
        orderId,
        userId: socket.userId,
        readAt: new Date().toISOString()
      });
    });


    socket.on('user_typing', (data) => {
      const { orderId, isTyping } = data;

      if (!orderId) {
        socket.emit('error', { message: 'Order ID is required' });
        return;
      }

      socket.broadcast.to(`order_${orderId}`).emit('user_typing_status', {
        orderId,
        userId: socket.userId,
        isTyping,
        timestamp: new Date().toISOString()
      });
    });
    
    // Also handle typing:status event from frontend
    socket.on('typing:status', (data) => {
      const { orderId, isTyping } = data;

      if (!orderId) {
        socket.emit('error', { message: 'Order ID is required' });
        return;
      }

      socket.broadcast.to(`order_${orderId}`).emit('typing:status', {
        orderId,
        userId: socket.userId,
        isTyping,
        timestamp: new Date().toISOString()
      });
    });

    socket.on('send_notification', (data) => {
      const { recipientUserId, title, message, type, referenceId } = data;

      if (!recipientUserId) {
        socket.emit('error', { message: 'Recipient user ID is required' });
        return;
      }

      const recipientSocketIds = userConnections[recipientUserId];

      if (recipientSocketIds && recipientSocketIds.length > 0) {
        recipientSocketIds.forEach(socketId => {
          io.to(socketId).emit('notification', {
            title,
            message,
            type,
            referenceId,
            sentAt: new Date().toISOString()
          });
        });
        console.log(`Notification sent to user ${recipientUserId} via ${recipientSocketIds.length} connection(s)`);
      } else {
        console.log(`User ${recipientUserId} is not connected - notification not sent`);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`User disconnected: ${socket.userId} (Socket: ${socket.id}, Reason: ${reason})`);

      if (userConnections[socket.userId]) {
        userConnections[socket.userId] = userConnections[socket.userId].filter(id => id !== socket.id);
        
        if (userConnections[socket.userId].length === 0) {
          delete userConnections[socket.userId];
          console.log(`User ${socket.userId} has no active connections`);
          // User is now OFFLINE - broadcast user:offline event to all clients
          console.log(`User ${socket.userId} is now OFFLINE`);
          io.emit('user:offline', { userId: socket.userId });
        } else {
          console.log(`User ${socket.userId} still has ${userConnections[socket.userId].length} active connection(s)`);
        }
      }

      Object.keys(orderConversations).forEach(orderId => {
        orderConversations[orderId] = orderConversations[orderId].filter(s => s !== socket.id);
        
        if (orderConversations[orderId].length === 0) {
          delete orderConversations[orderId];
        } else {
          io.to(`order_${orderId}`).emit('user_left', {
            userId: socket.userId,
            orderId,
            timestamp: new Date().toISOString()
          });
        }
      });
    });

    socket.on('error', (error) => {
      console.error(`Socket error from ${socket.userId}:`, error);
      socket.emit('error', {
        message: error.message || 'An error occurred',
        timestamp: new Date().toISOString()
      });
    });

    socket.on('connect_error', (error) => {
      console.error(`Connection error for socket ${socket.id}:`, error.message);
    });
  });

  const broadcastOrderUpdate = (orderId, buyerId, orderData) => {
    // Notify the buyer about order status change
    const buyerSockets = userConnections[buyerId];
    if (buyerSockets && buyerSockets.length > 0) {
      buyerSockets.forEach(socketId => {
        io.to(socketId).emit('order:updated', {
          order_id: orderId,
          order_number: orderData.order_number,
          status: orderData.status,
          delivery_option: orderData.delivery_option,
          total_amount: orderData.total_amount,
          buyer_confirmed: orderData.buyer_confirmed,
          seller_confirmed: orderData.seller_confirmed,
          buyer_delivery_proof_url: orderData.buyer_delivery_proof_url,
          seller_delivery_proof_url: orderData.seller_delivery_proof_url,
          updated_at: new Date().toISOString()
        });
      });
    }
  };

  const broadcastNewOrder = (sellerId, orderData) => {
    // Notify the seller about a new order
    const sellerSockets = userConnections[sellerId];
    if (sellerSockets && sellerSockets.length > 0) {
      sellerSockets.forEach(socketId => {
        io.to(socketId).emit('order:new', {
          order_id: orderData.id,
          order_number: orderData.order_number,
          buyer_name: orderData.buyer?.user?.full_name || 'Unknown',
          total_amount: orderData.total_amount,
          items_count: orderData.items?.length || 0,
          created_at: new Date().toISOString()
        });
      });
    }
  };

  const broadcastOrderCancelled = (userId, orderData) => {
    // Notify the other party that order was cancelled
    const userSockets = userConnections[userId];
    if (userSockets && userSockets.length > 0) {
      userSockets.forEach(socketId => {
        io.to(socketId).emit('order:cancelled', {
          order_id: orderData.id,
          order_number: orderData.order_number,
          reason: orderData.cancellation_reason || 'No reason provided',
          cancelled_by: orderData.cancelled_by,
          cancelled_at: new Date().toISOString()
        });
      });
    }
  };

  const broadcastNewMessage = (orderId, messageData) => {
    // Emit on both events for compatibility
    io.to(`order_${orderId}`).emit('message_received', messageData);
    io.to(`order_${orderId}`).emit('message:received', messageData);
    
    console.log(`Broadcasting message to order_${orderId}:`, messageData.id);
  };

  const broadcastMessageRead = (orderId, messageId, userId) => {
    io.to(`order_${orderId}`).emit('message_read_receipt', {
      messageId,
      orderId,
      userId,
      readAt: new Date().toISOString()
    });
  };

  const notifyUser = (userId, notification) => {
    const socketIds = userConnections[userId];
    if (socketIds && socketIds.length > 0) {
      socketIds.forEach(socketId => {
        io.to(socketId).emit('notification', {
          ...notification,
          sentAt: new Date().toISOString()
        });
      });
      console.log(`Notification sent to user ${userId} via ${socketIds.length} connection(s)`);
      return true;
    }
    return false;
  };

  const isUserConnected = (userId) => {
    return userConnections[userId] && userConnections[userId].length > 0;
  };

  const getConnectedUsers = () => {
    return Object.keys(userConnections).filter(userId => userConnections[userId].length > 0);
  };

  return {
    broadcastOrderUpdate,
    broadcastNewOrder,
    broadcastOrderCancelled,
    broadcastNewMessage,
    broadcastMessageRead,
    notifyUser,
    isUserConnected,
    getConnectedUsers,
    userConnections,
    orderConversations
  };
};

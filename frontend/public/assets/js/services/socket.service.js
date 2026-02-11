import ENV from '../config/env.js';
import { getToken, getUserId } from '../core/auth.js';
import { showToast } from '../components/toast.js';

let socket = null;
let isConnected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 2000;
let heartbeatInterval = null;
let connectionStateCallbacks = [];
let messageQueue = []; // Queue messages when offline

const initSocket = () => {
  if (socket && isConnected) {
    return socket;
  }
  
  if (typeof io === 'undefined') {
    console.warn('Socket.io not loaded. Real-time features disabled.');
    return null;
  }
  
  const token = getToken();
  if (!token) {
    console.warn('No auth token. Cannot establish WebSocket connection.');
    return null;
  }
  
  try {
    const wsUrl = 'wss://agrimarket-production-04b3.up.railway.app'; // Production WebSocket URL
    
    socket = io(wsUrl, {
      auth: {
        token: token
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: RECONNECT_DELAY
    });
    
    setupSocketListeners();
    
    return socket;
  } catch (error) {
    console.error('Error initializing socket:', error);
    return null;
  }
};

const setupSocketListeners = () => {
  if (!socket) return;
  
  socket.on('connect', () => {
    const userId = getUserId();
    isConnected = true;
    reconnectAttempts = 0;
    
    console.log('Socket connected:', socket.id);
    
    if (userId) {
      socket.emit('user:join', { userId });
    }
    
    // Emit connection state change
    notifyConnectionStateChange(true);
    
    // Start heartbeat
    startHeartbeat();
    
    // Flush queued messages
    flushMessageQueue();
  });
  
  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
    isConnected = false;
    
    // Emit connection state change
    notifyConnectionStateChange(false);
    
    // Stop heartbeat
    stopHeartbeat();
    
    if (reason === 'io server disconnect') {
      // Server initiated disconnect, try to reconnect
      socket.connect();
    }
  });
  
  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error.message);
    reconnectAttempts++;
    
    // Don't show error messages if user is not authenticated
    const token = getToken();
    if (!token) {
      console.warn('Socket connection failed - no auth token. WebSocket features disabled.');
      return;
    }
    
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      showToast('Connection lost. Please refresh the page.', 'error');
    } else if (reconnectAttempts > 2) {
      showToast('Reconnecting...', 'warning');
    }
  });
  
  socket.on('reconnect', (attemptNumber) => {
    console.log('Socket reconnected after', attemptNumber, 'attempts');
    showToast('Connection restored', 'success');
  });
  
  socket.on('reconnect_failed', () => {
    console.error('Socket reconnection failed');
    
    // Don't show error messages if user is not authenticated
    const token = getToken();
    if (!token) {
      console.warn('Socket reconnection failed - no auth token. WebSocket features disabled.');
      return;
    }
    
    showToast('Failed to reconnect. Please refresh the page.', 'error');
  });

  socket.on('pong', () => {
    // Heartbeat response received
  });

  socket.on('server:message', (data) => {
    if (data.message) {
      showToast(data.message, data.type || 'info');
    }
  });
  
  socket.on('user:online', (data) => {
    // Event captured
  });
  
  socket.on('user:offline', (data) => {
    // Event captured
  });
  
  socket.on('message_received', (data) => {
    // Event captured
  });
  
  socket.on('message_read_receipt', (data) => {
    // Event captured
  });
  
  socket.on('notification', (data) => {
    // Event captured
  });
  
  socket.on('notification:new', (data) => {
    // Event captured
  });
  
  socket.on('error', (error) => {
    console.error('Socket error:', error);
    showToast(error.message || 'Connection error', 'error');
  });
  
  socket.on('users:online:initial', (data) => {
    // Event captured
  });
};

const disconnect = () => {
  stopHeartbeat();
  
  if (socket) {
    socket.disconnect();
    socket = null;
    isConnected = false;
  }
  
  messageQueue = [];
  connectionStateCallbacks = [];
};

// ============ Heartbeat ============

const startHeartbeat = () => {
  stopHeartbeat(); // Clear any existing interval
  
  heartbeatInterval = setInterval(() => {
    if (socket && isConnected) {
      socket.emit('ping');
    }
  }, 30000); // Ping every 30 seconds
};

const stopHeartbeat = () => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
};

// ============ Connection State Management ============

const onConnectionStateChange = (callback) => {
  if (typeof callback === 'function') {
    connectionStateCallbacks.push(callback);
  }
  
  // Return unsubscribe function
  return () => {
    connectionStateCallbacks = connectionStateCallbacks.filter(cb => cb !== callback);
  };
};

const notifyConnectionStateChange = (connected) => {
  connectionStateCallbacks.forEach(callback => {
    try {
      callback(connected);
    } catch (error) {
      console.error('Error in connection state callback:', error);
    }
  });
};

// ============ Message Queue ============

const queueMessage = (event, data) => {
  messageQueue.push({ event, data, timestamp: Date.now() });
  
  // Limit queue size
  if (messageQueue.length > 50) {
    messageQueue.shift();
  }
};

const flushMessageQueue = () => {
  if (!socket || !isConnected || messageQueue.length === 0) {
    return;
  }
  
  console.log(`Flushing ${messageQueue.length} queued messages`);
  
  const queue = [...messageQueue];
  messageQueue = [];
  
  queue.forEach(({ event, data }) => {
    socket.emit(event, data);
  });
};

// ============ Room Management ============

const joinRoom = (roomId) => {
  if (!socket || !isConnected) {
    console.warn('Socket not connected');
    return false;
  }
  
  socket.emit('join_conversation', { orderId: roomId });
  return true;
};

const leaveRoom = (roomId) => {
  if (!socket || !isConnected) {
    console.warn('Socket not connected');
    return false;
  }
  
  socket.emit('leave_conversation', { orderId: roomId });
  return true;
};

// ============ Messaging ============

const joinConversation = (orderId) => {
  if (!socket || !isConnected) {
    console.warn('Socket not connected');
    return false;
  }
  
  socket.emit('join_conversation', { orderId });
  return true;
};

const leaveConversation = (orderId) => {
  if (!socket || !isConnected) {
    console.warn('Socket not connected');
    return false;
  }
  
  socket.emit('leave_conversation', { orderId });
  return true;
};

const sendMessage = (orderId, messageData) => {
  if (!socket) {
    console.warn('Socket not initialized');
    return false;
  }
  
  const payload = {
    orderId,
    ...messageData
  };
  
  if (!isConnected) {
    console.warn('Socket not connected, queueing message');
    queueMessage('message:send', payload);
    return false;
  }
  
  socket.emit('message:send', payload);
  return true;
};

const onMessageReceived = (callback) => {
  if (!socket) {
    console.warn('Socket not initialized');
    return null;
  }
  
  socket.on('message:received', callback);
  
  // Return unsubscribe function
  return () => {
    socket.off('message:received', callback);
  };
};

// ============ Typing Indicators ============

const sendTyping = (orderId, isTyping = true) => {
  if (!socket || !isConnected) return false;
  
  socket.emit('typing:status', {
    orderId,
    isTyping
  });
  
  return true;
};

const onTypingStatus = (callback) => {
  if (!socket) return null;
  
  socket.on('typing:status', callback);
  
  return () => {
    socket.off('typing:status', callback);
  };
};

// ============ Online Status ============

const onUserOnline = (callback) => {
  if (!socket) {
    return null;
  }
  
  socket.on('user:online', callback);
  
  return () => {
    socket.off('user:online', callback);
  };
};

const onUserOffline = (callback) => {
  if (!socket) {
    return null;
  }
  
  socket.on('user:offline', callback);
  
  return () => {
    socket.off('user:offline', callback);
  };
};

const onInitialOnlineUsers = (callback) => {
  if (!socket) return null;
  
  socket.on('users:online:initial', callback);
  
  return () => {
    socket.off('users:online:initial', callback);
  };
};

// ============ Order Updates ============

const onOrderUpdate = (callback) => {
  if (!socket) return null;
  
  socket.on('order:updated', callback);
  
  return () => {
    socket.off('order:updated', callback);
  };
};

const onNewOrder = (callback) => {
  if (!socket) return null;
  
  socket.on('order:new', callback);
  
  return () => {
    socket.off('order:new', callback);
  };
};

const onOrderCancelled = (callback) => {
  if (!socket) return null;
  
  socket.on('order:cancelled', callback);
  
  return () => {
    socket.off('order:cancelled', callback);
  };
};

// ============ Notifications ============

const onNotification = (callback) => {
  if (!socket) return null;
  
  // Listen to both 'notification' and 'notification:new' events
  socket.on('notification', callback);
  socket.on('notification:new', callback);
  
  return () => {
    socket.off('notification', callback);
    socket.off('notification:new', callback);
  };
};

// ============ Generic Event Listener ============

const on = (event, callback) => {
  if (!socket) {
    console.warn('Socket not initialized');
    return null;
  }
  
  socket.on(event, callback);
  
  return () => {
    socket.off(event, callback);
  };
};

const emit = (event, data) => {
  if (!socket || !isConnected) {
    console.warn('Socket not connected');
    return false;
  }
  
  socket.emit(event, data);
  return true;
};

// ============ Connection Status ============

const getConnectionStatus = () => {
  return {
    connected: isConnected,
    socket: socket,
    reconnectAttempts: reconnectAttempts
  };
};

// ============ Exports ============

export {
  // Connection
  initSocket,
  disconnect,
  getConnectionStatus,
  onConnectionStateChange,
  
  // Rooms
  joinRoom,
  leaveRoom,
  
  // Messaging
  joinConversation,
  leaveConversation,
  sendMessage,
  onMessageReceived,
  
  // Typing
  sendTyping,
  onTypingStatus,
  
  // Online status
  onUserOnline,
  onUserOffline,
  onInitialOnlineUsers,
  
  // Orders
  onOrderUpdate,
  onNewOrder,
  onOrderCancelled,
  
  // Notifications
  onNotification,
  
  // Generic
  on,
  emit
};

export default {
  init: initSocket,
  disconnect,
  status: getConnectionStatus,
  onConnectionChange: onConnectionStateChange,
  joinRoom,
  leaveRoom,
  joinConversation,
  leaveConversation,
  sendMessage,
  onMessageReceived,
  sendTyping,
  onTypingStatus,
  on,
  emit
};
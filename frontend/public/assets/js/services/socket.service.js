import ENV from '../config/env.js';
import { initSupabase } from '../config/supabase.js';
import { getToken, getUser, getUserId } from '../core/auth.js';
import { showToast } from '../components/toast.js';

let supabase = null;
let initPromise = null;
let isConnected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

let connectionStateCallbacks = [];
let messageQueue = [];

let profileContext = {
  userId: null,
  role: null,
  buyerProfileId: null,
  sellerProfileId: null,
  fullName: null
};

let channels = {
  notifications: null,
  messagesInsert: null,
  messagesUpdate: null,
  ordersInsert: null,
  ordersUpdate: null,
  presence: null,
  typing: null
};

let joinedOrderIds = new Set();
let onlineUsers = new Set();
let previousOnlineUsers = new Set();
let listeners = new Map();

const emitLocal = (event, payload) => {
  const callbacks = listeners.get(event);
  if (!callbacks || callbacks.size === 0) return;
  callbacks.forEach((callback) => {
    try {
      callback(payload);
    } catch (error) {
      console.error(`Error in realtime callback for "${event}":`, error);
    }
  });
};

const registerListener = (event, callback) => {
  if (typeof callback !== 'function') return () => {};
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event).add(callback);
  return () => {
    const callbacks = listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback);
    }
  };
};

const notifyConnectionStateChange = (connected) => {
  connectionStateCallbacks.forEach((callback) => {
    try {
      callback(connected);
    } catch (error) {
      console.error('Error in connection state callback:', error);
    }
  });
};

const ensureProfileContext = async () => {
  const user = getUser();
  const userId = getUserId();
  const token = getToken();

  profileContext.userId = userId || null;
  profileContext.role = user?.role || null;
  profileContext.fullName = user?.full_name || 'User';

  if (!userId || !token || !ENV.API_BASE_URL) {
    return profileContext;
  }

  try {
    const response = await fetch(`${ENV.API_BASE_URL}/users/profile`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      return profileContext;
    }

    const result = await response.json();
    const profileUser = result?.data?.user || {};

    profileContext.buyerProfileId = profileUser?.buyer_profile?.id || null;
    profileContext.sellerProfileId = profileUser?.seller_profile?.id || null;
  } catch (error) {
    console.warn('Failed to resolve profile context for realtime filters:', error);
  }

  return profileContext;
};

const mapOrderRecord = (record) => ({
  order_id: record.id,
  order_number: record.order_number,
  status: record.status,
  delivery_option: record.delivery_option,
  total_amount: record.total_amount,
  buyer_confirmed: record.buyer_confirmed,
  seller_confirmed: record.seller_confirmed,
  buyer_delivery_proof_url: record.buyer_delivery_proof_url,
  seller_delivery_proof_url: record.seller_delivery_proof_url,
  updated_at: record.updated_at || new Date().toISOString()
});

const filterForCurrentUserOrder = (record) => {
  const role = profileContext.role;
  if (role === 'buyer' && profileContext.buyerProfileId) {
    return String(record.buyer_id) === String(profileContext.buyerProfileId);
  }
  if (role === 'seller' && profileContext.sellerProfileId) {
    return String(record.seller_id) === String(profileContext.sellerProfileId);
  }
  return false;
};

const resolveNewOrderDisplayData = async (record) => {
  const fallback = {
    buyerName: 'Buyer',
    itemsCount: Number(record.items_count) || 0
  };

  const token = getToken();
  if (!token || !ENV.API_BASE_URL || !record?.id) {
    return fallback;
  }

  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`${ENV.API_BASE_URL}/orders/${record.id}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        if (attempt === maxAttempts) return fallback;
      } else {
        const result = await response.json();
        const order = result?.data?.order || {};
        const items = Array.isArray(order?.items) ? order.items : [];
        const buyerName = order?.buyer?.user?.full_name || fallback.buyerName;
        const quantityTotal = items.reduce((sum, item) => sum + (Number(item?.quantity) || 0), 0);
        const itemsCount = quantityTotal > 0 ? quantityTotal : items.length;

        if (itemsCount > 0 || attempt === maxAttempts) {
          return { buyerName, itemsCount };
        }
      }
    } catch (error) {
      if (attempt === maxAttempts) {
        console.warn('Failed to resolve new-order display data:', error);
        return fallback;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, attempt * 250));
  }

  return fallback;
};

const subscribeNotifications = () => {
  const userId = profileContext.userId;
  if (!userId || !supabase) return null;

  const channel = supabase
    .channel(`notifications-${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        const record = payload.new || {};
        const notificationPayload = {
          ...record,
          referenceId: record.reference_id,
          sentAt: record.created_at || new Date().toISOString()
        };
        emitLocal('notification', notificationPayload);
        emitLocal('notification:new', notificationPayload);
      }
    )
    .subscribe();

  return channel;
};

const subscribeMessagesInsert = () => {
  if (!supabase) return null;

  const channel = supabase
    .channel('messages-insert')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages'
      },
      (payload) => {
        const record = payload.new || {};
        const orderId = record.order_id;
        const currentUserId = profileContext.userId;

        const normalizedOrderId = orderId ? String(orderId) : null;
        if (!normalizedOrderId || !joinedOrderIds.has(normalizedOrderId)) {
          return;
        }

        if (String(record.sender_id) === String(currentUserId)) {
          return;
        }

        emitLocal('message_received', record);
        emitLocal('message:received', record);
      }
    )
    .subscribe();

  return channel;
};

const subscribeMessagesUpdate = () => {
  if (!supabase) return null;

  const channel = supabase
    .channel('messages-update')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages'
      },
      (payload) => {
        const before = payload.old || {};
        const after = payload.new || {};

        if (!after.order_id || !after.is_read || before.is_read === after.is_read) {
          return;
        }

        emitLocal('message_read_receipt', {
          messageId: after.id,
          orderId: after.order_id,
          userId: null,
          readAt: after.read_at || new Date().toISOString()
        });
      }
    )
    .subscribe();

  return channel;
};

const subscribeOrdersInsert = () => {
  if (!supabase || !profileContext.role) return null;

  const channel = supabase
    .channel('orders-insert')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'orders'
      },
      async (payload) => {
        const record = payload.new || {};
        if (!filterForCurrentUserOrder(record)) return;

        if (profileContext.role === 'seller') {
          const { buyerName, itemsCount } = await resolveNewOrderDisplayData(record);
          emitLocal('order:new', {
            order_id: record.id,
            order_number: record.order_number,
            buyer_name: buyerName,
            total_amount: record.total_amount,
            items_count: itemsCount,
            created_at: record.created_at || new Date().toISOString()
          });
        }

        emitLocal('order:updated', mapOrderRecord(record));
      }
    )
    .subscribe();

  return channel;
};

const subscribeOrdersUpdate = () => {
  if (!supabase || !profileContext.role) return null;

  const channel = supabase
    .channel('orders-update')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders'
      },
      (payload) => {
        const before = payload.old || {};
        const record = payload.new || {};

        if (!filterForCurrentUserOrder(record)) return;

        const mapped = {
          ...mapOrderRecord(record),
          previous_status: before.status || null
        };

        emitLocal('order:updated', mapped);

        if (record.status === 'cancelled') {
          emitLocal('order:cancelled', {
            order_id: record.id,
            order_number: record.order_number,
            reason: record.cancellation_reason || 'No reason provided',
            cancelled_by: record.cancelled_by || null,
            cancelled_at: record.updated_at || new Date().toISOString()
          });
        }
      }
    )
    .subscribe();

  return channel;
};

const syncPresenceUsers = (channel) => {
  const state = channel.presenceState();
  const nextOnline = new Set();

  Object.values(state).forEach((metas) => {
    metas.forEach((meta) => {
      if (meta?.user_id) {
        nextOnline.add(String(meta.user_id));
      }
    });
  });

  onlineUsers = nextOnline;

  emitLocal('users:online:initial', {
    onlineUsers: Array.from(onlineUsers)
  });

  onlineUsers.forEach((userId) => {
    if (!previousOnlineUsers.has(userId)) {
      emitLocal('user:online', { userId });
    }
  });

  previousOnlineUsers.forEach((userId) => {
    if (!onlineUsers.has(userId)) {
      emitLocal('user:offline', { userId });
    }
  });

  previousOnlineUsers = new Set(onlineUsers);
};

const subscribePresence = () => {
  if (!supabase || !profileContext.userId) return null;

  const channel = supabase.channel('online-users', {
    config: {
      presence: {
        key: String(profileContext.userId)
      }
    }
  });

  channel
    .on('presence', { event: 'sync' }, () => {
      syncPresenceUsers(channel);
    })
    .on('presence', { event: 'join' }, () => {
      syncPresenceUsers(channel);
    })
    .on('presence', { event: 'leave' }, () => {
      syncPresenceUsers(channel);
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        try {
          await channel.track({
            user_id: String(profileContext.userId),
            full_name: profileContext.fullName,
            online_at: new Date().toISOString()
          });
        } catch (error) {
          console.warn('Failed to track presence:', error);
        }
      }
    });

  return channel;
};

const subscribeTyping = () => {
  if (!supabase) return null;

  const channel = supabase
    .channel('typing-status')
    .on('broadcast', { event: 'typing:status' }, ({ payload }) => {
      emitLocal('typing:status', payload || {});
    })
    .subscribe();

  return channel;
};

const setupRealtimeChannels = () => {
  channels.notifications = subscribeNotifications();
  channels.messagesInsert = subscribeMessagesInsert();
  channels.messagesUpdate = subscribeMessagesUpdate();
  channels.ordersInsert = subscribeOrdersInsert();
  channels.ordersUpdate = subscribeOrdersUpdate();
  channels.presence = subscribePresence();
  channels.typing = subscribeTyping();
};

const initializeRealtime = async () => {
  if (supabase && isConnected) {
    return supabase;
  }

  const token = getToken();
  if (!token) {
    console.warn('No auth token. Cannot establish realtime connection.');
    return null;
  }

  try {
    supabase = await initSupabase();
    if (!supabase) {
      showToast('Realtime unavailable. Please refresh the page.', 'warning');
      return null;
    }

    await ensureProfileContext();
    setupRealtimeChannels();

    isConnected = true;
    reconnectAttempts = 0;
    notifyConnectionStateChange(true);
    flushMessageQueue();

    return supabase;
  } catch (error) {
    reconnectAttempts += 1;
    isConnected = false;
    notifyConnectionStateChange(false);
    console.error('Error initializing Supabase realtime:', error);

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      showToast('Connection lost. Please refresh the page.', 'error');
    }
    return null;
  }
};

const initSocket = () => {
  if (supabase && isConnected) {
    return supabase;
  }

  const token = getToken();
  if (!token) {
    console.warn('No auth token. Cannot establish realtime connection.');
    return null;
  }

  if (!ENV.SUPABASE_URL || !ENV.SUPABASE_ANON_KEY) {
    console.warn('Supabase credentials are missing in runtime ENV.');
    return null;
  }

  if (!initPromise) {
    initPromise = initializeRealtime().finally(() => {
      initPromise = null;
    });
  }

  return supabase || {};
};

const disconnect = async () => {
  const activeChannels = Object.values(channels).filter(Boolean);
  if (supabase && activeChannels.length > 0) {
    await Promise.allSettled(activeChannels.map((channel) => supabase.removeChannel(channel)));
  }

  channels = {
    notifications: null,
    messagesInsert: null,
    messagesUpdate: null,
    ordersInsert: null,
    ordersUpdate: null,
    presence: null,
    typing: null
  };

  joinedOrderIds = new Set();
  onlineUsers = new Set();
  previousOnlineUsers = new Set();
  messageQueue = [];
  listeners.clear();
  connectionStateCallbacks = [];

  isConnected = false;
  supabase = null;
  initPromise = null;
};

const onConnectionStateChange = (callback) => {
  if (typeof callback === 'function') {
    connectionStateCallbacks.push(callback);
  }

  return () => {
    connectionStateCallbacks = connectionStateCallbacks.filter((cb) => cb !== callback);
  };
};

const queueMessage = (event, data) => {
  messageQueue.push({ event, data, timestamp: Date.now() });
  if (messageQueue.length > 50) {
    messageQueue.shift();
  }
};

const flushMessageQueue = () => {
  if (!isConnected || messageQueue.length === 0) return;
  const queued = [...messageQueue];
  messageQueue = [];
  queued.forEach(({ event, data }) => {
    emit(event, data);
  });
};

const joinRoom = (roomId) => joinConversation(roomId);
const leaveRoom = (roomId) => leaveConversation(roomId);

const joinConversation = (orderId) => {
  if (!orderId) return false;
  joinedOrderIds.add(String(orderId));
  return true;
};

const leaveConversation = (orderId) => {
  if (!orderId) return false;
  joinedOrderIds.delete(String(orderId));
  return true;
};

const sendMessage = () => {
  // Messaging continues via REST API (message.service.js).
  return false;
};

const onMessageReceived = (callback) => registerListener('message:received', callback);

const sendTyping = async (orderId, isTyping = true) => {
  if (!channels.typing || !isConnected || !orderId) return false;
  try {
    await channels.typing.send({
      type: 'broadcast',
      event: 'typing:status',
      payload: {
        orderId,
        isTyping,
        userId: profileContext.userId,
        timestamp: new Date().toISOString()
      }
    });
    return true;
  } catch (error) {
    console.error('Failed to send typing status:', error);
    return false;
  }
};

const onTypingStatus = (callback) => registerListener('typing:status', callback);
const onUserOnline = (callback) => registerListener('user:online', callback);
const onUserOffline = (callback) => registerListener('user:offline', callback);
const onInitialOnlineUsers = (callback) => registerListener('users:online:initial', callback);
const onOrderUpdate = (callback) => registerListener('order:updated', callback);
const onNewOrder = (callback) => registerListener('order:new', callback);
const onOrderCancelled = (callback) => registerListener('order:cancelled', callback);

const onNotification = (callback) => {
  return registerListener('notification', callback);
};

const on = (event, callback) => registerListener(event, callback);

const emit = (event, data) => {
  if (!isConnected) {
    queueMessage(event, data);
    return false;
  }

  if (event === 'typing:status') {
    sendTyping(data?.orderId, data?.isTyping);
    return true;
  }

  return false;
};

const getConnectionStatus = () => ({
  connected: isConnected,
  socket: supabase,
  reconnectAttempts
});

export {
  initSocket,
  disconnect,
  getConnectionStatus,
  onConnectionStateChange,
  joinRoom,
  leaveRoom,
  joinConversation,
  leaveConversation,
  sendMessage,
  onMessageReceived,
  sendTyping,
  onTypingStatus,
  onUserOnline,
  onUserOffline,
  onInitialOnlineUsers,
  onOrderUpdate,
  onNewOrder,
  onOrderCancelled,
  onNotification,
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

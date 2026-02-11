import { get, post, put, del, upload } from '../core/http.js';
import { ENDPOINTS } from '../config/api.js';

// Cache for reducing redundant API calls
const messageCache = new Map();
const CACHE_TTL = 30000; // 30 seconds

// Debounce map for marking messages as read
let markAsReadDebounce = null;

const getOrderMessages = async (orderId, params = {}) => {
  try {
    const queryParams = new URLSearchParams();
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.offset) queryParams.append('offset', params.offset);
    if (params.before) queryParams.append('before', params.before);
    
    const queryString = queryParams.toString();
    const url = queryString 
      ? `${ENDPOINTS.MESSAGES.BY_ORDER(orderId)}?${queryString}`
      : ENDPOINTS.MESSAGES.BY_ORDER(orderId);
    
    // Check cache for initial load only
    if (!params.offset && messageCache.has(url)) {
      const cached = messageCache.get(url);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
      }
    }
    
    const response = await get(url);
    
    // Cache the response
    if (!params.offset) {
      messageCache.set(url, {
        data: response,
        timestamp: Date.now()
      });
    }
    
    return response;
  } catch (error) {
    throw error;
  }
};

/**
 * Get all conversations (list of orders with messages)
 */
const getConversations = async (params = {}) => {
  try {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page);
    if (params.limit) queryParams.append('limit', params.limit);
    
    const queryString = queryParams.toString();
    const url = queryString
      ? `${ENDPOINTS.MESSAGES.CONVERSATIONS}?${queryString}`
      : ENDPOINTS.MESSAGES.CONVERSATIONS;
    
    const response = await get(url);
    return response;
  } catch (error) {
    throw error;
  }
};

/**
 * Get unread message count
 */
const getUnreadMessageCount = async () => {
  try {
    const response = await get(ENDPOINTS.MESSAGES.UNREAD_COUNT);
    return response;
  } catch (error) {
    throw error;
  }
};

const sendMessage = async (messageData) => {
  try {
    const { order_id, message_text } = messageData;
    
    if (!order_id || !message_text) {
      throw new Error('Order ID and message text are required');
    }
    
    const response = await post(ENDPOINTS.MESSAGES.SEND, {
      order_id,
      message_text
    });
    
    return response;
  } catch (error) {
    throw error;
  }
};

/**
 * Send a message with attachment
 * @param {Object} messageData - Message data with file
 */
const sendMessageWithAttachment = async (messageData) => {
  try {
    const { order_id, message_text, attachment } = messageData;
    
    if (!order_id) {
      throw new Error('Order ID is required');
    }
    
    if (!message_text && !attachment) {
      throw new Error('Message text or attachment is required');
    }
    
    const formData = new FormData();
    formData.append('order_id', order_id);
    
    if (message_text) {
      formData.append('message_text', message_text);
    }
    
    if (attachment) {
      formData.append('attachment', attachment);
    }
    
    const response = await upload(ENDPOINTS.MESSAGES.SEND, formData);
    return response;
  } catch (error) {
    throw error;
  }
};



/**
 * Mark messages as read for an order (debounced)
 * @param {String} orderId - Order ID
 */
const markMessagesAsRead = async (orderId) => {
  try {
    // Invalidate cache for this order
    const cacheKey = `${ENDPOINTS.MESSAGES.BY_ORDER(orderId)}`;
    messageCache.delete(cacheKey);
    
    const response = await post(ENDPOINTS.MESSAGES.MARK_READ(orderId), {});
    return response;
  } catch (error) {
    throw error;
  }
};

/**
 * Debounced version of markMessagesAsRead to prevent excessive API calls
 * @param {String} orderId - Order ID
 * @param {Number} delay - Debounce delay in ms (default 1000)
 */
const markMessagesAsReadDebounced = (orderId, delay = 1000) => {
  return new Promise((resolve, reject) => {
    if (markAsReadDebounce) {
      clearTimeout(markAsReadDebounce);
    }
    
    markAsReadDebounce = setTimeout(async () => {
      try {
        const result = await markMessagesAsRead(orderId);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }, delay);
  });
};

/**
 * Delete a message
 * @param {String} messageId - Message ID
 */
const deleteMessage = async (messageId) => {
  try {
    const response = await del(ENDPOINTS.MESSAGES.DELETE(messageId));
    return response;
  } catch (error) {
    throw error;
  }
};



/**
 * Search messages
 * @param {String} query - Search query
 * @param {Object} filters - Additional filters
 */
const searchMessages = async (query, filters = {}) => {
  try {
    const params = new URLSearchParams();
    params.append('query', query);
    
    if (filters.order_id) params.append('order_id', filters.order_id);
    if (filters.from_date) params.append('from_date', filters.from_date);
    if (filters.to_date) params.append('to_date', filters.to_date);
    
    const url = `${ENDPOINTS.MESSAGES.CONVERSATIONS}?${params.toString()}`;
    const response = await get(url);
    return response;
  } catch (error) {
    throw error;
  }
};



/**
 * Send typing status (used with socket)
 * This is typically handled by socket.service.js
 * but included here for completeness
 */
const sendTypingStatus = (orderId, isTyping) => {


};



/**
 * Get conversation info for an order
 * @param {String} orderId - Order ID
 */
const getConversationInfo = async (orderId) => {
  try {
    const response = await get(`${ENDPOINTS.MESSAGES.BY_ORDER(orderId)}/info`);
    return response;
  } catch (error) {
    throw error;
  }
};

/**
 * Check if order has unread messages
 * @param {String} orderId - Order ID
 */
const hasUnreadMessages = async (orderId) => {
  try {
    const response = await get(`${ENDPOINTS.MESSAGES.BY_ORDER(orderId)}/unread`);
    return response.data?.has_unread || false;
  } catch (error) {
    console.error('Error checking unread messages:', error);
    return false;
  }
};

/**
 * Get message statistics
 */
const getMessageStats = async () => {
  try {
    const response = await get(`${ENDPOINTS.MESSAGES.CONVERSATIONS}/stats`);
    return response;
  } catch (error) {
    throw error;
  }
};



/**
 * Validate message before sending
 * @param {String} messageText - Message text
 * @returns {Object} Validation result
 */
const validateMessage = (messageText) => {
  if (!messageText || messageText.trim() === '') {
    return { valid: false, message: 'Message cannot be empty' };
  }
  
  if (messageText.length > 5000) {
    return { valid: false, message: 'Message is too long (max 5000 characters)' };
  }
  
  return { valid: true };
};

/**
 * Validate attachment
 * @param {File} file - File to validate
 * @returns {Object} Validation result
 */
const validateAttachment = (file) => {
  if (!file) {
    return { valid: false, message: 'No file selected' };
  }
  
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    return { valid: false, message: 'File is too large (max 10MB)' };
  }
  
  const allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  
  if (!allowedTypes.includes(file.type)) {
    return { 
      valid: false, 
      message: 'File type not allowed. Allowed: JPG, PNG, GIF, PDF, DOC, DOCX' 
    };
  }
  
  return { valid: true };
};



export {
  // Get messages
  getOrderMessages,
  getConversations,
  getUnreadMessageCount,
  getConversationInfo,
  hasUnreadMessages,
  getMessageStats,
  
  // Send messages
  sendMessage,
  sendMessageWithAttachment,
  
  // Actions
  markMessagesAsRead,
  markMessagesAsReadDebounced,
  deleteMessage,
  
  // Search
  searchMessages,
  
  // Helpers
  sendTypingStatus,
  validateMessage,
  validateAttachment
};

export default {
  getOrderMessages,
  getConversations,
  getUnreadCount: getUnreadMessageCount,
  send: sendMessage,
  sendWithAttachment: sendMessageWithAttachment,
  markAsRead: markMessagesAsRead,
  markAsReadDebounced: markMessagesAsReadDebounced,
  delete: deleteMessage,
  search: searchMessages,
  validateMessage,
  validateAttachment
};
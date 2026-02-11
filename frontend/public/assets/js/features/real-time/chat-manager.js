// assets/js/features/real-time/chat-manager.js
// Chat Manager - Real-time messaging with typing indicators

import {
  joinConversation,
  leaveConversation,
  sendMessage as socketSendMessage,
  onMessageReceived,
  sendTyping,
  onTypingStatus,
  onUserOnline,
  onUserOffline
} from '../../services/socket.service.js';
import { 
  getOrderMessages, 
  sendMessage as apiSendMessage 
} from '../../services/message.service.js';
import { formatRelativeTime } from '../../utils/formatters.js';
import { showToast, showError } from '../../components/toast.js';
import { getUserId } from '../../core/auth.js';
import { playMessageSound } from '../notifications/notification-sound.js';

// ============ State ============

let currentOrderId = null;
let messages = [];
let typingTimeout = null;
let isTyping = false;
let typingUsers = new Set();
let onlineUsers = new Set();
let unsubscribeFunctions = [];
let messageCache = new Map(); // Cache messages by order ID
let pendingMessages = new Map(); // Track pending messages for optimistic UI
let messageQueue = []; // Queue for offline messages
let isLoadingMore = false;
let hasMoreMessages = true;
let currentOffset = 0;

// ============ Chat Initialization ============

const initChat = async (orderId, containerId) => {
  currentOrderId = orderId;
  const container = document.getElementById(containerId);
  
  if (!container) {
    console.error('Chat container not found');
    return false;
  }
  
  try {
    // Load existing messages
    await loadMessages(orderId);
    
    // Join WebSocket room for this order
    joinConversation(orderId);
    
    // Setup real-time listeners
    setupRealtimeListeners();
    
    // Render chat UI
    renderChat(container);
    
    return true;
  } catch (error) {
    console.error('Error initializing chat:', error);
    showError('Failed to load chat');
    return false;
  }
};

// ============ Load Messages ============

const loadMessages = async (orderId, limit = 50, offset = 0) => {
  try {
    // Check cache first
    if (offset === 0 && messageCache.has(orderId)) {
      const cached = messageCache.get(orderId);
      if (Date.now() - cached.timestamp < 30000) { // Cache for 30 seconds
        messages = cached.messages;
        return messages;
      }
    }

    const response = await getOrderMessages(orderId, { limit, offset });
    const newMessages = response.data?.messages || [];
    
    if (offset === 0) {
      messages = newMessages;
      messageCache.set(orderId, {
        messages: newMessages,
        timestamp: Date.now()
      });
    } else {
      // Prepend older messages (they come in ascending order)
      messages = [...newMessages, ...messages];
    }
    
    hasMoreMessages = response.pagination?.has_more || false;
    return messages;
  } catch (error) {
    console.error('Error loading messages:', error);
    throw error;
  }
};

// ============ Real-time Listeners ============

const setupRealtimeListeners = () => {
  // Clean up previous listeners
  cleanup();
  
  // New message listener
  const unsubMessage = onMessageReceived((data) => {
    if (data.order_id === currentOrderId) {
      handleNewMessage(data);
    }
  });
  unsubscribeFunctions.push(unsubMessage);
  
  // Typing status listener
  const unsubTyping = onTypingStatus((data) => {
    if (data.orderId === currentOrderId) {
      handleTypingStatus(data);
    }
  });
  unsubscribeFunctions.push(unsubTyping);
  
  // Online status listeners
  const unsubOnline = onUserOnline((data) => {
    handleUserOnline(data.userId);
  });
  unsubscribeFunctions.push(unsubOnline);
  
  const unsubOffline = onUserOffline((data) => {
    handleUserOffline(data.userId);
  });
  unsubscribeFunctions.push(unsubOffline);
};

// ============ Render Chat UI ============

const renderChat = (container) => {
  container.innerHTML = `
    <div class="chat-container flex flex-col h-full">
      <!-- Chat Header -->
      <div class="chat-header p-4 border-b bg-white">
        <div class="flex items-center justify-between">
          <div>
            <h4 class="font-bold" id="chat-title">Order Chat</h4>
            <p class="text-sm text-gray-600" id="chat-subtitle">
              <span id="online-status"></span>
            </p>
          </div>
          <button class="btn btn-sm btn-outline" onclick="window.closeChat()">
            <i class="bi bi-x"></i>
          </button>
        </div>
      </div>
      
      <!-- Load More Button -->
      <div id="load-more-container" class="p-3 text-center border-b" style="display: none;">
        <button id="load-more-btn" class="btn btn-sm btn-outline">
          <i class="bi bi-arrow-up"></i> Load older messages
        </button>
      </div>
      
      <!-- Messages Area -->
      <div id="chat-messages" class="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
        ${renderMessages()}
      </div>
      
      <!-- Typing Indicator -->
      <div id="typing-indicator" class="px-4 py-2 text-sm text-gray-600" style="display: none;">
        <i class="bi bi-three-dots"></i> <span id="typing-text"></span>
      </div>
      
      <!-- Message Input -->
      <div class="chat-input p-4 border-t bg-white">
        <form id="message-form" class="flex gap-2">
          <input 
            type="text" 
            id="message-input" 
            class="form-control flex-1" 
            placeholder="Type a message..."
            autocomplete="off"
            required
          >
          <button type="submit" class="btn btn-primary" id="send-btn">
            <i class="bi bi-send"></i>
          </button>
        </form>
      </div>
    </div>
  `;
  
  // Setup event listeners
  setupChatEvents();
  
  // Show load more button if has more messages
  if (hasMoreMessages && messages.length >= 50) {
    document.getElementById('load-more-container').style.display = 'block';
  }
  
  // Auto-scroll to bottom
  scrollToBottom(false);
};

const renderMessages = () => {
  if (messages.length === 0) {
    return '<div class="text-center text-gray-500 py-8">No messages yet. Start the conversation!</div>';
  }
  
  return messages.map(msg => renderMessage(msg)).join('');
};

const renderMessage = (message) => {
  const currentUserId = getUserId();
  const isSender = message.sender_id === currentUserId;
  const alignClass = isSender ? 'justify-end' : 'justify-start';
  const bgClass = isSender ? 'bg-primary text-white' : 'bg-white';
  const borderClass = isSender ? '' : 'border border-gray-200';
  
  // Check if message is pending
  const isPending = message.pending === true;
  const opacityClass = isPending ? 'opacity-60' : '';
  const statusIcon = isPending ? 
    '<i class="bi bi-clock text-xs"></i>' : 
    (message.is_read && isSender ? '<i class="bi bi-check-all"></i>' : '');
  
  return `
    <div class="flex ${alignClass} ${opacityClass}" data-message-id="${message.id}">
      <div class="${bgClass} ${borderClass} rounded-lg px-4 py-2 max-w-xs shadow-sm">
        ${!isSender ? `<p class="text-xs font-semibold mb-1 ${isSender ? 'text-white' : 'text-gray-700'}">${escapeHtml(message.sender_name || 'User')}</p>` : ''}
        <p class="text-sm break-words">${escapeHtml(message.message_text)}</p>
        ${message.attachment_url ? `
          <a href="${message.attachment_url}" target="_blank" class="text-xs underline mt-1 block">
            <i class="bi bi-paperclip"></i> View Attachment
          </a>
        ` : ''}
        <p class="text-xs ${isSender ? 'text-white/70' : 'text-gray-500'} mt-1">
          ${formatRelativeTime(message.created_at)}
          ${statusIcon}
        </p>
      </div>
    </div>
  `;
};

// ============ Event Handlers ============

const setupChatEvents = () => {
  // Message form submit
  const form = document.getElementById('message-form');
  form.addEventListener('submit', handleSendMessage);
  
  // Typing detection
  const input = document.getElementById('message-input');
  input.addEventListener('input', handleTyping);
  input.addEventListener('blur', () => {
    if (isTyping) {
      sendTyping(currentOrderId, false);
      isTyping = false;
    }
  });
  
  // Load more messages button
  const loadMoreBtn = document.getElementById('load-more-btn');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', handleLoadMore);
  }
};

const handleLoadMore = async () => {
  if (isLoadingMore || !hasMoreMessages) return;
  
  isLoadingMore = true;
  const loadMoreBtn = document.getElementById('load-more-btn');
  const originalText = loadMoreBtn.innerHTML;
  loadMoreBtn.innerHTML = '<i class="bi bi-hourglass-split spin"></i> Loading...';
  loadMoreBtn.disabled = true;
  
  try {
    const messagesContainer = document.getElementById('chat-messages');
    const scrollHeight = messagesContainer.scrollHeight;
    
    currentOffset += 50;
    await loadMessages(currentOrderId, 50, currentOffset);
    
    // Re-render messages
    messagesContainer.innerHTML = renderMessages();
    
    // Restore scroll position
    const newScrollHeight = messagesContainer.scrollHeight;
    messagesContainer.scrollTop = newScrollHeight - scrollHeight;
    
    // Hide button if no more messages
    if (!hasMoreMessages) {
      document.getElementById('load-more-container').style.display = 'none';
    }
  } catch (error) {
    console.error('Error loading more messages:', error);
    showError('Failed to load older messages');
  } finally {
    isLoadingMore = false;
    loadMoreBtn.innerHTML = originalText;
    loadMoreBtn.disabled = false;
  }
};

const handleSendMessage = async (e) => {
  e.preventDefault();
  
  const input = document.getElementById('message-input');
  const sendBtn = document.getElementById('send-btn');
  const messageText = input.value.trim();
  
  if (!messageText) return;
  
  // Clear typing indicator
  if (isTyping) {
    sendTyping(currentOrderId, false);
    isTyping = false;
  }
  
  // Disable input during send
  input.disabled = true;
  sendBtn.disabled = true;
  sendBtn.innerHTML = '<i class="bi bi-hourglass-split"></i>';
  
  // Create optimistic message
  const tempId = `temp_${Date.now()}`;
  const optimisticMessage = {
    id: tempId,
    order_id: currentOrderId,
    sender_id: getUserId(),
    sender_name: 'You',
    message_text: messageText,
    message_type: 'text',
    is_read: false,
    created_at: new Date().toISOString(),
    pending: true
  };
  
  // Add to pending messages
  pendingMessages.set(tempId, optimisticMessage);
  
  // Add to messages array and render optimistically
  messages.push(optimisticMessage);
  appendMessage(optimisticMessage);
  
  // Clear input immediately for better UX
  input.value = '';
  
  try {
    // Send via API
    const response = await apiSendMessage({
      order_id: currentOrderId,
      message_text: messageText
    });
    
    if (response.success) {
      const realMessage = response.data?.message;
      
      // Replace optimistic message with real one
      const tempIndex = messages.findIndex(m => m.id === tempId);
      if (tempIndex !== -1 && realMessage) {
        messages[tempIndex] = realMessage;
        pendingMessages.delete(tempId);
        
        // Update the message in the DOM
        const messageEl = document.querySelector(`[data-message-id="${tempId}"]`);
        if (messageEl) {
          const newMessageEl = document.createElement('div');
          newMessageEl.innerHTML = renderMessage(realMessage);
          messageEl.replaceWith(newMessageEl.firstElementChild);
        }
      }
      
      // Emit via socket for immediate update to other party
      socketSendMessage(currentOrderId, {
        message_text: messageText
      });
      
      // Invalidate cache
      messageCache.delete(currentOrderId);
    }
  } catch (error) {
    console.error('Error sending message:', error);
    
    // Remove optimistic message on error
    const tempIndex = messages.findIndex(m => m.id === tempId);
    if (tempIndex !== -1) {
      messages.splice(tempIndex, 1);
      const messageEl = document.querySelector(`[data-message-id="${tempId}"]`);
      if (messageEl) {
        messageEl.remove();
      }
    }
    pendingMessages.delete(tempId);
    
    // Restore message to input
    input.value = messageText;
    showError('Failed to send message. Please try again.');
  } finally {
    // Re-enable input
    input.disabled = false;
    sendBtn.disabled = false;
    sendBtn.innerHTML = '<i class="bi bi-send"></i>';
    input.focus();
  }
};

const handleTyping = () => {
  // Clear existing timeout
  if (typingTimeout) {
    clearTimeout(typingTimeout);
  }
  
  // Send typing start if not already typing
  if (!isTyping) {
    sendTyping(currentOrderId, true);
    isTyping = true;
  }
  
  // Set timeout to stop typing after 3 seconds of inactivity
  typingTimeout = setTimeout(() => {
    if (isTyping) {
      sendTyping(currentOrderId, false);
      isTyping = false;
    }
  }, 3000);
};

const handleNewMessage = (data) => {
  const message = data.message || data;
  
  // Don't add if already exists (avoid duplicates)
  if (messages.find(m => m.id === message.id)) {
    return;
  }
  
  // Don't add if it's our own pending message
  if (pendingMessages.has(message.id)) {
    return;
  }
  
  messages.push(message);
  appendMessage(message);
  
  // Invalidate cache
  messageCache.delete(currentOrderId);
  
  // Play notification sound if from other user
  const currentUserId = getUserId();
  if (message.sender_id !== currentUserId) {
    playMessageSound();
  }
};

const handleTypingStatus = (data) => {
  const { userId, userName, isTyping } = data;
  const currentUserId = getUserId();
  
  // Don't show our own typing
  if (userId === currentUserId) return;
  
  if (isTyping) {
    typingUsers.add(userName || 'Someone');
  } else {
    typingUsers.delete(userName || 'Someone');
  }
  
  updateTypingIndicator();
};

const handleUserOnline = (userId) => {
  onlineUsers.add(userId);
  updateOnlineStatus();
};

const handleUserOffline = (userId) => {
  onlineUsers.delete(userId);
  updateOnlineStatus();
};

// ============ UI Updates ============

const appendMessage = (message) => {
  const messagesContainer = document.getElementById('chat-messages');
  if (!messagesContainer) return;
  
  const messageHtml = renderMessage(message);
  messagesContainer.insertAdjacentHTML('beforeend', messageHtml);
  
  scrollToBottom();
};

const updateTypingIndicator = () => {
  const indicator = document.getElementById('typing-indicator');
  const text = document.getElementById('typing-text');
  
  if (!indicator || !text) return;
  
  if (typingUsers.size === 0) {
    indicator.style.display = 'none';
  } else {
    const names = Array.from(typingUsers);
    const typingText = names.length === 1
      ? `${names[0]} is typing...`
      : `${names.length} people are typing...`;
    
    text.textContent = typingText;
    indicator.style.display = 'block';
  }
};

const updateOnlineStatus = () => {
  const statusEl = document.getElementById('online-status');
  if (!statusEl) return;
  
  if (onlineUsers.size > 0) {
    statusEl.innerHTML = '<i class="bi bi-circle-fill text-success"></i> Online';
  } else {
    statusEl.innerHTML = '<i class="bi bi-circle text-gray-400"></i> Offline';
  }
};

const scrollToBottom = (smooth = true) => {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  
  setTimeout(() => {
    container.scrollTo({
      top: container.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto'
    });
  }, 100);
};

// ============ Helpers ============

const escapeHtml = (text) => {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
};

// ============ Cleanup ============

const cleanup = () => {
  // Unsubscribe from all listeners
  unsubscribeFunctions.forEach(unsub => {
    if (typeof unsub === 'function') {
      unsub();
    }
  });
  unsubscribeFunctions = [];
  
  // Clear typing timeout
  if (typingTimeout) {
    clearTimeout(typingTimeout);
    typingTimeout = null;
  }
  
  // Send typing stop if currently typing
  if (isTyping && currentOrderId) {
    sendTyping(currentOrderId, false);
    isTyping = false;
  }
  
  // Leave conversation
  if (currentOrderId) {
    leaveConversation(currentOrderId);
  }
  
  // Clear state
  currentOrderId = null;
  messages = [];
  typingUsers.clear();
  onlineUsers.clear();
  pendingMessages.clear();
  messageQueue = [];
  isLoadingMore = false;
  hasMoreMessages = true;
  currentOffset = 0;
};

// ============ Close Chat ============

window.closeChat = () => {
  cleanup();
  
  const container = document.getElementById('chat-window');
  if (container) {
    container.innerHTML = '<p class="text-center text-gray-500 py-12">Select a conversation to start messaging</p>';
  }
};

// ============ Exports ============

export {
  initChat,
  loadMessages,
  handleSendMessage,
  cleanup,
  scrollToBottom,
  messageCache,
  pendingMessages
};

export default {
  init: initChat,
  cleanup,
  loadMessages,
  clearCache: () => messageCache.clear()
};
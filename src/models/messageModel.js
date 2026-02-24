// src\models\messageModel.js
const { supabase, supabaseService } = require('../config/database');

exports.sendMessage = async (messageData) => {
  const { data, error } = await supabaseService
    .from('messages')
    .insert([{
      order_id: messageData.order_id,
      sender_id: messageData.sender_id,
      message_text: messageData.message_text,
      message_type: messageData.message_type || 'text',
      attachment_path: messageData.attachment_path || null
    }])
    .select()
    .single();

  return { data, error };
};

exports.getOrderMessages = async (orderId, limit = 100, offset = 0) => {
  const { data, error } = await supabase
    .from('messages')
    .select(`
      id,
      order_id,
      sender_id,
      message_text,
      message_type,
      attachment_path,
      is_read,
      read_at,
      created_at,
      sender:users!inner (
        id,
        full_name,
        role
      )
    `, { count: 'exact' })
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // Reverse to show oldest first
  const messages = data ? [...data].reverse() : [];
  return { data: messages, error };
};

exports.getUnreadCount = async (orderId, userId) => {
  const { count, error } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', orderId)
    .eq('is_read', false)
    .neq('sender_id', userId); 

  return { count: count || 0, error };
};

exports.markAsRead = async (orderId, userId) => {
  try {
    // First, get all unread messages that should be marked as read
    const { data: unreadMessages, error: getError } = await supabaseService
      .from('messages')
      .select('id')
      .eq('order_id', orderId)
      .eq('is_read', false)
      .neq('sender_id', userId);

    if (getError) {
      console.error('Error getting unread messages:', getError);
      return { data: [], error: getError };
    }

    if (!unreadMessages || unreadMessages.length === 0) {
      return { data: [], error: null };
    }

    // Update all unread messages to read
    const { data: updatedMessages, error: updateError } = await supabaseService
      .from('messages')
      .update({
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq('order_id', orderId)
      .eq('is_read', false)
      .neq('sender_id', userId)
      .select();

    if (updateError) {
      console.error('Error updating messages to read:', updateError);
      return { data: [], error: updateError };
    }

    return { data: updatedMessages || [], error: null };
  } catch (err) {
    console.error('Exception in markAsRead:', err);
    return { data: [], error: err };
  }
};

exports.getUserConversations = async (userId, role) => {
  try {
    let profileId;
    if (role === 'buyer') {
      const { data: profile } = await supabase
        .from('buyer_profiles')
        .select('id')
        .eq('user_id', userId)
        .single();
      profileId = profile?.id;
    } else {
      const { data: profile } = await supabase
        .from('seller_profiles')
        .select('id')
        .eq('user_id', userId)
        .single();
      profileId = profile?.id;
    }

    if (!profileId) {
      return { data: [], error: null };
    }

    const profileField = role === 'buyer' ? 'buyer_id' : 'seller_id';
    const otherProfile = role === 'buyer' ? 'seller' : 'buyer';

    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        status,
        total_amount,
        created_at,
        ${otherProfile}:${otherProfile === 'seller' ? 'seller_profiles' : 'buyer_profiles'}!inner (
          id,
          user:users!inner (
            id,
            full_name
          )
        )
      `)
      .eq(profileField, profileId)
      .order('created_at', { ascending: false })
      .limit(50); // Limit to recent orders for performance

    if (error || !orders) {
      return { data: [], error };
    }

    if (orders.length === 0) {
      return { data: [], error: null };
    }

    const orderIds = orders.map(o => o.id);

    // Get all messages for relevant orders (newest first).
    const { data: allMessages } = await supabase
      .from('messages')
      .select('order_id, message_text, message_type, attachment_path, created_at, sender_id, is_read')
      .in('order_id', orderIds)
      .order('created_at', { ascending: false });

    const messagesByOrder = new Map();
    (allMessages || []).forEach((message) => {
      if (!messagesByOrder.has(message.order_id)) {
        messagesByOrder.set(message.order_id, []);
      }
      messagesByOrder.get(message.order_id).push(message);
    });

    const getTimestamp = (value) => {
      if (!value) return 0;
      const t = new Date(value).getTime();
      return Number.isNaN(t) ? 0 : t;
    };

    // Group conversations by the other party so multiple orders map to one chat box.
    const groupedConversations = new Map();

    orders.forEach(order => {
      const otherPartyUser = order?.[otherProfile]?.user;
      const groupKey = otherPartyUser?.id || order.id;
      const orderMessages = messagesByOrder.get(order.id) || [];
      const lastMessage = orderMessages[0];
      const unreadCount = orderMessages.filter(m => !m.is_read && m.sender_id !== userId).length;
      const hasAttachment = !!lastMessage?.attachment_path;
      const hasTextMessage = !!lastMessage?.message_text;
      const lastMessagePreview = hasTextMessage
        ? lastMessage.message_text
        : (hasAttachment
          ? (lastMessage.message_type === 'image' ? '[Image attachment]' : '[File attachment]')
          : null);
      const candidateMessageAt = lastMessage?.created_at || null;
      const candidateActivityAt = candidateMessageAt || order.created_at;
      const isCancelled = order.status === 'cancelled';

      const candidate = {
        order_id: order.id,
        order_number: order.order_number,
        order_status: order.status,
        order_total: order.total_amount,
        other_party: otherPartyUser?.full_name || 'Unknown User',
        other_party_id: otherPartyUser?.id || null,
        last_message: lastMessagePreview,
        last_message_at: candidateMessageAt || order.created_at,
        last_message_is_mine: lastMessage?.sender_id === userId,
        unread_count: unreadCount,
        created_at: order.created_at,
        order_ids: new Set([order.id]),
        order_count: 1,
        active_order_ids: new Set(isCancelled ? [] : [order.id]),
        active_order_count: isCancelled ? 0 : 1,
        representative_order_id: order.id,
        representative_order_number: order.order_number,
        representative_order_status: order.status,
        representative_order_total: order.total_amount,
        representative_order_activity_at: candidateActivityAt
      };

      if (!groupedConversations.has(groupKey)) {
        groupedConversations.set(groupKey, candidate);
        return;
      }

      const existing = groupedConversations.get(groupKey);
      existing.order_ids.add(order.id);
      existing.order_count += 1;
      existing.unread_count += unreadCount;
      if (!isCancelled) {
        existing.active_order_ids.add(order.id);
        existing.active_order_count += 1;
      }

      // Prefer an active (non-cancelled) order as chat representative.
      // This prevents grouped chats from being blocked by one cancelled order.
      const existingRepCancelled = existing.representative_order_status === 'cancelled';
      const shouldReplaceRepresentative =
        (!isCancelled && existingRepCancelled) ||
        (!isCancelled && !existingRepCancelled && getTimestamp(candidateActivityAt) > getTimestamp(existing.representative_order_activity_at));

      if (shouldReplaceRepresentative) {
        existing.representative_order_id = order.id;
        existing.representative_order_number = order.order_number;
        existing.representative_order_status = order.status;
        existing.representative_order_total = order.total_amount;
        existing.representative_order_activity_at = candidateActivityAt;
      }

      // Update preview only when the candidate actually has a newer message.
      // This prevents a newly created order (without messages) from wiping preview text.
      const existingMessageAt = existing.last_message ? existing.last_message_at : null;
      if (lastMessage && getTimestamp(candidateMessageAt) > getTimestamp(existingMessageAt)) {
        existing.last_message = candidate.last_message;
        existing.last_message_at = candidateMessageAt;
        existing.last_message_is_mine = candidate.last_message_is_mine;
        existing.created_at = candidate.created_at;
      } else if (!existing.last_message && !lastMessage && getTimestamp(candidateActivityAt) > getTimestamp(existing.last_message_at)) {
        // If no message exists in the thread yet, keep latest order timestamp for ordering.
        existing.last_message_at = candidateActivityAt;
        existing.created_at = candidate.created_at;
      }
    });

    const conversations = Array.from(groupedConversations.values()).map(conv => ({
      ...conv,
      order_id: conv.representative_order_id,
      order_number: conv.representative_order_number,
      order_status: conv.representative_order_status,
      order_total: conv.representative_order_total,
      order_ids: Array.from(conv.order_ids),
      active_order_ids: Array.from(conv.active_order_ids),
      active_order_count: conv.active_order_count
    }));

    conversations.sort((a, b) => 
      new Date(b.last_message_at) - new Date(a.last_message_at)
    );

    return { data: conversations, error: null };

  } catch (error) {
    console.error('Get conversations error:', error);
    return { data: [], error };
  }
};

exports.getTotalUnreadCount = async (userId) => {
  const { count, error } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false)
    .neq('sender_id', userId);

  return { count: count || 0, error };
};

exports.deleteMessage = async (messageId) => {
  const { data, error } = await supabaseService
    .from('messages')
    .delete()
    .eq('id', messageId)
    .select()
    .single();

  return { data, error };
};

exports.isMessageSender = async (messageId, userId) => {
  const { data, error } = await supabase
    .from('messages')
    .select('sender_id')
    .eq('id', messageId)
    .single();

  if (error || !data) {
    return false;
  }

  return data.sender_id === userId;
};

exports.getMessageStats = async (orderId) => {
  const stats = {
    total_messages: 0,
    text_messages: 0,
    image_messages: 0,
    file_messages: 0
  };

  try {
    const { data: messages } = await supabase
      .from('messages')
      .select('message_type')
      .eq('order_id', orderId);

    if (messages) {
      stats.total_messages = messages.length;
      stats.text_messages = messages.filter(m => m.message_type === 'text').length;
      stats.image_messages = messages.filter(m => m.message_type === 'image').length;
      stats.file_messages = messages.filter(m => m.message_type === 'file').length;
    }

    return { data: stats, error: null };

  } catch (error) {
    console.error('Get message stats error:', error);
    return { data: stats, error };
  }
};

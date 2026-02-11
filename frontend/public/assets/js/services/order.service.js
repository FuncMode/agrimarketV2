import { get, post, put, upload } from '../core/http.js';
import { ENDPOINTS } from '../config/api.js';

// Create new order (buyer)
const createOrder = async (orderData) => {
  try {
    const response = await post(ENDPOINTS.ORDERS.CREATE, orderData);
    return response;
  } catch (error) {
    throw error;
  }
};

// Get all orders (buyer or seller)
const getOrders = async (filters = {}) => {
  try {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.page) params.append('page', filters.page);
    if (filters.limit) params.append('limit', filters.limit);
    
    const queryString = params.toString();
    const url = queryString ? `${ENDPOINTS.ORDERS.LIST}?${queryString}` : ENDPOINTS.ORDERS.LIST;
    
    const response = await get(url);
    return response;
  } catch (error) {
    throw error;
  }
};

// Get single order details
const getOrderById = async (orderId) => {
  try {
    const response = await get(ENDPOINTS.ORDERS.BY_ID(orderId));
    return response;
  } catch (error) {
    throw error;
  }
};

// Update order status (seller)
const updateOrderStatus = async (orderId, status, deliveryProofFile = null) => {
  try {
    if (deliveryProofFile) {
      const formData = new FormData();
      formData.append('status', status);
      formData.append('delivery_proof', deliveryProofFile);
      const response = await upload(ENDPOINTS.ORDERS.UPDATE_STATUS(orderId), formData, { method: 'PUT' });
      return response;
    } else {
      const response = await put(ENDPOINTS.ORDERS.UPDATE_STATUS(orderId), { status });
      return response;
    }
  } catch (error) {
    throw error;
  }
};

// Confirm order (seller)
const confirmOrder = async (orderId, deliveryProofFile = null) => {
  try {
    if (deliveryProofFile) {
      const formData = new FormData();
      formData.append('delivery_proof', deliveryProofFile);
      const response = await upload(ENDPOINTS.ORDERS.CONFIRM(orderId), formData);
      return response;
    } else {
      const response = await post(ENDPOINTS.ORDERS.CONFIRM(orderId));
      return response;
    }
  } catch (error) {
    throw error;
  }
};

// Cancel order (buyer or seller)
const cancelOrder = async (orderId, reason) => {
  try {
    const response = await post(ENDPOINTS.ORDERS.CANCEL(orderId), { reason });
    return response;
  } catch (error) {
    throw error;
  }
};

// Get order statistics
const getOrderStats = async () => {
  try {
    const response = await get(ENDPOINTS.ORDERS.STATS);
    return response;
  } catch (error) {
    throw error;
  }
};

// Mark order as ready (seller)
const markOrderReady = async (orderId) => {
  try {
    const response = await post(ENDPOINTS.ORDERS.MARK_READY(orderId));
    return response;
  } catch (error) {
    throw error;
  }
};

// Mark order as completed (seller)
const completeOrder = async (orderId) => {
  try {
    const response = await post(ENDPOINTS.ORDERS.COMPLETE(orderId));
    return response;
  } catch (error) {
    throw error;
  }
};

// Rate order (buyer)
const rateOrder = async (orderId, reviews) => {
  try {
    const response = await post(ENDPOINTS.ORDERS.RATE(orderId), { 
      reviews 
    });
    return response;
  } catch (error) {
    throw error;
  }
};

export {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  confirmOrder,
  cancelOrder,
  getOrderStats,
  markOrderReady,
  completeOrder,
  rateOrder
};
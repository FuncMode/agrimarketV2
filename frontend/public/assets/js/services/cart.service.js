import { get, post, put, del } from '../core/http.js';
import { ENDPOINTS } from '../config/api.js';

// Get user's cart
const getCart = async () => {
  try {
    const response = await get(ENDPOINTS.CART.GET);
    return response;
  } catch (error) {
    throw error;
  }
};

// Add item to cart
const addToCart = async (productId, quantity) => {
  try {
    const response = await post(ENDPOINTS.CART.ADD, {
      product_id: productId,
      quantity
    });
    return response;
  } catch (error) {
    throw error;
  }
};

// Update cart item quantity
const updateCartItem = async (itemId, quantity) => {
  try {
    const response = await put(ENDPOINTS.CART.UPDATE(itemId), { quantity });
    return response;
  } catch (error) {
    throw error;
  }
};

// Remove item from cart
const removeFromCart = async (itemId) => {
  try {
    const response = await del(ENDPOINTS.CART.REMOVE(itemId));
    return response;
  } catch (error) {
    throw error;
  }
};

// Clear entire cart
const clearCart = async () => {
  try {
    const response = await del(ENDPOINTS.CART.CLEAR);
    return response;
  } catch (error) {
    throw error;
  }
};

// Get cart item count
const getCartCount = async () => {
  try {
    const response = await get(ENDPOINTS.CART.COUNT);
    return response;
  } catch (error) {
    throw error;
  }
};

// Validate cart before checkout
const validateCart = async () => {
  try {
    const response = await get(ENDPOINTS.CART.VALIDATE);
    return response;
  } catch (error) {
    throw error;
  }
};

export {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  getCartCount,
  validateCart
};
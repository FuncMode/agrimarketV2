// assets/js/services/product.service.js
// Product Service - Handle all product-related API calls

import { get, post, put, del } from '../core/http.js';
import { ENDPOINTS } from '../config/api.js';

// List all products with filters
export const listProducts = async (filters = {}) => {
  try {
    let url = ENDPOINTS.PRODUCTS.LIST;
    
    // Build query string if filters exist
    if (Object.keys(filters).length > 0) {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
      url += `?${params.toString()}`;
    }
    
    const response = await get(url);
    return response;
  } catch (error) {
    console.error('Error listing products:', error);
    throw error;
  }
};

// Get product by ID
export const getProduct = async (id) => {
  try {
    const response = await get(ENDPOINTS.PRODUCTS.BY_ID(id));
    return response;
  } catch (error) {
    console.error('Error getting product:', error);
    throw error;
  }
};

// Create new product (seller only)
export const createProduct = async (productData) => {
  try {
    const response = await post(ENDPOINTS.PRODUCTS.CREATE, productData);
    return response;
  } catch (error) {
    console.error('Error creating product:', error);
    throw error;
  }
};

// Update product (seller only)
export const updateProduct = async (id, productData) => {
  try {
    const response = await put(ENDPOINTS.PRODUCTS.UPDATE(id), productData);
    return response;
  } catch (error) {
    console.error('Error updating product:', error);
    throw error;
  }
};

// Delete product (seller only)
export const deleteProduct = async (id) => {
  try {
    const response = await del(ENDPOINTS.PRODUCTS.DELETE(id));
    return response;
  } catch (error) {
    console.error('Error deleting product:', error);
    throw error;
  }
};

// Get seller's products
export const getMyProducts = async () => {
  try {
    const response = await get(ENDPOINTS.PRODUCTS.MY_PRODUCTS);
    return response;
  } catch (error) {
    console.error('Error getting my products:', error);
    throw error;
  }
};

// Search products
export const searchProducts = async (query) => {
  try {
    const response = await get(`${ENDPOINTS.PRODUCTS.LIST}?search=${encodeURIComponent(query)}`);
    return response;
  } catch (error) {
    console.error('Error searching products:', error);
    throw error;
  }
};

// Get products by category
export const getProductsByCategory = async (category) => {
  try {
    const response = await get(`${ENDPOINTS.PRODUCTS.LIST}?category=${encodeURIComponent(category)}`);
    return response;
  } catch (error) {
    console.error('Error getting products by category:', error);
    throw error;
  }
};

// Get products by seller
export const getProductsBySeller = async (sellerId) => {
  try {
    const response = await get(`${ENDPOINTS.PRODUCTS.LIST}?seller_id=${sellerId}`);
    return response;
  } catch (error) {
    console.error('Error getting products by seller:', error);
    throw error;
  }
};

// Increment product view count
export const incrementViewCount = async (productId) => {
  try {
    const response = await post(`${ENDPOINTS.PRODUCTS.LIST}/${productId}/view`, {});
    return response;
  } catch (error) {
    console.error('Error incrementing view count:', error);
    // Don't throw error - view count increment should not block UI
  }
};

// ============ Analytics Services ============

// Get comprehensive analytics data
export const getSellerAnalytics = async () => {
  try {
    const response = await get(ENDPOINTS.PRODUCTS.ANALYTICS);
    return response;
  } catch (error) {
    console.error('Error getting seller analytics:', error);
    throw error;
  }
};

// Get sales over time data for charts
export const getSalesOverTime = async (period = 'last_30_days') => {
  try {
    const url = `${ENDPOINTS.PRODUCTS.SALES_OVER_TIME}?period=${period}`;
    const response = await get(url);
    return response;
  } catch (error) {
    console.error('Error getting sales over time:', error);
    throw error;
  }
};

// Get top products by sales, views, or orders
export const getTopProducts = async (limit = 10, sortBy = 'sales') => {
  try {
    const url = `${ENDPOINTS.PRODUCTS.TOP_PRODUCTS}?limit=${limit}&sortBy=${sortBy}`;
    const response = await get(url);
    return response;
  } catch (error) {
    console.error('Error getting top products:', error);
    throw error;
  }
};

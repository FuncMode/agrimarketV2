import { get, put, del } from '../core/http.js';
import { ENDPOINTS } from '../config/api.js';

const getProfile = async () => {
  try {
    const response = await get(ENDPOINTS.USERS.PROFILE);
    return response;
  } catch (error) {
    throw error;
  }
};

const updateProfile = async (profileData) => {
  try {
    const response = await put(ENDPOINTS.USERS.UPDATE_PROFILE, profileData);
    return response;
  } catch (error) {
    throw error;
  }
};

const getDashboardStats = async () => {
  try {
    const response = await get(ENDPOINTS.USERS.STATS);
    return response;
  } catch (error) {
    throw error;
  }
};

const getSellerProfile = async (sellerId) => {
  try {
    const response = await get(ENDPOINTS.USERS.SELLER_BY_ID(sellerId), { includeAuth: false });
    return response;
  } catch (error) {
    throw error;
  }
};

const getSellers = async () => {
  try {
    const response = await get(ENDPOINTS.USERS.SELLERS, { includeAuth: false });
    return response;
  } catch (error) {
    throw error;
  }
};

const deleteAccount = async () => {
  try {
    const response = await del(ENDPOINTS.USERS.DELETE_ACCOUNT);
    return response;
  } catch (error) {
    throw error;
  }
};

export {
  getProfile,
  updateProfile,
  getDashboardStats,
  getSellerProfile,
  getSellers,
  deleteAccount
};
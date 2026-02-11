// assets/js/services/admin.service.js
import { get, post, put, del } from '../core/http.js';
import { ENDPOINTS } from '../config/api.js';

// Get admin dashboard stats
const getDashboardStats = async () => {
  try {
    const response = await get(ENDPOINTS.ADMIN.DASHBOARD);
    return response;
  } catch (error) {
    throw error;
  }
};

// Get all users with filters
const getAllUsers = async (filters = {}) => {
  try {
    const params = new URLSearchParams();
    if (filters.role) params.append('role', filters.role);
    if (filters.status) params.append('status', filters.status);
    if (filters.search) params.append('search', filters.search);
    if (filters.page) params.append('page', filters.page);
    if (filters.limit) params.append('limit', filters.limit);
    
    const queryString = params.toString();
    const url = queryString ? `${ENDPOINTS.ADMIN.USERS}?${queryString}` : ENDPOINTS.ADMIN.USERS;
    
    const response = await get(url);
    return response;
  } catch (error) {
    throw error;
  }
};

// Get user details
const getUserDetails = async (userId) => {
  try {
    const response = await get(ENDPOINTS.ADMIN.USER_DETAILS(userId));
    return response;
  } catch (error) {
    throw error;
  }
};

// Suspend user
const suspendUser = async (userId, reason, suspensionDays = 7) => {
  try {
    const response = await post(ENDPOINTS.ADMIN.SUSPEND_USER(userId), { 
      reason,
      suspension_days: suspensionDays 
    });
    return response;
  } catch (error) {
    throw error;
  }
};

// Ban user
const banUser = async (userId, reason) => {
  try {
    const response = await post(ENDPOINTS.ADMIN.BAN_USER(userId), { reason });
    return response;
  } catch (error) {
    throw error;
  }
};

// Reinstate user
const reinstateUser = async (userId) => {
  try {
    const response = await post(ENDPOINTS.ADMIN.REINSTATE_USER(userId));
    return response;
  } catch (error) {
    throw error;
  }
};

// Delete user
const deleteUser = async (userId, reason = '') => {
  try {
    const body = reason ? { reason } : undefined;
    const response = await del(ENDPOINTS.ADMIN.DELETE_USER(userId), body);
    return response;
  } catch (error) {
    throw error;
  }
};

// Get system logs
const getSystemLogs = async (filters = {}) => {
  try {
    const params = new URLSearchParams();
    if (filters.type) params.append('type', filters.type);
    if (filters.date) params.append('date', filters.date);
    if (filters.page) params.append('page', filters.page);
    
    const queryString = params.toString();
    const url = queryString ? `${ENDPOINTS.ADMIN.LOGS}?${queryString}` : ENDPOINTS.ADMIN.LOGS;
    
    const response = await get(url);
    return response;
  } catch (error) {
    throw error;
  }
};

// Get admin stats
const getAdminStats = async () => {
  try {
    const response = await get(ENDPOINTS.ADMIN.STATS);
    return response;
  } catch (error) {
    throw error;
  }
};

// Get socket connections
const getSocketConnections = async () => {
  try {
    const response = await get(ENDPOINTS.ADMIN.SOCKET_CONNECTIONS);
    return response;
  } catch (error) {
    throw error;
  }
};

// Get IP blocking stats
const getIPBlockingStats = async () => {
  try {
    const response = await get(ENDPOINTS.ADMIN.IP_BLOCKING);
    return response;
  } catch (error) {
    throw error;
  }
};

// Get database stats
const getDatabaseStats = async () => {
  try {
    const response = await get(ENDPOINTS.ADMIN.DATABASE_STATS);
    return response;
  } catch (error) {
    throw error;
  }
};

export {
  getDashboardStats,
  getAllUsers,
  getUserDetails,
  suspendUser,
  banUser,
  reinstateUser,
  deleteUser,
  getSystemLogs,
  getAdminStats,
  getSocketConnections,
  getIPBlockingStats,
  getDatabaseStats
};
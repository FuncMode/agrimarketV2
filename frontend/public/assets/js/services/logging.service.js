// assets/js/services/logging.service.js
// Logging Service - Admin audit trails and system logs

import { get, post } from '../core/http.js';
import { ENDPOINTS } from '../config/api.js';

// Get admin logs
const getAdminLogs = async (filters = {}) => {
  try {
    const params = new URLSearchParams();
    if (filters.action) params.append('action', filters.action);
    if (filters.user_id) params.append('user_id', filters.user_id);
    if (filters.start_date) params.append('start_date', filters.start_date);
    if (filters.end_date) params.append('end_date', filters.end_date);
    if (filters.page) params.append('page', filters.page);
    if (filters.limit) params.append('limit', filters.limit);
    
    const queryString = params.toString();
    const url = queryString ? `${ENDPOINTS.LOGS.ADMIN}?${queryString}` : ENDPOINTS.LOGS.ADMIN;
    
    const response = await get(url);
    return response;
  } catch (error) {
    throw error;
  }
};

// Get audit trail for specific record
const getAuditTrail = async (recordId) => {
  try {
    const response = await get(ENDPOINTS.LOGS.AUDIT(recordId));
    return response;
  } catch (error) {
    throw error;
  }
};

// Get security events
const getSecurityEvents = async (filters = {}) => {
  try {
    const params = new URLSearchParams();
    if (filters.severity) params.append('severity', filters.severity);
    if (filters.start_date) params.append('start_date', filters.start_date);
    if (filters.end_date) params.append('end_date', filters.end_date);
    if (filters.page) params.append('page', filters.page);
    
    const queryString = params.toString();
    const url = queryString ? `${ENDPOINTS.LOGS.SECURITY}?${queryString}` : ENDPOINTS.LOGS.SECURITY;
    
    const response = await get(url);
    return response;
  } catch (error) {
    throw error;
  }
};

// Get authentication failures
const getAuthFailures = async (filters = {}) => {
  try {
    const params = new URLSearchParams();
    if (filters.ip_address) params.append('ip_address', filters.ip_address);
    if (filters.start_date) params.append('start_date', filters.start_date);
    if (filters.end_date) params.append('end_date', filters.end_date);
    if (filters.page) params.append('page', filters.page);
    
    const queryString = params.toString();
    const url = queryString ? `${ENDPOINTS.LOGS.AUTH_FAILURES}?${queryString}` : ENDPOINTS.LOGS.AUTH_FAILURES;
    
    const response = await get(url);
    return response;
  } catch (error) {
    throw error;
  }
};

// Get audit statistics
const getAuditStats = async () => {
  try {
    const response = await get(ENDPOINTS.LOGS.AUDIT_STATS);
    return response;
  } catch (error) {
    throw error;
  }
};

// Get log statistics
const getLogStats = async (filters = {}) => {
  try {
    const params = new URLSearchParams();
    if (filters.start_date) params.append('start_date', filters.start_date);
    if (filters.end_date) params.append('end_date', filters.end_date);
    
    const queryString = params.toString();
    const url = queryString ? `${ENDPOINTS.LOGS.STATS}?${queryString}` : ENDPOINTS.LOGS.STATS;
    
    const response = await get(url);
    return response;
  } catch (error) {
    throw error;
  }
};

// Search logs
const searchLogs = async (searchQuery, filters = {}) => {
  try {
    const params = new URLSearchParams();
    params.append('query', searchQuery);
    if (filters.type) params.append('type', filters.type);
    if (filters.start_date) params.append('start_date', filters.start_date);
    if (filters.end_date) params.append('end_date', filters.end_date);
    if (filters.page) params.append('page', filters.page);
    
    const queryString = params.toString();
    const url = `${ENDPOINTS.LOGS.SEARCH}?${queryString}`;
    
    const response = await get(url);
    return response;
  } catch (error) {
    throw error;
  }
};

// Get user activity logs
const getUserActivity = async (userId, filters = {}) => {
  try {
    const params = new URLSearchParams();
    if (filters.action) params.append('action', filters.action);
    if (filters.start_date) params.append('start_date', filters.start_date);
    if (filters.end_date) params.append('end_date', filters.end_date);
    if (filters.page) params.append('page', filters.page);
    
    const queryString = params.toString();
    const url = queryString ? 
      `${ENDPOINTS.LOGS.USER_ACTIVITY(userId)}?${queryString}` : 
      ENDPOINTS.LOGS.USER_ACTIVITY(userId);
    
    const response = await get(url);
    return response;
  } catch (error) {
    throw error;
  }
};

// Get suspicious activity for user
const getSuspiciousActivity = async (userId) => {
  try {
    const response = await get(ENDPOINTS.LOGS.SUSPICIOUS(userId));
    return response;
  } catch (error) {
    throw error;
  }
};

// Export logs
const exportLogs = async (filters = {}) => {
  try {
    const params = new URLSearchParams();
    if (filters.type) params.append('type', filters.type);
    if (filters.start_date) params.append('start_date', filters.start_date);
    if (filters.end_date) params.append('end_date', filters.end_date);
    if (filters.format) params.append('format', filters.format); // csv, json, xlsx
    
    const queryString = params.toString();
    const url = queryString ? `${ENDPOINTS.LOGS.EXPORT}?${queryString}` : ENDPOINTS.LOGS.EXPORT;
    
    const response = await get(url);
    return response;
  } catch (error) {
    throw error;
  }
};

// Cleanup old logs (admin only)
const cleanupLogs = async (olderThanDays) => {
  try {
    const response = await post(ENDPOINTS.LOGS.CLEANUP, { older_than_days: olderThanDays });
    return response;
  } catch (error) {
    throw error;
  }
};

export {
  getAdminLogs,
  getAuditTrail,
  getSecurityEvents,
  getAuthFailures,
  getAuditStats,
  getLogStats,
  searchLogs,
  getUserActivity,
  getSuspiciousActivity,
  exportLogs,
  cleanupLogs
};
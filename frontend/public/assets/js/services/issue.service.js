// assets/js/services/issue.service.js
// Issue Service - Handle disputes and issues

import { get, post, put, del } from '../core/http.js';
import { ENDPOINTS } from '../config/api.js';

// Create new issue
const createIssue = async (issueData) => {
  try {
    const response = await post(ENDPOINTS.ISSUES.CREATE, issueData);
    return response;
  } catch (error) {
    throw error;
  }
};

// Get user's issues
const getMyIssues = async () => {
  try {
    const response = await get(ENDPOINTS.ISSUES.MY_ISSUES);
    return response;
  } catch (error) {
    throw error;
  }
};

// Get single issue details
const getIssue = async (issueId) => {
  try {
    const response = await get(ENDPOINTS.ISSUES.BY_ID(issueId));
    return response;
  } catch (error) {
    throw error;
  }
};

// Get issues by order
const getIssuesByOrder = async (orderId) => {
  try {
    const response = await get(ENDPOINTS.ISSUES.BY_ORDER(orderId));
    return response;
  } catch (error) {
    throw error;
  }
};

// Add evidence to issue
const addEvidence = async (issueId, evidenceData) => {
  try {
    const response = await post(ENDPOINTS.ISSUES.ADD_EVIDENCE(issueId), evidenceData);
    return response;
  } catch (error) {
    throw error;
  }
};

// Admin: Get pending issues
const getPendingIssues = async () => {
  try {
    const response = await get(ENDPOINTS.ISSUES.ADMIN_PENDING);
    return response;
  } catch (error) {
    throw error;
  }
};

// Admin: Get all issues with filters
const getIssues = async (filters = {}) => {
  try {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.type) params.append('type', filters.type);
    if (filters.page) params.append('page', filters.page);
    
    let url = ENDPOINTS.ISSUES.ADMIN_PENDING;
    
    if (filters.status === 'resolved') {
      url = ENDPOINTS.ISSUES.ADMIN_RESOLVED;
    } else if (filters.status === 'rejected') {
      url = ENDPOINTS.ISSUES.ADMIN_REJECTED;
    }
    
    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
    
    const response = await get(url);
    return response;
  } catch (error) {
    throw error;
  }
};

// Admin: Get issue statistics
const getIssueStats = async () => {
  try {
    const response = await get(ENDPOINTS.ISSUES.ADMIN_STATS);
    return response;
  } catch (error) {
    throw error;
  }
};

// Admin: Resolve issue
const resolveIssue = async (issueId, resolution) => {
  try {
    const response = await post(ENDPOINTS.ISSUES.ADMIN_RESOLVE(issueId), { resolution });
    return response;
  } catch (error) {
    throw error;
  }
};

// Admin: Reject issue
const rejectIssue = async (issueId, reason) => {
  try {
    const response = await post(ENDPOINTS.ISSUES.ADMIN_REJECT(issueId), { reason });
    return response;
  } catch (error) {
    throw error;
  }
};

export {
  createIssue,
  getMyIssues,
  getIssue,
  getIssuesByOrder,
  addEvidence,
  getPendingIssues,
  getIssues,
  getIssueStats,
  resolveIssue,
  rejectIssue
};
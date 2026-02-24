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
const getMyIssues = async (filters = {}) => {
  try {
    const params = new URLSearchParams();
    if (filters.status && filters.status !== 'all') params.append('status', filters.status);
    if (filters.issue_type) params.append('issue_type', filters.issue_type);
    const query = params.toString();
    const url = query ? `${ENDPOINTS.ISSUES.MY_ISSUES}?${query}` : ENDPOINTS.ISSUES.MY_ISSUES;
    const response = await get(url);
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
    if (filters.type) params.append('issue_type', filters.type);
    if (filters.issue_type) params.append('issue_type', filters.issue_type);
    if (filters.priority) params.append('priority', filters.priority);
    if (filters.overdue_only !== undefined) params.append('overdue_only', String(!!filters.overdue_only));
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
const resolveIssue = async (issueId, resolution, outcome = {}) => {
  try {
    const response = await post(ENDPOINTS.ISSUES.ADMIN_RESOLVE(issueId), {
      resolution,
      ...outcome
    });
    return response;
  } catch (error) {
    throw error;
  }
};

// Admin: Reject issue
const rejectIssue = async (issueId, reason, outcome = {}) => {
  try {
    const response = await post(ENDPOINTS.ISSUES.ADMIN_REJECT(issueId), {
      resolution: reason,
      ...outcome
    });
    return response;
  } catch (error) {
    throw error;
  }
};

const getIssueTimeline = async (issueId) => {
  try {
    const response = await get(ENDPOINTS.ISSUES.ADMIN_TIMELINE(issueId));
    return response;
  } catch (error) {
    throw error;
  }
};

const addIssueNote = async (issueId, note) => {
  try {
    const response = await post(ENDPOINTS.ISSUES.ADMIN_NOTE(issueId), { note });
    return response;
  } catch (error) {
    throw error;
  }
};

const setIssuePriority = async (issueId, priority) => {
  try {
    const response = await post(ENDPOINTS.ISSUES.ADMIN_PRIORITY(issueId), { priority });
    return response;
  } catch (error) {
    throw error;
  }
};

const setIssueOutcome = async (issueId, outcomeData) => {
  try {
    const response = await post(ENDPOINTS.ISSUES.ADMIN_OUTCOME(issueId), outcomeData);
    return response;
  } catch (error) {
    throw error;
  }
};

const escalateIssue = async (issueId, note = '') => {
  try {
    const response = await post(ENDPOINTS.ISSUES.ADMIN_ESCALATE(issueId), note ? { note } : {});
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
  rejectIssue,
  getIssueTimeline,
  addIssueNote,
  setIssuePriority,
  setIssueOutcome,
  escalateIssue
};

import { post, get, upload, put, del } from '../core/http.js';
import { ENDPOINTS } from '../config/api.js';

// Submit verification documents
const submitVerification = async (formData) => {
  try {
    const response = await upload(ENDPOINTS.VERIFICATION.SUBMIT, formData);
    return response;
  } catch (error) {
    throw error;
  }
};


const getVerificationStatus = async () => {
  try {
    const response = await get(ENDPOINTS.VERIFICATION.STATUS);
    return response;
  } catch (error) {
    throw error;
  }
};


const getPendingVerifications = async (filters = {}) => {
  try {
    const params = new URLSearchParams();
    if (filters.page) params.append('page', filters.page);
    if (filters.limit) params.append('limit', filters.limit);
    if (filters.status) params.append('status', filters.status);
    
    const endpoint = params.toString() 
      ? `${ENDPOINTS.VERIFICATION.ADMIN_PENDING}?${params.toString()}`
      : ENDPOINTS.VERIFICATION.ADMIN_PENDING;
    
    const response = await get(endpoint);
    return response;
  } catch (error) {
    throw error;
  }
};


const approveVerification = async (verificationId) => {
  try {
    const response = await post(ENDPOINTS.VERIFICATION.ADMIN_APPROVE(verificationId), {
      admin_notes: ''
    });
    return response;
  } catch (error) {
    throw error;
  }
};


const rejectVerification = async (verificationId, reason) => {
  try {
    const response = await post(ENDPOINTS.VERIFICATION.ADMIN_REJECT(verificationId), {
      admin_notes: reason
    });
    return response;
  } catch (error) {
    throw error;
  }
};


const requestMoreEvidence = async (verificationId, message) => {
  try {
    const response = await post(ENDPOINTS.VERIFICATION.ADMIN_MORE_EVIDENCE(verificationId), {
      admin_notes: message
    });
    return response;
  } catch (error) {
    throw error;
  }
};


const getVerificationDetails = async (verificationId) => {
  try {
    const response = await get(ENDPOINTS.VERIFICATION.ADMIN_DETAILS(verificationId));
    return response;
  } catch (error) {
    throw error;
  }
};

export {
  submitVerification,
  getVerificationStatus,
  getPendingVerifications,
  approveVerification,
  rejectVerification,
  requestMoreEvidence,
  getVerificationDetails
};
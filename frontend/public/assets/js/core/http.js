// assets/js/core/http.js
// HTTP Wrapper - Fetch with Auto-JWT, Error Normalization

import { getToken } from './auth.js';
import { buildUrl } from '../config/api.js';

// ============ HTTP Client ============

class HttpClient {
  constructor() {
    this.defaultHeaders = {
      'Content-Type': 'application/json'
    };
  }
  
  // Get headers with auth token
  getHeaders(customHeaders = {}, includeAuth = true) {
    const headers = { ...this.defaultHeaders, ...customHeaders };
    
    if (includeAuth) {
      const token = getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
    
    return headers;
  }
  
  // Normalize error responses
  normalizeError(error) {
    return {
      success: false,
      message: error.message || 'An error occurred',
      errors: error.errors || null,
      status: error.status || 500
    };
  }
  
  // Generic request method
  async request(url, options = {}) {
    const { 
      method = 'GET', 
      body = null, 
      headers = {}, 
      includeAuth = true,
      isFullUrl = false
    } = options;
    
    const fullUrl = isFullUrl ? url : buildUrl(url);
    
    const config = {
      method,
      headers: this.getHeaders(headers, includeAuth)
    };
    
    if (body) {
      if (body instanceof FormData) {
        // For FormData, remove Content-Type to let browser set it
        delete config.headers['Content-Type'];
        config.body = body;
      } else {
        config.body = JSON.stringify(body);
      }
    }
    
    try {
      const response = await fetch(fullUrl, config);
      const data = await response.json();
      
      if (!response.ok) {
        throw {
          message: data.message || 'Request failed',
          errors: data.errors || null,
          status: response.status
        };
      }
      
      return data;
    } catch (error) {
      if (error.status) {
        throw this.normalizeError(error);
      }
      
      // Network or parsing error
      throw this.normalizeError({
        message: 'Network error. Please check your connection.',
        status: 0
      });
    }
  }
  
  // GET request
  async get(url, options = {}) {
    return this.request(url, { ...options, method: 'GET' });
  }
  
  // POST request
  async post(url, body, options = {}) {
    return this.request(url, { ...options, method: 'POST', body });
  }
  
  // PUT request
  async put(url, body, options = {}) {
    return this.request(url, { ...options, method: 'PUT', body });
  }
  
  // PATCH request
  async patch(url, body, options = {}) {
    return this.request(url, { ...options, method: 'PATCH', body });
  }
  
  // DELETE request
  async delete(url, body = null, options = {}) {
    return this.request(url, { ...options, method: 'DELETE', body });
  }
  
  // Upload file(s) - supports both POST and PUT
  async upload(url, formData, options = {}) {
    if (!(formData instanceof FormData)) {
      throw new Error('Upload requires FormData object');
    }
    
    const method = options.method || 'POST';
    
    return this.request(url, { 
      ...options, 
      method, 
      body: formData 
    });
  }
}

// Create singleton instance
const http = new HttpClient();

// ============ Convenience Functions ============

const get = (url, options) => http.get(url, options);
const post = (url, body, options) => http.post(url, body, options);
const put = (url, body, options) => http.put(url, body, options);
const patch = (url, body, options) => http.patch(url, body, options);
const del = (url, body = null, options) => http.delete(url, body, options);
const upload = (url, formData, options) => http.upload(url, formData, options);

// ============ Exports ============

export {
  http,
  get,
  post,
  put,
  patch,
  del,
  upload
};

export default http;
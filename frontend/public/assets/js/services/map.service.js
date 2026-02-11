// assets/js/services/map.service.js
// Map Service - Seller locations, distance, and routing

import { get, post } from '../core/http.js';
import { ENDPOINTS } from '../config/api.js';

// Get all seller pins for map
const getSellerPins = async (filters = {}) => {
  try {
    const params = new URLSearchParams();
    if (filters.municipality) params.append('municipality', filters.municipality);
    if (filters.verified_only) params.append('verified_only', 'true');
    if (filters.category) params.append('category', filters.category);
    
    const queryString = params.toString();
    const url = queryString ? `${ENDPOINTS.MAP.SELLERS}?${queryString}` : ENDPOINTS.MAP.SELLERS;
    
    const response = await get(url, { includeAuth: false });
    return response;
  } catch (error) {
    throw error;
  }
};

// Get municipalities in Rizal
const getMunicipalities = async () => {
  try {
    const response = await get(ENDPOINTS.MAP.MUNICIPALITIES, { includeAuth: false });
    return response;
  } catch (error) {
    throw error;
  }
};

// Calculate distance between two points
const calculateDistance = async (fromLat, fromLng, toLat, toLng) => {
  try {
    const response = await post(ENDPOINTS.MAP.DISTANCE, {
      start_lat: fromLat,
      start_lon: fromLng,
      end_lat: toLat,
      end_lon: toLng
    }, { includeAuth: false });
    return response;
  } catch (error) {
    throw error;
  }
};

// Get route between two points
const getRoute = async (fromLat, fromLng, toLat, toLng) => {
  try {
    const response = await post(ENDPOINTS.MAP.ROUTE, {
      start_lat: fromLat,
      start_lon: fromLng,
      end_lat: toLat,
      end_lon: toLng
    }, { includeAuth: false });
    return response;
  } catch (error) {
    throw error;
  }
};

// Geocode address to coordinates
const geocodeAddress = async (address) => {
  try {
    const response = await post(ENDPOINTS.MAP.GEOCODE, { address }, { includeAuth: false });
    return response;
  } catch (error) {
    // Return error response instead of throwing
    console.error('Geocode error:', error);
    return {
      success: false,
      message: error?.message || 'Failed to geocode address',
      data: null
    };
  }
};

// Reverse geocode coordinates to address
const reverseGeocode = async (latitude, longitude) => {
  try {
    const response = await post(ENDPOINTS.MAP.REVERSE_GEOCODE, {
      latitude,
      longitude
    }, { includeAuth: false });
    return response;
  } catch (error) {
    // Return error response instead of throwing
    console.error('Reverse geocode error:', error);
    return {
      success: false,
      message: error?.message || 'Failed to get address',
      data: null
    };
  }
};

// Get nearby sellers
const getNearbySellers = async (latitude, longitude, radiusKm = 10) => {
  try {
    const params = new URLSearchParams();
    params.append('latitude', latitude);
    params.append('longitude', longitude);
    params.append('radius_km', radiusKm);
    
    const url = `${ENDPOINTS.MAP.NEARBY_SELLERS}?${params.toString()}`;
    const response = await get(url, { includeAuth: false });
    return response;
  } catch (error) {
    throw error;
  }
};

// Helper: Calculate distance using Haversine formula (client-side)
const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance; // in kilometers
};

const toRad = (degrees) => {
  return degrees * (Math.PI / 180);
};

// Helper: Format distance for display
const formatDistance = (distanceKm) => {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  return `${distanceKm.toFixed(1)} km`;
};

export {
  getSellerPins,
  getMunicipalities,
  calculateDistance,
  getRoute,
  geocodeAddress,
  reverseGeocode,
  getNearbySellers,
  haversineDistance,
  formatDistance
};
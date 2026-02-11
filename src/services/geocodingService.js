// src\services\geocodingService.js

const axios = require('axios');


const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
const HEADERS = {
  'User-Agent': 'AgriMarket-Philippines/1.0'
};

exports.geocodeAddress = async (address, municipality = null) => {
  try {
    const searchQuery = municipality 
      ? `${address}, ${municipality}, Rizal, Philippines`
      : `${address}, Rizal, Philippines`;

    const response = await axios.get(`${NOMINATIM_BASE_URL}/search`, {
      params: {
        q: searchQuery,
        format: 'json',
        limit: 1,
        countrycodes: 'ph',
        addressdetails: 1
      },
      headers: HEADERS,
      timeout: 10000
    });

    if (!response.data || response.data.length === 0) {
      return {
        success: false,
        error: 'Address not found. Please provide a more specific address.'
      };
    }

    const result = response.data[0];

    return {
      success: true,
      data: {
        latitude: parseFloat(result.lat),
        longitude: parseFloat(result.lon),
        formatted_address: result.display_name,
        municipality: result.address?.municipality || result.address?.city || municipality,
        province: result.address?.province || result.address?.state || 'Rizal',
        barangay: result.address?.suburb || result.address?.village || null,
        street: result.address?.road || null,
        postal_code: result.address?.postcode || null,
        country: 'Philippines'
      }
    };

  } catch (error) {
    console.error('Geocoding error:', error.message);
    return {
      success: false,
      error: 'Failed to geocode address. Please try again.'
    };
  }
};

exports.reverseGeocode = async (latitude, longitude) => {
  try {
    const response = await axios.get(`${NOMINATIM_BASE_URL}/reverse`, {
      params: {
        lat: latitude,
        lon: longitude,
        format: 'json',
        addressdetails: 1
      },
      headers: HEADERS,
      timeout: 10000
    });

    if (!response.data) {
      return {
        success: false,
        error: 'Location not found.'
      };
    }

    const result = response.data;
    const address = result.address || {};

    const municipality = 
      address.municipality || 
      address.city || 
      address.town || 
      address.village || 
      address.suburb ||
      null;

    let barangay = null;
    if (result.display_name && municipality) {
      const parts = result.display_name.split(',').map(p => p.trim());
      const munIndex = parts.findIndex(p => p.toLowerCase().includes(municipality.toLowerCase()));
      if (munIndex > 0) {
        barangay = parts[munIndex - 1];
      }
    }

    if (!barangay) {
      barangay = 
        address.suburb || 
        address.village || 
        address.neighbourhood ||
        address.residential ||
        address.hamlet ||
        null;
    }

    return {
      success: true,
      data: {
        latitude: latitude,
        longitude: longitude,
        formatted_address: result.display_name,
        municipality: municipality,
        province: address.province || address.state || null,
        barangay: barangay,
        street: address.road || null,
        house_number: address.house_number || null,
        postal_code: address.postcode || null,
        country: address.country || 'Philippines'
      }
    };

  } catch (error) {
    console.error('Reverse geocoding error:', error.message);
    return {
      success: false,
      error: 'Failed to get address. Please try again.'
    };
  }
};

exports.isWithinRizal = (latitude, longitude) => {
  const RIZAL_BOUNDS = {
    min_lat: 14.2,
    max_lat: 14.9,
    min_lon: 121.0,
    max_lon: 121.4
  };

  return (
    latitude >= RIZAL_BOUNDS.min_lat &&
    latitude <= RIZAL_BOUNDS.max_lat &&
    longitude >= RIZAL_BOUNDS.min_lon &&
    longitude <= RIZAL_BOUNDS.max_lon
  );
};

exports.isWithinPhilippines = (latitude, longitude) => {
  const PHILIPPINES_BOUNDS = {
    min_lat: 4.5,
    max_lat: 21.5,
    min_lon: 116.0,
    max_lon: 127.0
  };

  return (
    latitude >= PHILIPPINES_BOUNDS.min_lat &&
    latitude <= PHILIPPINES_BOUNDS.max_lat &&
    longitude >= PHILIPPINES_BOUNDS.min_lon &&
    longitude <= PHILIPPINES_BOUNDS.max_lon
  );
};

exports.getMunicipalityCoordinates = (municipality) => {
  const RIZAL_MUNICIPALITIES = {
    'Angono': { lat: 14.5267, lon: 121.1537 },
    'Antipolo': { lat: 14.5864, lon: 121.1760 },
    'Baras': { lat: 14.5233, lon: 121.2650 },
    'Binangonan': { lat: 14.4647, lon: 121.1925 },
    'Cainta': { lat: 14.5778, lon: 121.1222 },
    'Cardona': { lat: 14.4881, lon: 121.2294 },
    'Jalajala': { lat: 14.3544, lon: 121.3242 },
    'Morong': { lat: 14.5119, lon: 121.2392 },
    'Pililla': { lat: 14.4856, lon: 121.3092 },
    'Rodriguez': { lat: 14.7603, lon: 121.1164 },
    'San Mateo': { lat: 14.6978, lon: 121.1225 },
    'Tanay': { lat: 14.4989, lon: 121.2858 },
    'Taytay': { lat: 14.5547, lon: 121.1324 },
    'Teresa': { lat: 14.5603, lon: 121.2072 }
  };

  const coords = RIZAL_MUNICIPALITIES[municipality];
  
  if (!coords) {
    return null;
  }

  return {
    latitude: coords.lat,
    longitude: coords.lon,
    municipality
  };
};

exports.batchGeocode = async (addresses) => {
  const results = [];
  
  for (const address of addresses) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const result = await exports.geocodeAddress(address.address, address.municipality);
    results.push({
      ...address,
      geocoding_result: result
    });
  }

  return {
    success: true,
    data: results
  };
};

exports.validateAddress = (address) => {
  const errors = [];

  if (!address || address.trim().length === 0) {
    errors.push('Address is required');
  }

  if (address && address.length < 10) {
    errors.push('Address is too short (minimum 10 characters)');
  }

  if (address && address.length > 500) {
    errors.push('Address is too long (maximum 500 characters)');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

exports.formatAddress = (addressData) => {
  const parts = [];

  if (addressData.house_number && addressData.street) {
    parts.push(`${addressData.house_number} ${addressData.street}`);
  } else if (addressData.street) {
    parts.push(addressData.street);
  }

  if (addressData.barangay) {
    parts.push(addressData.barangay);
  }

  if (addressData.municipality) {
    parts.push(addressData.municipality);
  }

  if (addressData.province) {
    parts.push(addressData.province);
  }

  if (addressData.postal_code) {
    parts.push(addressData.postal_code);
  }

  return parts.join(', ');
};

module.exports = exports;
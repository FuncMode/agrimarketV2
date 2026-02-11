// src\services\mapService.js
const axios = require('axios');

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';

const OSRM_BASE_URL = 'https://router.project-osrm.org';

const HEADERS = {
  'User-Agent': 'AgriMarket-Philippines/1.0'
};

const PHILIPPINES_BBOX = {
  min_lat: 4.5,
  max_lat: 21.5,
  min_lon: 116.0,
  max_lon: 127.0
};

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


exports.searchAddresses = async (query, municipality = null) => {
  try {
    if (!query || query.trim().length < 3) {
      return {
        success: true,
        data: []
      };
    }

    // Build search query with municipality constraint
    let searchQuery = query;
    if (municipality) {
      // Add municipality to search query for more accurate results
      searchQuery = `${query}, ${municipality}`;
    }

    const response = await axios.get(`${NOMINATIM_BASE_URL}/search`, {
      params: {
        q: searchQuery,
        format: 'json',
        limit: 10,
        countrycodes: 'ph',
        addressdetails: 1
      },
      headers: HEADERS,
      timeout: 10000
    });

    if (!response.data || response.data.length === 0) {
      return {
        success: true,
        data: []
      };
    }

    const results = response.data.map(item => {
      const address_obj = item.address || {};
      const itemMunicipality = 
        address_obj.municipality || 
        address_obj.city || 
        address_obj.town || 
        address_obj.village || 
        address_obj.suburb ||
        null;

      return {
        formatted_address: item.display_name,
        latitude: parseFloat(item.lat),
        longitude: parseFloat(item.lon),
        municipality: itemMunicipality,
        province: address_obj.province || address_obj.state || null
      };
    });

    // Filter by municipality if specified
    let filteredResults = results;
    if (municipality) {
      filteredResults = results.filter(item => 
        item.municipality && item.municipality.toLowerCase().includes(municipality.toLowerCase())
      );
      
      // If no exact municipality match, return all results but prioritize the municipality
      if (filteredResults.length === 0) {
        filteredResults = results;
      }
    }

    return {
      success: true,
      data: filteredResults
    };

  } catch (error) {
    console.error('Address search error:', error.message);
    return {
      success: true,
      data: []
    };
  }
};

exports.geocodeAddress = async (address) => {
  try {
    const response = await axios.get(`${NOMINATIM_BASE_URL}/search`, {
      params: {
        q: address,
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
    const address_obj = result.address || {};

    const municipality = 
      address_obj.municipality || 
      address_obj.city || 
      address_obj.town || 
      address_obj.village || 
      address_obj.suburb ||
      null;

    return {
      success: true,
      data: {
        latitude: parseFloat(result.lat),
        longitude: parseFloat(result.lon),
        formatted_address: result.display_name,
        municipality: municipality,
        province: address_obj.province || address_obj.state || null,
        country: address_obj.country || 'Philippines'
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

exports.calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = R * c;

  return parseFloat(distance.toFixed(2)); 
};


function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}


exports.getRoute = async (startLat, startLon, endLat, endLon) => {
  try {
    const coordinates = `${startLon},${startLat};${endLon},${endLat}`;
    
    const response = await axios.get(
      `${OSRM_BASE_URL}/route/v1/driving/${coordinates}`,
      {
        params: {
          overview: 'full',
          geometries: 'geojson',
          steps: false
        },
        timeout: 10000
      }
    );

    if (!response.data || !response.data.routes || response.data.routes.length === 0) {
      return {
        success: false,
        error: 'Route not found.'
      };
    }

    const route = response.data.routes[0];

    return {
      success: true,
      data: {
        distance_km: parseFloat((route.distance / 1000).toFixed(2)),
        duration_minutes: Math.round(route.duration / 60),
        geometry: route.geometry,
        start: { latitude: startLat, longitude: startLon },
        end: { latitude: endLat, longitude: endLon }
      }
    };

  } catch (error) {
    console.error('Routing error:', error.message);
    
    const distance = exports.calculateDistance(startLat, startLon, endLat, endLon);
    const estimatedDuration = Math.round(distance * 2); 

    return {
      success: true,
      data: {
        distance_km: distance,
        duration_minutes: estimatedDuration,
        geometry: null,
        start: { latitude: startLat, longitude: startLon },
        end: { latitude: endLat, longitude: endLon },
        note: 'Estimated straight-line distance (route service unavailable)'
      }
    };
  }
};

exports.getMunicipalityCoordinates = (municipality) => {
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

exports.getRizalMunicipalities = () => {
  return Object.keys(RIZAL_MUNICIPALITIES).map(name => ({
    name,
    latitude: RIZAL_MUNICIPALITIES[name].lat,
    longitude: RIZAL_MUNICIPALITIES[name].lon
  }));
};

exports.isValidPhilippineCoordinates = (latitude, longitude) => {
  return (
    latitude >= PHILIPPINES_BBOX.min_lat &&
    latitude <= PHILIPPINES_BBOX.max_lat &&
    longitude >= PHILIPPINES_BBOX.min_lon &&
    longitude <= PHILIPPINES_BBOX.max_lon
  );
};


exports.calculateDistancesToMany = (origin, destinations) => {
  return destinations.map(dest => ({
    ...dest,
    distance_km: exports.calculateDistance(
      origin.latitude,
      origin.longitude,
      dest.latitude,
      dest.longitude
    )
  })).sort((a, b) => a.distance_km - b.distance_km); 
};

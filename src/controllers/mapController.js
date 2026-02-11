// src\controllers\mapController.js
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const mapService = require('../services/mapService');
const { supabase } = require('../config/database');


exports.getSellerLocations = asyncHandler(async (req, res, next) => {
  const { municipality, farm_type } = req.query;

  let query = supabase
    .from('seller_profiles')
    .select(`
      id,
      municipality,
      farm_type,
      latitude,
      longitude,
      rating,
      total_orders,
      user:users!inner (
        id,
        full_name,
        status,
        verified_at
      )
    `)
    .eq('user.status', 'verified');

  if (municipality) {
    query = query.eq('municipality', municipality);
  }

  if (farm_type) {
    query = query.eq('farm_type', farm_type);
  }

  const { data: sellers, error } = await query;

  if (error) {
    throw new AppError('Failed to fetch seller locations.', 500);
  }

  if (!sellers || sellers.length === 0) {
    return res.status(200).json({
      success: true,
      results: 0,
      data: {
        sellers: []
      }
    });
  }

  const sellerIds = sellers.map(s => s.id);
  
  const { data: productCounts } = await supabase
    .from('products')
    .select('seller_id')
    .in('seller_id', sellerIds)
    .eq('status', 'active');

  const productCountMap = {};
  if (productCounts) {
    productCounts.forEach(p => {
      productCountMap[p.seller_id] = (productCountMap[p.seller_id] || 0) + 1;
    });
  }

  const sellersWithProducts = sellers.map((seller) => {
    let lat = seller.latitude;
    let lon = seller.longitude;

    if (!lat || !lon) {
      const coords = mapService.getMunicipalityCoordinates(seller.municipality);
      if (coords) {
        lat = coords.latitude;
        lon = coords.longitude;
      }
    }

    return {
      id: seller.id,
      name: seller.user.full_name,
      municipality: seller.municipality,
      farm_type: seller.farm_type,
      latitude: lat,
      longitude: lon,
      rating: seller.rating,
      total_orders: seller.total_orders,
      product_count: productCountMap[seller.id] || 0,
      verified: true
    };
  });

  res.status(200).json({
    success: true,
    results: sellersWithProducts.length,
    data: {
      sellers: sellersWithProducts
    }
  });
});

exports.calculateDistance = asyncHandler(async (req, res, next) => {
  const { start_lat, start_lon, end_lat, end_lon } = req.body;

  if (!start_lat || !start_lon || !end_lat || !end_lon) {
    throw new AppError('All coordinates are required.', 400);
  }

  if (Math.abs(start_lat) > 90 || Math.abs(end_lat) > 90) {
    throw new AppError('Latitude must be between -90 and 90.', 400);
  }

  if (Math.abs(start_lon) > 180 || Math.abs(end_lon) > 180) {
    throw new AppError('Longitude must be between -180 and 180.', 400);
  }

  const distance = mapService.calculateDistance(
    parseFloat(start_lat),
    parseFloat(start_lon),
    parseFloat(end_lat),
    parseFloat(end_lon)
  );

  res.status(200).json({
    success: true,
    data: {
      distance_km: distance,
      start: {
        latitude: parseFloat(start_lat),
        longitude: parseFloat(start_lon)
      },
      end: {
        latitude: parseFloat(end_lat),
        longitude: parseFloat(end_lon)
      }
    }
  });
});

exports.getRoute = asyncHandler(async (req, res, next) => {
  const { start_lat, start_lon, end_lat, end_lon } = req.body;

  if (!start_lat || !start_lon || !end_lat || !end_lon) {
    throw new AppError('All coordinates are required.', 400);
  }

  const result = await mapService.getRoute(
    parseFloat(start_lat),
    parseFloat(start_lon),
    parseFloat(end_lat),
    parseFloat(end_lon)
  );

  if (!result.success) {
    throw new AppError(result.error, 500);
  }

  res.status(200).json({
    success: true,
    data: result.data
  });
});

exports.searchAddresses = asyncHandler(async (req, res, next) => {
  const { q, municipality } = req.query;

  if (!q || q.trim().length === 0) {
    return res.status(200).json({
      success: true,
      data: []
    });
  }

  const result = await mapService.searchAddresses(q, municipality || null);

  res.status(200).json({
    success: result.success,
    data: result.data
  });
});

exports.geocodeAddress = asyncHandler(async (req, res, next) => {
  const { address } = req.body;

  if (!address || address.trim().length === 0) {
    throw new AppError('Address is required.', 400);
  }

  const result = await mapService.geocodeAddress(address);

  if (!result.success) {
    throw new AppError(result.error, 404);
  }

  res.status(200).json({
    success: true,
    data: result.data
  });
});

exports.reverseGeocode = asyncHandler(async (req, res, next) => {
  const { latitude, longitude } = req.body;

  if (!latitude || !longitude) {
    throw new AppError('Latitude and longitude are required.', 400);
  }

  const result = await mapService.reverseGeocode(
    parseFloat(latitude),
    parseFloat(longitude)
  );

  if (!result.success) {
    throw new AppError(result.error, 404);
  }

  res.status(200).json({
    success: true,
    data: result.data
  });
});

exports.getNearbySellers = asyncHandler(async (req, res, next) => {
  const { latitude, longitude, radius_km = 50 } = req.body;

  if (!latitude || !longitude) {
    throw new AppError('Latitude and longitude are required.', 400);
  }

  const { data: sellers, error } = await supabase
    .from('seller_profiles')
    .select(`
      id,
      municipality,
      farm_type,
      latitude,
      longitude,
      rating,
      total_orders,
      user:users!inner (
        id,
        full_name,
        status
      )
    `)
    .eq('user.status', 'verified');

  if (error) {
    throw new AppError('Failed to fetch sellers.', 500);
  }

  const sellersWithDistance = [];

  for (const seller of sellers) {
    let sellerLat = seller.latitude;
    let sellerLon = seller.longitude;

    if (!sellerLat || !sellerLon) {
      const coords = mapService.getMunicipalityCoordinates(seller.municipality);
      if (coords) {
        sellerLat = coords.latitude;
        sellerLon = coords.longitude;
      }
    }

    if (sellerLat && sellerLon) {
      const distance = mapService.calculateDistance(
        parseFloat(latitude),
        parseFloat(longitude),
        sellerLat,
        sellerLon
      );

      if (distance <= parseFloat(radius_km)) {
        sellersWithDistance.push({
          id: seller.id,
          name: seller.user.full_name,
          municipality: seller.municipality,
          farm_type: seller.farm_type,
          latitude: sellerLat,
          longitude: sellerLon,
          rating: seller.rating,
          total_orders: seller.total_orders,
          distance_km: distance
        });
      }
    }
  }

  sellersWithDistance.sort((a, b) => a.distance_km - b.distance_km);

  if (sellersWithDistance.length > 0) {
    const sellerIds = sellersWithDistance.map(s => s.id);
    
    const { data: productCounts } = await supabase
      .from('products')
      .select('seller_id')
      .in('seller_id', sellerIds)
      .eq('status', 'active');

    const productCountMap = {};
    if (productCounts) {
      productCounts.forEach(p => {
        productCountMap[p.seller_id] = (productCountMap[p.seller_id] || 0) + 1;
      });
    }

    sellersWithDistance.forEach(seller => {
      seller.product_count = productCountMap[seller.id] || 0;
    });
  }

  res.status(200).json({
    success: true,
    results: sellersWithDistance.length,
    data: {
      origin: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude)
      },
      radius_km: parseFloat(radius_km),
      sellers: sellersWithDistance
    }
  });
});

exports.getMunicipalities = asyncHandler(async (req, res, next) => {
  const municipalities = mapService.getRizalMunicipalities();

  res.status(200).json({
    success: true,
    results: municipalities.length,
    data: {
      municipalities
    }
  });
});
// src\routes\mapRoutes.js
const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');

const mapController = require('../controllers/mapController');


const { validate } = require('../utils/validators');

router.get(
  '/sellers',
  [
    query('municipality')
      .optional()
      .trim()
      .isLength({ max: 100 }).withMessage('Municipality name too long'),
    
    query('farm_type')
      .optional()
      .isIn(['farm', 'fishery', 'cooperative', 'other'])
      .withMessage('Invalid farm type'),
    
    validate
  ],
  mapController.getSellerLocations
);

router.get(
  '/municipalities',
  mapController.getMunicipalities
);

router.post(
  '/distance',
  [
    body('start_lat')
      .notEmpty().withMessage('Start latitude is required')
      .isFloat({ min: -90, max: 90 }).withMessage('Invalid start latitude')
      .toFloat(),
    
    body('start_lon')
      .notEmpty().withMessage('Start longitude is required')
      .isFloat({ min: -180, max: 180 }).withMessage('Invalid start longitude')
      .toFloat(),
    
    body('end_lat')
      .notEmpty().withMessage('End latitude is required')
      .isFloat({ min: -90, max: 90 }).withMessage('Invalid end latitude')
      .toFloat(),
    
    body('end_lon')
      .notEmpty().withMessage('End longitude is required')
      .isFloat({ min: -180, max: 180 }).withMessage('Invalid end longitude')
      .toFloat(),
    
    validate
  ],
  mapController.calculateDistance
);

router.post(
  '/route',
  [
    body('start_lat')
      .notEmpty().withMessage('Start latitude is required')
      .isFloat({ min: -90, max: 90 }).withMessage('Invalid start latitude')
      .toFloat(),
    
    body('start_lon')
      .notEmpty().withMessage('Start longitude is required')
      .isFloat({ min: -180, max: 180 }).withMessage('Invalid start longitude')
      .toFloat(),
    
    body('end_lat')
      .notEmpty().withMessage('End latitude is required')
      .isFloat({ min: -90, max: 90 }).withMessage('Invalid end latitude')
      .toFloat(),
    
    body('end_lon')
      .notEmpty().withMessage('End longitude is required')
      .isFloat({ min: -180, max: 180 }).withMessage('Invalid end longitude')
      .toFloat(),
    
    validate
  ],
  mapController.getRoute
);

router.get(
  '/search-addresses',
  mapController.searchAddresses
);

router.post(
  '/geocode',
  [
    body('address')
      .notEmpty().withMessage('Address is required')
      .trim()
      .isLength({ min: 3, max: 500 }).withMessage('Address must be 3-500 characters'),
    
    validate
  ],
  mapController.geocodeAddress
);

router.post(
  '/reverse-geocode',
  [
    body('latitude')
      .notEmpty().withMessage('Latitude is required')
      .isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude')
      .toFloat(),
    
    body('longitude')
      .notEmpty().withMessage('Longitude is required')
      .isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude')
      .toFloat(),
    
    validate
  ],
  mapController.reverseGeocode
);

router.post(
  '/nearby-sellers',
  [
    body('latitude')
      .notEmpty().withMessage('Latitude is required')
      .isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude')
      .toFloat(),
    
    body('longitude')
      .notEmpty().withMessage('Longitude is required')
      .isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude')
      .toFloat(),
    
    body('radius_km')
      .optional()
      .isFloat({ min: 1, max: 200 }).withMessage('Radius must be between 1-200 km')
      .toFloat(),
    
    validate
  ],
  mapController.getNearbySellers
);

module.exports = router;

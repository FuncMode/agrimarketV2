// src\routes\loggingRoutes.js

const express = require('express');
const router = express.Router();
const { query, body } = require('express-validator');

const loggingController = require('../controllers/loggingController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { validate, validateUUID } = require('../utils/validators');

router.use(protect);
router.use(restrictTo('admin'));

router.get(
  '/admin',
  [
    query('admin_id')
      .optional()
      .isUUID(4).withMessage('Invalid admin ID'),
    
    query('action_type')
      .optional()
      .trim(),
    
    query('date_from')
      .optional()
      .isISO8601().withMessage('Invalid date format')
      .toDate(),
    
    query('date_to')
      .optional()
      .isISO8601().withMessage('Invalid date format')
      .toDate(),
    
    query('page')
      .optional()
      .isInt({ min: 1 }).withMessage('Page must be positive')
      .toInt(),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
      .toInt(),
    
    validate
  ],
  loggingController.getAdminLogs
);

router.get(
  '/audit/:recordId',
  validateUUID('recordId'),
  [
    query('action_type')
      .optional()
      .trim(),
    
    validate
  ],
  loggingController.getAuditTrail
);

router.get(
  '/security',
  [
    query('date_from')
      .optional()
      .isISO8601().withMessage('Invalid date format')
      .toDate(),
    
    query('date_to')
      .optional()
      .isISO8601().withMessage('Invalid date format')
      .toDate(),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: 500 }).withMessage('Limit must be between 1 and 500')
      .toInt(),
    
    validate
  ],
  loggingController.getSecurityEvents
);


router.get(
  '/auth-failures',
  [
    query('ip_address')
      .optional()
      .trim(),
    
    query('date_from')
      .optional()
      .isISO8601().withMessage('Invalid date format')
      .toDate(),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: 500 }).withMessage('Limit must be between 1 and 500')
      .toInt(),
    
    validate
  ],
  loggingController.getFailedAuthAttempts
);

router.get(
  '/stats/audit',
  [
    query('timeframe')
      .optional()
      .isIn(['24h', '7d', '30d'])
      .withMessage('Invalid timeframe. Must be: 24h, 7d, or 30d'),
    
    validate
  ],
  loggingController.getAuditStats
);

router.get(
  '/stats',
  [
    query('date_from')
      .optional()
      .isISO8601().withMessage('Invalid date format')
      .toDate(),
    
    query('date_to')
      .optional()
      .isISO8601().withMessage('Invalid date format')
      .toDate(),
    
    validate
  ],
  loggingController.getLogStats
);


router.get(
  '/search',
  [
    query('q')
      .notEmpty().withMessage('Search query is required')
      .trim()
      .isLength({ min: 1, max: 100 }).withMessage('Query must be 1-100 characters'),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
      .toInt(),
    
    validate
  ],
  loggingController.searchLogs
);

router.get(
  '/user/:userId',
  validateUUID('userId'),
  [
    query('action_type')
      .optional()
      .trim(),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
      .toInt(),
    
    validate
  ],
  loggingController.getUserActivityLogs
);

router.get(
  '/user/:userId/suspicious',
  validateUUID('userId'),
  loggingController.checkSuspiciousActivity
);

router.get(
  '/export',
  [
    query('action_type')
      .optional()
      .trim(),
    
    query('date_from')
      .optional()
      .isISO8601().withMessage('Invalid date format')
      .toDate(),
    
    query('date_to')
      .optional()
      .isISO8601().withMessage('Invalid date format')
      .toDate(),
    
    query('format')
      .optional()
      .isIn(['json', 'csv'])
      .withMessage('Format must be json or csv'),
    
    validate
  ],
  loggingController.exportLogs
);

router.post(
  '/cleanup',
  [
    body('days_old')
      .optional()
      .isInt({ min: 30, max: 365 }).withMessage('Days old must be between 30 and 365')
      .toInt(),
    
    validate
  ],
  loggingController.cleanupOldLogs
);

module.exports = router;
// src\routes\adminRoutes.js

const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');

const adminController = require('../controllers/adminController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { validate, validateUUID } = require('../utils/validators');


router.use(protect);
router.use(restrictTo('admin'));

router.get('/dashboard', adminController.getDashboardStats);

router.get('/stats', adminController.getAdminStats);


router.get(
  '/users',
  [
    query('role')
      .optional()
      .isIn(['buyer', 'seller', 'admin'])
      .withMessage('Invalid role'),
    
    query('status')
      .optional()
      .isIn(['unverified', 'verification_pending', 'verified', 'rejected', 'suspended', 'banned'])
      .withMessage('Invalid status'),
    
    query('search')
      .optional()
      .trim()
      .isLength({ max: 100 }).withMessage('Search query too long'),
    
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
  adminController.getAllUsers
);

router.get(
  '/users/:userId',
  validateUUID('userId'),
  adminController.getUserDetails
);

router.post(
  '/users/:userId/suspend',
  validateUUID('userId'),
  [
    body('reason')
      .notEmpty().withMessage('Suspension reason is required')
      .isLength({ min: 10, max: 500 }).withMessage('Reason must be 10-500 characters'),
    
    body('suspension_days')
      .optional()
      .isInt({ min: 1, max: 365 }).withMessage('Suspension days must be between 1 and 365')
      .toInt(),
    
    validate
  ],
  adminController.suspendUser
);

router.post(
  '/users/:userId/ban',
  validateUUID('userId'),
  [
    body('reason')
      .notEmpty().withMessage('Ban reason is required')
      .isLength({ min: 10, max: 500 }).withMessage('Reason must be 10-500 characters'),
    
    validate
  ],
  adminController.banUser
);

router.post(
  '/users/:userId/reinstate',
  validateUUID('userId'),
  adminController.reinstateUser
);

router.delete(
  '/users/:userId',
  validateUUID('userId'),
  [
    body('reason')
      .optional()
      .isLength({ max: 500 }).withMessage('Reason must not exceed 500 characters'),
    
    validate
  ],
  adminController.deleteUser
);

router.get(
  '/logs',
  [
    query('action_type')
      .optional()
      .trim(),
    
    query('admin_id')
      .optional()
      .isUUID(4).withMessage('Invalid admin ID'),
    
    query('target_user_id')
      .optional()
      .isUUID(4).withMessage('Invalid target user ID'),
    
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
  adminController.getSystemLogs
);

router.get('/socket/connections', adminController.getSocketConnections);

router.get('/security/ip-blocking', adminController.getIPBlockingStats);

router.get('/database/stats', adminController.getDatabaseStats);

module.exports = router;
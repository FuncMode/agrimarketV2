// src\routes\orderRoutes.js
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');

const orderController = require('../controllers/orderController');

const { protect, restrictTo } = require('../middleware/authMiddleware');
const { validate, validateUUID, orderQueryValidation } = require('../utils/validators');
const { uploadOptional } = require('../middleware/uploadMiddleware');

router.get(
  '/',
  protect,
  restrictTo('buyer', 'seller'),
  orderQueryValidation,
  orderController.getMyOrders
);

router.get(
  '/stats',
  protect,
  restrictTo('buyer', 'seller'),
  orderController.getOrderStats
);

router.get(
  '/:orderId',
  protect,
  restrictTo('buyer', 'seller'),
  validateUUID('orderId'),
  orderController.getOrderById
);

router.post(
  '/:orderId/confirm',
  protect,
  restrictTo('buyer', 'seller'),
  validateUUID('orderId'),
  uploadOptional('delivery_proof'),
  orderController.confirmOrderCompletion
);

router.put(
  '/:orderId/status',
  protect,
  restrictTo('seller'),
  validateUUID('orderId'),
  uploadOptional('delivery_proof'),
  [
    body('status')
      .notEmpty().withMessage('Status is required')
      .isIn(['pending', 'confirmed', 'ready', 'completed', 'cancelled']).withMessage('Invalid status'),
    validate
  ],
  orderController.updateOrderStatus
);

router.post(
  '/:orderId/cancel',
  protect,
  restrictTo('buyer', 'seller'),
  validateUUID('orderId'),
  [
    body('reason')
      .notEmpty().withMessage('Cancellation reason is required')
      .isLength({ min: 3, max: 500 }).withMessage('Reason must be 3-500 characters'),
    validate
  ],
  orderController.cancelOrder
);

router.post(
  '/',
  protect,
  restrictTo('buyer'),
  [
    body('seller_id')
      .notEmpty().withMessage('Seller ID is required')
      .isUUID(4).withMessage('Invalid seller ID'),
    
    body('delivery_option')
      .notEmpty().withMessage('Delivery option is required')
      .isIn(['pickup', 'drop-off']).withMessage('Delivery option must be pickup or drop-off'),
    
    body('delivery_address')
      .optional()
      .trim()
      .isLength({ min: 10, max: 500 }).withMessage('Delivery address must be 10-500 characters'),
    
    body('delivery_latitude')
      .optional()
      .isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
    
    body('delivery_longitude')
      .optional()
      .isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
    
    body('preferred_date')
      .optional()
      .isISO8601().withMessage('Invalid date format')
      .toDate(),
    
    body('preferred_time')
      .optional()
      .trim()
      .isLength({ max: 50 }).withMessage('Preferred time too long'),
    
    body('order_notes')
      .optional()
      .trim()
      .isLength({ max: 500 }).withMessage('Order notes must not exceed 500 characters'),
    
    validate
  ],
  orderController.createOrder
);

router.put(
  '/:orderId/status',
  protect,
  restrictTo('seller'),
  validateUUID('orderId'),
  [
    body('status')
      .notEmpty().withMessage('Status is required')
      .isIn(['confirmed', 'ready']).withMessage('Status must be confirmed or ready'),
    validate
  ],
  orderController.updateOrderStatus
);

router.post(
  '/:orderId/rate',
  protect,
  restrictTo('buyer'),
  validateUUID('orderId'),
  [
    body('reviews')
      .isArray({ min: 1 }).withMessage('Reviews array is required with at least one review'),
    body('reviews.*.product_id')
      .notEmpty().withMessage('Product ID is required for each review')
      .isUUID().withMessage('Product ID must be a valid UUID'),
    body('reviews.*.rating')
      .notEmpty().withMessage('Rating is required for each product')
      .isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('reviews.*.comment')
      .optional()
      .trim()
      .isLength({ max: 500 }).withMessage('Comment must not exceed 500 characters'),
    validate
  ],
  orderController.rateOrder
);

router.get(
  '/:orderId/reviews',
  protect,
  restrictTo('buyer', 'seller'),
  validateUUID('orderId'),
  orderController.getOrderReviews
);

module.exports = router;


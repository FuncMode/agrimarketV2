// src\routes\productRoutes.js
const express = require('express');
const router = express.Router();

const productController = require('../controllers/productController');

const { protect, restrictTo, requireVerified, optionalAuth } = require('../middleware/authMiddleware');
const { uploadOptional } = require('../middleware/uploadMiddleware');
const { validateUUID } = require('../utils/validators');
const {
  createProductValidation,
  updateProductValidation,
  productQueryValidation,
  myProductsQueryValidation
} = require('../utils/productValidators');


router.get(
  '/',
  productQueryValidation,
  productController.getAllProducts
);

router.post(
  '/:productId/view',
  protect,
  restrictTo('buyer'),
  validateUUID('productId'),
  productController.incrementViewCount
);

router.get(
  '/:productId',
  optionalAuth, 
  validateUUID('productId'),
  productController.getProductById
);

router.get(
  '/seller/my-products',
  protect,
  restrictTo('seller'),
  myProductsQueryValidation,
  productController.getMyProducts
);

router.get(
  '/seller/stats',
  protect,
  restrictTo('seller'),
  productController.getProductStats
);

router.get(
  '/seller/analytics',
  protect,  
  restrictTo('seller'),
  productController.getSellerAnalytics
);

router.get(
  '/seller/sales-over-time',
  protect,
  restrictTo('seller'),
  productController.getSalesOverTime
);

router.get(
  '/seller/top-products',
  protect,
  restrictTo('seller'),
  productController.getTopProducts
);

router.post(
  '/',
  protect,
  restrictTo('seller'),
  requireVerified,
  uploadOptional('photo'),
  createProductValidation,
  productController.createProduct
);

router.put(
  '/:productId',
  protect,
  restrictTo('seller'),
  requireVerified,
  validateUUID('productId'),
  uploadOptional('photo'),
  updateProductValidation,
  productController.updateProduct
);

router.delete(
  '/:productId',
  protect,
  restrictTo('seller'),
  requireVerified,
  validateUUID('productId'),
  productController.deleteProduct
);

// Get product reviews
router.get(
  '/:productId/reviews',
  validateUUID('productId'),
  productController.getProductReviews
);

// Get seller reviews
router.get(
  '/seller/:sellerId/reviews',
  validateUUID('sellerId'),
  productController.getSellerReviews
);

module.exports = router;

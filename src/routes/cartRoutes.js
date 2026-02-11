// src\routes\cartRoutes.js
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');

const cartController = require('../controllers/cartController');


const { protect, restrictTo } = require('../middleware/authMiddleware');
const { validate, validateUUID } = require('../utils/validators');

router.get(
  '/',
  protect,
  restrictTo('buyer'),
  cartController.getCart
);

router.get(
  '/count',
  protect,
  restrictTo('buyer'),
  cartController.getCartCount
);

router.get(
  '/validate',
  protect,
  restrictTo('buyer'),
  cartController.validateCart
);

router.post(
  '/',
  protect,
  restrictTo('buyer'),
  [
    body('product_id')
      .notEmpty().withMessage('Product ID is required')
      .isUUID(4).withMessage('Invalid product ID'),
    
    body('quantity')
      .optional()
      .isInt({ min: 1, max: 1000 }).withMessage('Quantity must be between 1 and 1000')
      .toInt(),
    
    validate
  ],
  cartController.addToCart
);

router.put(
  '/:cartItemId',
  protect,
  restrictTo('buyer'),
  validateUUID('cartItemId'),
  [
    body('quantity')
      .notEmpty().withMessage('Quantity is required')
      .isInt({ min: 1, max: 1000 }).withMessage('Quantity must be between 1 and 1000')
      .toInt(),
    
    validate
  ],
  cartController.updateCartItem
);

router.delete(
  '/:cartItemId',
  protect,
  restrictTo('buyer'),
  validateUUID('cartItemId'),
  cartController.removeFromCart
);

router.delete(
  '/',
  protect,
  restrictTo('buyer'),
  cartController.clearCart
);

module.exports = router;

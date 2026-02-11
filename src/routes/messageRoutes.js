// src\routes\messageRoutes.js
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');


const messageController = require('../controllers/messageController');

const { protect, restrictTo } = require('../middleware/authMiddleware');
const { uploadOptional } = require('../middleware/uploadMiddleware');
const { validate, validateUUID } = require('../utils/validators');

router.get(
  '/conversations',
  protect,
  restrictTo('buyer', 'seller'),
  messageController.getConversations
);

router.get(
  '/unread-count',
  protect,
  restrictTo('buyer', 'seller'),
  messageController.getUnreadCount
);

router.get(
  '/:orderId',
  protect,
  restrictTo('buyer', 'seller'),
  validateUUID('orderId'),
  messageController.getOrderMessages
);

router.post(
  '/',
  protect,
  restrictTo('buyer', 'seller'),
  uploadOptional('attachment'),
  [
    body('order_id')
      .notEmpty().withMessage('Order ID is required')
      .isUUID().withMessage('Invalid order ID'),
    
    body('message_text')
      .notEmpty().withMessage('Message text is required')
      .trim()
      .isLength({ min: 1, max: 500 }).withMessage('Message must be 1-500 characters'),
    
    validate
  ],
  messageController.sendMessage
);

router.post(
  '/:orderId/read',
  protect,
  restrictTo('buyer', 'seller'),
  validateUUID('orderId'),
  messageController.markAsRead
);

router.delete(
  '/:messageId',
  protect,
  restrictTo('buyer', 'seller'),
  validateUUID('messageId'),
  messageController.deleteMessage
);

module.exports = router;

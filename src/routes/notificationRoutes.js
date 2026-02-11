// src\routes\notificationRoutes.js

const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { protect } = require('../middleware/authMiddleware');
const { query } = require('express-validator');
const { validate } = require('../utils/validators');

router.get(
  '/my-notifications',
  protect,
  [
    query('is_read')
      .optional()
      .isIn(['true', 'false']).withMessage('is_read must be true or false'),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
    
    query('offset')
      .optional()
      .isInt({ min: 0 }).withMessage('offset must be 0 or greater'),
    
    validate
  ],
  notificationController.getMyNotifications
);

router.get(
  '/unread-count',
  protect,
  notificationController.getUnreadCount
);

router.patch(
  '/:notificationId/read',
  protect,
  notificationController.markNotificationAsRead
);

router.patch(
  '/read-all',
  protect,
  notificationController.markAllNotificationsAsRead
);

router.delete(
  '/:notificationId',
  protect,
  notificationController.deleteNotification
);

router.post(
  '/test',
  protect,
  notificationController.testNotification
);

module.exports = router;

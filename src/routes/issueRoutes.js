// src\routes\issueRoutes.js

const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');

const issueController = require('../controllers/issueController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { uploadMultiple } = require('../middleware/uploadMiddleware');
const { validate, validateUUID } = require('../utils/validators');

router.get(
  '/my-issues',
  protect,
  restrictTo('buyer', 'seller'),
  [
    query('status')
      .optional()
      .isIn(['under_review', 'resolved', 'rejected'])
      .withMessage('Invalid status'),
    
    query('issue_type')
      .optional()
      .trim()
      .isLength({ max: 50 }).withMessage('Issue type too long'),
    
    validate
  ],
  issueController.getMyIssues
);

router.get(
  '/:issueId',
  protect,
  validateUUID('issueId'),
  issueController.getIssueById
);

router.get(
  '/order/:orderId',
  protect,
  validateUUID('orderId'),
  issueController.getOrderIssues
);

router.post(
  '/',
  protect,
  restrictTo('buyer', 'seller'),
  uploadMultiple('evidence', 5),
  [
    body('order_id')
      .notEmpty().withMessage('Order ID is required')
      .isUUID(4).withMessage('Invalid order ID'),
    
    body('issue_type')
      .notEmpty().withMessage('Issue type is required')
      .trim()
      .isLength({ min: 3, max: 50 }).withMessage('Issue type must be 3-50 characters'),
    
    body('description')
      .notEmpty().withMessage('Description is required')
      .trim()
      .isLength({ min: 20, max: 1000 }).withMessage('Description must be 20-1000 characters'),
    
    validate
  ],
  issueController.createIssue
);

router.post(
  '/:issueId/evidence',
  protect,
  restrictTo('buyer', 'seller'),
  validateUUID('issueId'),
  uploadMultiple('evidence', 5),
  issueController.addEvidence
);

router.get(
  '/admin/pending',
  protect,
  restrictTo('admin'),
  [
    query('issue_type')
      .optional()
      .trim()
      .isLength({ max: 50 }).withMessage('Issue type too long'),
    
    validate
  ],
  issueController.getPendingIssues
);

router.get(
  '/admin/resolved',
  protect,
  restrictTo('admin'),
  [
    query('issue_type')
      .optional()
      .trim()
      .isLength({ max: 50 }).withMessage('Issue type too long'),
    
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
  issueController.getResolvedIssues
);

router.get(
  '/admin/rejected',
  protect,
  restrictTo('admin'),
  [
    query('issue_type')
      .optional()
      .trim()
      .isLength({ max: 50 }).withMessage('Issue type too long'),
    
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
  issueController.getRejectedIssues
);

router.get(
  '/admin/stats',
  protect,
  restrictTo('admin'),
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
  issueController.getIssueStats
);

router.post(
  '/admin/:issueId/resolve',
  protect,
  restrictTo('admin'),
  validateUUID('issueId'),
  [
    body('resolution')
      .notEmpty().withMessage('Resolution details are required')
      .isLength({ min: 10, max: 1000 }).withMessage('Resolution must be 10-1000 characters'),
    
    validate
  ],
  issueController.resolveIssue
);

router.post(
  '/admin/:issueId/reject',
  protect,
  restrictTo('admin'),
  validateUUID('issueId'),
  [
    body('resolution')
      .notEmpty().withMessage('Rejection reason is required')
      .isLength({ min: 10, max: 1000 }).withMessage('Reason must be 10-1000 characters'),
    
    validate
  ],
  issueController.rejectIssue
);

module.exports = router;
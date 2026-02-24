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

    body('priority')
      .optional()
      .isIn(['low', 'medium', 'high', 'critical'])
      .withMessage('Priority must be low, medium, high, or critical'),
    
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

    query('priority')
      .optional()
      .isIn(['low', 'medium', 'high', 'critical'])
      .withMessage('Invalid priority'),

    query('overdue_only')
      .optional()
      .isBoolean().withMessage('overdue_only must be true or false')
      .toBoolean(),
    
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

    query('priority')
      .optional()
      .isIn(['low', 'medium', 'high', 'critical'])
      .withMessage('Invalid priority'),
    
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

    query('priority')
      .optional()
      .isIn(['low', 'medium', 'high', 'critical'])
      .withMessage('Invalid priority'),
    
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

    body('outcome_action')
      .optional()
      .isIn(['refund', 'partial_refund', 'cancel_order', 'keep_order'])
      .withMessage('Invalid outcome action'),

    body('outcome_amount')
      .optional()
      .isFloat({ min: 0 }).withMessage('Outcome amount must be >= 0')
      .toFloat(),

    body('outcome_notes')
      .optional()
      .trim()
      .isLength({ max: 1000 }).withMessage('Outcome notes too long'),
    
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

    body('outcome_action')
      .optional()
      .isIn(['refund', 'partial_refund', 'cancel_order', 'keep_order'])
      .withMessage('Invalid outcome action'),

    body('outcome_amount')
      .optional()
      .isFloat({ min: 0 }).withMessage('Outcome amount must be >= 0')
      .toFloat(),

    body('outcome_notes')
      .optional()
      .trim()
      .isLength({ max: 1000 }).withMessage('Outcome notes too long'),
    
    validate
  ],
  issueController.rejectIssue
);

router.get(
  '/admin/:issueId/timeline',
  protect,
  restrictTo('admin'),
  validateUUID('issueId'),
  issueController.getIssueTimeline
);

router.post(
  '/admin/:issueId/note',
  protect,
  restrictTo('admin'),
  validateUUID('issueId'),
  [
    body('note')
      .notEmpty().withMessage('Note is required')
      .trim()
      .isLength({ min: 3, max: 1000 }).withMessage('Note must be 3-1000 characters'),
    validate
  ],
  issueController.addIssueNote
);

router.post(
  '/admin/:issueId/priority',
  protect,
  restrictTo('admin'),
  validateUUID('issueId'),
  [
    body('priority')
      .notEmpty().withMessage('Priority is required')
      .isIn(['low', 'medium', 'high', 'critical'])
      .withMessage('Invalid priority'),
    validate
  ],
  issueController.setIssuePriority
);

router.post(
  '/admin/:issueId/outcome',
  protect,
  restrictTo('admin'),
  validateUUID('issueId'),
  [
    body('outcome_action')
      .notEmpty().withMessage('Outcome action is required')
      .isIn(['refund', 'partial_refund', 'cancel_order', 'keep_order'])
      .withMessage('Invalid outcome action'),

    body('outcome_amount')
      .optional()
      .isFloat({ min: 0 }).withMessage('Outcome amount must be >= 0')
      .toFloat(),

    body('outcome_notes')
      .optional()
      .trim()
      .isLength({ max: 1000 }).withMessage('Outcome notes too long'),
    validate
  ],
  issueController.setIssueOutcome
);

router.post(
  '/admin/:issueId/escalate',
  protect,
  restrictTo('admin'),
  validateUUID('issueId'),
  [
    body('note')
      .optional()
      .trim()
      .isLength({ max: 1000 }).withMessage('Escalation note too long'),
    validate
  ],
  issueController.escalateIssueSla
);

module.exports = router;

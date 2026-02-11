// src\routes\verificationRoutes.js
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');

const verificationController = require('../controllers/verificationController');

const { protect, restrictTo, blockVerified } = require('../middleware/authMiddleware');
const { uploadFields } = require('../middleware/uploadMiddleware');
const { validate, validateUUID } = require('../utils/validators');


router.post(
  '/submit',
  protect,
  blockVerified, 
  uploadFields([
    { name: 'id_photo', maxCount: 1 },
    { name: 'selfie', maxCount: 1 }
  ]),
  [
    body('id_type')
      .notEmpty().withMessage('ID type is required')
      .isIn(['drivers_license', 'philid', 'passport', 'nbi_clearance'])
      .withMessage('Invalid ID type'),
    validate
  ],
  verificationController.submitVerification
);

router.get('/status', protect, verificationController.getMyVerificationStatus);


router.get(
  '/admin/pending',
  protect,
  restrictTo('admin'),
  verificationController.getPendingVerifications
);

router.get(
  '/admin/stats',
  protect,
  restrictTo('admin'),
  verificationController.getVerificationStats
);

router.get(
  '/admin/:verificationId',
  protect,
  restrictTo('admin'),
  validateUUID('verificationId'),
  verificationController.getVerificationDetails
);


router.post(
  '/admin/:verificationId/approve',
  protect,
  restrictTo('admin'),
  validateUUID('verificationId'),
  [
    body('admin_notes')
      .optional()
      .isLength({ max: 500 }).withMessage('Admin notes must not exceed 500 characters'),
    validate
  ],
  verificationController.approveVerification
);


router.post(
  '/admin/:verificationId/reject',
  protect,
  restrictTo('admin'),
  validateUUID('verificationId'),
  [
    body('admin_notes')
      .notEmpty().withMessage('Rejection reason is required')
      .isLength({ min: 10, max: 500 }).withMessage('Rejection reason must be 10-500 characters'),
    validate
  ],
  verificationController.rejectVerification
);


router.post(
  '/admin/:verificationId/more-evidence',
  protect,
  restrictTo('admin'),
  validateUUID('verificationId'),
  [
    body('admin_notes')
      .notEmpty().withMessage('Please specify what evidence is needed')
      .isLength({ min: 10, max: 500 }).withMessage('Instructions must be 10-500 characters'),
    validate
  ],
  verificationController.requestMoreEvidence
);

module.exports = router;


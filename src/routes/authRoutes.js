// src\routes\authRoutes.js

const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');

const { protect } = require('../middleware/authMiddleware');

const {
  signupValidation,
  loginValidation,
  forgotPasswordValidation,
  resetPasswordValidation
} = require('../utils/validators');

router.post('/signup', signupValidation, authController.signup);
router.post('/login', loginValidation, authController.login);
router.post('/forgot-password', forgotPasswordValidation, authController.forgotPassword);
router.post('/reset-password', resetPasswordValidation, authController.resetPassword);
router.post('/change-password', protect, authController.changePassword);
router.post('/logout', protect, authController.logout);
router.get('/me', protect, authController.getCurrentUser);

module.exports = router;

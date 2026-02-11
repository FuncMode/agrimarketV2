// src\routes\userRoutes.js
const express = require('express');
const router = express.Router();

const userController = require('../controllers/userController');

const { protect, restrictTo } = require('../middleware/authMiddleware');

const {
  updateProfileValidation,
  sellerProfileValidation,
  buyerProfileValidation,
  validateUUID,
  sellersQueryValidation
} = require('../utils/validators');

router.get('/sellers', sellersQueryValidation, userController.getVerifiedSellers);

router.get('/profile', protect, userController.getMyProfile);

router.get('/stats', protect, userController.getMyStats);

router.get('/online', protect, (req, res) => {
  try {
    const socketService = req.app.get('socketService');
    if (!socketService) {
      return res.status(500).json({
        success: false,
        message: 'Socket service not available'
      });
    }
    
    const onlineUserIds = socketService.getConnectedUsers();
    res.status(200).json({
      success: true,
      onlineUserIds,
      count: onlineUserIds.length
    });
  } catch (error) {
    console.error('Error getting online users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get online users',
      error: error.message
    });
  }
});

router.get('/sellers/:sellerId', validateUUID('sellerId'), userController.getSellerProfile);

router.put('/profile', protect, updateProfileValidation, userController.updateMyProfile);

router.delete('/account', protect, userController.deleteMyAccount);


router.put(
  '/seller-profile',
  protect,
  restrictTo('seller'),
  sellerProfileValidation,
  userController.updateSellerProfile
);


router.put(
  '/buyer-profile',
  protect,
  restrictTo('buyer'),
  buyerProfileValidation,
  userController.updateBuyerProfile
);

module.exports = router;

// src\middleware\roleMiddleware.js

const { AppError } = require('./errorHandler');
const { supabase } = require('../config/database');

const isAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    if (req.user.role !== 'admin') {
      throw new AppError('Access denied. Admin privileges required.', 403);
    }

    next();
  } catch (error) {
    next(error);
  }
};

const isSeller = async (req, res, next) => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    if (req.user.role !== 'seller') {
      throw new AppError('Access denied. Seller account required.', 403);
    }

    next();
  } catch (error) {
    next(error);
  }
};

const isBuyer = async (req, res, next) => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    if (req.user.role !== 'buyer') {
      throw new AppError('Access denied. Buyer account required.', 403);
    }

    next();
  } catch (error) {
    next(error);
  }
};

const isVerified = async (req, res, next) => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    if (req.user.status !== 'verified') {
      throw new AppError('Account verification required. Please complete verification first.', 403);
    }

    next();
  } catch (error) {
    next(error);
  }
};

const isResourceOwner = (resourceUserIdField = 'user_id') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }

      if (req.user.role === 'admin') {
        return next();
      }

      const resourceUserId = req.params[resourceUserIdField] || 
                            req.body[resourceUserIdField] ||
                            req.resource?.[resourceUserIdField];

      if (!resourceUserId) {
        throw new AppError('Resource user ID not found', 400);
      }

      if (resourceUserId !== req.user.id) {
        throw new AppError('Access denied. You do not own this resource.', 403);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

const hasPermission = (...permissions) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }

      if (req.user.role === 'admin') {
        return next();
      }

      const userPermissions = getRolePermissions(req.user.role);
      
      const hasRequiredPermission = permissions.some(permission => 
        userPermissions.includes(permission)
      );

      if (!hasRequiredPermission) {
        throw new AppError(
          `Access denied. Required permissions: ${permissions.join(', ')}`,
          403
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

const getRolePermissions = (role) => {
  const permissions = {
    admin: [
      'user:read',
      'user:write',
      'user:delete',
      'verification:approve',
      'verification:reject',
      'issue:resolve',
      'product:moderate',
      'order:moderate',
      'logs:read'
    ],
    seller: [
      'product:create',
      'product:read',
      'product:update',
      'product:delete',
      'order:read',
      'order:update',
      'message:send',
      'message:read'
    ],
    buyer: [
      'product:read',
      'order:create',
      'order:read',
      'cart:manage',
      'message:send',
      'message:read',
      'issue:report'
    ]
  };

  return permissions[role] || [];
};

const canModerate = async (req, res, next) => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    if (req.user.role !== 'admin') {
      throw new AppError('Access denied. Moderation privileges required.', 403);
    }

    if (req.user.status !== 'verified') {
      throw new AppError('Account must be verified to moderate.', 403);
    }

    next();
  } catch (error) {
    next(error);
  }
};

const isActiveAccount = async (req, res, next) => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    if (req.user.status === 'banned') {
      throw new AppError('Your account has been banned. Contact support.', 403);
    }

    if (req.user.status === 'suspended') {
      const { data: user } = await supabase
        .from('users')
        .select('suspension_end')
        .eq('id', req.user.id)
        .single();

      if (user?.suspension_end && new Date(user.suspension_end) < new Date()) {
        return next();
      }

      throw new AppError('Your account is suspended.', 403);
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  isAdmin,
  isSeller,
  isBuyer,
  isVerified,
  isResourceOwner,
  hasPermission,
  canModerate,
  isActiveAccount,
  getRolePermissions
};
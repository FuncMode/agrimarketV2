const { body, query } = require('express-validator');
const { validate } = require('./validators');


const createProductValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Product name is required')
    .isLength({ min: 3, max: 100 }).withMessage('Product name must be 3-100 characters')
    .matches(/^[a-zA-Z0-9\s\-\.,]+$/).withMessage('Product name contains invalid characters'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Description must not exceed 500 characters'),

  body('category')
    .notEmpty().withMessage('Category is required')
    .isIn(['vegetables', 'fruits', 'fish_seafood', 'meat_poultry', 'other'])
    .withMessage('Invalid category. Must be: vegetables, fruits, fish_seafood, meat_poultry, or other'),

  body('price_per_unit')
    .notEmpty().withMessage('Price is required')
    .isFloat({ min: 1, max: 1000000 }).withMessage('Price must be between ₱1 and ₱1,000,000')
    .toFloat(),

  body('unit_type')
    .notEmpty().withMessage('Unit type is required')
    .isIn(['kg', 'pcs', 'bundle', 'box', 'dozen', 'liter', 'other'])
    .withMessage('Invalid unit type'),

  body('available_quantity')
    .notEmpty().withMessage('Available quantity is required')
    .isInt({ min: 1, max: 1000000 }).withMessage('Quantity must be between 1 and 1,000,000')
    .toInt(),

  body('tags')
    .optional()
    .custom((value) => {
      const validTags = ['fresh', 'organic', 'farmed', 'wild_caught', 'recently_harvested', 'other'];
      
      let tags = Array.isArray(value) ? value : String(value).split(',').map(t => t.trim());
      
      const invalidTags = tags.filter(tag => tag && !validTags.includes(tag));
      if (invalidTags.length > 0) {
        throw new Error(`Invalid tags: ${invalidTags.join(', ')}`);
      }
      
      return true;
    }),

  body('status')
    .optional()
    .isIn(['active', 'paused', 'draft'])
    .withMessage('Invalid status. Must be: active, paused, or draft'),

  validate
];


const updateProductValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 3, max: 100 }).withMessage('Product name must be 3-100 characters')
    .matches(/^[a-zA-Z0-9\s\-\.,]+$/).withMessage('Product name contains invalid characters'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Description must not exceed 500 characters'),

  body('category')
    .optional()
    .isIn(['vegetables', 'fruits', 'fish_seafood', 'meat_poultry', 'other'])
    .withMessage('Invalid category'),

  body('price_per_unit')
    .optional()
    .isFloat({ min: 1, max: 1000000 }).withMessage('Price must be between ₱1 and ₱1,000,000')
    .toFloat(),

  body('unit_type')
    .optional()
    .isIn(['kg', 'pcs', 'bundle', 'box', 'dozen', 'liter', 'other'])
    .withMessage('Invalid unit type'),

  body('available_quantity')
    .optional()
    .isInt({ min: 0, max: 1000000 }).withMessage('Quantity must be between 0 and 1,000,000')
    .toInt(),

  body('tags')
    .optional()
    .custom((value) => {
      const validTags = ['fresh', 'organic', 'farmed', 'wild_caught', 'recently_harvested', 'other'];
      
      let tags = Array.isArray(value) ? value : String(value).split(',').map(t => t.trim());
      
      const invalidTags = tags.filter(tag => tag && !validTags.includes(tag));
      if (invalidTags.length > 0) {
        throw new Error(`Invalid tags: ${invalidTags.join(', ')}`);
      }
      
      return true;
    }),

  body('status')
    .optional()
    .isIn(['active', 'paused', 'draft'])
    .withMessage('Invalid status. Must be: active, paused, or draft'),

  validate
];

const productQueryValidation = [
  query('search')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Search query too long'),

  query('category')
    .optional()
    .isIn(['vegetables', 'fruits', 'fish_seafood', 'meat_poultry', 'other'])
    .withMessage('Invalid category'),

  query('municipality')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Municipality name too long'),

  query('tags')
    .optional()
    .custom((value) => {
      const validTags = ['fresh', 'organic', 'farmed', 'wild_caught', 'recently_harvested', 'other'];
      
      // Split comma-separated string into array, just like in create/update validations
      let tags = Array.isArray(value) ? value : String(value).split(',').map(t => t.trim());
      
      const invalidTags = tags.filter(tag => tag && !validTags.includes(tag));
      if (invalidTags.length > 0) {
        throw new Error(`Invalid tags: ${invalidTags.join(', ')}`);
      }
      
      return true;
    }),

  query('min_price')
    .optional()
    .isFloat({ min: 0 }).withMessage('Min price must be positive')
    .toFloat(),

  query('max_price')
    .optional()
    .isFloat({ min: 0 }).withMessage('Max price must be positive')
    .toFloat(),

  query('sort_by')
    .optional()
    .isIn(['created_at', 'price_per_unit', 'name', 'view_count', 'order_count'])
    .withMessage('Invalid sort field'),

  query('sort_order')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc'),

  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be positive')
    .toInt(),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
    .toInt(),

  validate
];

const myProductsQueryValidation = [
  query('status')
    .optional()
    .isIn(['active', 'paused', 'draft', 'deleted'])
    .withMessage('Invalid status'),

  query('category')
    .optional()
    .isIn(['vegetables', 'fruits', 'fish_seafood', 'meat_poultry', 'other'])
    .withMessage('Invalid category'),

  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be positive')
    .toInt(),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
    .toInt(),

  validate
];

module.exports = {
  createProductValidation,
  updateProductValidation,
  productQueryValidation,
  myProductsQueryValidation
};
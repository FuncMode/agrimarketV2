//  src\middleware\sanitizeMiddleware.js
const sanitizeHtml = require('sanitize-html');

const sanitizeInput = (req, res, next) => {
  const fieldsToSanitize = [
    'description',
    'message_text',
    'order_notes',
    'full_name',
    'phone_number',
    'address',
    'notes',
    'admin_notes',
    'rejection_reason'
  ];

  if (req.body) {
    fieldsToSanitize.forEach(field => {
      if (req.body[field] && typeof req.body[field] === 'string') {
        req.body[field] = sanitizeHtml(req.body[field], {
          allowedTags: [],
          allowedAttributes: {}
        }).trim();
      }
    });
  }

  if (req.query) {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = sanitizeHtml(req.query[key], {
          allowedTags: [],
          allowedAttributes: {}
        }).trim();
      }
    });
  }

  next();
};

module.exports = sanitizeInput;

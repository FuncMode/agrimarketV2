// src\middleware\errorHandler.js

const logger = require('../utils/logger');

class AppError extends Error {
  constructor(message, statusCode = 500, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.errors = errors; 
    
    Error.captureStackTrace(this, this.constructor);
  }
}

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode || 500;
  error.status = err.status || 'error';

  const errorContext = {
    statusCode: error.statusCode,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    requestId: req.id || 'unknown'
  };

  if (process.env.NODE_ENV === 'development') {
    errorContext.stack = err.stack;
    logger.error('Error occurred', errorContext);
  } else {
    logger.error('Error occurred', {
      ...errorContext,
      message: error.message
    });
  }


  if (err.message?.includes('JWT') || err.message?.includes('token')) {
    error.statusCode = 401;
    error.message = 'Invalid or expired token. Please login again.';
  }

  if (err.code === '23505') {
    error.statusCode = 409;
    error.message = 'This record already exists. Please use different values.';
  }

  if (err.code === '23503') {
    error.statusCode = 400;
    error.message = 'Referenced record does not exist.';
  }

  if (err.code === '23502') {
    error.statusCode = 400;
    error.message = 'Required field is missing.';
  }

  if (err.errors && Array.isArray(err.errors)) {
    error.statusCode = 400;
    error.message = 'Validation failed';
    error.errors = err.errors;
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    error.statusCode = 413;
    error.message = 'File size too large. Maximum 5MB allowed.';
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    error.statusCode = 400;
    error.message = 'Unexpected file field. Check your upload field name.';
  }

  if (err.statusCode === 429) {
    error.message = 'Too many requests. Please try again later.';
  }


  if (process.env.NODE_ENV === 'development') {
    return res.status(error.statusCode).json({
      success: false,
      status: error.status,
      message: error.message,
      errors: error.errors || null,
      stack: err.stack,
      error: err
    });
  }

  res.status(error.statusCode).json({
    success: false,
    status: error.status,
    message: error.statusCode === 500 
      ? 'Something went wrong. Please try again later.'
      : error.message,
    errors: error.errors || null
  });
};

const notFoundHandler = (req, res, next) => {
  // Return HTML 404 page for non-API requests
  if (!req.path.startsWith('/api')) {
    // Extract and verify user token to determine links dynamically
    let userRole = null;
    let isAuthenticated = false;

    try {
      const jwt = require('jsonwebtoken');
      let token;

      // Check Authorization header first
      if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
      ) {
        token = req.headers.authorization.split(' ')[1];
      }

      // Check cookies as fallback
      if (!token && req.cookies && req.cookies.token) {
        token = req.cookies.token;
      }

      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userRole = decoded.role || null;
        isAuthenticated = true;
      }
    } catch (error) {
      // Token is invalid or expired, user is not authenticated
      isAuthenticated = false;
      userRole = null;
    }

    // Generate dynamic help links based on authentication status and role
    let helpLinksHtml = '';
    let mainButtonsHtml = '';

    if (!isAuthenticated) {
      // Not logged in - show login/signup/home links
      helpLinksHtml = `
        <li><a href="/" class="text-green-600 hover:underline"><i class="bi bi-house-fill"></i> Back to Home</a></li>
        <li><a href="/index.html" class="text-green-600 hover:underline"><i class="bi bi-box-arrow-in-right"></i> Login</a></li>
        <li><a href="/index.html" class="text-green-600 hover:underline"><i class="bi bi-person-plus-fill"></i> Sign Up</a></li>
      `;
      mainButtonsHtml = `
        <a href="/" class="inline-block px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
          <i class="bi bi-house-fill"></i> Back to Home
        </a>
        <a href="/index.html" class="inline-block px-8 py-3 border border-green-600 text-green-600 rounded-lg hover:bg-green-50 transition">
          <i class="bi bi-box-arrow-in-right"></i> Login or Sign Up
        </a>
      `;
    } else if (userRole === 'buyer') {
      // Buyer logged in - show buyer-specific links
      helpLinksHtml = `
        <li><a href="/buyer.html" class="text-green-600 hover:underline"><i class="bi bi-house-fill"></i> Dashboard</a></li>
        <li><a href="/buyer.html#browse" class="text-green-600 hover:underline"><i class="bi bi-search"></i> Browse Products</a></li>
        <li><a href="/buyer.html#cart" class="text-green-600 hover:underline"><i class="bi bi-cart-fill"></i> View Cart</a></li>
        <li><a href="/buyer.html#orders" class="text-green-600 hover:underline"><i class="bi bi-bag-check-fill"></i> My Orders</a></li>
        <li><a href="/buyer.html#messages" class="text-green-600 hover:underline"><i class="bi bi-chat-dots-fill"></i> Messages</a></li>
        <li><a href="/buyer.html#profile" class="text-green-600 hover:underline"><i class="bi bi-person-fill"></i> My Profile</a></li>
      `;
      mainButtonsHtml = `
        <a href="/buyer.html" class="inline-block px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
          <i class="bi bi-house-fill"></i> Go to Dashboard
        </a>
        <a href="/buyer.html#browse" class="inline-block px-8 py-3 border border-green-600 text-green-600 rounded-lg hover:bg-green-50 transition">
          <i class="bi bi-search"></i> Browse Products
        </a>
      `;
    } else if (userRole === 'seller') {
      // Seller logged in - show seller-specific links
      helpLinksHtml = `
        <li><a href="/seller.html" class="text-green-600 hover:underline"><i class="bi bi-house-fill"></i> Dashboard</a></li>
        <li><a href="/seller.html#products" class="text-green-600 hover:underline"><i class="bi bi-shop"></i> My Products</a></li>
        <li><a href="/seller.html#orders" class="text-green-600 hover:underline"><i class="bi bi-box-seam-fill"></i> My Orders</a></li>
        <li><a href="/seller.html#analytics" class="text-green-600 hover:underline"><i class="bi bi-graph-up-arrow"></i> Analytics</a></li>
        <li><a href="/seller.html#messages" class="text-green-600 hover:underline"><i class="bi bi-chat-dots-fill"></i> Messages</a></li>
        <li><a href="/seller.html#profile" class="text-green-600 hover:underline"><i class="bi bi-person-fill"></i> My Profile</a></li>
      `;
      mainButtonsHtml = `
        <a href="/seller.html" class="inline-block px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
          <i class="bi bi-shop"></i> Go to Dashboard
        </a>
        <a href="/seller.html#products" class="inline-block px-8 py-3 border border-green-600 text-green-600 rounded-lg hover:bg-green-50 transition">
          <i class="bi bi-plus-circle-fill"></i> Manage Products
        </a>
      `;
    } else if (userRole === 'admin') {
      // Admin logged in - show admin-specific links
      helpLinksHtml = `
        <li><a href="/admin.html" class="text-green-600 hover:underline"><i class="bi bi-shield-lock-fill"></i> Admin Dashboard</a></li>
        <li><a href="/admin.html#users" class="text-green-600 hover:underline"><i class="bi bi-people-fill"></i> Manage Users</a></li>
        <li><a href="/admin.html#products" class="text-green-600 hover:underline"><i class="bi bi-box-seam-fill"></i> Manage Products</a></li>
        <li><a href="/admin.html#reports" class="text-green-600 hover:underline"><i class="bi bi-flag-fill"></i> Issue Reports</a></li>
        <li><a href="/admin.html#logs" class="text-green-600 hover:underline"><i class="bi bi-file-earmark-text"></i> Logs</a></li>
      `;
      mainButtonsHtml = `
        <a href="/admin.html" class="inline-block px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
          <i class="bi bi-shield-lock-fill"></i> Go to Dashboard
        </a>
        <a href="/admin.html#users" class="inline-block px-8 py-3 border border-green-600 text-green-600 rounded-lg hover:bg-green-50 transition">
          <i class="bi bi-people-fill"></i> Manage Users
        </a>
      `;
    }

    return res.status(404).set('Content-Type', 'text/html; charset=utf-8').send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>404 - Page Not Found - AgriMarket</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css">
        <link rel="icon" type="image/x-icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='75' font-size='75' fill='%2328a745'>🌾</text></svg>">
        <style>
          @keyframes bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-10px); }
          }
          .animate-bounce {
            animation: bounce 1s infinite;
          }
        </style>
      </head>
      <body class="bg-light">
        <nav class="bg-white shadow-sm sticky top-0 z-50">
          <div class="container mx-auto px-4 py-4 flex items-center justify-between">
            <a href="/" class="flex items-center gap-2 text-2xl font-bold text-green-600">
              <span>🛒</span>
              <span>AgriMarket</span>
            </a>
          </div>
        </nav>
        
        <div class="container mx-auto px-4 py-20">
          <div class="max-w-2xl mx-auto text-center">
            <div class="mb-8">
              <h1 class="text-9xl font-bold text-gray-300 mb-4 animate-bounce">404</h1>
            </div>
            
            <div class="mb-12">
              <h2 class="text-4xl font-bold text-gray-800 mb-4">Oops! Page Not Found</h2>
              <p class="text-xl text-gray-600 mb-6">The page you're looking for doesn't exist or has been moved.</p>
              <p class="text-sm text-gray-500">Requested: <code class="bg-gray-200 px-2 py-1 rounded">${req.originalUrl}</code></p>
            </div>
            
            <div class="mb-12">
              <div class="inline-block text-8xl">
                <i class="bi bi-exclamation-triangle" style="color: #ffc107;"></i>
              </div>
            </div>
            
            <div class="flex flex-col sm:flex-row gap-4 justify-center" id="mainButtons">
              ${mainButtonsHtml}
            </div>
            
            <div class="mt-12 p-8 bg-white rounded-lg shadow-sm border border-gray-200">
              <h3 class="text-lg font-semibold text-gray-800 mb-4">Need Help?</h3>
              <p class="text-gray-600 mb-4">Here are some helpful links:</p>
              <ul class="space-y-2" id="helpLinks">
                ${helpLinksHtml}
              </ul>
            </div>
          </div>
        </div>

        <script>
          // Check localStorage for user authentication on the client side
          document.addEventListener('DOMContentLoaded', function() {
            try {
              // Use the correct localStorage keys from auth.js
              const user = JSON.parse(localStorage.getItem('agrimarket_user'));
              const token = localStorage.getItem('agrimarket_token');
              
              if (user && token && user.role) {
                const role = user.role;
                
                if (role === 'buyer') {
                  document.getElementById('mainButtons').innerHTML = \`
                    <a href="/buyer.html" class="inline-block px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
                      <i class="bi bi-house-fill"></i> Go to Dashboard
                    </a>
                    <a href="/buyer.html#browse" class="inline-block px-8 py-3 border border-green-600 text-green-600 rounded-lg hover:bg-green-50 transition">
                      <i class="bi bi-search"></i> Browse Products
                    </a>
                  \`;
                  document.getElementById('helpLinks').innerHTML = \`
                    <li><a href="/buyer.html" class="text-green-600 hover:underline"><i class="bi bi-house-fill"></i> Dashboard</a></li>
                    <li><a href="/buyer.html#browse" class="text-green-600 hover:underline"><i class="bi bi-search"></i> Browse Products</a></li>
                    <li><a href="/buyer.html#cart" class="text-green-600 hover:underline"><i class="bi bi-cart-fill"></i> View Cart</a></li>
                    <li><a href="/buyer.html#orders" class="text-green-600 hover:underline"><i class="bi bi-bag-check-fill"></i> My Orders</a></li>
                    <li><a href="/buyer.html#messages" class="text-green-600 hover:underline"><i class="bi bi-chat-dots-fill"></i> Messages</a></li>
                    <li><a href="/buyer.html#profile" class="text-green-600 hover:underline"><i class="bi bi-person-fill"></i> My Profile</a></li>
                  \`;
                } else if (role === 'seller') {
                  document.getElementById('mainButtons').innerHTML = \`
                    <a href="/seller.html" class="inline-block px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
                      <i class="bi bi-shop"></i> Go to Dashboard
                    </a>
                    <a href="/seller.html#products" class="inline-block px-8 py-3 border border-green-600 text-green-600 rounded-lg hover:bg-green-50 transition">
                      <i class="bi bi-plus-circle-fill"></i> Manage Products
                    </a>
                  \`;
                  document.getElementById('helpLinks').innerHTML = \`
                    <li><a href="/seller.html" class="text-green-600 hover:underline"><i class="bi bi-house-fill"></i> Dashboard</a></li>
                    <li><a href="/seller.html#products" class="text-green-600 hover:underline"><i class="bi bi-shop"></i> My Products</a></li>
                    <li><a href="/seller.html#orders" class="text-green-600 hover:underline"><i class="bi bi-box-seam-fill"></i> My Orders</a></li>
                    <li><a href="/seller.html#analytics" class="text-green-600 hover:underline"><i class="bi bi-graph-up-arrow"></i> Analytics</a></li>
                    <li><a href="/seller.html#messages" class="text-green-600 hover:underline"><i class="bi bi-chat-dots-fill"></i> Messages</a></li>
                    <li><a href="/seller.html#profile" class="text-green-600 hover:underline"><i class="bi bi-person-fill"></i> My Profile</a></li>
                  \`;
                } else if (role === 'admin') {
                  document.getElementById('mainButtons').innerHTML = \`
                    <a href="/admin.html" class="inline-block px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
                      <i class="bi bi-shield-lock-fill"></i> Go to Dashboard
                    </a>
                    <a href="/admin.html#users" class="inline-block px-8 py-3 border border-green-600 text-green-600 rounded-lg hover:bg-green-50 transition">
                      <i class="bi bi-people-fill"></i> Manage Users
                    </a>
                  \`;
                  document.getElementById('helpLinks').innerHTML = \`
                    <li><a href="/admin.html" class="text-green-600 hover:underline"><i class="bi bi-shield-lock-fill"></i> Admin Dashboard</a></li>
                    <li><a href="/admin.html#users" class="text-green-600 hover:underline"><i class="bi bi-people-fill"></i> Manage Users</a></li>
                    <li><a href="/admin.html#products" class="text-green-600 hover:underline"><i class="bi bi-box-seam-fill"></i> Manage Products</a></li>
                    <li><a href="/admin.html#reports" class="text-green-600 hover:underline"><i class="bi bi-flag-fill"></i> Issue Reports</a></li>
                    <li><a href="/admin.html#logs" class="text-green-600 hover:underline"><i class="bi bi-file-earmark-text"></i> Logs</a></li>
                  \`;
                }
              }
            } catch (e) {
              // If localStorage parsing fails, keep default view
              console.log('Could not parse user data from localStorage', e);
            }
          });
        </script>
      </body>
      </html>
    `);
  }
  
  // Return JSON for API requests
  const error = new AppError(
    `Route not found: ${req.method} ${req.originalUrl}`,
    404
  );
  next(error);
};

const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};


module.exports = {
  AppError,
  errorHandler,
  notFoundHandler,
  asyncHandler
};

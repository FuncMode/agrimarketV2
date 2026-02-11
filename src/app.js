// src\app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
require('dotenv').config();

const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const sanitizeInput = require('./middleware/sanitizeMiddleware');
const { ipBlockingMiddleware } = require('./middleware/ipBlockingMiddleware');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const verificationRoutes = require('./routes/verificationRoutes');
const productRoutes = require('./routes/productRoutes');
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes');
const messageRoutes = require('./routes/messageRoutes');
const mapRoutes = require('./routes/mapRoutes');
const issueRoutes = require('./routes/issueRoutes');
const adminRoutes = require('./routes/adminRoutes');
const loggingRoutes = require('./routes/loggingRoutes');
const notificationRoutes = require('./routes/notificationRoutes');


const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdn.jsdelivr.net", "https://unpkg.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.socket.io", "https://cdn.tailwindcss.com", "https://unpkg.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "http://localhost:8080", "http://127.0.0.1:8080", "https://unpkg.com", "https://cdn.socket.io", "https://*.tile.openstreetmap.org", "ws:", "wss:"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
    },
  },
  hsts: {
    maxAge: 31536000, 
    includeSubDomains: true,
    preload: true
  }
}));

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:8080',
      'http://127.0.0.1:8080',
      process.env.CORS_ORIGIN,
      process.env.FRONTEND_URL
    ].filter(Boolean);

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  maxAge: 86400, 
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

const { ipBlockingService } = require('./middleware/ipBlockingMiddleware');
const logger = require('./utils/logger');

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    success: false,
    message: 'Too many requests from this IP. Please try again later.'
  },
  standardHeaders: true, 
  legacyHeaders: false,
  handler: (req, res) => {
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    ipBlockingService.recordViolation(clientIP);
    logger.warn('Rate limit exceeded', {
      ip: clientIP,
      path: req.path,
      method: req.method
    });
    res.status(429).json({
      success: false,
      message: 'Too many requests from this IP. Please try again later.'
    });
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 5,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again in 15 minutes.'
  },
  skipSuccessfulRequests: false,
  standardHeaders: true, 
  legacyHeaders: false,
  handler: (req, res) => {
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    ipBlockingService.recordViolation(clientIP);
    logger.warn('Auth rate limit exceeded', {
      ip: clientIP,
      path: req.path,
      method: req.method
    });
    res.status(429).json({
      success: false,
      message: 'Too many login attempts. Please try again in 15 minutes.'
    });
  }
});

app.use('/api/', ipBlockingMiddleware);
app.use('/api/', limiter);

app.use(express.json({ limit: '10mb' }));

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(compression());

app.use((req, res, next) => {
  req.setTimeout(30000);
  res.setTimeout(30000);
  next();
});

app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
});

app.use(sanitizeInput);

// Cache headers middleware for static assets
app.use((req, res, next) => {
  // Cache busting for .html files - don't cache
  if (req.path.endsWith('.html') || req.path === '/') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  // Long-term caching for versioned assets (js, css, images with hash)
  else if (/\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)$/i.test(req.path)) {
    if (req.path.includes('.min.') || req.path.match(/v\d+/) || /\.[a-f0-9]{8,}\./i.test(req.path)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year
    } else {
      res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
    }
  }
  next();
});

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined')); 
}


// Serve reset password page
app.get('/reset-password', (req, res) => {
  res.sendFile('reset-password.html', { root: './frontend/public' });
});

// Serve forgot password page
app.get('/forgot-password', (req, res) => {
  res.sendFile('forgot-password.html', { root: './frontend/public' });
});

// Serve static files from frontend/public
app.use(express.static('frontend/public'));
app.use('/uploads', express.static('uploads'));


app.get('/api/health', async (req, res) => {
  try {
    const { testConnection } = require('./config/database');
    const dbHealthy = await testConnection();

    res.status(200).json({
      success: true,
      message: 'AgriMarket API is running',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      database: dbHealthy.success ? 'connected' : 'disconnected'
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'Health check failed',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/verifications', verificationRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/map', mapRoutes);
app.use('/api/issues', issueRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/logs', loggingRoutes);
app.use('/api/notifications', notificationRoutes);

const { testConnection, validateSchema } = require('./config/database');

app.get('/api/test-db', async (req, res, next) => {
  try {
    const connectionTest = await testConnection();
    const schemaValidation = await validateSchema();

    res.status(200).json({
      success: true,
      message: 'Database test completed',
      connection: connectionTest,
      schema: schemaValidation
    });
  } catch (error) {
    next(error);
  }
});

app.use(notFoundHandler);
app.use(errorHandler);


module.exports = app;

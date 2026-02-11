// src\config\envValidation.js

const requiredEnvVars = [
  'NODE_ENV',
  'PORT',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_KEY',
  'JWT_SECRET'
];

const optionalEnvVars = [
  'CORS_ORIGIN',
  'RATE_LIMIT_WINDOW_MS',
  'RATE_LIMIT_MAX_REQUESTS',
  'MAX_FILE_SIZE',
  'LOG_LEVEL',
  'SENTRY_DSN'
];

const validateEnvironment = () => {
  console.log('Validating environment variables...');

  const missingVars = [];
  const warnings = [];

  requiredEnvVars.forEach(envVar => {
    if (!process.env[envVar]) {
      missingVars.push(envVar);
    }
  });

  optionalEnvVars.forEach(envVar => {
    if (!process.env[envVar]) {
      warnings.push(envVar);
    }
  });

  if (missingVars.length > 0) {
    const errorMsg = `Missing required environment variables:\n  - ${missingVars.join('\n  - ')}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  if (warnings.length > 0) {
    console.warn(
      `⚠️ Missing optional environment variables (using defaults):\n  - ${warnings.join('\n  - ')}`
    );
  }

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.warn('JWT_SECRET is too short. Use at least 32 characters for production.');
  }

  if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'production') {
    console.warn(`NODE_ENV should be 'development' or 'production', got: ${process.env.NODE_ENV}`);
  }

  const port = parseInt(process.env.PORT);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${process.env.PORT}. Must be between 1 and 65535.`);
  }

  console.log('Environment variables validated successfully!');
  console.log(`   Environment: ${process.env.NODE_ENV}`);
  console.log(`   Port: ${process.env.PORT}`);
};

module.exports = {
  validateEnvironment,
  requiredEnvVars,
  optionalEnvVars
};

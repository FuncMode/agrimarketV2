// copy-env-to-railway.js
// Helper script to display environment variables in Railway format

require('dotenv').config();

console.log('\n🚀 RAILWAY ENVIRONMENT VARIABLES');
console.log('Copy these to your Railway project dashboard:\n');
console.log('═'.repeat(50));

const envVars = [
    'NODE_ENV',
    'PORT', 
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY', 
    'SUPABASE_SERVICE_KEY',
    'JWT_SECRET',
    'CORS_ORIGIN',
    'FRONTEND_URL',
    'RATE_LIMIT_WINDOW_MS',
    'RATE_LIMIT_MAX_REQUESTS',
    'MAX_FILE_SIZE',
    'LOG_LEVEL',
    'SENTRY_DSN',
    'EMAIL_SERVICE',
    'EMAIL_FROM',
    'EMAIL_USER', 
    'EMAIL_PASSWORD',
    'EMAIL_TEST_MODE',
    'IP_BLOCK_VIOLATION_THRESHOLD',
    'IP_BLOCK_DURATION_MS',
    'IP_VIOLATION_RESET_MS',
    'DB_MONITORING_ENABLED',
    'DB_SLOW_QUERY_THRESHOLD_MS'
];

envVars.forEach(key => {
    const value = process.env[key];
    if (value) {
        console.log(`${key}=${value}`);
    } else {
        console.log(`${key}=<NOT SET>`);
    }
});

console.log('═'.repeat(50));
console.log('\n📝 Instructions:');
console.log('1. Go to your Railway project dashboard');
console.log('2. Click on "Variables" tab');  
console.log('3. Add each environment variable above');
console.log('4. Deploy your project');
console.log('\n✅ Your Railway deployment should work after this!');
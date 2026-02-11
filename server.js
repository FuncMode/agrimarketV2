// server.js  
require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./src/app');
const { testConnection, validateSchema } = require('./src/config/database');
const { validateEnvironment } = require('./src/config/envValidation');
const { verifyEmailConfig } = require('./src/services/emailService');

const PORT = process.env.PORT || 8080;
const NODE_ENV = process.env.NODE_ENV || 'development';

async function startServer() {
  try {
    console.log('\nStarting AgriMarket Server...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    validateEnvironment();
    
    console.log('\nTesting database connection...');
    const connectionResult = await testConnection();
    
    if (!connectionResult.success) {
      throw new Error(`Database connection failed: ${connectionResult.error}`);
    }

    console.log('\nValidating database schema...');
    const schemaResult = await validateSchema();
    
    if (!schemaResult.success) {
      console.warn('\nWARNING: Some tables are missing!');
      console.warn('Missing tables:', schemaResult.missingTables);
      console.warn('Please run the database schema SQL in Supabase SQL Editor');
      console.warn('Continuing anyway for development...\n');
    }

    console.log('\nVerifying email configuration...');
    const emailVerified = await verifyEmailConfig();
    if (!emailVerified) {
      console.warn('   Email service not properly configured. Email notifications may not work.');
      console.warn('   Check your .env EMAIL_* variables and ensure credentials are correct.');
    }

    const httpServer = http.createServer(app);

    const io = new Server(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:8080',
        credentials: true,
        methods: ['GET', 'POST']
      },
      transports: ['websocket', 'polling']
    });

    app.set('io', io);

    const socketServiceInstance = require('./src/services/socketService')(io);
    app.set('socketService', socketServiceInstance);

    const notificationService = require('./src/services/notificationService');
    notificationService.setSocketService(socketServiceInstance);

    const dbMonitor = require('./src/utils/dbMonitor');
    dbMonitor.startPeriodicMonitoring(5 * 60 * 1000);

    httpServer.listen(PORT, () => {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('AgriMarket Server is running!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`Environment: ${NODE_ENV}`);
      console.log(`Server URL: http://localhost:${PORT}`);
      console.log(`API Base: http://localhost:${PORT}/api`);
      console.log(`Health Check: http://localhost:${PORT}/api/health`);
      console.log(`DB Test: http://localhost:${PORT}/api/test-db`);
      console.log(`WebSocket: ws://localhost:${PORT}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('Press Ctrl+C to stop the server\n');
    });

    process.on('SIGTERM', () => gracefulShutdown(httpServer, 'SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown(httpServer, 'SIGINT'));

  } catch (error) {
    console.error('\nSERVER STARTUP FAILED!');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Error:', error.message);
    console.error('\nTroubleshooting steps:');
    console.error('1. Check if .env file exists and has correct values');
    console.error('2. Verify Supabase credentials are correct');
    console.error('3. Ensure database schema has been created');
    console.error('4. Check if port', PORT, 'is available');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    process.exit(1);
  }
}

function gracefulShutdown(server, signal) {
  console.log(`\n\n${signal} received. Starting graceful shutdown...`);
  
  server.close(() => {
    console.log('Server closed successfully');
    console.log('AgriMarket stopped. Goodbye!\n');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('\nUNHANDLED PROMISE REJECTION!');
  console.error('Reason:', reason);
  console.error('Promise:', promise);
  console.error('Shutting down...\n');
  process.exit(1);
});


process.on('uncaughtException', (error) => {
  console.error('\nUNCAUGHT EXCEPTION!');
  console.error('Error:', error.message);
  console.error('Stack:', error.stack);
  console.error('Shutting down...\n');
  process.exit(1);
});


startServer();

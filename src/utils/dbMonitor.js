// src\utils\dbMonitor.js

const logger = require('./logger');
const { supabase } = require('../config/database');

class DatabaseMonitor {
  constructor() {
    this.connectionStats = {
      totalQueries: 0,
      failedQueries: 0,
      slowQueries: 0,
      averageResponseTime: 0,
      lastCheck: null
    };
    this.slowQueryThreshold = parseInt(process.env.DB_SLOW_QUERY_THRESHOLD_MS) || 1000;
    this.monitoringEnabled = process.env.DB_MONITORING_ENABLED !== 'false';
  }

  async checkConnection() {
    try {
      const startTime = Date.now();
      const { error } = await supabase
        .from('users')
        .select('id')
        .limit(1);
      
      const duration = Date.now() - startTime;
      
      this.connectionStats.totalQueries++;
      this.connectionStats.lastCheck = new Date().toISOString();
      
      if (error) {
        this.connectionStats.failedQueries++;
        logger.error('Database connection check failed', {
          error: error.message,
          duration_ms: duration
        });
        return { healthy: false, error: error.message, duration };
      }
      
      if (duration > this.slowQueryThreshold) {
        this.connectionStats.slowQueries++;
        logger.warn('Slow database query detected', {
          duration_ms: duration,
          threshold_ms: this.slowQueryThreshold
        });
      }
      
      this.updateAverageResponseTime(duration);
      
      return { healthy: true, duration };
    } catch (error) {
      this.connectionStats.failedQueries++;
      logger.error('Database connection check error', {
        error: error.message,
        stack: error.stack
      });
      return { healthy: false, error: error.message };
    }
  }

  updateAverageResponseTime(duration) {
    const currentAvg = this.connectionStats.averageResponseTime;
    const total = this.connectionStats.totalQueries;
    
    this.connectionStats.averageResponseTime = 
      ((currentAvg * (total - 1)) + duration) / total;
  }

  getStats() {
    return {
      ...this.connectionStats,
      successRate: this.connectionStats.totalQueries > 0
        ? ((this.connectionStats.totalQueries - this.connectionStats.failedQueries) / this.connectionStats.totalQueries * 100).toFixed(2) + '%'
        : '0%',
      slowQueryRate: this.connectionStats.totalQueries > 0
        ? ((this.connectionStats.slowQueries / this.connectionStats.totalQueries) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  resetStats() {
    this.connectionStats = {
      totalQueries: 0,
      failedQueries: 0,
      slowQueries: 0,
      averageResponseTime: 0,
      lastCheck: null
    };
  }

  startPeriodicMonitoring(intervalMs = 5 * 60 * 1000) {
    if (!this.monitoringEnabled) {
      logger.info('Database monitoring disabled');
      return;
    }

    logger.info('Starting database connection monitoring', {
      interval_ms: intervalMs,
      slow_query_threshold_ms: this.slowQueryThreshold
    });

    setInterval(async () => {
      const result = await this.checkConnection();
      if (!result.healthy) {
        logger.error('Periodic database health check failed', result);
      }
    }, intervalMs);

    this.checkConnection();
  }
}

const dbMonitor = new DatabaseMonitor();

module.exports = dbMonitor;

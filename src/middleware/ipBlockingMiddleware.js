// src\middleware\ipBlockingMiddleware.js

const logger = require('../utils/logger');

class IPBlockingService {
  constructor() {
    this.blockedIPs = new Map();
    this.violationCounts = new Map();
    this.VIOLATION_THRESHOLD = parseInt(process.env.IP_BLOCK_VIOLATION_THRESHOLD) || 5;
    this.BLOCK_DURATION_MS = parseInt(process.env.IP_BLOCK_DURATION_MS) || 60 * 60 * 1000; // 1 hour default
    this.VIOLATION_RESET_MS = parseInt(process.env.IP_VIOLATION_RESET_MS) || 15 * 60 * 1000; // 15 minutes
  }

  recordViolation(ip) {
    const now = Date.now();
    const violations = this.violationCounts.get(ip) || { count: 0, firstViolation: now };
    
    violations.count += 1;
    
    if (violations.count >= this.VIOLATION_THRESHOLD) {
      this.blockIP(ip);
      logger.warn('IP blocked due to repeated violations', {
        ip,
        violation_count: violations.count,
        block_duration_ms: this.BLOCK_DURATION_MS
      });
    } else {
      this.violationCounts.set(ip, violations);
      
      setTimeout(() => {
        const current = this.violationCounts.get(ip);
        if (current && current.firstViolation === violations.firstViolation) {
          this.violationCounts.delete(ip);
        }
      }, this.VIOLATION_RESET_MS);
    }
  }

  blockIP(ip) {
    const blockUntil = Date.now() + this.BLOCK_DURATION_MS;
    this.blockedIPs.set(ip, blockUntil);
    
    setTimeout(() => {
      if (this.blockedIPs.get(ip) === blockUntil) {
        this.blockedIPs.delete(ip);
        this.violationCounts.delete(ip);
        logger.info('IP block expired', { ip });
      }
    }, this.BLOCK_DURATION_MS);
  }

  isBlocked(ip) {
    const blockUntil = this.blockedIPs.get(ip);
    if (!blockUntil) {
      return false;
    }
    
    if (Date.now() >= blockUntil) {
      this.blockedIPs.delete(ip);
      return false;
    }
    
    return true;
  }

  getBlockTimeRemaining(ip) {
    const blockUntil = this.blockedIPs.get(ip);
    if (!blockUntil) {
      return 0;
    }
    
    const remaining = blockUntil - Date.now();
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }

  getStats() {
    return {
      blocked_count: this.blockedIPs.size,
      violation_tracking_count: this.violationCounts.size,
      threshold: this.VIOLATION_THRESHOLD,
      block_duration_ms: this.BLOCK_DURATION_MS
    };
  }
}

const ipBlockingService = new IPBlockingService();

const ipBlockingMiddleware = (req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  
  if (ipBlockingService.isBlocked(clientIP)) {
    const remainingSeconds = ipBlockingService.getBlockTimeRemaining(clientIP);
    const remainingMinutes = Math.ceil(remainingSeconds / 60);
    
    logger.warn('Blocked IP attempted access', {
      ip: clientIP,
      path: req.path,
      remaining_minutes: remainingMinutes
    });
    
    return res.status(403).json({
      success: false,
      message: `Your IP has been temporarily blocked due to repeated violations. Please try again in ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}.`,
      blocked_until: new Date(Date.now() + remainingSeconds * 1000).toISOString()
    });
  }
  
  next();
};

const recordRateLimitViolation = (req, res, next) => {
  const originalSend = res.send;
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  
  res.send = function(body) {
    if (res.statusCode === 429) {
      ipBlockingService.recordViolation(clientIP);
      logger.warn('Rate limit violation recorded', {
        ip: clientIP,
        path: req.path,
        method: req.method
      });
    }
    return originalSend.call(this, body);
  };
  
  next();
};

module.exports = {
  ipBlockingMiddleware,
  recordRateLimitViolation,
  ipBlockingService
};

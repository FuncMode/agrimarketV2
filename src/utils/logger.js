// src\utils\logger.js

const fs = require('fs');
const path = require('path');

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const COLORS = {
  ERROR: '\x1b[31m', 
  WARN: '\x1b[33m',  
  INFO: '\x1b[36m',  
  DEBUG: '\x1b[90m', 
  RESET: '\x1b[0m'
};

class Logger {
  constructor(options = {}) {
    this.level = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] || LOG_LEVELS.INFO;
    this.enableColors = options.enableColors !== false;
    this.enableTimestamp = options.enableTimestamp !== false;
    this.logToFile = options.logToFile || false;
    this.logDir = options.logDir || path.join(__dirname, '../../logs');

    if (this.logToFile) {
      this.ensureLogDirectory();
    }
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = this.enableTimestamp ? new Date().toISOString() : null;
    const color = this.enableColors ? COLORS[level] : '';
    const reset = this.enableColors ? COLORS.RESET : '';

    let formatted = '';

    if (timestamp) {
      formatted += `[${timestamp}] `;
    }

    formatted += `${color}[${level}]${reset} `;
    formatted += message;

    if (Object.keys(meta).length > 0) {
      formatted += ` ${JSON.stringify(meta)}`;
    }

    return formatted;
  }

  writeToFile(level, message, meta) {
    if (!this.logToFile) return;

    const timestamp = new Date().toISOString();
    const date = timestamp.split('T')[0];
    const logFile = path.join(this.logDir, `${date}.log`);

    const logEntry = {
      timestamp,
      level,
      message,
      ...meta
    };

    const logLine = JSON.stringify(logEntry) + '\n';

    fs.appendFileSync(logFile, logLine, 'utf8');
  }

  log(level, message, meta = {}) {
    if (LOG_LEVELS[level] > this.level) {
      return;
    }

    const formatted = this.formatMessage(level, message, meta);
    
    switch (level) {
      case 'ERROR':
        console.error(formatted);
        break;
      case 'WARN':
        console.warn(formatted);
        break;
      default:
        console.log(formatted);
    }

    this.writeToFile(level, message, meta);
  }

  error(message, meta = {}) {
    this.log('ERROR', message, meta);
  }

  warn(message, meta = {}) {
    this.log('WARN', message, meta);
  }

  info(message, meta = {}) {
    this.log('INFO', message, meta);
  }

  debug(message, meta = {}) {
    this.log('DEBUG', message, meta);
  }

  logRequest(req, res, duration) {
    const meta = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent')
    };

    if (res.statusCode >= 500) {
      this.error('HTTP Request Failed', meta);
    } else if (res.statusCode >= 400) {
      this.warn('HTTP Request Error', meta);
    } else {
      this.info('HTTP Request', meta);
    }
  }

  logQuery(query, duration, error = null) {
    const meta = {
      query: query.substring(0, 100),
      duration: `${duration}ms`
    };

    if (error) {
      this.error('Database Query Failed', { ...meta, error: error.message });
    } else {
      this.debug('Database Query', meta);
    }
  }

  logAuth(action, userId, success, meta = {}) {
    const logMeta = {
      action,
      userId,
      success,
      ...meta
    };

    if (success) {
      this.info('Authentication Success', logMeta);
    } else {
      this.warn('Authentication Failed', logMeta);
    }
  }

  logError(error, context = {}) {
    this.error(error.message, {
      stack: error.stack,
      ...context
    });
  }

  logSecurity(event, meta = {}) {
    this.warn(`Security Event: ${event}`, meta);
  }

  logPerformance(operation, duration, meta = {}) {
    const logMeta = {
      operation,
      duration: `${duration}ms`,
      ...meta
    };

    if (duration > 1000) {
      this.warn('Slow Operation', logMeta);
    } else {
      this.debug('Performance', logMeta);
    }
  }
}

const logger = new Logger({
  enableColors: process.env.NODE_ENV !== 'production',
  logToFile: process.env.NODE_ENV === 'production'
});

logger.middleware = (req, res, next) => {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.logRequest(req, res, duration);
  });

  next();
};

logger.timer = (label) => {
  const startTime = Date.now();

  return {
    end: (meta = {}) => {
      const duration = Date.now() - startTime;
      logger.logPerformance(label, duration, meta);
      return duration;
    }
  };
};

module.exports = logger;
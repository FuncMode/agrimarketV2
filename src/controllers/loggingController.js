// src\controllers\loggingController.js

const { AppError, asyncHandler } = require('../middleware/errorHandler');
const adminLogModel = require('../models/adminLogModel');
const auditLogModel = require('../models/auditLogModel');

exports.getAdminLogs = asyncHandler(async (req, res, next) => {
  const {
    admin_id,
    action_type,
    date_from,
    date_to,
    page = 1,
    limit = 50
  } = req.query;

  const filters = {
    page: parseInt(page),
    limit: parseInt(limit)
  };

  if (admin_id) filters.admin_id = admin_id;
  if (action_type) filters.action_type = action_type;
  if (date_from) filters.date_from = date_from;
  if (date_to) filters.date_to = date_to;

  const { data: logs, error, count, total_pages } = await adminLogModel.getAllLogs(filters);

  if (error) {
    throw new AppError('Failed to fetch admin logs.', 500);
  }

  res.status(200).json({
    success: true,
    results: logs.length,
    total: count,
    page: parseInt(page),
    limit: parseInt(limit),
    total_pages,
    data: {
      logs
    }
  });
});


exports.getAuditTrail = asyncHandler(async (req, res, next) => {
  const { recordId } = req.params;
  const { action_type } = req.query;

  const filters = {};
  if (action_type) filters.action_type = action_type;

  const { data: logs, error } = await auditLogModel.getRecordAuditTrail(recordId, filters);

  if (error) {
    throw new AppError('Failed to fetch audit trail.', 500);
  }

  res.status(200).json({
    success: true,
    results: logs.length,
    data: {
      record_id: recordId,
      audit_trail: logs
    }
  });
});


exports.getSecurityEvents = asyncHandler(async (req, res, next) => {
  const { date_from, date_to, limit = 100 } = req.query;

  const filters = { limit: parseInt(limit) };
  if (date_from) filters.date_from = date_from;
  if (date_to) filters.date_to = date_to;

  const { data: events, error } = await auditLogModel.getSecurityEvents(filters);

  if (error) {
    throw new AppError('Failed to fetch security events.', 500);
  }

  res.status(200).json({
    success: true,
    results: events.length,
    data: {
      security_events: events
    }
  });
});

exports.getFailedAuthAttempts = asyncHandler(async (req, res, next) => {
  const { ip_address, date_from, limit = 100 } = req.query;

  const filters = { limit: parseInt(limit) };
  if (ip_address) filters.ip_address = ip_address;
  if (date_from) filters.date_from = date_from;

  const { data: attempts, error } = await auditLogModel.getFailedAuthAttempts(filters);

  if (error) {
    throw new AppError('Failed to fetch authentication attempts.', 500);
  }

  res.status(200).json({
    success: true,
    results: attempts.length,
    data: {
      failed_attempts: attempts
    }
  });
});


exports.getAuditStats = asyncHandler(async (req, res, next) => {
  const { timeframe = '7d' } = req.query;

  const validTimeframes = ['24h', '7d', '30d'];
  if (!validTimeframes.includes(timeframe)) {
    throw new AppError('Invalid timeframe. Must be: 24h, 7d, or 30d', 400);
  }

  const { data: stats, error } = await auditLogModel.getAuditStats(timeframe);

  if (error) {
    throw new AppError('Failed to fetch audit statistics.', 500);
  }

  res.status(200).json({
    success: true,
    data: {
      timeframe,
      stats
    }
  });
});


exports.getLogStats = asyncHandler(async (req, res, next) => {
  const { date_from, date_to } = req.query;

  const filters = {};
  if (date_from) filters.date_from = date_from;
  if (date_to) filters.date_to = date_to;

  const { data: stats, error } = await adminLogModel.getLogStats(filters);

  if (error) {
    throw new AppError('Failed to fetch log statistics.', 500);
  }

  res.status(200).json({
    success: true,
    data: {
      stats
    }
  });
});

exports.searchLogs = asyncHandler(async (req, res, next) => {
  const { q, limit = 50 } = req.query;

  if (!q || q.trim().length === 0) {
    throw new AppError('Search query is required.', 400);
  }

  const { data: logs, error } = await adminLogModel.searchLogs(q, { limit: parseInt(limit) });

  if (error) {
    throw new AppError('Failed to search logs.', 500);
  }

  res.status(200).json({
    success: true,
    results: logs.length,
    data: {
      search_query: q,
      logs
    }
  });
});

exports.getUserActivityLogs = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const { action_type, limit = 50 } = req.query;

  const filters = { limit: parseInt(limit) };
  if (action_type) filters.action_type = action_type;

  const { data: logs, error } = await adminLogModel.getUserLogs(userId, filters);

  if (error) {
    throw new AppError('Failed to fetch user activity logs.', 500);
  }

  res.status(200).json({
    success: true,
    results: logs.length,
    data: {
      user_id: userId,
      activity_logs: logs
    }
  });
});

exports.checkSuspiciousActivity = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;

  const result = await auditLogModel.detectSuspiciousActivity(userId);

  res.status(200).json({
    success: true,
    data: {
      user_id: userId,
      ...result
    }
  });
});

exports.exportLogs = asyncHandler(async (req, res, next) => {
  const {
    action_type,
    date_from,
    date_to,
    format = 'json'
  } = req.query;

  const filters = { limit: 10000 }; 
  if (action_type) filters.action_type = action_type;
  if (date_from) filters.date_from = date_from;
  if (date_to) filters.date_to = date_to;

  const { data: logs, error } = await adminLogModel.getAllLogs(filters);

  if (error) {
    throw new AppError('Failed to export logs.', 500);
  }

  if (format === 'csv') {
    const csvHeader = 'ID,Admin,Action Type,Description,Target User,Created At\n';
    const csvRows = logs.map(log => {
      return `${log.id},${log.admin?.full_name || 'N/A'},${log.action_type},"${log.action_description}",${log.target_user?.full_name || 'N/A'},${log.created_at}`;
    }).join('\n');

    const csv = csvHeader + csvRows;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=logs-${Date.now()}.csv`);
    return res.send(csv);
  }

  res.status(200).json({
    success: true,
    results: logs.length,
    data: {
      logs
    }
  });
});

exports.cleanupOldLogs = asyncHandler(async (req, res, next) => {
  const { days_old = 90 } = req.body;

  if (days_old < 30) {
    throw new AppError('Cannot delete logs less than 30 days old.', 400);
  }

  const { data, error } = await adminLogModel.deleteOldLogs(days_old);

  if (error) {
    throw new AppError('Failed to clean up logs.', 500);
  }

  await adminLogModel.createLog({
    admin_id: req.user.id,
    action_type: 'LOGS_CLEANUP',
    action_description: `Deleted logs older than ${days_old} days`,
    ip_address: req.ip
  });

  res.status(200).json({
    success: true,
    message: `Successfully cleaned up logs older than ${days_old} days.`
  });
});

module.exports = exports;
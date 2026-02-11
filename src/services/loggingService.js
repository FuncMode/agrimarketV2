// src\services\loggingService.js

const adminLogModel = require('../models/adminLogModel');
const auditLogModel = require('../models/auditLogModel');

exports.logAdminAction = async (actionData) => {
  try {
    const { data, error } = await adminLogModel.createLog({
      admin_id: actionData.admin_id,
      action_type: actionData.action_type,
      action_description: actionData.action_description,
      target_user_id: actionData.target_user_id || null,
      reference_id: actionData.reference_id || null,
      ip_address: actionData.ip_address || null
    });

    if (error) {
      console.error('Failed to log admin action:', error);
      return { success: false, error };
    }

    return { success: true, data };

  } catch (error) {
    console.error('Admin logging error:', error);
    return { success: false, error: error.message };
  }
};

exports.logUserActivity = async (activityData) => {
  try {
    const { data, error } = await auditLogModel.logUserAction({
      user_id: activityData.user_id,
      action_type: activityData.action_type,
      action_description: activityData.action_description,
      target_user_id: activityData.target_user_id || null,
      reference_id: activityData.reference_id || null,
      ip_address: activityData.ip_address || null
    });

    if (error) {
      console.error('Failed to log user activity:', error);
      return { success: false, error };
    }

    return { success: true, data };

  } catch (error) {
    console.error('User activity logging error:', error);
    return { success: false, error: error.message };
  }
};

exports.logAuthAttempt = async (authData) => {
  try {
    const { data, error } = await auditLogModel.logAuthAttempt({
      user_id: authData.user_id || null,
      action: authData.action,
      success: authData.success,
      ip_address: authData.ip_address || null
    });

    if (error) {
      console.error('Failed to log auth attempt:', error);
      return { success: false, error };
    }

    return { success: true, data };

  } catch (error) {
    console.error('Auth logging error:', error);
    return { success: false, error: error.message };
  }
};

exports.logSecurityEvent = async (eventData) => {
  try {
    const { data, error } = await auditLogModel.logSecurityEvent({
      user_id: eventData.user_id || null,
      description: eventData.description,
      target_user_id: eventData.target_user_id || null,
      ip_address: eventData.ip_address || null
    });

    if (error) {
      console.error('Failed to log security event:', error);
      return { success: false, error };
    }

    if (eventData.critical) {
      console.warn('SECURITY EVENT:', eventData.description);
    }

    return { success: true, data };

  } catch (error) {
    console.error('Security event logging error:', error);
    return { success: false, error: error.message };
  }
};

exports.logSystemEvent = async (eventData) => {
  try {
    const { data, error } = await auditLogModel.logSystemEvent({
      admin_id: eventData.admin_id || null,
      description: eventData.description,
      reference_id: eventData.reference_id || null,
      ip_address: eventData.ip_address || null
    });

    if (error) {
      console.error('Failed to log system event:', error);
      return { success: false, error };
    }

    return { success: true, data };

  } catch (error) {
    console.error('System event logging error:', error);
    return { success: false, error: error.message };
  }
};

exports.logDataModification = async (modData) => {
  try {
    const { data, error } = await auditLogModel.logDataModification({
      user_id: modData.user_id,
      operation: modData.operation, 
      table: modData.table,
      description: modData.description,
      record_id: modData.record_id || null,
      ip_address: modData.ip_address || null
    });

    if (error) {
      console.error('Failed to log data modification:', error);
      return { success: false, error };
    }

    return { success: true, data };

  } catch (error) {
    console.error('Data modification logging error:', error);
    return { success: false, error: error.message };
  }
};

exports.logOrderEvent = async (orderData) => {
  try {
    const action_type = `ORDER_${orderData.action.toUpperCase()}`;
    const description = `${orderData.action} order ${orderData.order_number}`;

    return await exports.logUserActivity({
      user_id: orderData.user_id,
      action_type,
      action_description: description,
      reference_id: orderData.order_id,
      ip_address: orderData.ip_address
    });

  } catch (error) {
    console.error('Order event logging error:', error);
    return { success: false, error: error.message };
  }
};

exports.logVerificationEvent = async (verificationData) => {
  try {
    const action_type = `VERIFICATION_${verificationData.action.toUpperCase()}`;
    
    return await exports.logAdminAction({
      admin_id: verificationData.admin_id,
      action_type,
      action_description: verificationData.description,
      target_user_id: verificationData.user_id,
      reference_id: verificationData.verification_id,
      ip_address: verificationData.ip_address
    });

  } catch (error) {
    console.error('Verification event logging error:', error);
    return { success: false, error: error.message };
  }
};

exports.logIssueEvent = async (issueData) => {
  try {
    const action_type = `ISSUE_${issueData.action.toUpperCase()}`;
    
    return await exports.logUserActivity({
      user_id: issueData.user_id,
      action_type,
      action_description: issueData.description,
      reference_id: issueData.issue_id,
      ip_address: issueData.ip_address
    });

  } catch (error) {
    console.error('Issue event logging error:', error);
    return { success: false, error: error.message };
  }
};

exports.getRecentUserActivity = async (userId, limit = 10) => {
  try {
    const { data, error } = await adminLogModel.getUserLogs(userId, { limit });

    if (error) {
      return { success: false, error };
    }

    return { success: true, data };

  } catch (error) {
    console.error('Get recent activity error:', error);
    return { success: false, error: error.message };
  }
};

exports.checkSuspiciousActivity = async (userId) => {
  try {
    const result = await auditLogModel.detectSuspiciousActivity(userId);
    
    if (result.suspicious) {
      await exports.logSecurityEvent({
        user_id: userId,
        description: `Suspicious activity detected: ${result.reason}`,
        critical: true
      });
    }

    return result;

  } catch (error) {
    console.error('Suspicious activity check error:', error);
    return { suspicious: false, error: error.message };
  }
};

exports.batchLogEvents = async (events) => {
  const results = [];

  for (const event of events) {
    let result;

    switch (event.type) {
      case 'admin':
        result = await exports.logAdminAction(event.data);
        break;
      case 'user':
        result = await exports.logUserActivity(event.data);
        break;
      case 'security':
        result = await exports.logSecurityEvent(event.data);
        break;
      case 'system':
        result = await exports.logSystemEvent(event.data);
        break;
      default:
        result = { success: false, error: 'Unknown event type' };
    }

    results.push(result);
  }

  return results;
};

exports.devLog = (message, data = null) => {
};

exports.logError = (error, context = {}) => {
  console.error('\nERROR LOG:');
  console.error('Message:', error.message);
  console.error('Stack:', error.stack);
  if (Object.keys(context).length > 0) {
    console.error('Context:', JSON.stringify(context, null, 2));
  }
  console.error('');

  if (process.env.NODE_ENV === 'production') {
  }
};

module.exports = exports;
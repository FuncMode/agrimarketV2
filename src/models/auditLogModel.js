// src\models\auditLogModel.js

const { supabase, supabaseService } = require('../config/database');

exports.logUserAction = async (actionData) => {
  const { data, error } = await supabaseService
    .from('admin_logs')
    .insert([{
      admin_id: actionData.user_id,
      action_type: actionData.action_type,
      action_description: actionData.action_description,
      target_user_id: actionData.target_user_id || null,
      reference_id: actionData.reference_id || null,
      ip_address: actionData.ip_address || null
    }])
    .select()
    .single();

  return { data, error };
};

exports.logSystemEvent = async (eventData) => {
  const { data, error } = await supabaseService
    .from('admin_logs')
    .insert([{
      admin_id: eventData.admin_id || null,
      action_type: 'SYSTEM_EVENT',
      action_description: eventData.description,
      reference_id: eventData.reference_id || null,
      ip_address: eventData.ip_address || null
    }])
    .select()
    .single();

  return { data, error };
};

exports.logSecurityEvent = async (eventData) => {
  const { data, error } = await supabaseService
    .from('admin_logs')
    .insert([{
      admin_id: eventData.user_id || null,
      action_type: 'SECURITY_EVENT',
      action_description: eventData.description,
      target_user_id: eventData.target_user_id || null,
      ip_address: eventData.ip_address || null
    }])
    .select()
    .single();

  return { data, error };
};

exports.logAuthAttempt = async (authData) => {
  const { data, error } = await supabaseService
    .from('admin_logs')
    .insert([{
      admin_id: authData.user_id || null,
      action_type: authData.success ? 'AUTH_SUCCESS' : 'AUTH_FAILURE',
      action_description: `${authData.action} attempt ${authData.success ? 'succeeded' : 'failed'}`,
      ip_address: authData.ip_address || null
    }])
    .select()
    .single();

  return { data, error };
};

exports.logDataModification = async (modData) => {
  const { data, error } = await supabaseService
    .from('admin_logs')
    .insert([{
      admin_id: modData.user_id,
      action_type: 'DATA_MODIFICATION',
      action_description: `${modData.operation} on ${modData.table}: ${modData.description}`,
      reference_id: modData.record_id || null,
      ip_address: modData.ip_address || null
    }])
    .select()
    .single();

  return { data, error };
};

exports.getRecordAuditTrail = async (recordId, filters = {}) => {
  let query = supabase
    .from('admin_logs')
    .select(`
      *,
      admin:users!admin_logs_admin_id_fkey (
        id,
        full_name,
        email,
        role
      )
    `)
    .eq('reference_id', recordId)
    .order('created_at', { ascending: false });

  if (filters.action_type) {
    query = query.eq('action_type', filters.action_type);
  }

  const { data, error } = await query;

  return { data: data || [], error };
};

exports.getSecurityEvents = async (filters = {}) => {
  let query = supabase
    .from('admin_logs')
    .select(`
      *,
      admin:users!admin_logs_admin_id_fkey (
        id,
        full_name,
        email
      )
    `)
    .eq('action_type', 'SECURITY_EVENT')
    .order('created_at', { ascending: false });

  if (filters.date_from) {
    query = query.gte('created_at', filters.date_from);
  }

  if (filters.date_to) {
    query = query.lte('created_at', filters.date_to);
  }

  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;

  return { data: data || [], error };
};

exports.getFailedAuthAttempts = async (filters = {}) => {
  let query = supabase
    .from('admin_logs')
    .select('*')
    .eq('action_type', 'AUTH_FAILURE')
    .order('created_at', { ascending: false });

  if (filters.ip_address) {
    query = query.eq('ip_address', filters.ip_address);
  }

  if (filters.date_from) {
    query = query.gte('created_at', filters.date_from);
  }

  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;

  return { data: data || [], error };
};

exports.getAuditStats = async (timeframe = '7d') => {
  const stats = {
    total_events: 0,
    by_type: {},
    security_events: 0,
    failed_auth: 0,
    data_modifications: 0,
    timeline: []
  };

  try {
    const now = new Date();
    const dateFrom = new Date();
    
    switch (timeframe) {
      case '24h':
        dateFrom.setHours(dateFrom.getHours() - 24);
        break;
      case '7d':
        dateFrom.setDate(dateFrom.getDate() - 7);
        break;
      case '30d':
        dateFrom.setDate(dateFrom.getDate() - 30);
        break;
      default:
        dateFrom.setDate(dateFrom.getDate() - 7);
    }

    const { data: logs } = await supabase
      .from('admin_logs')
      .select('*')
      .gte('created_at', dateFrom.toISOString());

    if (logs) {
      stats.total_events = logs.length;

      logs.forEach(log => {
        if (!stats.by_type[log.action_type]) {
          stats.by_type[log.action_type] = 0;
        }
        stats.by_type[log.action_type]++;
        if (log.action_type === 'SECURITY_EVENT') {
          stats.security_events++;
        }
        if (log.action_type === 'AUTH_FAILURE') {
          stats.failed_auth++;
        }
        if (log.action_type === 'DATA_MODIFICATION') {
          stats.data_modifications++;
        }
      });

      const timelineMap = {};
      logs.forEach(log => {
        const date = new Date(log.created_at).toISOString().split('T')[0];
        if (!timelineMap[date]) {
          timelineMap[date] = 0;
        }
        timelineMap[date]++;
      });

      stats.timeline = Object.entries(timelineMap)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    return { data: stats, error: null };

  } catch (error) {
    console.error('Get audit stats error:', error);
    return { data: stats, error };
  }
};

exports.detectSuspiciousActivity = async (userId, timeWindow = 3600000) => {
  const now = new Date();
  const windowStart = new Date(now.getTime() - timeWindow);

  const { data: recentActions } = await supabase
    .from('admin_logs')
    .select('*')
    .eq('admin_id', userId)
    .gte('created_at', windowStart.toISOString());

  if (!recentActions) {
    return { suspicious: false, reason: null };
  }

  const failedLogins = recentActions.filter(a => a.action_type === 'AUTH_FAILURE').length;
  if (failedLogins >= 5) {
    return {
      suspicious: true,
      reason: 'Excessive failed login attempts',
      count: failedLogins
    };
  }

  if (recentActions.length >= 100) {
    return {
      suspicious: true,
      reason: 'Unusually high activity rate',
      count: recentActions.length
    };
  }

  return { suspicious: false, reason: null };
};

module.exports = exports;
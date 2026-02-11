// src\models\adminLogModel.js

const { supabase, supabaseService } = require('../config/database');

exports.createLog = async (logData) => {
  const { data, error } = await supabaseService
    .from('admin_logs')
    .insert([{
      admin_id: logData.admin_id,
      action_type: logData.action_type,
      action_description: logData.action_description,
      target_user_id: logData.target_user_id || null,
      reference_id: logData.reference_id || null,
      ip_address: logData.ip_address || null
    }])
    .select()
    .single();

  return { data, error };
};

exports.getAdminLogs = async (adminId, filters = {}) => {
  let query = supabase
    .from('admin_logs')
    .select(`
      *,
      admin:users!admin_logs_admin_id_fkey (
        id,
        full_name,
        email
      ),
      target_user:users!admin_logs_target_user_id_fkey (
        id,
        full_name,
        email,
        role
      )
    `)
    .eq('admin_id', adminId)
    .order('created_at', { ascending: false });

  if (filters.action_type) {
    query = query.eq('action_type', filters.action_type);
  }

  if (filters.date_from) {
    const dateFrom = typeof filters.date_from === 'string' 
      ? filters.date_from 
      : filters.date_from.toISOString();
    query = query.gte('created_at', dateFrom);
  }

  if (filters.date_to) {
    let dateTo = typeof filters.date_to === 'string' 
      ? new Date(filters.date_to) 
      : new Date(filters.date_to);
    dateTo.setDate(dateTo.getDate() + 1);
    dateTo.setHours(0, 0, 0, 0);
    query = query.lt('created_at', dateTo.toISOString());
  }

  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;

  return { data: data || [], error };
};

exports.getAllLogs = async (filters = {}) => {
  const page = filters.page || 1;
  const limit = filters.limit || 50;
  const offset = (page - 1) * limit;

  let query = supabase
    .from('admin_logs')
    .select(`
      *,
      admin:users!admin_logs_admin_id_fkey (
        id,
        full_name,
        email
      ),
      target_user:users!admin_logs_target_user_id_fkey (
        id,
        full_name,
        email,
        role
      )
    `, { count: 'exact' })
    .order('created_at', { ascending: false });

  if (filters.action_type) {
    query = query.eq('action_type', filters.action_type);
  }

  if (filters.admin_id) {
    query = query.eq('admin_id', filters.admin_id);
  }

  if (filters.target_user_id) {
    query = query.eq('target_user_id', filters.target_user_id);
  }

  if (filters.date_from) {
    const dateFrom = typeof filters.date_from === 'string' 
      ? filters.date_from 
      : filters.date_from.toISOString();
    query = query.gte('created_at', dateFrom);
  }

  if (filters.date_to) {
    let dateTo = typeof filters.date_to === 'string' 
      ? new Date(filters.date_to) 
      : new Date(filters.date_to);
    dateTo.setDate(dateTo.getDate() + 1);
    dateTo.setHours(0, 0, 0, 0);
    query = query.lt('created_at', dateTo.toISOString());
  }

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  return {
    data: data || [],
    error,
    count,
    page,
    limit,
    total_pages: count ? Math.ceil(count / limit) : 0
  };
};

exports.getUserLogs = async (userId, filters = {}) => {
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
    .eq('target_user_id', userId)
    .order('created_at', { ascending: false });

  if (filters.action_type) {
    query = query.eq('action_type', filters.action_type);
  }

  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;

  return { data: data || [], error };
};

exports.getLogsByActionType = async (actionType, filters = {}) => {
  let query = supabase
    .from('admin_logs')
    .select(`
      *,
      admin:users!admin_logs_admin_id_fkey (
        id,
        full_name,
        email
      ),
      target_user:users!admin_logs_target_user_id_fkey (
        id,
        full_name,
        email,
        role
      )
    `)
    .eq('action_type', actionType)
    .order('created_at', { ascending: false });

  if (filters.date_from) {
    const dateFrom = typeof filters.date_from === 'string' 
      ? filters.date_from 
      : filters.date_from.toISOString();
    query = query.gte('created_at', dateFrom);
  }

  if (filters.date_to) {
    let dateTo = typeof filters.date_to === 'string' 
      ? new Date(filters.date_to) 
      : new Date(filters.date_to);
    dateTo.setDate(dateTo.getDate() + 1);
    dateTo.setHours(0, 0, 0, 0);
    query = query.lt('created_at', dateTo.toISOString());
  }

  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;

  return { data: data || [], error };
};

exports.getLogStats = async (filters = {}) => {
  const stats = {
    total_actions: 0,
    by_action_type: {},
    by_admin: {},
    recent_actions: []
  };

  try {
    let query = supabase.from('admin_logs').select('*');

    if (filters.date_from) {
      const dateFrom = typeof filters.date_from === 'string' 
        ? filters.date_from 
        : filters.date_from.toISOString();
      query = query.gte('created_at', dateFrom);
    }

    if (filters.date_to) {
      let dateTo = typeof filters.date_to === 'string' 
        ? new Date(filters.date_to) 
        : new Date(filters.date_to);
      dateTo.setDate(dateTo.getDate() + 1);
      dateTo.setHours(0, 0, 0, 0);
      query = query.lt('created_at', dateTo.toISOString());
    }

    const { data: logs } = await query;

    if (logs) {
      stats.total_actions = logs.length;

      logs.forEach(log => {
        if (!stats.by_action_type[log.action_type]) {
          stats.by_action_type[log.action_type] = 0;
        }
        stats.by_action_type[log.action_type]++;

        if (!stats.by_admin[log.admin_id]) {
          stats.by_admin[log.admin_id] = 0;
        }
        stats.by_admin[log.admin_id]++;
      });

      const { data: recentLogs } = await supabase
        .from('admin_logs')
        .select(`
          *,
          admin:users!admin_logs_admin_id_fkey (full_name)
        `)
        .order('created_at', { ascending: false })
        .limit(10);

      stats.recent_actions = recentLogs || [];
    }

    return { data: stats, error: null };

  } catch (error) {
    console.error('Get log stats error:', error);
    return { data: stats, error };
  }
};

exports.searchLogs = async (searchTerm, filters = {}) => {
  let query = supabase
    .from('admin_logs')
    .select(`
      *,
      admin:users!admin_logs_admin_id_fkey (
        id,
        full_name,
        email
      ),
      target_user:users!admin_logs_target_user_id_fkey (
        id,
        full_name,
        email,
        role
      )
    `)
    .or(`action_description.ilike.%${searchTerm}%,action_type.ilike.%${searchTerm}%`)
    .order('created_at', { ascending: false });

  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;

  return { data: data || [], error };
};

exports.deleteOldLogs = async (daysOld = 90) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const { data, error } = await supabaseService
    .from('admin_logs')
    .delete()
    .lt('created_at', cutoffDate.toISOString());

  return { data, error };
};

exports.getLogById = async (logId) => {
  const { data, error } = await supabase
    .from('admin_logs')
    .select(`
      *,
      admin:users!admin_logs_admin_id_fkey (
        id,
        full_name,
        email
      ),
      target_user:users!admin_logs_target_user_id_fkey (
        id,
        full_name,
        email,
        role
      )
    `)
    .eq('id', logId)
    .single();

  return { data, error };
};

module.exports = exports;
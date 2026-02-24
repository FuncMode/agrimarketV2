// src\models\issueModel.js

const { supabase, supabaseService } = require('../config/database');

const PRIORITY_SLA_HOURS = {
  low: 72,
  medium: 48,
  high: 24,
  critical: 8
};

const computeSlaMetadata = (issue) => {
  const createdAt = issue?.created_at ? new Date(issue.created_at) : null;
  const now = new Date();
  const slaHours = Number(issue?.sla_hours) || PRIORITY_SLA_HOURS[issue?.priority] || PRIORITY_SLA_HOURS.medium;

  if (!createdAt || Number.isNaN(createdAt.getTime())) {
    return {
      sla_due_at: null,
      age_hours: 0,
      overdue_hours: 0,
      is_overdue: false
    };
  }

  const dueAt = new Date(createdAt.getTime() + (slaHours * 60 * 60 * 1000));
  const ageHours = Math.max(0, (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60));
  const overdueHours = Math.max(0, (now.getTime() - dueAt.getTime()) / (1000 * 60 * 60));
  const isOverdue = issue?.status === 'under_review' && now.getTime() > dueAt.getTime();

  return {
    sla_due_at: dueAt.toISOString(),
    age_hours: Number(ageHours.toFixed(2)),
    overdue_hours: Number(overdueHours.toFixed(2)),
    is_overdue: isOverdue
  };
};

const enrichIssueWithSla = (issue) => ({
  ...issue,
  ...computeSlaMetadata(issue)
});

const enrichIssuesWithSla = (issues = []) => issues.map(enrichIssueWithSla);

exports.createIssue = async (issueData) => {
  const priority = issueData.priority && PRIORITY_SLA_HOURS[issueData.priority]
    ? issueData.priority
    : 'medium';

  const { data, error } = await supabaseService
    .from('issue_reports')
    .insert([{
      order_id: issueData.order_id,
      reported_by: issueData.reported_by,
      issue_type: issueData.issue_type,
      description: issueData.description,
      evidence_urls: issueData.evidence_urls || [],
      status: 'under_review',
      priority,
      sla_hours: PRIORITY_SLA_HOURS[priority]
    }])
    .select()
    .single();

  return { data, error };
};

exports.getIssueById = async (issueId) => {
  const { data, error } = await supabase
    .from('issue_reports')
    .select(`
      *,
      order:orders!inner (
        id,
        order_number,
        total_amount,
        status,
        buyer:buyer_profiles!inner (
          id,
          user:users!inner (
            id,
            full_name,
            email
          )
        ),
        seller:seller_profiles!inner (
          id,
          user:users!inner (
            id,
            full_name,
            email
          )
        )
      ),
      reporter:users!issue_reports_reported_by_fkey (
        id,
        full_name,
        email,
        role
      ),
      admin:users!issue_reports_admin_id_fkey (
        id,
        full_name,
        email
      )
    `)
    .eq('id', issueId)
    .single();

  return { data: data ? enrichIssueWithSla(data) : data, error };
};

exports.getUserIssues = async (userId, filters = {}) => {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (!user) {
      return { data: [], error: null };
    }

    let query = supabase
      .from('issue_reports')
      .select(`
        *,
        order:orders!inner (
          id,
          order_number,
          total_amount,
          status,
          buyer_id,
          seller_id
        )
      `)
      .order('created_at', { ascending: false });

    if (user.role === 'buyer') {
      query = query.eq('reported_by', userId);
    } else if (user.role === 'seller') {
      const { data: sellerProfile } = await supabase
        .from('seller_profiles')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (sellerProfile) {
        query = query.eq('order.seller_id', sellerProfile.id);
      } else {
        return { data: [], error: null };
      }
    }

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    if (filters.issue_type) {
      query = query.eq('issue_type', filters.issue_type);
    }

    const { data, error } = await query;

    return { data: enrichIssuesWithSla(data || []), error };
  } catch (error) {
    console.error('Get user issues error:', error);
    return { data: [], error };
  }
};

exports.getOrderIssues = async (orderId) => {
  const { data, error } = await supabase
    .from('issue_reports')
    .select(`
      *,
      reporter:users!issue_reports_reported_by_fkey (
        id,
        full_name,
        role
      ),
      admin:users!issue_reports_admin_id_fkey (
        id,
        full_name
      )
    `)
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });

  return { data: enrichIssuesWithSla(data || []), error };
};

exports.getPendingIssues = async (filters = {}) => {
  let query = supabase
    .from('issue_reports')
    .select(`
      *,
      order:orders!inner (
        id,
        order_number,
        total_amount,
        buyer:buyer_profiles!inner (
          user:users!inner (full_name)
        ),
        seller:seller_profiles!inner (
          user:users!inner (full_name)
        )
      ),
      reporter:users!issue_reports_reported_by_fkey (
        id,
        full_name,
        email,
        role
      )
    `)
    .eq('status', 'under_review')
    .order('created_at', { ascending: true });

  if (filters.issue_type) {
    query = query.eq('issue_type', filters.issue_type);
  }

  if (filters.priority) {
    query = query.eq('priority', filters.priority);
  }

  const { data, error } = await query;

  const issues = enrichIssuesWithSla(data || []);
  const filteredIssues = filters.overdue_only
    ? issues.filter(issue => issue.is_overdue)
    : issues;

  return { data: filteredIssues, error };
};

exports.getResolvedIssues = async (filters = {}) => {
  let query = supabase
    .from('issue_reports')
    .select(`
      *,
      order:orders!inner (
        id,
        order_number,
        total_amount,
        buyer:buyer_profiles!inner (
          user:users!inner (full_name)
        ),
        seller:seller_profiles!inner (
          user:users!inner (full_name)
        )
      ),
      reporter:users!issue_reports_reported_by_fkey (
        id,
        full_name,
        email,
        role
      ),
      admin:users!issue_reports_admin_id_fkey (
        id,
        full_name
      )
    `)
    .eq('status', 'resolved')
    .order('resolved_at', { ascending: false });

  if (filters.issue_type) {
    query = query.eq('issue_type', filters.issue_type);
  }

  if (filters.priority) {
    query = query.eq('priority', filters.priority);
  }

  if (filters.date_from) {
    const dateFrom = typeof filters.date_from === 'string' 
      ? filters.date_from 
      : filters.date_from.toISOString();
    query = query.gte('resolved_at', dateFrom);
  }

  if (filters.date_to) {
    let dateTo = typeof filters.date_to === 'string' 
      ? new Date(filters.date_to) 
      : new Date(filters.date_to);
    dateTo.setDate(dateTo.getDate() + 1);
    dateTo.setHours(0, 0, 0, 0);
    query = query.lt('resolved_at', dateTo.toISOString());
  }

  const { data, error } = await query;

  return { data: enrichIssuesWithSla(data || []), error };
};

exports.getRejectedIssues = async (filters = {}) => {
  let query = supabase
    .from('issue_reports')
    .select(`
      *,
      order:orders!inner (
        id,
        order_number,
        total_amount,
        buyer:buyer_profiles!inner (
          user:users!inner (full_name)
        ),
        seller:seller_profiles!inner (
          user:users!inner (full_name)
        )
      ),
      reporter:users!issue_reports_reported_by_fkey (
        id,
        full_name,
        email,
        role
      ),
      admin:users!issue_reports_admin_id_fkey (
        id,
        full_name
      )
    `)
    .eq('status', 'rejected')
    .order('resolved_at', { ascending: false });

  if (filters.issue_type) {
    query = query.eq('issue_type', filters.issue_type);
  }

  if (filters.priority) {
    query = query.eq('priority', filters.priority);
  }

  if (filters.date_from) {
    const dateFrom = typeof filters.date_from === 'string' 
      ? filters.date_from 
      : filters.date_from.toISOString();
    query = query.gte('resolved_at', dateFrom);
  }

  if (filters.date_to) {
    let dateTo = typeof filters.date_to === 'string' 
      ? new Date(filters.date_to) 
      : new Date(filters.date_to);
    dateTo.setDate(dateTo.getDate() + 1);
    dateTo.setHours(0, 0, 0, 0);
    query = query.lt('resolved_at', dateTo.toISOString());
  }

  const { data, error } = await query;

  return { data: enrichIssuesWithSla(data || []), error };
};

exports.updateIssueStatus = async (issueId, status, adminId, resolution = null) => {
  const updates = {
    status,
    admin_id: adminId,
    updated_at: new Date().toISOString()
  };

  if (resolution) {
    updates.resolution = resolution;
  }

  if (status === 'resolved') {
    updates.resolved_at = new Date().toISOString();
  }

  const { data, error } = await supabaseService
    .from('issue_reports')
    .update(updates)
    .eq('id', issueId)
    .select()
    .single();

  return { data: data ? enrichIssueWithSla(data) : data, error };
};

exports.addEvidence = async (issueId, evidenceUrls) => {
  const { data: issue } = await supabase
    .from('issue_reports')
    .select('evidence_urls')
    .eq('id', issueId)
    .single();

  if (!issue) {
    return { data: null, error: new Error('Issue not found') };
  }

  const currentUrls = issue.evidence_urls || [];
  const newUrls = Array.isArray(evidenceUrls) ? evidenceUrls : [evidenceUrls];
  const updatedUrls = [...currentUrls, ...newUrls];

  const { data, error } = await supabaseService
    .from('issue_reports')
    .update({
      evidence_urls: updatedUrls,
      updated_at: new Date().toISOString()
    })
    .eq('id', issueId)
    .select()
    .single();

  return { data: data ? enrichIssueWithSla(data) : data, error };
};

exports.canAccessIssue = async (issueId, userId) => {
  const { data: issue } = await supabase
    .from('issue_reports')
    .select(`
      reported_by,
      order:orders!inner (
        buyer:buyer_profiles!inner (user_id),
        seller:seller_profiles!inner (user_id)
      )
    `)
    .eq('id', issueId)
    .single();

  if (!issue) {
    return false;
  }

  if (issue.reported_by === userId) {
    return true;
  }

  if (issue.order.buyer.user_id === userId || issue.order.seller.user_id === userId) {
    return true;
  }

  return false;
};


exports.getIssueStats = async (filters = {}) => {
  const stats = {
    total_issues: 0,
    under_review: 0,
    resolved: 0,
    rejected: 0,
    by_type: {},
    by_priority: {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0
    },
    overdue: 0
  };

  try {
    let query = supabase.from('issue_reports').select('status, issue_type, created_at, priority, sla_hours');

    if (filters.date_from) {
      const dateFrom = typeof filters.date_from === 'string' 
        ? filters.date_from 
        : new Date(filters.date_from).toISOString();
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

    const { data: issues } = await query;

    if (issues) {
      stats.total_issues = issues.length;
      stats.under_review = issues.filter(i => i.status === 'under_review').length;
      stats.resolved = issues.filter(i => i.status === 'resolved').length;
      stats.rejected = issues.filter(i => i.status === 'rejected').length;

      issues.forEach(issue => {
        if (!stats.by_type[issue.issue_type]) {
          stats.by_type[issue.issue_type] = 0;
        }
        stats.by_type[issue.issue_type]++;

        const priority = issue.priority || 'medium';
        if (stats.by_priority[priority] !== undefined) {
          stats.by_priority[priority]++;
        } else {
          stats.by_priority[priority] = 1;
        }

        const slaMeta = computeSlaMetadata(issue);
        if (slaMeta.is_overdue) {
          stats.overdue += 1;
        }
      });
    }

    return { data: stats, error: null };

  } catch (error) {
    console.error('Get issue stats error:', error);
    return { data: stats, error };
  }
};

exports.updateIssuePriority = async (issueId, priority, adminId) => {
  const selectedPriority = PRIORITY_SLA_HOURS[priority] ? priority : 'medium';
  const updates = {
    priority: selectedPriority,
    sla_hours: PRIORITY_SLA_HOURS[selectedPriority],
    admin_id: adminId,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabaseService
    .from('issue_reports')
    .update(updates)
    .eq('id', issueId)
    .select()
    .single();

  return { data: data ? enrichIssueWithSla(data) : data, error };
};

exports.updateIssueOutcome = async (issueId, outcomeData, adminId) => {
  const updates = {
    outcome_action: outcomeData.outcome_action,
    outcome_amount: outcomeData.outcome_amount ?? null,
    outcome_notes: outcomeData.outcome_notes || null,
    admin_id: adminId,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabaseService
    .from('issue_reports')
    .update(updates)
    .eq('id', issueId)
    .select()
    .single();

  return { data: data ? enrichIssueWithSla(data) : data, error };
};

exports.createTimelineEvent = async (eventData) => {
  const payload = {
    issue_id: eventData.issue_id,
    actor_id: eventData.actor_id || null,
    event_type: eventData.event_type,
    from_status: eventData.from_status || null,
    to_status: eventData.to_status || null,
    note: eventData.note || null,
    metadata: eventData.metadata || {}
  };

  const { data, error } = await supabaseService
    .from('issue_timeline_events')
    .insert([payload])
    .select()
    .single();

  return { data, error };
};

exports.getIssueTimeline = async (issueId) => {
  const { data, error } = await supabase
    .from('issue_timeline_events')
    .select(`
      *,
      actor:users!issue_timeline_events_actor_id_fkey (
        id,
        full_name,
        role
      )
    `)
    .eq('issue_id', issueId)
    .order('created_at', { ascending: false });

  return { data: data || [], error };
};

exports.deleteIssue = async (issueId) => {
  const { data, error } = await supabaseService
    .from('issue_reports')
    .delete()
    .eq('id', issueId)
    .select()
    .single();

  return { data, error };
};

module.exports = exports;

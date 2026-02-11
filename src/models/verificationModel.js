// src\models\verificationModel.js
const { supabase, supabaseService } = require('../config/database');

exports.createVerification = async (verificationData) => {
  const { data, error } = await supabaseService
    .from('verification_documents')
    .insert([{
      user_id: verificationData.user_id,
      id_photo_path: verificationData.id_photo_path,
      selfie_path: verificationData.selfie_path,
      id_type: verificationData.id_type,
      submission_status: 'pending',
      submitted_at: new Date().toISOString()
    }])
    .select()
    .single();

  return { data, error };
};

exports.getUserVerification = async (userId) => {
  const { data, error } = await supabase
    .from('verification_documents')
    .select('*')
    .eq('user_id', userId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .single();

  return { data, error };
};

exports.hasPendingVerification = async (userId) => {
  const { data, error } = await supabase
    .from('verification_documents')
    .select('id')
    .eq('user_id', userId)
    .eq('submission_status', 'pending')
    .single();

  return { hasPending: !!data, data, error };
};

exports.getPendingVerifications = async (filters = {}) => {
  try {
    let query = supabaseService
      .from('verification_documents')
      .select(`
        *,
        users:user_id (
          id,
          email,
          full_name,
          phone_number,
          role,
          created_at
        )
      `)
      .eq('submission_status', 'pending')
      .order('submitted_at', { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error('getPendingVerifications error:', error.message || error);
      return { data: [], error };
    }

    let filtered = data || [];
    if (filters.role && filtered.length > 0) {
      filtered = filtered.filter(v => v.users && v.users.role === filters.role);
    }

    return { data: filtered, error: null };
  } catch (error) {
    console.error('getPendingVerifications catch error:', error.message || error);
    return { data: [], error };
  }
};

exports.getVerificationById = async (verificationId) => {
  const { data, error } = await supabaseService
    .from('verification_documents')
    .select(`
      *,
      users:user_id (
        id,
        email,
        full_name,
        phone_number,
        role,
        status,
        created_at
      )
    `)
    .eq('id', verificationId)
    .single();

  return { data, error };
};

exports.updateVerificationStatus = async (
  verificationId,
  status,
  adminId,
  adminNotes = null
) => {
  const updates = {
    submission_status: status,
    admin_id: adminId,
    admin_notes: adminNotes,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabaseService
    .from('verification_documents')
    .update(updates)
    .eq('id', verificationId)
    .select()
    .single();

  return { data, error };
};


exports.updateUserStatus = async (userId, status) => {
  const updates = {
    status,
    updated_at: new Date().toISOString()
  };

  if (status === 'verified') {
    updates.verified_at = new Date().toISOString();
  }

  const { data, error } = await supabaseService
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select('id, email, full_name, role, status, verified_at')
    .single();

  return { data, error };
};


exports.getVerificationStats = async () => {
  const stats = {
    total_pending: 0,
    total_approved: 0,
    total_rejected: 0,
    total_more_evidence: 0,
    pending_sellers: 0,
    pending_buyers: 0
  };

  try {

    const { count: pendingCount } = await supabaseService
      .from('verification_documents')
      .select('id', { count: 'exact', head: true })
      .eq('submission_status', 'pending');

    stats.total_pending = pendingCount || 0;


    const { count: approvedCount } = await supabaseService
      .from('verification_documents')
      .select('id', { count: 'exact', head: true })
      .eq('submission_status', 'approved');

    stats.total_approved = approvedCount || 0;


    const { count: rejectedCount } = await supabaseService
      .from('verification_documents')
      .select('id', { count: 'exact', head: true })
      .eq('submission_status', 'rejected');

    stats.total_rejected = rejectedCount || 0;


    const { count: moreEvidenceCount } = await supabaseService
      .from('verification_documents')
      .select('id', { count: 'exact', head: true })
      .eq('submission_status', 'more_evidence');

    stats.total_more_evidence = moreEvidenceCount || 0;


    const { data: pendingByRole } = await supabaseService
      .from('verification_documents')
      .select(`
        id,
        users:user_id (role)
      `)
      .eq('submission_status', 'pending');

    if (pendingByRole && pendingByRole.length > 0) {
      stats.pending_sellers = pendingByRole.filter(v => v.users && v.users.role === 'seller').length;
      stats.pending_buyers = pendingByRole.filter(v => v.users && v.users.role === 'buyer').length;
    }

    return { data: stats, error: null };

  } catch (error) {
    console.error('Get verification stats error:', error);
    return { data: stats, error };
  }
};


exports.deleteVerification = async (verificationId) => {
  const { data, error } = await supabaseService
    .from('verification_documents')
    .delete()
    .eq('id', verificationId)
    .select()
    .single();

  return { data, error };
};
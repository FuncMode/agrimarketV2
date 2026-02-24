// src\controllers\issueController.js

const { AppError, asyncHandler } = require('../middleware/errorHandler');
const issueModel = require('../models/issueModel');
const orderModel = require('../models/orderModel');
const { uploadIssueEvidence } = require('../config/storage');
const adminLogModel = require('../models/adminLogModel');
const notificationService = require('../services/notificationService');
const emailService = require('../services/emailService');
const { supabase, supabaseService } = require('../config/database');

const OUTCOME_ACTIONS = ['refund', 'partial_refund', 'cancel_order', 'keep_order'];

const applyOutcomeToOrder = async (orderId, issueId, outcomeAction, outcomeAmount, outcomeNotes) => {
  if (!orderId || !OUTCOME_ACTIONS.includes(outcomeAction)) {
    return { success: true };
  }

  if (outcomeAction === 'keep_order') {
    return { success: true };
  }

  const { data: currentOrder, error: orderError } = await supabase
    .from('orders')
    .select('status, payment_status, order_notes')
    .eq('id', orderId)
    .single();

  if (orderError || !currentOrder) {
    return { success: false, error: orderError || new Error('Order not found') };
  }

  const nowIso = new Date().toISOString();
  const updates = { updated_at: nowIso };

  if (outcomeAction === 'cancel_order') {
    updates.status = 'cancelled';
    updates.cancelled_at = nowIso;
    updates.cancellation_reason = `Issue ${issueId} cancelled by admin. ${outcomeNotes || ''}`.trim();
  }

  if (outcomeAction === 'refund') {
    updates.payment_status = 'unpaid';
    updates.order_notes = [
      currentOrder.order_notes || '',
      `Full refund applied due to issue ${issueId}.${outcomeNotes ? ` ${outcomeNotes}` : ''}`
    ].filter(Boolean).join(' ');
  }

  if (outcomeAction === 'partial_refund') {
    updates.order_notes = [
      currentOrder.order_notes || '',
      `Partial refund (${outcomeAmount || 0}) applied due to issue ${issueId}.${outcomeNotes ? ` ${outcomeNotes}` : ''}`
    ].filter(Boolean).join(' ');
  }

  const { error } = await supabaseService
    .from('orders')
    .update(updates)
    .eq('id', orderId);

  return { success: !error, error: error || null };
};

const getIssueParticipants = async (orderId) => {
  const { data: order } = await orderModel.getOrderById(orderId);
  if (!order) {
    return { buyerUser: null, sellerUser: null, order: null };
  }

  const [buyerProfileResult, sellerProfileResult] = await Promise.all([
    supabase
      .from('buyer_profiles')
      .select('user_id')
      .eq('id', order.buyer_id)
      .single(),
    supabase
      .from('seller_profiles')
      .select('user_id')
      .eq('id', order.seller_id)
      .single()
  ]);

  const buyerUserId = buyerProfileResult.data?.user_id;
  const sellerUserId = sellerProfileResult.data?.user_id;

  const [buyerUserResult, sellerUserResult] = await Promise.all([
    buyerUserId
      ? supabase.from('users').select('id, email, full_name').eq('id', buyerUserId).single()
      : Promise.resolve({ data: null }),
    sellerUserId
      ? supabase.from('users').select('id, email, full_name').eq('id', sellerUserId).single()
      : Promise.resolve({ data: null })
  ]);

  return {
    order,
    buyerUser: buyerUserResult.data || null,
    sellerUser: sellerUserResult.data || null
  };
};

const notifyIssueParticipants = async (issue, notificationType, message, emailSubjectSuffix = 'Issue Updated') => {
  const { order, buyerUser, sellerUser } = await getIssueParticipants(issue.order_id);
  const orderNumber = order?.order_number || issue.order_id;

  const notifyOne = async (user) => {
    if (!user) return;

    await notificationService.sendIssueNotification(
      user.id,
      issue,
      notificationType,
      message
    ).catch(err => console.error('Failed to send in-app issue notification:', err.message));

    await emailService.sendIssueUpdateEmail(
      user,
      issue.id,
      emailSubjectSuffix,
      `${message} (Order ${orderNumber})`
    ).catch(err => console.error('Failed to send issue update email:', err.message));
  };

  await Promise.all([notifyOne(buyerUser), notifyOne(sellerUser)]);
};

exports.createIssue = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const {
    order_id,
    issue_type,
    description,
    priority
  } = req.body;

  const ownership = await orderModel.checkOrderOwnership(order_id, userId);
  if (!ownership.hasAccess) {
    throw new AppError('You do not have access to this order.', 403);
  }

  const { data: order } = await orderModel.getOrderById(order_id);
  if (!order) {
    throw new AppError('Order not found.', 404);
  }

  const evidenceUrls = [];
  if (req.files && req.files.length > 0) {
    for (const file of req.files) {
      const uploadResult = await uploadIssueEvidence(
        order_id,
        file.buffer,
        file.originalname,
        file.mimetype
      );

      if (uploadResult.success) {
        evidenceUrls.push(uploadResult.data.publicUrl || uploadResult.data.fullPath);
      }
    }
  }

  const { data: issue, error } = await issueModel.createIssue({
    order_id,
    reported_by: userId,
    issue_type,
    description,
    evidence_urls: evidenceUrls,
    priority
  });

  if (error) {
    throw new AppError('Failed to create issue report.', 500);
  }

  const { data: completeIssue } = await issueModel.getIssueById(issue.id);

  await issueModel.createTimelineEvent({
    issue_id: issue.id,
    actor_id: userId,
    event_type: 'issue_created',
    to_status: 'under_review',
    note: `Issue created (${issue_type})`,
    metadata: {
      priority: completeIssue?.priority || 'medium'
    }
  });

  // Notify admins
  const { data: admins } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'admin');

  if (admins && admins.length > 0) {
    for (const admin of admins) {
      await notificationService.createNotification({
        user_id: admin.id,
        title: 'New Issue Report',
        message: `A new issue has been reported on order ${order.order_number}. Issue type: ${issue_type}`,
        type: 'issue',
        reference_id: issue.id
      });

      // Send email to admin
      const { data: adminUser } = await supabase
        .from('users')
        .select('id, email, full_name')
        .eq('id', admin.id)
        .single();

      if (adminUser) {
        await emailService.sendIssueReportEmail(adminUser, issue.id, issue_type).catch(err => 
          console.error('Failed to send admin issue email:', err.message)
        );
      }
    }
  }

  // Notify the reporter (user who created the issue)
  await notificationService.sendIssueNotification(
    userId,
    completeIssue,
    'issue_created'
  );

  // Send email to reporter
  const { data: reporterUser } = await supabase
    .from('users')
    .select('id, email, full_name')
    .eq('id', userId)
    .single();

  if (reporterUser) {
    await emailService.sendIssueReportEmail(reporterUser, issue.id, issue_type).catch(err => 
      console.error('Failed to send reporter issue email:', err.message)
    );
  }

  // Notify the other party (buyer or seller)
  const { data: buyerProfile } = await supabase
    .from('buyer_profiles')
    .select('user_id')
    .eq('id', order.buyer_id)
    .single();

  const { data: sellerProfile } = await supabase
    .from('seller_profiles')
    .select('user_id')
    .eq('id', order.seller_id)
    .single();

  const buyerUserId = buyerProfile?.user_id;
  const sellerUserId = sellerProfile?.user_id;

  // Determine who is the other party
  const otherPartyId = userId === buyerUserId ? sellerUserId : buyerUserId;

  if (otherPartyId && otherPartyId !== userId) {
    const isSellerRecipient = otherPartyId === sellerUserId;
    const reporterRole = userId === buyerUserId ? 'Buyer' : 'Seller';
    const notificationTitle = isSellerRecipient
      ? 'Issue Reported on Your Product'
      : 'Issue Reported on Your Order';
    const notificationMessage = isSellerRecipient
      ? `A buyer reported an issue on your product order ${order.order_number}: ${description.substring(0, 70)}...`
      : `A seller reported an issue on your order ${order.order_number}: ${description.substring(0, 70)}...`;

    await notificationService.createNotification({
      user_id: otherPartyId,
      title: notificationTitle,
      message: notificationMessage,
      type: 'issue',
      reference_id: issue.id
    });

    // Send email to other party
    const { data: otherPartyUser } = await supabase
      .from('users')
      .select('id, email, full_name')
      .eq('id', otherPartyId)
      .single();

    if (otherPartyUser) {
      await emailService.sendIssueReportedForPartyEmail(otherPartyUser, {
        issueId: issue.id,
        orderNumber: order.order_number,
        issueType: issue_type,
        reporterRole,
        perspective: isSellerRecipient ? 'product' : 'order',
        description
      }).catch(err =>
        console.error('Failed to send other party issue email:', err.message)
      );
    }
  }

  res.status(201).json({
    success: true,
    message: 'Issue report submitted successfully. An admin will review it soon.',
    data: {
      issue: completeIssue
    }
  });
});

exports.getMyIssues = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { status, issue_type } = req.query;

  const filters = {};
  if (status) filters.status = status;
  if (issue_type) filters.issue_type = issue_type;

  const { data: issues, error } = await issueModel.getUserIssues(userId, filters);

  if (error) {
    throw new AppError('Failed to fetch issues.', 500);
  }

  res.status(200).json({
    success: true,
    results: issues.length,
    data: {
      issues
    }
  });
});


exports.getIssueById = asyncHandler(async (req, res, next) => {
  const { issueId } = req.params;
  const userId = req.user.id;
  const isAdmin = req.user.role === 'admin';


  if (!isAdmin) {
    const canAccess = await issueModel.canAccessIssue(issueId, userId);
    if (!canAccess) {
      throw new AppError('You do not have access to this issue.', 403);
    }
  }

  const { data: issue, error } = await issueModel.getIssueById(issueId);
  const { data: timeline } = await issueModel.getIssueTimeline(issueId);

  if (error || !issue) {
    throw new AppError('Issue not found.', 404);
  }

  res.status(200).json({
    success: true,
    data: {
      issue,
      timeline: timeline || []
    }
  });
});

exports.getOrderIssues = asyncHandler(async (req, res, next) => {
  const { orderId } = req.params;
  const userId = req.user.id;
  const isAdmin = req.user.role === 'admin';

  if (!isAdmin) {
    const ownership = await orderModel.checkOrderOwnership(orderId, userId);
    if (!ownership.hasAccess) {
      throw new AppError('You do not have access to this order.', 403);
    }
  }

  const { data: issues, error } = await issueModel.getOrderIssues(orderId);

  if (error) {
    throw new AppError('Failed to fetch issues.', 500);
  }

  res.status(200).json({
    success: true,
    results: issues.length,
    data: {
      issues
    }
  });
});


exports.addEvidence = asyncHandler(async (req, res, next) => {
  const { issueId } = req.params;
  const userId = req.user.id;

  const canAccess = await issueModel.canAccessIssue(issueId, userId);
  if (!canAccess) {
    throw new AppError('You do not have access to this issue.', 403);
  }

  const { data: issue } = await issueModel.getIssueById(issueId);
  if (!issue) {
    throw new AppError('Issue not found.', 404);
  }

  if (issue.status !== 'under_review') {
    throw new AppError('Cannot add evidence to resolved or rejected issues.', 400);
  }

  const evidenceUrls = [];
  if (req.files && req.files.length > 0) {
    for (const file of req.files) {
      const uploadResult = await uploadIssueEvidence(
        issue.order_id,
        file.buffer,
        file.originalname,
        file.mimetype
      );

      if (uploadResult.success) {
        evidenceUrls.push(uploadResult.data.publicUrl || uploadResult.data.fullPath);
      }
    }
  }

  if (evidenceUrls.length === 0) {
    throw new AppError('No evidence files uploaded.', 400);
  }

  const { data, error } = await issueModel.addEvidence(issueId, evidenceUrls);

  if (error) {
    throw new AppError('Failed to add evidence.', 500);
  }

  res.status(200).json({
    success: true,
    message: 'Evidence added successfully.',
    data: {
      issue: data
    }
  });
});


exports.getPendingIssues = asyncHandler(async (req, res, next) => {
  const { issue_type, priority, overdue_only } = req.query;

  const filters = {};
  if (issue_type) filters.issue_type = issue_type;
  if (priority) filters.priority = priority;
  if (overdue_only !== undefined) {
    filters.overdue_only = String(overdue_only) === 'true';
  }

  const { data: issues, error } = await issueModel.getPendingIssues(filters);

  if (error) {
    throw new AppError('Failed to fetch pending issues.', 500);
  }

  res.status(200).json({
    success: true,
    results: issues.length,
    data: {
      issues
    }
  });
});

exports.getResolvedIssues = asyncHandler(async (req, res, next) => {
  const { issue_type, date_from, date_to, priority } = req.query;

  const filters = {};
  if (issue_type) filters.issue_type = issue_type;
  if (priority) filters.priority = priority;
  if (date_from) filters.date_from = date_from;
  if (date_to) filters.date_to = date_to;

  const { data: issues, error } = await issueModel.getResolvedIssues(filters);

  if (error) {
    throw new AppError('Failed to fetch resolved issues.', 500);
  }

  res.status(200).json({
    success: true,
    results: issues.length,
    data: {
      issues
    }
  });
});


exports.getRejectedIssues = asyncHandler(async (req, res, next) => {
  const { issue_type, date_from, date_to, priority } = req.query;

  const filters = {};
  if (issue_type) filters.issue_type = issue_type;
  if (priority) filters.priority = priority;
  if (date_from) filters.date_from = date_from;
  if (date_to) filters.date_to = date_to;

  const { data: issues, error } = await issueModel.getRejectedIssues(filters);

  if (error) {
    throw new AppError('Failed to fetch rejected issues.', 500);
  }

  res.status(200).json({
    success: true,
    results: issues.length,
    data: {
      issues
    }
  });
});


exports.resolveIssue = asyncHandler(async (req, res, next) => {
  const { issueId } = req.params;
  const adminId = req.user.id;
  const { resolution, outcome_action, outcome_amount, outcome_notes } = req.body;

  if (!resolution) {
    throw new AppError('Resolution details are required.', 400);
  }

  const { data: issue } = await issueModel.getIssueById(issueId);
  if (!issue) {
    throw new AppError('Issue not found.', 404);
  }

  if (issue.status !== 'under_review') {
    throw new AppError('Issue is not under review.', 400);
  }

  const { data, error } = await issueModel.updateIssueStatus(
    issueId,
    'resolved',
    adminId,
    resolution
  );

  if (error) {
    throw new AppError('Failed to resolve issue.', 500);
  }

  await issueModel.createTimelineEvent({
    issue_id: issueId,
    actor_id: adminId,
    event_type: 'status_changed',
    from_status: issue.status,
    to_status: 'resolved',
    note: resolution,
    metadata: {}
  });

  let outcomeData = null;
  if (outcome_action) {
    if (!OUTCOME_ACTIONS.includes(outcome_action)) {
      throw new AppError('Invalid outcome action.', 400);
    }

    const { data: updatedIssue, error: outcomeError } = await issueModel.updateIssueOutcome(
      issueId,
      {
        outcome_action,
        outcome_amount: outcome_amount ?? null,
        outcome_notes: outcome_notes || null
      },
      adminId
    );

    if (outcomeError) {
      throw new AppError('Issue resolved but failed to save outcome action.', 500);
    }

    const outcomeEffect = await applyOutcomeToOrder(
      issue.order_id,
      issueId,
      outcome_action,
      outcome_amount,
      outcome_notes
    );

    if (!outcomeEffect.success) {
      throw new AppError('Issue resolved but failed to apply outcome on order.', 500);
    }

    await issueModel.createTimelineEvent({
      issue_id: issueId,
      actor_id: adminId,
      event_type: 'outcome_set',
      note: outcome_notes || `Outcome set to ${outcome_action}`,
      metadata: {
        outcome_action,
        outcome_amount: outcome_amount ?? null
      }
    });

    outcomeData = updatedIssue;
  }


  await adminLogModel.createLog({
    admin_id: adminId,
    action_type: 'ISSUE_RESOLVED',
    action_description: `Resolved issue #${issueId}: ${issue.issue_type}`,
    target_user_id: issue.reported_by,
    reference_id: issueId,
    ip_address: req.ip
  });


  const { data: order } = await orderModel.getOrderById(issue.order_id);

  if (order) {
    const { data: buyerProfile } = await supabase
      .from('buyer_profiles')
      .select('user_id')
      .eq('id', order.buyer_id)
      .single();

    const { data: sellerProfile } = await supabase
      .from('seller_profiles')
      .select('user_id')
      .eq('id', order.seller_id)
      .single();

    if (buyerProfile) {
      await notificationService.sendIssueNotification(
        buyerProfile.user_id,
        issue,
        'issue_resolved',
        `Your issue on order ${order.order_number} has been resolved: ${resolution.substring(0, 50)}...`
      );

      // Send email to buyer
      const { data: buyerUser } = await supabase
        .from('users')
        .select('id, email, full_name')
        .eq('id', buyerProfile.user_id)
        .single();

      if (buyerUser) {
        await emailService.sendIssueResolutionEmail(buyerUser, issue.id, resolution).catch(err => 
          console.error('Failed to send buyer issue resolution email:', err.message)
        );
      }
    }

    if (sellerProfile) {
      await notificationService.sendIssueNotification(
        sellerProfile.user_id,
        issue,
        'issue_resolved',
        `An issue on your order ${order.order_number} has been resolved: ${resolution.substring(0, 50)}...`
      );

      // Send email to seller
      const { data: sellerUser } = await supabase
        .from('users')
        .select('id, email, full_name')
        .eq('id', sellerProfile.user_id)
        .single();

      if (sellerUser) {
        await emailService.sendIssueResolutionEmail(sellerUser, issue.id, resolution).catch(err => 
          console.error('Failed to send seller issue resolution email:', err.message)
        );
      }
    }
  }

  res.status(200).json({
    success: true,
    message: 'Issue resolved successfully.',
    data: {
      issue: outcomeData || data
    }
  });
});


exports.rejectIssue = asyncHandler(async (req, res, next) => {
  const { issueId } = req.params;
  const adminId = req.user.id;
  const { resolution, outcome_action, outcome_amount, outcome_notes } = req.body;

  if (!resolution) {
    throw new AppError('Rejection reason is required.', 400);
  }

  const { data: issue } = await issueModel.getIssueById(issueId);
  if (!issue) {
    throw new AppError('Issue not found.', 404);
  }

  if (issue.status !== 'under_review') {
    throw new AppError('Issue is not under review.', 400);
  }

  const { data, error } = await issueModel.updateIssueStatus(
    issueId,
    'rejected',
    adminId,
    resolution
  );

  if (error) {
    throw new AppError('Failed to reject issue.', 500);
  }

  await issueModel.createTimelineEvent({
    issue_id: issueId,
    actor_id: adminId,
    event_type: 'status_changed',
    from_status: issue.status,
    to_status: 'rejected',
    note: resolution,
    metadata: {}
  });

  let outcomeData = null;
  if (outcome_action) {
    if (!OUTCOME_ACTIONS.includes(outcome_action)) {
      throw new AppError('Invalid outcome action.', 400);
    }

    const { data: updatedIssue, error: outcomeError } = await issueModel.updateIssueOutcome(
      issueId,
      {
        outcome_action,
        outcome_amount: outcome_amount ?? null,
        outcome_notes: outcome_notes || null
      },
      adminId
    );

    if (outcomeError) {
      throw new AppError('Issue rejected but failed to save outcome action.', 500);
    }

    const outcomeEffect = await applyOutcomeToOrder(
      issue.order_id,
      issueId,
      outcome_action,
      outcome_amount,
      outcome_notes
    );

    if (!outcomeEffect.success) {
      throw new AppError('Issue rejected but failed to apply outcome on order.', 500);
    }

    await issueModel.createTimelineEvent({
      issue_id: issueId,
      actor_id: adminId,
      event_type: 'outcome_set',
      note: outcome_notes || `Outcome set to ${outcome_action}`,
      metadata: {
        outcome_action,
        outcome_amount: outcome_amount ?? null
      }
    });

    outcomeData = updatedIssue;
  }

  await adminLogModel.createLog({
    admin_id: adminId,
    action_type: 'ISSUE_REJECTED',
    action_description: `Rejected issue #${issueId}: ${issue.issue_type}`,
    target_user_id: issue.reported_by,
    reference_id: issueId,
    ip_address: req.ip
  });

  const { data: order } = await orderModel.getOrderById(issue.order_id);

  if (order) {
    const { data: buyerProfile } = await supabase
      .from('buyer_profiles')
      .select('user_id')
      .eq('id', order.buyer_id)
      .single();

    const { data: sellerProfile } = await supabase
      .from('seller_profiles')
      .select('user_id')
      .eq('id', order.seller_id)
      .single();

    if (buyerProfile) {
      await notificationService.sendIssueNotification(
        buyerProfile.user_id,
        issue,
        'issue_rejected',
        `Your issue on order ${order.order_number} has been rejected: ${resolution.substring(0, 50)}...`
      );

      // Send email to buyer
      const { data: buyerUser } = await supabase
        .from('users')
        .select('id, email, full_name')
        .eq('id', buyerProfile.user_id)
        .single();

      if (buyerUser) {
        await emailService.sendIssueResolutionEmail(buyerUser, issue.id, resolution).catch(err => 
          console.error('Failed to send buyer issue rejection email:', err.message)
        );
      }
    }

    if (sellerProfile) {
      await notificationService.sendIssueNotification(
        sellerProfile.user_id,
        issue,
        'issue_rejected',
        `An issue on your order ${order.order_number} has been rejected: ${resolution.substring(0, 50)}...`
      );

      // Send email to seller
      const { data: sellerUser } = await supabase
        .from('users')
        .select('id, email, full_name')
        .eq('id', sellerProfile.user_id)
        .single();

      if (sellerUser) {
        await emailService.sendIssueResolutionEmail(sellerUser, issue.id, resolution).catch(err => 
          console.error('Failed to send seller issue rejection email:', err.message)
        );
      }
    }
  }

  res.status(200).json({
    success: true,
    message: 'Issue rejected.',
    data: {
      issue: outcomeData || data
    }
  });
});

exports.getIssueTimeline = asyncHandler(async (req, res, next) => {
  const { issueId } = req.params;
  const { data: issue } = await issueModel.getIssueById(issueId);

  if (!issue) {
    throw new AppError('Issue not found.', 404);
  }

  const { data: timeline, error } = await issueModel.getIssueTimeline(issueId);
  if (error) {
    throw new AppError('Failed to fetch issue timeline.', 500);
  }

  res.status(200).json({
    success: true,
    results: timeline.length,
    data: {
      timeline
    }
  });
});

exports.addIssueNote = asyncHandler(async (req, res, next) => {
  const { issueId } = req.params;
  const adminId = req.user.id;
  const { note } = req.body;

  const { data: issue } = await issueModel.getIssueById(issueId);
  if (!issue) {
    throw new AppError('Issue not found.', 404);
  }

  const { data, error } = await issueModel.createTimelineEvent({
    issue_id: issueId,
    actor_id: adminId,
    event_type: 'note_added',
    from_status: issue.status,
    to_status: issue.status,
    note,
    metadata: {}
  });

  if (error) {
    throw new AppError('Failed to add issue note.', 500);
  }

  res.status(201).json({
    success: true,
    message: 'Issue note added.',
    data: {
      event: data
    }
  });
});

exports.setIssuePriority = asyncHandler(async (req, res, next) => {
  const { issueId } = req.params;
  const adminId = req.user.id;
  const { priority } = req.body;

  const { data: issue } = await issueModel.getIssueById(issueId);
  if (!issue) {
    throw new AppError('Issue not found.', 404);
  }

  const previousPriority = issue.priority || 'medium';
  const { data, error } = await issueModel.updateIssuePriority(issueId, priority, adminId);
  if (error) {
    throw new AppError('Failed to update issue priority.', 500);
  }

  await issueModel.createTimelineEvent({
    issue_id: issueId,
    actor_id: adminId,
    event_type: 'priority_changed',
    from_status: issue.status,
    to_status: issue.status,
    note: `Priority changed from ${previousPriority} to ${data.priority}`,
    metadata: {
      previous_priority: previousPriority,
      new_priority: data.priority
    }
  });

  await notifyIssueParticipants(
    data,
    'issue_priority_updated',
    `Issue #${issue.id.substring(0, 8)} priority is now ${data.priority}.`,
    'Issue Priority Updated'
  );

  res.status(200).json({
    success: true,
    message: 'Issue priority updated.',
    data: {
      issue: data
    }
  });
});

exports.setIssueOutcome = asyncHandler(async (req, res, next) => {
  const { issueId } = req.params;
  const adminId = req.user.id;
  const { outcome_action, outcome_amount, outcome_notes } = req.body;

  if (!OUTCOME_ACTIONS.includes(outcome_action)) {
    throw new AppError('Invalid outcome action.', 400);
  }

  const { data: issue } = await issueModel.getIssueById(issueId);
  if (!issue) {
    throw new AppError('Issue not found.', 404);
  }

  const { data, error } = await issueModel.updateIssueOutcome(
    issueId,
    {
      outcome_action,
      outcome_amount: outcome_amount ?? null,
      outcome_notes: outcome_notes || null
    },
    adminId
  );

  if (error) {
    throw new AppError('Failed to set issue outcome.', 500);
  }

  const outcomeEffect = await applyOutcomeToOrder(
    issue.order_id,
    issueId,
    outcome_action,
    outcome_amount,
    outcome_notes
  );

  if (!outcomeEffect.success) {
    throw new AppError('Outcome saved but failed to apply order effect.', 500);
  }

  await issueModel.createTimelineEvent({
    issue_id: issueId,
    actor_id: adminId,
    event_type: 'outcome_set',
    from_status: issue.status,
    to_status: issue.status,
    note: outcome_notes || `Outcome set to ${outcome_action}`,
    metadata: {
      outcome_action,
      outcome_amount: outcome_amount ?? null
    }
  });

  const outcomeLabel = String(outcome_action).replace(/_/g, ' ');
  const outcomeAmountText = outcome_amount ? ` (amount: ${outcome_amount})` : '';
  await notifyIssueParticipants(
    data,
    'issue_outcome_updated',
    `Issue outcome set to ${outcomeLabel}${outcomeAmountText}.`,
    'Issue Outcome Updated'
  );

  res.status(200).json({
    success: true,
    message: 'Issue outcome saved.',
    data: {
      issue: data
    }
  });
});

exports.escalateIssueSla = asyncHandler(async (req, res, next) => {
  const { issueId } = req.params;
  const adminId = req.user.id;
  const { note } = req.body;

  const { data: issue } = await issueModel.getIssueById(issueId);
  if (!issue) {
    throw new AppError('Issue not found.', 404);
  }

  if (issue.status !== 'under_review') {
    throw new AppError('Only under-review issues can be escalated.', 400);
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseService
    .from('issue_reports')
    .update({
      priority: 'critical',
      sla_hours: 8,
      escalated_at: nowIso,
      escalated_by: adminId,
      admin_id: adminId,
      updated_at: nowIso
    })
    .eq('id', issueId)
    .select()
    .single();

  if (error) {
    throw new AppError('Failed to escalate issue.', 500);
  }

  await issueModel.createTimelineEvent({
    issue_id: issueId,
    actor_id: adminId,
    event_type: 'sla_escalated',
    from_status: issue.status,
    to_status: issue.status,
    note: note || 'Issue escalated due to SLA risk/overdue.',
    metadata: {
      previous_priority: issue.priority || 'medium',
      new_priority: 'critical'
    }
  });

  await notifyIssueParticipants(
    data,
    'issue_escalated',
    `Issue #${issue.id.substring(0, 8)} has been escalated for urgent handling.`,
    'Issue Escalated'
  );

  res.status(200).json({
    success: true,
    message: 'Issue escalated to critical priority.',
    data: {
      issue: data
    }
  });
});


exports.getIssueStats = asyncHandler(async (req, res, next) => {
  const { date_from, date_to } = req.query;

  const filters = {};
  if (date_from) filters.date_from = date_from;
  if (date_to) filters.date_to = date_to;

  const { data: stats, error } = await issueModel.getIssueStats(filters);

  if (error) {
    throw new AppError('Failed to fetch statistics.', 500);
  }

  res.status(200).json({
    success: true,
    data: {
      stats
    }
  });
});

module.exports = exports;

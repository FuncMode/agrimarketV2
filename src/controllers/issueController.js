// src\controllers\issueController.js

const { AppError, asyncHandler } = require('../middleware/errorHandler');
const issueModel = require('../models/issueModel');
const orderModel = require('../models/orderModel');
const { uploadIssueEvidence } = require('../config/storage');
const adminLogModel = require('../models/adminLogModel');
const notificationService = require('../services/notificationService');
const emailService = require('../services/emailService');
const { supabase } = require('../config/database');

exports.createIssue = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const {
    order_id,
    issue_type,
    description
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
    evidence_urls: evidenceUrls
  });

  if (error) {
    throw new AppError('Failed to create issue report.', 500);
  }

  const { data: completeIssue } = await issueModel.getIssueById(issue.id);

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
    await notificationService.createNotification({
      user_id: otherPartyId,
      title: 'Issue Reported on Your Order',
      message: `An issue has been reported on order ${order.order_number}: ${description.substring(0, 50)}...`,
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
      await emailService.sendIssueReportEmail(otherPartyUser, issue.id, issue_type).catch(err => 
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

  if (error || !issue) {
    throw new AppError('Issue not found.', 404);
  }

  res.status(200).json({
    success: true,
    data: {
      issue
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
  const { issue_type } = req.query;

  const filters = {};
  if (issue_type) filters.issue_type = issue_type;

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
  const { issue_type, date_from, date_to } = req.query;

  const filters = {};
  if (issue_type) filters.issue_type = issue_type;
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
  const { issue_type, date_from, date_to } = req.query;

  const filters = {};
  if (issue_type) filters.issue_type = issue_type;
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
  const { resolution } = req.body;

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
      issue: data
    }
  });
});


exports.rejectIssue = asyncHandler(async (req, res, next) => {
  const { issueId } = req.params;
  const adminId = req.user.id;
  const { resolution } = req.body;

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
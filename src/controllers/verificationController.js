// src\controllers\verificationController.js

const { AppError, asyncHandler } = require('../middleware/errorHandler');
const verificationModel = require('../models/verificationModel');
const adminLogModel = require('../models/adminLogModel');
const {
  uploadIdDocument,
  uploadSelfiePhoto,
  getSignedUrl,
  BUCKETS
} = require('../config/storage');
const notificationService = require('../services/notificationService');
const emailService = require('../services/emailService');

exports.submitVerification = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { id_type } = req.body;

  const validIdTypes = ['drivers_license', 'philid', 'passport', 'nbi_clearance'];
  if (!id_type || !validIdTypes.includes(id_type)) {
    throw new AppError(
      `Invalid ID type. Must be one of: ${validIdTypes.join(', ')}`,
      400
    );
  }

  if (req.user.status === 'verified') {
    throw new AppError('Your account is already verified.', 400);
  }

  const { hasPending } = await verificationModel.hasPendingVerification(userId);
  if (hasPending) {
    throw new AppError(
      'You already have a pending verification. Please wait for admin review.',
      400
    );
  }

  const idPhoto = req.files['id_photo'][0];
  const selfie = req.files['selfie'][0];

  const idUploadResult = await uploadIdDocument(
    userId,
    idPhoto.buffer,
    idPhoto.originalname,
    idPhoto.mimetype
  );

  if (!idUploadResult.success) {
    throw new AppError('Failed to upload ID photo. Please try again.', 500);
  }

  const selfieUploadResult = await uploadSelfiePhoto(
    userId,
    selfie.buffer,
    selfie.originalname,
    selfie.mimetype
  );

  if (!selfieUploadResult.success) {
    throw new AppError('Failed to upload selfie. Please try again.', 500);
  }

  const { data: verification, error } = await verificationModel.createVerification({
    user_id: userId,
    id_photo_path: idUploadResult.data.fullPath,
    selfie_path: selfieUploadResult.data.fullPath,
    id_type
  });

  if (error) {
    throw new AppError('Failed to submit verification. Please try again.', 500);
  }

  await verificationModel.updateUserStatus(userId, 'verification_pending');

  res.status(201).json({
    success: true,
    message: 'Verification documents submitted successfully! Review typically takes 24-48 hours.',
    data: {
      verification: {
        id: verification.id,
        status: verification.submission_status,
        submitted_at: verification.submitted_at
      }
    }
  });
});

exports.getMyVerificationStatus = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;

  const { data: verification, error } = await verificationModel.getUserVerification(userId);

  if (error && error.code !== 'PGRST116') { 
    throw new AppError('Failed to fetch verification status.', 500);
  }

  if (!verification) {
    return res.status(200).json({
      success: true,
      data: {
        has_verification: false,
        user_status: req.user.status,
        message: 'No verification submitted yet.'
      }
    });
  }

  // Generate signed URLs for verification images
  let idPhotoUrl = null;
  let selfieUrl = null;

  try {
    const cleanIdPhotoPath = verification.id_photo_path?.replace(/^id-documents\//, '');
    const cleanSelfiePath = verification.selfie_path?.replace(/^selfie-photos\//, '');

    if (cleanIdPhotoPath) {
      try {
        const idPhotoResult = await getSignedUrl(
          BUCKETS.ID_DOCUMENTS,
          cleanIdPhotoPath,
          3600
        );
        if (idPhotoResult.success) {
          idPhotoUrl = idPhotoResult.signedUrl;
        }
      } catch (err) {
        console.error('Error generating ID photo signed URL:', err);
      }
    }

    if (cleanSelfiePath) {
      try {
        const selfieResult = await getSignedUrl(
          BUCKETS.SELFIE_PHOTOS,
          cleanSelfiePath,
          3600
        );
        if (selfieResult.success) {
          selfieUrl = selfieResult.signedUrl;
        }
      } catch (err) {
        console.error('Error generating selfie signed URL:', err);
      }
    }
  } catch (err) {
    console.error('Error processing verification URLs:', err);
  }

  res.status(200).json({
    success: true,
    data: {
      has_verification: true,
      user_status: req.user.status,
      verification: {
        id: verification.id,
        status: verification.submission_status,
        id_type: verification.id_type,
        submitted_at: verification.submitted_at,
        reviewed_at: verification.reviewed_at,
        admin_notes: verification.admin_notes,
        id_photo_url: idPhotoUrl,
        selfie_url: selfieUrl
      }
    }
  });
});

exports.getPendingVerifications = asyncHandler(async (req, res, next) => {
  const { role } = req.query; 

  const filters = {};
  if (role) filters.role = role;

  const { data: verifications, error } = await verificationModel.getPendingVerifications(filters);

  if (error) {
    throw new AppError('Failed to fetch pending verifications.', 500);
  }

  // Generate signed URLs for all verification images
  const verificationsWithUrls = await Promise.all(
    verifications.map(async (verification) => {
      let idPhotoUrl = null;
      let selfieUrl = null;

      try {
        const cleanIdPhotoPath = verification.id_photo_path?.replace(/^id-documents\//, '');
        const cleanSelfiePath = verification.selfie_path?.replace(/^selfie-photos\//, '');

        if (cleanIdPhotoPath) {
          try {
            const idPhotoResult = await getSignedUrl(
              BUCKETS.ID_DOCUMENTS,
              cleanIdPhotoPath,
              3600
            );
            if (idPhotoResult.success) {
              idPhotoUrl = idPhotoResult.signedUrl;
            } else {
              console.error('Failed to generate ID photo URL:', idPhotoResult.error);
            }
          } catch (err) {
            console.error('Error generating ID photo signed URL:', err);
          }
        }

        if (cleanSelfiePath) {
          try {
            const selfieResult = await getSignedUrl(
              BUCKETS.SELFIE_PHOTOS,
              cleanSelfiePath,
              3600
            );
            if (selfieResult.success) {
              selfieUrl = selfieResult.signedUrl;
            } else {
              console.error('Failed to generate selfie URL:', selfieResult.error);
            }
          } catch (err) {
            console.error('Error generating selfie signed URL:', err);
          }
        }
      } catch (err) {
        console.error('Error processing verification URLs:', err);
      }

      return {
        ...verification,
        id_photo_url: idPhotoUrl,
        selfie_url: selfieUrl
      };
    })
  );

  res.status(200).json({
    success: true,
    results: verificationsWithUrls.length,
    data: {
      verifications: verificationsWithUrls
    }
  });
});

exports.getVerificationDetails = asyncHandler(async (req, res, next) => {
  const { verificationId } = req.params;

  const { data: verification, error } = await verificationModel.getVerificationById(verificationId);

  if (error || !verification) {
    throw new AppError('Verification not found.', 404);
  }

  let idPhotoUrl = null;
  let selfieUrl = null;

  const cleanIdPhotoPath = verification.id_photo_path?.replace(/^id-documents\//, '');
  const cleanSelfiePath = verification.selfie_path?.replace(/^selfie-photos\//, '');

  if (cleanIdPhotoPath) {
    const idPhotoResult = await getSignedUrl(
      BUCKETS.ID_DOCUMENTS,
      cleanIdPhotoPath,
      3600
    );
    if (idPhotoResult.success) {
      idPhotoUrl = idPhotoResult.signedUrl;
    } else {
      console.error('Failed to generate ID photo URL:', idPhotoResult.error);
    }
  }

  if (cleanSelfiePath) {
    const selfieResult = await getSignedUrl(
      BUCKETS.SELFIE_PHOTOS,
      cleanSelfiePath,
      3600
    );
    if (selfieResult.success) {
      selfieUrl = selfieResult.signedUrl;
    } else {
      console.error('Failed to generate selfie URL:', selfieResult.error);
    }
  }

  res.status(200).json({
    success: true,
    data: {
      verification: {
        ...verification,
        id_photo_url: idPhotoUrl,
        selfie_url: selfieUrl
      }
    }
  });
});

exports.approveVerification = asyncHandler(async (req, res, next) => {
  const { verificationId } = req.params;
  const adminId = req.user.id;
  const { admin_notes } = req.body;

  const { data: verification, error: fetchError } = await verificationModel.getVerificationById(verificationId);

  if (fetchError || !verification) {
    throw new AppError('Verification not found.', 404);
  }

  if (verification.submission_status !== 'pending') {
    throw new AppError(
      `Verification already ${verification.submission_status}.`,
      400
    );
  }

  const { error: updateError } = await verificationModel.updateVerificationStatus(
    verificationId,
    'approved',
    adminId,
    admin_notes
  );

  if (updateError) {
    throw new AppError('Failed to approve verification.', 500);
  }

  const { data: updatedUser, error: userError } = await verificationModel.updateUserStatus(
    verification.users.id,
    'verified'
  );

  if (userError) {
    throw new AppError('Failed to update user status.', 500);
  }

  await adminLogModel.createLog({
    admin_id: adminId,
    action_type: 'VERIFICATION_APPROVED',
    action_description: `Approved verification for user ${verification.users.full_name}`,
    target_user_id: verification.users.id,
    reference_id: verificationId,
    ip_address: req.ip
  });

  await notificationService.createNotification({
    user_id: verification.users.id,
    title: 'Verification Approved',
    message: 'Your identity verification has been approved! Your account is now fully verified.',
    type: 'verification_approved',
    reference_id: verificationId
  });

  try {
    const emailResult = await emailService.sendVerificationApprovedEmail(verification.users);
    if (emailResult && emailResult.success) {
      console.log(`Verification approval email sent to ${verification.users.email}`);
      if (emailResult.messageId) {
        console.log(`   Message ID: ${emailResult.messageId}`);
      }
    } else {
      console.error(`Failed to send verification approval email to ${verification.users.email}:`, emailResult?.error || emailResult?.message || 'Unknown error');
    }
  } catch (emailError) {
    console.error(`Exception sending verification approval email to ${verification.users.email}:`, emailError.message || emailError);
  }

  res.status(200).json({
    success: true,
    message: 'Verification approved successfully! User is now verified.',
    data: {
      user: updatedUser
    }
  });
});

exports.rejectVerification = asyncHandler(async (req, res, next) => {
  const { verificationId } = req.params;
  const adminId = req.user.id;
  const { admin_notes } = req.body;

  if (!admin_notes) {
    throw new AppError('Rejection reason (admin_notes) is required.', 400);
  }

  const { data: verification, error: fetchError } = await verificationModel.getVerificationById(verificationId);

  if (fetchError || !verification) {
    throw new AppError('Verification not found.', 404);
  }

  if (verification.submission_status !== 'pending') {
    throw new AppError(
      `Verification already ${verification.submission_status}.`,
      400
    );
  }

  const { error: updateError } = await verificationModel.updateVerificationStatus(
    verificationId,
    'rejected',
    adminId,
    admin_notes
  );

  if (updateError) {
    throw new AppError('Failed to reject verification.', 500);
  }

  await verificationModel.updateUserStatus(verification.users.id, 'rejected');

  await adminLogModel.createLog({
    admin_id: adminId,
    action_type: 'VERIFICATION_REJECTED',
    action_description: `Rejected verification for user ${verification.users.full_name}. Reason: ${admin_notes}`,
    target_user_id: verification.users.id,
    reference_id: verificationId,
    ip_address: req.ip
  });

  await notificationService.createNotification({
    user_id: verification.users.id,
    title: 'Verification Rejected',
    message: `Your identity verification has been rejected. Reason: ${admin_notes}. Please resubmit your documents.`,
    type: 'verification_rejected',
    reference_id: verificationId
  });

  try {
    const emailResult = await emailService.sendVerificationRejectedEmail(verification.users, admin_notes);
    if (emailResult && emailResult.success) {
      console.log(`Verification rejection email sent to ${verification.users.email}`);
      if (emailResult.messageId) {
        console.log(`   Message ID: ${emailResult.messageId}`);
      }
    } else {
      console.error(`Failed to send verification rejection email to ${verification.users.email}:`, emailResult?.error || emailResult?.message || 'Unknown error');
    }
  } catch (emailError) {
    console.error(`Exception sending verification rejection email to ${verification.users.email}:`, emailError.message || emailError);
  }

  res.status(200).json({
    success: true,
    message: 'Verification rejected. User has been notified.',
    data: {
      verification_id: verificationId,
      reason: admin_notes
    }
  });
});

exports.requestMoreEvidence = asyncHandler(async (req, res, next) => {
  const { verificationId } = req.params;
  const adminId = req.user.id;
  const { admin_notes } = req.body;

  if (!admin_notes) {
    throw new AppError('Please specify what additional evidence is needed.', 400);
  }

  const { data: verification, error: fetchError } = await verificationModel.getVerificationById(verificationId);

  if (fetchError || !verification) {
    throw new AppError('Verification not found.', 404);
  }

  const { error: updateError } = await verificationModel.updateVerificationStatus(
    verificationId,
    'more_evidence',
    adminId,
    admin_notes
  );

  if (updateError) {
    throw new AppError('Failed to request more evidence.', 500);
  }

  await adminLogModel.createLog({
    admin_id: adminId,
    action_type: 'VERIFICATION_MORE_EVIDENCE',
    action_description: `Requested more evidence for user ${verification.users.full_name}. Details: ${admin_notes}`,
    target_user_id: verification.users.id,
    reference_id: verificationId,
    ip_address: req.ip
  });

  await notificationService.createNotification({
    user_id: verification.users.id,
    title: 'Additional Verification Documents Needed',
    message: `Your verification requires additional documents. Details: ${admin_notes}. Please submit the requested documents.`,
    type: 'verification',
    reference_id: verificationId
  });

  // Send email notification
  try {
    const emailResult = await emailService.sendVerificationRejectedEmail(verification.users, admin_notes);
    if (emailResult && emailResult.success) {
      console.log(`✅ More evidence request email sent to ${verification.users.email}`);
      if (emailResult.messageId) {
        console.log(`   Message ID: ${emailResult.messageId}`);
      }
    } else {
      console.error(`❌ Failed to send more evidence request email to ${verification.users.email}:`, emailResult?.error || emailResult?.message || 'Unknown error');
    }
  } catch (emailError) {
    console.error(`❌ Exception sending more evidence request email to ${verification.users.email}:`, emailError.message || emailError);
    // Don't fail the whole request if email fails
  }

  res.status(200).json({
    success: true,
    message: 'More evidence requested. User has been notified.',
    data: {
      verification_id: verificationId,
      requested_evidence: admin_notes
    }
  });
});

exports.getVerificationStats = asyncHandler(async (req, res, next) => {
  const { data: stats, error } = await verificationModel.getVerificationStats();

  if (error) {
    throw new AppError('Failed to fetch verification statistics.', 500);
  }

  res.status(200).json({
    success: true,
    data: {
      stats
    }
  });
});
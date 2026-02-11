// src\services\emailService.js

const nodemailer = require('nodemailer');

let transporter = null;

const initializeTransporter = () => {
  if (transporter) return transporter;

  if (process.env.EMAIL_SERVICE === 'gmail') {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  } else {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  }

  return transporter;
};

const verifyEmailConfig = async () => {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.warn('Email not configured - check .env EMAIL_* variables');
      return false;
    }

    const transporter = initializeTransporter();
    await transporter.verify();
    return true;
  } catch (error) {
    console.error('Email service verification failed:', error.message);
    return false;
  }
};

exports.verifyEmailConfig = verifyEmailConfig;

exports.sendVerificationApprovedEmail = async (user) => {
  const emailData = {
    to: user.email,
    subject: 'Account Verified - Welcome to AgriMarket!',
    body: `
      Dear ${user.full_name},
      
      Congratulations! Your account has been verified.
      
      You can now access all features of AgriMarket:
      ${user.role === 'seller' ? '- List and manage your products' : '- Browse and purchase products'}
      - Communicate with ${user.role === 'seller' ? 'buyers' : 'sellers'}
      - View your order history
      
      Thank you for joining AgriMarket!
      
      Best regards,
      AgriMarket Team
    `
  };

  return sendEmail(emailData);
};

exports.sendVerificationRejectedEmail = async (user, reason) => {
  const emailData = {
    to: user.email,
    subject: 'Account Verification - Additional Information Needed',
    body: `
      Dear ${user.full_name},
      
      We were unable to verify your account at this time.
      
      Reason: ${reason}
      
      Please submit new verification documents through your account settings.
      
      If you have questions, please contact our support team.
      
      Best regards,
      AgriMarket Team
    `
  };

  return sendEmail(emailData);
};

exports.sendOrderConfirmationEmail = async (order, user) => {
  const emailData = {
    to: user.email,
    subject: `Order Confirmation - ${order.order_number}`,
    body: `
      Dear ${user.full_name},
      
      Your order has been confirmed!
      
      Order Number: ${order.order_number}
      Total Amount: ₱${order.total_amount}
      Delivery Option: ${order.delivery_option}
      
      You can track your order status in your account dashboard.
      
      Thank you for shopping with AgriMarket!
      
      Best regards,
      AgriMarket Team
    `
  };

  return sendEmail(emailData);
};

exports.sendOrderStatusEmail = async (order, user, status) => {
  const statusMessages = {
    placed: 'Your order has been placed successfully',
    confirmed: 'Your order has been confirmed by the seller',
    ready: 'Your order is ready for pickup/delivery',
    completed: 'Your order has been completed',
    cancelled: 'Your order has been cancelled'
  };

  const emailData = {
    to: user.email,
    subject: `Order Update - ${order.order_number}`,
    body: `
      Dear ${user.full_name},
      
      ${statusMessages[status]}
      
      Order Number: ${order.order_number}
      Status: ${status.toUpperCase()}
      Total Amount: ₱${order.total_amount}
      
      View your order details in your account dashboard.
      
      Best regards,
      AgriMarket Team
    `
  };

  return sendEmail(emailData);
};

exports.sendNewMessageEmail = async (recipient, sender, orderNumber) => {
  const emailData = {
    to: recipient.email,
    subject: `New Message - Order ${orderNumber}`,
    body: `
      Dear ${recipient.full_name},
      
      You have received a new message from ${sender.full_name} regarding order ${orderNumber}.
      
      Please log in to your account to view and respond to the message.
      
      Best regards,
      AgriMarket Team
    `
  };

  return sendEmail(emailData);
};

exports.sendPasswordResetEmail = async (user, resetUrl) => {
  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; padding: 12px 30px; background: #28a745; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .button:hover { background: #218838; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 5px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔐 Password Reset Request</h1>
        </div>
        <div class="content">
          <p>Dear ${user.full_name},</p>
          
          <p>We received a request to reset your password for your AgriMarket account.</p>
          
          <p style="text-align: center;">
            <a href="${resetUrl}" class="button">Reset Password</a>
          </p>
          
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #28a745;">${resetUrl}</p>
          
          <div class="warning">
            <strong>⚠️ Important:</strong> This link will expire in 24 hours for security reasons.
          </div>
          
          <p>If you didn't request a password reset, please ignore this email. Your password will remain unchanged.</p>
          
          <p>For security reasons, never share this link with anyone.</p>
          
          <p>Best regards,<br>
          <strong>AgriMarket Team</strong></p>
        </div>
        <div class="footer">
          <p>This is an automated email. Please do not reply to this message.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textBody = `
    Dear ${user.full_name},
    
    We received a request to reset your password for your AgriMarket account.
    
    Click the link below to reset your password:
    ${resetUrl}
    
    This link will expire in 24 hours.
    
    If you didn't request this, please ignore this email. Your password will remain unchanged.
    
    Best regards,
    AgriMarket Team
  `;

  const emailData = {
    to: user.email,
    subject: 'Password Reset Request - AgriMarket',
    body: textBody,
    html: htmlBody
  };

  return sendEmail(emailData);
};

exports.sendAccountSuspensionEmail = async (user, reason, suspensionEnd) => {
  const emailData = {
    to: user.email,
    subject: 'Account Suspension Notice',
    body: `
      Dear ${user.full_name},
      
      Your account has been temporarily suspended.
      
      Reason: ${reason}
      Suspension End: ${new Date(suspensionEnd).toLocaleDateString()}
      
      If you believe this is a mistake, please contact our support team.
      
      Best regards,
      AgriMarket Team
    `
  };

  return sendEmail(emailData);
};

exports.sendIssueReportEmail = async (user, issueId, issueType) => {
  const emailData = {
    to: user.email,
    subject: 'Issue Report Received',
    body: `
      Dear ${user.full_name},
      
      We have received your issue report.
      
      Issue ID: ${issueId}
      Type: ${issueType}
      
      Our team will review it and respond within 24-48 hours.
      
      Best regards,
      AgriMarket Team
    `
  };

  return sendEmail(emailData);
};

exports.sendIssueResolutionEmail = async (user, issueId, resolution) => {
  const emailData = {
    to: user.email,
    subject: 'Issue Resolved',
    body: `
      Dear ${user.full_name},
      
      Your issue report has been resolved.
      
      Issue ID: ${issueId}
      Resolution: ${resolution}
      
      Thank you for your patience.
      
      Best regards,
      AgriMarket Team
    `
  };

  return sendEmail(emailData);
};

exports.sendWelcomeEmail = async (user) => {
  const emailData = {
    to: user.email,
    subject: 'Welcome to AgriMarket!',
    body: `
      Dear ${user.full_name},
      
      Welcome to AgriMarket - Your local agricultural marketplace!
      
      Next Steps:
      1. Complete your account verification
      2. ${user.role === 'seller' ? 'Set up your seller profile' : 'Browse available products'}
      3. Start ${user.role === 'seller' ? 'selling' : 'buying'}!
      
      If you need any help, don't hesitate to contact us.
      
      Best regards,
      AgriMarket Team
`
  };

  return sendEmail(emailData);
};

exports.sendOrderCancellationEmail = async (user, order, reason) => {
  const emailData = {
    to: user.email,
    subject: `Order Cancelled - ${order.order_number}`,
    body: `
      Dear ${user.full_name},
      
      Your order has been cancelled.
      
      Order Number: ${order.order_number}
      Total Amount: ₱${order.total_amount}
      Cancellation Reason: ${reason}
      
      If you have questions, please contact our support team.
      
      Best regards,
      AgriMarket Team
    `
  };

  return sendEmail(emailData);
};

exports.sendProductStockAlertEmail = async (user, product, alertType) => {
  const subject = alertType === 'low_stock' ? 'Limited Stock Available' : 'Product Back in Stock';
  const message = alertType === 'low_stock' 
    ? `${product.name} is running low on stock (${product.available_quantity} units left). Order now before it sells out!`
    : `Great news! ${product.name} is back in stock and ready for purchase.`;

  const emailData = {
    to: user.email,
    subject: subject,
    body: `
      Dear ${user.full_name},
      
      ${message}
      
      Product: ${product.name}
      Price: ₱${product.price_per_unit} per ${product.unit_type}
      Available Quantity: ${product.available_quantity} ${product.unit_type}(s)
      
      Visit AgriMarket now to purchase this product.
      
      Best regards,
      AgriMarket Team
    `
  };

  return sendEmail(emailData);
};

exports.sendAccountStatusChangeEmail = async (user, newStatus, reason) => {
  const statusMessages = {
    suspended: 'Your account has been temporarily suspended',
    banned: 'Your account has been permanently banned',
    verified: 'Your account status has been updated to verified',
    rejected: 'Your account verification was rejected'
  };

  const emailData = {
    to: user.email,
    subject: `Account Status Update - ${newStatus.toUpperCase()}`,
    body: `
      Dear ${user.full_name},
      
      ${statusMessages[newStatus]}
      
      New Status: ${newStatus.toUpperCase()}
      Reason: ${reason}
      
      If you believe this is a mistake, please contact our support team immediately.
      
      Best regards,
      AgriMarket Team
    `
  };

  return sendEmail(emailData);
};

exports.sendProductStatusChangeEmail = async (user, product, status) => {
  const statusMessage = status === 'active' ? 'is now available' : 'has been paused';
  const subject = status === 'active' ? 'Product Available' : '⏸Product Paused';

  const emailData = {
    to: user.email,
    subject: subject,
    body: `
      Dear ${user.full_name},
      
      Product update: ${product.name} ${statusMessage}.
      
      Product: ${product.name}
      Status: ${status.toUpperCase()}
      Price: ₱${product.price_per_unit} per ${product.unit_type}
      
      Log in to your account to view more details.
      
      Best regards,
      AgriMarket Team
    `
  };

  return sendEmail(emailData);
};

exports.sendOrderPaymentConfirmationEmail = async (user, order) => {
  const emailData = {
    to: user.email,
    subject: `Payment Confirmed - Order ${order.order_number}`,
    body: `
      Dear ${user.full_name},
      
      Your payment has been confirmed!
      
      Order Number: ${order.order_number}
      Amount Paid: ₱${order.total_amount}
      Payment Status: CONFIRMED
      
      Your order is now being processed by the seller.
      
      Track your order status in your account dashboard.
      
      Best regards,
      AgriMarket Team
    `
  };

  return sendEmail(emailData);
};

exports.sendOrderReviewReminderEmail = async (user, order) => {
  const emailData = {
    to: user.email,
    subject: `How was your experience? - Order ${order.order_number}`,
    body: `
      Dear ${user.full_name},
      
      We hope you enjoyed your purchase!
      
      Order Number: ${order.order_number}
      
      We'd love to hear about your experience. Please leave a review to help other buyers make informed decisions.
      
      Your feedback is valuable to us and helps us improve our service.
      
      Log in to your account to leave a review.
      
      Best regards,
      AgriMarket Team
    `
  };

  return sendEmail(emailData);
};

exports.sendAdminActionNotificationEmail = async (user, actionType, details) => {
  const actionMessages = {
    seller_approved: 'Your seller application has been approved!',
    seller_rejected: 'Your seller application was not approved at this time',
    account_restricted: 'Your account has been restricted due to policy violation',
    issue_resolved: 'An issue has been resolved in your favor'
  };

  const emailData = {
    to: user.email,
    subject: `Admin Action - ${actionType}`,
    body: `
      Dear ${user.full_name},
      
      ${actionMessages[actionType] || 'An administrative action has been taken on your account'}
      
      Action Type: ${actionType}
      Details: ${details}
      Processed At: ${new Date().toLocaleString()}
      
      If you have questions, please contact our support team.
      
      Best regards,
      AgriMarket Team
    `
  };

  return sendEmail(emailData);
};

exports.sendTestNotificationEmail = async (user, notificationData) => {
  const emailData = {
    to: user.email,
    subject: `Test Notification: ${notificationData.title}`,
    body: `
      Dear ${user.full_name},
      
      This is a TEST NOTIFICATION from AgriMarket.
      
      Notification Details:
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      Title: ${notificationData.title}
      Message: ${notificationData.message}
      Type: ${notificationData.type}
      Created At: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })}
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      
      If you received this email, it means:
      Email service is working correctly
      Notification system is functioning
      Your email is properly configured
      
      This is just a test - you can safely ignore this notification.
      
      Best regards,
      AgriMarket Team
    `
  };

  return sendEmail(emailData);
};

async function sendEmail(emailData) {
  try {
    if (!emailData.to || emailData.to.trim() === '') {
      console.warn('⚠️  No email recipient defined');
      return {
        success: false,
        message: 'No valid email recipient'
      };
    }

    if (process.env.NODE_ENV === 'development' && process.env.EMAIL_TEST_MODE === 'true') {
      console.log('\nEMAIL SENT (Development Mode):');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('To:', emailData.to);
      console.log('Subject:', emailData.subject);
      console.log('Body:', emailData.body);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
      return {
        success: true,
        message: 'Email logged to console (test mode)',
        testMode: true
      };
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.warn('Email service not configured');
      return {
        success: false,
        message: 'Email service not configured'
      };
    }

    const transporter = initializeTransporter();

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: emailData.to,
      subject: emailData.subject,
      text: emailData.body,
      html: emailData.html || `<pre style="font-family: Arial, sans-serif; white-space: pre-wrap;">${emailData.body}</pre>`
    };

    const info = await transporter.sendMail(mailOptions);

    console.log('   Email sent successfully');
    console.log('   Message ID:', info.messageId);
    console.log('   To:', emailData.to);
    console.log('   Subject:', emailData.subject);

    return {
      success: true,
      message: 'Email sent successfully',
      messageId: info.messageId
    };

  } catch (error) {
    console.error('Email send error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = exports;
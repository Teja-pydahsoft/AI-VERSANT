const { Notification } = require('../models/Notification');
const { NotificationSettings } = require('../models/NotificationSettings');
const pushNotificationService = require('./pushNotificationService');
const logger = require('../utils/logger');

// Robust fallback HTML content for test notifications
const createFallbackTestNotificationEmail = (variables) => {
  const { name, testName, testType, testUrl = 'https://crt.pydahsoft.in/student/exam', startDateTime, endDateTime } = variables.params || variables;
  
  // Format dates
  const formatDate = (dateStr) => {
    if (!dateStr) return 'To be announced';
    const date = new Date(dateStr);
    return date.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>New Test Scheduled - VERSANT</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
            body { font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 16px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); overflow: hidden; }
            .header { background: linear-gradient(135deg, #1e293b 0%, #334155 100%); color: #fff; padding: 32px 24px; text-align: center; position: relative; }
            .header::before { content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grain" width="100" height="100" patternUnits="userSpaceOnUse"><circle cx="50" cy="50" r="1" fill="%23ffffff" opacity="0.1"/></pattern></defs><rect width="100" height="100" fill="url(%23grain)"/></svg>'); opacity: 0.1; }
            .logo { max-width: 140px; margin-bottom: 16px; position: relative; z-index: 1; }
            .header-content { position: relative; z-index: 1; }
            .header h1 { font-size: 2rem; font-weight: 700; margin: 0; letter-spacing: -0.5px; }
            .header p { font-size: 1.1rem; margin: 8px 0 0 0; opacity: 0.9; }
            .content { padding: 32px 24px; }
            .greeting { font-size: 1.3rem; color: #1e293b; margin-bottom: 24px; font-weight: 600; }
            .intro-text { font-size: 1.1rem; color: #475569; line-height: 1.6; margin-bottom: 24px; }
            .test-card { background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin: 24px 0; }
            .test-title { font-size: 1.4rem; font-weight: 700; color: #1e293b; margin-bottom: 16px; }
            .test-details { display: grid; gap: 12px; }
            .detail-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
            .detail-row:last-child { border-bottom: none; }
            .detail-label { font-weight: 600; color: #374151; }
            .detail-value { color: #1e293b; font-weight: 500; }
            .status-badge { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 6px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; }
            .instructions { background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-left: 4px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 24px 0; }
            .instructions h3 { color: #92400e; font-size: 1.1rem; margin: 0 0 12px 0; font-weight: 700; }
            .instructions ul { margin: 0; padding-left: 20px; color: #92400e; }
            .instructions li { margin-bottom: 8px; line-height: 1.5; }
            .warning { background: linear-gradient(135deg, #fef2f2 0%, #fecaca 100%); border-left: 4px solid #ef4444; border-radius: 8px; padding: 20px; margin: 24px 0; }
            .warning h3 { color: #dc2626; font-size: 1.1rem; margin: 0 0 12px 0; font-weight: 700; }
            .warning p { color: #dc2626; margin: 0; line-height: 1.5; }
            .cta-container { text-align: center; margin: 32px 0; }
            .cta { display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: #fff; padding: 16px 32px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 1.1rem; box-shadow: 0 8px 16px rgba(59, 130, 246, 0.3); transition: all 0.3s ease; }
            .cta:hover { transform: translateY(-2px); box-shadow: 0 12px 24px rgba(59, 130, 246, 0.4); }
            .footer { background: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0; }
            .footer-text { color: #64748b; font-size: 0.95rem; line-height: 1.6; margin: 0; }
            .contact-info { margin-top: 16px; padding: 16px; background: #f1f5f9; border-radius: 8px; }
            .contact-info p { margin: 0; color: #475569; font-size: 0.9rem; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <img src="https://static.wixstatic.com/media/bfee2e_7d499a9b2c40442e85bb0fa99e7d5d37~mv2.png/v1/fill/w_203,h_111,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/logo1.png" alt="VERSANT Logo" class="logo" />
                <div class="header-content">
                    <h1>📚 New Test Scheduled</h1>
                    <p>Your online examination is ready</p>
                </div>
            </div>
            <div class="content">
                <div class="greeting">Hello, ${name || 'Student'}! 👋</div>
                <div class="intro-text">
                    A new online test has been scheduled for you in the <strong>VERSANT</strong> system. 
                    Please review the details below and prepare accordingly.
                </div>
                
                <div class="test-card">
                    <div class="test-title">📝 ${testName || 'Online Test'}</div>
                    <div class="test-details">
                        <div class="detail-row">
                            <span class="detail-label">Test Type:</span>
                            <span class="detail-value">${testType || 'Online Examination'}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Start Date:</span>
                            <span class="detail-value">${formatDate(startDateTime)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">End Date:</span>
                            <span class="detail-value">${formatDate(endDateTime)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Status:</span>
                            <span class="status-badge">✅ Ready to Attempt</span>
                        </div>
                    </div>
                </div>

                <div class="instructions">
                    <h3>📋 Important Instructions</h3>
                    <ul>
                        <li><strong>Single Attempt:</strong> You have only ONE attempt for this test</li>
                        <li><strong>No Reloading:</strong> Do NOT refresh or reload the page during the test</li>
                        <li><strong>Stable Connection:</strong> Ensure you have a stable internet connection</li>
                        <li><strong>Time Limit:</strong> Complete the test within the allocated time</li>
                        <li><strong>No Back Navigation:</strong> Do not use browser back button during the test</li>
                        <li><strong>Full Screen:</strong> Avoid switching tabs or minimizing the browser</li>
                    </ul>
                </div>

                <div class="warning">
                    <h3>⚠️ Critical Reminders</h3>
                    <p><strong>DO NOT RELOAD:</strong> Any reload or refresh will submit your test automatically. Make sure you're ready before starting.</p>
                </div>

                <div class="cta-container">
                    <a href="${testUrl}" class="cta">🚀 Start Your Test Now</a>
                </div>
            </div>
            <div class="footer">
                <p class="footer-text">
                    <strong>All the best for your examination! 🎯</strong><br>
                    We believe in your success and look forward to your performance.
                </p>
                <div class="contact-info">
                    <p><strong>Need Help?</strong> If you have any queries or technical issues, please contact your instructor or administrator immediately.</p>
                </div>
                <p class="footer-text" style="margin-top: 16px;">
                    Best regards,<br>
                    <strong>The VERSANT Team</strong>
                </p>
            </div>
        </div>
    </body>
    </html>
  `;

  return {
    subject: `📚 New Test Assigned: ${testName || 'Online Test'} - VERSANT`,
    htmlContent: htmlContent
  };
};

const createFallbackTestReminderEmail = (variables) => {
  const { name, testName, testId, testUrl = 'https://crt.pydahsoft.in/student/exam', endDateTime } = variables.params || variables;
  
  // Format end date
  const formatDate = (dateStr) => {
    if (!dateStr) return 'To be announced';
    const date = new Date(dateStr);
    return date.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Test Reminder - VERSANT</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
            body { font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 16px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); overflow: hidden; }
            .header { background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: #fff; padding: 32px 24px; text-align: center; position: relative; }
            .header::before { content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grain" width="100" height="100" patternUnits="userSpaceOnUse"><circle cx="50" cy="50" r="1" fill="%23ffffff" opacity="0.1"/></pattern></defs><rect width="100" height="100" fill="url(%23grain)"/></svg>'); opacity: 0.1; }
            .logo { max-width: 140px; margin-bottom: 16px; position: relative; z-index: 1; }
            .header-content { position: relative; z-index: 1; }
            .header h1 { font-size: 2rem; font-weight: 700; margin: 0; letter-spacing: -0.5px; }
            .header p { font-size: 1.1rem; margin: 8px 0 0 0; opacity: 0.9; }
            .content { padding: 32px 24px; }
            .greeting { font-size: 1.3rem; color: #1e293b; margin-bottom: 24px; font-weight: 600; }
            .intro-text { font-size: 1.1rem; color: #475569; line-height: 1.6; margin-bottom: 24px; }
            .test-card { background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border: 1px solid #fecaca; border-radius: 12px; padding: 24px; margin: 24px 0; }
            .test-title { font-size: 1.4rem; font-weight: 700; color: #dc2626; margin-bottom: 16px; }
            .test-details { display: grid; gap: 12px; }
            .detail-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #fecaca; }
            .detail-row:last-child { border-bottom: none; }
            .detail-label { font-weight: 600; color: #374151; }
            .detail-value { color: #dc2626; font-weight: 500; }
            .status-badge { background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; padding: 6px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; }
            .urgent-notice { background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-left: 4px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 24px 0; }
            .urgent-notice h3 { color: #92400e; font-size: 1.1rem; margin: 0 0 12px 0; font-weight: 700; }
            .urgent-notice p { color: #92400e; margin: 0; line-height: 1.5; }
            .critical-warning { background: linear-gradient(135deg, #fef2f2 0%, #fecaca 100%); border-left: 4px solid #ef4444; border-radius: 8px; padding: 20px; margin: 24px 0; }
            .critical-warning h3 { color: #dc2626; font-size: 1.1rem; margin: 0 0 12px 0; font-weight: 700; }
            .critical-warning p { color: #dc2626; margin: 0; line-height: 1.5; }
            .cta-container { text-align: center; margin: 32px 0; }
            .cta { display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: #fff; padding: 16px 32px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 1.1rem; box-shadow: 0 8px 16px rgba(220, 38, 38, 0.3); transition: all 0.3s ease; }
            .cta:hover { transform: translateY(-2px); box-shadow: 0 12px 24px rgba(220, 38, 38, 0.4); }
            .footer { background: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0; }
            .footer-text { color: #64748b; font-size: 0.95rem; line-height: 1.6; margin: 0; }
            .contact-info { margin-top: 16px; padding: 16px; background: #f1f5f9; border-radius: 8px; }
            .contact-info p { margin: 0; color: #475569; font-size: 0.9rem; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <img src="https://static.wixstatic.com/media/bfee2e_7d499a9b2c40442e85bb0fa99e7d5d37~mv2.png/v1/fill/w_203,h_111,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/logo1.png" alt="VERSANT Logo" class="logo" />
                <div class="header-content">
                    <h1>⏰ Test Reminder</h1>
                    <p>Your pending examination awaits</p>
                </div>
            </div>
            <div class="content">
                <div class="greeting">Hello, ${name || 'Student'}! 👋</div>
                <div class="intro-text">
                    You haven't attempted your scheduled test yet. This is a friendly reminder to complete your examination.
                </div>
                
                <div class="test-card">
                    <div class="test-title">📝 ${testName || 'Online Test'}</div>
                    <div class="test-details">
                        <div class="detail-row">
                            <span class="detail-label">Test ID:</span>
                            <span class="detail-value">${testId || 'N/A'}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">End Date:</span>
                            <span class="detail-value">${formatDate(endDateTime)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Status:</span>
                            <span class="status-badge">⚠️ Not Attempted</span>
                        </div>
                    </div>
                </div>

                <div class="urgent-notice">
                    <h3>📋 Important Reminders</h3>
                    <p><strong>Time is running out!</strong> Please complete your test before the deadline. Remember, you have only ONE attempt.</p>
                </div>

                <div class="critical-warning">
                    <h3>⚠️ Critical Instructions</h3>
                    <p><strong>DO NOT RELOAD:</strong> Any refresh or reload will automatically submit your test. Ensure you're fully prepared before starting.</p>
                </div>

                <div class="cta-container">
                    <a href="${testUrl}" class="cta">🚀 Complete Your Test Now</a>
                </div>
            </div>
            <div class="footer">
                <p class="footer-text">
                    <strong>All the best for your examination! 🎯</strong><br>
                    We believe in your success and look forward to your performance.
                </p>
                <div class="contact-info">
                    <p><strong>Need Help?</strong> If you have any queries or technical issues, please contact your instructor or administrator immediately.</p>
                </div>
                <p class="footer-text" style="margin-top: 16px;">
                    Best regards,<br>
                    <strong>The VERSANT Team</strong>
                </p>
            </div>
        </div>
    </body>
    </html>
  `;

  return {
    subject: `⏰ Reminder: Complete Your Test - ${testName || 'Online Test'} - VERSANT`,
    htmlContent: htmlContent
  };
};

// Enhanced email service with robust templates
const sendEmail = async (email, subject, content, metadata = {}) => {
  try {
    if (process.env.BREVO_API_KEY) {
      // Use Brevo API
      const axios = require('axios');
      
      // Determine if this is a test notification or reminder based on metadata
      let htmlContent = content;
      
      if (metadata.template === 'testScheduled' || metadata.template === 'testCreated') {
        // Use robust test notification template
        const fallbackEmail = createFallbackTestNotificationEmail({
          name: metadata.name || 'Student',
          testName: metadata.testName || 'Test',
          testType: metadata.testType || 'Online Test',
          testUrl: metadata.testUrl || 'https://crt.pydahsoft.in/student/exam',
          startDateTime: metadata.startDateTime,
          endDateTime: metadata.endDateTime
        });
        htmlContent = fallbackEmail.htmlContent;
        subject = fallbackEmail.subject;
      } else if (metadata.template === 'testReminder') {
        // Use robust test reminder template
        const fallbackEmail = createFallbackTestReminderEmail({
          name: metadata.name || 'Student',
          testName: metadata.testName || 'Test',
          testId: metadata.testId || 'N/A',
          testUrl: metadata.testUrl || 'https://crt.pydahsoft.in/student/exam',
          endDateTime: metadata.endDateTime
        });
        htmlContent = fallbackEmail.htmlContent;
        subject = fallbackEmail.subject;
      }
      
      const emailData = {
        sender: {
          name: process.env.SENDER_NAME || 'VERSANT System',
          email: process.env.SENDER_EMAIL || 'noreply@versant.com'
        },
        to: [{ email, name: email.split('@')[0] }],
        subject,
        htmlContent
      };

      logger.info(`📧 Sending email to ${email} with subject: ${subject}`);
      logger.info(`📧 Sender: ${emailData.sender.name} <${emailData.sender.email}>`);

      const response = await axios.post('https://api.brevo.com/v3/smtp/email', emailData, {
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json'
        }
      });

      logger.info(`✅ Email sent successfully. Response:`, response.data);
      return { success: true, messageId: response.data.messageId };
    } else {
      logger.warn('⚠️ BREVO_API_KEY not configured, email not sent');
      return { success: false, error: 'Email service not configured' };
    }
  } catch (error) {
    logger.error('❌ Email sending failed:', error.response?.data || error.message);
    if (error.response?.data) {
      logger.error('❌ Brevo API Error Details:', error.response.data);
    }
    return { success: false, error: error.response?.data?.message || error.message };
  }
};

// SMS service
const sendSMS = async (phone, message) => {
  try {
    if (process.env.BULKSMS_API_KEY) {
      // Use BulkSMS API
      const axios = require('axios');
      
      const params = {
        apikey: process.env.BULKSMS_API_KEY,
        sender: process.env.BULKSMS_SENDER_ID || 'VERSANT',
        number: phone,
        message: message
      };

      const response = await axios.get(process.env.BULKSMS_API_URL || 'https://www.bulksmsapps.com/api/apismsv2.aspx', { params });
      
      return { success: true, messageId: response.data };
    } else {
      logger.warn('⚠️ BULKSMS_API_KEY not configured, SMS not sent');
      return { success: false, error: 'SMS service not configured' };
    }
  } catch (error) {
    logger.error('❌ SMS sending failed:', error);
    return { success: false, error: error.message };
  }
};

// Push notification service (using OneSignal)
const sendPush = async (subscription, title, body, data = {}) => {
  try {
    logger.info(`🔔 Sending push notification: ${title}`);
    
    const result = await pushNotificationService.send(subscription, title, body, data);
    
    logger.info(`✅ Push notification sent successfully via ${result.provider}`);
    return { 
      success: true, 
      messageId: result.messageId,
      provider: result.provider,
      recipients: result.recipients
    };
  } catch (error) {
    logger.error('❌ Push notification sending failed:', error);
    return { success: false, error: error.message };
  }
};

// Function to get notification settings from database
const getNotificationSettings = async () => {
  try {
    const { getDatabase } = require('../config/database');
    const db = getDatabase();

    const settings = await db.collection('notification_settings').findOne({});

    if (settings) {
      logger.info(`📋 Notification settings retrieved: push=${settings.pushEnabled}, sms=${settings.smsEnabled}, mail=${settings.mailEnabled}`);
      return {
        pushEnabled: settings.pushEnabled,
        smsEnabled: settings.smsEnabled,
        mailEnabled: settings.mailEnabled
      };
    } else {
      logger.warn('⚠️ No notification settings found, using defaults');
      return {
        pushEnabled: true,
        smsEnabled: true,
        mailEnabled: true
      };
    }
  } catch (error) {
    logger.error('❌ Error getting notification settings from database:', error.message);
    logger.warn('⚠️ Using default settings due to database error');
    return {
      pushEnabled: true,
      smsEnabled: true,
      mailEnabled: true
    };
  }
};

// Main notification service
class NotificationService {
  async sendNotification(type, recipient, content, metadata = {}) {
    // Get settings first to decide whether to proceed
    const settings = await getNotificationSettings();
    let isEnabled = false;

    if (type === 'email' && settings.mailEnabled) {
      isEnabled = true;
    } else if (type === 'sms' && settings.smsEnabled) {
      isEnabled = true;
    } else if (type === 'push' && settings.pushEnabled) {
      isEnabled = true;
    }

    if (!isEnabled) {
      logger.warn(`⚠️ Notification type '${type}' is disabled in global settings. Skipping.`);
      // Optionally, you could still log the notification attempt to the database with a 'disabled' status
      return { success: true, message: `Notification type '${type}' is disabled.` };
    }

    // The original code continues from here, but the check is now at the top.
    try {
      // Create notification record
      const notification = new Notification({
        type,
        recipient,
        content,
        metadata,
        status: 'processing',
        createdAt: new Date()
      });

      await notification.save();

      let result;

      // Send based on type
      switch (type) {
        case 'email':
          result = await sendEmail(recipient, metadata.subject || 'VERSANT Notification', content, metadata);
          break;
        case 'sms':
          result = await sendSMS(recipient, content);
          break;
        case 'push':
          const subscription = typeof recipient === 'string' ? JSON.parse(recipient) : recipient;
          result = await sendPush(subscription, metadata.title || 'VERSANT Notification', content, metadata);
          break;
        default:
          throw new Error(`Unsupported notification type: ${type}`);
      }

      // Update notification status
      if (result.success) {
        await Notification.findByIdAndUpdate(notification._id, {
          status: 'sent',
          sentAt: new Date(),
          metadata: { ...metadata, messageId: result.messageId }
        });
        logger.info(`✅ ${type} notification sent successfully to ${recipient}`);
      } else {
        await Notification.findByIdAndUpdate(notification._id, {
          status: 'failed',
          error: result.error
        });
        logger.error(`❌ ${type} notification failed to ${recipient}: ${result.error}`);
      }

      return {
        success: result.success,
        notificationId: notification._id,
        message: result.success ? 'Notification sent successfully' : result.error
      };

    } catch (error) {
      logger.error(`❌ Notification service error:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async sendBatchNotifications(notifications) {
    const results = [];
    
    for (const notification of notifications) {
      const result = await this.sendNotification(
        notification.type,
        notification.recipient,
        notification.content,
        notification.metadata || {}
      );
      results.push({
        ...result,
        recipient: notification.recipient,
        type: notification.type
      });
    }

    return {
      success: true,
      total: notifications.length,
      results
    };
  }
}

module.exports = new NotificationService();

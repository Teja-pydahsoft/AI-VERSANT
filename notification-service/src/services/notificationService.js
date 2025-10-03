const { Notification } = require('../models/Notification');
const pushNotificationService = require('./pushNotificationService');
const logger = require('../utils/logger');

// Email service
const sendEmail = async (email, subject, content) => {
  try {
    if (process.env.BREVO_API_KEY) {
      // Use Brevo API
      const axios = require('axios');
      
      const emailData = {
        sender: {
          name: process.env.SENDER_NAME || 'VERSANT System',
          email: process.env.SENDER_EMAIL || 'noreply@versant.com'
        },
        to: [{ email, name: email.split('@')[0] }],
        subject,
        htmlContent: content
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

// Push notification service (using the new service with VAPID and OneSignal)
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

// Main notification service
class NotificationService {
  async sendNotification(type, recipient, content, metadata = {}) {
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
          result = await sendEmail(recipient, metadata.subject || 'VERSANT Notification', content);
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

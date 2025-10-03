const axios = require('axios');
const { Notification } = require('../models/Notification');
const logger = require('../utils/logger');

// BulkSMS service
const sendViaBulkSMS = async (smsData) => {
  const params = {
    apikey: process.env.BULKSMS_API_KEY,
    sender: process.env.BULKSMS_SENDER_ID || 'VERSANT',
    number: smsData.recipient,
    message: smsData.content
  };

  const response = await axios.get(process.env.BULKSMS_API_URL, { params });
  return response.data;
};

// Twilio SMS service
const sendViaTwilio = async (smsData) => {
  const twilio = require('twilio');
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  const message = await client.messages.create({
    body: smsData.content,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: smsData.recipient
  });

  return { messageId: message.sid };
};

module.exports = async (job) => {
  const { notificationId, recipient, content, template, metadata } = job.data;
  
  try {
    logger.info(`📱 Processing SMS notification: ${notificationId}`);

    // Update notification status to processing
    await Notification.findByIdAndUpdate(notificationId, {
      status: 'processing'
    });

    const smsData = {
      recipient,
      content: content // This would be rendered from template if needed
    };

    // Send SMS via configured provider
    let result;
    if (process.env.TWILIO_ACCOUNT_SID) {
      result = await sendViaTwilio(smsData);
    } else if (process.env.BULKSMS_API_KEY) {
      result = await sendViaBulkSMS(smsData);
    } else {
      throw new Error('No SMS provider configured');
    }

    // Update notification as sent
    await Notification.findByIdAndUpdate(notificationId, {
      status: 'sent',
      sentAt: new Date(),
      metadata: {
        ...metadata,
        messageId: result.messageId || result
      }
    });

    logger.info(`✅ SMS sent successfully: ${notificationId} to ${recipient}`);
    return result;

  } catch (error) {
    logger.error(`❌ SMS failed: ${notificationId}`, error);

    // Update notification as failed
    await Notification.findByIdAndUpdate(notificationId, {
      status: 'failed',
      error: error.message
    });

    throw error;
  }
};

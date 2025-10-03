const nodemailer = require('nodemailer');
const { Notification } = require('../models/Notification');
const logger = require('../utils/logger');

// Create email transporter
const createTransporter = () => {
  return nodemailer.createTransporter({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

// Brevo email service
const sendViaBrevo = async (emailData) => {
  const axios = require('axios');
  
  const response = await axios.post('https://api.brevo.com/v3/smtp/email', {
    sender: {
      name: process.env.BREVO_SENDER_NAME || 'VERSANT System',
      email: process.env.BREVO_SENDER_EMAIL
    },
    to: [{ email: emailData.recipient }],
    subject: emailData.subject,
    htmlContent: emailData.content
  }, {
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json'
    }
  });

  return response.data;
};

module.exports = async (job) => {
  const { notificationId, recipient, content, template, metadata } = job.data;
  
  try {
    logger.info(`📧 Processing email notification: ${notificationId}`);

    // Update notification status to processing
    await Notification.findByIdAndUpdate(notificationId, {
      status: 'processing'
    });

    let emailData;
    
    if (template) {
      // Use template system (implement template rendering here)
      emailData = {
        recipient,
        subject: metadata.subject || 'Notification from VERSANT',
        content: content // This would be rendered from template
      };
    } else {
      // Direct content
      emailData = {
        recipient,
        subject: metadata.subject || 'Notification from VERSANT',
        content: content
      };
    }

    // Send email via Brevo (preferred) or SMTP
    let result;
    if (process.env.BREVO_API_KEY) {
      result = await sendViaBrevo(emailData);
    } else {
      const transporter = createTransporter();
      result = await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: recipient,
        subject: emailData.subject,
        html: emailData.content
      });
    }

    // Update notification as sent
    await Notification.findByIdAndUpdate(notificationId, {
      status: 'sent',
      sentAt: new Date(),
      metadata: {
        ...metadata,
        messageId: result.messageId || result.id
      }
    });

    logger.info(`✅ Email sent successfully: ${notificationId} to ${recipient}`);
    return result;

  } catch (error) {
    logger.error(`❌ Email failed: ${notificationId}`, error);

    // Update notification as failed
    await Notification.findByIdAndUpdate(notificationId, {
      status: 'failed',
      error: error.message
    });

    throw error;
  }
};

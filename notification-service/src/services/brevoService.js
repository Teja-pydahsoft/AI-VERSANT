const axios = require('axios');
const logger = require('../utils/logger');
const { getNotificationSettings } = require('./notificationService');

/**
 * Brevo Email Service
 * Handles email sending using Brevo API (same as backend)
 */
class BrevoService {
  constructor() {
    this.apiKey = process.env.BREVO_API_KEY;
    this.senderEmail = process.env.SENDER_EMAIL;
    this.senderName = process.env.SENDER_NAME || 'VERSANT System';
    this.apiUrl = 'https://api.brevo.com/v3/smtp/email';
    this.isConfigured = this.checkConfiguration();
  }

  checkConfiguration() {
    if (!this.apiKey) {
      logger.warn('⚠️ BREVO_API_KEY not configured');
      return false;
    }
    if (!this.senderEmail) {
      logger.warn('⚠️ SENDER_EMAIL not configured');
      return false;
    }
    logger.info('✅ Brevo email service configured');
    return true;
  }

  /**
   * Send email using Brevo API
   */
  async sendEmail({ to, subject, htmlContent, textContent = null }) {
    // Get settings first to decide whether to proceed
    const settings = await getNotificationSettings();
    if (!settings.mailEnabled) {
      logger.warn(`⚠️ Email notifications are disabled in global settings. Skipping email to ${to.email || to}.`);
      // Return a success-like response to prevent breaking the calling function
      return { success: true, message: 'Email notifications disabled', messageId: 'disabled-by-settings' };
    }

    if (!this.isConfigured) {
      throw new Error('Brevo email service not configured');
    }

    try {
      const payload = {
        sender: {
          name: this.senderName,
          email: this.senderEmail
        },
        to: [
          {
            email: to.email || to,
            name: to.name || ''
          }
        ],
        subject: subject,
        htmlContent: htmlContent
      };

      if (textContent) {
        payload.textContent = textContent;
      }

      logger.info(`📧 Sending email to: ${to.email || to}`);
      logger.info(`📧 Subject: ${subject}`);

      const response = await axios.post(this.apiUrl, payload, {
        headers: {
          'api-key': this.apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      logger.info(`✅ Email sent successfully to ${to.email || to}. MessageId: ${response.data.messageId}`);

      return {
        success: true,
        messageId: response.data.messageId,
        provider: 'Brevo'
      };
    } catch (error) {
      logger.error('❌ Brevo email error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Send student credentials email
   */
  async sendStudentCredentials({ email, name, username, password, loginUrl = 'https://crt.pydahsoft.in/login' }) {
    const subject = 'Welcome to VERSANT - Your Student Credentials';
    
    const htmlContent = `
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">
                Welcome to VERSANT - Your Student Credentials
            </h2>
            
            <p>Dear ${name},</p>
            
            <p>Your account has been created successfully. Here are your login credentials:</p>
            
            <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #3498db; margin: 20px 0;">
                <h3 style="margin: 0 0 10px 0; color: #2c3e50;">Login Credentials</h3>
                <p><strong>Username:</strong> ${username}</p>
                <p><strong>Password:</strong> ${password}</p>
                <p><strong>Email:</strong> ${email}</p>
            </div>
            
            <p>Please log in to your account using the link below:</p>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="${loginUrl}" 
                   style="background-color: #3498db; color: white; padding: 12px 24px; 
                          text-decoration: none; border-radius: 5px; display: inline-block;">
                    Login to VERSANT
                </a>
            </div>
            
            <p>If you have any questions, please contact your instructor.</p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="font-size: 12px; color: #666;">
                This is an automated message from Study Edge Apex. Please do not reply to this email.
            </p>
        </div>
    </body>
    </html>
    `;

    return this.sendEmail({
      to: { email, name },
      subject,
      htmlContent
    });
  }

  /**
   * Send test notification email
   */
  async sendTestNotification({ email, name, testName, testType, loginUrl = 'https://crt.pydahsoft.in/login' }) {
    const subject = `New Test Assigned: ${testName}`;
    
    const htmlContent = `
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">
                New Test Assignment
            </h2>
            
            <p>Dear ${name},</p>
            
            <p>A new test has been assigned to you:</p>
            
            <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #3498db; margin: 20px 0;">
                <h3 style="margin: 0 0 10px 0; color: #2c3e50;">Test Details</h3>
                <p><strong>Test Name:</strong> ${testName}</p>
                <p><strong>Test Type:</strong> ${testType}</p>
            </div>
            
            <p>Please log in to your account to attempt the test:</p>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="${loginUrl}" 
                   style="background-color: #3498db; color: white; padding: 12px 24px; 
                          text-decoration: none; border-radius: 5px; display: inline-block;">
                    Attempt Test Now
                </a>
            </div>
            
            <p>If you have any questions, please contact your instructor.</p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="font-size: 12px; color: #666;">
                This is an automated message from Study Edge Apex. Please do not reply to this email.
            </p>
        </div>
    </body>
    </html>
    `;

    return this.sendEmail({
      to: { email, name },
      subject,
      htmlContent
    });
  }

  /**
   * Send test reminder email
   */
  async sendTestReminder({ email, name, testName, testId, loginUrl = 'https://crt.pydahsoft.in/student/exam' }) {
    const subject = `Reminder: Complete Your Test - ${testName}`;
    
    const examUrl = `${loginUrl}/${testId}`;
    
    const htmlContent = `
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #e74c3c; border-bottom: 2px solid #e74c3c; padding-bottom: 10px;">
                Test Reminder
            </h2>
            
            <p>Dear ${name},</p>
            
            <p>You haven't attempted your scheduled test yet:</p>
            
            <div style="background-color: #fff3cd; padding: 15px; border-left: 4px solid #e74c3c; margin: 20px 0;">
                <h3 style="margin: 0 0 10px 0; color: #856404;">⚠️ Pending Test</h3>
                <p><strong>Test Name:</strong> ${testName}</p>
                <p style="color: #856404;"><strong>Status:</strong> Not Attempted</p>
            </div>
            
            <p>Please complete it as soon as possible:</p>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="${examUrl}" 
                   style="background-color: #e74c3c; color: white; padding: 12px 24px; 
                          text-decoration: none; border-radius: 5px; display: inline-block;">
                    Attempt Test Now
                </a>
            </div>
            
            <p>If you have any questions, please contact your instructor.</p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="font-size: 12px; color: #666;">
                This is an automated message from Study Edge Apex. Please do not reply to this email.
            </p>
        </div>
    </body>
    </html>
    `;

    return this.sendEmail({
      to: { email, name },
      subject,
      htmlContent
    });
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      configured: this.isConfigured,
      provider: 'Brevo',
      apiKeySet: !!this.apiKey,
      senderEmailSet: !!this.senderEmail,
      senderName: this.senderName
    };
  }
}

module.exports = new BrevoService();

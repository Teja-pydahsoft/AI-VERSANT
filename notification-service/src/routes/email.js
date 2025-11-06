const express = require('express');
const { body, validationResult } = require('express-validator');
const brevoService = require('../services/brevoService');
const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

const router = express.Router();

// Validation middleware
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

/**
 * Finds and renders a template from an HTML file.
 * @param {string} templateName - The name of the template file (e.g., 'student-credentials.html').
 * @param {object} variables - The variables to inject into the template.
 * @returns {Promise<{subject: string, htmlContent: string}>}
 */
const renderTemplateFromFile = async (templateName, variables) => {
  const templatePath = path.join(__dirname, '..', 'templates', templateName);
  try {
    let fileContent = await fs.readFile(templatePath, 'utf-8');

    // Extract subject from a comment like <!-- subject: Your Subject Line {{variable}} -->
    const subjectMatch = fileContent.match(/<!--\s*subject:\s*(.+?)\s*-->/);
    let subject = 'Welcome to VERSANT - Your Credentials'; // Default subject
    if (subjectMatch && subjectMatch[1]) {
      subject = subjectMatch[1];
    }

    let renderedContent = fileContent;
    let renderedSubject = subject;

    // Handle both direct variables and params.variable format
    const allVariables = { ...variables };
    if (variables.params) {
      Object.assign(allVariables, variables.params);
    }

    // Replace all placeholders like {{variable}} and {{params.variable}}
    Object.keys(allVariables).forEach(key => {
      const value = allVariables[key] || '';
      const directRegex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      const paramsRegex = new RegExp(`\\{\\{params\\.${key}\\}\\}`, 'g');
      renderedContent = renderedContent.replace(directRegex, value);
      renderedContent = renderedContent.replace(paramsRegex, value);
      renderedSubject = renderedSubject.replace(directRegex, value);
      renderedSubject = renderedSubject.replace(paramsRegex, value);
    });

    // Check if any placeholders are left un-rendered
    const unrenderedMatches = renderedContent.match(/\{\{[^}]+\}\}/g);
    if (unrenderedMatches) {
      logger.warn(`⚠️ Template "${templateName}" has un-rendered variables: ${unrenderedMatches.join(', ')}`);
      logger.warn(`Available variables: ${Object.keys(allVariables).join(', ')}`);
    }

    return { subject: renderedSubject, htmlContent: renderedContent };

  } catch (error) {
    logger.error(`❌ Template file not found or could not be read: ${templatePath}`, error);
    // Robust fallback with proper HTML styling
    return createFallbackCredentialsEmail(variables);
  }
};

// Robust fallback HTML content for all email types
const createFallbackCredentialsEmail = (variables) => {
  const { name, username, password, email, loginUrl = 'https://crt.pydahsoft.in/login' } = variables.params || variables;
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Welcome to VERSANT</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; background: #f7fafc; margin: 0; padding: 0; }
            .container { max-width: 480px; margin: 32px auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 12px #0001; overflow: hidden; }
            .header { background: #1e293b; color: #fff; padding: 24px 0 16px 0; text-align: center; }
            .logo { max-width: 120px; margin-bottom: 8px; }
            .content { padding: 24px; }
            h2 { color: #1e293b; margin-top: 0; }
            .credentials-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            .credentials-table th, .credentials-table td { padding: 10px 12px; border: 1px solid #e2e8f0; text-align: left; }
            .credentials-table th { background: #f1f5f9; color: #334155; }
            .cta { display: inline-block; background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 18px; }
            .footer { color: #64748b; font-size: 13px; text-align: center; padding: 16px 0 8px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <img src="https://static.wixstatic.com/media/bfee2e_7d499a9b2c40442e85bb0fa99e7d5d37~mv2.png/v1/fill/w_203,h_111,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/logo1.png" alt="VERSANT Logo" class="logo" />
                <div style="font-size: 1.5rem; font-weight: bold; letter-spacing: 1px;">Welcome to VERSANT</div>
            </div>
            <div class="content">
                <h2>Hello, ${name || 'User'}!</h2>
                <p>You have been enrolled in the <b>VERSANT</b> system.</p>
                <p>Please use the following credentials to log in:</p>
                <table class="credentials-table">
                    <tr><th>Username</th><td>${username || 'N/A'}</td></tr>
                    <tr><th>Email</th><td>${email || 'N/A'}</td></tr>
                    <tr><th>Password</th><td>${password || 'N/A'}</td></tr>
                </table>
                <a href="${loginUrl}" class="cta">Log in to VERSANT</a>
            </div>
            <div class="footer">
                Thank you,<br />The VERSANT Team
            </div>
        </div>
    </body>
    </html>
  `;

  return {
    subject: 'Welcome to VERSANT - Your Credentials',
    htmlContent: htmlContent
  };
};

const createFallbackTestNotificationEmail = (variables) => {
  const { name, testName, testType, testUrl = 'https://crt.pydahsoft.in/student/exam' } = variables.params || variables;
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>New Test Scheduled - VERSANT</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; background: #f7fafc; margin: 0; padding: 0; }
            .container { max-width: 480px; margin: 32px auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 12px #0001; overflow: hidden; }
            .header { background: #1e293b; color: #fff; padding: 24px 0 16px 0; text-align: center; }
            .logo { max-width: 120px; margin-bottom: 8px; }
            .content { padding: 24px; }
            h2 { color: #1e293b; margin-top: 0; }
            .test-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            .test-table th, .test-table td { padding: 10px 12px; border: 1px solid #e2e8f0; text-align: left; }
            .test-table th { background: #f1f5f9; color: #334155; }
            .cta { display: inline-block; background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 18px; }
            .footer { color: #64748b; font-size: 13px; text-align: center; padding: 16px 0 8px 0; }
            .important { background-color: #fffbeb; border-left: 4px solid #facc15; color: #713f12; padding: 12px 16px; margin: 20px 0; border-radius: 4px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <img src="https://static.wixstatic.com/media/bfee2e_7d499a9b2c40442e85bb0fa99e7d5d37~mv2.png/v1/fill/w_203,h_111,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/logo1.png" alt="VERSANT Logo" class="logo" />
                <div style="font-size: 1.5rem; font-weight: bold; letter-spacing: 1px;">New Test Scheduled</div>
            </div>
            <div class="content">
                <h2>Hello, ${name || 'Student'}!</h2>
                <p>A new test has been scheduled for you in the <b>VERSANT</b> system.</p>
                <p>Please see the details below:</p>
                <table class="test-table">
                    <tr><th>Test Name</th><td>${testName || 'N/A'}</td></tr>
                    <tr><th>Test Type</th><td>${testType || 'N/A'}</td></tr>
                    <tr><th>Status</th><td>Ready to attempt</td></tr>
                </table>
                <div class="important">
                    <strong>Important:</strong> Please ensure you have a stable internet connection. The test is available for 24 hours from the start date.
                </div>
                <p>To begin the test, please click the button below:</p>
                <a href="${testUrl}" class="cta">Attempt Test Now</a>
            </div>
            <div class="footer">
                If you have any questions, please contact your administrator.<br />
                Good luck!<br />The VERSANT Team
            </div>
        </div>
    </body>
    </html>
  `;

  return {
    subject: `New Test Assigned: ${testName || 'Test'}`,
    htmlContent: htmlContent
  };
};

const createFallbackTestReminderEmail = (variables) => {
  const { name, testName, testId, testUrl = 'https://crt.pydahsoft.in/student/exam' } = variables.params || variables;
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Test Reminder - VERSANT</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; background: #f7fafc; margin: 0; padding: 0; }
            .container { max-width: 480px; margin: 32px auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 12px #0001; overflow: hidden; }
            .header { background: #e74c3c; color: #fff; padding: 24px 0 16px 0; text-align: center; }
            .logo { max-width: 120px; margin-bottom: 8px; }
            .content { padding: 24px; }
            h2 { color: #e74c3c; margin-top: 0; }
            .reminder-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            .reminder-table th, .reminder-table td { padding: 10px 12px; border: 1px solid #e2e8f0; text-align: left; }
            .reminder-table th { background: #f1f5f9; color: #334155; }
            .cta { display: inline-block; background: #e74c3c; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 18px; }
            .footer { color: #64748b; font-size: 13px; text-align: center; padding: 16px 0 8px 0; }
            .urgent { background-color: #fff3cd; border-left: 4px solid #e74c3c; color: #856404; padding: 12px 16px; margin: 20px 0; border-radius: 4px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <img src="https://static.wixstatic.com/media/bfee2e_7d499a9b2c40442e85bb0fa99e7d5d37~mv2.png/v1/fill/w_203,h_111,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/logo1.png" alt="VERSANT Logo" class="logo" />
                <div style="font-size: 1.5rem; font-weight: bold; letter-spacing: 1px;">Test Reminder</div>
            </div>
            <div class="content">
                <h2>Hello, ${name || 'Student'}!</h2>
                <p>You haven't attempted your scheduled test yet:</p>
                <table class="reminder-table">
                    <tr><th>Test Name</th><td>${testName || 'N/A'}</td></tr>
                    <tr><th>Test ID</th><td>${testId || 'N/A'}</td></tr>
                    <tr><th>Status</th><td style="color: #e74c3c;">Not Attempted</td></tr>
                </table>
                <div class="urgent">
                    <strong>⚠️ Pending Test:</strong> Please complete it as soon as possible.
                </div>
                <p>To begin the test, please click the button below:</p>
                <a href="${testUrl}" class="cta">Attempt Test Now</a>
            </div>
            <div class="footer">
                If you have any questions, please contact your instructor.<br />
                The VERSANT Team
            </div>
        </div>
    </body>
    </html>
  `;

  return {
    subject: `Reminder: Complete Your Test - ${testName || 'Test'}`,
    htmlContent: htmlContent
  };
};

const createFallbackCustomEmail = (variables) => {
  const { subject, htmlContent } = variables.params || variables;
  
  return {
    subject: subject || 'Notification from VERSANT',
    htmlContent: htmlContent || '<p>This is a notification from VERSANT.</p>'
  };
};
/**
 * Send student credentials email (single)
 */
router.post('/send-credentials', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('name').notEmpty().withMessage('Name is required'),
  body('username').notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required'),
  body('loginUrl').optional().isString()
], validateRequest, async (req, res) => {
  try {
    const { email, name, username, password, loginUrl } = req.body;

    logger.info(`📧 Sending credentials email to: ${email}`);

    // Send immediately in background (don't wait)
    setImmediate(async () => {
      try {
        // Use robust fallback HTML content directly
        const fallbackEmail = createFallbackCredentialsEmail({
          name, 
          username, 
          password, 
          email,
          loginUrl: loginUrl || 'https://crt.pydahsoft.in/login'
        });

        await brevoService.sendEmail({
          to: { email, name },
          subject: fallbackEmail.subject,
          htmlContent: fallbackEmail.htmlContent
        });

        logger.info(`✅ Successfully sent credentials email to ${email} using fallback template.`);
      } catch (error) {
        logger.error(`❌ Failed to send credentials email to ${email}:`, error.message);
      }
    });

    // Respond immediately
    res.json({
      success: true,
      message: 'Email queued for sending'
    });

  } catch (error) {
    logger.error('❌ Error queueing credentials email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to queue email',
      error: error.message
    });
  }
});

/**
 * Send student credentials emails (batch)
 */
router.post('/send-credentials-batch', [
  body('students').isArray().withMessage('Students array is required'),
  body('students.*.email').optional().isEmail().withMessage('Valid email is required'),
  body('students.*.name').notEmpty().withMessage('Name is required'),
  body('students.*.username').notEmpty().withMessage('Username is required'),
  body('students.*.password').notEmpty().withMessage('Password is required')
], validateRequest, async (req, res) => {
  try {
    const { students } = req.body;
    const loginUrl = req.body.loginUrl || 'https://crt.pydahsoft.in/login';

    logger.info(`📧 Sending credentials emails to ${students.length} students`);

    // Respond immediately
    res.json({
      success: true,
      message: `${students.length} emails queued for sending`
    });

    // Process in background
    setImmediate(async () => {
      let sent = 0;
      let failed = 0;

      for (const student of students) {
        try {
          if (student.email) {
            const rendered = await renderTemplateFromFile('student_credentials.html', {
              params: { ...student, login_url: loginUrl }
            });

            await brevoService.sendEmail({
              to: { email: student.email, name: student.name },
              subject: rendered.subject,
              htmlContent: rendered.htmlContent
            });

            sent++;
            logger.info(`✅ Credentials email sent to ${student.email} via batch.`);
          }
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          failed++;
          logger.error(`❌ Failed to send email to ${student.email}:`, error.message);
        }
      }

      logger.info(`📧 Batch complete: ${sent} sent, ${failed} failed`);
    });

  } catch (error) {
    logger.error('❌ Error queueing batch credentials emails:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to queue emails',
      error: error.message
    });
  }
});

/**
 * Send test notification email
 */
router.post('/send-test-notification', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('name').notEmpty().withMessage('Name is required'),
  body('testName').notEmpty().withMessage('Test name is required'),
  body('testId').optional().isString().withMessage('Test ID is optional but should be a string'),
  body('objectId').optional().isString().withMessage('Object ID is optional but should be a string'),
  body('startDate').optional().isString().withMessage('Start date is optional but should be a string')
], validateRequest, async (req, res) => {
  try {
    const { email, name, testName, testId, objectId, startDate } = req.body;

    logger.info(`📧 Sending test notification email to: ${email}`);

    // Send immediately in background (don't wait)
    setImmediate(async () => {
      try {
        // Construct the test URL using objectId if available, otherwise fall back.
        const testUrl = `https://crt.pydahsoft.in/student/exam/${objectId || testId || ''}`;
        
        // Use robust fallback HTML content directly
        const fallbackEmail = createFallbackTestNotificationEmail({
          name, 
          testName, 
          testType: 'Online Test',
          testUrl
        });

        await brevoService.sendEmail({
          to: { email, name },
          subject: fallbackEmail.subject,
          htmlContent: fallbackEmail.htmlContent
        });

        logger.info(`✅ Successfully sent test notification to ${email} using fallback template.`);
      } catch (error) {
        logger.error(`❌ Failed to send test notification email to ${email}:`, error.message);
      }
    });

    // Respond immediately
    res.json({
      success: true,
      message: 'Email queued for sending'
    });

  } catch (error) {
    logger.error('❌ Error queueing test notification email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to queue email',
      error: error.message
    });
  }
});

/**
 * Send test reminder email
 */
router.post('/send-test-reminder', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('name').notEmpty().withMessage('Name is required'),
  body('testName').notEmpty().withMessage('Test name is required'),
  body('testId').optional().isString().withMessage('Test ID is optional but should be a string'),
  body('objectId').optional().isString().withMessage('Object ID is optional but should be a string')
], validateRequest, async (req, res) => {
  try {
    const { email, name, testName, testId, objectId } = req.body;

    logger.info(`📧 Sending test reminder email to: ${email}`);

    // Send immediately in background (don't wait)
    setImmediate(async () => {
      try {
        const testUrl = `https://crt.pydahsoft.in/student/exam/${objectId || testId || ''}`;
        
        // Use robust fallback HTML content directly
        const fallbackEmail = createFallbackTestReminderEmail({
          name, 
          testName, 
          testId,
          testUrl
        });

        await brevoService.sendEmail({
          to: { email, name },
          subject: fallbackEmail.subject,
          htmlContent: fallbackEmail.htmlContent
        });

        logger.info(`✅ Successfully sent test reminder to ${email} using fallback template.`);
      } catch (error) {
        logger.error(`❌ Failed to send test reminder email to ${email}:`, error.message);
      }
    });

    // Respond immediately
    res.json({
      success: true,
      message: 'Email queued for sending'
    });

  } catch (error) {
    logger.error('❌ Error queueing test reminder email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to queue email',
      error: error.message
    });
  }
});

/**
 * Send custom email
 */
router.post('/send-custom', [
  body('to').isEmail().withMessage('Valid email is required'),
  body('subject').notEmpty().withMessage('Subject is required'),
  body('htmlContent').notEmpty().withMessage('HTML content is required'),
  body('name').optional().isString()
], validateRequest, async (req, res) => {
  try {
    const { to, subject, htmlContent, name, textContent } = req.body;

    logger.info(`📧 Sending custom email to: ${to}`);

    // Send immediately in background (don't wait)
    setImmediate(async () => {
      try {
        await brevoService.sendEmail({
          to: { email: to, name: name || '' },
          subject,
          htmlContent,
          textContent
        });
      } catch (error) {
        logger.error(`❌ Failed to send custom email to ${to}:`, error.message);
      }
    });

    // Respond immediately
    res.json({
      success: true,
      message: 'Email queued for sending'
    });

  } catch (error) {
    logger.error('❌ Error queueing custom email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to queue email',
      error: error.message
    });
  }
});

/**
 * Batch send emails (for bulk operations)
 */
router.post('/send-batch', [
  body('emails').isArray({ min: 1 }).withMessage('Emails array is required'),
  body('emails.*.email').isEmail().withMessage('Valid email is required'),
  body('emails.*.name').notEmpty().withMessage('Name is required'),
  body('type').isIn(['credentials', 'test_notification', 'test_reminder']).withMessage('Valid type is required')
], validateRequest, async (req, res) => {
  try {
    const { emails, type, data } = req.body;

    logger.info(`📧 Batch sending ${emails.length} emails of type: ${type}`);

    // Process batch in background (don't wait)
    setImmediate(async () => {
      for (const emailData of emails) {
        let templateFileName = '';
        let variables = {};

        try {
          switch (type) {
            case 'credentials':
              templateFileName = 'student_credentials.html';
              variables = {
                params: {
                  name: emailData.name,
                  username: emailData.username || data?.username,
                  password: emailData.password || data?.password,
                  login_url: data?.loginUrl || 'https://crt.pydahsoft.in/login'
                }
              };
              break;

            case 'test_notification':
              templateFileName = 'test_notification.html';
              const testUrlNotification = `https://crt.pydahsoft.in/student/exam/${data?.objectId || data?.testId || ''}`;
              variables = {
                params: {
                  name: emailData.name,
                  test_name: data?.testName || data?.name,
                  test_id: data?.testId,
                  object_id: data?.objectId,
                  start_date: data?.startDate,
                  test_url: testUrlNotification
                }
              };
              break;

            case 'test_reminder':
              templateFileName = 'test_notification.html';
              const testUrlReminder = `https://crt.pydahsoft.in/student/exam/${data?.objectId || data?.testId || ''}`;
              variables = {
                params: {
                  name: emailData.name,
                  test_name: data?.testName || data?.name,
                  test_id: data?.testId,
                  object_id: data?.objectId,
                  test_url: testUrlReminder
                }
              };
              break;
          }

          const rendered = await renderTemplateFromFile(templateFileName, variables);

          await brevoService.sendEmail({
            to: { email: emailData.email, name: emailData.name },
            subject: rendered.subject,
            htmlContent: rendered.htmlContent
          });
          
          // Small delay between emails to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          logger.error(`❌ Failed to send email to ${emailData.email}:`, error.message);
        }
      }
      logger.info(`✅ Batch email processing completed for ${emails.length} emails`);
    });

    // Respond immediately
    res.json({
      success: true,
      message: `Batch of ${emails.length} emails queued for sending`
    });

  } catch (error) {
    logger.error('❌ Error queueing batch emails:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to queue batch emails',
      error: error.message
    });
  }
});

/**
 * Get email service status
 */
router.get('/status', (req, res) => {
  try {
    const status = brevoService.getStatus();
    res.json({
      success: true,
      status
    });
  } catch (error) {
    logger.error('❌ Error getting email service status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get status',
      error: error.message
    });
  }
});

module.exports = router;

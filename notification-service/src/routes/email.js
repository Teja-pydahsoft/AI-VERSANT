const express = require('express');
const { body, validationResult } = require('express-validator');
const brevoService = require('../services/brevoService');
const logger = require('../utils/logger');

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
        await brevoService.sendStudentCredentials({
          email,
          name,
          username,
          password,
          loginUrl
        });
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
            await brevoService.sendStudentCredentials({
              email: student.email,
              name: student.name,
              username: student.username,
              password: student.password,
              loginUrl
            });
            sent++;
            logger.info(`✅ Email sent to ${student.email}`);
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
  body('testType').notEmpty().withMessage('Test type is required'),
  body('loginUrl').optional().isString()
], validateRequest, async (req, res) => {
  try {
    const { email, name, testName, testType, loginUrl } = req.body;

    logger.info(`📧 Sending test notification email to: ${email}`);

    // Send immediately in background (don't wait)
    setImmediate(async () => {
      try {
        await brevoService.sendTestNotification({
          email,
          name,
          testName,
          testType,
          loginUrl
        });
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
  body('testId').notEmpty().withMessage('Test ID is required'),
  body('loginUrl').optional().isString()
], validateRequest, async (req, res) => {
  try {
    const { email, name, testName, testId, loginUrl } = req.body;

    logger.info(`📧 Sending test reminder email to: ${email}`);

    // Send immediately in background (don't wait)
    setImmediate(async () => {
      try {
        await brevoService.sendTestReminder({
          email,
          name,
          testName,
          testId,
          loginUrl
        });
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
        try {
          switch (type) {
            case 'credentials':
              await brevoService.sendStudentCredentials({
                email: emailData.email,
                name: emailData.name,
                username: emailData.username || data.username,
                password: emailData.password || data.password,
                loginUrl: data.loginUrl
              });
              break;
            
            case 'test_notification':
              await brevoService.sendTestNotification({
                email: emailData.email,
                name: emailData.name,
                testName: data.testName,
                testType: data.testType,
                loginUrl: data.loginUrl
              });
              break;
            
            case 'test_reminder':
              await brevoService.sendTestReminder({
                email: emailData.email,
                name: emailData.name,
                testName: data.testName,
                testId: data.testId,
                loginUrl: data.loginUrl
              });
              break;
          }
          
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

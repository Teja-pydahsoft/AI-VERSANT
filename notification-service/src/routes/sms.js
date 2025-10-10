const express = require('express');
const { body, validationResult } = require('express-validator');
const bulkSmsService = require('../services/bulkSmsService');
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
 * Send student credentials SMS (single)
 */
router.post('/send-credentials', [
  body('phone').notEmpty().withMessage('Phone number is required'),
  body('username').notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required')
], validateRequest, async (req, res) => {
  try {
    const { phone, username, password } = req.body;

    logger.info(`📱 Sending credentials SMS to: ${phone}`);

    // Send immediately in background (don't wait)
    setImmediate(async () => {
      try {
        await bulkSmsService.sendStudentCredentials({
          phone,
          username,
          password
        });
      } catch (error) {
        logger.error(`❌ Failed to send credentials SMS to ${phone}:`, error.message);
      }
    });

    // Respond immediately
    res.json({
      success: true,
      message: 'SMS queued for sending'
    });

  } catch (error) {
    logger.error('❌ Error queueing credentials SMS:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to queue SMS',
      error: error.message
    });
  }
});

/**
 * Send student credentials SMS (batch)
 */
router.post('/send-credentials-batch', [
  body('students').isArray().withMessage('Students array is required'),
  body('students.*.mobile_number').optional().notEmpty().withMessage('Phone number is required'),
  body('students.*.username').notEmpty().withMessage('Username is required'),
  body('students.*.password').notEmpty().withMessage('Password is required')
], validateRequest, async (req, res) => {
  try {
    const { students } = req.body;

    logger.info(`📱 Sending credentials SMS to ${students.length} students`);

    // Respond immediately
    res.json({
      success: true,
      message: `${students.length} SMS queued for sending`
    });

    // Process in background
    setImmediate(async () => {
      let sent = 0;
      let failed = 0;

      for (const student of students) {
        try {
          if (student.mobile_number) {
            await bulkSmsService.sendStudentCredentials({
              phone: student.mobile_number,
              username: student.username,
              password: student.password
            });
            sent++;
            logger.info(`✅ SMS sent to ${student.mobile_number}`);
          }
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 150));
        } catch (error) {
          failed++;
          logger.error(`❌ Failed to send SMS to ${student.mobile_number}:`, error.message);
        }
      }

      logger.info(`📱 Batch complete: ${sent} sent, ${failed} failed`);
    });

  } catch (error) {
    logger.error('❌ Error queueing batch credentials SMS:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to queue SMS',
      error: error.message
    });
  }
});

/**
 * Send test scheduled SMS
 */
router.post('/send-test-scheduled', [
  body('phone').notEmpty().withMessage('Phone number is required'),
  body('testName').notEmpty().withMessage('Test name is required'),
  body('startTime').notEmpty().withMessage('Start time is required'),
  body('testId').notEmpty().withMessage('Test ID is required')
], validateRequest, async (req, res) => {
  try {
    const { phone, testName, startTime, testId } = req.body;

    logger.info(`📱 Sending test scheduled SMS to: ${phone}`);

    // Send immediately in background (don't wait)
    setImmediate(async () => {
      try {
        await bulkSmsService.sendTestScheduled({
          phone,
          testName,
          startTime,
          testId
        });
      } catch (error) {
        logger.error(`❌ Failed to send test scheduled SMS to ${phone}:`, error.message);
      }
    });

    // Respond immediately
    res.json({
      success: true,
      message: 'SMS queued for sending'
    });

  } catch (error) {
    logger.error('❌ Error queueing test scheduled SMS:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to queue SMS',
      error: error.message
    });
  }
});

/**
 * Send test reminder SMS
 */
router.post('/send-test-reminder', [
  body('phone').notEmpty().withMessage('Phone number is required'),
  body('testName').notEmpty().withMessage('Test name is required'),
  body('testId').notEmpty().withMessage('Test ID is required')
], validateRequest, async (req, res) => {
  try {
    const { phone, testName, testId } = req.body;

    logger.info(`📱 Sending test reminder SMS to: ${phone}`);

    // Send immediately in background (don't wait)
    setImmediate(async () => {
      try {
        await bulkSmsService.sendTestReminder({
          phone,
          testName,
          testId
        });
      } catch (error) {
        logger.error(`❌ Failed to send test reminder SMS to ${phone}:`, error.message);
      }
    });

    // Respond immediately
    res.json({
      success: true,
      message: 'SMS queued for sending'
    });

  } catch (error) {
    logger.error('❌ Error queueing test reminder SMS:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to queue SMS',
      error: error.message
    });
  }
});

/**
 * Send result notification SMS
 */
router.post('/send-result', [
  body('phone').notEmpty().withMessage('Phone number is required'),
  body('studentName').notEmpty().withMessage('Student name is required'),
  body('testName').notEmpty().withMessage('Test name is required'),
  body('score').isNumeric().withMessage('Score must be a number')
], validateRequest, async (req, res) => {
  try {
    const { phone, studentName, testName, score } = req.body;

    logger.info(`📱 Sending result SMS to: ${phone}`);

    // Send immediately in background (don't wait)
    setImmediate(async () => {
      try {
        await bulkSmsService.sendResultNotification({
          phone,
          studentName,
          testName,
          score
        });
      } catch (error) {
        logger.error(`❌ Failed to send result SMS to ${phone}:`, error.message);
      }
    });

    // Respond immediately
    res.json({
      success: true,
      message: 'SMS queued for sending'
    });

  } catch (error) {
    logger.error('❌ Error queueing result SMS:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to queue SMS',
      error: error.message
    });
  }
});

/**
 * Send custom SMS
 */
router.post('/send-custom', [
  body('phone').notEmpty().withMessage('Phone number is required'),
  body('message').notEmpty().withMessage('Message is required'),
  body('isUnicode').optional().isBoolean()
], validateRequest, async (req, res) => {
  try {
    const { phone, message, isUnicode = false } = req.body;

    logger.info(`📱 Sending custom SMS to: ${phone}`);

    // Send immediately in background (don't wait)
    setImmediate(async () => {
      try {
        await bulkSmsService.sendCustomSms({
          phone,
          message,
          isUnicode
        });
      } catch (error) {
        logger.error(`❌ Failed to send custom SMS to ${phone}:`, error.message);
      }
    });

    // Respond immediately
    res.json({
      success: true,
      message: 'SMS queued for sending'
    });

  } catch (error) {
    logger.error('❌ Error queueing custom SMS:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to queue SMS',
      error: error.message
    });
  }
});

/**
 * Batch send SMS (for bulk operations)
 */
router.post('/send-batch', [
  body('messages').isArray({ min: 1 }).withMessage('Messages array is required'),
  body('messages.*.phone').notEmpty().withMessage('Phone number is required'),
  body('type').isIn(['credentials', 'test_scheduled', 'test_reminder', 'result']).withMessage('Valid type is required')
], validateRequest, async (req, res) => {
  try {
    const { messages, type, data } = req.body;

    logger.info(`📱 Batch sending ${messages.length} SMS of type: ${type}`);

    // Process batch in background (don't wait)
    setImmediate(async () => {
      for (const smsData of messages) {
        try {
          switch (type) {
            case 'credentials':
              await bulkSmsService.sendStudentCredentials({
                phone: smsData.phone,
                username: smsData.username || data.username,
                password: smsData.password || data.password
              });
              break;
            
            case 'test_scheduled':
              await bulkSmsService.sendTestScheduled({
                phone: smsData.phone,
                testName: data.testName,
                startTime: data.startTime,
                testId: data.testId
              });
              break;
            
            case 'test_reminder':
              await bulkSmsService.sendTestReminder({
                phone: smsData.phone,
                testName: data.testName,
                testId: data.testId
              });
              break;
            
            case 'result':
              await bulkSmsService.sendResultNotification({
                phone: smsData.phone,
                studentName: smsData.studentName || data.studentName,
                testName: data.testName,
                score: smsData.score || data.score
              });
              break;
          }
          
          // Small delay between SMS to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          logger.error(`❌ Failed to send SMS to ${smsData.phone}:`, error.message);
        }
      }
      logger.info(`✅ Batch SMS processing completed for ${messages.length} messages`);
    });

    // Respond immediately
    res.json({
      success: true,
      message: `Batch of ${messages.length} SMS queued for sending`
    });

  } catch (error) {
    logger.error('❌ Error queueing batch SMS:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to queue batch SMS',
      error: error.message
    });
  }
});

/**
 * Check SMS balance
 */
router.get('/balance', async (req, res) => {
  try {
    const result = await bulkSmsService.checkBalance();
    res.json({
      success: true,
      balance: result.balance
    });
  } catch (error) {
    logger.error('❌ Error checking SMS balance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check balance',
      error: error.message
    });
  }
});

/**
 * Check delivery status
 */
router.get('/delivery-status/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const result = await bulkSmsService.checkDeliveryStatus(messageId);
    res.json({
      success: true,
      status: result.status
    });
  } catch (error) {
    logger.error('❌ Error checking delivery status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check delivery status',
      error: error.message
    });
  }
});

/**
 * Get SMS service status
 */
router.get('/status', (req, res) => {
  try {
    const status = bulkSmsService.getStatus();
    res.json({
      success: true,
      status
    });
  } catch (error) {
    logger.error('❌ Error getting SMS service status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get status',
      error: error.message
    });
  }
});

module.exports = router;

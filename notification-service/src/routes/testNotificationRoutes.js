const express = require('express');
const { body, validationResult } = require('express-validator');
const testNotificationService = require('../services/testNotificationService');
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
 * POST /api/notifications/test-created
 * Send notifications when a new test is created
 * Called by backend when test is created
 */
router.post('/test-created', [
  body('test_id').notEmpty().withMessage('Test ID is required')
], validateRequest, async (req, res) => {
  try {
    const { test_id } = req.body;

    logger.info(`📋 Received test-created notification request for test: ${test_id}`);

    // Respond immediately (fire-and-forget pattern)
    res.json({
      success: true,
      message: 'Test notifications queued for processing',
      test_id
    });

    // Process in background
    setImmediate(async () => {
      try {
        await testNotificationService.sendTestCreatedNotifications(test_id);
      } catch (error) {
        logger.error(`❌ Failed to process test-created notifications for ${test_id}:`, error.message);
      }
    });

  } catch (error) {
    logger.error('❌ Error queueing test-created notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to queue test notifications',
      error: error.message
    });
  }
});

/**
 * POST /api/notifications/test-reminder
 * Send test reminder notifications
 * Called by internal cron job (no parameters)
 */
router.post('/test-reminder', async (req, res) => {
  try {
    logger.info('⏰ Received test-reminder trigger');

    // Respond immediately
    res.json({
      success: true,
      message: 'Test reminders queued for processing'
    });

    // Process in background
    setImmediate(async () => {
      try {
        await testNotificationService.sendTestReminders();
      } catch (error) {
        logger.error('❌ Failed to process test reminders:', error.message);
      }
    });

  } catch (error) {
    logger.error('❌ Error queueing test reminders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to queue test reminders',
      error: error.message
    });
  }
});

/**
 * GET /api/notifications/test-reminder/trigger
 * Manual trigger for test reminders (for testing)
 */
router.get('/test-reminder/trigger', async (req, res) => {
  try {
    logger.info('🔧 Manual test-reminder trigger');

    // Respond immediately
    res.json({
      success: true,
      message: 'Test reminders triggered manually'
    });

    // Process in background
    setImmediate(async () => {
      try {
        const result = await testNotificationService.sendTestReminders();
        logger.info('✅ Manual test reminder completed:', result);
      } catch (error) {
        logger.error('❌ Manual test reminder failed:', error.message);
      }
    });

  } catch (error) {
    logger.error('❌ Error triggering test reminders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger test reminders',
      error: error.message
    });
  }
});

/**
 * GET /api/notifications/status
 * Get notification service status
 */
router.get('/status', (req, res) => {
  try {
    res.json({
      success: true,
      service: 'Test Notification Service',
      status: 'running',
      features: {
        testCreated: 'enabled',
        testReminders: 'enabled',
        email: 'enabled',
        sms: 'enabled'
      }
    });
  } catch (error) {
    logger.error('❌ Error getting status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get status',
      error: error.message
    });
  }
});

module.exports = router;

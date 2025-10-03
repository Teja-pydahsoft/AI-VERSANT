const express = require('express');
const { body, validationResult } = require('express-validator');
const pushNotificationService = require('../services/pushNotificationService');
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

// Get push notification service status
router.get('/status', (req, res) => {
  try {
    const status = pushNotificationService.getStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error('Error getting push notification status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get push notification status',
      error: error.message
    });
  }
});

// Send push notification
router.post('/send', [
  body('subscription').notEmpty().withMessage('Subscription is required'),
  body('title').notEmpty().withMessage('Title is required'),
  body('body').notEmpty().withMessage('Body is required'),
  body('data').optional().isObject()
], validateRequest, async (req, res) => {
  try {
    const { subscription, title, body, data = {} } = req.body;

    logger.info(`🔔 Sending push notification: ${title}`);

    const result = await pushNotificationService.send(subscription, title, body, data);

    res.json({
      success: true,
      message: 'Push notification sent successfully',
      data: {
        messageId: result.messageId,
        provider: result.provider,
        recipients: result.recipients
      }
    });

  } catch (error) {
    logger.error('Error sending push notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send push notification',
      error: error.message
    });
  }
});

// Send push notification to multiple recipients
router.post('/send-batch', [
  body('recipients').isArray({ min: 1 }).withMessage('Recipients array is required'),
  body('title').notEmpty().withMessage('Title is required'),
  body('body').notEmpty().withMessage('Body is required'),
  body('data').optional().isObject()
], validateRequest, async (req, res) => {
  try {
    const { recipients, title, body, data = {} } = req.body;

    logger.info(`🔔 Sending push notification to ${recipients.length} recipients: ${title}`);

    const result = await pushNotificationService.sendToMultiple(recipients, title, body, data);

    res.json({
      success: result.success,
      message: `Push notifications sent: ${result.successful}/${result.total} successful`,
      data: {
        total: result.total,
        successful: result.successful,
        failed: result.failed,
        results: result.results
      }
    });

  } catch (error) {
    logger.error('Error sending batch push notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send batch push notifications',
      error: error.message
    });
  }
});

// Test push notification (for testing purposes)
router.post('/test', async (req, res) => {
  try {
    const { type = 'vapid' } = req.body;
    
    // Create a test subscription for VAPID
    const testSubscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
      keys: {
        p256dh: 'test-p256dh-key',
        auth: 'test-auth-key'
      }
    };

    const testRecipients = type === 'onesignal' ? ['test-player-id-1', 'test-player-id-2'] : [testSubscription];

    logger.info(`🧪 Testing ${type} push notification...`);

    const result = await pushNotificationService.sendToMultiple(
      testRecipients,
      'Test Push Notification',
      'This is a test push notification from VERSANT',
      {
        data: { test: true, timestamp: Date.now() },
        icon: '/icon-192x192.png',
        badge: '/badge-72x72.png'
      }
    );

    res.json({
      success: true,
      message: 'Test push notification completed',
      data: result
    });

  } catch (error) {
    logger.error('Error testing push notification:', error);
    res.status(500).json({
      success: false,
      message: 'Test push notification failed',
      error: error.message
    });
  }
});

module.exports = router;

const express = require('express');
const { body, validationResult } = require('express-validator');
const notificationService = require('../services/notificationService');
const { Notification } = require('../models/Notification');
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

// Send single notification
router.post('/send', [
  body('type').isIn(['email', 'sms', 'push']).withMessage('Type must be email, sms, or push'),
  body('recipient').notEmpty().withMessage('Recipient is required'),
  body('content').notEmpty().withMessage('Content is required'),
  body('template').optional().isString(),
  body('metadata').optional().isObject()
], validateRequest, async (req, res) => {
  try {
    const { type, recipient, content, template, metadata = {} } = req.body;

    logger.info(`📤 Sending ${type} notification to ${recipient}`);

    // Send notification directly
    const result = await notificationService.sendNotification(type, recipient, content, {
      ...metadata,
      template
    });

    if (result.success) {
      res.json({
        success: true,
        message: 'Notification sent successfully',
        data: {
          notificationId: result.notificationId,
          type,
          status: 'sent'
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send notification',
        error: result.error
      });
    }

  } catch (error) {
    logger.error('Error sending notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send notification',
      error: error.message
    });
  }
});

// Send batch notifications
router.post('/batch', [
  body('notifications').isArray({ min: 1 }).withMessage('Notifications array is required'),
  body('notifications.*.type').isIn(['email', 'sms', 'push']).withMessage('Each notification must have valid type'),
  body('notifications.*.recipient').notEmpty().withMessage('Each notification must have recipient'),
  body('notifications.*.content').notEmpty().withMessage('Each notification must have content')
], validateRequest, async (req, res) => {
  try {
    const { notifications } = req.body;

    logger.info(`📤 Sending batch notifications: ${notifications.length} notifications`);

    // Send batch notifications directly
    const result = await notificationService.sendBatchNotifications(notifications);

    res.json({
      success: true,
      message: 'Batch notifications sent successfully',
      data: {
        total: notifications.length,
        sent: result.results.filter(r => r.success).length,
        failed: result.results.filter(r => !r.success).length,
        results: result.results
      }
    });

  } catch (error) {
    logger.error('Error sending batch notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send batch notifications',
      error: error.message
    });
  }
});

// Get notification status
router.get('/status/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findById(id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.json({
      success: true,
      data: {
        notificationId: notification._id,
        type: notification.type,
        recipient: notification.recipient,
        status: notification.status,
        createdAt: notification.createdAt,
        sentAt: notification.sentAt,
        error: notification.error
      }
    });

  } catch (error) {
    logger.error('Error getting notification status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get notification status',
      error: error.message
    });
  }
});

// Get notification statistics
router.get('/stats', async (req, res) => {
  try {
    const { type, startDate, endDate } = req.query;
    
    const filter = {};
    if (type) filter.type = type;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const stats = await Notification.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const total = await Notification.countDocuments(filter);
    const byType = await Notification.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        total,
        byStatus: stats,
        byType,
        timestamp: new Date()
      }
    });

  } catch (error) {
    logger.error('Error getting notification stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get notification statistics',
      error: error.message
    });
  }
});

module.exports = router;

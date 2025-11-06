const express = require('express');
const { body, validationResult } = require('express-validator');
const { getDatabase } = require('../config/database');
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

// Get notification settings
router.get('/', async (req, res) => {
  try {
    const db = getDatabase();
    let settings = await db.collection('notification_settings').findOne({});

    // If no settings exist, create default settings
    if (!settings) {
      logger.info('Creating default notification settings');
      const defaultSettings = {
        pushEnabled: true,
        smsEnabled: true,
        mailEnabled: true,
        created_at: new Date(),
        updated_at: new Date()
      };
      await db.collection('notification_settings').insertOne(defaultSettings);
      settings = defaultSettings;
    }

    res.json({
      success: true,
      data: {
        pushEnabled: settings.pushEnabled,
        smsEnabled: settings.smsEnabled,
        mailEnabled: settings.mailEnabled,
        createdAt: settings.created_at,
        updatedAt: settings.updated_at
      }
    });

  } catch (error) {
    logger.error('Error getting notification settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get notification settings',
      error: error.message
    });
  }
});

// Update notification settings - READ ONLY for notification service
router.put('/', validateRequest, async (req, res) => {
  try {
    logger.warn('⚠️ Notification service received update request - this should be handled by backend only');
    res.status(403).json({
      success: false,
      message: 'Notification settings updates must be handled by the backend service only'
    });

  } catch (error) {
    logger.error('Error handling notification settings update:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to handle notification settings update',
      error: error.message
    });
  }
});

module.exports = router;
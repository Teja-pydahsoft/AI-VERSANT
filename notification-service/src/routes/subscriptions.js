const express = require('express');
const { body, validationResult } = require('express-validator');
const { UserSubscription } = require('../models/UserSubscription');
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

/**
 * Register OneSignal subscription
 * Expects: userId, userEmail, player_id (OneSignal), deviceInfo, tags
 */
router.post('/register', [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('userEmail').isEmail().withMessage('Valid email is required'),
  body('player_id').notEmpty().withMessage('OneSignal player_id is required'),
  body('deviceInfo').optional().isObject(),
  body('tags').optional().isArray()
], validateRequest, async (req, res) => {
  try {
    const { userId, userEmail, player_id, onesignal_user_id, deviceInfo = {}, tags = [] } = req.body;

    logger.info(`📱 Registering OneSignal subscription for user: ${userId} (${userEmail})`);
    logger.info(`🔑 OneSignal Player ID: ${player_id}`);

    // Check if subscription already exists for this player_id
    const existingSubscription = await UserSubscription.findOne({
      player_id: player_id
    });

    if (existingSubscription) {
      // Update existing subscription
      existingSubscription.user_id = userId;
      existingSubscription.userEmail = userEmail;
      existingSubscription.device_info = deviceInfo;
      existingSubscription.tags = tags;
      existingSubscription.provider = 'onesignal';
      existingSubscription.is_active = true;
      existingSubscription.last_seen_at = new Date();
      existingSubscription.last_heartbeat = new Date();
      existingSubscription.last_subscribed = new Date();
      await existingSubscription.save();

      logger.info(`✅ Updated existing OneSignal subscription for user: ${userId}`);
      
      return res.json({
        success: true,
        message: 'Subscription updated successfully',
        data: {
          subscriptionId: existingSubscription._id,
          userId,
          userEmail,
          player_id: existingSubscription.player_id
        }
      });
    }

    // Create new subscription
    const newSubscription = new UserSubscription({
      user_id: userId,
      userEmail,
      player_id,
      provider: 'onesignal',
      device_info: deviceInfo,
      tags,
      is_active: true,
      last_heartbeat: new Date(),
      last_subscribed: new Date(),
      last_seen_at: new Date()
    });

    await newSubscription.save();

    logger.info(`✅ New OneSignal subscription registered for user: ${userId}`);

    res.json({
      success: true,
      message: 'Subscription registered successfully',
      data: {
        subscriptionId: newSubscription._id,
        userId,
        userEmail,
        player_id: newSubscription.player_id
      }
    });

  } catch (error) {
    logger.error('Error registering OneSignal subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register subscription',
      error: error.message
    });
  }
});

/**
 * Heartbeat endpoint - verify device is still active
 * Expects: userId, player_id
 */
router.post('/heartbeat', [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('player_id').notEmpty().withMessage('OneSignal player_id is required')
], validateRequest, async (req, res) => {
  try {
    const { userId, player_id, deviceInfo } = req.body;

    logger.info(`💓 Heartbeat received from user: ${userId}, player_id: ${player_id}`);

    // Find and update subscription
    const subscription = await UserSubscription.findOneAndUpdate(
      {
        user_id: userId,
        player_id: player_id
      },
      {
        $set: {
          last_heartbeat: new Date(),
          device_info: deviceInfo || {},
          is_active: true,
          last_seen_at: new Date()
        }
      },
      { new: true }
    );

    if (!subscription) {
      logger.warn(`⚠️ Heartbeat received but no subscription found for user ${userId}, player_id ${player_id}`);
      return res.status(404).json({
        success: false,
        message: 'Subscription not found',
        action: 'resubscribe'
      });
    }

    logger.info(`✅ Heartbeat processed for user ${userId}`);

    res.json({
      success: true,
      message: 'Heartbeat received',
      data: {
        last_heartbeat: subscription.last_heartbeat,
        is_active: subscription.is_active
      }
    });

  } catch (error) {
    logger.error('Error processing heartbeat:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process heartbeat',
      error: error.message
    });
  }
});

/**
 * Send notification to specific user
 * Gets all active OneSignal subscriptions for the user and sends to all devices
 */
router.post('/send-to-user', [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('title').notEmpty().withMessage('Title is required'),
  body('body').notEmpty().withMessage('Body is required'),
  body('data').optional().isObject()
], validateRequest, async (req, res) => {
  try {
    const { userId, title, body, data = {} } = req.body;

    logger.info(`🔔 Sending OneSignal push notification to user: ${userId}`);

    // Get user's active OneSignal subscriptions
    const subscriptions = await UserSubscription.find({
      user_id: userId,
      is_active: true
    });

    if (subscriptions.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active OneSignal subscriptions found for this user'
      });
    }

    logger.info(`📱 Found ${subscriptions.length} active device(s) for user ${userId}`);

    // Send to all user's devices
    const results = [];
    const playerIds = subscriptions.map(s => s.player_id);
    
    try {
      const result = await pushNotificationService.oneSignalService.send(
        playerIds,
        title,
        body,
        {
          data: {
            ...data,
            userId,
            userEmail: subscriptions[0].userEmail
          }
        }
      );
      
      results.push({
        success: true,
        provider: 'OneSignal',
        messageId: result.messageId,
        recipients: result.recipients
      });
      
      logger.info(`✅ OneSignal notification sent to ${playerIds.length} devices`);
      
    } catch (error) {
      logger.error(`❌ Failed to send OneSignal notification:`, error);
      results.push({
        success: false,
        error: error.message
      });
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    res.json({
      success: successful > 0,
      message: `OneSignal notifications: ${successful}/${subscriptions.length} devices notified`,
      data: {
        userId,
        totalDevices: subscriptions.length,
        successful,
        failed,
        results
      }
    });

  } catch (error) {
    logger.error('Error sending notification to user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send notification to user',
      error: error.message
    });
  }
});

/**
 * Send notification to multiple users
 * Batch send to multiple users' OneSignal devices
 */
router.post('/send-to-users', [
  body('userIds').isArray({ min: 1 }).withMessage('User IDs array is required'),
  body('title').notEmpty().withMessage('Title is required'),
  body('body').notEmpty().withMessage('Body is required'),
  body('data').optional().isObject()
], validateRequest, async (req, res) => {
  try {
    const { userIds, title, body, data = {} } = req.body;

    logger.info(`🔔 Sending OneSignal notifications to ${userIds.length} users`);

    // Get all active subscriptions for these users
    const subscriptions = await UserSubscription.find({
      user_id: { $in: userIds },
      is_active: true
    });

    logger.info(`📱 Found ${subscriptions.length} active device(s) across ${userIds.length} users`);

    if (subscriptions.length === 0) {
      return res.json({
        success: true,
        message: 'No active subscriptions found for these users',
        data: {
          totalUsers: userIds.length,
          totalSubscriptions: 0,
          successful: 0,
          failed: 0
        }
      });
    }

    // Collect all player_ids
    const playerIds = subscriptions.map(s => s.player_id);

    let result;
    try {
      result = await pushNotificationService.oneSignalService.send(
        playerIds,
        title,
        body,
        {
          data: {
            ...data,
            targetUsers: userIds
          }
        }
      );
      
      logger.info(`✅ OneSignal batch notification sent to ${playerIds.length} devices`);
      
    } catch (error) {
      logger.error(`❌ Failed to send OneSignal batch notification:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to send batch notifications',
        error: error.message
      });
    }

    res.json({
      success: true,
      message: `OneSignal notifications sent to ${playerIds.length} devices`,
      data: {
        totalUsers: userIds.length,
        totalSubscriptions: subscriptions.length,
        successful: playerIds.length,
        failed: 0,
        notificationId: result.messageId,
        recipients: result.recipients
      }
    });

  } catch (error) {
    logger.error('Error sending notifications to users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send notifications to users',
      error: error.message
    });
  }
});

/**
 * Get user's OneSignal subscriptions
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const subscriptions = await UserSubscription.find({
      user_id: userId,
      is_active: true
    }).select('-__v');

    res.json({
      success: true,
      data: {
        userId,
        subscriptions,
        count: subscriptions.length
      }
    });

  } catch (error) {
    logger.error(`Error fetching subscriptions for user ${req.params.userId}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user subscriptions',
      error: error.message
    });
  }
});

/**
 * Deactivate user subscription
 */
router.delete('/user/:userId/subscription/:subscriptionId', async (req, res) => {
  try {
    const { userId, subscriptionId } = req.params;

    const subscription = await UserSubscription.findOneAndUpdate(
      { _id: subscriptionId, user_id: userId },
      { is_active: false },
      { new: true }
    );

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }

    logger.info(`✅ Deactivated OneSignal subscription ${subscriptionId} for user ${userId}`);

    res.json({
      success: true,
      message: 'Subscription deactivated successfully'
    });

  } catch (error) {
    logger.error(`Error deactivating subscription ${req.params.subscriptionId}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate subscription',
      error: error.message
    });
  }
});

/**
 * Get OneSignal subscription statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const totalSubscriptions = await UserSubscription.countDocuments({ is_active: true });
    const totalUsers = await UserSubscription.distinct('user_id', { is_active: true });
    const recentSubscriptions = await UserSubscription.find({ is_active: true })
      .sort({ created_at: -1 })
      .limit(10)
      .select('user_id userEmail player_id created_at device_info');

    res.json({
      success: true,
      data: {
        totalSubscriptions,
        totalUsers: totalUsers.length,
        recentSubscriptions
      }
    });

  } catch (error) {
    logger.error('Error fetching subscription stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription statistics',
      error: error.message
    });
  }
});

module.exports = router;

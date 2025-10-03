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

// Register user subscription
router.post('/register', [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('userEmail').isEmail().withMessage('Valid email is required'),
  body('subscription').isObject().withMessage('Subscription object is required'),
  body('subscription.endpoint').notEmpty().withMessage('Subscription endpoint is required'),
  body('subscription.keys.p256dh').notEmpty().withMessage('P256DH key is required'),
  body('subscription.keys.auth').notEmpty().withMessage('Auth key is required'),
  body('deviceInfo').optional().isObject()
], validateRequest, async (req, res) => {
  try {
    const { userId, userEmail, subscription, deviceInfo = {} } = req.body;

    logger.info(`📱 Registering push subscription for user: ${userId} (${userEmail})`);

    // Check if subscription already exists
    const existingSubscription = await UserSubscription.findOne({
      userId,
      'subscription.endpoint': subscription.endpoint
    });

    if (existingSubscription) {
      // Update existing subscription
      existingSubscription.subscription = subscription;
      existingSubscription.deviceInfo = deviceInfo;
      existingSubscription.isActive = true;
      existingSubscription.lastUsed = new Date();
      await existingSubscription.save();

      logger.info(`✅ Updated existing subscription for user: ${userId}`);
      
      return res.json({
        success: true,
        message: 'Subscription updated successfully',
        data: {
          subscriptionId: existingSubscription._id,
          userId,
          userEmail
        }
      });
    }

    // Create new subscription
    const newSubscription = new UserSubscription({
      userId,
      userEmail,
      subscription,
      deviceInfo,
      isActive: true
    });

    await newSubscription.save();

    logger.info(`✅ New subscription registered for user: ${userId}`);

    res.json({
      success: true,
      message: 'Subscription registered successfully',
      data: {
        subscriptionId: newSubscription._id,
        userId,
        userEmail
      }
    });

  } catch (error) {
    logger.error('Error registering subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register subscription',
      error: error.message
    });
  }
});

// Send notification to specific user
router.post('/send-to-user', [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('title').notEmpty().withMessage('Title is required'),
  body('body').notEmpty().withMessage('Body is required'),
  body('data').optional().isObject()
], validateRequest, async (req, res) => {
  try {
    const { userId, title, body, data = {} } = req.body;

    logger.info(`🔔 Sending push notification to user: ${userId}`);

    // Get user's active subscriptions
    const subscriptions = await UserSubscription.find({
      userId,
      isActive: true
    });

    if (subscriptions.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active subscriptions found for this user'
      });
    }

    // Send to all user's devices
    const results = [];
    for (const subscription of subscriptions) {
      try {
        const result = await pushNotificationService.send(
          subscription.subscription,
          title,
          body,
          {
            ...data,
            userId,
            userEmail: subscription.userEmail,
            subscriptionId: subscription._id
          }
        );
        results.push({ ...result, subscriptionId: subscription._id });
      } catch (error) {
        logger.error(`Failed to send to subscription ${subscription._id}:`, error);
        results.push({
          success: false,
          subscriptionId: subscription._id,
          error: error.message
        });
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    res.json({
      success: successful > 0,
      message: `Push notifications sent: ${successful}/${subscriptions.length} successful`,
      data: {
        userId,
        total: subscriptions.length,
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

// Send notification to multiple users
router.post('/send-to-users', [
  body('userIds').isArray({ min: 1 }).withMessage('User IDs array is required'),
  body('title').notEmpty().withMessage('Title is required'),
  body('body').notEmpty().withMessage('Body is required'),
  body('data').optional().isObject()
], validateRequest, async (req, res) => {
  try {
    const { userIds, title, body, data = {} } = req.body;

    logger.info(`🔔 Sending push notification to ${userIds.length} users`);

    const allResults = [];
    let totalSubscriptions = 0;
    let totalSuccessful = 0;
    let totalFailed = 0;

    for (const userId of userIds) {
      const subscriptions = await UserSubscription.find({
        userId,
        isActive: true
      });

      totalSubscriptions += subscriptions.length;

      for (const subscription of subscriptions) {
        try {
          const result = await pushNotificationService.send(
            subscription.subscription,
            title,
            body,
            {
              ...data,
              userId,
              userEmail: subscription.userEmail,
              subscriptionId: subscription._id
            }
          );
          allResults.push({ ...result, userId, subscriptionId: subscription._id });
          if (result.success) totalSuccessful++;
        } catch (error) {
          logger.error(`Failed to send to user ${userId}, subscription ${subscription._id}:`, error);
          allResults.push({
            success: false,
            userId,
            subscriptionId: subscription._id,
            error: error.message
          });
          totalFailed++;
        }
      }
    }

    res.json({
      success: totalSuccessful > 0,
      message: `Push notifications sent: ${totalSuccessful}/${totalSubscriptions} successful`,
      data: {
        totalUsers: userIds.length,
        totalSubscriptions,
        successful: totalSuccessful,
        failed: totalFailed,
        results: allResults
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

// Get user subscriptions
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const subscriptions = await UserSubscription.find({
      userId,
      isActive: true
    }).select('-subscription.keys -__v');

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

// Deactivate user subscription
router.delete('/user/:userId/subscription/:subscriptionId', async (req, res) => {
  try {
    const { userId, subscriptionId } = req.params;

    const subscription = await UserSubscription.findOneAndUpdate(
      { _id: subscriptionId, userId },
      { isActive: false },
      { new: true }
    );

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }

    logger.info(`✅ Deactivated subscription ${subscriptionId} for user ${userId}`);

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

// Get subscription statistics
router.get('/stats', async (req, res) => {
  try {
    const totalSubscriptions = await UserSubscription.countDocuments({ isActive: true });
    const totalUsers = await UserSubscription.distinct('userId', { isActive: true });
    const recentSubscriptions = await UserSubscription.find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('userId userEmail createdAt deviceInfo');

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

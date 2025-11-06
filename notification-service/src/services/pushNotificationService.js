const logger = require('../utils/logger');
const notificationService = require('./notificationService');

// OneSignal Push Notification Service
class OneSignalPushService {
  constructor() {
    this.client = null;
    this.isConfigured = false;
    this.initialize();
  }

  initialize() {
    try {
      if (process.env.ONESIGNAL_APP_ID && process.env.ONESIGNAL_REST_API_KEY) {
        const OneSignal = require('onesignal-node');
        this.client = new OneSignal.Client({
          userAuthKey: process.env.ONESIGNAL_USER_AUTH_KEY,
          app: {
            appId: process.env.ONESIGNAL_APP_ID,
            appAuthKey: process.env.ONESIGNAL_REST_API_KEY
          }
        });
        this.isConfigured = true;
        logger.info('✅ OneSignal push notifications configured');
        logger.info(`📱 OneSignal App ID: ${process.env.ONESIGNAL_APP_ID}`);
        logger.info(`🔑 OneSignal API Key: ${process.env.ONESIGNAL_REST_API_KEY.substring(0, 20)}...`);
      } else {
        logger.warn('⚠️ OneSignal credentials not configured, OneSignal push notifications disabled');
        logger.warn(`🔍 ONESIGNAL_APP_ID: ${process.env.ONESIGNAL_APP_ID ? '✅' : '❌'}`);
        logger.warn(`🔍 ONESIGNAL_REST_API_KEY: ${process.env.ONESIGNAL_REST_API_KEY ? '✅' : '❌'}`);
      }
    } catch (error) {
      logger.error('❌ OneSignal initialization failed:', error);
    }
  }

  async send(playerIds, title, body, data = {}) {
    if (!this.isConfigured) {
      throw new Error('OneSignal not configured');
    }

    try {
      const notification = {
        headings: { en: title },
        contents: { en: body },
        include_player_ids: Array.isArray(playerIds) ? playerIds : [playerIds],
        data: data.data || {},
        web_buttons: data.actions || [],
        chrome_web_icon: data.icon || '/icon-192x192.png',
        chrome_web_badge: data.badge || '/badge-72x72.png',
        priority: data.priority || 10,
        ttl: data.ttl || 3600
        // Note: app_id is already configured in the client, no need to add it here
      };

      logger.info(`📱 OneSignal notification data:`, JSON.stringify(notification, null, 2));

      const response = await this.client.createNotification(notification);
      return {
        success: true,
        messageId: response.id,
        provider: 'OneSignal',
        recipients: response.recipients
      };
    } catch (error) {
      logger.error('❌ OneSignal push notification failed:', error);
      if (error.response) {
        logger.error('❌ OneSignal API Error:', error.response.data);
      }
      throw error;
    }
  }
}

// Main Push Notification Service - OneSignal Only
class PushNotificationService {
  constructor() {
    this.oneSignalService = new OneSignalPushService();
  }

  async send(subscription, title, body, data = {}) {
    const settings = await notificationService.getNotificationSettings();
    if (!settings.pushEnabled) {
      logger.info('⚠️ Push notifications are disabled in settings. Skipping send.');
      return {
        success: false,
        message: 'Push notifications are disabled',
        provider: 'None'
      };
    }

    // Send via OneSignal
    try {
      logger.info('📱 Sending OneSignal push notification...');

      // Handle different subscription formats
      let playerIds = [];

      if (subscription.player_id) {
        // OneSignal subscription with player_id
        playerIds = [subscription.player_id];
      } else if (subscription.user_id) {
        // User ID format - OneSignal will lookup the player_id automatically
        logger.info(`📱 Sending to user_id: ${subscription.user_id} (OneSignal will handle player_id lookup)`);
        // For user_id format, we need to get the player_id from backend
        const { getDatabase } = require('../config/database');
        const db = getDatabase();

        const userSubscription = await db.collection('push_subscriptions').findOne({
          user_id: subscription.user_id,
          provider: 'onesignal',
          is_active: true
        });

        if (userSubscription && userSubscription.player_id) {
          playerIds = [userSubscription.player_id];
        } else {
          throw new Error(`No OneSignal subscription found for user: ${subscription.user_id}`);
        }
      } else {
        throw new Error('Invalid subscription format - missing player_id or user_id');
      }

      const result = await this.oneSignalService.send(playerIds, title, body, data);
      logger.info('✅ OneSignal push notification sent successfully');
      return result;

    } catch (error) {
      logger.error('❌ OneSignal push notification failed:', error.message);
      throw error;
    }
  }

  // Send to multiple recipients
  async sendToMultiple(recipients, title, body, data = {}) {
    const results = [];
    
    for (const recipient of recipients) {
      try {
        const result = await this.send(recipient, title, body, data);
        results.push({ ...result, recipient });
      } catch (error) {
        results.push({
          success: false,
          recipient,
          error: error.message
        });
      }
    }

    return {
      success: results.some(r => r.success),
      results,
      total: recipients.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    };
  }

  // Get service status
  getStatus() {
    return {
      oneSignal: {
        configured: this.oneSignalService.isConfigured,
        status: this.oneSignalService.isConfigured ? 'ready' : 'not configured'
      },
      overall: this.oneSignalService.isConfigured ? 'ready' : 'not configured'
    };
  }
}

module.exports = new PushNotificationService();
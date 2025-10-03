const logger = require('../utils/logger');

// VAPID Push Notification Service
class VAPIDPushService {
  constructor() {
    this.webpush = null;
    this.isConfigured = false;
    this.initialize();
  }

  initialize() {
    try {
      // Check for both possible private key variable names
      const privateKey = process.env.VAPID_PRIVATE_KEY || process.env.VAPID_PRIVATE_KEY_FILE;
      
      if (process.env.VAPID_PUBLIC_KEY && privateKey) {
        const webpush = require('web-push');
        // Ensure VAPID subject is in proper mailto: format
        let vapidSubject = process.env.VAPID_SUBJECT || 
          (process.env.VAPID_EMAIL ? `mailto:${process.env.VAPID_EMAIL}` : 'mailto:admin@versant.com');
        
        // Fix VAPID subject if it doesn't start with mailto:
        if (!vapidSubject.startsWith('mailto:')) {
          vapidSubject = `mailto:${vapidSubject}`;
        }
        
        webpush.setVapidDetails(
          vapidSubject,
          process.env.VAPID_PUBLIC_KEY,
          privateKey
        );
        this.webpush = webpush;
        this.isConfigured = true;
        logger.info('✅ VAPID push notifications configured');
        logger.info(`📧 VAPID Subject: ${vapidSubject}`);
      } else {
        logger.warn('⚠️ VAPID keys not configured, VAPID push notifications disabled');
        logger.warn(`🔍 VAPID_PUBLIC_KEY: ${process.env.VAPID_PUBLIC_KEY ? '✅' : '❌'}`);
        logger.warn(`🔍 VAPID_PRIVATE_KEY: ${process.env.VAPID_PRIVATE_KEY ? '✅' : '❌'}`);
        logger.warn(`🔍 VAPID_PRIVATE_KEY_FILE: ${process.env.VAPID_PRIVATE_KEY_FILE ? '✅' : '❌'}`);
      }
    } catch (error) {
      logger.error('❌ VAPID initialization failed:', error);
    }
  }

  async send(subscription, title, body, data = {}) {
    if (!this.isConfigured) {
      throw new Error('VAPID not configured');
    }

    try {
      const payload = JSON.stringify({
        title,
        body,
        icon: data.icon || '/icon-192x192.png',
        badge: data.badge || '/badge-72x72.png',
        data: data.data || {},
        actions: data.actions || [],
        requireInteraction: data.requireInteraction || false
      });

      const result = await this.webpush.sendNotification(subscription, payload);
      return {
        success: true,
        messageId: result.headers['location'] || Date.now().toString(),
        provider: 'VAPID'
      };
    } catch (error) {
      logger.error('❌ VAPID push notification failed:', error);
      throw error;
    }
  }
}

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

// Main Push Notification Service with fallback
class PushNotificationService {
  constructor() {
    this.vapidService = new VAPIDPushService();
    this.oneSignalService = new OneSignalPushService();
  }

  async send(subscription, title, body, data = {}) {
    const results = [];
    let lastError = null;

    // Try OneSignal first (if configured)
    if (this.oneSignalService.isConfigured) {
      try {
        logger.info('📱 Attempting OneSignal push notification...');
        const result = await this.oneSignalService.send(subscription, title, body, data);
        results.push(result);
        logger.info('✅ OneSignal push notification sent successfully');
        return result;
      } catch (error) {
        logger.warn('⚠️ OneSignal push notification failed, trying VAPID...', error.message);
        lastError = error;
        results.push({ success: false, provider: 'OneSignal', error: error.message });
      }
    }

    // Try VAPID as fallback (if configured)
    if (this.vapidService.isConfigured) {
      try {
        logger.info('📱 Attempting VAPID push notification...');
        const result = await this.vapidService.send(subscription, title, body, data);
        results.push(result);
        logger.info('✅ VAPID push notification sent successfully');
        return result;
      } catch (error) {
        logger.warn('⚠️ VAPID push notification failed', error.message);
        lastError = error;
        results.push({ success: false, provider: 'VAPID', error: error.message });
      }
    }

    // If both failed
    if (results.length === 0) {
      throw new Error('No push notification services configured');
    }

    // Return the last error if all services failed
    throw lastError || new Error('All push notification services failed');
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
      vapid: {
        configured: this.vapidService.isConfigured,
        status: this.vapidService.isConfigured ? 'ready' : 'not configured'
      },
      oneSignal: {
        configured: this.oneSignalService.isConfigured,
        status: this.oneSignalService.isConfigured ? 'ready' : 'not configured'
      },
      overall: this.vapidService.isConfigured || this.oneSignalService.isConfigured ? 'ready' : 'not configured'
    };
  }
}

module.exports = new PushNotificationService();

const { Notification } = require('../models/Notification');
const logger = require('../utils/logger');
const notificationService = require('../services/notificationService');
const pushNotificationService = require('../services/pushNotificationService');

module.exports = async (job) => {
  const { notificationId, recipient, content, template, metadata } = job.data;
  
  try {
    logger.info(`🔔 Processing push notification: ${notificationId}`);

    // Check if push notifications are enabled
    const settings = await notificationService.getNotificationSettings();
    if (!settings.pushEnabled) {
      logger.info('⚠️ Push notifications are disabled. Skipping job.');
      await Notification.findByIdAndUpdate(notificationId, {
        status: 'skipped',
        metadata: { ...metadata, reason: 'Push notifications disabled' }
      });
      return { success: true, message: 'Push notifications disabled' };
    }

    // Update notification status to processing
    await Notification.findByIdAndUpdate(notificationId, {
      status: 'processing'
    });

    // Check if OneSignal is configured
    const pushStatus = pushNotificationService.getStatus();
    if (!pushStatus.oneSignal.configured) {
      logger.warn('⚠️ OneSignal not configured, skipping push notification');
      
      await Notification.findByIdAndUpdate(notificationId, {
        status: 'sent',
        sentAt: new Date(),
        metadata: {
          ...metadata,
          messageId: 'skipped-no-onesignal'
        }
      });
      
      return { success: true, message: 'Skipped - OneSignal not configured' };
    }

    // Get subscription from recipient (this would typically come from a database)
    // For now, we'll assume the recipient is a subscription object
    const subscription = typeof recipient === 'string' 
      ? JSON.parse(recipient) 
      : recipient;

    // Send push notification using OneSignal
    const result = await pushNotificationService.send(
      subscription,
      metadata.title || 'VERSANT Notification',
      content,
      {
        data: metadata.data || {},
        icon: metadata.icon || '/icon-192x192.png',
        badge: metadata.badge || '/badge-72x72.png'
      }
    );

    // Update notification as sent
    await Notification.findByIdAndUpdate(notificationId, {
      status: 'sent',
      sentAt: new Date(),
      metadata: {
        ...metadata,
        messageId: result.messageId || Date.now().toString()
      }
    });

    logger.info(`✅ Push notification sent successfully: ${notificationId}`);
    return result;

  } catch (error) {
    logger.error(`❌ Push notification failed: ${notificationId}`, error);

    // Update notification as failed
    await Notification.findByIdAndUpdate(notificationId, {
      status: 'failed',
      error: error.message
    });

    throw error;
  }
};

const { Notification } = require('../models/Notification');
const logger = require('../utils/logger');

// Only configure web push if VAPID keys are provided
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  const webpush = require('web-push');
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@versant.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

module.exports = async (job) => {
  const { notificationId, recipient, content, template, metadata } = job.data;
  
  try {
    logger.info(`🔔 Processing push notification: ${notificationId}`);

    // Update notification status to processing
    await Notification.findByIdAndUpdate(notificationId, {
      status: 'processing'
    });

    // Check if VAPID keys are configured
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      logger.warn('⚠️ VAPID keys not configured, skipping push notification');
      
      await Notification.findByIdAndUpdate(notificationId, {
        status: 'sent',
        sentAt: new Date(),
        metadata: {
          ...metadata,
          messageId: 'skipped-no-vapid-keys'
        }
      });
      
      return { success: true, message: 'Skipped - no VAPID keys' };
    }

    const webpush = require('web-push');
    
    // Get subscription from recipient (this would typically come from a database)
    // For now, we'll assume the recipient is a subscription object
    const subscription = typeof recipient === 'string' 
      ? JSON.parse(recipient) 
      : recipient;

    const payload = JSON.stringify({
      title: metadata.title || 'VERSANT Notification',
      body: content,
      icon: metadata.icon || '/icon-192x192.png',
      badge: metadata.badge || '/badge-72x72.png',
      data: metadata.data || {}
    });

    // Send push notification
    const result = await webpush.sendNotification(subscription, payload);

    // Update notification as sent
    await Notification.findByIdAndUpdate(notificationId, {
      status: 'sent',
      sentAt: new Date(),
      metadata: {
        ...metadata,
        messageId: result.headers['location'] || Date.now().toString()
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

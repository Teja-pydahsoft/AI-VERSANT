/**
 * Push Notification Service
 * Handles Web Push API integration with VAPID keys
 */

import api from './api';

class PushNotificationService {
  constructor() {
    this.isSupported = 'serviceWorker' in navigator && 'PushManager' in window;
    this.registration = null;
    this.subscription = null;
    this.vapidPublicKey = null;
    this.isSubscribed = false;
  }

  /**
   * Initialize the push notification service
   */
  async initialize() {
    if (!this.isSupported) {
      console.warn('Push notifications are not supported in this browser');
      return false;
    }

    try {
      // Get VAPID public key from backend
      await this.getVapidKey();
      
      // Register service worker
      await this.registerServiceWorker();
      
      // Check existing subscription
      await this.checkExistingSubscription();
      
      console.log('✅ Push notification service initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize push notification service:', error);
      return false;
    }
  }

  /**
   * Get VAPID public key from backend
   */
  async getVapidKey() {
    try {
      const response = await api.get('/push-notifications/vapid-key');
      if (response.data.success) {
        this.vapidPublicKey = response.data.public_key;
        console.log('✅ VAPID public key retrieved');
      } else {
        throw new Error('Failed to get VAPID key');
      }
    } catch (error) {
      console.error('❌ Error getting VAPID key:', error);
      throw error;
    }
  }

  /**
   * Register service worker
   */
  async registerServiceWorker() {
    try {
      this.registration = await navigator.serviceWorker.register('/sw.js');
      console.log('✅ Service worker registered');
      
      // Wait for service worker to be ready
      await navigator.serviceWorker.ready;
      console.log('✅ Service worker ready');
    } catch (error) {
      console.error('❌ Service worker registration failed:', error);
      throw error;
    }
  }

  /**
   * Check if user is already subscribed
   */
  async checkExistingSubscription() {
    try {
      this.subscription = await this.registration.pushManager.getSubscription();
      this.isSubscribed = !!this.subscription;
      
      if (this.isSubscribed) {
        console.log('✅ User is already subscribed to push notifications');
      } else {
        console.log('ℹ️ User is not subscribed to push notifications');
      }
    } catch (error) {
      console.error('❌ Error checking subscription:', error);
      this.isSubscribed = false;
    }
  }

  /**
   * Subscribe user to push notifications
   */
  async subscribe() {
    if (!this.isSupported) {
      throw new Error('Push notifications are not supported');
    }

    if (this.isSubscribed) {
      console.log('ℹ️ User is already subscribed');
      return true;
    }

    try {
      // Convert VAPID key to Uint8Array
      const applicationServerKey = this.urlBase64ToUint8Array(this.vapidPublicKey);
      
      // Subscribe to push manager
      this.subscription = await this.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey
      });

      // Send subscription to backend
      const response = await api.post('/push-notifications/subscribe', {
        subscription: this.subscription
      });

      if (response.data.success) {
        this.isSubscribed = true;
        console.log('✅ Successfully subscribed to push notifications');
        return true;
      } else {
        throw new Error(response.data.message || 'Subscription failed');
      }
    } catch (error) {
      console.error('❌ Subscription failed:', error);
      this.isSubscribed = false;
      throw error;
    }
  }

  /**
   * Unsubscribe user from push notifications
   */
  async unsubscribe() {
    if (!this.isSubscribed) {
      console.log('ℹ️ User is not subscribed');
      return true;
    }

    try {
      // Unsubscribe from push manager
      const result = await this.subscription.unsubscribe();
      
      if (result) {
        // Notify backend
        await api.post('/push-notifications/unsubscribe', {
          endpoint: this.subscription.endpoint
        });
        
        this.subscription = null;
        this.isSubscribed = false;
        console.log('✅ Successfully unsubscribed from push notifications');
        return true;
      } else {
        throw new Error('Unsubscription failed');
      }
    } catch (error) {
      console.error('❌ Unsubscription failed:', error);
      throw error;
    }
  }

  /**
   * Send test notification to current user
   */
  async sendTestNotification() {
    try {
      // Check if user is subscribed, if not, subscribe them first
      if (!this.isSubscribed) {
        console.log('ℹ️ User not subscribed, subscribing first...');
        await this.subscribe();
      }

      const response = await api.post('/push-notifications/test');
      if (response.data.success) {
        console.log('✅ Test notification sent');
        return true;
      } else {
        throw new Error(response.data.message || 'Test notification failed');
      }
    } catch (error) {
      console.error('❌ Test notification failed:', error);
      throw error;
    }
  }

  /**
   * Send notification to specific user (admin only)
   */
  async sendToUser(userId, title, body, data = {}, icon = null, url = null) {
    try {
      const response = await api.post('/push-notifications/send-to-user', {
        user_id: userId,
        title,
        body,
        data,
        icon,
        url
      });
      
      if (response.data.success) {
        console.log('✅ Notification sent to user');
        return response.data.task_id;
      } else {
        throw new Error(response.data.message || 'Failed to send notification');
      }
    } catch (error) {
      console.error('❌ Failed to send notification to user:', error);
      throw error;
    }
  }

  /**
   * Send notification to users with specific role (admin only)
   */
  async sendToRole(role, title, body, data = {}, icon = null, url = null) {
    try {
      const response = await api.post('/push-notifications/send-to-role', {
        role,
        title,
        body,
        data,
        icon,
        url
      });
      
      if (response.data.success) {
        console.log(`✅ Notification sent to ${role} users`);
        return response.data.task_id;
      } else {
        throw new Error(response.data.message || 'Failed to send notification');
      }
    } catch (error) {
      console.error(`❌ Failed to send notification to ${role} users:`, error);
      throw error;
    }
  }

  /**
   * Send broadcast notification to all users (superadmin only)
   */
  async broadcast(title, body, data = {}, icon = null, url = null) {
    try {
      const response = await api.post('/push-notifications/broadcast', {
        title,
        body,
        data,
        icon,
        url
      });
      
      if (response.data.success) {
        console.log('✅ Broadcast notification sent');
        return response.data.task_id;
      } else {
        throw new Error(response.data.message || 'Failed to send broadcast');
      }
    } catch (error) {
      console.error('❌ Failed to send broadcast notification:', error);
      throw error;
    }
  }

  /**
   * Get push notification statistics (admin only)
   */
  async getStats() {
    try {
      const response = await api.get('/push-notifications/stats');
      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.message || 'Failed to get stats');
      }
    } catch (error) {
      console.error('❌ Failed to get push notification stats:', error);
      throw error;
    }
  }

  /**
   * Request notification permission from user
   */
  async requestPermission() {
    if (!('Notification' in window)) {
      throw new Error('This browser does not support notifications');
    }

    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
      console.log('✅ Notification permission granted');
      return true;
    } else if (permission === 'denied') {
      console.log('❌ Notification permission denied');
      return false;
    } else {
      console.log('⚠️ Notification permission dismissed');
      return false;
    }
  }

  /**
   * Check if notifications are supported and permission is granted
   */
  isNotificationSupported() {
    return this.isSupported && Notification.permission === 'granted';
  }

  /**
   * Get subscription status
   */
  getSubscriptionStatus() {
    return {
      isSupported: this.isSupported,
      isSubscribed: this.isSubscribed,
      hasPermission: Notification.permission === 'granted',
      subscription: this.subscription
    };
  }

  /**
   * Convert VAPID key from base64 to Uint8Array
   */
  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  /**
   * Setup notification click handler
   */
  setupNotificationClickHandler() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'NOTIFICATION_CLICK') {
          const data = event.data.data;
          if (data && data.url) {
            window.location.href = data.url;
          }
        }
      });
    }
  }
}

// Create and export singleton instance
const pushNotificationService = new PushNotificationService();

export default pushNotificationService;

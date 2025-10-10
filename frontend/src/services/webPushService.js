/**
 * Web Push Notification Service
 * Handles Web Push API subscription and messaging
 */
import api from './api';

class WebPushService {
  constructor() {
    this.isSupported = 'serviceWorker' in navigator && 'PushManager' in window;
    this.vapidPublicKey = null;
    this.registration = null;
    this.subscription = null;
  }

  /**
   * Initialize the push notification service
   */
  async initialize() {
    if (!this.isSupported) {
      console.warn('Push notifications are not supported');
      return false;
    }

    try {
      // Get VAPID public key
      const response = await api.get('/api/push/vapid-public-key');
      this.vapidPublicKey = response.data.publicKey;

      // Register service worker
      this.registration = await this.registerServiceWorker();
      
      // Check existing subscription
      const subscription = await this.registration.pushManager.getSubscription();
      if (subscription) {
        this.subscription = subscription;
        return true;
      }

      return true;
    } catch (error) {
      console.error('Failed to initialize push notifications:', error);
      return false;
    }
  }

  /**
   * Register service worker
   */
  async registerServiceWorker() {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      console.log('Service Worker registered:', registration);
      return registration;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      throw error;
    }
  }

  /**
   * Convert VAPID public key to Uint8Array
   */
  urlB64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  /**
   * Subscribe to push notifications
   */
  async subscribe() {
    try {
      if (!this.registration) {
        throw new Error('Service Worker not registered');
      }

      const subscribeOptions = {
        userVisibleOnly: true,
        applicationServerKey: this.urlB64ToUint8Array(this.vapidPublicKey)
      };

      const pushSubscription = await this.registration.pushManager.subscribe(subscribeOptions);
      console.log('Push Subscription:', pushSubscription);

      // Send subscription to backend
      const response = await api.post('/api/push/subscribe', pushSubscription);
      console.log('Subscription saved:', response.data);

      this.subscription = pushSubscription;
      return true;
    } catch (error) {
      console.error('Failed to subscribe to push notifications:', error);
      throw error;
    }
  }

  /**
   * Unsubscribe from push notifications
   */
  async unsubscribe() {
    try {
      if (!this.subscription) {
        return true;
      }

      await this.subscription.unsubscribe();
      this.subscription = null;
      return true;
    } catch (error) {
      console.error('Failed to unsubscribe from push notifications:', error);
      throw error;
    }
  }
}

// Create singleton instance
const webPushService = new WebPushService();
export default webPushService;
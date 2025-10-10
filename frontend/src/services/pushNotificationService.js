/**
 * Unified Push Notification Service
 * Handles both OneSignal and VAPID push notifications
 */

import api from './api';
import oneSignalService from './oneSignalService';

class PushNotificationService {
  constructor() {
    // Check if push notifications are supported
    this.isSupported = 'serviceWorker' in navigator && 'PushManager' in window;
    
    // Service worker registration
    this.registration = null;
    
    // VAPID state
    this.vapidSubscription = null;
    this.vapidPublicKey = null;
    this.isVapidSubscribed = false;
    
    // OneSignal state
    this.isOneSignalSubscribed = false;
    // Device fingerprint
    this.deviceId = null;
    this.deviceFingerprint = null;
    
    // Health monitoring
    this.healthCheckInterval = null;
    this.heartbeatInterval = null;
    this.lastVerified = null;
    
    // Auto-recovery
    this.isRecovering = false;
  }

  /**
   * Initialize both push notification services
   * NOTE: Should only be called after user authentication
   */
  async initialize() {
    try {
      // Check if user is authenticated
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      if (!token) {
        console.warn('⚠️ User not authenticated, skipping push notification initialization');
        return false;
      }

      console.log('🔔 Initializing push notification services...');

      // Generate device fingerprint
      const deviceId = this.getDeviceId();
      console.log('🔑 Device ID:', deviceId);

      // Initialize OneSignal first (it registers its own service worker)
      const oneSignalInitialized = await oneSignalService.initialize();
      console.log('OneSignal initialization:', oneSignalInitialized ? '✅' : '❌');

      // Then initialize VAPID if supported
      if (this.isSupported) {
        const vapidInitialized = await this.initializeVapid();
        console.log('VAPID initialization:', vapidInitialized ? '✅' : '❌');
      } else {
        console.warn('⚠️ VAPID push notifications not supported in this browser');
      }

      // Setup notification click handler
      this.setupNotificationClickHandler();

      console.log('✅ Push notification services initialized');
      console.log('📊 Local Status:', {
        oneSignal: this.isOneSignalSubscribed,
        vapid: this.isVapidSubscribed,
        deviceId: deviceId
      });

      // Verify with backend
      try {
        const backendStatus = await this.checkSubscriptionStatusFromBackend();
        console.log('📊 Backend Status:', backendStatus);
        
        // Sync local state with backend
        if (backendStatus.isSubscribed) {
          if (backendStatus.subscriptions.onesignal) {
            this.isOneSignalSubscribed = true;
          }
          if (backendStatus.subscriptions.vapid) {
            this.isVapidSubscribed = true;
          }
        }
      } catch (error) {
        console.warn('⚠️ Could not verify subscription with backend:', error.message);
        // Continue anyway - local state is still valid
      }

      // Start health monitoring
      this.startHealthMonitoring();

      // Run initial health check
      setTimeout(() => this.ensureSubscribed(), 10000); // After 10 seconds

      return true;
    } catch (error) {
      console.error('❌ Push notification service initialization failed:', error);
      return false;
    }
  }

  /**
   * Initialize VAPID push notifications
   */
  async initializeVapid() {
    try {
      // Get VAPID public key
      const keyRetrieved = await this.getVapidKey();
      if (!keyRetrieved) {
        console.warn('⚠️ VAPID public key not available, skipping VAPID initialization');
        return false;
      }
      
      // Register service worker
      await this.registerServiceWorker();
      
      // Check existing subscription
      await this.checkExistingSubscription();
      
      console.log('✅ VAPID service initialized');
      return true;
    } catch (error) {
      console.warn('⚠️ VAPID initialization failed:', error.message);
      console.warn('⚠️ VAPID push notifications will not be available');
      return false;
    }
  }

  /**
   * Get VAPID public key from backend
   */
  async getVapidKey() {
    try {
      const response = await api.get('/vapid/public-key');
      if (response.data.success) {
        this.vapidPublicKey = response.data.publicKey;
        console.log('✅ VAPID public key retrieved');
        return true;
      }
      console.warn('⚠️ VAPID public key not available from backend');
      return false;
    } catch (error) {
      console.warn('⚠️ Failed to get VAPID key:', error.message);
      console.warn('⚠️ Make sure backend has /vapid/public-key endpoint configured');
      return false;
    }
  }

  /**
   * Subscribe to all available push notification services
   */
  async subscribeToAll() {
    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Notification permission denied');
      }

      // Subscribe to both services
      const oneSignalPromise = oneSignalService.subscribe();
      const vapidPromise = this.subscribeToVapid();

      const [oneSignalResult, vapidResult] = await Promise.allSettled([
        oneSignalPromise,
        vapidPromise
      ]);

      return {
        oneSignal: oneSignalResult.status === 'fulfilled',
        vapid: vapidResult.status === 'fulfilled',
        success: oneSignalResult.status === 'fulfilled' || vapidResult.status === 'fulfilled'
      };
    } catch (error) {
      console.error('Failed to subscribe to notifications:', error);
      return { oneSignal: false, vapid: false, success: false };
    }
  }

  /**
   * Register service worker for VAPID
   * Uses existing OneSignal service worker if available
   */
  async registerServiceWorker() {
    try {
      // Check if there's already a service worker registered (likely OneSignal)
      const existingReg = await navigator.serviceWorker.getRegistration();
      
      if (existingReg) {
        console.log('✅ Using existing service worker:', existingReg.active?.scriptURL);
        this.registration = existingReg;
        return true;
      }
      
      // If no existing registration, register our VAPID service worker
      console.log('📝 Registering VAPID service worker...');
      this.registration = await navigator.serviceWorker.register('/service-worker.js', {
        scope: '/'
      });
      
      console.log('✅ VAPID service worker registered');
      return true;
    } catch (error) {
      console.error('❌ Service Worker registration failed:', error);
      throw error;
    }
  }

  /**
   * Check existing VAPID subscription
   */
  async checkExistingSubscription() {
    try {
      if (!this.registration) {
        console.warn('⚠️ No service worker registration, skipping subscription check');
        return false;
      }
      
      const subscription = await this.registration.pushManager.getSubscription();
      this.vapidSubscription = subscription;
      this.isVapidSubscribed = !!subscription;
      
      if (subscription) {
        console.log('✅ Found existing VAPID subscription');
        console.log('📍 Endpoint:', subscription.endpoint.substring(0, 50) + '...');
        
        // Verify subscription is still valid with backend
        try {
          await this.updateVapidSubscription(subscription);
        } catch (error) {
          console.warn('⚠️ Failed to verify subscription with backend:', error.message);
          // Don't throw - subscription might still be valid locally
        }
      } else {
        console.log('ℹ️ No existing VAPID subscription found');
      }
      
      return this.isVapidSubscribed;
    } catch (error) {
      console.error('❌ Failed to check subscription:', error);
      return false;
    }
  }

  /**
   * Subscribe to push notifications (both OneSignal and VAPID)
   */
  async subscribe() {
    try {
      const results = await Promise.allSettled([
        this.subscribeToOneSignal(),
        this.subscribeToVapid()
      ]);

      // Check results
      const oneSignalResult = results[0];
      const vapidResult = results[1];

      // Log results
      if (oneSignalResult.status === 'fulfilled' && oneSignalResult.value) {
        console.log('✅ OneSignal subscription successful');
        this.isOneSignalSubscribed = true;
      } else {
        console.warn('⚠️ OneSignal subscription failed:', oneSignalResult.reason);
      }

      if (vapidResult.status === 'fulfilled' && vapidResult.value) {
        console.log('✅ VAPID subscription successful');
        this.isVapidSubscribed = true;
      } else {
        console.warn('⚠️ VAPID subscription failed:', vapidResult.reason);
      }

      return this.isOneSignalSubscribed || this.isVapidSubscribed;
    } catch (error) {
      console.error('❌ Push notification subscription failed:', error);
      return false;
    }
  }

  /**
   * Subscribe to OneSignal
   */
  async subscribeToOneSignal() {
    return oneSignalService.subscribe();
  }

  /**
   * Subscribe to VAPID push notifications
   */
  async subscribeToVapid() {
    try {
      if (!this.registration) {
        console.warn('⚠️ No service worker registration - cannot subscribe to VAPID');
        return false;
      }
      
      if (!this.vapidPublicKey) {
        console.warn('⚠️ VAPID public key not available - skipping VAPID subscription');
        return false;
      }

      // Check if already subscribed
      const existingSubscription = await this.registration.pushManager.getSubscription();
      if (existingSubscription) {
        console.log('✅ Already subscribed to VAPID');
        this.vapidSubscription = existingSubscription;
        this.isVapidSubscribed = true;
        return true;
      }

      console.log('📝 Creating new VAPID subscription...');

      // Create subscription
      const subscription = await this.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.vapidPublicKey
      });

      this.vapidSubscription = subscription;
      this.isVapidSubscribed = true;

      // Send to backend
      await this.updateVapidSubscription(subscription);

      console.log('✅ VAPID subscription successful');
      console.log('📍 Endpoint:', subscription.endpoint.substring(0, 50) + '...');
      return true;
    } catch (error) {
      console.warn('⚠️ VAPID subscription failed:', error.message);
      if (error.name === 'NotAllowedError') {
        console.warn('⚠️ User denied notification permission');
      }
      return false;
    }
  }

  /**
   * Update VAPID subscription on backend
   */
  async updateVapidSubscription(subscription) {
    try {
      // Ensure user is authenticated
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      if (!token) {
        throw new Error('User not authenticated - cannot subscribe to push notifications');
      }

      const deviceId = this.getDeviceId();

      const response = await api.post('/vapid/subscribe', {
        subscription: subscription.toJSON(),
        browser: navigator.userAgent,
        platform: 'web',
        device_id: deviceId,
        device_info: this.deviceFingerprint,
        last_verified: new Date().toISOString()
      });

      if (!response.data.success) {
        throw new Error('Failed to update subscription on backend');
      }

      this.lastVerified = new Date();
      console.log('✅ VAPID subscription updated on backend with device info');
      console.log('🔑 Device ID:', deviceId);
      return true;
    } catch (error) {
      console.error('❌ Failed to update subscription:', error);
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
   * Get subscription status (local)
   */
  getSubscriptionStatus() {
    return {
      isSupported: this.isSupported,
      isSubscribed: this.isOneSignalSubscribed || this.isVapidSubscribed,
      oneSignal: this.isOneSignalSubscribed,
      vapid: this.isVapidSubscribed,
      hasPermission: Notification.permission === 'granted',
      subscription: this.vapidSubscription
    };
  }

  /**
   * Check subscription status from backend
   */
  async checkSubscriptionStatusFromBackend() {
    try {
      const response = await api.get('/push-notifications/subscription-status');
      if (response.data.success) {
        const status = response.data;
        console.log('📊 Backend subscription status:', status);
        return {
          isSubscribed: status.is_subscribed,
          subscriptions: status.subscriptions,
          details: status.details
        };
      } else {
        throw new Error(response.data.message || 'Failed to check subscription status');
      }
    } catch (error) {
      console.error('❌ Failed to check subscription status from backend:', error);
      throw error;
    }
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

  /**
   * Generate device fingerprint for unique device identification
   */
  generateDeviceFingerprint() {
    try {
      const fingerprint = {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        languages: navigator.languages ? navigator.languages.join(',') : '',
        screenResolution: `${screen.width}x${screen.height}`,
        colorDepth: screen.colorDepth,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timezoneOffset: new Date().getTimezoneOffset(),
        hardwareConcurrency: navigator.hardwareConcurrency || 0,
        deviceMemory: navigator.deviceMemory || 0,
        maxTouchPoints: navigator.maxTouchPoints || 0
      };
      
      // Generate unique device ID from fingerprint
      const fingerprintString = JSON.stringify(fingerprint);
      this.deviceId = this.hashCode(fingerprintString);
      this.deviceFingerprint = fingerprint;
      
      console.log('🔑 Device fingerprint generated:', this.deviceId);
      return this.deviceId;
    } catch (error) {
      console.error('❌ Failed to generate device fingerprint:', error);
      // Fallback to random ID
      this.deviceId = 'device_' + Math.random().toString(36).substring(2, 15);
      return this.deviceId;
    }
  }

  /**
   * Simple hash function for device ID
   */
  hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return 'device_' + Math.abs(hash).toString(36);
  }

  /**
   * Get or create device ID
   */
  getDeviceId() {
    if (!this.deviceId) {
      // Try to get from localStorage first
      const storedDeviceId = localStorage.getItem('versant_device_id');
      if (storedDeviceId) {
        this.deviceId = storedDeviceId;
      } else {
        // Generate new one
        this.generateDeviceFingerprint();
        localStorage.setItem('versant_device_id', this.deviceId);
      }
    }
    return this.deviceId;
  }

  /**
   * Service Worker Health Check
   * Continuously monitors service worker state
   */
  async checkServiceWorkerHealth() {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      
      if (!registration) {
        console.error('❌ Service worker not registered!');
        return { healthy: false, reason: 'not_registered' };
      }
      
      if (!registration.active) {
        console.warn('⚠️ Service worker not active');
        return { healthy: false, reason: 'not_active', state: registration.installing ? 'installing' : registration.waiting ? 'waiting' : 'unknown' };
      }
      
      console.log('✅ Service worker healthy');
      return { healthy: true, state: 'active' };
    } catch (error) {
      console.error('❌ Service worker health check failed:', error);
      return { healthy: false, reason: 'error', error: error.message };
    }
  }

  /**
   * Validate subscription is still valid
   */
  async validateSubscription() {
    try {
      if (!this.registration) {
        console.warn('⚠️ No service worker registration');
        return { valid: false, reason: 'no_registration' };
      }
      
      const subscription = await this.registration.pushManager.getSubscription();
      
      if (!subscription) {
        console.warn('⚠️ No push subscription found');
        return { valid: false, reason: 'no_subscription' };
      }
      
      // Check if subscription has expiration time
      if (subscription.expirationTime) {
        const now = Date.now();
        if (subscription.expirationTime < now) {
          console.error('❌ Subscription expired!');
          return { valid: false, reason: 'expired', expirationTime: subscription.expirationTime };
        }
        
        // Warn if expiring soon (within 7 days)
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (subscription.expirationTime - now < sevenDays) {
          console.warn('⚠️ Subscription expiring soon:', new Date(subscription.expirationTime));
        }
      }
      
      console.log('✅ Subscription valid');
      return { valid: true, subscription, endpoint: subscription.endpoint };
    } catch (error) {
      console.error('❌ Subscription validation failed:', error);
      return { valid: false, reason: 'error', error: error.message };
    }
  }

  /**
   * Send heartbeat to backend
   * Verifies device is still registered and active
   */
  async sendHeartbeat() {
    try {
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      if (!token) {
        console.log('ℹ️ No auth token, skipping heartbeat');
        return false;
      }
      
      const deviceId = this.getDeviceId();
      const subscription = await this.registration?.pushManager.getSubscription();
      
      if (!subscription) {
        console.warn('⚠️ No subscription for heartbeat');
        return false;
      }
      
      const response = await api.post('/push-notifications/heartbeat', {
        device_id: deviceId,
        endpoint: subscription.endpoint,
        device_info: this.deviceFingerprint,
        timestamp: new Date().toISOString(),
        subscription_valid: true
      });
      
      if (response.data.success) {
        this.lastVerified = new Date();
        console.log('💓 Heartbeat sent successfully');
        return true;
      } else {
        console.warn('⚠️ Heartbeat failed:', response.data.message);
        return false;
      }
    } catch (error) {
      console.error('❌ Heartbeat error:', error);
      return false;
    }
  }

  /**
   * Auto-recovery: Re-register and re-subscribe if needed
   */
  async autoRecover() {
    if (this.isRecovering) {
      console.log('ℹ️ Recovery already in progress');
      return false;
    }
    
    try {
      this.isRecovering = true;
      console.log('🔄 Starting auto-recovery...');
      
      // Step 1: Check service worker health
      const health = await this.checkServiceWorkerHealth();
      
      if (!health.healthy) {
        console.log('🔧 Re-registering service worker...');
        await this.registerServiceWorker();
      }
      
      // Step 2: Validate subscription
      const validation = await this.validateSubscription();
      
      if (!validation.valid) {
        console.log('🔧 Re-subscribing to push notifications...');
        
        // Check permission first
        if (Notification.permission === 'granted') {
          await this.subscribeToVapid();
        } else {
          console.warn('⚠️ Cannot auto-recover: notification permission not granted');
          return false;
        }
      }
      
      // Step 3: Verify with backend
      try {
        const backendStatus = await this.checkSubscriptionStatusFromBackend();
        if (!backendStatus.isSubscribed) {
          console.log('🔧 Re-registering with backend...');
          const subscription = await this.registration.pushManager.getSubscription();
          if (subscription) {
            await this.updateVapidSubscription(subscription);
          }
        }
      } catch (error) {
        console.warn('⚠️ Backend verification failed during recovery:', error.message);
      }
      
      console.log('✅ Auto-recovery completed');
      return true;
    } catch (error) {
      console.error('❌ Auto-recovery failed:', error);
      return false;
    } finally {
      this.isRecovering = false;
    }
  }

  /**
   * Start health monitoring
   * Runs periodic checks to ensure everything is working
   */
  startHealthMonitoring() {
    // Stop any existing monitoring
    this.stopHealthMonitoring();
    
    console.log('🏥 Starting health monitoring...');
    
    // Health check every 2 minutes
    this.healthCheckInterval = setInterval(async () => {
      console.log('🏥 Running health check...');
      
      const health = await this.checkServiceWorkerHealth();
      const validation = await this.validateSubscription();
      
      if (!health.healthy || !validation.valid) {
        console.warn('⚠️ Health check failed, triggering auto-recovery');
        await this.autoRecover();
      }
    }, 2 * 60 * 1000); // 2 minutes
    
    // Heartbeat every 5 minutes
    this.heartbeatInterval = setInterval(async () => {
      await this.sendHeartbeat();
    }, 5 * 60 * 1000); // 5 minutes
    
    // Send initial heartbeat
    setTimeout(() => this.sendHeartbeat(), 5000); // After 5 seconds
    
    console.log('✅ Health monitoring started');
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    console.log('🛑 Health monitoring stopped');
  }

  /**
   * Ensure user is subscribed (with auto-recovery)
   */
  async ensureSubscribed() {
    try {
      console.log('🔍 Ensuring subscription is active...');
      
      // Check service worker
      const health = await this.checkServiceWorkerHealth();
      if (!health.healthy) {
        console.log('🔧 Service worker unhealthy, recovering...');
        await this.autoRecover();
        return;
      }
      
      // Check subscription
      const validation = await this.validateSubscription();
      if (!validation.valid) {
        console.log('🔧 Subscription invalid, recovering...');
        await this.autoRecover();
        return;
      }
      
      // Verify with backend
      try {
        const backendStatus = await this.checkSubscriptionStatusFromBackend();
        if (!backendStatus.isSubscribed) {
          console.log('🔧 Not registered with backend, recovering...');
          await this.autoRecover();
        } else {
          console.log('✅ Subscription verified and active');
        }
      } catch (error) {
        console.warn('⚠️ Could not verify with backend:', error.message);
      }
    } catch (error) {
      console.error('❌ Error ensuring subscription:', error);
    }
  }
}

// Create and export singleton instance
const pushNotificationService = new PushNotificationService();

export default pushNotificationService;

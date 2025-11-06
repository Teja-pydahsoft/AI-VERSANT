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
   * Initialize OneSignal ONLY (No VAPID conflicts)
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

      console.log('🔔 Initializing OneSignal ONLY (No VAPID)...');

      // Generate device fingerprint
      const deviceId = this.getDeviceId();
      console.log('🔑 Device ID:', deviceId);

      // ONLY initialize OneSignal (no VAPID)
      console.log('📱 Initializing OneSignal as ONLY notification service...');
      const oneSignalInitialized = await oneSignalService.initialize();
      console.log('OneSignal initialization:', oneSignalInitialized ? '✅' : '❌');

      if (oneSignalInitialized) {
        // Check OneSignal subscription status
        const oneSignalStatus = await oneSignalService.checkSubscriptionStatus();
        this.isOneSignalSubscribed = oneSignalStatus;
        this.isVapidSubscribed = false; // No VAPID

        console.log('✅ OneSignal initialized as ONLY notification service');
      } else {
        console.error('❌ OneSignal initialization failed');
        return false;
      }

      // Setup notification click handler
      this.setupNotificationClickHandler();

      console.log('✅ OneSignal-only push notification service initialized');
      console.log('📊 Local Status:', {
        oneSignal: this.isOneSignalSubscribed,
        vapid: false, // No VAPID
        deviceId: deviceId,
        service: 'OneSignal ONLY'
      });

      // Restore subscription state from backend
      try {
        console.log('🔄 Restoring OneSignal subscription state from backend...');
        const restoreResult = await this.restoreSubscriptionState();
        console.log('📊 OneSignal subscription state restored:', restoreResult);
      } catch (error) {
        console.warn('⚠️ Could not restore OneSignal subscription state:', error.message);
      }

      // Start health monitoring
      this.startHealthMonitoring();

      // Run initial health check
      setTimeout(() => this.ensureSubscribed(), 10000); // After 10 seconds

      return true;
    } catch (error) {
      console.error('❌ OneSignal-only push notification service initialization failed:', error);
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
   * Subscribe to OneSignal ONLY (No VAPID)
   */
  async subscribeToAll() {
    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Notification permission denied');
      }

      // Subscribe ONLY to OneSignal
      const oneSignalResult = await oneSignalService.subscribe();

      return {
        oneSignal: oneSignalResult,
        vapid: false, // No VAPID
        success: oneSignalResult
      };
    } catch (error) {
      console.error('Failed to subscribe to OneSignal notifications:', error);
      return { oneSignal: false, vapid: false, success: false };
    }
  }

  /**
   * Register service worker for VAPID
   * PRIORITY: Use OneSignal service worker if available, fallback to VAPID
   */
  async registerServiceWorker() {
    try {
      // Check if OneSignal service worker is already registered
      const existingReg = await navigator.serviceWorker.getRegistration();

      if (existingReg && existingReg.active) {
        const scriptURL = existingReg.active.scriptURL;
        console.log('✅ Using existing service worker:', scriptURL);

        // Check if it's OneSignal service worker
        if (scriptURL.includes('OneSignalSDKWorker.js') || scriptURL.includes('OneSignal')) {
          console.log('📱 OneSignal service worker detected - using as primary');
          this.registration = existingReg;
          return true;
        }

        // Check if it's our VAPID service worker
        if (scriptURL.includes('service-worker.js')) {
          console.log('🔄 VAPID service worker already registered');
          this.registration = existingReg;
          return true;
        }
      }

      // No existing service worker - register OneSignal first, then VAPID as fallback
      console.log('📝 No existing service worker - will rely on OneSignal service worker');

      // Don't register VAPID service worker if OneSignal is available
      // OneSignal will handle service worker registration
      console.log('ℹ️ Skipping VAPID service worker registration - OneSignal will handle it');
      return false;
    } catch (error) {
      console.error('❌ Service Worker registration check failed:', error);
      throw error;
    }
  }

  /**
   * Check existing VAPID subscription and restore state
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

        // Check if subscription is still valid (not expired)
        if (subscription.expirationTime && subscription.expirationTime < Date.now()) {
          console.log('⚠️ VAPID subscription expired, removing...');
          await subscription.unsubscribe();
          this.vapidSubscription = null;
          this.isVapidSubscribed = false;
          return false;
        }

        // Verify subscription is still valid with backend
        try {
          await this.updateVapidSubscription(subscription);
          console.log('✅ VAPID subscription verified with backend');
        } catch (error) {
          console.warn('⚠️ Failed to verify subscription with backend:', error.message);
          // Don't throw - subscription might still be valid locally
          // But mark as potentially invalid
          console.log('⚠️ VAPID subscription may be invalid - will re-verify on next heartbeat');
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
   * Subscribe to OneSignal ONLY (No VAPID)
   */
  async subscribe() {
    try {
      console.log('📝 Subscribing to OneSignal ONLY...');

      const oneSignalResult = await this.subscribeToOneSignal();

      if (oneSignalResult) {
        console.log('✅ OneSignal subscription successful');
        this.isOneSignalSubscribed = true;
        this.isVapidSubscribed = false; // No VAPID
      } else {
        console.warn('⚠️ OneSignal subscription failed');
      }

      return this.isOneSignalSubscribed;
    } catch (error) {
      console.error('❌ OneSignal subscription failed:', error);
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

        // Update backend with device info
        await this.updateVapidSubscription(existingSubscription);
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

      // Send to backend with device information
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
      const deviceInfo = this.deviceFingerprint;

      const response = await api.post('/push-notifications/subscribe', {
        subscription: subscription.toJSON(),
        browser: navigator.userAgent,
        platform: 'web',
        device_id: deviceId,
        device_info: deviceInfo,
        last_verified: new Date().toISOString()
      });

      if (!response.data.success) {
        throw new Error('Failed to update subscription on backend');
      }

      this.lastVerified = new Date();
      console.log('✅ VAPID subscription updated on backend with device info');
      console.log('🔑 Device ID:', deviceId);
      console.log('📱 Device Info:', deviceInfo);
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
   * Get subscription status (OneSignal ONLY)
   */
  getSubscriptionStatus() {
    return {
      isSupported: this.isSupported,
      isSubscribed: this.isOneSignalSubscribed,
      oneSignal: this.isOneSignalSubscribed,
      vapid: false, // No VAPID
      hasPermission: Notification.permission === 'granted',
      subscription: null, // No VAPID subscription
      deviceId: this.deviceId,
      service: 'OneSignal ONLY'
    };
  }

  /**
   * Check subscription status from backend and restore local state
   */
  async checkSubscriptionStatusFromBackend() {
    try {
      const response = await api.get('/push-notifications/subscription-status');
      if (response.data.success) {
        const status = response.data;
        console.log('📊 Backend subscription status:', status);

        const result = {
          isSubscribed: status.is_subscribed,
          subscriptions: status.subscriptions,
          details: status.details
        };

        // Restore local state based on backend data
        if (status.is_subscribed) {
          if (status.subscriptions.onesignal) {
            this.isOneSignalSubscribed = true;
            console.log('✅ Restored OneSignal subscription state from backend');
          }
          if (status.subscriptions.vapid) {
            this.isVapidSubscribed = true;
            console.log('✅ Restored VAPID subscription state from backend');
          }
        } else {
          this.isOneSignalSubscribed = false;
          this.isVapidSubscribed = false;
          console.log('ℹ️ No active subscriptions found in backend');
        }

        return result;
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
      const deviceInfo = this.deviceFingerprint;
      const subscription = await this.registration?.pushManager.getSubscription();

      if (!subscription) {
        console.warn('⚠️ No subscription for heartbeat');
        return false;
      }

      const response = await api.post('/push-notifications/heartbeat', {
        device_id: deviceId,
        endpoint: subscription.endpoint,
        device_info: deviceInfo,
        timestamp: new Date().toISOString(),
        subscription_valid: true,
        user_agent: navigator.userAgent,
        platform: 'web'
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

      // First, check backend status to restore local state
      try {
        console.log('🔄 Restoring subscription state from backend...');
        await this.checkSubscriptionStatusFromBackend();
        console.log('✅ Backend state restored');
      } catch (error) {
        console.warn('⚠️ Could not restore from backend:', error.message);
      }

      // Check if current device needs subscription
      const deviceNeedsSubscription = await this.checkDeviceSubscriptionStatus();
      if (deviceNeedsSubscription) {
        console.log('📱 Current device needs subscription - prompting user...');
        await this.promptForSubscription();
        return;
      }

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

      // Final verification with backend
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

  /**
   * Check if current device needs subscription
   */
  async checkDeviceSubscriptionStatus() {
    try {
      const deviceId = this.getDeviceId();
      console.log('🔍 Checking subscription status for device:', deviceId);

      // Restore subscription state for this device
      const deviceState = await this.restoreSubscriptionState();

      // If device has no subscriptions, it needs subscription
      if (deviceState.total === 0) {
        console.log('📱 Device has no subscriptions - needs subscription');
        return true;
      }

      // If device has subscriptions but they're not active locally, check if we need to re-subscribe
      if (!this.isOneSignalSubscribed && !this.isVapidSubscribed) {
        console.log('📱 Device subscriptions exist in backend but not active locally - may need re-subscription');
        return true;
      }

      console.log('✅ Device subscription is active');
      return false;
    } catch (error) {
      console.error('❌ Error checking device subscription status:', error);
      return true; // Default to needing subscription on error
    }
  }

  /**
   * Prompt user for subscription if needed
   */
  async promptForSubscription() {
    try {
      console.log('🔄 Prompting user for push notification subscription...');

      // Check if we already have permission
      if (Notification.permission === 'granted') {
        console.log('✅ Notification permission already granted - subscribing...');
        await this.subscribe();
        return;
      }

      // Request permission
      const permission = await Notification.requestPermission();

      if (permission === 'granted') {
        console.log('✅ Notification permission granted - subscribing...');
        await this.subscribe();
      } else {
        console.log('❌ Notification permission denied by user');
      }
    } catch (error) {
      console.error('❌ Error prompting for subscription:', error);
    }
  }

  /**
   * Restore subscription state after browser restart
   */
  async restoreSubscriptionState() {
    try {
      console.log('🔄 Restoring subscription state after browser restart...');

      // Get device ID
      const deviceId = this.getDeviceId();
      console.log('🔑 Current device ID:', deviceId);

      // Check backend for existing subscriptions for this device
      const response = await api.get(`/push-notifications/device-subscriptions/${deviceId}`);

      if (response.data.success && response.data.subscriptions) {
        const subscriptions = response.data.subscriptions;

        console.log(`📊 Found ${subscriptions.length} subscriptions for device ${deviceId}`);

        // Restore OneSignal state
        const oneSignalSub = subscriptions.find(s => s.provider === 'onesignal');
        if (oneSignalSub) {
          this.isOneSignalSubscribed = true;
          console.log('✅ Restored OneSignal subscription state');
        }

        // Restore VAPID state
        const vapidSub = subscriptions.find(s => s.provider === 'vapid');
        if (vapidSub) {
          this.isVapidSubscribed = true;
          console.log('✅ Restored VAPID subscription state');
        }

        return {
          oneSignal: !!oneSignalSub,
          vapid: !!vapidSub,
          total: subscriptions.length
        };
      } else {
        console.log('ℹ️ No existing subscriptions found for this device');

        // Check if user has subscriptions on other devices
        try {
          const allDevicesResponse = await api.get('/push-notifications/user-devices');
          if (allDevicesResponse.data.success && allDevicesResponse.data.devices.length > 0) {
            console.log('📱 User has subscriptions on other devices:', allDevicesResponse.data.devices.length);
            console.log('🔄 This device needs subscription for push notifications');
          }
        } catch (deviceError) {
          console.warn('⚠️ Could not check other devices:', deviceError.message);
        }

        return { oneSignal: false, vapid: false, total: 0 };
      }
    } catch (error) {
      console.error('❌ Error restoring subscription state:', error);
      return { oneSignal: false, vapid: false, total: 0 };
    }
  }
}

// Create and export singleton instance
const pushNotificationService = new PushNotificationService();

export default pushNotificationService;

/**
 * OneSignal Push Notification Service
 * Handles OneSignal Web Push SDK integration
 */

class OneSignalService {
  constructor() {
    this.isSupported = 'serviceWorker' in navigator && 'PushManager' in window;
    this.isInitialized = false;
    this.isSubscribed = false;
    this.appId = "ee224f6c-70c4-4414-900b-c283db5ea114";
    this.oneSignal = null;
  }

  /**
   * Initialize OneSignal with proper state restoration
   */
  async initialize() {
    if (!this.isSupported) {
      console.warn('OneSignal: Push notifications are not supported in this browser');
      return false;
    }

    try {
      console.log('🔔 Initializing OneSignal...');

      // Load OneSignal SDK if not already loaded
      if (typeof window.OneSignal === 'undefined') {
        await this.loadOneSignalSDK();
      }

      this.oneSignal = window.OneSignal;

      // Check if OneSignal is already initialized
      if (this.isInitialized) {
        console.log('✅ OneSignal already initialized');
        await this.checkSubscriptionStatus();
        return true;
      }

      // Initialize OneSignal only if not already initialized
      // IMPORTANT: Auto-prompt is disabled - only show after user login
      await this.oneSignal.init({
        appId: this.appId,
        safari_web_id: "web.onesignal.auto.ee224f6c-70c4-4414-900b-c283db5ea114",
        autoResubscribe: true,
        serviceWorkerParam: { scope: '/' },
        serviceWorkerPath: 'OneSignalSDKWorker.js',
        notifyButton: {
          enable: true,
          showCredit: false,
          text: {
            "tip.state.unsubscribed": "Subscribe to VERSANT notifications",
            "tip.state.subscribed": "You're subscribed to VERSANT notifications",
            "tip.state.blocked": "You've blocked notifications",
            "message.prenotify": "Click to subscribe to VERSANT notifications",
            "message.action.subscribed": "Thanks for subscribing to VERSANT!",
            "message.action.resubscribed": "You're subscribed to VERSANT notifications",
            "message.action.unsubscribed": "You won't receive VERSANT notifications",
            "dialog.main.title": "VERSANT Notifications",
            "dialog.main.button.subscribe": "SUBSCRIBE",
            "dialog.main.button.unsubscribe": "UNSUBSCRIBE",
            "dialog.blocked.title": "Unblock VERSANT Notifications",
            "dialog.blocked.message": "Follow these instructions to allow VERSANT notifications:"
          }
        },
        // Custom prompt options - DISABLED auto-prompt
        promptOptions: {
          slidedown: {
            enabled: false,  // Disabled - will only show when user is logged in
            autoPrompt: false,  // Disabled - prevent auto-prompting
            timeDelay: 0,
            pageViews: 0,
            actionMessage: "We'd like to show you notifications for the latest VERSANT updates.",
            acceptButtonText: "Allow",
            cancelButtonText: "No Thanks"
          }
        }
      });

      this.isInitialized = true;
      console.log('✅ OneSignal initialized successfully');
      console.log('📍 OneSignal App ID:', this.appId);

      // Check subscription status with backend restoration
      await this.checkSubscriptionStatus();

      // Add event listeners for OneSignal's default bell button
      this.setupOneSignalEventListeners();

      return true;
    } catch (error) {
      console.error('❌ OneSignal initialization failed:', error);
      return false;
    }
  }

  /**
   * Setup event listeners for OneSignal's default bell button
   */
  setupOneSignalEventListeners() {
    try {
      // Listen for subscription change events
      if (this.oneSignal.on && this.oneSignal.on.subscriptionChange) {
        this.oneSignal.on('subscriptionChange', (isSubscribed) => {
          console.log('🔔 OneSignal subscription changed:', isSubscribed);
          this.handleSubscriptionChange(isSubscribed);
        });
      }

      // Also listen for notification permission changes
      if (this.oneSignal.on && this.oneSignal.on.permissionChange) {
        this.oneSignal.on('permissionChange', (permission) => {
          console.log('🔔 OneSignal permission changed:', permission);
          this.handlePermissionChange(permission);
        });
      }

      console.log('✅ OneSignal event listeners setup complete');
    } catch (error) {
      console.error('❌ Error setting up OneSignal event listeners:', error);
    }
  }

  /**
   * Handle subscription change from OneSignal's default bell button
   */
  async handleSubscriptionChange(isSubscribed) {
    try {
      if (isSubscribed) {
        // User subscribed via OneSignal's default bell button
        const playerId = await this.getUserId();
        console.log('🔔 User subscribed via OneSignal bell button, Player ID:', playerId);
        
        // Send to backend to store the player ID
        await this.notifyBackendOfSubscription(playerId);
      } else {
        // User unsubscribed
        console.log('🔔 User unsubscribed via OneSignal bell button');
        await this.notifyBackendOfUnsubscription();
      }
    } catch (error) {
      console.error('❌ Error handling subscription change:', error);
    }
  }

  /**
   * Handle permission change from OneSignal
   */
  async handlePermissionChange(permission) {
    try {
      if (permission === 'granted') {
        // Permission granted, user is now subscribed
        const playerId = await this.getUserId();
        console.log('🔔 Permission granted, Player ID:', playerId);
        await this.notifyBackendOfSubscription(playerId);
      } else if (permission === 'denied') {
        // Permission denied, user is unsubscribed
        console.log('🔔 Permission denied, user unsubscribed');
        await this.notifyBackendOfUnsubscription();
      }
    } catch (error) {
      console.error('❌ Error handling permission change:', error);
    }
  }

  /**
   * Notify backend of subscription
   */
  async notifyBackendOfSubscription(playerId) {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.warn('🔔 No auth token found, skipping backend notification');
        return;
      }

      const response = await fetch('/api/onesignal/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          player_id: playerId,
          onesignal_user_id: playerId
        })
      });

      if (response.ok) {
        console.log('✅ Backend notified of OneSignal subscription');
      } else {
        console.error('❌ Failed to notify backend of subscription:', response.status);
      }
    } catch (error) {
      console.error('❌ Error notifying backend of subscription:', error);
    }
  }

  /**
   * Notify backend of unsubscription
   */
  async notifyBackendOfUnsubscription() {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.warn('🔔 No auth token found, skipping backend notification');
        return;
      }

      const response = await fetch('/api/onesignal/unsubscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        console.log('✅ Backend notified of OneSignal unsubscription');
      } else {
        console.error('❌ Failed to notify backend of unsubscription:', response.status);
      }
    } catch (error) {
      console.error('❌ Error notifying backend of unsubscription:', error);
    }
  }

  /**
   * Load OneSignal SDK dynamically
   */
  loadOneSignalSDK() {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if (typeof window.OneSignal !== 'undefined') {
        resolve();
        return;
      }

      // Check if script is already being loaded
      if (document.querySelector('script[src*="OneSignalSDK.page.js"]')) {
        this.waitForOneSignal().then(resolve).catch(reject);
        return;
      }

      // Load the OneSignal SDK
      const script = document.createElement('script');
      script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
      script.defer = true;
      script.onload = () => {
        console.log('✅ OneSignal SDK loaded successfully');
        this.waitForOneSignal().then(resolve).catch(reject);
      };
      script.onerror = () => {
        console.error('❌ Failed to load OneSignal SDK');
        reject(new Error('Failed to load OneSignal SDK'));
      };

      document.head.appendChild(script);
    });
  }

  /**
   * Wait for OneSignal SDK to be available
   */
  waitForOneSignal() {
    return new Promise((resolve) => {
      if (typeof window.OneSignal !== 'undefined') {
        resolve();
        return;
      }

      const checkOneSignal = () => {
        if (typeof window.OneSignal !== 'undefined') {
          resolve();
        } else {
          setTimeout(checkOneSignal, 100);
        }
      };

      checkOneSignal();
    });
  }

  /**
   * Check subscription status and restore from backend if needed
   */
  async checkSubscriptionStatus() {
    try {
      if (!this.oneSignal) {
        console.log('ℹ️ OneSignal not initialized yet');
        return false;
      }

      // Check if OneSignal is properly initialized
      if (!this.oneSignal.Notifications) {
        console.log('ℹ️ OneSignal Notifications API not ready yet');
        return false;
      }

      // First check backend for subscription status
      try {
        const token = localStorage.getItem('token');
        if (token) {
          const response = await fetch('/api/onesignal/subscription-status', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (response.ok) {
            const backendStatus = await response.json();
            if (backendStatus.success && backendStatus.is_subscribed) {
              console.log('✅ Backend shows OneSignal subscription active');
              this.isSubscribed = true;

              // Get player ID from backend
              const playerId = backendStatus.player_id;
              if (playerId) {
                console.log('✅ Restored OneSignal Player ID from backend:', playerId);
              }

              return true;
            }
          }
        }
      } catch (error) {
        console.warn('⚠️ Could not check backend subscription status:', error.message);
      }

      // Fallback to OneSignal API check
      const permission = this.oneSignal.Notifications.permission;
      this.isSubscribed = permission === true;

      // Get player ID if subscribed
      if (this.isSubscribed) {
        const playerId = await this.getUserId();
        console.log('✅ OneSignal subscribed, Player ID:', playerId);
      } else {
        console.log('ℹ️ OneSignal not subscribed yet');
      }

      console.log('📊 OneSignal status:', {
        permission,
        isSubscribed: this.isSubscribed
      });

      return this.isSubscribed;
    } catch (error) {
      console.error('❌ Error checking OneSignal subscription status:', error);
      return false;
    }
  }

  /**
   * Subscribe to push notifications
   */
  async subscribe() {
    if (!this.isInitialized) {
      console.error('❌ OneSignal not initialized');
      throw new Error('OneSignal not initialized');
    }

    try {
      console.log('📝 Subscribing to OneSignal...');
      
      // Check if OneSignal Notifications API is available
      if (!this.oneSignal.Notifications) {
        throw new Error('OneSignal Notifications API not available');
      }

      // Check current permission status using OneSignal v16 API
      const currentPermission = this.oneSignal.Notifications.permission;
      
      if (currentPermission === true) {
        this.isSubscribed = true;
        const playerId = await this.getUserId();
        console.log('✅ OneSignal already subscribed, Player ID:', playerId);
        
        // Notify backend
        if (playerId) {
          await this.notifyBackendOfSubscription(playerId);
        }
        
        return true;
      }

      // Request permission using OneSignal v16 API
      if (this.oneSignal.Notifications.requestPermission) {
        console.log('🔔 Requesting OneSignal permission...');
        const permission = await this.oneSignal.Notifications.requestPermission();
        
        if (permission) {
          this.isSubscribed = true;
          const playerId = await this.getUserId();
          console.log('✅ OneSignal subscription successful, Player ID:', playerId);
          
          // Notify backend
          if (playerId) {
            await this.notifyBackendOfSubscription(playerId);
          }
          
          return true;
        } else {
          console.log('❌ OneSignal subscription denied by user');
          return false;
        }
      } else {
        // Fallback: just check permission status
        const permission = this.oneSignal.Notifications.permission;
        this.isSubscribed = permission === true;
        console.log('OneSignal permission status:', permission);
        return this.isSubscribed;
      }
    } catch (error) {
      console.error('❌ OneSignal subscription failed:', error);
      throw error;
    }
  }

  /**
   * Unsubscribe from push notifications
   */
  async unsubscribe() {
    if (!this.isInitialized) {
      throw new Error('OneSignal not initialized');
    }

    try {
      // Check if OneSignal Notifications API is available
      if (!this.oneSignal.Notifications) {
        throw new Error('OneSignal Notifications API not available');
      }

      // Use OneSignal v16 API for unsubscription
      if (this.oneSignal.Notifications.setConsentGiven) {
        await this.oneSignal.Notifications.setConsentGiven(false);
        this.isSubscribed = false;
        console.log('✅ OneSignal unsubscription successful');
        return true;
      } else {
        console.warn('OneSignal setConsentGiven not available, marking as unsubscribed');
        this.isSubscribed = false;
        return true;
      }
    } catch (error) {
      console.error('❌ OneSignal unsubscription failed:', error);
      throw error;
    }
  }

  /**
   * Send test notification (admin only)
   */
  async sendTestNotification() {
    try {
      const response = await fetch('/api/onesignal/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        console.log('✅ OneSignal test notification sent');
        return true;
      } else {
        throw new Error('Failed to send test notification');
      }
    } catch (error) {
      console.error('❌ OneSignal test notification failed:', error);
      throw error;
    }
  }

  /**
   * Send notification to all users (admin only)
   */
  async sendToAll(title, body, data = {}, icon = null, url = null) {
    try {
      const response = await fetch('/api/onesignal/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          title,
          body,
          data,
          icon,
          url
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ OneSignal broadcast sent:', result);
        return result;
      } else {
        throw new Error('Failed to send broadcast notification');
      }
    } catch (error) {
      console.error('❌ OneSignal broadcast failed:', error);
      throw error;
    }
  }

  /**
   * Send notification to specific user (admin only)
   */
  async sendToUser(userId, title, body, data = {}, icon = null, url = null) {
    try {
      const response = await fetch('/api/onesignal/send-to-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          user_id: userId,
          title,
          body,
          data,
          icon,
          url
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ OneSignal user notification sent:', result);
        return result;
      } else {
        throw new Error('Failed to send user notification');
      }
    } catch (error) {
      console.error('❌ OneSignal user notification failed:', error);
      throw error;
    }
  }

  /**
   * Send notification to users with specific role (admin only)
   */
  async sendToRole(role, title, body, data = {}, icon = null, url = null) {
    try {
      const response = await fetch('/api/onesignal/send-to-role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          role,
          title,
          body,
          data,
          icon,
          url
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ OneSignal role notification sent:', result);
        return result;
      } else {
        throw new Error('Failed to send role notification');
      }
    } catch (error) {
      console.error('❌ OneSignal role notification failed:', error);
      throw error;
    }
  }

  /**
   * Get subscription status
   */
  getSubscriptionStatus() {
    return {
      isSupported: this.isSupported,
      isInitialized: this.isInitialized,
      isSubscribed: this.isSubscribed,
      appId: this.appId
    };
  }

  /**
   * Get user ID from OneSignal
   */
  async getUserId() {
    if (!this.isInitialized) return null;

    try {
      // Use OneSignal v16 API to get user ID
      if (this.oneSignal.User && this.oneSignal.User.onesignalId) {
        const userId = this.oneSignal.User.onesignalId;
        return userId;
      } else if (this.oneSignal.getUserId) {
        const userId = await this.oneSignal.getUserId();
        return userId;
      } else {
        console.warn('OneSignal User API not available');
        return null;
      }
    } catch (error) {
      console.error('❌ Error getting OneSignal user ID:', error);
      return null;
    }
  }

  /**
   * Set user tags for segmentation
   */
  async setUserTags(tags) {
    if (!this.isInitialized) return false;

    try {
      // Use OneSignal v16 API for setting tags
      if (this.oneSignal.User && this.oneSignal.User.addTags) {
        await this.oneSignal.User.addTags(tags);
        console.log('✅ OneSignal user tags set:', tags);
        return true;
      } else if (this.oneSignal.sendTags) {
        await this.oneSignal.sendTags(tags);
        console.log('✅ OneSignal user tags set:', tags);
        return true;
      } else {
        console.warn('OneSignal User API not available for setting tags');
        return false;
      }
    } catch (error) {
      console.error('❌ Error setting OneSignal user tags:', error);
      return false;
    }
  }

  /**
   * Get notification statistics (admin only)
   */
  async getStats() {
    try {
      const response = await fetch('/api/onesignal/stats', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const stats = await response.json();
        return stats;
      } else {
        throw new Error('Failed to get OneSignal statistics');
      }
    } catch (error) {
      console.error('❌ Error getting OneSignal statistics:', error);
      throw error;
    }
  }
}

// Create and export singleton instance
const oneSignalService = new OneSignalService();

export default oneSignalService;

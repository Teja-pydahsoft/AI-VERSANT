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
   * Initialize OneSignal
   */
  async initialize() {
    if (!this.isSupported) {
      console.warn('OneSignal: Push notifications are not supported in this browser');
      return false;
    }

    try {
      // Load OneSignal SDK if not already loaded
      if (typeof window.OneSignal === 'undefined') {
        await this.loadOneSignalSDK();
      }

      this.oneSignal = window.OneSignal;

      // Check if OneSignal is already initialized
      if (this.oneSignal.Notifications && this.oneSignal.Notifications.permission !== undefined) {
        console.log('✅ OneSignal already initialized, checking if fully functional...');
        
        // Check if OneSignal is actually functional
        if (this.oneSignal.Notifications.requestPermission && this.oneSignal.User) {
          console.log('✅ OneSignal is fully functional, skipping initialization');
          this.isInitialized = true;
          await this.checkSubscriptionStatus();
          await this.ensureNotificationButtonVisible();
          return true;
        } else {
          console.log('⚠️ OneSignal appears initialized but not fully functional, re-initializing...');
        }
      }

      // Check if OneSignal is partially initialized but not fully ready
      if (this.oneSignal.init && typeof this.oneSignal.init === 'function') {
        console.log('OneSignal SDK loaded but not initialized, proceeding with initialization');
      } else {
        console.log('OneSignal SDK not ready, waiting...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Initialize OneSignal only if not already initialized
      await this.oneSignal.init({
        appId: this.appId,
        safari_web_id: "web.onesignal.auto.ee224f6c-70c4-4414-900b-c283db5ea114",
        autoResubscribe: true,
        notifyButton: {
          enable: true,
          showCredit: false,
          position: "bottom-right",
          size: "medium",
          theme: "default",
          colors: {
            "circle.background": "#ff4444",
            "circle.foreground": "#ffffff",
            "badge.background": "#ff4444",
            "badge.foreground": "#ffffff",
            "badge.bordercolor": "#ff4444",
            "pulse.color": "#ff4444",
            "dialog.button.background": "#ff4444",
            "dialog.button.foreground": "#ffffff"
          },
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
        // Custom prompt options
        promptOptions: {
          slidedown: {
            enabled: true,
            autoPrompt: true,
            timeDelay: 10,
            pageViews: 1,
            actionMessage: "We'd like to show you notifications for the latest VERSANT updates.",
            acceptButtonText: "Allow",
            cancelButtonText: "No Thanks"
          }
        }
      });

      this.isInitialized = true;
      console.log('✅ OneSignal initialized successfully');

      // Check subscription status
      await this.checkSubscriptionStatus();

      // Ensure notification button is visible
      await this.ensureNotificationButtonVisible();

      return true;
    } catch (error) {
      console.error('❌ OneSignal initialization failed:', error);
      return false;
    }
  }

  /**
   * Ensure notification button is visible
   */
  async ensureNotificationButtonVisible() {
    try {
      if (!this.oneSignal || !this.oneSignal.Notifications) {
        console.log('OneSignal not ready for button visibility check');
        return;
      }

      // Check if notification button should be shown
      const permission = this.oneSignal.Notifications.permission;
      
      console.log('🔔 OneSignal permission status:', permission);
      
      if (permission === false) {
        console.log('🔔 OneSignal notification button should be visible (permission denied)');
        
        // Force show the notification button by triggering a permission request
        if (this.oneSignal.Notifications.requestPermission) {
          console.log('🔔 Attempting to show notification prompt');
          // Don't actually request permission, just trigger the button to appear
        }
      } else if (permission === true) {
        console.log('🔔 OneSignal notification button should be visible (permission granted)');
      } else {
        console.log('🔔 OneSignal notification button should be visible (permission not set)');
      }

      // Force show the notification button
      await this.forceShowNotificationButton();
    } catch (error) {
      console.error('❌ Error ensuring notification button visibility:', error);
    }
  }

  /**
   * Force show the notification button
   */
  async forceShowNotificationButton() {
    try {
      // Check if the notification button element exists
      const buttonElement = document.querySelector('.onesignal-bell-launcher-button');
      
      if (buttonElement) {
        console.log('🔔 OneSignal notification button found in DOM');
        buttonElement.style.display = 'block';
        buttonElement.style.visibility = 'visible';
      } else {
        console.log('🔔 OneSignal notification button not found in DOM, checking for other elements...');
        
        // Look for other possible OneSignal button elements
        const possibleButtons = document.querySelectorAll('[class*="onesignal"], [class*="notification"], [id*="onesignal"]');
        console.log('🔔 Found OneSignal elements:', possibleButtons);
        
        // Try to trigger the button to appear by calling OneSignal methods
        if (this.oneSignal.Notifications && this.oneSignal.Notifications.requestPermission) {
          console.log('🔔 Attempting to trigger notification button appearance...');
          // This might trigger the button to appear
        }
      }
    } catch (error) {
      console.error('❌ Error forcing notification button visibility:', error);
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
   * Check subscription status
   */
  async checkSubscriptionStatus() {
    try {
      if (!this.oneSignal) return false;

      // Check if OneSignal is properly initialized
      if (!this.oneSignal.Notifications) {
        console.log('OneSignal not fully initialized yet');
        return false;
      }

      // Use the correct OneSignal v16 API
      const isOptedIn = this.oneSignal.Notifications.permission;
      
      this.isSubscribed = isOptedIn === true;
      
      console.log('OneSignal subscription status:', {
        isOptedIn,
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
      throw new Error('OneSignal not initialized');
    }

    try {
      // Check current permission status using correct OneSignal v16 API
      const currentPermission = this.oneSignal.Notifications.permission;
      
      if (currentPermission === true) {
        this.isSubscribed = true;
        console.log('✅ OneSignal already subscribed');
        return true;
      }

      // Request permission using the correct OneSignal v16 method
      if (this.oneSignal.Notifications.requestPermission) {
        const permission = await this.oneSignal.Notifications.requestPermission();
        
        if (permission) {
          this.isSubscribed = true;
          console.log('✅ OneSignal subscription successful');
          return true;
        } else {
          console.log('❌ OneSignal subscription denied');
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
      // Use OneSignal v16 API for unsubscription
      if (this.oneSignal.Notifications && this.oneSignal.Notifications.setConsentGiven) {
        await this.oneSignal.Notifications.setConsentGiven(false);
        this.isSubscribed = false;
        console.log('✅ OneSignal unsubscription successful');
        return true;
      } else {
        console.warn('OneSignal Notifications API not available for unsubscription');
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
      // Use OneSignal v16 API for setting external user ID and tags
      if (this.oneSignal.User && this.oneSignal.User.addAlias) {
        // Set external user ID if provided
        if (tags.userId) {
          await this.oneSignal.User.addAlias('external_user_id', tags.userId);
        }
        
        // Set other tags
        const tagEntries = Object.entries(tags).filter(([key]) => key !== 'userId');
        if (tagEntries.length > 0) {
          const tagObject = Object.fromEntries(tagEntries);
          await this.oneSignal.User.addTags(tagObject);
        }
        
        console.log('✅ OneSignal user tags set:', tags);
        return true;
      } else {
        console.warn('OneSignal User API not available');
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

import { useState, useEffect, useCallback } from 'react';
import pushNotificationService from '../services/pushNotificationService';

/**
 * Custom hook for managing push notifications
 */
export const usePushNotifications = () => {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);

  // Initialize push notification service
  useEffect(() => {
    const initializeService = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const success = await pushNotificationService.initialize();
        if (success) {
          const status = pushNotificationService.getSubscriptionStatus();
          setIsSupported(status.isSupported);
          setIsSubscribed(status.isSubscribed);
          setHasPermission(status.hasPermission);
          
          // Setup notification click handler
          pushNotificationService.setupNotificationClickHandler();
        }
      } catch (err) {
        setError(err.message);
        console.error('Failed to initialize push notifications:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initializeService();
  }, []);

  // Subscribe to push notifications
  const subscribe = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Request permission first
      const permissionGranted = await pushNotificationService.requestPermission();
      if (!permissionGranted) {
        throw new Error('Notification permission denied');
      }
      
      // Subscribe to push notifications
      const success = await pushNotificationService.subscribe();
      if (success) {
        setIsSubscribed(true);
        setHasPermission(true);
      }
    } catch (err) {
      setError(err.message);
      console.error('Failed to subscribe to push notifications:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const success = await pushNotificationService.unsubscribe();
      if (success) {
        setIsSubscribed(false);
      }
    } catch (err) {
      setError(err.message);
      console.error('Failed to unsubscribe from push notifications:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Send test notification
  const sendTestNotification = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      await pushNotificationService.sendTestNotification();
    } catch (err) {
      setError(err.message);
      console.error('Failed to send test notification:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Send notification to specific user (admin only)
  const sendToUser = useCallback(async (userId, title, body, data = {}, icon = null, url = null) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const taskId = await pushNotificationService.sendToUser(userId, title, body, data, icon, url);
      return taskId;
    } catch (err) {
      setError(err.message);
      console.error('Failed to send notification to user:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Send notification to users with specific role (admin only)
  const sendToRole = useCallback(async (role, title, body, data = {}, icon = null, url = null) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const taskId = await pushNotificationService.sendToRole(role, title, body, data, icon, url);
      return taskId;
    } catch (err) {
      setError(err.message);
      console.error('Failed to send notification to role:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Send broadcast notification (superadmin only)
  const broadcast = useCallback(async (title, body, data = {}, icon = null, url = null) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const taskId = await pushNotificationService.broadcast(title, body, data, icon, url);
      return taskId;
    } catch (err) {
      setError(err.message);
      console.error('Failed to send broadcast notification:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Get push notification statistics (admin only)
  const getStats = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const statsData = await pushNotificationService.getStats();
      setStats(statsData);
      return statsData;
    } catch (err) {
      setError(err.message);
      console.error('Failed to get push notification stats:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // State
    isSupported,
    isSubscribed,
    hasPermission,
    isLoading,
    error,
    stats,
    
    // Actions
    subscribe,
    unsubscribe,
    sendTestNotification,
    sendToUser,
    sendToRole,
    broadcast,
    getStats,
    clearError,
    
    // Computed
    canSubscribe: isSupported && !isSubscribed && hasPermission,
    canUnsubscribe: isSupported && isSubscribed,
    canSendNotifications: isSupported && hasPermission
  };
};

export default usePushNotifications;

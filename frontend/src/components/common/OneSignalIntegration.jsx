import React, { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useNotification } from '../../contexts/NotificationContext'
import oneSignalService from '../../services/oneSignalService'

const OneSignalIntegration = () => {
  const { user } = useAuth()
  const { showNotification } = useNotification()
  const [isInitialized, setIsInitialized] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)

  // Initialize OneSignal only when user is logged in
  useEffect(() => {
    if (user) {
      initializeOneSignal()
    }
  }, [user])

  // Setup user tags when user is logged in and OneSignal is initialized
  useEffect(() => {
    if (user && isInitialized) {
      setupUserTags()
      checkAndSubscribeUser()
    }
  }, [user, isInitialized])

  const initializeOneSignal = async () => {
    try {
      // Wait a bit for OneSignal to be ready
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const initialized = await oneSignalService.initialize()
      setIsInitialized(initialized)
      
      if (initialized) {
        const status = oneSignalService.getSubscriptionStatus()
        setIsSubscribed(status.isSubscribed)
      }
    } catch (error) {
      console.error('OneSignal initialization failed:', error)
    }
  }

  const checkAndSubscribeUser = async () => {
    try {
      // Only check subscription status, don't auto-subscribe
      // Let the user click the bell button or we can show a prompt
      const status = oneSignalService.getSubscriptionStatus()
      setIsSubscribed(status.isSubscribed)
      
      // If user is not subscribed, show a subtle notification
      if (!status.isSubscribed && user) {
        console.log('User is logged in but not subscribed to push notifications')
        // The OneSignal bell button will handle the subscription
      }
    } catch (error) {
      console.error('Error checking subscription status:', error)
    }
  }

  const subscribeUser = async () => {
    try {
      const subscribed = await oneSignalService.subscribe()
      setIsSubscribed(subscribed)
      
      if (subscribed) {
        // Get user ID and store it via oneSignalService helper
        const userId = await oneSignalService.getUserId()
        if (userId) {
          await oneSignalService.notifyBackendOfSubscription(userId)
        }

        showNotification('Successfully subscribed to VERSANT notifications!', 'success')
      }
    } catch (error) {
      console.error('OneSignal subscription failed:', error)
      // Don't show error notification for subscription failures
    }
  }

  

  const setupUserTags = async () => {
    if (!user) return

    try {
      const tags = {
        user_id: user.id || user._id,
        role: user.role,
        email: user.email,
        name: user.name || user.username,
        campus: user.campus || 'default',
        course: user.course || 'default'
      }

      await oneSignalService.setUserTags(tags)
      console.log('OneSignal user tags set:', tags)
    } catch (error) {
      console.error('Error setting OneSignal user tags:', error)
    }
  }

  const handleNotificationClick = () => {
    if (!isSubscribed) {
      subscribeUser()
    }
  }

  // This component doesn't render anything visible
  // It just handles OneSignal integration in the background
  return null
}

export default OneSignalIntegration

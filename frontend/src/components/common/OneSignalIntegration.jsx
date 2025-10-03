import React, { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useNotification } from '../../contexts/NotificationContext'
import oneSignalService from '../../services/oneSignalService'
import { debugOneSignalAPI, testOneSignalMethods } from '../../utils/oneSignalDebug'

const OneSignalIntegration = () => {
  const { user } = useAuth()
  const { showNotification } = useNotification()
  const [isInitialized, setIsInitialized] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)

  useEffect(() => {
    initializeOneSignal()
  }, [])

  useEffect(() => {
    if (user && isInitialized) {
      setupUserTags()
    }
  }, [user, isInitialized])

  const initializeOneSignal = async () => {
    try {
      // Debug OneSignal API availability
      debugOneSignalAPI()
      
      // Wait a bit for OneSignal to be ready
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const initialized = await oneSignalService.initialize()
      setIsInitialized(initialized)
      
      if (initialized) {
        // Test OneSignal methods
        await testOneSignalMethods()
        
        const status = oneSignalService.getSubscriptionStatus()
        setIsSubscribed(status.isSubscribed)
        
        // Subscribe user if not already subscribed
        if (!status.isSubscribed) {
          await subscribeUser()
        }
      }
    } catch (error) {
      console.error('OneSignal initialization failed:', error)
    }
  }

  const subscribeUser = async () => {
    try {
      const subscribed = await oneSignalService.subscribe()
      setIsSubscribed(subscribed)
      
      if (subscribed) {
        // Get user ID and store it
        const userId = await oneSignalService.getUserId()
        if (userId) {
          // Store player ID in backend
          await storePlayerId(userId)
        }
        
        showNotification('Successfully subscribed to VERSANT notifications!', 'success')
      }
    } catch (error) {
      console.error('OneSignal subscription failed:', error)
      // Don't show error notification for subscription failures
    }
  }

  const storePlayerId = async (playerId) => {
    try {
      const response = await fetch('/api/onesignal/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ player_id: playerId })
      })

      if (!response.ok) {
        throw new Error('Failed to store player ID')
      }
    } catch (error) {
      console.error('Error storing OneSignal player ID:', error)
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

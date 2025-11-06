import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, BellOff, Check, X } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useNotification } from '../../contexts/NotificationContext'
import oneSignalService from '../../services/oneSignalService'

const NotificationSubscribeButton = () => {
  const { user } = useAuth()
  const { success, error } = useNotification()
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)

  // Check subscription status on mount
  useEffect(() => {
    if (user) {
      checkSubscriptionStatus()
    }
  }, [user])

  const checkSubscriptionStatus = async () => {
    try {
      console.log('🔍 Checking OneSignal subscription status...')
      
      // Check OneSignal local status
      const oneSignalStatus = oneSignalService.getSubscriptionStatus()
      console.log('📊 OneSignal local status:', oneSignalStatus.isSubscribed)
      
      // OneSignal is the source of truth
      setIsSubscribed(oneSignalStatus.isSubscribed)
      
      if (oneSignalStatus.isSubscribed) {
        console.log('✅ User is subscribed to OneSignal notifications')
      } else {
        console.log('ℹ️ User is not subscribed to OneSignal')
      }
      
      setIsInitialized(true)
    } catch (err) {
      console.error('❌ Error checking subscription status:', err)
      setIsInitialized(true)
    }
  }

  const handleSubscribe = async () => {
    if (isSubscribed) {
      // Already subscribed, do nothing
      return
    }

    setIsLoading(true)

    try {
      // Request notification permission
      const permission = await Notification.requestPermission()
      
      if (permission !== 'granted') {
        error('Notification permission denied. Please enable notifications in your browser settings.')
        setIsLoading(false)
        return
      }

      console.log('📱 Subscribing to OneSignal notifications...')
      
      // Subscribe to OneSignal ONLY
      const oneSignalSuccess = await oneSignalService.subscribe()

      if (oneSignalSuccess) {
        setIsSubscribed(true)
        success('🔔 Successfully subscribed to push notifications!')
        console.log('✅ OneSignal subscription successful')
      } else {
        console.error('OneSignal subscription failed')
        throw new Error('Failed to subscribe to push notifications. Please try again or contact support.')
      }
    } catch (err) {
      console.error('Subscription error:', err)
      error('Failed to subscribe to push notifications. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // Don't render if user is not logged in
  if (!user || !isInitialized) {
    return null
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed bottom-6 left-6 z-50"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Tooltip */}
      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg shadow-lg whitespace-nowrap"
          >
            {isSubscribed ? (
              <span className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-400" />
                Notifications Enabled
              </span>
            ) : (
              <span>Click to enable push notifications</span>
            )}
            <div className="absolute bottom-0 left-4 transform translate-y-1/2 rotate-45 w-2 h-2 bg-gray-900"></div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Button */}
      <motion.button
        onClick={handleSubscribe}
        disabled={isSubscribed || isLoading}
        whileHover={!isSubscribed ? { scale: 1.05 } : {}}
        whileTap={!isSubscribed ? { scale: 0.95 } : {}}
        className={`
          relative flex items-center justify-center w-14 h-14 rounded-full shadow-lg
          transition-all duration-300 overflow-hidden
          ${isSubscribed 
            ? 'bg-green-500 cursor-default' 
            : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 cursor-pointer'
          }
          ${isLoading ? 'opacity-75' : ''}
        `}
      >
        {/* Loading Spinner */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-blue-600">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        {/* Icon */}
        {!isLoading && (
          <>
            {isSubscribed ? (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="flex items-center justify-center"
              >
                <Check className="w-6 h-6 text-white" />
              </motion.div>
            ) : (
              <motion.div
                animate={{ 
                  rotate: [0, -10, 10, -10, 0],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  repeatDelay: 3
                }}
              >
                <Bell className="w-6 h-6 text-white" />
              </motion.div>
            )}
          </>
        )}

        {/* Pulse Animation for Unsubscribed State */}
        {!isSubscribed && !isLoading && (
          <span className="absolute inset-0 rounded-full bg-blue-400 animate-ping opacity-20"></span>
        )}
      </motion.button>

      {/* Badge for Subscribed State */}
      {isSubscribed && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-md"
        >
          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
        </motion.div>
      )}
    </motion.div>
  )
}

export default NotificationSubscribeButton

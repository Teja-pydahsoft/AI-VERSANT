import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, BellOff, Mail, Smartphone, Clock, Globe, Save, RefreshCw, CheckCircle, XCircle, X } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useNotification } from '../../contexts/NotificationContext'
import oneSignalService from '../../services/oneSignalService'
import api from '../../services/api'

const NotificationPreferences = ({ isOpen, onClose }) => {
  const { user } = useAuth()
  const { success, error } = useNotification()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [preferences, setPreferences] = useState(null)
  const [onesignalStatus, setOnesignalStatus] = useState({
    isSupported: false,
    isSubscribed: false,
    playerId: null,
    userId: null,
  })

  const notificationTypes = [
    { key: 'test_completed', label: 'Test Completed', description: 'When you complete a test' },
    { key: 'test_scheduled', label: 'Test Scheduled', description: 'When a test is scheduled' },
    { key: 'test_reminder', label: 'Test Reminder', description: 'Reminders before tests' },
    { key: 'results_released', label: 'Results Released', description: 'When test results are available' },
    { key: 'batch_created', label: 'Batch Created', description: 'When a new batch is created' },
    { key: 'batch_updated', label: 'Batch Updated', description: 'When batch information is updated' },
    { key: 'course_created', label: 'Course Created', description: 'When a new course is created' },
    { key: 'course_updated', label: 'Course Updated', description: 'When course information is updated' },
    { key: 'campus_announcement', label: 'Campus Announcement', description: 'Important campus announcements' },
    { key: 'system_maintenance', label: 'System Maintenance', description: 'Scheduled maintenance notifications' },
    { key: 'profile_updated', label: 'Profile Updates', description: 'When your profile is updated' },
    { key: 'password_changed', label: 'Password Changes', description: 'When your password is changed' }
  ]

  useEffect(() => {
    if (isOpen) {
      fetchPreferences()
      checkOneSignalStatus()
    }
  }, [isOpen])

  const fetchPreferences = async () => {
    try {
      setLoading(true)
      const response = await api.get('/notifications/preferences')
      if (response.data.success) {
        setPreferences(response.data.data)
      } else {
        error(response.data.message)
      }
    } catch (err) {
      console.error('Error fetching preferences:', err)
      error('Failed to fetch notification preferences.')
    } finally {
      setLoading(false)
    }
  }

  const checkOneSignalStatus = async () => {
    const supported = oneSignalService.isSupported
    const subscribed = await oneSignalService.checkSubscriptionStatus()
    const playerId = await oneSignalService.getUserId()
    const userId = await oneSignalService.getOneSignalUserId()

    setOnesignalStatus({
      isSupported: supported,
      isSubscribed: subscribed,
      playerId: playerId,
      userId: userId,
    })
  }

  const handleToggleChange = (category, key) => {
    setPreferences(prev => {
      const newPrefs = { ...prev }
      if (key) {
        newPrefs[category] = {
          ...newPrefs[category],
          [key]: !newPrefs[category][key],
        }
      } else {
        newPrefs[category] = {
          ...newPrefs[category],
          enabled: !newPrefs[category].enabled,
        }
      }
      return newPrefs
    })
  }

  const handleQuietHoursChange = (key, value) => {
    setPreferences(prev => ({
      ...prev,
      quiet_hours: {
        ...prev.quiet_hours,
        [key]: value,
      },
    }))
  }

  const handleOneSignalSubscription = async () => {
    setSaving(true)
    try {
      let success = false
      if (onesignalStatus.isSubscribed) {
        success = await oneSignalService.unsubscribe()
        if (success) {
          await api.post('/notifications/onesignal/unsubscribe')
          success('Unsubscribed from push notifications!')
        }
      } else {
        success = await oneSignalService.subscribe()
        if (success) {
          const playerId = await oneSignalService.getUserId()
          console.log('🔔 OneSignal Player ID:', playerId)
          
          await api.post('/notifications/onesignal/subscribe', {
            player_id: playerId,
            onesignal_user_id: playerId, // Use the same player ID for OneSignal user ID
          })
          console.log('🔔 Player ID sent to backend successfully')
          success('Subscribed to push notifications!')
        }
      }
      await checkOneSignalStatus()
      await fetchPreferences()
    } catch (err) {
      console.error('OneSignal subscription error:', err)
      error('Failed to change push notification subscription status.')
    } finally {
      setSaving(false)
    }
  }

  const savePreferences = async () => {
    setSaving(true)
    try {
      const response = await api.put('/notifications/preferences', preferences)
      if (response.data.success) {
        success('Notification preferences saved successfully!')
      } else {
        error(response.data.message)
      }
    } catch (err) {
      console.error('Error saving preferences:', err)
      error('Failed to save notification preferences.')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !preferences) {
    return (
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black bg-opacity-50"
              onClick={onClose}
            />
            <div className="flex min-h-full items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden"
              >
                <div className="bg-white rounded-lg shadow-xl p-8 text-center">
                  <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-4" />
                  <p className="text-gray-600">Loading preferences...</p>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    )
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50"
            onClick={onClose}
          />
          
          {/* Modal */}
          <div className="flex min-h-full items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden"
            >
              <div className="bg-white rounded-lg shadow-xl">
                {/* Header */}
                <div className="p-6 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900">Notification Preferences</h2>
                      <p className="text-gray-600 mt-1">Manage how you receive notifications from VERSANT</p>
                    </div>
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={savePreferences}
                        disabled={saving}
                        className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                      >
                        <Save className="w-4 h-4" />
                        <span>{saving ? 'Saving...' : 'Save Preferences'}</span>
                      </button>
                      <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-8 overflow-y-auto max-h-[70vh]">
                  {/* Push Notifications */}
                  <div className="bg-gray-50 p-6 rounded-lg">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <Bell className="w-6 h-6 text-blue-500" />
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">Push Notifications</h3>
                          <p className="text-sm text-gray-600">Receive instant notifications in your browser</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="text-sm text-gray-600">
                          Status: <span className={`font-medium ${onesignalStatus.isSubscribed ? 'text-green-600' : 'text-red-600'}`}>
                            {onesignalStatus.isSubscribed ? 'Subscribed' : 'Not Subscribed'}
                          </span>
                        </div>
                        <button
                          onClick={handleOneSignalSubscription}
                          disabled={saving || !onesignalStatus.isSupported}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            onesignalStatus.isSubscribed
                              ? 'bg-red-500 text-white hover:bg-red-600'
                              : 'bg-green-500 text-white hover:bg-green-600'
                          } ${saving || !onesignalStatus.isSupported ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {saving ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : onesignalStatus.isSubscribed ? (
                            'Unsubscribe'
                          ) : (
                            'Subscribe'
                          )}
                        </button>
                      </div>
                    </div>
                    {onesignalStatus.isSubscribed && (
                      <div className="mt-4 text-xs text-gray-500">
                        <p>Player ID: {onesignalStatus.playerId || 'N/A'}</p>
                        <p>OneSignal User ID: {onesignalStatus.userId || 'N/A'}</p>
                      </div>
                    )}
                  </div>

                  {/* Email Notifications */}
                  <div className="bg-green-50 p-6 rounded-lg">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <Mail className="w-6 h-6 text-green-500" />
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">Email Notifications</h3>
                          <p className="text-sm text-gray-600">Receive notifications via email</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleToggleChange('email_notifications')}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          preferences.email_notifications.enabled ? 'bg-green-500' : 'bg-gray-200'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            preferences.email_notifications.enabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                    {preferences.email_notifications.enabled && (
                      <div className="space-y-3">
                        {['test_results', 'test_reminders', 'announcements', 'system_updates'].map((type) => (
                          <div key={type} className="flex items-center justify-between">
                            <span className="text-sm text-gray-700 capitalize">
                              {type.replace('_', ' ')}
                            </span>
                            <button
                              onClick={() => handleToggleChange('email_notifications', type)}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                preferences.email_notifications[type] ? 'bg-green-500' : 'bg-gray-200'
                              }`}
                            >
                              <span
                                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                                  preferences.email_notifications[type] ? 'translate-x-5' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* SMS Notifications */}
                  <div className="bg-yellow-50 p-6 rounded-lg">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <Smartphone className="w-6 h-6 text-yellow-500" />
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">SMS Notifications</h3>
                          <p className="text-sm text-gray-600">Receive notifications via SMS</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleToggleChange('sms_notifications')}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          preferences.sms_notifications.enabled ? 'bg-yellow-500' : 'bg-gray-200'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            preferences.sms_notifications.enabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                    {preferences.sms_notifications.enabled && (
                      <div className="space-y-3">
                        {['test_results', 'test_reminders', 'urgent_announcements'].map((type) => (
                          <div key={type} className="flex items-center justify-between">
                            <span className="text-sm text-gray-700 capitalize">
                              {type.replace('_', ' ')}
                            </span>
                            <button
                              onClick={() => handleToggleChange('sms_notifications', type)}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                preferences.sms_notifications[type] ? 'bg-yellow-500' : 'bg-gray-200'
                              }`}
                            >
                              <span
                                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                                  preferences.sms_notifications[type] ? 'translate-x-5' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Notification Types */}
                  <div className="bg-purple-50 p-6 rounded-lg">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <Bell className="w-5 h-5 mr-2 text-purple-600" />
                      Specific Notification Types
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {notificationTypes.map((type) => (
                        <div key={type.key} className="flex items-center justify-between p-3 bg-white rounded-lg">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{type.label}</p>
                            <p className="text-xs text-gray-500">{type.description}</p>
                          </div>
                          <button
                            onClick={() => handleToggleChange('notification_types', type.key)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                              preferences.notification_types[type.key] ? 'bg-purple-500' : 'bg-gray-200'
                            }`}
                          >
                            <span
                              className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                                preferences.notification_types[type.key] ? 'translate-x-5' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Quiet Hours */}
                  <div className="bg-red-50 p-6 rounded-lg">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <Clock className="w-6 h-6 text-red-500" />
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">Quiet Hours (Do Not Disturb)</h3>
                          <p className="text-sm text-gray-600">Set times when you don't want to receive notifications</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleQuietHoursChange('enabled', !preferences.quiet_hours.enabled)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          preferences.quiet_hours.enabled ? 'bg-red-500' : 'bg-gray-200'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            preferences.quiet_hours.enabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                    {preferences.quiet_hours.enabled && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                          <input
                            type="time"
                            value={preferences.quiet_hours.start_time}
                            onChange={(e) => handleQuietHoursChange('start_time', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                          <input
                            type="time"
                            value={preferences.quiet_hours.end_time}
                            onChange={(e) => handleQuietHoursChange('end_time', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                          <input
                            type="text"
                            value={preferences.quiet_hours.timezone}
                            onChange={(e) => handleQuietHoursChange('timezone', e.target.value)}
                            placeholder="e.g., Asia/Kolkata"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default NotificationPreferences
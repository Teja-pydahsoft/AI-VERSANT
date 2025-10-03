import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Bell, BellOff, Send, Users, User, Globe, BarChart3, CheckCircle, XCircle, AlertCircle, RefreshCw, Settings } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useNotification } from '../../contexts/NotificationContext'
import oneSignalService from '../../services/oneSignalService'

const OneSignalNotificationTester = () => {
  const { user } = useAuth()
  const { showNotification } = useNotification()
  const [isLoading, setIsLoading] = useState(false)
  const [status, setStatus] = useState({
    isSupported: false,
    isInitialized: false,
    isSubscribed: false,
    appId: null
  })
  const [testResults, setTestResults] = useState([])
  const [notificationForm, setNotificationForm] = useState({
    title: 'VERSANT Test Notification',
    body: 'This is a test notification from VERSANT system',
    userId: '',
    role: 'student',
    data: {}
  })
  const [stats, setStats] = useState(null)

  useEffect(() => {
    initializeOneSignal()
  }, [])

  const initializeOneSignal = async () => {
    try {
      setIsLoading(true)
      addTestResult('Initialize', true, 'Initializing OneSignal...')
      
      const initialized = await oneSignalService.initialize()
      
      if (initialized) {
        addTestResult('Initialize', true, 'OneSignal initialized successfully')
        await checkStatus()
      } else {
        addTestResult('Initialize', false, 'Failed to initialize OneSignal')
      }
      
    } catch (error) {
      console.error('OneSignal initialization failed:', error)
      addTestResult('Initialize', false, `Initialization failed: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const checkStatus = async () => {
    try {
      const status = oneSignalService.getSubscriptionStatus()
      setStatus(status)
      addTestResult('Status Check', true, 'OneSignal status checked successfully')
    } catch (error) {
      console.error('Status check failed:', error)
      addTestResult('Status Check', false, `Status check failed: ${error.message}`)
    }
  }

  const addTestResult = (test, success, message) => {
    setTestResults(prev => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      test,
      success,
      message,
      timestamp: new Date().toLocaleTimeString()
    }])
  }

  const subscribe = async () => {
    try {
      setIsLoading(true)
      addTestResult('Subscribe', true, 'Subscribing to OneSignal notifications...')
      
      const subscribed = await oneSignalService.subscribe()
      
      if (subscribed) {
        addTestResult('Subscribe', true, 'Successfully subscribed to OneSignal notifications')
        await checkStatus()
        showNotification('Successfully subscribed to OneSignal notifications!', 'success')
      } else {
        addTestResult('Subscribe', false, 'Failed to subscribe to OneSignal notifications')
      }
      
    } catch (error) {
      console.error('Subscription failed:', error)
      addTestResult('Subscribe', false, `Subscription failed: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const unsubscribe = async () => {
    try {
      setIsLoading(true)
      addTestResult('Unsubscribe', true, 'Unsubscribing from OneSignal notifications...')
      
      const unsubscribed = await oneSignalService.unsubscribe()
      
      if (unsubscribed) {
        addTestResult('Unsubscribe', true, 'Successfully unsubscribed from OneSignal notifications')
        await checkStatus()
        showNotification('Successfully unsubscribed from OneSignal notifications!', 'info')
      } else {
        addTestResult('Unsubscribe', false, 'Failed to unsubscribe from OneSignal notifications')
      }
      
    } catch (error) {
      console.error('Unsubscription failed:', error)
      addTestResult('Unsubscribe', false, `Unsubscription failed: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const sendTestNotification = async () => {
    try {
      setIsLoading(true)
      addTestResult('Test Notification', true, 'Sending OneSignal test notification...')
      
      await oneSignalService.sendTestNotification()
      
      addTestResult('Test Notification', true, 'OneSignal test notification sent successfully')
      showNotification('OneSignal test notification sent! Check your browser for the notification.', 'success')
      
    } catch (error) {
      console.error('Test notification failed:', error)
      addTestResult('Test Notification', false, `Test notification failed: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const sendToUser = async () => {
    if (!notificationForm.userId || !notificationForm.title || !notificationForm.body) {
      showNotification('Please fill in all required fields', 'error')
      return
    }

    try {
      setIsLoading(true)
      addTestResult('Send to User', true, `Sending OneSignal notification to user ${notificationForm.userId}...`)
      
      await oneSignalService.sendToUser(
        notificationForm.userId,
        notificationForm.title,
        notificationForm.body,
        notificationForm.data
      )
      
      addTestResult('Send to User', true, 'OneSignal notification sent to user successfully')
      showNotification('OneSignal notification sent to user!', 'success')
      
    } catch (error) {
      console.error('Send to user failed:', error)
      addTestResult('Send to User', false, `Send to user failed: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const sendToRole = async () => {
    if (!notificationForm.title || !notificationForm.body) {
      showNotification('Please fill in title and body', 'error')
      return
    }

    try {
      setIsLoading(true)
      addTestResult('Send to Role', true, `Sending OneSignal notification to ${notificationForm.role} users...`)
      
      await oneSignalService.sendToRole(
        notificationForm.role,
        notificationForm.title,
        notificationForm.body,
        notificationForm.data
      )
      
      addTestResult('Send to Role', true, `OneSignal notification sent to ${notificationForm.role} users successfully`)
      showNotification(`OneSignal notification sent to ${notificationForm.role} users!`, 'success')
      
    } catch (error) {
      console.error('Send to role failed:', error)
      addTestResult('Send to Role', false, `Send to role failed: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const sendBroadcast = async () => {
    if (!notificationForm.title || !notificationForm.body) {
      showNotification('Please fill in title and body', 'error')
      return
    }

    try {
      setIsLoading(true)
      addTestResult('Broadcast', true, 'Sending OneSignal broadcast notification...')
      
      const result = await oneSignalService.sendToAll(
        notificationForm.title,
        notificationForm.body,
        notificationForm.data
      )
      
      addTestResult('Broadcast', true, `OneSignal broadcast sent to ${result.recipients || 'all'} users successfully`)
      showNotification(`OneSignal broadcast sent to all users! Recipients: ${result.recipients || 'N/A'}`, 'success')
      
    } catch (error) {
      console.error('Broadcast failed:', error)
      addTestResult('Broadcast', false, `Broadcast failed: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const getStats = async () => {
    try {
      setIsLoading(true)
      addTestResult('Get Stats', true, 'Fetching OneSignal statistics...')
      
      const statsData = await oneSignalService.getStats()
      setStats(statsData)
      
      addTestResult('Get Stats', true, `OneSignal stats retrieved: ${JSON.stringify(statsData)}`)
      showNotification('OneSignal statistics retrieved successfully!', 'success')
      
    } catch (error) {
      console.error('Get stats failed:', error)
      addTestResult('Get Stats', false, `Get stats failed: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const clearResults = () => {
    setTestResults([])
  }

  const StatusIndicator = ({ label, value, icon: Icon, color = 'blue' }) => (
    <div className="flex items-center space-x-2">
      <Icon className={`w-5 h-5 ${value ? 'text-green-500' : 'text-red-500'}`} />
      <span className="text-sm font-medium">{label}:</span>
      <span className={`text-sm ${value ? 'text-green-600' : 'text-red-600'}`}>
        {value ? 'Yes' : 'No'}
      </span>
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-lg shadow-lg"
      >
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">OneSignal Push Notification Tester</h2>
              <p className="text-gray-600 mt-1">Test and manage OneSignal push notification functionality</p>
              <p className="text-sm text-blue-600 mt-1">App ID: {status.appId || 'ee224f6c-70c4-4414-900b-c283db5ea114'}</p>
            </div>
            <button
              onClick={checkStatus}
              disabled={isLoading}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh Status</span>
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Status Overview */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">OneSignal Status</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatusIndicator
                label="Supported"
                value={status.isSupported}
                icon={Bell}
              />
              <StatusIndicator
                label="Initialized"
                value={status.isInitialized}
                icon={Settings}
              />
              <StatusIndicator
                label="Subscribed"
                value={status.isSubscribed}
                icon={CheckCircle}
              />
              <StatusIndicator
                label="App ID"
                value={!!status.appId}
                icon={AlertCircle}
              />
            </div>
          </div>

          {/* Control Buttons */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">OneSignal Controls</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <button
                onClick={initializeOneSignal}
                disabled={isLoading || status.isInitialized}
                className="flex items-center justify-center space-x-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
              >
                <Settings className="w-4 h-4" />
                <span>Initialize</span>
              </button>

              <button
                onClick={status.isSubscribed ? unsubscribe : subscribe}
                disabled={isLoading || !status.isInitialized}
                className={`flex items-center justify-center space-x-2 px-4 py-2 rounded-lg disabled:opacity-50 ${
                  status.isSubscribed 
                    ? 'bg-red-500 text-white hover:bg-red-600' 
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                }`}
              >
                {status.isSubscribed ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                <span>{status.isSubscribed ? 'Unsubscribe' : 'Subscribe'}</span>
              </button>

              <button
                onClick={sendTestNotification}
                disabled={isLoading || !status.isSubscribed}
                className="flex items-center justify-center space-x-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>Test Notification</span>
              </button>

              <button
                onClick={getStats}
                disabled={isLoading}
                className="flex items-center justify-center space-x-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50"
              >
                <BarChart3 className="w-4 h-4" />
                <span>Get Statistics</span>
              </button>
            </div>
          </div>

          {/* Admin Controls */}
          {(user?.role === 'superadmin' || user?.role === 'campus_admin') && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Admin Controls</h3>
              
              {/* Notification Form */}
              <div className="bg-gray-50 p-4 rounded-lg mb-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                    <input
                      type="text"
                      value={notificationForm.title}
                      onChange={(e) => setNotificationForm(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Notification title"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
                    <input
                      type="text"
                      value={notificationForm.body}
                      onChange={(e) => setNotificationForm(prev => ({ ...prev, body: e.target.value }))}
                      placeholder="Notification message"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">User ID (for send to user)</label>
                    <input
                      type="text"
                      value={notificationForm.userId}
                      onChange={(e) => setNotificationForm(prev => ({ ...prev, userId: e.target.value }))}
                      placeholder="User ID"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role (for send to role)</label>
                    <select
                      value={notificationForm.role}
                      onChange={(e) => setNotificationForm(prev => ({ ...prev, role: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="student">Student</option>
                      <option value="course_admin">Course Admin</option>
                      <option value="campus_admin">Campus Admin</option>
                      <option value="superadmin">Super Admin</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button
                    onClick={sendToUser}
                    disabled={isLoading}
                    className="flex items-center justify-center space-x-2 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50"
                  >
                    <User className="w-4 h-4" />
                    <span>Send to User</span>
                  </button>

                  <button
                    onClick={sendToRole}
                    disabled={isLoading}
                    className="flex items-center justify-center space-x-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50"
                  >
                    <Users className="w-4 h-4" />
                    <span>Send to Role</span>
                  </button>

                  <button
                    onClick={sendBroadcast}
                    disabled={isLoading}
                    className="flex items-center justify-center space-x-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
                  >
                    <Globe className="w-4 h-4" />
                    <span>Broadcast to All</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Statistics Display */}
          {stats && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">OneSignal Statistics</h3>
              <div className="bg-blue-50 p-4 rounded-lg">
                <pre className="text-sm text-gray-700 overflow-x-auto">
                  {JSON.stringify(stats, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Test Results */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Test Results</h3>
              <button
                onClick={clearResults}
                className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700"
              >
                Clear Results
              </button>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
              {testResults.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No test results yet. Run some tests to see results here.</p>
              ) : (
                <div className="space-y-2">
                  {testResults.map((result) => (
                    <div
                      key={result.id}
                      className={`flex items-center space-x-3 p-3 rounded-lg ${
                        result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                      }`}
                    >
                      {result.success ? (
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-gray-900">{result.test}</span>
                          <span className="text-xs text-gray-500">{result.timestamp}</span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{result.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default OneSignalNotificationTester

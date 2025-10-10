import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../../contexts/AuthContext'
import { useNotification } from '../../contexts/NotificationContext'
import { Bell, Send, CheckCircle, XCircle } from 'lucide-react'

import LoadingSpinner from '../../components/common/LoadingSpinner'
import api, { getCoursesByCampus, getCampuses } from '../../services/api'

const SuperAdminDashboard = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  const { user } = useAuth()
  const { success, error } = useNotification()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeCourses, setActiveCourses] = useState(0)
  const [adminCount, setAdminCount] = useState(0)
  const [pushTestLoading, setPushTestLoading] = useState(false)
  const [pushTestResult, setPushTestResult] = useState(null)

  useEffect(() => {
    fetchDashboardStats()
    fetchActiveCourses()
    fetchAdminCount()
  }, []) // Empty dependency array to run only once

  const fetchDashboardStats = async () => {
    try {
      const response = await api.get('/superadmin/dashboard')
      if (response.data.success) {
        setStats(response.data.data)
      } else {
        console.error('Dashboard API returned error:', response.data.message)
        error('Failed to load dashboard data: ' + response.data.message)
      }
    } catch (err) {
      console.error('Dashboard API error:', err)
      error('Failed to load dashboard data: ' + (err.response?.data?.message || err.message))
    } finally {
      setLoading(false)
    }
  }

  const fetchActiveCourses = async () => {
    try {
      const campusesRes = await getCampuses()
      if (campusesRes.data.success) {
        let totalCourses = 0
        for (const campus of campusesRes.data.data) {
          const coursesRes = await getCoursesByCampus(campus.id)
          if (coursesRes.data.success) {
            totalCourses += (coursesRes.data.data?.length || 0)
          }
        }
        setActiveCourses(totalCourses)
      } else {
        console.error('Failed to fetch campuses:', campusesRes.data.message)
        setActiveCourses(0)
      }
    } catch (e) {
      console.error('Error fetching active courses:', e)
      setActiveCourses(0)
    }
  }

  const fetchAdminCount = async () => {
    try {
      // Get admin count from the admin management API
      const response = await api.get('/admin-management/list')
      if (response.data.success) {
        setAdminCount(response.data.data?.length || 0)
      } else {
        console.error('Failed to fetch admin count:', response.data.message)
        setAdminCount(0)
      }
    } catch (e) {
      console.error('Error fetching admin count:', e)
      setAdminCount(0)
    }
  }
  const sendPushNotificationTest = async () => {
    try {
      setPushTestLoading(true)
      setPushTestResult(null)

      const response = await fetch('/api/notifications/test-broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token') || user?.access_token}`
        },
        body: JSON.stringify({
          title: 'VERSANT Test Notification',
          message: 'This is a test push notification from VERSANT system. If you receive this, push notifications are working correctly!'
        })
      })

      const result = await response.json()

      if (result.success) {
        setPushTestResult({
          success: true,
          message: `${result.message} (${result.details.total_recipients} recipients)\nOneSignal: ${result.details.onesignal_status}\nVAPID: ${result.details.vapid_status}`
        })
        success('Test notifications sent successfully!')
      } else {
        setPushTestResult({
          success: false,
          message: `${result.message}\nOneSignal: ${result.details?.onesignal_status || 'Failed'}\nVAPID: ${result.details?.vapid_status || 'Failed'}`
        })
        error(`Test push notification failed: ${result.message}`)
      }
    } catch (err) {
      console.error('Push notification test failed:', err)
      setPushTestResult({
        success: false,
        message: `Network error: ${err.message}`
      })
      error(`Test push notification failed: ${err.message}`)
    } finally {
      setPushTestLoading(false)
    }
  }

  const dashboardCards = [
    {
      title: 'Total Admins',
      value: adminCount,
      icon: '👥',
      color: 'bg-blue-500',
      link: '/superadmin/users'
    },
    {
      title: 'Total Students',
      value: stats?.statistics?.total_students || 0,
      icon: '🎓',
      color: 'bg-green-500',
      link: '/superadmin/students'
    },
    {
      title: 'Total Tests',
      value: stats?.statistics?.total_tests || 0,
      icon: '📝',
      color: 'bg-purple-500',
      link: '/superadmin/tests'
    },
    {
      title: 'Active Courses',
      value: activeCourses,
      icon: '📚',
      color: 'bg-orange-500',
      link: '/superadmin/courses'
    }
  ]

  const quickActions = [
    {
      title: 'Results',
      description: 'View student results and analytics',
      icon: '📊',
      link: '/superadmin/results',
      color: 'bg-pink-600'
    },
    {
      title: 'Create Test',
      description: 'Create new practice or exam tests',
      icon: '📝',
      link: '/superadmin/tests/create',
      color: 'bg-green-600'
    },
    {
      title: 'Manage Campuses',
      description: 'Add or modify campus information',
      icon: '🏢',
      link: '/superadmin/campuses',
      color: 'bg-purple-600'
    },
    {
      title: 'Batch Creation',
      description: 'Create and manage batches',
      icon: '📊',
      link: '/superadmin/batch-creation',
      color: 'bg-orange-600'
    }
  ]

  if (loading) {
    return <LoadingSpinner size="lg" />
  }

  return (
        <div className="px-4 mt-6">
          {/* Statistics Cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
          >
            {dashboardCards.map((card, index) => (
              <Link
                key={index}
                to={card.link}
                className="rounded-xl bg-secondary border border-border shadow-md p-6 flex flex-col items-center justify-center transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:border-highlight group animate-fade-in"
              >
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 mb-4 shadow group-hover:shadow-lg transition-all duration-300">
                  <span className="text-white text-2xl">{card.icon}</span>
                </div>
                <p className="text-lg font-bold text-text mb-1 transition-colors duration-200 group-hover:text-highlight">{card.title}</p>
                <p className="text-3xl font-extrabold text-text mb-2 transition-colors duration-200 group-hover:text-highlight">{card.value}</p>
                <span className="text-sm text-text opacity-70 group-hover:opacity-100 transition-opacity duration-200">View All</span>
              </Link>
            ))}
          </motion.div>

          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-8"
          >
            <h2 className="text-xl font-semibold text-text mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {quickActions.map((action, index) => (
                <Link
                  key={index}
                  to={action.link}
                  className="rounded-xl bg-secondary border-l-4 border-highlight shadow-md p-6 flex flex-col items-center justify-center transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:border-highlight group animate-fade-in"
                >
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-highlight mb-4 shadow group-hover:shadow-lg transition-all duration-300">
                    <span className="text-buttontext text-2xl">{action.icon}</span>
                  </div>
                  <h3 className="text-lg font-semibold text-text mb-1 transition-colors duration-200 group-hover:text-highlight">{action.title}</h3>
                  <p className="text-text text-sm opacity-80 group-hover:opacity-100 transition-opacity duration-200">{action.description}</p>
                </Link>
              ))}
            </div>
          </motion.div>

          {/* Recent Activity */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="bg-secondary border border-border rounded-lg shadow-md p-6"
          >
            <h2 className="text-xl font-semibold text-text mb-4">Recent Activity</h2>
            <div className="space-y-4">
              {[
                { action: 'New user registered', time: '2 minutes ago', type: 'user' },
                { action: 'Test completed by student', time: '5 minutes ago', type: 'test' },
                { action: 'New campus added', time: '1 hour ago', type: 'campus' },
                { action: 'System backup completed', time: '2 hours ago', type: 'system' }
              ].map((activity, index) => (
                <div key={index} className="flex items-center justify-between py-2 border-b border-border last:border-b-0">
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-tertiary rounded-full mr-3"></div>
                    <span className="text-text">{activity.action}</span>
                  </div>
                  <span className="text-sm text-text">{activity.time}</span>
                </div>
              ))}
            </div>
          </motion.div>

      {/* Floating Push Notification Test Button */}
      <motion.div
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5, type: 'spring', stiffness: 200 }}
        className="fixed bottom-6 right-6 z-50"
      >
        <div className="relative group">
          {/* Tooltip */}
          <div className="absolute bottom-full right-0 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            <div className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap shadow-lg ${
              pushTestResult?.success 
                ? 'bg-green-100 text-green-800 border border-green-200' 
                : pushTestResult?.success === false 
                ? 'bg-red-100 text-red-800 border border-red-200'
                : 'bg-gray-100 text-gray-800 border border-gray-200'
            }`}>
              {pushTestResult ? (
                <div className="flex items-center space-x-2">
                  {pushTestResult.success ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-600" />
                  )}
                  <span>{pushTestResult.message}</span>
                </div>
              ) : (
                'Test Push Notifications'
              )}
            </div>
          </div>

          {/* Floating Button */}
          <button
            onClick={sendPushNotificationTest}
            disabled={pushTestLoading}
            className={`flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-110 focus:outline-none focus:ring-4 focus:ring-opacity-50 ${
              pushTestLoading
                ? 'bg-gray-400 cursor-not-allowed'
                : pushTestResult?.success
                ? 'bg-green-500 hover:bg-green-600 focus:ring-green-500'
                : pushTestResult?.success === false
                ? 'bg-red-500 hover:bg-red-600 focus:ring-red-500'
                : 'bg-blue-500 hover:bg-blue-600 focus:ring-blue-500'
            }`}
            title="Send test push notification to all subscribed users"
          >
            {pushTestLoading ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                <Bell className="w-6 h-6 text-white" />
              </motion.div>
            ) : pushTestResult?.success ? (
              <CheckCircle className="w-6 h-6 text-white" />
            ) : pushTestResult?.success === false ? (
              <XCircle className="w-6 h-6 text-white" />
            ) : (
              <Send className="w-6 h-6 text-white" />
            )}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

export default SuperAdminDashboard 
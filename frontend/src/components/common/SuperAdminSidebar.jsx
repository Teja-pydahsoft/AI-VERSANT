import React, { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom'
import { Users, FilePlus, Building2, BarChart, LayoutDashboard, BookCopy, GraduationCap, Shield, Settings, Menu, X, FormInput, ClipboardList, BarChart3, TrendingUp, Activity } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { motion } from 'framer-motion'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Header from './Header'

const SuperAdminSidebar = () => {
  const location = useLocation()
  const { logout, user } = useAuth()
  const navigate = useNavigate()
  const [userPermissions, setUserPermissions] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  console.log('SuperAdminSidebar rendered - user:', user, 'loading:', loading, 'userPermissions:', userPermissions)

  useEffect(() => {
    console.log('SuperAdminSidebar useEffect triggered - user:', user)
    fetchUserPermissions()
  }, [user])

  // Handle window resize to close mobile menu on desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024 && isMobileMenuOpen) {
        setIsMobileMenuOpen(false)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isMobileMenuOpen])

  // Handle swipe gestures for mobile
  useEffect(() => {
    let startX = 0
    let currentX = 0

    const handleTouchStart = (e) => {
      startX = e.touches[0].clientX
    }

    const handleTouchMove = (e) => {
      currentX = e.touches[0].clientX
    }

    const handleTouchEnd = () => {
      const diffX = startX - currentX
      
      // If swiped left more than 50px and menu is open, close it
      if (diffX > 50 && isMobileMenuOpen) {
        setIsMobileMenuOpen(false)
      }
    }

    if (isMobileMenuOpen) {
      document.addEventListener('touchstart', handleTouchStart)
      document.addEventListener('touchmove', handleTouchMove)
      document.addEventListener('touchend', handleTouchEnd)
    }

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [isMobileMenuOpen])

  // Handle click outside to close mobile menu
  useEffect(() => {
    const handleClickOutside = (e) => {
      const sidebar = document.querySelector('[data-sidebar]')
      const toggleButton = document.querySelector('[data-toggle-button]')
      
      if (isMobileMenuOpen && sidebar && !sidebar.contains(e.target) && !toggleButton?.contains(e.target)) {
        setIsMobileMenuOpen(false)
      }
    }

    if (isMobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('touchstart', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [isMobileMenuOpen])

  const fetchUserPermissions = async () => {
    if (!user) {
      setLoading(false)
      return
    }

    try {
      // For super admin, set permissions immediately without API call
      if (user.role === 'superadmin') {
        const superAdminPermissions = {
          modules: ['dashboard', 'campus_management', 'course_management', 'batch_management', 'user_management', 'admin_permissions', 'global_settings', 'test_management', '', 'question_bank_upload', 'crt_upload', 'student_management', 'results_management'],
          can_upload_tests: true,
          can_upload_questions: true
        }
        setUserPermissions(superAdminPermissions)
        setLoading(false)
        return
      }

      // Get user's full permissions from the backend
      const userResponse = await api.get(`/user-management/${user.id || user._id}`)
      const permissions = userResponse.data.data?.permissions || {}
      
      setUserPermissions(permissions)
    } catch (err) {
      console.error('Failed to fetch permissions:', err)
      // Use default permissions based on role
      const defaultPermissions = {
        super_admin: {
          modules: ['dashboard', 'campus_management', 'course_management', 'batch_management', 'user_management', 'admin_permissions', 'global_settings', 'test_management', '', 'question_bank_upload', 'crt_upload', 'student_management', 'results_management'],
          can_upload_tests: true,
          can_upload_questions: true
        },
        campus_admin: {
          modules: ['dashboard', 'course_management', 'batch_management', 'user_management', 'test_management', 'question_bank_upload', 'crt_upload', 'student_management', 'results_management'],
          can_upload_tests: false,
          can_upload_questions: false
        },
        course_admin: {
          modules: ['dashboard', 'batch_management', 'user_management', 'test_management', 'question_bank_upload', 'crt_upload', 'student_management', 'results_management'],
          can_upload_tests: false,
          can_upload_questions: false
        }
      }
      setUserPermissions(defaultPermissions[user.role] || defaultPermissions.super_admin)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    console.log('SuperAdminSidebar logout initiated')
    try {
      logout()
      console.log('SuperAdminSidebar logout successful')
      navigate('/login')
    } catch (error) {
      console.error('SuperAdminSidebar logout error:', error)
      // Still navigate to login even if logout fails
      navigate('/login')
    }
  }

  // Define navigation based on user role and permissions
  const getNavigation = () => {
    console.log('getNavigation called - loading:', loading, 'userPermissions:', userPermissions, 'user:', user)
    
    // For super admin, always show all navigation items
    if (user?.role === 'superadmin') {
      console.log('Super admin detected, showing all navigation items')
      return [
        { name: 'Dashboard', path: '/superadmin/dashboard', icon: LayoutDashboard, module: 'dashboard' },
        { name: 'Campus Management', path: '/superadmin/campuses', icon: Building2, module: 'campus_management' },
        { name: 'Course Management', path: '/superadmin/courses', icon: BookCopy, module: 'course_management' },
        { name: 'Batch Management', path: '/superadmin/batch-management', icon: GraduationCap, module: 'batch_management' },

        { name: 'Admin Permissions', path: '/superadmin/admin-permissions', icon: Shield, module: 'admin_permissions' },
        { name: 'Global Settings', path: '/superadmin/global-settings', icon: Settings, module: 'global_settings' },
        { name: 'Test Management', path: '/superadmin/tests', icon: FilePlus, module: 'test_management' },
        // { name: 'Unified Tests', path: '/superadmin/unified-tests', icon: FilePlus, module: '' }, // Temporarily hidden
        { name: 'Versant Upload', path: '/superadmin/question-bank-upload', icon: FilePlus, module: 'question_bank_upload', isUpload: true },
        { name: 'CRT Upload', path: '/superadmin/crt-upload', icon: FilePlus, module: 'crt_upload', isUpload: true },
        { name: 'Student Management', path: '/superadmin/students', icon: GraduationCap, module: 'student_management' },
        { name: 'Results Management', path: '/superadmin/results', icon: BarChart, module: 'results_management' },
        { name: 'Progress Tracking', path: '/superadmin/progress-tracking', icon: TrendingUp, module: 'progress_tracking' },
        
        // Analytics (hidden from menu - access via direct URL)
        // { name: 'Real Analytics', path: '/superadmin/real-analytics', icon: Activity, module: 'analytics' },
        
        // Form Portal
        { name: 'Form Management', path: '/superadmin/form-management', icon: ClipboardList, module: 'form_management' },
      ]
    }

    if (loading || !userPermissions) {
      console.log('Loading or no permissions, returning empty array')
      return []
    }

    const allNavLinks = [
      { name: 'Dashboard', path: '/superadmin/dashboard', icon: LayoutDashboard, module: 'dashboard' },
      { name: 'Campus Management', path: '/superadmin/campuses', icon: Building2, module: 'campus_management' },
      { name: 'Course Management', path: '/superadmin/courses', icon: BookCopy, module: 'course_management' },
      { name: 'Batch Management', path: '/superadmin/batch-management', icon: GraduationCap, module: 'batch_management' },

      { name: 'Admin Permissions', path: '/superadmin/admin-permissions', icon: Shield, module: 'admin_permissions' },
      { name: 'Test Management', path: '/superadmin/tests', icon: FilePlus, module: 'test_management' },
      // { name: 'Unified Tests', path: '/superadmin/unified-tests', icon: FilePlus, module: '' }, // Temporarily hidden
      { name: 'Versant Upload', path: '/superadmin/question-bank-upload', icon: FilePlus, module: 'question_bank_upload', isUpload: true },
      { name: 'CRT Upload', path: '/superadmin/crt-upload', icon: FilePlus, module: 'crt_upload', isUpload: true },
      { name: 'Student Management', path: '/superadmin/students', icon: GraduationCap, module: 'student_management' },
      { name: 'Results Management', path: '/superadmin/results', icon: BarChart, module: 'results_management' },
      { name: 'Progress Tracking', path: '/superadmin/progress-tracking', icon: TrendingUp, module: 'progress_tracking' },
      
      // Analytics (hidden from menu - access via direct URL)
      // { name: 'Real Analytics', path: '/superadmin/real-analytics', icon: Activity, module: 'analytics' },
      
      // Form Portal
      { name: 'Form Management', path: '/superadmin/form-management', icon: ClipboardList, module: 'form_management' },
      
    ]

    // Filter navigation based on user permissions
    const filteredLinks = allNavLinks.filter(link => {
      // Check if user has access to this module
      if (!userPermissions.modules?.includes(link.module)) {
        console.log('Filtering out link:', link.name, 'module not in permissions:', link.module)
        return false
      }

      // For campus and course admins, show upload features but mark them as restricted
      if (link.isUpload && (user?.role === 'campus_admin' || user?.role === 'course_admin')) {
        return true // Show but will be marked as restricted
      }

      return true
    })

    console.log('Filtered navigation links:', filteredLinks)
    return filteredLinks
  }

  const navLinks = getNavigation()
  console.log('navLinks:', navLinks, 'length:', navLinks.length)

  const isActive = (path) => location.pathname.startsWith(path)

  return (
    <div className="flex h-screen">
      {/* Mobile Menu Toggle */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <button
          data-toggle-button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
        >
          {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Sidebar - Always visible on large screens */}
      <div className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 lg:z-50">
        <div className="flex flex-col flex-grow bg-gradient-to-b from-white to-gray-50 shadow-2xl border-r border-gray-200">
          {/* Logo/Brand */}
        <motion.div 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 100 }}
          className="p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 flex-shrink-0"
        >
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Study Edge
          </h1>
          <p className="text-xs text-gray-600 font-medium">
            {user?.role === 'campus_admin' ? 'Campus Admin Portal' : 
             user?.role === 'course_admin' ? 'Course Admin Portal' : 
             'Super Admin Portal'}
          </p>
          {(user?.role === 'campus_admin' || user?.role === 'course_admin') && (
            <div className="mt-1 p-1.5 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-xs text-yellow-700 font-medium">
                ⚠️ Upload features are restricted
              </p>
            </div>
          )}
        </motion.div>

        <nav className="flex-1 flex flex-col justify-between min-h-0">
          <div className="flex flex-col space-y-1 px-4 mt-4 overflow-y-auto flex-1 pb-4">
            {navLinks.length > 0 ? (
              <div className="space-y-1">
                {navLinks.map((link, idx) => {
                  const isRestricted = link.isUpload && (user?.role === 'campus_admin' || user?.role === 'course_admin')
                  
                  return (
                    <motion.div
                      key={link.name}
                      initial={{ x: -30, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: 0.05 * idx, type: 'spring', stiffness: 80, damping: 18 }}
                      whileHover={{ scale: isRestricted ? 1 : 1.02 }}
                      whileTap={{ scale: isRestricted ? 1 : 0.98 }}
                    >
                      <Link
                        to={isRestricted ? '#' : link.path}
                        onClick={(e) => {
                          if (isRestricted) {
                            e.preventDefault()
                            toast.error('Upload features are restricted for your role. Please contact a Super Admin for assistance.')
                          } else {
                            // Close mobile menu on navigation
                            setIsMobileMenuOpen(false)
                          }
                        }}
                        className={`group flex items-center px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-300 relative overflow-hidden
                          ${isActive(link.path) && !isRestricted
                            ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg transform scale-105'
                            : isRestricted
                            ? 'text-gray-400 bg-gray-50 border border-gray-200 cursor-not-allowed opacity-75'
                            : 'text-gray-700 hover:bg-gradient-to-r hover:from-gray-100 hover:to-blue-50 hover:text-gray-900 hover:shadow-md'
                          }
                        `}
                        title={isRestricted ? 'Upload features are restricted for your role' : undefined}
                      >
                        {/* Active indicator */}
                        {isActive(link.path) && !isRestricted && (
                          <motion.div
                            layoutId="activeTab"
                            className="absolute inset-0 bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl"
                            initial={false}
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                          />
                        )}
                        
                        <link.icon className={`mr-3 h-4 w-4 transition-all duration-300 relative z-10
                          ${isActive(link.path) && !isRestricted
                            ? 'text-white' 
                            : isRestricted
                            ? 'text-gray-400'
                            : 'text-gray-500 group-hover:text-blue-600 group-hover:scale-110'
                          }`} 
                        />
                        <span className="relative z-10 transition-all duration-300 group-hover:translate-x-1 font-semibold text-sm">
                          {link.name}
                        </span>
                        
                        {/* Restriction indicator */}
                        {isRestricted && (
                          <svg className="ml-auto h-3 w-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        )}
                        
                        {/* Hover effect */}
                        {!isActive(link.path) && !isRestricted && (
                          <motion.div
                            className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 rounded-xl"
                            initial={{ opacity: 0, scale: 0.8 }}
                            whileHover={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.2 }}
                          />
                        )}
                      </Link>
                    </motion.div>
                  )
                })}
              </div>
            ) : (
              // Fallback navigation if no links are loaded
              <div className="space-y-2">
                <div className="text-sm text-gray-500 mb-4">Loading navigation...</div>
                <Link
                  to="/superadmin/dashboard"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="group flex items-center px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-300 text-gray-700 hover:bg-gradient-to-r hover:from-gray-100 hover:to-blue-50 hover:text-gray-900 hover:shadow-md"
                >
                  <LayoutDashboard className="mr-3 h-4 w-4 text-gray-500 group-hover:text-blue-600" />
                  <span className="text-sm">Dashboard</span>
                </Link>
                <Link
                  to="/superadmin/question-bank-upload"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="group flex items-center px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-300 text-gray-700 hover:bg-gradient-to-r hover:from-gray-100 hover:to-blue-50 hover:text-gray-900 hover:shadow-md"
                >
                  <FilePlus className="mr-3 h-4 w-4 text-gray-500 group-hover:text-blue-600" />
                  <span className="text-sm">Versant Upload</span>
                </Link>
                <Link
                  to="/superadmin/crt-upload"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="group flex items-center px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-300 text-gray-700 hover:bg-gradient-to-r hover:from-gray-100 hover:to-blue-50 hover:text-gray-900 hover:shadow-md"
                >
                  <FilePlus className="mr-3 h-4 w-4 text-gray-500 group-hover:text-blue-600" />
                  <span className="text-sm">CRT Upload</span>
                </Link>
              </div>
            )}
          </div>
        </nav>
        
        {/* Logout Button */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, type: 'spring', stiffness: 100 }}
          className="px-4 pb-4 mt-auto flex-shrink-0"
        >
          <button
            onClick={() => {
              handleLogout()
              setIsMobileMenuOpen(false)
            }}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-gray-600 to-gray-700 text-white font-semibold px-3 py-2.5 rounded-xl hover:from-gray-700 hover:to-gray-800 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 text-sm"
          >
            <motion.div
              whileHover={{ rotate: 180 }}
              transition={{ duration: 0.3 }}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </motion.div>
            Logout
          </button>
        </motion.div>
        </div>
      </div>

      {/* Mobile Sidebar */}
      <motion.div
        data-sidebar
        initial={false}
        animate={{ 
          x: isMobileMenuOpen ? 0 : '-100%'
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className={`lg:hidden fixed top-0 left-0 h-screen w-64 bg-gradient-to-b from-white to-gray-50 shadow-2xl z-30 flex flex-col border-r border-gray-200 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo/Brand */}
        <motion.div 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 100 }}
          className="p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 flex-shrink-0"
        >
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Study Edge
          </h1>
          <p className="text-xs text-gray-600 font-medium">
            {user?.role === 'campus_admin' ? 'Campus Admin Portal' : 
             user?.role === 'course_admin' ? 'Course Admin Portal' : 
             'Super Admin Portal'}
          </p>
          {(user?.role === 'campus_admin' || user?.role === 'course_admin') && (
            <div className="mt-1 p-1.5 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-xs text-yellow-700 font-medium">
                ⚠️ Upload features are restricted
              </p>
            </div>
          )}
        </motion.div>

        <nav className="flex-1 flex flex-col justify-between min-h-0">
          <div className="flex flex-col space-y-1 px-4 mt-4 overflow-y-auto flex-1 pb-4">
            {navLinks.length > 0 ? (
              <div className="space-y-1">
                {navLinks.map((link, idx) => {
                  const isRestricted = link.isUpload && (user?.role === 'campus_admin' || user?.role === 'course_admin')
                  
                  return (
                    <motion.div
                      key={link.name}
                      initial={{ x: -30, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: 0.05 * idx, type: 'spring', stiffness: 80, damping: 18 }}
                      whileHover={{ scale: isRestricted ? 1 : 1.02 }}
                      whileTap={{ scale: isRestricted ? 1 : 0.98 }}
                    >
                      <Link
                        to={isRestricted ? '#' : link.path}
                        onClick={(e) => {
                          if (isRestricted) {
                            e.preventDefault()
                            toast.error('Upload features are restricted for your role. Please contact a Super Admin for assistance.')
                          } else {
                            // Close mobile menu on navigation
                            setIsMobileMenuOpen(false)
                          }
                        }}
                        className={`group flex items-center px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-300 relative overflow-hidden
                          ${isActive(link.path) && !isRestricted
                            ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg transform scale-105'
                            : isRestricted
                            ? 'text-gray-400 bg-gray-50 border border-gray-200 cursor-not-allowed opacity-75'
                            : 'text-gray-700 hover:bg-gradient-to-r hover:from-gray-100 hover:to-blue-50 hover:text-gray-900 hover:shadow-md'
                          }
                        `}
                        title={isRestricted ? 'Upload features are restricted for your role' : undefined}
                      >
                        {/* Active indicator */}
                        {isActive(link.path) && !isRestricted && (
                          <motion.div
                            layoutId="activeTab"
                            className="absolute inset-0 bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl"
                            initial={false}
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                          />
                        )}
                        
                        <link.icon className={`mr-3 h-4 w-4 transition-all duration-300 relative z-10
                          ${isActive(link.path) && !isRestricted
                            ? 'text-white' 
                            : isRestricted
                            ? 'text-gray-400'
                            : 'text-gray-500 group-hover:text-blue-600 group-hover:scale-110'
                          }`} 
                        />
                        <span className="relative z-10 transition-all duration-300 group-hover:translate-x-1 font-semibold text-sm">
                          {link.name}
                        </span>
                        
                        {/* Restriction indicator */}
                        {isRestricted && (
                          <svg className="ml-auto h-3 w-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        )}
                        
                        {/* Hover effect */}
                        {!isActive(link.path) && !isRestricted && (
                          <motion.div
                            className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 rounded-xl"
                            initial={{ opacity: 0, scale: 0.8 }}
                            whileHover={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.2 }}
                          />
                        )}
                      </Link>
                    </motion.div>
                  )
                })}
              </div>
            ) : (
              // Fallback navigation if no links are loaded
              <div className="space-y-2">
                <div className="text-sm text-gray-500 mb-4">Loading navigation...</div>
                <Link
                  to="/superadmin/dashboard"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="group flex items-center px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-300 text-gray-700 hover:bg-gradient-to-r hover:from-gray-100 hover:to-blue-50 hover:text-gray-900 hover:shadow-md"
                >
                  <LayoutDashboard className="mr-3 h-4 w-4 text-gray-500 group-hover:text-blue-600" />
                  <span className="text-sm">Dashboard</span>
                </Link>
                <Link
                  to="/superadmin/question-bank-upload"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="group flex items-center px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-300 text-gray-700 hover:bg-gradient-to-r hover:from-gray-100 hover:to-blue-50 hover:text-gray-900 hover:shadow-md"
                >
                  <FilePlus className="mr-3 h-4 w-4 text-gray-500 group-hover:text-blue-600" />
                  <span className="text-sm">Versant Upload</span>
                </Link>
                <Link
                  to="/superadmin/crt-upload"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="group flex items-center px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-300 text-gray-700 hover:bg-gradient-to-r hover:from-gray-100 hover:to-blue-50 hover:text-gray-900 hover:shadow-md"
                >
                  <FilePlus className="mr-3 h-4 w-4 text-gray-500 group-hover:text-blue-600" />
                  <span className="text-sm">CRT Upload</span>
                </Link>
              </div>
            )}
          </div>
        </nav>
        
        {/* Logout Button */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, type: 'spring', stiffness: 100 }}
          className="px-4 pb-4 mt-auto flex-shrink-0"
        >
          <button
            onClick={() => {
              handleLogout()
              setIsMobileMenuOpen(false)
            }}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-gray-600 to-gray-700 text-white font-semibold px-3 py-2.5 rounded-xl hover:from-gray-700 hover:to-gray-800 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 text-sm"
          >
            <motion.div
              whileHover={{ rotate: 180 }}
              transition={{ duration: 0.3 }}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </motion.div>
            Logout
          </button>
        </motion.div>
      </motion.div>
      
      {/* Main Content */}
      <div className="flex-1 bg-gray-50 w-full lg:ml-64 flex flex-col min-h-screen">
        <Header />
        <div className="flex-1 overflow-auto">
        <Outlet />
        </div>
      </div>
    </div>
  )
}

export default SuperAdminSidebar 
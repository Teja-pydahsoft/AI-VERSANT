import React, { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom'
import { Users, FilePlus, Building2, BarChart, LayoutDashboard, BookCopy, GraduationCap, Shield, Settings, Menu, X, FormInput, ClipboardList, BarChart3, TrendingUp, Activity, Bell, Edit3, Eye, UserCheck } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissionContext } from '../../contexts/PermissionContext'
import { motion } from 'framer-motion'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Header from './Header'

const SuperAdminSidebar = () => {
  const location = useLocation()
  const { logout, user } = useAuth()
  const navigate = useNavigate()
  const { permissions, hasPermission, isSubSuperadmin, loading: permissionLoading } = usePermissionContext()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  console.log('SuperAdminSidebar rendered - user:', user, 'isSubSuperadmin:', isSubSuperadmin, 'permissions:', permissions)

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

  // Navigation is now handled by PermissionContext

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
    console.log('getNavigation called - loading:', permissionLoading, 'permissions:', permissions, 'user:', user, 'isSubSuperadmin:', isSubSuperadmin)

    // For super admin, always show all navigation items
    if (user?.role === 'superadmin') {
      console.log('Super admin detected, showing all navigation items')
      return [
        { name: 'Dashboard', path: '/superadmin/dashboard', icon: LayoutDashboard, module: 'dashboard' },
        { name: 'Campus Management', path: '/superadmin/campuses', icon: Building2, module: 'campus_management' },
        { name: 'Course Management', path: '/superadmin/courses', icon: BookCopy, module: 'course_management' },
        { name: 'Batch Management', path: '/superadmin/batch-management', icon: GraduationCap, module: 'batch_management' },
        { name: 'Student Management', path: '/superadmin/students', icon: GraduationCap, module: 'student_management' },
        { name: 'Test Management', path: '/superadmin/tests', icon: FilePlus, module: 'test_management' },
        { name: 'Question Bank Upload', path: '/superadmin/question-bank-upload', icon: FilePlus, module: 'question_bank_upload' },
        { name: 'CRT Upload', path: '/superadmin/crt-upload', icon: FilePlus, module: 'crt_upload' },
        { name: 'Results Management', path: '/superadmin/results', icon: BarChart, module: 'results_management' },
        { name: 'Analytics', path: '/superadmin/analytics', icon: BarChart3, module: 'analytics' },
        { name: 'Admin Permissions', path: '/superadmin/admin-permissions', icon: Shield, module: 'admin_permissions' },
        { name: 'Sub Superadmin Management', path: '/superadmin/sub-superadmin', icon: Users, module: 'sub_superadmin_management' },
        { name: 'Notification Settings', path: '/superadmin/notification-settings', icon: Bell, module: 'notification_settings' },
        { name: 'Global Settings', path: '/superadmin/global-settings', icon: Settings, module: 'global_settings' },
        { name: 'Form Management', path: '/superadmin/form-management', icon: ClipboardList, module: 'form_management' },
      ]
    }

    if (permissionLoading) {
      console.log('Loading permissions, returning empty array')
      return []
    }

    // For sub superadmins, filter based on permissions
    if (isSubSuperadmin) {
      console.log('Sub superadmin detected, filtering navigation based on permissions')

      const allNavLinks = [
        { name: 'Dashboard', path: '/superadmin/dashboard', icon: LayoutDashboard, module: 'dashboard' },
        { name: 'Campus Management', path: '/superadmin/campuses', icon: Building2, module: 'campus_management' },
        { name: 'Course Management', path: '/superadmin/courses', icon: BookCopy, module: 'course_management' },
        { name: 'Batch Management', path: '/superadmin/batch-management', icon: GraduationCap, module: 'batch_management' },
        { name: 'Student Management', path: '/superadmin/students', icon: GraduationCap, module: 'student_management' },
        { name: 'Test Management', path: '/superadmin/tests', icon: FilePlus, module: 'test_management' },
        { name: 'Question Bank Upload', path: '/superadmin/question-bank-upload', icon: FilePlus, module: 'question_bank_upload' },
        { name: 'CRT Upload', path: '/superadmin/crt-upload', icon: FilePlus, module: 'crt_upload' },
        { name: 'Results Management', path: '/superadmin/results', icon: BarChart, module: 'results_management' },
        { name: 'Analytics', path: '/superadmin/analytics', icon: BarChart3, module: 'analytics' },
        { name: 'User Management', path: '/superadmin/user-management', icon: Users, module: 'user_management' },
        { name: 'Notification Settings', path: '/superadmin/notification-settings', icon: Bell, module: 'notification_settings' },
        { name: 'Global Settings', path: '/superadmin/global-settings', icon: Settings, module: 'global_settings' },
        { name: 'Form Management', path: '/superadmin/form-management', icon: ClipboardList, module: 'form_management' },
      ]

      // Filter navigation based on user permissions
      // Show modules with 'read' or 'write' access (not 'none')
      const filteredLinks = allNavLinks.filter(link => {
        // Dashboard is always visible
        if (link.module === 'dashboard') {
          return true
        }
        // Show if user has read or write permission (not 'none')
        const permission = permissions[link.module]
        const hasAccess = permission && permission !== 'none'
        console.log(`Module: ${link.module}, Permission: ${permission}, Has Access: ${hasAccess}`)
        return hasAccess
      })

      console.log('Filtered navigation links for sub superadmin:', filteredLinks)
      return filteredLinks
    }

    // For other admin types, return empty (they shouldn't access superadmin dashboard)
    console.log('Other admin type detected, no access to superadmin dashboard')
    return []
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
          <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Study Edge
          </h1>
          <p className="text-xs text-gray-600">
            {user?.role === 'superadmin' ? 'Super Admin Portal' :
             isSubSuperadmin ? 'Sub Superadmin Portal' :
             user?.role === 'campus_admin' ? 'Campus Admin Portal' :
             user?.role === 'course_admin' ? 'Course Admin Portal' :
             'Admin Portal'}
          </p>
          {isSubSuperadmin && user?.role !== 'superadmin' && (
            <div className="mt-1 p-1 bg-blue-50 border border-blue-200 rounded flex items-center gap-1">
              <UserCheck className="h-3 w-3 text-blue-600" />
              <p className="text-[10px] text-blue-700 font-medium">
                Sub Superadmin
              </p>
            </div>
          )}
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
                  const isDashboard = link.module === 'dashboard'
                  const canWrite = isSubSuperadmin ? hasPermission(link.module, 'write') : true
                  const canRead = isDashboard ? true : (isSubSuperadmin ? hasPermission(link.module, 'read') : true)

                  return (
                    <motion.div
                      key={link.name}
                      initial={{ x: -30, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: 0.05 * idx, type: 'spring', stiffness: 80, damping: 18 }}
                      whileHover={{ scale: (isRestricted || !canRead) ? 1 : 1.02 }}
                      whileTap={{ scale: (isRestricted || !canRead) ? 1 : 0.98 }}
                    >
                      <Link
                        to={(isRestricted || !canRead) ? '#' : link.path}
                        onClick={(e) => {
                          if (isRestricted) {
                            e.preventDefault()
                            toast.error('Upload features are restricted for your role. Please contact a Super Admin for assistance.')
                          } else if (!canRead) {
                            e.preventDefault()
                            toast.error('You do not have permission to access this page.')
                          } else {
                            // Close mobile menu on navigation
                            setIsMobileMenuOpen(false)
                          }
                        }}
                        className={`group flex items-center px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-300 relative overflow-hidden
                          ${isActive(link.path) && !isRestricted && canRead
                            ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg transform scale-105'
                            : (isRestricted || !canRead)
                            ? 'text-gray-400 bg-gray-50 border border-gray-200 cursor-not-allowed opacity-75'
                            : 'text-gray-700 hover:bg-gradient-to-r hover:from-gray-100 hover:to-blue-50 hover:text-gray-900 hover:shadow-md'
                          }
                        `}
                        title={
                          isRestricted ? 'Upload features are restricted for your role' :
                          !canRead ? 'No read permission for this page' :
                          canWrite ? 'Full read/write access' : 'Read-only access'
                        }
                      >
                        {/* Active indicator */}
                        {isActive(link.path) && !isRestricted && canRead && (
                          <motion.div
                            layoutId="activeTab"
                            className="absolute inset-0 bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl"
                            initial={false}
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                          />
                        )}

                        <link.icon className={`mr-3 h-4 w-4 transition-all duration-300 relative z-10
                          ${isActive(link.path) && !isRestricted && canRead
                            ? 'text-white'
                            : (isRestricted || !canRead)
                            ? 'text-gray-400'
                            : 'text-gray-500 group-hover:text-blue-600 group-hover:scale-110'
                          }`}
                        />
                        <span className="relative z-10 transition-all duration-300 group-hover:translate-x-1 font-semibold text-sm">
                          {link.name}
                        </span>


                        {/* Restriction indicator */}
                        {(isRestricted || !canRead) && (
                          <svg className="ml-auto h-3 w-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        )}

                        {/* Hover effect */}
                        {!isActive(link.path) && !isRestricted && canRead && (
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
          <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Study Edge
          </h1>
          <p className="text-xs text-gray-600">
            {user?.role === 'superadmin' ? 'Super Admin Portal' :
             isSubSuperadmin ? 'Sub Superadmin Portal' :
             user?.role === 'campus_admin' ? 'Campus Admin Portal' :
             user?.role === 'course_admin' ? 'Course Admin Portal' :
             'Admin Portal'}
          </p>
          {isSubSuperadmin && user?.role !== 'superadmin' && (
            <div className="mt-1 p-1 bg-blue-50 border border-blue-200 rounded flex items-center gap-1">
              <UserCheck className="h-3 w-3 text-blue-600" />
              <p className="text-[10px] text-blue-700 font-medium">
                Sub Superadmin
              </p>
            </div>
          )}
          {(user?.role === 'campus_admin' || user?.role === 'course_admin') && (
            <div className="mt-1 p-1.5 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-1.5">
              <Shield className="h-3 w-3 text-yellow-600" />
              <p className="text-xs text-yellow-700 font-medium">
                Upload features are restricted
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
                  const isDashboard = link.module === 'dashboard'
                  const canWrite = isSubSuperadmin ? hasPermission(link.module, 'write') : true
                  const canRead = isDashboard ? true : (isSubSuperadmin ? hasPermission(link.module, 'read') : true)

                  return (
                    <motion.div
                      key={link.name}
                      initial={{ x: -30, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: 0.05 * idx, type: 'spring', stiffness: 80, damping: 18 }}
                      whileHover={{ scale: (isRestricted || !canRead) ? 1 : 1.02 }}
                      whileTap={{ scale: (isRestricted || !canRead) ? 1 : 0.98 }}
                    >
                      <Link
                        to={(isRestricted || !canRead) ? '#' : link.path}
                        onClick={(e) => {
                          if (isRestricted) {
                            e.preventDefault()
                            toast.error('Upload features are restricted for your role. Please contact a Super Admin for assistance.')
                          } else if (!canRead) {
                            e.preventDefault()
                            toast.error('You do not have permission to access this page.')
                          } else {
                            // Close mobile menu on navigation
                            setIsMobileMenuOpen(false)
                          }
                        }}
                        className={`group flex items-center px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-300 relative overflow-hidden
                          ${isActive(link.path) && !isRestricted && canRead
                            ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg transform scale-105'
                            : (isRestricted || !canRead)
                            ? 'text-gray-400 bg-gray-50 border border-gray-200 cursor-not-allowed opacity-75'
                            : 'text-gray-700 hover:bg-gradient-to-r hover:from-gray-100 hover:to-blue-50 hover:text-gray-900 hover:shadow-md'
                          }
                        `}
                        title={
                          isRestricted ? 'Upload features are restricted for your role' :
                          !canRead ? 'No read permission for this page' :
                          canWrite ? 'Full read/write access' : 'Read-only access'
                        }
                      >
                        {/* Active indicator */}
                        {isActive(link.path) && !isRestricted && canRead && (
                          <motion.div
                            layoutId="activeTab"
                            className="absolute inset-0 bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl"
                            initial={false}
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                          />
                        )}

                        <link.icon className={`mr-3 h-4 w-4 transition-all duration-300 relative z-10
                          ${isActive(link.path) && !isRestricted && canRead
                            ? 'text-white'
                            : (isRestricted || !canRead)
                            ? 'text-gray-400'
                            : 'text-gray-500 group-hover:text-blue-600 group-hover:scale-110'
                          }`}
                        />
                        <span className="relative z-10 transition-all duration-300 group-hover:translate-x-1 font-semibold text-sm">
                          {link.name}
                        </span>


                        {/* Restriction indicator */}
                        {(isRestricted || !canRead) && (
                          <svg className="ml-auto h-3 w-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        )}

                        {/* Hover effect */}
                        {!isActive(link.path) && !isRestricted && canRead && (
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
      <div className="flex-1 bg-gray-50 w-full lg:ml-64 flex flex-col h-screen overflow-hidden">
        <Header />
        <div className="flex-1 overflow-hidden min-h-0">
        <Outlet />
        </div>
      </div>
    </div>
  )
}

export default SuperAdminSidebar 
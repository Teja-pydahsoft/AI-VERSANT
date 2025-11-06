import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import LoadingSpinner from './LoadingSpinner'

const ProtectedRoute = ({ children, allowedRoles = [] }) => {
  const { user, loading, isAuthenticated } = useAuth()
  const location = useLocation()

  console.log('ProtectedRoute - Current location:', location.pathname)
  console.log('ProtectedRoute - User:', user)
  console.log('ProtectedRoute - Loading:', loading)
  console.log('ProtectedRoute - IsAuthenticated:', isAuthenticated)
  console.log('ProtectedRoute - Allowed roles:', allowedRoles)
  console.log('ProtectedRoute - User role:', user?.role)

  // Show loading spinner while checking authentication
  if (loading) {
    console.log('ProtectedRoute - Showing loading spinner')
    return <LoadingSpinner />
  }

  // Check if user is authenticated
  if (!isAuthenticated) {
    console.log('ProtectedRoute - User not authenticated, redirecting to login')
    // Store the current location to redirect back after login
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Check role-based access
  if (allowedRoles.length > 0 && user && !allowedRoles.includes(user.role)) {
    console.log('ProtectedRoute - User role not allowed, redirecting to appropriate dashboard')
    
    // Redirect to appropriate dashboard based on user role
    const roleRoutes = {
      superadmin: '/superadmin',
      super_admin: '/superadmin',
      sub_superadmin: '/superadmin',  // Sub-superadmins use superadmin dashboard
      campus_admin: '/campus-admin',
      course_admin: '/course-admin',
      student: '/student',
    }

    const redirectPath = roleRoutes[user.role] || '/'
    console.log('ProtectedRoute - Redirecting to:', redirectPath)
    return <Navigate to={redirectPath} replace />
  }

  // User is authenticated and has proper role, render the protected content
  console.log('ProtectedRoute - Rendering protected content')
  return children
}

export default ProtectedRoute 
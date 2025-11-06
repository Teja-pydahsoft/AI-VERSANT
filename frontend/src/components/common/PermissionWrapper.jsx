import React from 'react'
import { usePermissionContext } from '../../contexts/PermissionContext'
import { ShieldOff, Lock } from 'lucide-react'

/**
 * PermissionWrapper Component
 * 
 * Wraps content with permission checks for sub-superadmin users.
 * - Shows "Access Denied" if no read permission
 * - Passes `isReadOnly` prop to children if only read permission (no write)
 * - Allows full access if write permission or if user is superadmin
 * 
 * @param {string} module - The module name to check permissions for
 * @param {React.ReactNode} children - Content to render if permission granted
 * @param {React.ReactNode} fallback - Optional custom fallback for no access
 */
const PermissionWrapper = ({ module, children, fallback }) => {
  const { permissions, isSubSuperadmin, loading } = usePermissionContext()

  // Show loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading permissions...</p>
        </div>
      </div>
    )
  }

  // If not sub-superadmin, allow full access (superadmin has all permissions)
  if (!isSubSuperadmin) {
    return <>{children}</>
  }

  // Check permissions for sub-superadmin
  const permission = permissions[module]
  const hasReadAccess = permission && permission !== 'none'
  const hasWriteAccess = permission === 'write'

  // No access - show access denied
  if (!hasReadAccess) {
    if (fallback) {
      return <>{fallback}</>
    }

    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="mb-6">
            <div className="mx-auto w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
              <ShieldOff className="h-10 w-10 text-red-600" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Access Denied</h2>
          <p className="text-gray-600 mb-6">
            You do not have permission to access this module. Please contact your administrator if you believe this is an error.
          </p>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-700">
              <span className="font-semibold">Module:</span> {module}
            </p>
            <p className="text-sm text-gray-700 mt-1">
              <span className="font-semibold">Your Permission:</span> {permission || 'none'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Has read access - render children with isReadOnly prop
  // Clone children and pass isReadOnly prop
  const childrenWithProps = React.Children.map(children, child => {
    if (React.isValidElement(child)) {
      return React.cloneElement(child, { isReadOnly: !hasWriteAccess })
    }
    return child
  })

  return (
    <div className="relative">
      {/* Compact Read-only badge - Top Right */}
      {!hasWriteAccess && (
        <div className="fixed top-20 right-6 z-50 animate-fade-in">
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 border-2 border-blue-400">
            <Lock className="h-4 w-4" />
            <span className="text-sm font-semibold">Read-Only</span>
          </div>
        </div>
      )}
      {childrenWithProps}
    </div>
  )
}

export default PermissionWrapper

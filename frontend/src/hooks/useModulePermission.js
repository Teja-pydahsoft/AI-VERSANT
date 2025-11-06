import { usePermissionContext } from '../contexts/PermissionContext'

/**
 * Custom hook to check module permissions
 * 
 * @param {string} module - Module name to check permissions for
 * @returns {object} Permission state and helpers
 */
export const useModulePermission = (module) => {
  const { permissions, isSubSuperadmin, hasPermission, loading } = usePermissionContext()

  // If not sub-superadmin, grant full access
  if (!isSubSuperadmin) {
    return {
      loading,
      hasAccess: true,
      hasReadAccess: true,
      hasWriteAccess: true,
      isReadOnly: false,
      permission: 'write',
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canView: true,
    }
  }

  // Get permission for the module
  const permission = permissions[module]
  const hasReadAccess = permission && permission !== 'none'
  const hasWriteAccess = permission === 'write'

  return {
    loading,
    hasAccess: hasReadAccess,
    hasReadAccess,
    hasWriteAccess,
    isReadOnly: hasReadAccess && !hasWriteAccess,
    permission: permission || 'none',
    canCreate: hasWriteAccess,
    canEdit: hasWriteAccess,
    canDelete: hasWriteAccess,
    canView: hasReadAccess,
  }
}

export default useModulePermission

import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const PermissionContext = createContext({
  permissions: {},
  hasPermission: (page, access) => false,
  isSubSuperadmin: false,
  loading: true,
  error: null
});

export const usePermissionContext = () => {
  const context = useContext(PermissionContext);
  if (!context) {
    throw new Error('usePermissionContext must be used within PermissionProvider');
  }
  return context;
};

export const PermissionProvider = ({ children }) => {
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubSuperadmin, setIsSubSuperadmin] = useState(false);

  // Load user permissions
  const loadPermissions = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      if (!token) {
        console.log('ℹ️ No auth token found');
        setLoading(false);
        return;
      }

      const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
      if (!currentUser || !currentUser.id) {
        console.log('ℹ️ No user data found');
        setLoading(false);
        return;
      }

      console.log('🔍 Loading permissions for user:', currentUser.username, 'role:', currentUser.role);

      // Check if user is superadmin
      if (currentUser.role === 'superadmin') {
        console.log('✅ Superadmin detected - full permissions granted');
        setPermissions({}); // Superadmin has all permissions
        setIsSubSuperadmin(false); // Not a sub superadmin
        setLoading(false);
        return;
      }

      // For non-superadmin users, get sub superadmin permissions
      try {
        console.log('🔍 Checking sub superadmin permissions for user:', currentUser.id);
        const response = await api.get(`/sub-superadmin/permissions/${currentUser.id}`);

        if (response.data.success) {
          const userPermissions = response.data.permissions || {};
          setPermissions(userPermissions);
          setIsSubSuperadmin(Object.keys(userPermissions).length > 0);
          console.log('✅ Sub superadmin permissions loaded:', userPermissions);
        } else {
          console.log('ℹ️ No sub superadmin permissions found');
          setPermissions({});
          setIsSubSuperadmin(false);
        }
      } catch (subAdminError) {
        console.log('ℹ️ User is not a sub superadmin:', subAdminError.message);
        setPermissions({});
        setIsSubSuperadmin(false);
      }
    } catch (err) {
      console.error('❌ Error loading permissions:', err);
      setError(err.message);
      setPermissions({});
      setIsSubSuperadmin(false);
    } finally {
      setLoading(false);
    }
  };

  // Check if user has permission for a specific page
  const hasPermission = (page, requiredAccess = 'read') => {
    // Get current user info
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

    // Superadmin has all permissions
    if (currentUser.role === 'superadmin') {
      return true;
    }

    // For sub superadmins, check specific permissions
    if (isSubSuperadmin) {
      const userAccess = permissions[page];
      if (!userAccess || userAccess === 'none') return false;

      if (requiredAccess === 'read') {
        return userAccess === 'read' || userAccess === 'write';
      } else if (requiredAccess === 'write') {
        return userAccess === 'write';
      }
    }

    return false;
  };

  // Check permission via API (for dynamic checks)
  const checkPermission = async (page, access = 'read') => {
    try {
      // Get current user
      const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

      // Superadmin always has permission
      if (currentUser.role === 'superadmin') {
        return true;
      }

      // For sub superadmins, check via API
      const response = await api.post('/sub-superadmin/check-permission', {
        page,
        access
      });

      if (response.data.success) {
        return response.data.has_permission;
      }
      return false;
    } catch (err) {
      console.error('Error checking permission:', err);
      return false;
    }
  };

  // Get all available permission templates
  const getPermissionTemplates = async () => {
    try {
      const response = await api.get('/sub-superadmin/templates');
      if (response.data.success) {
        return response.data.templates;
      }
      return {};
    } catch (err) {
      console.error('Error getting permission templates:', err);
      return {};
    }
  };

  // Refresh permissions
  const refreshPermissions = () => {
    loadPermissions();
  };

  // Initialize permissions on mount
  useEffect(() => {
    loadPermissions();
  }, []);

  const value = {
    permissions,
    hasPermission,
    checkPermission,
    isSubSuperadmin,
    loading,
    error,
    refreshPermissions,
    getPermissionTemplates
  };

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
};

export default PermissionContext;
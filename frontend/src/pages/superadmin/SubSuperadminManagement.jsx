import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, Plus, Edit, Trash2, Shield, Eye, PenTool, Mail, Phone, User as UserIcon, Key, EyeOff } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../../services/api';
import { usePermissionContext } from '../../contexts/PermissionContext';

const SubSuperadminManagement = () => {
  const { hasPermission, loading: permissionLoading, isSubSuperadmin, permissions } = usePermissionContext();
  const [subSuperadmins, setSubSuperadmins] = useState([]);
  const [templates, setTemplates] = useState({});
  const [availableModules, setAvailableModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    username: '',
    password: '',
    role_name: '',  // Can be custom or from template
    use_template: false,
    selected_template: '',
    permissions: {}  // Always customizable
  });

  // Show loading while permissions are being loaded
  if (permissionLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Check if user has permission to manage sub superadmins
  // For superadmin role, always allow access
  const canManageSubSuperadmins = hasPermission('sub_superadmin_management', 'write');

  console.log('Permission check - canManageSubSuperadmins:', canManageSubSuperadmins, 'permissions:', permissions, 'isSubSuperadmin:', isSubSuperadmin);

  if (!canManageSubSuperadmins) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <Shield className="h-5 w-5 text-red-400 mr-2" />
            <p className="text-red-700 font-medium">Access Denied</p>
          </div>
          <p className="text-red-600 text-sm mt-1">
            You don't have permission to manage sub superadmins.
          </p>
          <div className="mt-2 text-xs text-gray-500">
            Debug: permissions={JSON.stringify(permissions)}, isSubSuperadmin={isSubSuperadmin}
          </div>
        </div>
      </div>
    );
  }

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadSubSuperadmins(),
        loadTemplates(),
        loadAvailableModules()
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadSubSuperadmins = async () => {
    try {
      const response = await api.get('/sub-superadmin/list');
      if (response.data.success) {
        setSubSuperadmins(response.data.data.sub_superadmins || []);
      }
    } catch (error) {
      console.error('Error loading sub superadmins:', error);
      toast.error('Failed to load sub superadmins');
    }
  };

  const loadTemplates = async () => {
    try {
      const response = await api.get('/sub-superadmin/templates');
      if (response.data.success) {
        setTemplates(response.data.templates || {});
      }
    } catch (error) {
      console.error('Error loading templates:', error);
      toast.error('Failed to load permission templates');
    }
  };

  const loadAvailableModules = async () => {
    try {
      const response = await api.get('/sub-superadmin/available-modules');
      if (response.data.success) {
        setAvailableModules(response.data.data.modules || []);
        
        // Initialize permissions for form
        const initialPermissions = {};
        response.data.data.modules.forEach(module => {
          initialPermissions[module.id] = 'none';
        });
        setFormData(prev => ({ ...prev, permissions: initialPermissions }));
      }
    } catch (error) {
      console.error('Error loading modules:', error);
      toast.error('Failed to load modules');
    }
  };

  const handleCreate = async () => {
    try {
      // Validation
      if (!formData.name || !formData.email || !formData.phone || 
          !formData.username || !formData.password || !formData.role_name) {
        toast.error('All fields are required');
        return;
      }
      
      // Check at least one permission is set
      const hasPermissions = Object.values(formData.permissions).some(p => p !== 'none');
      if (!hasPermissions) {
        toast.error('Please set at least one permission');
        return;
      }
      
      const response = await api.post('/sub-superadmin/create', {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        username: formData.username,
        password: formData.password,
        role_name: formData.role_name,
        permissions: formData.permissions
      });
      
      if (response.data.success) {
        toast.success('Sub-superadmin created successfully!');
        setShowCreateModal(false);
        resetForm();
        loadSubSuperadmins();
      } else {
        toast.error(response.data.message || 'Failed to create sub-superadmin');
      }
    } catch (error) {
      console.error('Error creating sub-superadmin:', error);
      const errorMessage = error.response?.data?.message || 'Failed to create sub-superadmin';
      toast.error(errorMessage);
    }
  };

  const handleUpdatePermissions = async (userId, permissions) => {
    try {
      // Validate userId before making the request
      if (!userId || userId === 'undefined') {
        console.error('Invalid userId:', userId);
        toast.error('Invalid user ID. Please try again.');
        return;
      }

      const response = await api.put(`/sub-superadmin/permissions/${userId}`, { permissions });
      if (response.data.success) {
        toast.success('Permissions updated successfully');
        loadSubSuperadmins();
      } else {
        toast.error(response.data.message || 'Failed to update permissions');
      }
    } catch (error) {
      console.error('Error updating permissions:', error);
      const errorMessage = error.response?.data?.message || 'Failed to update permissions';
      toast.error(errorMessage);
    }
  };

  const handleDeactivate = async (userId, userName) => {
    if (!window.confirm(`Are you sure you want to deactivate ${userName}?`)) {
      return;
    }

    try {
      const response = await api.delete(`/sub-superadmin/${userId}`);
      if (response.data.success) {
        toast.success('Sub-superadmin deactivated successfully');
        loadSubSuperadmins();
      } else {
        toast.error(response.data.message || 'Failed to deactivate sub-superadmin');
      }
    } catch (error) {
      console.error('Error deactivating sub-superadmin:', error);
      const errorMessage = error.response?.data?.message || 'Failed to deactivate sub-superadmin';
      toast.error(errorMessage);
    }
  };
  
  const handleTemplateSelect = (templateKey) => {
    if (!templateKey) {
      // No template selected - reset permissions
      const emptyPermissions = {};
      availableModules.forEach(module => {
        emptyPermissions[module.id] = 'none';
      });
      setFormData({
        ...formData,
        selected_template: '',
        role_name: '',
        permissions: emptyPermissions
      });
      return;
    }
    
    // Template selected - pre-fill
    const template = templates[templateKey];
    if (template) {
      setFormData({
        ...formData,
        selected_template: templateKey,
        role_name: templateKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        permissions: { ...template.permissions }
      });
    }
  };
  
  const handlePermissionChange = (moduleId, access) => {
    setFormData({
      ...formData,
      permissions: {
        ...formData.permissions,
        [moduleId]: access
      }
    });
  };

  const resetForm = () => {
    const emptyPermissions = {};
    availableModules.forEach(module => {
      emptyPermissions[module.id] = 'none';
    });
    
    setFormData({
      name: '',
      email: '',
      phone: '',
      username: '',
      password: '',
      role_name: '',
      use_template: false,
      selected_template: '',
      permissions: emptyPermissions
    });
    setShowPassword(false);
  };

  const getPermissionBadge = (access) => {
    switch (access) {
      case 'write':
        return <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded-full">Write</span>;
      case 'read':
        return <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-full">Read</span>;
      default:
        return <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded-full">None</span>;
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sub Superadmin Management</h1>
          <p className="text-gray-600 mt-1">Manage sub superadmins and their permissions</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
        >
          <Plus className="h-4 w-4" />
          <span>Add Sub Superadmin</span>
        </button>
      </div>

      {/* Sub Superadmins List */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Sub Superadmins ({subSuperadmins.length})</h2>
        </div>

        {subSuperadmins.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No sub superadmins found. Create your first sub superadmin to get started.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {subSuperadmins.map((admin) => (
              <div key={admin.user_id} className="p-6">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{admin.name}</h3>
                      <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-full">
                        {admin.role_name}
                      </span>
                      <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded-full">
                        Active
                      </span>
                    </div>
                    <p className="text-gray-600 text-sm">@{admin.username}</p>
                    <p className="text-gray-500 text-xs mt-1">
                      Created: {new Date(admin.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex space-x-2">
                    <button
                      onClick={() => setEditingAdmin(admin)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                      title="Edit Permissions"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeactivate(admin._id, admin.name)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      title="Deactivate"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Permissions Preview */}
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Permissions:</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {Object.entries(admin.permissions || {}).slice(0, 8).map(([page, access]) => (
                      <div key={page} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <span className="text-xs text-gray-600 capitalize">
                          {page.replace('_', ' ')}
                        </span>
                        {getPermissionBadge(access)}
                      </div>
                    ))}
                    {Object.keys(admin.permissions || {}).length > 8 && (
                      <div className="flex items-center justify-center p-2 bg-gray-50 rounded">
                        <span className="text-xs text-gray-500">
                          +{Object.keys(admin.permissions).length - 8} more
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4 flex items-center">
              <UserIcon className="h-6 w-6 mr-2 text-blue-600" />
              Create Sub-Superadmin
            </h2>

            <div className="space-y-4">
              {/* User Details Section */}
              <div className="border-b pb-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">User Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="John Doe"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="john@example.com"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="+1234567890"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Username <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.username}
                      onChange={(e) => setFormData({...formData, username: e.target.value})}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="johndoe"
                    />
                  </div>
                  
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={formData.password}
                        onChange={(e) => setFormData({...formData, password: e.target.value})}
                        className="w-full p-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Role Configuration Section */}
              <div className="border-b pb-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Role Configuration</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Template (Optional)
                    </label>
                    <select
                      value={formData.selected_template}
                      onChange={(e) => handleTemplateSelect(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">No template - Create custom</option>
                      {Object.entries(templates).map(([key, template]) => (
                        <option key={key} value={key}>
                          {template.name} - {template.description}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Templates pre-fill permissions, but you can always customize them
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Role Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.role_name}
                      onChange={(e) => setFormData({...formData, role_name: e.target.value})}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., Student Manager, Content Coordinator"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Enter any custom role name
                    </p>
                  </div>
                </div>
              </div>

              {/* Permissions Section */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Permissions <span className="text-red-500">*</span>
                </h3>
                <p className="text-xs text-gray-500 mb-3">
                  Set at least one permission. Dashboard is available to all users by default.
                </p>
                <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-3">
                  {availableModules.map((module) => (
                    <div key={module.id} className="flex items-center justify-between p-2 bg-gray-50 rounded hover:bg-gray-100">
                      <span className="text-sm text-gray-700 font-medium capitalize">
                        {module.name}
                      </span>
                      <select
                        value={formData.permissions[module.id] || 'none'}
                        onChange={(e) => handlePermissionChange(module.id, e.target.value)}
                        className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="none">None</option>
                        <option value="read">Read</option>
                        <option value="write">Write</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={handleCreate}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 font-medium transition-colors"
              >
                Create Sub-Superadmin
              </button>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetForm();
                }}
                className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Permissions Modal */}
      {editingAdmin && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Edit Permissions - {editingAdmin.name}</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(editingAdmin.permissions || {}).map(([page, access]) => (
                <div key={page} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                  <span className="text-sm font-medium text-gray-700 capitalize">
                    {page.replace('_', ' ')}
                  </span>
                  <select
                    value={access}
                    onChange={(e) => {
                      const newPermissions = {...editingAdmin.permissions, [page]: e.target.value};
                      setEditingAdmin({...editingAdmin, permissions: newPermissions});
                    }}
                    className="text-sm border border-gray-300 rounded px-2 py-1"
                  >
                    <option value="none">None</option>
                    <option value="read">Read</option>
                    <option value="write">Write</option>
                  </select>
                </div>
              ))}
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => {
                  handleUpdatePermissions(editingAdmin._id, editingAdmin.permissions);
                  setEditingAdmin(null);
                }}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700"
              >
                Update Permissions
              </button>
              <button
                onClick={() => setEditingAdmin(null)}
                className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubSuperadminManagement;
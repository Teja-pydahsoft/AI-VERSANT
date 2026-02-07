import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotification } from '../../contexts/NotificationContext';
import Swal from 'sweetalert2';

import LoadingSpinner from '../../components/common/LoadingSpinner';
import api from '../../services/api';
import { 
  Shield, Users, Settings, Check, X, Edit, RotateCcw, 
  Building2, BookOpen, GraduationCap, FileText, BarChart3,
  Eye, EyeOff, Save, AlertCircle, Plus, UserPlus, Mail, Lock, User, Trash2
} from 'lucide-react';

const AdminPermissions = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAdmin, setSelectedAdmin] = useState(null);
  const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false);
  const [isCreateAdminModalOpen, setIsCreateAdminModalOpen] = useState(false);
  const [availableModules, setAvailableModules] = useState({});
  const [campuses, setCampuses] = useState([]);
  const [courses, setCourses] = useState([]);
  const [selectedCampus, setSelectedCampus] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [adminForm, setAdminForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'campus_admin'
  });
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [deletingAdmin, setDeletingAdmin] = useState(null);
  const { success, error } = useNotification();

  useEffect(() => {
    fetchAdmins();
    fetchAvailableModules();
    fetchCampuses();
  }, []);

  useEffect(() => {
    if (selectedCampus) {
      fetchCoursesByCampus(selectedCampus);
    } else {
      setCourses([]);
    }
  }, [selectedCampus]);

  const fetchAdmins = async () => {
    try {
      setLoading(true);
      const response = await api.get('/access-control/admins');
      setAdmins(response.data.data);
    } catch (err) {
      await Swal.fire({
        title: 'Fetch Failed!',
        text: 'Failed to fetch admins. Please try again.',
        icon: 'error',
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'OK',
        customClass: {
          popup: 'rounded-2xl',
          title: 'text-xl font-bold text-gray-900',
          confirmButton: 'px-6 py-3 rounded-xl font-semibold'
        }
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableModules = async () => {
    try {
      const response = await api.get('/access-control/modules');
      setAvailableModules(response.data.data);
    } catch (err) {
      console.error('Failed to fetch available modules:', err);
    }
  };

  const fetchCampuses = async () => {
    try {
      const response = await api.get('/campus-management/campuses');
      setCampuses(response.data.data || []);
    } catch (err) {
      console.error('Failed to fetch campuses:', err);
    }
  };

  const fetchCoursesByCampus = async (campusId) => {
    try {
      const response = await api.get(`/course-management/courses?campus_id=${campusId}`);
      setCourses(response.data.data || []);
    } catch (err) {
      console.error('Failed to fetch courses:', err);
    }
  };

  const handleEditPermissions = async (admin) => {
    try {
      const response = await api.get(`/access-control/permissions/${admin.id}`);
      setSelectedAdmin(response.data.data);
      setIsPermissionModalOpen(true);
    } catch (err) {
      await Swal.fire({
        title: 'Fetch Failed!',
        text: 'Failed to fetch admin permissions. Please try again.',
        icon: 'error',
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'OK',
        customClass: {
          popup: 'rounded-2xl',
          title: 'text-xl font-bold text-gray-900',
          confirmButton: 'px-6 py-3 rounded-xl font-semibold'
        }
      });
    }
  };

  const handleResetPermissions = async (adminId) => {
    const admin = admins.find(a => a.id === adminId);
    
    const result = await Swal.fire({
      title: 'Reset Permissions?',
      html: `
        <div class="text-left">
          <p class="mb-4">Are you sure you want to reset permissions for this admin?</p>
          <div class="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
            <div class="flex items-center mb-2">
              <div class="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center mr-3">
                <svg class="w-5 h-5 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"></path>
                </svg>
              </div>
              <div>
                <p class="font-semibold text-gray-900">${admin?.name || 'Unknown Admin'}</p>
                <p class="text-sm text-gray-600">${admin?.email || 'Unknown Email'}</p>
                <p class="text-xs text-gray-500">${admin?.role?.replace('_', ' ').toUpperCase() || 'UNKNOWN'}</p>
              </div>
            </div>
          </div>
          <p class="text-orange-600 font-semibold">⚠️ This will reset all permissions to default values!</p>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#f59e0b',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, Reset Permissions',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      focusCancel: true,
      customClass: {
        popup: 'rounded-2xl',
        title: 'text-xl font-bold text-gray-900',
        confirmButton: 'px-6 py-3 rounded-xl font-semibold',
        cancelButton: 'px-6 py-3 rounded-xl font-semibold'
      }
    });

    if (!result.isConfirmed) {
      return;
    }

    try {
      await api.post(`/access-control/reset-permissions/${adminId}`);
      
      await Swal.fire({
        title: 'Permissions Reset!',
        text: 'Admin permissions have been successfully reset to default values.',
        icon: 'success',
        confirmButtonColor: '#10b981',
        confirmButtonText: 'OK',
        customClass: {
          popup: 'rounded-2xl',
          title: 'text-xl font-bold text-gray-900',
          confirmButton: 'px-6 py-3 rounded-xl font-semibold'
        }
      });
      
      fetchAdmins();
    } catch (err) {
      await Swal.fire({
        title: 'Reset Failed!',
        text: err.response?.data?.message || 'Failed to reset permissions',
        icon: 'error',
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'OK',
        customClass: {
          popup: 'rounded-2xl',
          title: 'text-xl font-bold text-gray-900',
          confirmButton: 'px-6 py-3 rounded-xl font-semibold'
        }
      });
    }
  };

  const handleDeleteAdmin = async (admin) => {
    // SweetAlert confirmation dialog
    const result = await Swal.fire({
      title: 'Delete Admin?',
      html: `
        <div class="text-left">
          <p class="mb-4">Are you sure you want to delete this admin?</p>
          <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <div class="flex items-center mb-2">
              <div class="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mr-3">
                <svg class="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"></path>
                </svg>
              </div>
              <div>
                <p class="font-semibold text-gray-900">${admin.name}</p>
                <p class="text-sm text-gray-600">${admin.email}</p>
                <p class="text-xs text-gray-500">${admin.role.replace('_', ' ').toUpperCase()}</p>
              </div>
            </div>
          </div>
          <p class="text-red-600 font-semibold">⚠️ This action is permanent and cannot be undone!</p>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, Delete Admin',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      focusCancel: true,
      customClass: {
        popup: 'rounded-2xl',
        title: 'text-xl font-bold text-gray-900',
        confirmButton: 'px-6 py-3 rounded-xl font-semibold',
        cancelButton: 'px-6 py-3 rounded-xl font-semibold'
      }
    });

    if (!result.isConfirmed) {
      return;
    }

    // Second confirmation with input
    const { value: confirmText } = await Swal.fire({
      title: 'Final Confirmation',
      html: `
        <div class="text-center">
          <p class="mb-4">To confirm deletion, please type:</p>
          <div class="bg-gray-100 border border-gray-300 rounded-lg p-3 mb-4">
            <code class="text-lg font-mono font-bold text-red-600">DELETE</code>
          </div>
        </div>
      `,
      input: 'text',
      inputPlaceholder: 'Type DELETE here',
      inputValidator: (value) => {
        if (value !== 'DELETE') {
          return 'You must type exactly "DELETE" to confirm!';
        }
      },
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Confirm Deletion',
      cancelButtonText: 'Cancel',
      customClass: {
        popup: 'rounded-2xl',
        title: 'text-xl font-bold text-gray-900',
        input: 'rounded-xl border-gray-300 focus:border-red-500 focus:ring-red-500',
        confirmButton: 'px-6 py-3 rounded-xl font-semibold',
        cancelButton: 'px-6 py-3 rounded-xl font-semibold'
      }
    });

    if (!confirmText) {
      return;
    }

    setDeletingAdmin(admin.id);
    try {
      await api.delete(`/admin-management/${admin.id}`);
      
      // Success notification
      await Swal.fire({
        title: 'Admin Deleted!',
        text: `${admin.name} has been successfully deleted.`,
        icon: 'success',
        confirmButtonColor: '#10b981',
        confirmButtonText: 'OK',
        customClass: {
          popup: 'rounded-2xl',
          title: 'text-xl font-bold text-gray-900',
          confirmButton: 'px-6 py-3 rounded-xl font-semibold'
        }
      });
      
      fetchAdmins();
    } catch (err) {
      // Error notification
      await Swal.fire({
        title: 'Deletion Failed!',
        text: err.response?.data?.message || 'Failed to delete admin',
        icon: 'error',
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'OK',
        customClass: {
          popup: 'rounded-2xl',
          title: 'text-xl font-bold text-gray-900',
          confirmButton: 'px-6 py-3 rounded-xl font-semibold'
        }
      });
    } finally {
      setDeletingAdmin(null);
    }
  };

  const handleCreateAdmin = async () => {
    if (!adminForm.name || !adminForm.email || !adminForm.password) {
      await Swal.fire({
        title: 'Missing Information!',
        text: 'Please fill all required fields',
        icon: 'warning',
        confirmButtonColor: '#f59e0b',
        confirmButtonText: 'OK',
        customClass: {
          popup: 'rounded-2xl',
          title: 'text-xl font-bold text-gray-900',
          confirmButton: 'px-6 py-3 rounded-xl font-semibold'
        }
      });
      return;
    }

    if (adminForm.role === 'campus_admin' && !selectedCampus) {
      await Swal.fire({
        title: 'Campus Required!',
        text: 'Please select a campus for campus admin',
        icon: 'warning',
        confirmButtonColor: '#f59e0b',
        confirmButtonText: 'OK',
        customClass: {
          popup: 'rounded-2xl',
          title: 'text-xl font-bold text-gray-900',
          confirmButton: 'px-6 py-3 rounded-xl font-semibold'
        }
      });
      return;
    }

    if (adminForm.role === 'course_admin' && !selectedCourse) {
      await Swal.fire({
        title: 'Course Required!',
        text: 'Please select a course for course admin',
        icon: 'warning',
        confirmButtonColor: '#f59e0b',
        confirmButtonText: 'OK',
        customClass: {
          popup: 'rounded-2xl',
          title: 'text-xl font-bold text-gray-900',
          confirmButton: 'px-6 py-3 rounded-xl font-semibold'
        }
      });
      return;
    }

    setCreatingAdmin(true);
    try {
      const adminData = {
        name: adminForm.name,
        email: adminForm.email,
        password: adminForm.password,
        role: adminForm.role
      };

      if (adminForm.role === 'campus_admin') {
        adminData.campus_id = selectedCampus;
      } else if (adminForm.role === 'course_admin') {
        adminData.course_id = selectedCourse;
      }

      const response = await api.post('/admin-management/create', adminData);
      
      if (response.data.success) {
        await Swal.fire({
          title: 'Admin Created!',
          html: `
            <div class="text-center">
              <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"></path>
                </svg>
              </div>
              <p class="text-lg font-semibold text-gray-900 mb-2">${adminForm.name}</p>
              <p class="text-sm text-gray-600 mb-4">${adminForm.email}</p>
              <p class="text-xs text-gray-500 bg-gray-100 rounded-full px-3 py-1 inline-block">
                ${adminForm.role.replace('_', ' ').toUpperCase()}
              </p>
              <p class="text-sm text-gray-600 mt-4">Admin has been created and credentials have been sent via email.</p>
            </div>
          `,
          icon: 'success',
          confirmButtonColor: '#10b981',
          confirmButtonText: 'Great!',
          customClass: {
            popup: 'rounded-2xl',
            title: 'text-xl font-bold text-gray-900',
            confirmButton: 'px-6 py-3 rounded-xl font-semibold'
          }
        });
        
        setIsCreateAdminModalOpen(false);
        setAdminForm({ name: '', email: '', password: '', role: 'campus_admin' });
        setSelectedCampus('');
        setSelectedCourse('');
        fetchAdmins();
      }
    } catch (err) {
      await Swal.fire({
        title: 'Creation Failed!',
        text: err.response?.data?.message || 'Failed to create admin',
        icon: 'error',
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'OK',
        customClass: {
          popup: 'rounded-2xl',
          title: 'text-xl font-bold text-gray-900',
          confirmButton: 'px-6 py-3 rounded-xl font-semibold'
        }
      });
    } finally {
      setCreatingAdmin(false);
    }
  };

  const getRoleIcon = (role) => {
    switch (role) {
      case 'campus_admin':
        return <Building2 className="h-5 w-5" />;
      case 'course_admin':
        return <BookOpen className="h-5 w-5" />;
      default:
        return <Users className="h-5 w-5" />;
    }
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'campus_admin':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'course_admin':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getModuleIcon = (module) => {
    const icons = {
      dashboard: <BarChart3 className="h-4 w-4" />,
      campus_management: <Building2 className="h-4 w-4" />,
      course_management: <BookOpen className="h-4 w-4" />,
      batch_management: <GraduationCap className="h-4 w-4" />,
      student_management: <GraduationCap className="h-4 w-4" />,
      test_management: <FileText className="h-4 w-4" />,
      question_bank_upload: <FileText className="h-4 w-4" />,
      crt_upload: <FileText className="h-4 w-4" />,
      results_management: <BarChart3 className="h-4 w-4" />,
      analytics: <BarChart3 className="h-4 w-4" />,
      reports: <BarChart3 className="h-4 w-4" />
    };
    return icons[module] || <Settings className="h-4 w-4" />;
  };

  return (
    <>
    <main className="px-6 lg:px-10 py-12 bg-gradient-to-br from-gray-50 to-blue-50">
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.5 }}
          >
            {/* Header Section */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl shadow-lg">
                  <Shield className="h-10 w-10 text-white" />
                </div>
                <div>
                  <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Admin Permissions</h1>
                  <p className="text-lg text-gray-600 mt-1">Manage access controls for campus and course administrators</p>
                </div>
              </div>
              
              {/* Create Admin Button */}
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                onClick={() => setIsCreateAdminModalOpen(true)}
                className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
              >
                <UserPlus className="h-5 w-5" />
                Create New Admin
              </motion.button>
            </div>

            {loading ? (
              <div className="flex justify-center items-center h-64">
                <LoadingSpinner />
              </div>
            ) : (
              <div className="space-y-8">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow duration-300"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-1">Total Admins</p>
                        <p className="text-4xl font-bold text-gray-900">{admins.length}</p>
                        <p className="text-sm text-gray-500 mt-1">Active administrators</p>
                      </div>
                      <div className="p-4 bg-gradient-to-r from-blue-500 to-blue-600 rounded-2xl">
                        <Users className="h-8 w-8 text-white" />
                      </div>
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow duration-300"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-1">Campus Admins</p>
                        <p className="text-4xl font-bold text-gray-900">
                          {admins.filter(a => a.role === 'campus_admin').length}
                        </p>
                        <p className="text-sm text-gray-500 mt-1">Campus managers</p>
                      </div>
                      <div className="p-4 bg-gradient-to-r from-green-500 to-green-600 rounded-2xl">
                        <Building2 className="h-8 w-8 text-white" />
                      </div>
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow duration-300"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-1">Course Admins</p>
                        <p className="text-4xl font-bold text-gray-900">
                          {admins.filter(a => a.role === 'course_admin').length}
                        </p>
                        <p className="text-sm text-gray-500 mt-1">Course managers</p>
                      </div>
                      <div className="p-4 bg-gradient-to-r from-purple-500 to-purple-600 rounded-2xl">
                        <BookOpen className="h-8 w-8 text-white" />
                      </div>
                    </div>
                  </motion.div>
                </div>

                {/* Admins List */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden"
                >
                  <div className="px-8 py-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-2xl font-bold text-gray-900">Admin List</h2>
                        <p className="text-gray-600 mt-1">Manage permissions for each administrator</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-500">Total: {admins.length} admins</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="divide-y divide-gray-100">
                    {admins.map((admin, index) => (
                      <motion.div
                        key={admin.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 * index }}
                        className="p-6 hover:bg-gray-50 transition-colors duration-200"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="p-3 bg-gradient-to-r from-gray-100 to-gray-200 rounded-xl">
                              {getRoleIcon(admin.role)}
                            </div>
                            <div>
                              <h3 className="text-lg font-semibold text-gray-900">{admin.name}</h3>
                              <p className="text-sm text-gray-600 flex items-center gap-2">
                                <Mail className="h-4 w-4" />
                                {admin.email}
                              </p>
                              <div className="flex items-center gap-3 mt-2">
                                <span className={`px-3 py-1 text-xs font-medium rounded-full border ${getRoleColor(admin.role)}`}>
                                  {admin.role.replace('_', ' ')}
                                </span>
                                {admin.permissions_updated_at && (
                                  <span className="text-xs text-gray-500">
                                    Updated: {new Date(admin.permissions_updated_at).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-sm font-medium text-gray-900">
                                {admin.permissions?.modules?.length || 0} modules
                              </p>
                              <p className="text-xs text-gray-600">accessible</p>
                            </div>
                            
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleEditPermissions(admin)}
                                className="p-3 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors duration-200"
                                title="Edit Permissions"
                              >
                                <Edit className="h-5 w-5" />
                              </button>
                              
                              <button
                                onClick={() => handleResetPermissions(admin.id)}
                                className="p-3 text-orange-600 hover:bg-orange-50 rounded-xl transition-colors duration-200"
                                title="Reset to Default"
                              >
                                <RotateCcw className="h-5 w-5" />
                              </button>
                              
                              <button
                                onClick={() => handleDeleteAdmin(admin)}
                                disabled={deletingAdmin === admin.id}
                                className="p-3 text-red-600 hover:bg-red-50 rounded-xl transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Delete Admin"
                              >
                                {deletingAdmin === admin.id ? (
                                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-red-600 border-t-transparent" />
                                ) : (
                                  <Trash2 className="h-5 w-5" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  
                  {admins.length === 0 && (
                    <div className="p-12 text-center">
                      <div className="p-6 bg-gray-100 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                        <Users className="h-10 w-10 text-gray-400" />
                      </div>
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">No Admins Found</h3>
                      <p className="text-gray-600 mb-6">Create campus and course admins to manage their permissions here.</p>
                      <button
                        onClick={() => setIsCreateAdminModalOpen(true)}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                      >
                        <UserPlus className="h-5 w-5" />
                        Create First Admin
                      </button>
                    </div>
                  )}
                </motion.div>
              </div>
            )}
          </motion.div>
        </main>

      {/* Create Admin Modal */}
      <AnimatePresence>
        {isCreateAdminModalOpen && (
          <CreateAdminModal
            isOpen={isCreateAdminModalOpen}
            onClose={() => {
              setIsCreateAdminModalOpen(false);
              setAdminForm({ name: '', email: '', password: '', role: 'campus_admin' });
              setSelectedCampus('');
              setSelectedCourse('');
            }}
            adminForm={adminForm}
            setAdminForm={setAdminForm}
            selectedCampus={selectedCampus}
            setSelectedCampus={setSelectedCampus}
            selectedCourse={selectedCourse}
            setSelectedCourse={setSelectedCourse}
            campuses={campuses}
            courses={courses}
            creatingAdmin={creatingAdmin}
            onCreateAdmin={handleCreateAdmin}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isPermissionModalOpen && selectedAdmin && (
          <PermissionModal
            admin={selectedAdmin}
            availableModules={availableModules}
            onClose={() => {
              setIsPermissionModalOpen(false);
              setSelectedAdmin(null);
            }}
            onSave={async (permissions) => {
              try {
                await api.put(`/access-control/permissions/${selectedAdmin.admin_id}`, {
                  permissions
                });
                
                await Swal.fire({
                  title: 'Permissions Updated!',
                  text: 'Admin permissions have been successfully updated.',
                  icon: 'success',
                  confirmButtonColor: '#10b981',
                  confirmButtonText: 'OK',
                  customClass: {
                    popup: 'rounded-2xl',
                    title: 'text-xl font-bold text-gray-900',
                    confirmButton: 'px-6 py-3 rounded-xl font-semibold'
                  }
                });
                
                fetchAdmins();
                setIsPermissionModalOpen(false);
                setSelectedAdmin(null);
              } catch (err) {
                await Swal.fire({
                  title: 'Update Failed!',
                  text: err.response?.data?.message || 'Failed to update permissions',
                  icon: 'error',
                  confirmButtonColor: '#dc2626',
                  confirmButtonText: 'OK',
                  customClass: {
                    popup: 'rounded-2xl',
                    title: 'text-xl font-bold text-gray-900',
                    confirmButton: 'px-6 py-3 rounded-xl font-semibold'
                  }
                });
              }
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
};

// Create Admin Modal Component
const CreateAdminModal = ({ 
  isOpen, 
  onClose, 
  adminForm, 
  setAdminForm, 
  selectedCampus, 
  setSelectedCampus, 
  selectedCourse, 
  setSelectedCourse, 
  campuses, 
  courses, 
  creatingAdmin, 
  onCreateAdmin 
}) => {
  const handleInputChange = (field, value) => {
    setAdminForm(prev => ({ ...prev, [field]: value }));
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[95vh] overflow-hidden border border-gray-100 flex flex-col"
      >
        {/* Enhanced Header */}
        <div className="px-8 py-8 border-b border-gray-100 bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 rounded-2xl shadow-lg">
                <UserPlus className="h-7 w-7 text-white" />
              </div>
              <div>
                <h2 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  Create New Admin
                </h2>
                <p className="text-gray-600 mt-1">Add a new campus or course administrator to your system</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-3 hover:bg-gray-100 rounded-2xl transition-all duration-200 hover:scale-110"
            >
              <X className="h-6 w-6 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="p-8 overflow-y-auto flex-1" style={{ minHeight: '400px', maxHeight: 'calc(95vh - 300px)' }}>
          <div className="space-y-8">
            {/* Enhanced Admin Role Selection */}
            <div>
              <label className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Shield className="h-5 w-5 text-indigo-600" />
                Admin Role
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => handleInputChange('role', 'campus_admin')}
                  className={`p-6 rounded-2xl border-2 transition-all duration-300 transform hover:scale-105 ${
                    adminForm.role === 'campus_admin'
                      ? 'border-indigo-500 bg-gradient-to-br from-indigo-50 to-blue-50 text-indigo-700 shadow-lg'
                      : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`p-3 rounded-xl ${adminForm.role === 'campus_admin' ? 'bg-indigo-100' : 'bg-gray-100'}`}>
                      <Building2 className="h-6 w-6" />
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-lg">Campus Admin</div>
                      <div className="text-sm text-gray-600">Manage campus operations</div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    • Manage campus-wide operations<br/>
                    • Oversee multiple courses<br/>
                    • Access campus analytics
                  </div>
                </button>
                
                <button
                  type="button"
                  onClick={() => handleInputChange('role', 'course_admin')}
                  className={`p-6 rounded-2xl border-2 transition-all duration-300 transform hover:scale-105 ${
                    adminForm.role === 'course_admin'
                      ? 'border-green-500 bg-gradient-to-br from-green-50 to-emerald-50 text-green-700 shadow-lg'
                      : 'border-gray-200 hover:border-green-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`p-3 rounded-xl ${adminForm.role === 'course_admin' ? 'bg-green-100' : 'bg-gray-100'}`}>
                      <BookOpen className="h-6 w-6" />
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-lg">Course Admin</div>
                      <div className="text-sm text-gray-600">Manage course operations</div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    • Manage specific course<br/>
                    • Handle student progress<br/>
                    • Course-specific analytics
                  </div>
                </button>
              </div>
            </div>

            {/* Enhanced Campus/Course Selection */}
            {adminForm.role === 'campus_admin' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-2xl border border-blue-100"
              >
                <label className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-blue-600" />
                  Select Campus
                </label>
                <select
                  value={selectedCampus}
                  onChange={(e) => setSelectedCampus(e.target.value)}
                  className="w-full px-4 py-4 border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white"
                >
                  <option value="">-- Select Campus --</option>
                  {campuses.map(campus => (
                    <option key={campus.id || campus._id} value={campus.id || campus._id}>
                      {campus.name}
                    </option>
                  ))}
                </select>
              </motion.div>
            )}

            {adminForm.role === 'course_admin' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-gradient-to-r from-green-50 to-emerald-50 p-6 rounded-2xl border border-green-100"
              >
                <label className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-green-600" />
                  Select Course
                </label>
                <select
                  value={selectedCourse}
                  onChange={(e) => setSelectedCourse(e.target.value)}
                  className="w-full px-4 py-4 border border-green-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white"
                >
                  <option value="">-- Select Course --</option>
                  {courses.map(course => (
                    <option key={course.id || course._id} value={course.id || course._id}>
                      {course.name}
                    </option>
                  ))}
                </select>
              </motion.div>
            )}

            {/* Enhanced Admin Details */}
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <User className="h-5 w-5 text-purple-600" />
                Admin Details
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-700">Full Name</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={adminForm.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      className="w-full px-4 py-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 bg-white"
                      placeholder="Enter admin name"
                    />
                    <User className="h-5 w-5 text-gray-400 absolute right-4 top-1/2 transform -translate-y-1/2" />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-700">Email Address</label>
                  <div className="relative">
                    <input
                      type="email"
                      value={adminForm.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      className="w-full px-4 py-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 bg-white"
                      placeholder="Enter email address"
                    />
                    <Mail className="h-5 w-5 text-gray-400 absolute right-4 top-1/2 transform -translate-y-1/2" />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700">Password</label>
                <div className="relative">
                  <input
                    type="password"
                    value={adminForm.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    className="w-full px-4 py-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 bg-white pr-12"
                    placeholder="Enter secure password"
                  />
                  <Lock className="h-5 w-5 text-gray-400 absolute right-4 top-1/2 transform -translate-y-1/2" />
                </div>
                <p className="text-xs text-gray-500 mt-1">Password should be at least 8 characters long</p>
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Footer - Clean Version */}
        <div className="px-8 py-6 border-t border-gray-100 bg-gradient-to-r from-gray-50 to-gray-100 flex items-center justify-end gap-4">
          <button
            onClick={onClose}
            className="px-6 py-3 text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all duration-200 font-semibold hover:shadow-md"
          >
            Cancel
          </button>
          <button
            onClick={onCreateAdmin}
            disabled={creatingAdmin}
            className="px-8 py-3 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white rounded-xl hover:shadow-xl transform hover:scale-105 transition-all duration-300 font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            {creatingAdmin ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                Creating Admin...
              </>
            ) : (
              <>
                <UserPlus className="h-5 w-5" />
                Create Admin
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

const PermissionModal = ({ admin, availableModules, onClose, onSave }) => {
  const [permissions, setPermissions] = useState(admin.permissions);
  const [saving, setSaving] = useState(false);

  const handleModuleToggle = (module) => {
    const currentModules = permissions.modules || [];
    const newModules = currentModules.includes(module)
      ? currentModules.filter(m => m !== module)
      : [...currentModules, module];
    
    setPermissions(prev => ({
      ...prev,
      modules: newModules
    }));
  };

  const handleActionToggle = (action) => {
    setPermissions(prev => ({
      ...prev,
      [action]: !prev[action]
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(permissions);
    setSaving(false);
  };

  const getModuleIcon = (module) => {
    const icons = {
      dashboard: <BarChart3 className="h-4 w-4" />,
      campus_management: <Building2 className="h-4 w-4" />,
      course_management: <BookOpen className="h-4 w-4" />,
      batch_management: <GraduationCap className="h-4 w-4" />,
      student_management: <GraduationCap className="h-4 w-4" />,
      test_management: <FileText className="h-4 w-4" />,
      question_bank_upload: <FileText className="h-4 w-4" />,
      crt_upload: <FileText className="h-4 w-4" />,
      results_management: <BarChart3 className="h-4 w-4" />,
      analytics: <BarChart3 className="h-4 w-4" />,
      reports: <BarChart3 className="h-4 w-4" />
    };
    return icons[module] || <Settings className="h-4 w-4" />;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
      >
        <div className="px-8 py-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Edit Permissions</h2>
              <p className="text-gray-600">{admin.admin_name} ({admin.admin_role.replace('_', ' ')})</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="p-8 overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Module Permissions */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Module Access
              </h3>
              <div className="space-y-3">
                {Object.entries(availableModules).map(([module, name]) => (
                  <div
                    key={module}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {getModuleIcon(module)}
                      <span className="font-medium text-gray-900">{name}</span>
                    </div>
                    <button
                      onClick={() => handleModuleToggle(module)}
                      className={`p-2 rounded-lg transition-colors ${
                        permissions.modules?.includes(module)
                          ? 'bg-green-100 text-green-600'
                          : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                      }`}
                    >
                      {permissions.modules?.includes(module) ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <X className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Permissions */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Feature Permissions
              </h3>
              <div className="space-y-3">
                {[
                  { key: 'can_create_campus', label: 'Create Campus', icon: <Building2 className="h-4 w-4" /> },
                  { key: 'can_create_course', label: 'Create Course', icon: <BookOpen className="h-4 w-4" /> },
                  { key: 'can_create_batch', label: 'Create Batch', icon: <GraduationCap className="h-4 w-4" /> },
                  { key: 'can_manage_users', label: 'Manage Users', icon: <Users className="h-4 w-4" /> },
                  { key: 'can_manage_tests', label: 'Manage Tests', icon: <FileText className="h-4 w-4" /> },
                  { key: 'can_view_all_data', label: 'View All Data', icon: <Eye className="h-4 w-4" /> }
                ].map(({ key, label, icon }) => (
                  <div
                    key={key}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {icon}
                      <span className="font-medium text-gray-900">{label}</span>
                    </div>
                    <button
                      onClick={() => handleActionToggle(key)}
                      className={`p-2 rounded-lg transition-colors ${
                        permissions[key]
                          ? 'bg-green-100 text-green-600'
                          : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                      }`}
                    >
                      {permissions[key] ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <X className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="px-8 py-6 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-4">
          <button
            onClick={onClose}
            className="px-6 py-3 text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:shadow-lg transform hover:scale-105 transition-all duration-200 font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default AdminPermissions; 
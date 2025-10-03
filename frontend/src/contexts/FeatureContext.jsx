import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import api from '../services/api';

const FeatureContext = createContext();

export const useFeatures = () => {
  const context = useContext(FeatureContext);
  if (!context) {
    throw new Error('useFeatures must be used within a FeatureProvider');
  }
  return context;
};

export const FeatureProvider = ({ children }) => {
  const { user } = useAuth();
  const [userFeatures, setUserFeatures] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch user's enabled features
  const fetchUserFeatures = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const response = await api.get('/global-settings/user/features');
      
      if (response.data.success) {
        setUserFeatures(response.data.data.features || {});
      } else {
        setError(response.data.message || 'Failed to fetch user features');
      }
    } catch (err) {
      console.error('Error fetching user features:', err);
      setError(err.response?.data?.message || 'Failed to fetch user features');
      
      // Fallback to default features if API fails
      const fallbackFeatures = getDefaultFeaturesForRole(user?.role);
      setUserFeatures(fallbackFeatures);
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.role]);

  // Get default features for a role (fallback)
  const getDefaultFeaturesForRole = (role) => {
    const defaultFeatures = {
      student: {
        dashboard: { name: 'Dashboard', description: 'Main dashboard view', required: true },
        online_tests: { name: 'Online Tests', description: 'Take online exams and tests', required: false },
        practice_tests: { name: 'Practice Tests', description: 'Practice with Versant modules', required: false },
        crt_modules: { name: 'CRT Modules', description: 'Access CRT aptitude and technical modules', required: false },
        progress_tracking: { name: 'Progress Tracking', description: 'View progress analytics and statistics', required: false },
        test_history: { name: 'Test History', description: 'View past test attempts and results', required: false },
        profile: { name: 'Profile', description: 'Manage user profile and settings', required: false }
      },
      campus_admin: {
        dashboard: { name: 'Dashboard', description: 'Main dashboard view', required: true },
        student_management: { name: 'Student Management', description: 'Manage students in campus', required: false },
        test_management: { name: 'Test Management', description: 'Create and manage tests', required: false },
        batch_management: { name: 'Batch Management', description: 'Manage course batches', required: false },
        reports: { name: 'Reports', description: 'View campus reports and analytics', required: false },
        profile: { name: 'Profile', description: 'Manage admin profile and settings', required: false }
      },
      course_admin: {
        dashboard: { name: 'Dashboard', description: 'Main dashboard view', required: true },
        batch_management: { name: 'Batch Management', description: 'Manage course batches', required: false },
        student_management: { name: 'Student Management', description: 'Manage students in course', required: false },
        test_management: { name: 'Test Management', description: 'Create and manage tests', required: false },
        reports: { name: 'Reports', description: 'View course reports and analytics', required: false },
        profile: { name: 'Profile', description: 'Manage admin profile and settings', required: false }
      }
    };
    
    return defaultFeatures[role] || {};
  };

  // Check if a feature is enabled
  const isFeatureEnabled = (featureName) => {
    return userFeatures[featureName] !== undefined;
  };

  // Check if a feature is required
  const isFeatureRequired = (featureName) => {
    return userFeatures[featureName]?.required || false;
  };

  // Get feature display name
  const getFeatureName = (featureName) => {
    return userFeatures[featureName]?.name || featureName;
  };

  // Get feature description
  const getFeatureDescription = (featureName) => {
    return userFeatures[featureName]?.description || '';
  };

  // Refresh features (useful after settings changes)
  const refreshFeatures = () => {
    fetchUserFeatures();
  };

  // Generate navigation links based on user role and enabled features
  const generateNavLinks = (role) => {
    
    const allFeatures = {
      student: [
        { name: 'Dashboard', path: '/student', icon: 'Home', feature: 'dashboard', required: true },
        { name: 'Online Tests', path: '/student/exams', icon: 'Calendar', feature: 'online_tests' },
        { name: 'Practice Tests', path: '/student/practice', icon: 'Book', feature: 'practice_tests' },
        { name: 'CRT Modules', path: '/student/crt', icon: 'Book', feature: 'crt_modules' },
        { name: 'Progress', path: '/student/progress', icon: 'PieChart', feature: 'progress_tracking' },
        { name: 'Test History', path: '/student/history', icon: 'BarChart2', feature: 'test_history' },
        { name: 'Profile', path: '/student/profile', icon: 'User', feature: 'profile' }
      ],
      campus_admin: [
        { name: 'Dashboard', path: '/campus-admin/dashboard', icon: 'LayoutDashboard', feature: 'dashboard', required: true },
        { name: 'Students', path: '/campus-admin/students', icon: 'GraduationCap', feature: 'student_management' },
        { name: 'Tests', path: '/campus-admin/tests', icon: 'FilePlus', feature: 'test_management' },
        { name: 'Batches', path: '/campus-admin/batches', icon: 'GraduationCap', feature: 'batch_management' },
        { name: 'Reports', path: '/campus-admin/reports', icon: 'BarChart', feature: 'reports' },
        { name: 'Profile', path: '/campus-admin/profile', icon: 'User', feature: 'profile' }
      ],
      course_admin: [
        { name: 'Dashboard', path: '/course-admin/dashboard', icon: 'LayoutDashboard', feature: 'dashboard', required: true },
        { name: 'Batches', path: '/course-admin/batches', icon: 'GraduationCap', feature: 'batch_management' },
        { name: 'Students', path: '/course-admin/students', icon: 'GraduationCap', feature: 'student_management' },
        { name: 'Tests', path: '/course-admin/tests', icon: 'FilePlus', feature: 'test_management' },
        { name: 'Reports', path: '/course-admin/reports', icon: 'BarChart', feature: 'reports' },
        { name: 'Profile', path: '/course-admin/profile', icon: 'User', feature: 'profile' }
      ]
    };

    const roleFeatures = allFeatures[role] || [];
    
    const filteredLinks = roleFeatures.filter(link => {
      // Always show required features
      if (link.required) {
        return true;
      }
      
      // Show enabled features
      const isEnabled = isFeatureEnabled(link.feature);
      return isEnabled;
    });
    
    return filteredLinks;
  };

  // Fetch features when user changes
  useEffect(() => {
    fetchUserFeatures();
  }, [fetchUserFeatures]);

  const value = {
    userFeatures,
    loading,
    error,
    isFeatureEnabled,
    isFeatureRequired,
    getFeatureName,
    getFeatureDescription,
    refreshFeatures,
    generateNavLinks
  };

  return (
    <FeatureContext.Provider value={value}>
      {children}
    </FeatureContext.Provider>
  );
};

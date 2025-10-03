import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { FilePlus, Users, Library, BookOpen, ChevronRight, Activity, Building2 } from 'lucide-react';

const CourseAdminDashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalTests: 0,
    totalBatches: 0
  });
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      setLoading(true);
      // Use the unified superadmin dashboard endpoint
      const response = await api.get(`/superadmin/dashboard?course_id=${user?.course_id || ''}`);
      if (response.data.success) {
        const { total_students, total_tests, total_batches } = response.data.data.statistics;
        setStats({
          totalStudents: total_students || 0,
          totalTests: total_tests || 0,
          totalBatches: total_batches || 0,
        });
      }
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      toast.error('Failed to fetch dashboard statistics');
    } finally {
      setLoading(false);
    }
  };

  const dashboardCards = [
    {
      title: 'Total Students',
      value: stats.totalStudents,
      icon: Users,
      color: 'from-blue-500 to-blue-400',
      path: '/course-admin/student-upload'
    },
    {
      title: 'Total Tests',
      value: stats.totalTests,
      icon: FilePlus,
      color: 'from-green-500 to-green-400',
      path: '/course-admin/tests'
    },
    {
      title: 'Total Batches',
      value: stats.totalBatches,
      icon: Library,
      color: 'from-purple-500 to-purple-400',
      path: '/course-admin/batches'
    }
  ];

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50">
      <div className="p-6 md:p-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <h1 className="text-3xl md:text-4xl font-bold text-gray-800">
            Welcome back, {user?.name || 'Admin'}!
          </h1>
          <div className="flex items-center mt-2 text-gray-600">
            <BookOpen className="h-5 w-5 mr-2" />
            <p>Managing Course: <span className="font-semibold text-gray-700">{user?.course_name || 'Your Course'}</span></p>
          </div>
          <div className="flex items-center mt-1 text-gray-500 text-sm">
            <Building2 className="h-4 w-4 mr-2" />
            <p>Campus: <span className="font-medium text-gray-600">{user?.campus_name || 'Your Campus'}</span></p>
          </div>
        </motion.div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {dashboardCards.map((card, index) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`bg-gradient-to-br ${card.color} text-white rounded-2xl shadow-lg p-6 flex flex-col justify-between hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer`}
              onClick={() => navigate(card.path)}
            >
              <div className="flex justify-between items-start">
                <div className="flex flex-col">
                  <p className="font-medium">{card.title}</p>
                  <p className="text-4xl font-bold mt-2">{card.value}</p>
                </div>
                <div className="bg-white/20 p-3 rounded-xl">
                  <card.icon className="w-7 h-7" />
                </div>
              </div>
              <div className="flex items-center text-sm mt-4 opacity-80">
                <span>View Details</span>
                <ChevronRight className="w-4 h-4 ml-1" />
              </div>
            </motion.div>
          ))}
        </div>

        {/* Main Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="lg:col-span-1 bg-white rounded-2xl shadow-md p-6"
          >
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Quick Actions</h2>
            <div className="space-y-4">
              <ActionCard
                title="Manage Tests"
                description="View and manage tests for your course."
                icon={FilePlus}
                color="blue"
                onClick={() => navigate('/course-admin/tests')}
              />
              <ActionCard
                title="Manage Batches"
                description="View and organize student batches."
                icon={Library}
                color="purple"
                onClick={() => navigate('/course-admin/batches')}
              />
            </div>
          </motion.div>

          {/* Analytics Placeholder */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="lg:col-span-2 bg-white rounded-2xl shadow-md p-6"
          >
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Course Analytics</h2>
            <div className="flex flex-col items-center justify-center h-full text-center bg-gray-50 rounded-xl p-8 border-2 border-dashed">
              <Activity className="w-12 h-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-700">Analytics Coming Soon</h3>
              <p className="text-gray-500 mt-2 max-w-sm">
                Visual charts and data insights about student performance and test engagement will be available here.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </main>
  );
};

const ActionCard = ({ title, description, icon: Icon, color, onClick }) => {
  const colors = {
    blue: 'bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100 hover:border-blue-300',
    purple: 'bg-purple-50 border-purple-200 text-purple-600 hover:bg-purple-100 hover:border-purple-300',
  };

  return (
    <motion.button
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`flex items-center p-4 w-full rounded-xl border-2 transition-colors ${colors[color]}`}
    >
      <Icon className="w-8 h-8 mr-4" />
      <div className="text-left">
        <h3 className={`font-semibold text-${color}-800`}>{title}</h3>
        <p className={`text-sm text-${color}-700`}>{description}</p>
      </div>
      <ChevronRight className="w-5 h-5 ml-auto" />
    </motion.button>
  );
};

export default CourseAdminDashboard;
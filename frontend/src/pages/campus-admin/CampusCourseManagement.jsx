import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotification } from '../../contexts/NotificationContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import api from '../../services/api';
import { 
  BookOpen, Plus, Edit, Trash2, Users, Search, 
  Filter, MoreVertical, Eye, UserPlus
} from 'lucide-react';

const CampusCourseManagement = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [formData, setFormData] = useState({
    course_name: '',
    admin_name: '',
    admin_email: '',
    admin_password: ''
  });
  const { success, error } = useNotification();

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    try {
      setLoading(true);
      const response = await api.get('/campus-admin/courses');
      setCourses(response.data.data);
    } catch (err) {
      error('Failed to fetch courses');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCourse = async (e) => {
    e.preventDefault();
    try {
      await api.post('/campus-admin/courses', formData);
      success('Course created successfully');
      setIsCreateModalOpen(false);
      setFormData({ course_name: '', admin_name: '', admin_email: '', admin_password: '' });
      fetchCourses();
    } catch (err) {
      error('Failed to create course');
    }
  };

  const handleEditCourse = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/campus-admin/courses/${selectedCourse.id}`, formData);
      success('Course updated successfully');
      setIsEditModalOpen(false);
      setSelectedCourse(null);
      setFormData({ course_name: '', admin_name: '', admin_email: '', admin_password: '' });
      fetchCourses();
    } catch (err) {
      error('Failed to update course');
    }
  };

  const handleDeleteCourse = async (courseId) => {
    if (window.confirm('Are you sure you want to delete this course?')) {
      try {
        await api.delete(`/campus-admin/courses/${courseId}`);
        success('Course deleted successfully');
        fetchCourses();
      } catch (err) {
        error('Failed to delete course');
      }
    }
  };

  const filteredCourses = courses.filter(course =>
    course.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    course.admin?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    course.admin?.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
    <div className="flex-1 flex flex-col overflow-hidden">
      <main className="flex-1 overflow-x-hidden overflow-y-auto">
        <div className="px-6 lg:px-10 py-12 bg-background min-h-screen">
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl">
                  <BookOpen className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-4xl font-extrabold text-headline tracking-tight">Course Management</h1>
                  <p className="text-paragraph text-lg">Manage courses in your campus</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 shadow-lg hover:shadow-xl"
              >
                <Plus className="h-5 w-5" />
                Create Course
              </button>
            </div>

            {/* Search and Filter */}
            <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-200 mb-8">
              <div className="flex items-center gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                  <input
                    type="text"
                    placeholder="Search courses, admin names, or emails..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <button className="p-3 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
                  <Filter className="h-5 w-5" />
                </button>
              </div>
            </div>

            {loading ? (
              <LoadingSpinner />
            ) : (
              <div className="grid gap-6">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-white p-6 rounded-2xl shadow-lg border border-gray-200"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Total Courses</p>
                        <p className="text-3xl font-bold text-gray-900">{courses.length}</p>
                      </div>
                      <div className="p-3 bg-blue-100 rounded-xl">
                        <BookOpen className="h-8 w-8 text-blue-600" />
                      </div>
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-white p-6 rounded-2xl shadow-lg border border-gray-200"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Active Courses</p>
                        <p className="text-3xl font-bold text-gray-900">
                          {courses.filter(c => c.admin).length}
                        </p>
                      </div>
                      <div className="p-3 bg-green-100 rounded-xl">
                        <Users className="h-8 w-8 text-green-600" />
                      </div>
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-white p-6 rounded-2xl shadow-lg border border-gray-200"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Course Admins</p>
                        <p className="text-3xl font-bold text-gray-900">
                          {courses.filter(c => c.admin).length}
                        </p>
                      </div>
                      <div className="p-3 bg-purple-100 rounded-xl">
                        <UserPlus className="h-8 w-8 text-purple-600" />
                      </div>
                    </div>
                  </motion.div>
                </div>

                {/* Courses List */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden"
                >
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-900">All Courses</h2>
                    <p className="text-sm text-gray-600">Manage courses and their administrators</p>
                  </div>
                  
                  <div className="divide-y divide-gray-200">
                    {filteredCourses.map((course, index) => (
                      <motion.div
                        key={course.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 * index }}
                        className="p-6 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-100 rounded-xl">
                              <BookOpen className="h-6 w-6 text-blue-600" />
                            </div>
                            <div>
                              <h3 className="text-lg font-semibold text-gray-900">{course.name}</h3>
                              {course.admin && (
                                <div className="flex items-center gap-4 mt-1">
                                  <span className="text-sm text-gray-600">
                                    Admin: {course.admin.name}
                                  </span>
                                  <span className="text-sm text-gray-500">
                                    {course.admin.email}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => {
                                setSelectedCourse(course);
                                setFormData({
                                  course_name: course.name,
                                  admin_name: course.admin?.name || '',
                                  admin_email: course.admin?.email || '',
                                  admin_password: ''
                                });
                                setIsEditModalOpen(true);
                              }}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Edit Course"
                            >
                              <Edit className="h-5 w-5" />
                            </button>
                            
                            <button
                              onClick={() => handleDeleteCourse(course.id)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete Course"
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  
                  {filteredCourses.length === 0 && (
                    <div className="p-12 text-center">
                      <div className="p-4 bg-gray-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                        <BookOpen className="h-8 w-8 text-gray-400" />
                      </div>
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No Courses Found</h3>
                      <p className="text-gray-600">
                        {searchTerm ? 'No courses match your search criteria.' : 'Create your first course to get started.'}
                      </p>
                    </div>
                  )}
                </motion.div>
              </div>
            )}
          </motion.div>
        </div>
      </main>
    </div>

    {/* Create Course Modal */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <CourseModal
            title="Create New Course"
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleCreateCourse}
            onClose={() => {
              setIsCreateModalOpen(false);
              setFormData({ course_name: '', admin_name: '', admin_email: '', admin_password: '' });
            }}
          />
        )}
      </AnimatePresence>

      {/* Edit Course Modal */}
      <AnimatePresence>
        {isEditModalOpen && selectedCourse && (
          <CourseModal
            title="Edit Course"
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleEditCourse}
            onClose={() => {
              setIsEditModalOpen(false);
              setSelectedCourse(null);
              setFormData({ course_name: '', admin_name: '', admin_email: '', admin_password: '' });
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
};

const CourseModal = ({ title, formData, setFormData, onSubmit, onClose }) => {
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
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full"
      >
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <span className="text-2xl">&times;</span>
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Course Name
            </label>
            <input
              type="text"
              value={formData.course_name}
              onChange={(e) => setFormData({ ...formData, course_name: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Admin Name
            </label>
            <input
              type="text"
              value={formData.admin_name}
              onChange={(e) => setFormData({ ...formData, admin_name: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Admin Email
            </label>
            <input
              type="email"
              value={formData.admin_email}
              onChange={(e) => setFormData({ ...formData, admin_email: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Admin Password
            </label>
            <input
              type="password"
              value={formData.admin_password}
              onChange={(e) => setFormData({ ...formData, admin_password: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
            >
              {title.includes('Create') ? 'Create Course' : 'Update Course'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};

export default CampusCourseManagement; 
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNotification } from '../../contexts/NotificationContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import api from '../../services/api';

const CourseManagement = () => {
  const { error, success } = useNotification();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ course_name: '', admin_name: '', admin_email: '', admin_password: '' });
  const [editingCourse, setEditingCourse] = useState(null);

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    setLoading(true);
    try {
      const res = await api.get('/campus-admin/courses');
      setCourses(res.data.data || []);
    } catch (err) {
      error('Failed to fetch courses');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleCreateOrEdit = async (e) => {
    e.preventDefault();
    try {
      if (editingCourse) {
        await api.put(`/campus-admin/courses/${editingCourse.id}`, { name: form.course_name, admin_name: form.admin_name, admin_email: form.admin_email, admin_password: form.admin_password });
        success('Course updated successfully!');
      } else {
        await api.post('/campus-admin/courses', form);
        success('Course created successfully!');
      }
      setShowModal(false);
      setForm({ course_name: '', admin_name: '', admin_email: '', admin_password: '' });
      setEditingCourse(null);
      fetchCourses();
    } catch (err) {
      error(err.response?.data?.message || 'Failed to save course');
    }
  };

  const handleEdit = (course) => {
    setEditingCourse(course);
    setForm({ course_name: course.name, admin_name: course.admin?.name || '', admin_email: course.admin?.email || '', admin_password: '' });
    setShowModal(true);
  };

  const handleDelete = async (courseId) => {
    if (!window.confirm('Are you sure you want to delete this course?')) return;
    try {
      await api.delete(`/campus-admin/courses/${courseId}`);
      success('Course deleted successfully!');
      fetchCourses();
    } catch (err) {
      error('Failed to delete course');
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-x-hidden overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-text">Course Management</h1>
            <button
              className="bg-green-600 text-white px-4 py-2 rounded-lg shadow hover:bg-green-700 transition"
              onClick={() => { setShowModal(true); setEditingCourse(null); setForm({ course_name: '', admin_name: '', admin_email: '', admin_password: '' }); }}
            >
              + New Course
            </button>
          </div>
          {loading ? (
            <LoadingSpinner size="md" />
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="overflow-x-auto"
            >
              <table className="min-w-full bg-white rounded-lg shadow">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left">Course Name</th>
                    <th className="px-4 py-2 text-left">Admin</th>
                    <th className="px-4 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {courses.map(course => (
                    <tr key={course.id} className="border-b">
                      <td className="px-4 py-2">{course.name}</td>
                      <td className="px-4 py-2">{course.admin ? `${course.admin.name} (${course.admin.email})` : '-'}</td>
                      <td className="px-4 py-2 space-x-2">
                        <button
                          className="text-blue-600 hover:underline"
                          onClick={() => handleEdit(course)}
                        >Edit</button>
                        <button
                          className="text-red-600 hover:underline"
                          onClick={() => handleDelete(course.id)}
                        >Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </motion.div>
          )}
        </div>
        {/* Modal for create/edit */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
            <form
              className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md mx-auto"
              onSubmit={handleCreateOrEdit}
            >
              <h2 className="text-xl font-bold mb-4">{editingCourse ? 'Edit Course' : 'Create Course'}</h2>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Course Name</label>
                <input
                  type="text"
                  name="course_name"
                  value={form.course_name}
                  onChange={handleInputChange}
                  className="w-full border rounded px-3 py-2"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Admin Name</label>
                <input
                  type="text"
                  name="admin_name"
                  value={form.admin_name}
                  onChange={handleInputChange}
                  className="w-full border rounded px-3 py-2"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Admin Email</label>
                <input
                  type="email"
                  name="admin_email"
                  value={form.admin_email}
                  onChange={handleInputChange}
                  className="w-full border rounded px-3 py-2"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Admin Password</label>
                <input
                  type="password"
                  name="admin_password"
                  value={form.admin_password}
                  onChange={handleInputChange}
                  className="w-full border rounded px-3 py-2"
                  required={!editingCourse}
                  placeholder={editingCourse ? 'Leave blank to keep unchanged' : ''}
                />
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
                  onClick={() => setShowModal(false)}
                >Cancel</button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700"
                >{editingCourse ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        )}
      </div>
  );
};

export default CourseManagement; 
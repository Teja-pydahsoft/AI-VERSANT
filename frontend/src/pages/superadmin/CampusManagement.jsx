import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotification } from '../../contexts/NotificationContext';
import PermissionWrapper from '../../components/common/PermissionWrapper';
import { useModulePermission } from '../../hooks/useModulePermission';

import LoadingSpinner from '../../components/common/LoadingSpinner';
import api from '../../services/api';
import { Building, PlusCircle, Search, Trash2, Edit, X, User, Mail, Key, ChevronDown, ChevronUp, BookOpen, Users } from 'lucide-react';

const CampusManagement = () => {
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);
    const [campuses, setCampuses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [selectedCampus, setSelectedCampus] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
      const [formData, setFormData] = useState({
    campus_name: ''
  });
    const [expandedCampus, setExpandedCampus] = useState(null);
    const [courses, setCourses] = useState([]);
    const [loadingCourses, setLoadingCourses] = useState(false);

    const { success, error, info } = useNotification();
    const { canCreate, canEdit, canDelete, isReadOnly } = useModulePermission('campus_management');

    const fetchCampuses = async () => {
        try {
            setLoading(true);
            const res = await api.get('/campus-management/');
            setCampuses(res.data.data);
        } catch (err) {
            error('Failed to fetch campuses.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCampuses();
    }, []);

    const toggleCampusExpansion = async (campusId) => {
        if (expandedCampus === campusId) {
            setExpandedCampus(null);
            setCourses([]);
        } else {
            setExpandedCampus(campusId);
            setLoadingCourses(true);
            try {
                const res = await api.get(`/campus-management/${campusId}/courses`);
                setCourses(res.data.data);
            } catch (err) {
                error('Failed to fetch courses for this campus.');
                setCourses([]);
            } finally {
                setLoadingCourses(false);
            }
        }
    };

    const filteredCampuses = useMemo(() => {
        return campuses.filter(campus =>
            (campus.name?.toLowerCase() || '').includes(searchTerm.toLowerCase())
        );
    }, [campuses, searchTerm]);

    const handleInputChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const openModal = (campus = null) => {
        if (campus) {
            setIsEditMode(true);
            setSelectedCampus(campus);
            setFormData({
                campus_name: campus.name
            });
        } else {
            setIsEditMode(false);
            setSelectedCampus(null);
            setFormData({ campus_name: '' });
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            if (isEditMode) {
                await api.put(`/campus-management/${selectedCampus.id}`, formData);
                success('Campus updated successfully!');
            } else {
                await api.post('/campus-management/', formData);
                success('Campus created successfully!');
            }
            fetchCampuses();
            closeModal();
        } catch (err) {
            error(err.response?.data?.message || 'An error occurred.');
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDelete = async (campusId) => {
        if(window.confirm('Are you sure you want to delete this campus? This is irreversible.')) {
            try {
                await api.delete(`/campus-management/${campusId}`);
                success('Campus deleted successfully!');
                fetchCampuses();
            } catch (err) {
                error(err.response?.data?.message || 'Failed to delete campus.');
            }
        }
    };

    return (
        <PermissionWrapper module="campus_management">
        <main className="px-6 lg:px-10 py-12">
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <div className="flex justify-between items-center mb-8">
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900">Campus Management</h1>
                                <p className="mt-2 text-gray-600">Oversee all institutional campuses.</p>
                            </div>
                            <button 
                                onClick={() => openModal()} 
                                disabled={!canCreate}
                                className={`flex items-center gap-2 font-semibold px-4 py-2 rounded-lg shadow-md transition ${
                                    canCreate 
                                        ? 'bg-indigo-600 text-white hover:bg-indigo-700' 
                                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                }`}
                                title={!canCreate ? 'You do not have permission to create campuses' : 'Add Campus'}
                            >
                                <PlusCircle size={20} />
                                Add Campus
                            </button>
                        </div>

                        <div className="mt-8 bg-white rounded-2xl shadow-lg">
                             <div className="p-6 border-b border-gray-200">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Search by campus name..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                </div>
                            </div>
                            
                            <div className="overflow-x-auto">
                                {loading ? <LoadingSpinner /> : (
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Campus</th>
                                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {filteredCampuses.map(campus => (
                                                <React.Fragment key={campus.id}>
                                                    <tr className="cursor-pointer hover:bg-gray-50" onClick={() => toggleCampusExpansion(campus.id)}>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="flex items-center">
                                                                <div className="text-sm font-medium text-gray-900">{campus.name}</div>
                                                                <div className="ml-2">
                                                                    {expandedCampus === campus.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); openModal(campus); }} 
                                                                disabled={!canEdit}
                                                                className={`mr-4 ${
                                                                    canEdit 
                                                                        ? 'text-indigo-600 hover:text-indigo-900' 
                                                                        : 'text-gray-400 cursor-not-allowed'
                                                                }`}
                                                                title={!canEdit ? 'You do not have permission to edit campuses' : 'Edit Campus'}
                                                            >
                                                                <Edit size={18} />
                                                            </button>
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); handleDelete(campus.id); }} 
                                                                disabled={!canDelete}
                                                                className={canDelete 
                                                                    ? 'text-red-600 hover:text-red-900' 
                                                                    : 'text-gray-400 cursor-not-allowed'
                                                                }
                                                                title={!canDelete ? 'You do not have permission to delete campuses' : 'Delete Campus'}
                                                            >
                                                                <Trash2 size={18}/>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                    <AnimatePresence>
                                                        {expandedCampus === campus.id && (
                                                            <motion.tr
                                                                initial={{ opacity: 0, height: 0 }}
                                                                animate={{ opacity: 1, height: 'auto' }}
                                                                exit={{ opacity: 0, height: 0 }}
                                                                transition={{ duration: 0.3 }}
                                                            >
                                                                <td colSpan="3" className="p-0">
                                                                    <div className="bg-gray-100 p-4">
                                                                        {loadingCourses ? <LoadingSpinner size="sm"/> :
                                                                            courses.length > 0 ? (
                                                                                <div>
                                                                                    <h4 className="text-md font-semibold mb-2 text-gray-700">Courses</h4>
                                                                                    <ul className="space-y-2">
                                                                                        {courses.map(course => (
                                                                                            <li key={course.id} className="bg-white p-3 rounded-md shadow-sm flex justify-between items-center">
                                                                                                <div className="flex items-center">
                                                                                                    <BookOpen size={16} className="mr-2 text-blue-500"/>
                                                                                                    <span className="text-sm font-medium text-gray-800">{course.name}</span>
                                                                                                </div>
                                                                                                <div className="flex items-center text-sm text-gray-600">
                                                                                                    <Users size={14} className="mr-1 text-gray-400"/>
                                                                                                    <span>{course.student_count} Students</span>
                                                                                                </div>
                                                                                            </li>
                                                                                        ))}
                                                                                    </ul>
                                                                                </div>
                                                                            ) : (
                                                                                <div className="text-center py-4 text-gray-500">No courses found for this campus.</div>
                                                                            )
                                                                        }
                                                                    </div>
                                                                </td>
                                                            </motion.tr>
                                                        )}
                                                    </AnimatePresence>
                                                </React.Fragment>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </main>
            <AnimatePresence>
                {isModalOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -50, opacity: 0 }} className="bg-white rounded-lg shadow-xl w-full max-w-md p-8">
                           <div className="flex justify-between items-center mb-6">
                             <h2 className="text-2xl font-bold text-gray-800">{isEditMode ? 'Edit Campus' : 'Create Campus'}</h2>
                             <button onClick={closeModal}><X className="text-gray-500 hover:text-gray-800"/></button>
                           </div>
                            <form onSubmit={handleSubmit}>
                                <div className="space-y-4">
                                    <InputField label="Campus Name" name="campus_name" value={formData.campus_name} onChange={handleInputChange} icon={<Building size={18}/>} />
                                </div>
                                <div className="mt-8 flex justify-end">
                                    <button type="button" onClick={closeModal} className="mr-3 bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300">Cancel</button>
                                    <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700" disabled={isSubmitting || isReadOnly}>
                                        {isSubmitting ? 'Submitting...' : (isEditMode ? 'Update' : 'Create Campus')}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </PermissionWrapper>
    );
};

const InputField = ({ label, name, type = 'text', value, onChange, icon, placeholder, disabled=false }) => (
    <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">{icon}</span>
            <input 
                type={type} 
                name={name} 
                value={value} 
                onChange={onChange}
                placeholder={placeholder}
                disabled={disabled}
                required={!disabled && name !== 'admin_password'}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100" 
            />
        </div>
    </div>
);


export default CampusManagement; 
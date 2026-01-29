import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotification } from '../../contexts/NotificationContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import api from '../../services/api';
import { Book, PlusCircle, Search, Trash2, Edit, X, User, Mail, Key, Building, ChevronDown, ChevronUp, Briefcase, Users } from 'lucide-react';

const CourseManagement = () => {
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);
    const [courses, setCourses] = useState([]);
    const [campuses, setCampuses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [selectedCourse, setSelectedCourse] = useState(null);
      const [formData, setFormData] = useState({
    campus_id: '',
    course_name: ''
  });
    const [expandedCourse, setExpandedCourse] = useState(null);
    const [batches, setBatches] = useState([]);
    const [loadingBatches, setLoadingBatches] = useState(false);

    const { success, error } = useNotification();

    const fetchData = async () => {
        try {
            setLoading(true);
            const [coursesRes, campusesRes] = await Promise.all([
                api.get('/course-management/'),
                api.get('/campus-management/')
            ]);
            setCourses(coursesRes.data.data);
            setCampuses(campusesRes.data.data);
        } catch (err) {
            error('Failed to fetch data.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const toggleCourseExpansion = async (courseId) => {
        if (expandedCourse === courseId) {
            setExpandedCourse(null);
            setBatches([]);
        } else {
            setExpandedCourse(courseId);
            setLoadingBatches(true);
            try {
                const res = await api.get(`/course-management/${courseId}/batches`);
                setBatches(res.data.data);
            } catch (err) {
                error('Failed to fetch batches for this course.');
                setBatches([]);
            } finally {
                setLoadingBatches(false);
            }
        }
    };

    const filteredCourses = useMemo(() => {
        return courses.filter(course =>
            (course.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
            (course.campus?.name.toLowerCase() || '').includes(searchTerm.toLowerCase())
        );
    }, [courses, searchTerm]);

    const handleInputChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const openModal = (course = null) => {
        if (course) {
            setIsEditMode(true);
            setSelectedCourse(course);
            setFormData({
                course_name: course.name,
                campus_id: course.campus.id
            });
        } else {
            setIsEditMode(false);
            setSelectedCourse(null);
            setFormData({ campus_id: '', course_name: '' });
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (isEditMode) {
                await api.put(`/course-management/${selectedCourse.id}`, formData);
                success('Course updated successfully!');
            } else {
                await api.post(`/course-management/${formData.campus_id}`, formData);
                success('Course created successfully!');
            }
            fetchData();
            closeModal();
        } catch (err) {
            error(err.response?.data?.message || 'An error occurred.');
        }
    };
    
    const handleDelete = async (courseId) => {
        if(window.confirm('Are you sure you want to delete this course? This is irreversible.')) {
            try {
                await api.delete(`/course-management/${courseId}`);
                success('Course deleted successfully!');
                fetchData();
            } catch (err) {
                error(err.response?.data?.message || 'Failed to delete course.');
            }
        }
    };

    const handleDeleteBatch = async (courseId, batchId) => {
        if(window.confirm('Are you sure you want to delete this batch? This will remove all associated students and data.')) {
            try {
                await api.delete(`/course-management/${courseId}/batches/${batchId}`);
                success('Batch deleted successfully!');
                // Refresh batches for the current course
                if (expandedCourse === courseId) {
                    const res = await api.get(`/course-management/${courseId}/batches`);
                    setBatches(res.data.data);
                }
            } catch (err) {
                error(err.response?.data?.message || 'Failed to delete batch.');
            }
        }
    };

    return (
        <>
        <main className="px-6 lg:px-10 py-8 h-full overflow-y-auto">
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <div className="flex justify-between items-center mb-8">
                            <div>
                                <h1 className="text-3xl font-bold text-black">Course Management</h1>
                                <p className="mt-2 text-black">Manage all academic courses across campuses.</p>
                            </div>
                            <button onClick={() => openModal()} className="flex items-center gap-2 bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg shadow-md hover:bg-blue-700 transition">
                                <PlusCircle size={20} />
                                Add Course
                            </button>
                        </div>

                        <div className="mt-8 bg-white rounded-lg shadow-md border border-gray-200">
                             <div className="p-6 border-b border-gray-200">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Search by course or campus name..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                                    />
                                </div>
                            </div>
                            
                            <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-300px)]">
                                {loading ? <LoadingSpinner /> : (
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-white">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-black uppercase tracking-wider">Course</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-black uppercase tracking-wider">Campus</th>
                                                <th className="px-6 py-3 text-right text-xs font-medium text-black uppercase tracking-wider">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {filteredCourses.map(course => (
                                                <React.Fragment key={course.id}>
                                                    <tr className="cursor-pointer hover:bg-gray-50" onClick={() => toggleCourseExpansion(course.id)}>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="flex items-center">
                                                                <span className="text-sm font-medium text-gray-900">{course.name}</span>
                                                                <div className="ml-2">
                                                                    {expandedCourse === course.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{course.campus?.name || 'N/A'}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                            <button onClick={(e) => { e.stopPropagation(); openModal(course); }} className="text-blue-600 hover:text-blue-800 mr-4"><Edit size={18} /></button>
                                                            <button onClick={(e) => { e.stopPropagation(); handleDelete(course.id); }} className="text-red-600 hover:text-red-800"><Trash2 size={18}/></button>
                                                        </td>
                                                    </tr>
                                                    <AnimatePresence>
                                                        {expandedCourse === course.id && (
                                                            <motion.tr
                                                                initial={{ opacity: 0, height: 0 }}
                                                                animate={{ opacity: 1, height: 'auto' }}
                                                                exit={{ opacity: 0, height: 0 }}
                                                            >
                                                                <td colSpan="4" className="p-0">
                                                                    <div className="bg-gray-50 p-4">
                                                                        {loadingBatches ? <LoadingSpinner size="sm" /> :
                                                                            batches.length > 0 ? (
                                                                                <div>
                                                                                    <h4 className="text-md font-semibold mb-3 text-gray-800">Batches</h4>
                                                                                    <ul className="space-y-2">
                                                                                        {batches.map(batch => (
                                                                                            <li key={batch.id} className="bg-white p-3 rounded-md shadow-sm flex justify-between items-center border-l-4 border-blue-500">
                                                                                                <div className="flex items-center">
                                                                                                    <Briefcase size={16} className="mr-2 text-blue-500"/>
                                                                                                    <span className="text-sm font-medium text-gray-800">{batch.name}</span>
                                                                                                </div>
                                                                                                <div className="flex items-center space-x-4">
                                                                                                    <div className="flex items-center text-sm text-gray-600">
                                                                                                        <Users size={14} className="mr-1 text-gray-400"/>
                                                                                                        <span>{batch.student_count} Students</span>
                                                                                                    </div>
                                                                                                    <button 
                                                                                                        onClick={(e) => { 
                                                                                                            e.stopPropagation(); 
                                                                                                            handleDeleteBatch(course.id, batch.id); 
                                                                                                        }} 
                                                                                                        className="text-red-500 hover:text-red-700 transition-colors"
                                                                                                        title="Delete Batch"
                                                                                                    >
                                                                                                        <Trash2 size={16}/>
                                                                                                    </button>
                                                                                                </div>
                                                                                            </li>
                                                                                        ))}
                                                                                    </ul>
                                                                                </div>
                                                                            ) : (
                                                                                <div className="text-center py-4 text-gray-500">No batches found for this course.</div>
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
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -50, opacity: 0 }} className="bg-white rounded-lg shadow-xl w-full max-w-md p-8">
                           <div className="flex justify-between items-center mb-6">
                             <h2 className="text-2xl font-bold text-black">{isEditMode ? 'Edit Course' : 'Create Course'}</h2>
                             <button onClick={closeModal}><X className="text-tertiary hover:text-paragraph"/></button>
                           </div>
                            <form onSubmit={handleSubmit}>
                                <div className="space-y-4">
                                    {!isEditMode && (
                                        <SelectField label="Campus" name="campus_id" value={formData.campus_id} onChange={handleInputChange} options={campuses} icon={<Building size={18} />} textClass="text-black" />
                                    )}
                                    <InputField label="Course Name" name="course_name" value={formData.course_name} onChange={handleInputChange} icon={<Book size={18}/>} textClass="text-black" />
                                </div>
                                <div className="mt-8 flex justify-end">
                                    <button type="button" onClick={closeModal} className="mr-3 bg-tertiary text-black px-4 py-2 rounded-lg hover:bg-highlight">Cancel</button>
                                    <button type="submit" className="bg-highlight text-black px-4 py-2 rounded-lg hover:bg-highlight-hover" disabled={!isEditMode && !formData.campus_id}>{isEditMode ? 'Update' : 'Create Course'}</button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

const InputField = ({ label, name, type = 'text', value, onChange, icon, placeholder, disabled=false, textClass = '' }) => (
    <div>
        <label className={`block text-sm font-medium mb-1 ${textClass}`}>{label}</label>
        <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-black">{icon}</span>
            <input 
                type={type} 
                name={name} 
                value={value} 
                onChange={onChange}
                placeholder={placeholder}
                disabled={disabled}
                required={!disabled && name !== 'admin_password'}
                className={`w-full pl-10 pr-4 py-2 border border-stroke rounded-md shadow-sm focus:ring-highlight focus:border-highlight disabled:bg-background ${textClass}`} 
            />
        </div>
    </div>
);

const SelectField = ({ label, name, value, onChange, options, icon, textClass = '' }) => (
    <div>
        <label className={`block text-sm font-medium mb-1 ${textClass}`}>{label}</label>
        <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-black">{icon}</span>
            <select 
                name={name} 
                value={value} 
                onChange={onChange}
                required
                className={`w-full pl-10 pr-4 py-2 border border-stroke rounded-md shadow-sm focus:ring-highlight focus:border-highlight appearance-none ${textClass}`}
            >
                <option value="">Select a {label}</option>
                {options.map(option => (
                    <option key={option.id} value={option.id}>{option.name}</option>
                ))}
            </select>
        </div>
    </div>
);


export default CourseManagement;

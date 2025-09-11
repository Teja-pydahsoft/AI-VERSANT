import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNotification } from '../../contexts/NotificationContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import api from '../../services/api';
import { Users, Filter, Search, Trash2, ListChecks, CheckCircle, BookOpen, Lock, Unlock, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, User } from 'lucide-react';
import Modal from '../../components/common/Modal';
import { getStudentAccessStatus, authorizeStudentModule, lockStudentModule, authorizeStudentLevel } from '../../services/api';

const StudentManagement = () => {
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const { success, error } = useNotification();
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
    const [progressLoading, setProgressLoading] = useState(false);
    const [progressError, setProgressError] = useState(null);
    const [moduleProgress, setModuleProgress] = useState([]);
    const [authorizing, setAuthorizing] = useState(false);
    const [authorizeMsg, setAuthorizeMsg] = useState('');
    const [availableModules, setAvailableModules] = useState([]);
    const [selectedModule, setSelectedModule] = useState(null);
    const [levelProgress, setLevelProgress] = useState([]);
    const [isLevelModalOpen, setIsLevelModalOpen] = useState(false);
    const [modalSelectedModule, setModalSelectedModule] = useState(null);
    const [levelTestModal, setLevelTestModal] = useState({ open: false, module: null, level: null });
    const [levelTests, setLevelTests] = useState({ loading: false, practice: [], online: [] });
    const [unlockMsg, setUnlockMsg] = useState('');
    const [onlineExamResults, setOnlineExamResults] = useState([]);
    const [practiceResults, setPracticeResults] = useState([]);
    const [selectedLevel, setSelectedLevel] = useState(null);
    const [selectedLevelResults, setSelectedLevelResults] = useState([]);
    const [levelResultsLoading, setLevelResultsLoading] = useState(false);
    const [showLevelResultsPanel, setShowLevelResultsPanel] = useState(false);
    const [selectedLevelPracticeResults, setSelectedLevelPracticeResults] = useState([]);
    const [batches, setBatches] = useState([]);
    const [courses, setCourses] = useState([]);
    const [selectedBatch, setSelectedBatch] = useState(null);
    const [selectedCourse, setSelectedCourse] = useState(null);
    const [accessStatus, setAccessStatus] = useState([]);
    const [showLevelsModal, setShowLevelsModal] = useState(false);
    const [levelsModalData, setLevelsModalData] = useState({ module: null, levels: [] });
    const [levelPercentages, setLevelPercentages] = useState({}); // { levelId: { practice: %, online: % } }
    const [moduleActionLoading, setModuleActionLoading] = useState({});
    const [levelActionLoading, setLevelActionLoading] = useState({});
    
    // Filter and lazy loading state
    const [currentPage, setCurrentPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [totalStudents, setTotalStudents] = useState(0);
    const [campuses, setCampuses] = useState([]);
    const [selectedCampus, setSelectedCampus] = useState('');
    const [loadingFilters, setLoadingFilters] = useState(false);
    const [searchInput, setSearchInput] = useState('');
    const [downloadingAll, setDownloadingAll] = useState(false);
    
    // Bulk selection state
    const [selectedStudents, setSelectedStudents] = useState(new Set());
    const [isAllSelected, setIsAllSelected] = useState(false);
    const [showBulkActions, setShowBulkActions] = useState(false);
    const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
    const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);

    // Fetch campuses on mount
    useEffect(() => {
        const fetchCampuses = async () => {
            try {
                const res = await api.get('/campus-management/');
                setCampuses(res.data.data || []);
            } catch (err) {
                error('Failed to fetch campuses.');
            }
        };
        fetchCampuses();
    }, [error]);

    // Fetch courses when campus changes
    useEffect(() => {
        const fetchCourses = async () => {
            if (!selectedCampus) {
                setCourses([]);
                setSelectedCourse(null);
                return;
            }
            try {
                setLoadingFilters(true);
                const res = await api.get(`/course-management/courses?campus_id=${selectedCampus}`);
                setCourses(res.data.data || []);
                setSelectedCourse(null); // Reset course selection
            } catch (err) {
                error('Failed to fetch courses.');
                setCourses([]);
            } finally {
                setLoadingFilters(false);
            }
        };
        fetchCourses();
    }, [selectedCampus, error]);

    // Fetch batches when course changes
    useEffect(() => {
        const fetchBatches = async () => {
            if (!selectedCourse) {
                setBatches([]);
                setSelectedBatch(null);
                return;
            }
            try {
                setLoadingFilters(true);
                const res = await api.get(`/batch-management/course/${selectedCourse}/batches`);
                setBatches(res.data.data || []);
                setSelectedBatch(null); // Reset batch selection
            } catch (err) {
                error('Failed to fetch batches.');
                setBatches([]);
            } finally {
                setLoadingFilters(false);
            }
        };
        fetchBatches();
    }, [selectedCourse, error]);

    const fetchStudents = useCallback(async (page = 1, search = '') => {
        try {
            if (page === 1) {
                setLoading(true);
            } else {
                setLoadingMore(true);
            }
            
            const params = new URLSearchParams({
                page: page.toString(),
                limit: '20',
                ...(search && { search }),
                ...(selectedCampus && { campus_id: selectedCampus }),
                ...(selectedCourse && { course_id: selectedCourse }),
                ...(selectedBatch && { batch_id: selectedBatch })
            });
            
            console.log('Fetching students with params:', params.toString());
            const res = await api.get(`/batch-management/students/filtered?${params}`);
            
            if (page === 1) {
                setStudents(res.data.data);
                // If a student is selected and they're not in the new results, keep the modal open
                // but update the selected student data if they are in the results
                if (selectedStudent) {
                    const updatedStudent = res.data.data.find(s => s._id === selectedStudent._id);
                    if (updatedStudent) {
                        setSelectedStudent(updatedStudent);
                    }
                }
            } else {
                setStudents(prev => [...prev, ...res.data.data]);
            }
            
            setHasMore(res.data.pagination.has_more);
            setTotalStudents(res.data.pagination.total);
            setCurrentPage(page);
        } catch (err) {
            error('Failed to fetch students.');
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [error, selectedCampus, selectedCourse, selectedBatch]);

    useEffect(() => {
        fetchStudents(1, searchTerm);
        // Clear selection when filters change
        clearSelection();
    }, [fetchStudents, searchTerm, selectedCampus, selectedCourse, selectedBatch]);
    
    const handleDeleteStudent = async (studentId) => {
        if (window.confirm('Are you sure you want to delete this student? This action is permanent.')) {
            try {
                await api.delete(`/batch-management/students/${studentId}`);
                success('Student deleted successfully.');
                fetchStudents(); // Refresh the list
            } catch (err) {
                error(err.response?.data?.message || 'Failed to delete student.');
            }
        }
    };

    // Bulk selection functions
    const handleSelectStudent = (studentId) => {
        const newSelected = new Set(selectedStudents);
        if (newSelected.has(studentId)) {
            newSelected.delete(studentId);
        } else {
            newSelected.add(studentId);
        }
        setSelectedStudents(newSelected);
        setShowBulkActions(newSelected.size > 0);
        setIsAllSelected(newSelected.size === students.length && students.length > 0);
    };

    const handleSelectAll = () => {
        if (isAllSelected) {
            setSelectedStudents(new Set());
            setShowBulkActions(false);
        } else {
            const allIds = new Set(students.map(student => student._id));
            setSelectedStudents(allIds);
            setShowBulkActions(true);
        }
        setIsAllSelected(!isAllSelected);
    };

    const handleBulkDelete = async () => {
        if (selectedStudents.size === 0) {
            error('No students selected for deletion.');
            return;
        }

        setBulkDeleteLoading(true);
        try {
            const response = await api.post('/batch-management/students/bulk-delete', {
                student_ids: Array.from(selectedStudents)
            });

            if (response.data.success) {
                success(response.data.message);
                setSelectedStudents(new Set());
                setShowBulkActions(false);
                setIsAllSelected(false);
                setShowBulkDeleteModal(false);
                fetchStudents(); // Refresh the list
            } else {
                error(response.data.message || 'Failed to delete students.');
            }
        } catch (err) {
            error(err.response?.data?.message || 'Failed to delete students.');
        } finally {
            setBulkDeleteLoading(false);
        }
    };

    const clearSelection = () => {
        setSelectedStudents(new Set());
        setShowBulkActions(false);
        setIsAllSelected(false);
    };

    const handleSendCredentialsAgain = async (student) => {
        try {
            const response = await api.post(`/batch-management/students/${student._id}/send-credentials`);
            if (response.data.success) {
                success('Credentials sent successfully to ' + student.email);
            } else {
                error(response.data.message || 'Failed to send credentials');
            }
        } catch (err) {
            error(err.response?.data?.message || 'Failed to send credentials');
        }
    };

    const handleDownloadCredentials = async (student) => {
        try {
            const response = await api.get(`/batch-management/students/${student._id}/credentials`, {
                responseType: 'blob'
            });
            
            // Create a blob URL and download the file
            const blob = new Blob([response.data], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${student.name}_credentials.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            
            success('Credentials downloaded successfully');
        } catch (err) {
            error(err.response?.data?.message || 'Failed to download credentials');
        }
    };

    const handleDownloadAllCredentials = async () => {
        try {
            setDownloadingAll(true);
            const params = new URLSearchParams({
                ...(searchTerm && { search: searchTerm }),
                ...(selectedCampus && { campus_id: selectedCampus }),
                ...(selectedCourse && { course_id: selectedCourse }),
                ...(selectedBatch && { batch_id: selectedBatch })
            });
            
            const response = await api.get(`/batch-management/students/filtered/credentials?${params}`, {
                responseType: 'blob'
            });
            
            // Create a blob URL and download the file
            const blob = new Blob([response.data], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            
            // Generate filename based on filters
            let filename = 'students_credentials';
            if (selectedCampus) {
                const campus = campuses.find(c => c.id === selectedCampus);
                if (campus) filename += `_${campus.name.replace(/\s+/g, '_')}`;
            }
            if (selectedCourse) {
                const course = courses.find(c => c.id === selectedCourse);
                if (course) filename += `_${course.name.replace(/\s+/g, '_')}`;
            }
            if (selectedBatch) {
                const batch = batches.find(b => b.id === selectedBatch);
                if (batch) filename += `_${batch.name.replace(/\s+/g, '_')}`;
            }
            if (searchTerm) filename += '_search';
            filename += '.csv';
            
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            
            success('All credentials downloaded successfully');
        } catch (err) {
            error(err.response?.data?.message || 'Failed to download all credentials');
        } finally {
            setDownloadingAll(false);
        }
    };

    const handleSearch = () => {
        console.log('Searching for:', searchInput);
        setSearchTerm(searchInput);
        // Reset to first page when searching
        setCurrentPage(1);
        // Keep the modal open if a student is selected and the search matches them
        if (selectedStudent) {
            const studentMatches = selectedStudent.name?.toLowerCase().includes(searchInput.toLowerCase()) ||
                                 selectedStudent.email?.toLowerCase().includes(searchInput.toLowerCase()) ||
                                 selectedStudent.roll_number?.toLowerCase().includes(searchInput.toLowerCase());
            
            if (!studentMatches) {
                // If the selected student doesn't match the search, close the modal
                setIsProgressModalOpen(false);
                setSelectedStudent(null);
            }
        }
    };

    const handleClearSearch = () => {
        setSearchInput('');
        setSearchTerm('');
        setCurrentPage(1);
        // Keep the modal open when clearing search
    };


    // Load more function
    const loadMore = () => {
        if (hasMore && !loadingMore) {
            fetchStudents(currentPage + 1, searchTerm);
        }
    };

    const handleStudentClick = async (student) => {
        setSelectedStudent(student);
        setIsProgressModalOpen(true);
        setProgressLoading(true);
        setProgressError(null);
        setAccessStatus([]);
        try {
            // Fetch access status for modules and levels
            const res = await getStudentAccessStatus(student._id);
            setAccessStatus(res.data.data || []);
        } catch (e) {
            setProgressError('Failed to load access status.');
        } finally {
            setProgressLoading(false);
        }
    };

    const handleAuthorizeNext = async (moduleId, nextLevel) => {
        if (!selectedStudent) return;
        setAuthorizing(true);
        setAuthorizeMsg('');
        try {
            const res = await api.post(`/batch-management/student/${selectedStudent._id}/authorize-level`, { level: nextLevel });
            setAuthorizeMsg(res.data.message || 'Authorized!');
        } catch (e) {
            setAuthorizeMsg('Failed to authorize next level.');
        } finally {
            setAuthorizing(false);
        }
    };

    const handleModuleCardClick = async (student, module) => {
        setSelectedStudent(student);
        setSelectedModule(module);
        setIsLevelModalOpen(true);
        setLevelProgress([]);
        try {
            // Fetch level progress for this student/module
            const res = await api.get(`/superadmin/student-practice-results?student=${encodeURIComponent(student.email)}&module=${module.id}`);
            setLevelProgress(res.data.data || []);
        } catch (e) {
            setLevelProgress([]);
        }
    };

    const handleLevelClick = async (mod, lvl) => {
        setLevelTestModal({ open: true, module: mod, level: lvl });
        setLevelTests({ loading: true, practice: [], online: [] });
        try {
            const res = await api.get('/test-management/tests');
            const allTests = res.data.data || [];
            // Filter by module and level
            const practice = allTests.filter(t => t.module_name === mod.module_name && t.level_name === lvl.level_name && t.test_type === 'practice');
            const online = allTests.filter(t => t.module_name === mod.module_name && t.level_name === lvl.level_name && t.test_type === 'online_exam');
            setLevelTests({ loading: false, practice, online });
        } catch (e) {
            setLevelTests({ loading: false, practice: [], online: [] });
        }
    };

    const handleModuleLockToggle = async (studentId, moduleId, unlocked) => {
        setModuleActionLoading(prev => ({ ...prev, [moduleId]: true }));
        try {
            if (unlocked) {
                await lockStudentModule(studentId, moduleId);
                setUnlockMsg('Module locked!');
            } else {
                await authorizeStudentModule(studentId, moduleId);
                setUnlockMsg('Module unlocked!');
            }
            // Refresh access status for the modal UI and force re-render
            const res = await getStudentAccessStatus(studentId);
            setAccessStatus([...res.data.data]); // new array reference
        } catch (e) {
            setUnlockMsg('Failed to update module access.');
        } finally {
            setModuleActionLoading(prev => ({ ...prev, [moduleId]: false }));
            setTimeout(() => setUnlockMsg(''), 2000);
        }
    };

    const handleLevelLockToggle = async (studentId, levelId, unlocked) => {
        try {
            if (unlocked) {
                // Lock: remove from authorized_levels (not implemented, but could be added)
                setUnlockMsg('Level lock not implemented!');
            } else {
                await authorizeStudentLevel(studentId, levelId);
                setUnlockMsg('Level unlocked!');
            }
            // Refresh access status
            const res = await getStudentAccessStatus(studentId);
            setAccessStatus(res.data.data || []);
        } catch (e) {
            setUnlockMsg('Failed to update level access.');
        } finally {
        setTimeout(() => setUnlockMsg(''), 2000);
        }
    };

    // Helper to fetch percentages for all levels in a module
    const fetchLevelPercentages = async (student, module) => {
        const percentages = {};
        for (const lvl of module.levels) {
            let practice = 0;
            let online = 0;
            try {
                // Fetch practice results
                const practiceRes = await api.get(`/superadmin/student-practice-results?student=${encodeURIComponent(student.email)}&module=${module.module_id}&level=${lvl.level_id}`);
                if (practiceRes.data.data && practiceRes.data.data.length > 0) {
                    const scores = practiceRes.data.data.map(r => r.average_score || 0);
                    practice = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
                }
                // Fetch online results
                const onlineRes = await api.get(`/superadmin/student-online-results?student=${encodeURIComponent(student.email)}&module=${module.module_id}&level=${lvl.level_id}`);
                if (onlineRes.data.data && onlineRes.data.data.length > 0) {
                    const scores = onlineRes.data.data.map(r => r.average_score || 0);
                    online = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
                }
            } catch {}
            percentages[lvl.level_id] = { practice, online };
        }
        setLevelPercentages(percentages);
    };

    useEffect(() => {
        // Fetch batches and courses for selection
        const fetchBatchCourse = async () => {
            try {
                const batchRes = await api.get('/batch-management/');
                setBatches(batchRes.data.data || []);
                const courseRes = await api.get('/course-management/courses');
                setCourses(courseRes.data.data || []);
            } catch (err) {
                // handle error
            }
        };
        fetchBatchCourse();
    }, []);

    // Filter courses for selected batch if needed
    const filteredCourses = selectedBatch ? courses.filter(c => c.batch_ids?.includes(selectedBatch.id)) : courses;

    // In student assignment logic (e.g. handleAssignStudent or handleCreateStudent):
    const handleAssignStudent = async (studentId) => {
        if (!selectedBatch || !selectedCourse) {
            // show error
            return;
        }
        // Get or create batch_course_instance_id from backend
        const res = await api.post('/superadmin/batch-course-instance', {
            batch_id: selectedBatch.id,
            course_id: selectedCourse.id
        });
        const batchCourseInstanceId = res.data.instance_id;
        // Assign student to this instance
        await api.post('/students/assign', {
            student_id: studentId,
            batch_course_instance_id: batchCourseInstanceId
        });
        // refresh students or show success
    };

    // Sort modules: Grammar, Vocabulary first, then others
    const sortedAccessStatus = useMemo(() => {
        if (!accessStatus) return [];
        const priority = ['GRAMMAR', 'VOCABULARY'];
        const priorityModules = accessStatus.filter(m => priority.includes(m.module_id));
        const otherModules = accessStatus.filter(m => !priority.includes(m.module_id));
        return [...priorityModules, ...otherModules];
    }, [accessStatus]);

    return (
        <>
        <main className="px-4 mt-6">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                        <div className="flex justify-between items-center mb-8">
                            <div>
                                <h1 className="text-2xl font-semibold text-gray-800 mb-2">Student Management</h1>
                                <p className="text-gray-600">
                                    View and manage student information across the system.
                                    {!loading && (
                                        <span className="ml-2 text-blue-600 font-medium">
                                            ({totalStudents} students)
                                            {(selectedCampus || selectedCourse || selectedBatch) && (
                                                <span className="text-sm text-gray-500">
                                                    {' '}(filtered)
                                                </span>
                                            )}
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>

                        {/* Filter Section */}
                        <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                                <Filter className="mr-2 h-5 w-5 text-gray-500" />
                                Filter Students
                            </h3>
                            
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                                {/* Campus Filter */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Campus</label>
                                    <select
                                        value={selectedCampus}
                                        onChange={(e) => setSelectedCampus(e.target.value)}
                                        className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                                    >
                                        <option value="">All Campuses</option>
                                        {campuses.map(campus => (
                                            <option key={campus.id} value={campus.id}>
                                                {campus.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Course Filter */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Course</label>
                                    <select
                                        value={selectedCourse || ''}
                                        onChange={(e) => setSelectedCourse(e.target.value || null)}
                                        disabled={!selectedCampus || loadingFilters}
                                        className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                    >
                                        <option value="">
                                            {loadingFilters && selectedCampus ? 'Loading...' : 'All Courses'}
                                        </option>
                                        {courses.map(course => (
                                            <option key={course.id} value={course.id}>
                                                {course.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Batch Filter */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Batch</label>
                                    <select
                                        value={selectedBatch || ''}
                                        onChange={(e) => setSelectedBatch(e.target.value || null)}
                                        disabled={!selectedCourse || loadingFilters}
                                        className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                    >
                                        <option value="">
                                            {loadingFilters && selectedCourse ? 'Loading...' : 'All Batches'}
                                        </option>
                                        {batches.map(batch => (
                                            <option key={batch.id} value={batch.id}>
                                                {batch.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Download All Credentials Button */}
                                <div className="flex items-end">
                                    {students.length > 0 && (
                                        <button
                                            onClick={handleDownloadAllCredentials}
                                            disabled={downloadingAll}
                                            className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                                        >
                                            {downloadingAll ? (
                                                <>
                                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                                    Downloading...
                                                </>
                                            ) : (
                                                <>
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                    </svg>
                                                    Download All
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Clear Filters Button and Download info */}
                            <div className="flex items-center justify-between">
                                {(selectedCampus || selectedCourse || selectedBatch) && (
                                    <button
                                        onClick={() => {
                                            setSelectedCampus('');
                                            setSelectedCourse(null);
                                            setSelectedBatch(null);
                                        }}
                                        className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                                    >
                                        Clear Filters
                                    </button>
                                )}
                                
                                {/* Download info text */}
                                {students.length > 0 && (
                                    <p className="text-sm text-gray-500">
                                        Downloads credentials for all {totalStudents} filtered students
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Search Section */}
                        <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                            <div className="flex flex-col md:flex-row gap-4">
                                <div className="flex-1 relative">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Search by name, email, or roll number..."
                                        value={searchInput}
                                        onChange={(e) => setSearchInput(e.target.value)}
                                        onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                                        className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleSearch}
                                        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                                    >
                                        <Search className="w-4 h-4" />
                                        Search
                                    </button>
                                    {searchTerm && (
                                        <button
                                            onClick={handleClearSearch}
                                            className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors flex items-center gap-2"
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>
                            </div>
                            
                            {/* Search Status */}
                            {searchTerm && (
                                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                                            <span className="text-sm font-medium text-yellow-800">
                                                Searching for: "{searchTerm}"
                                            </span>
                                        </div>
                                        <button
                                            onClick={handleClearSearch}
                                            className="text-yellow-600 hover:text-yellow-800 text-sm font-medium"
                                        >
                                            Clear Search
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Student Modal Status */}
                            {selectedStudent && isProgressModalOpen && (
                                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                                            <span className="text-sm font-medium text-blue-800">
                                                Viewing: {selectedStudent.name}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setIsProgressModalOpen(false);
                                                setSelectedStudent(null);
                                            }}
                                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                                        >
                                            Close Details
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Enhanced Student Display Table */}
                        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100">
                            <div className="overflow-x-auto">
                                {loading ? (
                                    <div className="flex items-center justify-center py-16">
                                        <LoadingSpinner />
                                    </div>
                                ) : students.length === 0 ? (
                                    <motion.div 
                                        initial={{ opacity: 0, y: 20 }} 
                                        animate={{ opacity: 1, y: 0 }}
                                        className="flex flex-col items-center justify-center py-16"
                                    >
                                        <div className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-full mb-6">
                                            <Users className="w-12 h-12 text-blue-500" />
                                        </div>
                                        <h3 className="text-xl font-semibold text-gray-900 mb-3">No students found</h3>
                                        <p className="text-gray-600 text-center max-w-md">
                                            {searchTerm ? `No students match your search for "${searchTerm}"` : 'No students have been added to the system yet.'}
                                        </p>
                                    </motion.div>
                                ) : (
                                    <div className="relative">
                                        {/* Enhanced Table Header */}
                                        <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border-b border-gray-200">
                                            <div className="px-8 py-6">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Bulk Actions Bar */}
                                        {showBulkActions && (
                                            <motion.div 
                                                initial={{ opacity: 0, y: -20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2 bg-red-100 rounded-lg">
                                                            <Trash2 className="w-5 h-5 text-red-600" />
                                                        </div>
                                                        <div>
                                                            <h3 className="text-lg font-semibold text-red-900">
                                                                {selectedStudents.size} Student{selectedStudents.size !== 1 ? 's' : ''} Selected
                                                            </h3>
                                                            <p className="text-sm text-red-700">
                                                                Choose an action to perform on selected students
                                                            </p>
                                                            {selectedStudents.size > 0 && (
                                                                <div className="mt-2 text-xs text-red-600">
                                                                    Selected: {Array.from(selectedStudents).slice(0, 3).map(id => {
                                                                        const student = students.find(s => s._id === id);
                                                                        return student?.name || 'Unknown';
                                                                    }).join(', ')}
                                                                    {selectedStudents.size > 3 && ` and ${selectedStudents.size - 3} more...`}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <button
                                                            onClick={clearSelection}
                                                            className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                                                        >
                                                            Clear Selection
                                                        </button>
                                                        <button
                                                            onClick={() => setShowBulkDeleteModal(true)}
                                                            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                            Delete Selected
                                                        </button>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}

                                        {/* Enhanced Table */}
                                        <table className="min-w-full">
                                            <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                                                <tr>
                                                    <th className="px-6 py-5 text-left border-b border-gray-200 w-12">
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="checkbox"
                                                                checked={isAllSelected}
                                                                onChange={handleSelectAll}
                                                                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                                                            />
                                                        </div>
                                                    </th>
                                                    <th className="px-8 py-5 text-left border-b border-gray-200">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Student</span>
                                                        </div>
                                                    </th>
                                                    <th className="px-8 py-5 text-left border-b border-gray-200">
                                                        <div className="flex items-center gap-2">
                                                            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                                            </svg>
                                                            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Campus</span>
                                                        </div>
                                                    </th>
                                                    <th className="px-8 py-5 text-left border-b border-gray-200">
                                                        <div className="flex items-center gap-2">
                                                            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                                            </svg>
                                                            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Course & Batch</span>
                                                        </div>
                                                    </th>
                                                    <th className="px-8 py-5 text-left border-b border-gray-200">
                                                        <div className="flex items-center gap-2">
                                                            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                            </svg>
                                                            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Username</span>
                                                        </div>
                                                    </th>
                                                    <th className="px-8 py-5 text-right border-b border-gray-200">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                                                            </svg>
                                                            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Actions</span>
                                                        </div>
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-100">
                                                {students.map((student, index) => (
                                                    <motion.tr 
                                                        key={student._id} 
                                                        initial={{ opacity: 0, y: 20 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{ delay: index * 0.05 }}
                                                        className={`group hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 cursor-pointer transition-all duration-300 transform hover:scale-[1.01] ${
                                                            selectedStudents.has(student._id) 
                                                                ? 'bg-blue-50 border-l-4 border-blue-500' 
                                                                : ''
                                                        }`}
                                                        onClick={() => handleStudentClick(student)}
                                                    >
                                                        <td className="px-6 py-6 whitespace-nowrap w-12">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedStudents.has(student._id)}
                                                                onChange={(e) => {
                                                                    e.stopPropagation();
                                                                    handleSelectStudent(student._id);
                                                                }}
                                                                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                                                            />
                                                        </td>
                                                        <td className="px-8 py-6 whitespace-nowrap">
                                                            <div className="flex items-center gap-4">
                                                                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                                                                    {student.name?.charAt(0)?.toUpperCase() || 'S'}
                                                                </div>
                                                                <div>
                                                                    <div className="text-sm font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">
                                                                        {student.name}
                                                                    </div>
                                                                    <div className="text-sm text-gray-500 group-hover:text-gray-600 transition-colors">
                                                                        {student.email}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-8 py-6 whitespace-nowrap">
                                                            <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                                {student.campus_name || 'N/A'}
                                                            </div>
                                                        </td>
                                                        <td className="px-8 py-6 whitespace-nowrap">
                                                            <div className="space-y-1">
                                                                <div className="text-sm font-medium text-gray-900">
                                                                    {student.course_name || 'N/A'}
                                                                </div>
                                                                <div className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded">
                                                                    {student.batch_name || 'N/A'}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-8 py-6 whitespace-nowrap">
                                                            <div className="text-sm text-gray-600 font-mono bg-gray-50 px-3 py-1 rounded">
                                                                {student.username || student.roll_number || 'N/A'}
                                                            </div>
                                                        </td>
                                                        <td className="px-8 py-6 whitespace-nowrap text-right">
                                                            <div className="flex items-center justify-end gap-3">
                                                                <button 
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleSendCredentialsAgain(student);
                                                                    }} 
                                                                    className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-all duration-200 hover:shadow-md group/btn"
                                                                    title="Send Credentials Again"
                                                                >
                                                                    <svg className="w-5 h-5 group-hover/btn:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                                                    </svg>
                                                                </button>
                                                                <button 
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDownloadCredentials(student);
                                                                    }} 
                                                                    className="p-2 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-xl transition-all duration-200 hover:shadow-md group/btn"
                                                                    title="Download Credentials"
                                                                >
                                                                    <svg className="w-5 h-5 group-hover/btn:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                                    </svg>
                                                                </button>
                                                                <button 
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDeleteStudent(student._id);
                                                                    }} 
                                                                    className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all duration-200 hover:shadow-md group/btn"
                                                                    title="Delete Student"
                                                                >
                                                                    <Trash2 className="w-5 h-5 group-hover/btn:scale-110 transition-transform" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </motion.tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                            
                            {/* Load More Section */}
                            {students.length > 0 && (
                                <div className="bg-white px-6 py-4 border-t border-gray-200">
                                    <div className="flex items-center justify-between">
                                        <div className="text-sm text-gray-700">
                                            Showing {students.length} of {totalStudents} students
                                        </div>
                                        
                                        {hasMore && (
                                            <button
                                                onClick={loadMore}
                                                disabled={loadingMore}
                                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                                            >
                                                {loadingMore ? (
                                                    <>
                                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                                        Loading...
                                                    </>
                                                ) : (
                                                    <>
                                                        Load More Students
                                                        <ChevronRight size={16} />
                                                    </>
                                                )}
                                            </button>
                                        )}
                                        
                                        {!hasMore && students.length > 0 && (
                                            <div className="text-sm text-gray-500">
                                                All students loaded
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </main>
            {/* Student Info & Access Control Modal */}
            {selectedStudent && (
                <Modal isOpen={isProgressModalOpen} onClose={() => { setIsProgressModalOpen(false); setSelectedStudent(null); setSelectedModule(null); setShowLevelsModal(false); setLevelsModalData({ module: null, levels: [] }); }} title={`Student Details: ${selectedStudent.name}`}>
                    <div className="p-6">
                        <h3 className="text-lg font-semibold mb-2">Module Access Control</h3>
                        {progressLoading ? (
                            <LoadingSpinner />
                        ) : progressError ? (
                            <div className="text-red-500">{progressError}</div>
                        ) : (
                            <div>
                                {accessStatus.length === 0 && !progressError && (
                                    <div className="text-gray-500">No modules found for this student.</div>
                                )}
                                {sortedAccessStatus.map((mod) => (
                                    <div key={mod.module_id} className={`mb-4 p-4 border rounded-lg bg-gray-50 flex items-center justify-between transition ${mod.unlocked ? 'cursor-pointer hover:bg-blue-100' : ''}`}
                                        onClick={mod.unlocked ? async () => {
                                            setLevelsModalData({ module: mod, levels: mod.levels });
                                            setShowLevelsModal(true);
                                            setLevelPercentages({});
                                            await fetchLevelPercentages(selectedStudent, mod);
                                        } : undefined}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-lg">{mod.module_name}</span>
                                            {mod.unlocked ? <Unlock className="text-green-600" /> : <Lock className="text-gray-400" />}
                                        </div>
                                        {!mod.unlocked && (
                                            <button
                                                className={`ml-2 px-3 py-1 rounded font-semibold transition-colors duration-150 bg-green-200 text-green-800 hover:bg-green-300`}
                                                onClick={e => { e.stopPropagation(); handleModuleLockToggle(selectedStudent._id, mod.module_id, mod.unlocked); }}
                                                disabled={!!moduleActionLoading[mod.module_id]}
                                            >
                                                {moduleActionLoading[mod.module_id] ? 'Unlocking...' : 'Unlock Module'}
                                            </button>
                                        )}
                                        {mod.unlocked && (
                                            <button
                                                className={`ml-2 px-3 py-1 rounded font-semibold transition-colors duration-150 bg-red-200 text-red-800 hover:bg-red-300`}
                                                onClick={e => { e.stopPropagation(); handleModuleLockToggle(selectedStudent._id, mod.module_id, mod.unlocked); }}
                                                disabled={!!moduleActionLoading[mod.module_id]}
                                            >
                                                {moduleActionLoading[mod.module_id] ? 'Locking...' : 'Lock Module'}
                                            </button>
                                        )}
                                    </div>
                                ))}
                                {unlockMsg && <div className="mt-2 text-center text-sm text-green-600">{unlockMsg}</div>}
                            </div>
                        )}
                    </div>
                </Modal>
            )}
            {/* Level Tests Modal */}
            {levelTestModal.open && (
                <Modal title={`Tests for ${levelTestModal.level.level_name} in ${levelTestModal.module.module_name}`} onClose={() => setLevelTestModal({ open: false, module: null, level: null })}>
                    {levelTests.loading ? (
                        <div className="flex justify-center items-center h-32"><LoadingSpinner /></div>
                    ) : (
                        <div className="space-y-6">
                            <div>
                                <h4 className="font-bold text-blue-700 mb-2">Practice Tests</h4>
                                {levelTests.practice.length === 0 ? (
                                    <div className="text-gray-400">No practice tests found.</div>
                                ) : (
                                    <ul className="space-y-2">
                                        {levelTests.practice.map(test => (
                                            <li key={test._id} className="bg-blue-50 rounded px-4 py-2 flex flex-col">
                                                <span className="font-semibold text-blue-900">{test.name}</span>
                                                <span className="text-xs text-blue-600">Questions: {test.question_count}</span>
                                                <span className="text-xs text-gray-500">Created: {test.created_at}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                            <div>
                                <h4 className="font-bold text-blue-700 mb-2">Online Tests</h4>
                                {levelTests.online.length === 0 ? (
                                    <div className="text-gray-400">No online tests found.</div>
                                ) : (
                                    <ul className="space-y-2">
                                        {levelTests.online.map(test => (
                                            <li key={test._id} className="bg-green-50 rounded px-4 py-2 flex flex-col">
                                                <span className="font-semibold text-green-900">{test.name}</span>
                                                <span className="text-xs text-green-600">Questions: {test.question_count}</span>
                                                <span className="text-xs text-gray-500">Created: {test.created_at}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    )}
                </Modal>
            )}
            {/* Levels Modal */}
            {showLevelsModal && levelsModalData.module && levelsModalData.module.unlocked && (
                <Modal isOpen={showLevelsModal} onClose={() => { setShowLevelsModal(false); setLevelsModalData({ module: null, levels: [] }); }} title={`${levelsModalData.module.module_name} Levels`}>
                    <div className="p-4">
                        <div className="mb-4 text-lg font-semibold">Levels for {levelsModalData.module.module_name}</div>
                        {levelsModalData.levels.length === 0 ? (
                            <div className="text-gray-500">No levels found for this module.</div>
                        ) : (
                            <div className="grid grid-cols-1 gap-3">
                                {levelsModalData.levels.map(lvl => (
                                    <div key={lvl.level_id} className="flex flex-col md:flex-row md:items-center justify-between p-3 bg-white rounded shadow border">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold">{lvl.level_name}</span>
                                            {lvl.unlocked ? <Unlock className="text-green-600" /> : <Lock className="text-gray-400" />}
                                        </div>
                                        <div className="flex flex-col md:flex-row gap-2 mt-2 md:mt-0">
                                            <span className="text-xs text-blue-700">Practice: <b>{levelPercentages[lvl.level_id]?.practice?.toFixed(1) ?? '--'}%</b></span>
                                            <span className="text-xs text-green-700">Online: <b>{levelPercentages[lvl.level_id]?.online?.toFixed(1) ?? '--'}%</b></span>
                                        </div>
                                        <button
                                            className={`ml-2 px-2 py-1 rounded ${lvl.unlocked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}
                                            onClick={async () => {
                                                setLevelActionLoading(prev => ({ ...prev, [lvl.level_id]: true }));
                                                try {
                                                    if (lvl.unlocked) {
                                                        await api.post(`/batch-management/student/${selectedStudent._id}/lock-level`, { module_id: levelsModalData.module.module_id, level_id: lvl.level_id });
                                                        setUnlockMsg('Level locked!');
                                                    } else {
                                                        await api.post(`/batch-management/student/${selectedStudent._id}/authorize-level`, { module_id: levelsModalData.module.module_id, level_id: lvl.level_id });
                                                        setUnlockMsg('Level unlocked!');
                                                    }
                                                    // Refresh levels for modal UI
                                                    const res = await getStudentAccessStatus(selectedStudent._id);
                                                    const updatedModule = (res.data.data || []).find(m => m.module_id === levelsModalData.module.module_id);
                                                    setLevelsModalData({ module: updatedModule, levels: updatedModule.levels });
                                                } catch (e) {
                                                    setUnlockMsg('Failed to update level access.');
                                                } finally {
                                                    setLevelActionLoading(prev => ({ ...prev, [lvl.level_id]: false }));
                                                    setTimeout(() => setUnlockMsg(''), 2000);
                                                }
                                            }}
                                            disabled={!!levelActionLoading[lvl.level_id]}
                                        >
                                            {levelActionLoading[lvl.level_id]
                                                ? (lvl.unlocked ? 'Locking...' : 'Unlocking...')
                                                : (lvl.unlocked ? 'Lock Level' : 'Unlock Level')}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </Modal>
            )}
            {/* Bulk Delete Confirmation Modal */}
            {showBulkDeleteModal && (
                <Modal 
                    isOpen={showBulkDeleteModal} 
                    onClose={() => setShowBulkDeleteModal(false)} 
                    title="Confirm Bulk Delete"
                >
                    <div className="p-6">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="p-3 bg-red-100 rounded-full">
                                <Trash2 className="w-8 h-8 text-red-600" />
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold text-gray-900">
                                    Delete {selectedStudents.size} Student{selectedStudents.size !== 1 ? 's' : ''}?
                                </h3>
                                <p className="text-gray-600 mt-1">
                                    This action cannot be undone. All selected students and their data will be permanently deleted.
                                </p>
                            </div>
                        </div>
                        
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                            <h4 className="font-semibold text-red-900 mb-2">Warning:</h4>
                            <ul className="text-sm text-red-800 space-y-1">
                                <li>• All student accounts will be deleted</li>
                                <li>• All student progress data will be lost</li>
                                <li>• All test results will be permanently removed</li>
                                <li>• This action cannot be reversed</li>
                            </ul>
                        </div>
                        
                        <div className="flex items-center justify-end gap-3">
                            <button
                                onClick={() => setShowBulkDeleteModal(false)}
                                disabled={bulkDeleteLoading}
                                className="px-6 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleBulkDelete}
                                disabled={bulkDeleteLoading}
                                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                                {bulkDeleteLoading ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                        Deleting...
                                    </>
                                ) : (
                                    <>
                                        <Trash2 className="w-4 h-4" />
                                        Delete {selectedStudents.size} Student{selectedStudents.size !== 1 ? 's' : ''}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Unlock message toast */}
            {unlockMsg && (
                <div className="fixed top-8 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-6 py-3 rounded-full shadow-lg z-50 text-lg font-semibold animate-fade-in">{unlockMsg}</div>
            )}
        </>
    );
};

export default StudentManagement; 
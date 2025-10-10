import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNotification } from '../../contexts/NotificationContext';
import { useAuth } from '../../contexts/AuthContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import api from '../../services/api'; 
import { Users, Filter, Search, Trash2, ListChecks, CheckCircle, BookOpen, Lock, Unlock, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, User, MoreVertical, Download, Mail, X } from 'lucide-react';
import Modal from '../../components/common/Modal';
import { getStudentAccessStatus, authorizeStudentModule, lockStudentModule, authorizeStudentLevel, lockStudentLevel, getStudentDetailedInsights, bulkMigrateStudentsProgress } from '../../services/api';
const CourseStudentManagement = () => {
    const { user, refreshUser } = useAuth();
    const fetchCoursesRef = useRef(false);
    const fetchBatchesRef = useRef(false);
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
    const [detailedInsights, setDetailedInsights] = useState(null);
    const [insightsLoading, setInsightsLoading] = useState(false);
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
    const [migrationLoading, setMigrationLoading] = useState(false);
    
    // Filter and lazy loading state
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalStudents, setTotalStudents] = useState(0);
    const [campuses, setCampuses] = useState([]);
    const [selectedCampus, setSelectedCampus] = useState(user?.campus_id || null);
    const [loadingFilters, setLoadingFilters] = useState(false);
    const [searchInput, setSearchInput] = useState('');
    const [downloadingAll, setDownloadingAll] = useState(false);
    
    // Bulk selection state
    const [selectedStudents, setSelectedStudents] = useState(new Set());
    const [isAllSelected, setIsAllSelected] = useState(false);
    const [showBulkActions, setShowBulkActions] = useState(false);
    const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
    const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);

    // Action menu state
    const [openActionMenu, setOpenActionMenu] = useState(null);

    // Refresh user data to get latest campus_name
    useEffect(() => {
        const refreshUserData = async () => {
            try {
                if (refreshUser) {
                    await refreshUser();
                }
            } catch (error) {
                console.error('Failed to refresh user data:', error);
            }
        };
        refreshUserData();
    }, []);

    // Set campus info for display
    useEffect(() => {
        if (user?.campus_id) {
            console.log('User object in CampusStudentManagement:', user);
            console.log('user.campus_name:', user.campus_name);
            console.log('user.campus_id:', user.campus_id);
            
            // Use campus name from user context (now populated by backend)
            const campusName = user.campus_name || 
                              user.campus?.name || 
                              `Campus ${user.campus_id.slice(-8)}`; // Fallback if campus_name not available
            
            console.log('Final campus name:', campusName);
            
            const userCampus = [{
                _id: user.campus_id,
                name: campusName
            }];
            setCampuses(userCampus);
        }
    }, [user?.campus_id, user?.campus_name, user?.campus?.name]);

    // Fetch courses for course admin's campus/course
    useEffect(() => {
        const fetchCourses = async () => {
            if (!user?.campus_id || !user?.course_id || fetchCoursesRef.current) {
                return;
            }
            
            fetchCoursesRef.current = true;
            try {
                setLoadingFilters(true);
                // For course admin, we can fetch their specific course
                // The backend route /campus-admin/courses should handle this
                const res = await api.get(`/campus-admin/courses`);
                const userCourses = res.data.data || [];
                setCourses(userCourses);

                // If the user is a course admin, their course should be pre-selected and disabled.
                if (user.role === 'course_admin' && user.course_id) {
                    const adminCourse = userCourses.find(c => c.id === user.course_id);
                    if (adminCourse) {
                        setSelectedCourse(adminCourse.id);
                    }
                } else {
                    setSelectedCourse(null);
                }
            } catch (err) {
                error('Failed to fetch courses.');
                setCourses([]);
            } finally {
                setLoadingFilters(false);
            }
        };
        fetchCourses();
    }, [user?.campus_id]);

    // Fetch batches when course changes
  useEffect(() => {
        const fetchBatches = async () => {
            if (!selectedCourse || fetchBatchesRef.current) {
                if (!selectedCourse) {
                    setBatches([]);
                    setSelectedBatch(null);
                }
                return;
            }
            
            fetchBatchesRef.current = true;
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
                fetchBatchesRef.current = false;
            }
        };
        fetchBatches();
    }, [selectedCourse]);

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
    }, [selectedCampus, selectedCourse, selectedBatch]);

    useEffect(() => {
        fetchStudents(1, searchTerm);
    }, [searchTerm, selectedCampus, selectedCourse, selectedBatch]);

    // Clear selection when filters change
    useEffect(() => {
        clearSelection();
    }, [selectedCourse, selectedBatch]);
    
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
                ...(user?.campus_id && { campus_id: user.campus_id }),
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
            if (user?.campus_id) {
                const campus = campuses.find(c => c._id === user.campus_id);
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
        setInsightsLoading(true);
        setProgressError(null);
        setAccessStatus([]);
        setDetailedInsights(null);
        
        try {
            // Fetch both access status and detailed insights in parallel
            const [accessRes, insightsRes] = await Promise.all([
                getStudentAccessStatus(student._id),
                getStudentDetailedInsights(student._id)
            ]);
            
            setAccessStatus(accessRes.data.data || []);
            setDetailedInsights(insightsRes.data.data || null);
        } catch (e) {
            console.error('Error fetching student data:', e);
            setProgressError('Failed to load student data.');
        } finally {
            setProgressLoading(false);
            setInsightsLoading(false);
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
            // Refresh both access status and insights
            const [accessRes, insightsRes] = await Promise.all([
                getStudentAccessStatus(studentId),
                getStudentDetailedInsights(studentId)
            ]);
            setAccessStatus([...accessRes.data.data]); // new array reference
            setDetailedInsights(insightsRes.data.data || null);
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
                await lockStudentLevel(studentId, levelId);
                setUnlockMsg('Level locked!');
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

    const handleBulkMigration = async () => {
        if (!window.confirm('Are you sure you want to migrate ALL students to the new progress system? This action cannot be undone.')) {
            return;
        }
        
        setMigrationLoading(true);
        
        try {
            const response = await bulkMigrateStudentsProgress();
            
            if (response.data.success) {
                console.log('Migration response:', response.data); // Debug log
                const { 
                    migrated_count = 0, 
                    failed_count = 0, 
                    already_migrated_count = 0, 
                    total_students_processed = 0 
                } = response.data;
                
                let message = `Migration completed!\n\n`;
                message += `✅ Migrated: ${migrated_count} students\n`;
                message += `⚠️ Already migrated: ${already_migrated_count} students\n`;
                message += `❌ Failed: ${failed_count} students\n`;
                message += `📊 Total processed: ${total_students_processed} students`;
                
                if (failed_count > 0 && response.data.migration_errors) {
                    message += `\n\nErrors:\n${response.data.migration_errors.slice(0, 3).join('\n')}`;
                    if (response.data.migration_errors.length > 3) {
                        message += `\n... and ${response.data.migration_errors.length - 3} more errors`;
                    }
                }
                
                alert(message);
                success('Bulk migration completed successfully');
                
                // Refresh the student list
                fetchStudents();
            } else {
                error(response.data.message || 'Migration failed');
            }
        } catch (error) {
            console.error('Error during bulk migration:', error);
            error('Failed to perform bulk migration');
        } finally {
            setMigrationLoading(false);
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
    <div className="flex-1 flex flex-col overflow-hidden">
            <main className="flex-1 overflow-x-hidden overflow-y-auto">
                <div className="px-4 mt-6">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                        <div className="flex justify-between items-center mb-8">
                            <div>
                                <h1 className="text-3xl font-bold text-gray-800">Student Management</h1>
                                <p className="text-sm text-gray-500 mt-1">
                                    Manage students in your assigned course.
            {!loading && (
                                        <span className="ml-2 text-blue-600 font-semibold">
                                            ({totalStudents} students)
                                            {(selectedCourse || selectedBatch) && (
                                                <span className="text-sm text-gray-500">
                                                    {' '}(filtered)
                                                </span>
                                            )}
              </span>
            )}
                                </p>
                            </div>
                            
                            {/* Migration Button */}
                            <div className="flex gap-3">
                                <button
                                    onClick={handleBulkMigration}
                                    disabled={migrationLoading}
                                    className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:bg-orange-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                                    title="Migrate all students to new progress system"
                                >
                                    {migrationLoading ? (
                                        <>
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                            Migrating...
                                        </>
                                    ) : (
                                        <>
                                            <ListChecks className="h-4 w-4" />
                                            Migrate Progress System
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* --- Control Panel: Filters & Search --- */}
                        <div className="mb-6 bg-white rounded-xl shadow-md border border-gray-200 p-6">
                            <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                                <Filter className="mr-3 h-6 w-6 text-gray-500" />
                                Controls
                            </h3>
                            
                            {/* Search Input */}
                            <div className="mb-4">
                                <div className="relative">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Search by name, email, or roll number..."
                                        value={searchInput}
                                        onChange={(e) => setSearchInput(e.target.value)}
                                        onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                                        className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                                    />
                                    {searchTerm && (
                                        <button onClick={handleClearSearch} className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-full bg-gray-200 hover:bg-gray-300">
                                            <X className="h-4 w-4 text-gray-600" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Filter Dropdowns */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                {/* Campus Info (Read-only) */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Campus</label>
                                    <input
                                        type="text"
                                        value={campuses.find(c => c._id === user?.campus_id)?.name || 'Loading...'}
                                        readOnly
                                        className="w-full p-3 border border-gray-300 rounded-lg shadow-sm bg-gray-100 text-gray-600 cursor-not-allowed"
                                    />
                                </div>

                                {/* Course Filter */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Course</label>
                                    <select
                                        value={selectedCourse || ''}
                                        onChange={(e) => user.role !== 'course_admin' && setSelectedCourse(e.target.value || null)}
                                        disabled={!user?.campus_id || loadingFilters || user.role === 'course_admin'}
                                        className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed transition"
                                    >
                                        <option value="">
                                            {loadingFilters && user?.campus_id ? 'Loading...' : 'All Courses'}
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
                                        className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed transition"
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

                                {/* Action Buttons */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => {
                                            setSelectedCourse(null);
                                            setSelectedBatch(null);
                                            if (user.role === 'course_admin' && user.course_id) {
                                                setSelectedCourse(user.course_id);
                                            }
                                        }}
                                        disabled={!selectedCourse && !selectedBatch}
                                        className="w-full px-4 py-3 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                                    >
                                        Clear Filters
                                    </button>
                                </div>
                            </div>
          </div>
          
                        {/* Status Section */}
                        <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200 flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                {searchTerm && (
                                    <div className="flex items-center gap-2 text-sm font-medium text-yellow-800 bg-yellow-100 px-3 py-1 rounded-full">
                                        <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                                        <span>Searching for: "{searchTerm}"</span>
                                    </div>
                                )}
                                {selectedStudent && isProgressModalOpen && (
                                    <div className="flex items-center gap-2 text-sm font-medium text-blue-800 bg-blue-100 px-3 py-1 rounded-full">
                                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                                        <span>Viewing: {selectedStudent.name}</span>
                                        <button onClick={() => { setIsProgressModalOpen(false); setSelectedStudent(null); }} className="ml-1 text-blue-600 hover:text-blue-800">&times;</button>
                                    </div>
                                )}
                            </div>
                            
                            {students.length > 0 && (
                                <button
                                    onClick={handleDownloadAllCredentials}
                                    disabled={downloadingAll}
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 text-sm"
                                >
                                    {downloadingAll ? (
                                        <>
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                            Downloading...
                                        </>
                                    ) : (
                                        <>
                                            <Download className="w-4 h-4" />
                                            Download Filtered Credentials
                                        </>
                                    )}
                                </button>
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
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-6 py-4 text-left w-12">
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="checkbox"
                                                                checked={isAllSelected}
                                                                onChange={handleSelectAll}
                                                                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                                            />
                                                        </div>
                                                    </th>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                        Student
                                                    </th>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                        Campus
                                                    </th>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                        Course & Batch
                                                    </th>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                        Username
                                                    </th>
                                                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                        Actions
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
                                                        className={`group hover:bg-gray-50 cursor-pointer transition-colors duration-200 ${
                                                            selectedStudents.has(student._id) 
                                                                ? 'bg-blue-50' 
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
                                                                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                                            />
                                                        </td>
                                                        <td className="px-8 py-6 whitespace-nowrap">
                                                            <div className="flex items-center gap-4">
                                                                <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-semibold text-base">
                                                                    {student.name?.charAt(0)?.toUpperCase() || 'S'}
                                                                </div>
                                                                <div>
                                                                    <div className="text-sm font-medium text-gray-900">
                                                                        {student.name}
                                                                    </div>
                                                                    <div className="text-xs text-gray-500">
                                                                        {student.email}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-8 py-6 whitespace-nowrap">
                                                            <div className="text-sm text-gray-700">
                                                                {student.campus_name || 'N/A'}
                                                            </div>
                                                        </td>
                                                        <td className="px-8 py-6 whitespace-nowrap">
                                                            <div className="space-y-1">
                                                                <div className="text-sm text-gray-800">
                                                                    {student.course_name || 'N/A'}
                                                                </div>
                                                                <div className="text-xs text-gray-500">
                                                                    {student.batch_name || 'N/A'}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-8 py-6 whitespace-nowrap">
                                                            <div className="text-sm text-gray-600 font-mono">
                                                                {student.username || student.roll_number || 'N/A'}
                                                            </div>
                                                        </td>
                                                        <td className="px-8 py-6 whitespace-nowrap text-right relative">
                                                            <div className="flex items-center justify-end">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setOpenActionMenu(openActionMenu === student._id ? null : student._id);
                                                                    }}
                                                                    className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-full transition-colors"
                                                                >
                                                                    <MoreVertical size={20} />
                                                                </button>
                                                                {openActionMenu === student._id && (
                                                                    <div 
                                                                        className="absolute right-12 top-12 mt-2 w-56 bg-white rounded-lg shadow-xl border z-20"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    >
                                                                        <div className="py-1">
                                                                            <button
                                                                                onClick={() => { handleSendCredentialsAgain(student); setOpenActionMenu(null); }}
                                                                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-3"
                                                                            >
                                                                                <Mail size={16} className="text-blue-500" />
                                                                                <span>Send Credentials</span>
                                                                            </button>
                                                                            <button
                                                                                onClick={() => { handleDownloadCredentials(student); setOpenActionMenu(null); }}
                                                                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-3"
                                                                            >
                                                                                <Download size={16} className="text-green-500" />
                                                                                <span>Download Credentials</span>
                                                                            </button>
                                                                            <div className="border-t my-1"></div>
                                                                            <button
                                                                                onClick={() => { handleDeleteStudent(student._id); setOpenActionMenu(null); }}
                                                                                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-3"
                                                                            >
                                                                                <Trash2 size={16} />
                                                                                <span>Delete Student</span>
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                )}
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
                </div>
            </main>
            {/* Student Info & Access Control Modal */}
            {selectedStudent && (
                <Modal isOpen={isProgressModalOpen} onClose={() => { setIsProgressModalOpen(false); setSelectedStudent(null); setSelectedModule(null); setShowLevelsModal(false); setLevelsModalData({ module: null, levels: [] }); }} title={`Student Details: ${selectedStudent.name}`}>
                    <div className="p-6">
                        {/* Detailed Insights Section */}
                        {detailedInsights && (
                            <div className="mb-8 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                                <h3 className="text-lg font-semibold mb-4 text-blue-900 flex items-center gap-2">
                                    📊 Student Progress Insights
                                </h3>
                                
                                {/* Overall Stats */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                    <div className="bg-white p-3 rounded-lg border">
                                        <div className="text-2xl font-bold text-blue-600">{detailedInsights.overall_stats.total_attempts}</div>
                                        <div className="text-sm text-gray-600">Total Attempts</div>
                                    </div>
                                    <div className="bg-white p-3 rounded-lg border">
                                        <div className="text-2xl font-bold text-green-600">{detailedInsights.overall_stats.average_score.toFixed(1)}%</div>
                                        <div className="text-sm text-gray-600">Average Score</div>
                                    </div>
                                    <div className="bg-white p-3 rounded-lg border">
                                        <div className="text-2xl font-bold text-purple-600">{detailedInsights.overall_stats.modules_accessed}</div>
                                        <div className="text-sm text-gray-600">Modules Accessed</div>
                                    </div>
                                    <div className="bg-white p-3 rounded-lg border">
                                        <div className="text-2xl font-bold text-orange-600">{detailedInsights.overall_stats.levels_unlocked}</div>
                                        <div className="text-sm text-gray-600">Levels Unlocked</div>
                                    </div>
                                </div>

                                {/* Module Analysis */}
                                <div className="mb-4">
                                    <h4 className="font-semibold mb-2 text-blue-800">Module Performance</h4>
                                    <div className="space-y-2">
                                        {Object.entries(detailedInsights.module_analysis).map(([moduleId, moduleData]) => (
                                            <div key={moduleId} className="bg-white p-3 rounded-lg border flex justify-between items-center">
                                                <div>
                                                    <span className="font-medium">{moduleId}</span>
                                                    <span className="text-sm text-gray-600 ml-2">(Level: {moduleData.current_level})</span>
                                                </div>
                                                <div className="text-right">
                                                    <div className="font-bold text-blue-600">{moduleData.current_score.toFixed(1)}%</div>
                                                    <div className="text-xs text-gray-500">{moduleData.attempts_count} attempts</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Unlock Recommendations */}
                                {detailedInsights.unlock_recommendations && detailedInsights.unlock_recommendations.length > 0 && (
                                    <div>
                                        <h4 className="font-semibold mb-2 text-green-800">💡 Recommendations</h4>
                                        <div className="space-y-2">
                                            {detailedInsights.unlock_recommendations.map((rec, index) => (
                                                <div key={index} className="bg-white p-3 rounded-lg border border-green-200">
                                                    <div className="font-medium text-green-800">{rec.action}</div>
                                                    <div className="text-sm text-gray-600">{rec.reason}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

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
                                                        await lockStudentLevel(selectedStudent._id, lvl.level_id);
                                                        setUnlockMsg('Level locked!');
                                                    } else {
                                                        await authorizeStudentLevel(selectedStudent._id, lvl.level_id);
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
    </div>
  );
};

export default CourseStudentManagement;
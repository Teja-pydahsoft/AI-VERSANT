import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    BarChart3, 
    Users, 
    TrendingUp, 
    Eye, 
    ChevronDown, 
    ChevronUp,
    FileSpreadsheet,
    Download,
    RefreshCw,
    CheckCircle,
    XCircle,
    Calendar,
    Clock,
    User,
    Mail,
    Phone,
    BookOpen,
    Search,
    X,
    Filter,
    FileText,
    FileSpreadsheet as ExcelIcon,
    Unlock,
    Lock,
    AlertCircle,
    Settings
} from 'lucide-react';
import { useNotification } from '../../contexts/NotificationContext';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import AutoReleaseSettingsModal from '../../components/common/AutoReleaseSettingsModal';
import { autoReleaseSettingsAPI } from '../../services/autoReleaseSettings';

// Import the same TestDetailsView component structure from CampusReports
// Test Details View Component
const TestDetailsView = ({ 
    test, 
    testAttempts, 
    onBack, 
    onStudentClick, 
    onExportTestResults, 
    exportLoading,
    releaseStatus,
    releaseLoading,
    onReleaseResults,
    onUnreleaseResults,
    autoReleaseSchedule
}) => {
    const attempts = testAttempts[test.test_id] || [];
    
    // Filter states
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCampus, setSelectedCampus] = useState('all');
    const [selectedCourse, setSelectedCourse] = useState('all');
    const [selectedBatch, setSelectedBatch] = useState('all');
    const [selectedStatus, setSelectedStatus] = useState('all');
    
    // Pagination states
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(10);
    
    // Reset pagination when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, selectedCampus, selectedCourse, selectedBatch, selectedStatus]);
    
    // Extract unique values for filters
    const uniqueCampuses = [...new Set(attempts.map(student => student.campus_name).filter(Boolean))];
    const uniqueCourses = [...new Set(attempts.map(student => student.course_name).filter(Boolean))];
    const uniqueBatches = [...new Set(attempts.map(student => student.batch_name).filter(Boolean))];
    
    // Auto-select single values
    useEffect(() => {
        if (uniqueCampuses.length === 1) {
            setSelectedCampus(uniqueCampuses[0]);
        }
        if (uniqueCourses.length === 1) {
            setSelectedCourse(uniqueCourses[0]);
        }
        if (uniqueBatches.length === 1) {
            setSelectedBatch(uniqueBatches[0]);
        }
    }, [uniqueCampuses, uniqueCourses, uniqueBatches]);
    
    // Filter students based on all criteria
    const filteredAttempts = attempts.filter(student => {
        // Search filter
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = !searchTerm || 
            student.student_name?.toLowerCase().includes(searchLower) ||
            student.student_email?.toLowerCase().includes(searchLower) ||
            student.roll_number?.toLowerCase().includes(searchLower) ||
            student.campus_name?.toLowerCase().includes(searchLower) ||
            student.course_name?.toLowerCase().includes(searchLower) ||
            student.batch_name?.toLowerCase().includes(searchLower);
        
        // Campus filter
        const matchesCampus = selectedCampus === 'all' || student.campus_name === selectedCampus;
        
        // Course filter
        const matchesCourse = selectedCourse === 'all' || student.course_name === selectedCourse;
        
        // Batch filter
        const matchesBatch = selectedBatch === 'all' || student.batch_name === selectedBatch;
        
        // Status filter
        const matchesStatus = selectedStatus === 'all' || 
            (selectedStatus === 'attempted' && student.has_attempted) ||
            (selectedStatus === 'unattempted' && !student.has_attempted);
        
        return matchesSearch && matchesCampus && matchesCourse && matchesBatch && matchesStatus;
    });
    
    // Reset pagination when filters change
    React.useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, selectedCampus, selectedCourse, selectedBatch, selectedStatus]);
    
    // Pagination logic
    const totalPages = Math.ceil(filteredAttempts.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedAttempts = filteredAttempts.slice(startIndex, endIndex);
    
    // Calculate analytics based on filtered data
    const totalStudents = filteredAttempts.length;
    const attemptedStudents = filteredAttempts.filter(student => student.has_attempted).length;
    const unattemptedStudents = totalStudents - attemptedStudents;
    const passedStudents = filteredAttempts.filter(student => student.has_attempted && student.highest_score >= 50).length;
    const failedStudents = attemptedStudents - passedStudents;
    const averageTime = filteredAttempts.length > 0 
        ? (filteredAttempts.reduce((sum, student) => sum + (student.average_time || 0), 0) / filteredAttempts.length).toFixed(1)
        : 0;
    
    // Reset all filters
    const resetFilters = () => {
        setSearchTerm('');
        setSelectedCampus(uniqueCampuses.length === 1 ? uniqueCampuses[0] : 'all');
        setSelectedCourse(uniqueCourses.length === 1 ? uniqueCourses[0] : 'all');
        setSelectedBatch(uniqueBatches.length === 1 ? uniqueBatches[0] : 'all');
        setSelectedStatus('all');
        setCurrentPage(1);
    };
    
    // Get active filter count
    const activeFiltersCount = [
        searchTerm,
        selectedCampus !== 'all' && uniqueCampuses.length > 1,
        selectedCourse !== 'all' && uniqueCourses.length > 1,
        selectedBatch !== 'all' && uniqueBatches.length > 1,
        selectedStatus !== 'all'
    ].filter(Boolean).length;
    
    return (
        <div className="space-y-6">
            {/* Header with Back Button */}
            <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                >
                    <ChevronDown className="w-4 h-4 rotate-90" />
                    Back to Tests
                </button>
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">{test.test_name}</h1>
                    <p className="text-gray-600">Detailed analysis and student performance</p>
                    
                    {/* Auto Release Schedule Info */}
                    {autoReleaseSchedule && (
                        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="flex items-center space-x-2">
                                <Clock className="w-4 h-4 text-blue-600" />
                                <span className="text-sm font-medium text-blue-900">Auto Release Scheduled</span>
                            </div>
                            <p className="text-sm text-blue-700 mt-1">
                                Results will be automatically released on{' '}
                                {new Date(autoReleaseSchedule.scheduled_release_time).toLocaleString()}
                            </p>
                            {autoReleaseSchedule.status === 'pending' && (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 mt-2">
                                    Pending
                                </span>
                            )}
                        </div>
                    )}
                    </div>
                </div>
                
                {/* Release Controls */}
                <div className="flex items-center gap-3">
                    {releaseStatus[test.test_id] ? (
                        <div className="flex items-center gap-3">
                            <span className="inline-flex items-center gap-1 px-3 py-2 rounded-full text-sm font-medium bg-green-100 text-green-800">
                                <Unlock className="w-4 h-4" />
                                Results Released
                            </span>
                            <button
                                onClick={() => onUnreleaseResults(test.test_id, test.test_name)}
                                disabled={releaseLoading[test.test_id]}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {releaseLoading[test.test_id] ? (
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Lock className="w-4 h-4" />
                                )}
                                Revoke Release
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => onReleaseResults(test.test_id, test.test_name)}
                            disabled={releaseLoading[test.test_id]}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-700 bg-green-100 hover:bg-green-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {releaseLoading[test.test_id] ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                                <Unlock className="w-4 h-4" />
                            )}
                            Release Results
                        </button>
                    )}
                </div>
            </div>

            {/* Analytics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-xl shadow-lg border border-gray-200 p-6"
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-600">Total Assigned</p>
                            <p className="text-3xl font-bold text-gray-900">{totalStudents}</p>
                        </div>
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                            <Users className="w-6 h-6 text-blue-600" />
                        </div>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-white rounded-xl shadow-lg border border-gray-200 p-6"
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-600">Attempted</p>
                            <p className="text-3xl font-bold text-green-600">{attemptedStudents}</p>
                        </div>
                        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                            <CheckCircle className="w-6 h-6 text-green-600" />
                        </div>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-white rounded-xl shadow-lg border border-gray-200 p-6"
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-600">Unattempted</p>
                            <p className="text-3xl font-bold text-red-600">{unattemptedStudents}</p>
                        </div>
                        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                            <XCircle className="w-6 h-6 text-red-600" />
                        </div>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-white rounded-xl shadow-lg border border-gray-200 p-6"
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-600">Pass Rate</p>
                            <p className="text-3xl font-bold text-blue-600">
                                {attemptedStudents > 0 ? ((passedStudents / attemptedStudents) * 100).toFixed(1) : 0}%
                            </p>
                        </div>
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                            <TrendingUp className="w-6 h-6 text-blue-600" />
                        </div>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="bg-white rounded-xl shadow-lg border border-gray-200 p-6"
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-600">Highest Score</p>
                            <p className="text-3xl font-bold text-purple-600">
                                {attemptedStudents > 0 ? Math.max(...filteredAttempts.filter(s => s.has_attempted).map(s => s.highest_score)).toFixed(1) : 0}%
                            </p>
                        </div>
                        <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                            <BarChart3 className="w-6 h-6 text-purple-600" />
                        </div>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="bg-white rounded-xl shadow-lg border border-gray-200 p-6"
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-600">Average Score</p>
                            <p className="text-3xl font-bold text-orange-600">
                                {attemptedStudents > 0 ? (filteredAttempts.filter(s => s.has_attempted).reduce((sum, s) => sum + s.average_score, 0) / attemptedStudents).toFixed(1) : 0}%
                            </p>
                        </div>
                        <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                            <TrendingUp className="w-6 h-6 text-orange-600" />
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Filters and Search Section */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                <div className="flex flex-col lg:flex-row gap-4 mb-4">
                    {/* Search Bar */}
                    <div className="flex-1">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                            <input
                                type="text"
                                placeholder="Search students by name, email, roll number, campus, course, or batch..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Filter Controls */}
                    <div className="flex flex-wrap gap-3">
                        {/* Campus Filter */}
                        <div className="flex flex-col">
                            <label className="text-sm font-medium text-gray-700 mb-1">Campus</label>
                            <select
                                value={selectedCampus}
                                onChange={(e) => setSelectedCampus(e.target.value)}
                                disabled={uniqueCampuses.length <= 1}
                                className={`px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                                    uniqueCampuses.length <= 1 ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
                                }`}
                            >
                                {uniqueCampuses.length > 1 && <option value="all">All Campuses</option>}
                                {uniqueCampuses.map(campus => (
                                    <option key={campus} value={campus}>{campus}</option>
                                ))}
                            </select>
                        </div>

                        {/* Course Filter */}
                        <div className="flex flex-col">
                            <label className="text-sm font-medium text-gray-700 mb-1">Course</label>
                            <select
                                value={selectedCourse}
                                onChange={(e) => setSelectedCourse(e.target.value)}
                                disabled={uniqueCourses.length <= 1}
                                className={`px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                                    uniqueCourses.length <= 1 ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
                                }`}
                            >
                                {uniqueCourses.length > 1 && <option value="all">All Courses</option>}
                                {uniqueCourses.map(course => (
                                    <option key={course} value={course}>{course}</option>
                                ))}
                            </select>
                        </div>

                        {/* Batch Filter */}
                        <div className="flex flex-col">
                            <label className="text-sm font-medium text-gray-700 mb-1">Batch</label>
                            <select
                                value={selectedBatch}
                                onChange={(e) => setSelectedBatch(e.target.value)}
                                disabled={uniqueBatches.length <= 1}
                                className={`px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                                    uniqueBatches.length <= 1 ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
                                }`}
                            >
                                {uniqueBatches.length > 1 && <option value="all">All Batches</option>}
                                {uniqueBatches.map(batch => (
                                    <option key={batch} value={batch}>{batch}</option>
                                ))}
                            </select>
                        </div>

                        {/* Status Filter */}
                        <div className="flex flex-col">
                            <label className="text-sm font-medium text-gray-700 mb-1">Status</label>
                            <select
                                value={selectedStatus}
                                onChange={(e) => setSelectedStatus(e.target.value)}
                                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                            >
                                <option value="all">All Students</option>
                                <option value="attempted">Attempted</option>
                                <option value="unattempted">Not Attempted</option>
                            </select>
                        </div>

                        {/* Reset Filters Button */}
                        {activeFiltersCount > 0 && (
                            <div className="flex flex-col justify-end">
                                <button
                                    onClick={resetFilters}
                                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    Reset Filters
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Filter Status */}
                <div className="flex items-center justify-between text-sm text-gray-600">
                    <div className="flex items-center gap-4">
                        <span>
                            Showing <span className="font-semibold text-gray-900">{totalStudents}</span> of{' '}
                            <span className="font-semibold text-gray-900">{attempts.length}</span> students
                        </span>
                        {activeFiltersCount > 0 && (
                            <span className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                                <Filter className="w-3 h-3" />
                                {activeFiltersCount} filter{activeFiltersCount > 1 ? 's' : ''} active
                            </span>
                        )}
                    </div>
                    {searchTerm && (
                        <div className="text-gray-500">
                            Search results for: <span className="font-medium">"{searchTerm}"</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Student Attempts Section */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-200">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-semibold text-gray-900">
                            Student Attempts ({totalStudents} students)
                        </h2>
                        <div className="flex gap-2">
                            <button
                                onClick={() => onExportTestResults(test.test_id, test.test_name, 'complete', filteredAttempts, attempts)}
                                disabled={exportLoading}
                                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                            >
                                {exportLoading ? (
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                    <FileSpreadsheet className="w-4 h-4" />
                                )}
                                Export Complete
                            </button>
                            <button
                                onClick={() => onExportTestResults(test.test_id, test.test_name, 'excel', filteredAttempts, attempts)}
                                disabled={exportLoading}
                                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                            >
                                {exportLoading ? (
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                    <FileSpreadsheet className="w-4 h-4" />
                                )}
                                Export Attempted
                            </button>
                            <button
                                onClick={() => onExportTestResults(test.test_id, test.test_name, 'csv', filteredAttempts, attempts)}
                                disabled={exportLoading}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                            >
                                {exportLoading ? (
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Download className="w-4 h-4" />
                                )}
                                Export CSV
                            </button>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    {filteredAttempts.length === 0 ? (
                        <div className="text-center py-12">
                            <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-gray-900 mb-2">
                                {attempts.length === 0 ? 'No attempts found' : 'No students match the current filters'}
                            </h3>
                            <p className="text-gray-500">
                                {attempts.length === 0 
                                    ? 'No students have attempted this test yet.' 
                                    : 'Try adjusting your search or filter criteria.'
                                }
                            </p>
                            {attempts.length > 0 && activeFiltersCount > 0 && (
                                <button
                                    onClick={resetFilters}
                                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                    Clear All Filters
                                </button>
                            )}
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Student Name
                                    </th>
                                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Email
                                    </th>
                                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Campus
                                    </th>
                                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Course
                                    </th>
                                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Batch
                                    </th>
                                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Total Questions
                                    </th>
                                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Correct Answers
                                    </th>
                                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Score
                                    </th>
                                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Attempts
                                    </th>
                                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Latest Attempt
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {paginatedAttempts.map((student, studentIndex) => (
                                    <motion.tr
                                        key={student.student_id}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: studentIndex * 0.05 }}
                                        className={`hover:bg-gray-50 ${student.has_attempted ? 'cursor-pointer' : 'cursor-default'}`}
                                        onClick={() => student.has_attempted && onStudentClick(student.student_id, test.test_id)}
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center">
                                                {student.has_attempted ? (
                                                    <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center text-white font-semibold mr-3">
                                                        {student.student_name?.charAt(0)?.toUpperCase() || 'S'}
                                                    </div>
                                                ) : (
                                                    <div className="w-10 h-10 bg-gradient-to-br from-gray-400 to-gray-500 rounded-full flex items-center justify-center text-white font-semibold mr-3">
                                                        {student.student_name?.charAt(0)?.toUpperCase() || 'S'}
                                                    </div>
                                                )}
                                                <div className="flex flex-col">
                                                    <div className="text-sm font-medium text-gray-900">
                                                        {student.student_name}
                                                    </div>
                                                    <div className={`text-xs px-2 py-1 rounded-full inline-block w-fit ${
                                                        student.has_attempted 
                                                            ? 'bg-green-100 text-green-800' 
                                                            : 'bg-red-100 text-red-800'
                                                    }`}>
                                                        {student.has_attempted ? 'Attempted' : 'Not Attempted'}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {student.student_email || 'N/A'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {student.campus_name || 'N/A'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {student.course_name || 'N/A'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {student.batch_name || 'N/A'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {student.has_attempted ? student.total_questions : '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {student.has_attempted ? student.correct_answers : '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {student.has_attempted ? (
                                                <span className={`text-sm font-semibold ${
                                                    student.highest_score >= 50 ? 'text-green-600' : 'text-red-600'
                                                }`}>
                                                    {student.highest_score?.toFixed(1)}%
                                                </span>
                                            ) : (
                                                <span className="text-sm text-gray-400">-</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {student.has_attempted ? student.attempts : '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {student.has_attempted && student.latest_attempt_date
                                                ? new Date(student.latest_attempt_date).toLocaleDateString()
                                                : '-'}
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
                        <div className="flex items-center justify-between">
                            <div className="text-sm text-gray-700">
                                Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
                                <span className="font-medium">{Math.min(endIndex, filteredAttempts.length)}</span> of{' '}
                                <span className="font-medium">{filteredAttempts.length}</span> results
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                    className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Previous
                                </button>
                                
                                <div className="flex gap-1">
                                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                        let pageNum;
                                        if (totalPages <= 5) {
                                            pageNum = i + 1;
                                        } else if (currentPage <= 3) {
                                            pageNum = i + 1;
                                        } else if (currentPage >= totalPages - 2) {
                                            pageNum = totalPages - 4 + i;
                                        } else {
                                            pageNum = currentPage - 2 + i;
                                        }
                                        
                                        return (
                                            <button
                                                key={pageNum}
                                                onClick={() => setCurrentPage(pageNum)}
                                                className={`px-3 py-2 text-sm font-medium rounded-md ${
                                                    currentPage === pageNum
                                                        ? 'bg-blue-600 text-white'
                                                        : 'text-gray-500 bg-white border border-gray-300 hover:bg-gray-50'
                                                }`}
                                            >
                                                {pageNum}
                                            </button>
                                        );
                                    })}
                                </div>
                                
                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                    disabled={currentPage === totalPages}
                                    className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// Main CourseReports Component - Similar structure to CampusReports
const CourseReports = () => {
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState("");
    const [tests, setTests] = useState([]);
    const [testAttempts, setTestAttempts] = useState({});
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [studentAttemptDetails, setStudentAttemptDetails] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [exportLoading, setExportLoading] = useState(false);
    const [currentView, setCurrentView] = useState('list');
    const [selectedTest, setSelectedTest] = useState(null);
    const [releaseStatus, setReleaseStatus] = useState({});
    const [releaseLoading, setReleaseLoading] = useState({});
    const [showAutoReleaseModal, setShowAutoReleaseModal] = useState(false);
    const [autoReleaseSettings, setAutoReleaseSettings] = useState(null);
    const [autoReleaseSchedules, setAutoReleaseSchedules] = useState({});
    const { error, success } = useNotification();
    const { user } = useAuth();

    useEffect(() => {
        window.scrollTo(0, 0);
        fetchTests();
        fetchAutoReleaseSettings();
    }, []);

    const fetchTests = async () => {
        try {
            setLoading(true);
            setErrorMsg("");
            
            // Use course-specific endpoint
            const response = await api.get(`/superadmin/online-tests-overview?course_id=${user?.course_id || ''}`);
            if (response.data.success) {
                setTests(response.data.data || []);
            } else {
                setErrorMsg(response.data.message || 'Failed to fetch tests.');
                error(response.data.message || 'Failed to fetch tests.');
            }
        } catch (err) {
            setErrorMsg('Failed to fetch tests. Please check your login status and try again.');
            error('Failed to fetch tests.');
            console.error('Error fetching tests:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchTestAttempts = async (testId) => {
        try {
            // Pass course_id as query parameter to filter on backend
            const courseParam = user?.course_id ? `?course_id=${user.course_id}` : '';
            const response = await api.get(`/superadmin/test-attempts/${testId}${courseParam}`);
            
            if (response.data.success) {
                const attempts = response.data.data || [];
                
                console.log('Course Admin - Test Attempts:', {
                    testId,
                    userCourseId: user?.course_id,
                    userCourseName: user?.course_name,
                    attemptsReceived: attempts.length,
                    sampleAttempt: attempts[0]
                });
                
                setTestAttempts(prev => ({
                    ...prev,
                    [testId]: attempts
                }));
            } else {
                error('Failed to fetch test attempts.');
            }
        } catch (err) {
            console.error('Error fetching test attempts:', err);
            error('Failed to fetch test attempts.');
        }
    };

    const handleTestClick = async (testId) => {
        const test = tests.find(t => t.test_id === testId);
        if (test) {
            setSelectedTest(test);
            setCurrentView('test-details');
            if (!testAttempts[testId]) {
                await fetchTestAttempts(testId);
            }
            await fetchAutoReleaseSchedule(testId);
        }
    };

    const handleBackToList = () => {
        setCurrentView('list');
        setSelectedTest(null);
    };

    const handleStudentClick = async (studentId, testId) => {
        try {
            const response = await api.get(`/superadmin/student-attempts/${studentId}/${testId}`);
            if (response.data.success) {
                setStudentAttemptDetails(response.data.data);
                setSelectedStudent(studentId);
                setShowDetailsModal(true);
            } else {
                error('Failed to fetch student attempt details.');
            }
        } catch (err) {
            console.error('Error fetching student details:', err);
            error('Failed to fetch student attempt details.');
        }
    };

    const closeDetailsModal = () => {
        setShowDetailsModal(false);
        setStudentAttemptDetails(null);
        setSelectedStudent(null);
    };

    const handleExportTestResults = async (testId, testName, format = 'excel', filteredData = null, allData = null) => {
        setExportLoading(true);
        try {
            if (filteredData && allData) {
                let dataToExport;
                if (format === 'complete' || format === 'csv') {
                    // Export all students from filtered list (both attempted and unattempted)
                    dataToExport = filteredData;
                } else {
                    // Export only attempted students from filtered list (for 'excel' format)
                    dataToExport = filteredData.filter(s => s.has_attempted);
                }
                
                if (dataToExport.length === 0) {
                    error('No data to export with current filters. Try "Export Complete" to include all students.');
                    setExportLoading(false);
                    return;
                }
                
                const exportData = dataToExport.map(student => ({
                    'Student Name': student.student_name || 'N/A',
                    'Student Email': student.student_email || 'N/A',
                    'Roll Number': student.roll_number || 'N/A',
                    'Campus': student.campus_name || 'N/A',
                    'Course': student.course_name || 'N/A',
                    'Batch': student.batch_name || 'N/A',
                    'Total Questions': student.total_questions || 0,
                    'Correct Answers': student.correct_answers || 0,
                    'Score': student.has_attempted ? `${student.highest_score?.toFixed(1) || 0}%` : 'Not Attempted',
                    'Attempts': student.attempts || 0,
                    'Latest Attempt': student.latest_attempt_date ? new Date(student.latest_attempt_date).toLocaleString() : 'N/A',
                    'Status': student.has_attempted ? 'Attempted' : 'Not Attempted'
                }));
                
                if (format === 'csv') {
                    const headers = Object.keys(exportData[0]);
                    const csvContent = [
                        headers.join(','),
                        ...exportData.map(row => headers.map(header => {
                            const value = row[header];
                            return typeof value === 'string' && (value.includes(',') || value.includes('"')) 
                                ? `"${value.replace(/"/g, '""')}"` 
                                : value;
                        }).join(','))
                    ].join('\n');
                    
                    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                    const url = window.URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `${testName}_filtered_results.csv`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    window.URL.revokeObjectURL(url);
                } else {
                    const ws = XLSX.utils.json_to_sheet(exportData);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'Test Results');
                    XLSX.writeFile(wb, `${testName}_filtered_results.xlsx`);
                }
                
                success(`Test results exported successfully! (${dataToExport.length} students)`);
            } else {
                let endpoint;
                let mimeType;
                let fileExtension;
                let fileName;
                
                if (format === 'complete') {
                    endpoint = `/superadmin/export-test-attempts-complete/${testId}`;
                    mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                    fileExtension = 'xlsx';
                    fileName = `${testName}_complete_results.${fileExtension}`;
                } else if (format === 'csv') {
                    endpoint = `/superadmin/export-test-attempts-csv/${testId}`;
                    mimeType = 'text/csv';
                    fileExtension = 'csv';
                    fileName = `${testName}_attempted_results.${fileExtension}`;
                } else {
                    endpoint = `/superadmin/export-test-attempts/${testId}`;
                    mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                    fileExtension = 'xlsx';
                    fileName = `${testName}_attempted_results.${fileExtension}`;
                }
                
                const response = await api.get(endpoint, {
                    responseType: 'blob'
                });
                
                const blob = new Blob([response.data], { type: mimeType });
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = fileName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
                
                const formatName = format === 'complete' ? 'Complete (All Students)' : format.toUpperCase();
                success(`Test results exported as ${formatName} successfully!`);
            }
        } catch (err) {
            console.error('Export error:', err);
            error('Failed to export test results. Please try again.');
        } finally {
            setExportLoading(false);
        }
    };

    const handleReleaseResults = async (testId, testName) => {
        try {
            setReleaseLoading(prev => ({ ...prev, [testId]: true }));
            
            const response = await api.post(`/results-management/release/${testId}`);
            
            if (response.data.success) {
                setReleaseStatus(prev => ({ ...prev, [testId]: true }));
                success(`Test results for "${testName}" have been released successfully!`);
            } else {
                error(response.data.message || 'Failed to release test results');
            }
        } catch (err) {
            console.error('Release error:', err);
            error('Failed to release test results. Please try again.');
        } finally {
            setReleaseLoading(prev => ({ ...prev, [testId]: false }));
        }
    };

    const handleUnreleaseResults = async (testId, testName) => {
        try {
            setReleaseLoading(prev => ({ ...prev, [testId]: true }));
            
            const response = await api.post(`/results-management/unrelease/${testId}`);
            
            if (response.data.success) {
                setReleaseStatus(prev => ({ ...prev, [testId]: false }));
                success(`Test results for "${testName}" have been unreleased successfully!`);
            } else {
                error(response.data.message || 'Failed to unrelease test results');
            }
        } catch (err) {
            console.error('Unrelease error:', err);
            error('Failed to unrelease test results. Please try again.');
        } finally {
            setReleaseLoading(prev => ({ ...prev, [testId]: false }));
        }
    };

    const fetchReleaseStatus = async () => {
        try {
            const statusPromises = tests.map(test => 
                api.get(`/results-management/status/${test.test_id}`)
                    .then(response => ({ testId: test.test_id, status: response.data.data }))
                    .catch(() => ({ testId: test.test_id, status: { is_released: false } }))
            );
            
            const statuses = await Promise.all(statusPromises);
            const statusMap = {};
            statuses.forEach(({ testId, status }) => {
                statusMap[testId] = status.is_released;
            });
            setReleaseStatus(statusMap);
        } catch (err) {
            console.error('Error fetching release status:', err);
        }
    };

    useEffect(() => {
        if (tests.length > 0) {
            fetchReleaseStatus();
        }
    }, [tests]);

    const fetchAutoReleaseSettings = async () => {
        try {
            const response = await autoReleaseSettingsAPI.getSettings();
            setAutoReleaseSettings(response.settings);
        } catch (err) {
            console.error('Error fetching auto-release settings:', err);
        }
    };

    const handleSaveAutoReleaseSettings = async (settings) => {
        try {
            await autoReleaseSettingsAPI.updateSettings(settings);
            setAutoReleaseSettings(settings);
            success('Auto-release settings saved successfully!');
        } catch (err) {
            console.error('Error saving auto-release settings:', err);
            throw err;
        }
    };

    const fetchAutoReleaseSchedule = async (testId) => {
        try {
            const response = await autoReleaseSettingsAPI.getTestSchedule(testId);
            if (response.schedule) {
                setAutoReleaseSchedules(prev => ({
                    ...prev,
                    [testId]: response.schedule
                }));
            }
        } catch (err) {
            console.error('Error fetching auto-release schedule:', err);
        }
    };

    if (loading) {
        return (
            <main className="px-6 lg:px-10 py-12">
                <div className="flex items-center justify-center h-64">
                    <div className="flex items-center gap-3">
                        <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                        <span className="text-lg text-gray-600">Loading tests...</span>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <>
            <main className="px-6 lg:px-10 py-12">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    {currentView === 'test-details' && selectedTest ? (
                        <TestDetailsView
                            test={selectedTest}
                            testAttempts={testAttempts}
                            onBack={handleBackToList}
                            onStudentClick={handleStudentClick}
                            onExportTestResults={handleExportTestResults}
                            exportLoading={exportLoading}
                            releaseStatus={releaseStatus}
                            releaseLoading={releaseLoading}
                            onReleaseResults={handleReleaseResults}
                            onUnreleaseResults={handleUnreleaseResults}
                            autoReleaseSchedule={autoReleaseSchedules[selectedTest?.test_id]}
                        />
                    ) : (
                        <>
                            {/* Header */}
                            <div className="flex justify-between items-center mb-8">
                                <div>
                                    <h1 className="text-3xl font-bold text-gray-900">
                                        Online Tests Overview
                                    </h1>
                                    <p className="mt-2 text-gray-600">
                                        Click on a test to view student attempts and detailed results
                                    </p>
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setShowAutoReleaseModal(true)}
                                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                    >
                                        <Settings className="w-4 h-4" />
                                        Auto Release Settings
                                    </button>
                                </div>
                            </div>

                    {/* Error Message */}
                    {errorMsg && (
                        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-red-700">{errorMsg}</p>
                        </div>
                    )}

                    {/* Tests Table */}
                    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Test Name
                                        </th>
                                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Category
                                        </th>
                                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Attempts
                                        </th>
                                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Highest Score
                                        </th>
                                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Average Score
                                        </th>
                                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Results Status
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {tests.length === 0 ? (
                                        <tr>
                                            <td colSpan="6" className="px-6 py-12 text-center">
                                                <div className="flex flex-col items-center">
                                                    <BarChart3 className="w-12 h-12 text-gray-400 mb-4" />
                                                    <h3 className="text-lg font-medium text-gray-900 mb-2">No online tests found</h3>
                                                    <p className="text-gray-500">No online tests are available for your course.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        tests.map((test, index) => (
                                            <motion.tr
                                                key={test.test_id}
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: index * 0.1 }}
                                                className="hover:bg-gray-50 cursor-pointer"
                                                onClick={() => handleTestClick(test.test_id)}
                                            >
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center">
                                                        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-semibold mr-3">
                                                            {test.test_name?.charAt(0)?.toUpperCase() || 'T'}
                                                        </div>
                                                        <div>
                                                            <div className="text-sm font-medium text-gray-900">
                                                                {test.test_name}
                                                            </div>
                                                            <div className="text-sm text-gray-500">
                                                                {test.unique_students} students
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                    {test.category}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                    {test.total_attempts}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                                                    {test.highest_score}%
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">
                                                    {test.average_score}%
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {releaseStatus[test.test_id] ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                            <Unlock className="w-3 h-3" />
                                                            Released
                                                        </span>
                                                    ) : (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleReleaseResults(test.test_id, test.test_name);
                                                            }}
                                                            disabled={releaseLoading[test.test_id]}
                                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 hover:bg-red-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            {releaseLoading[test.test_id] ? (
                                                                <RefreshCw className="w-3 h-3 animate-spin" />
                                                            ) : (
                                                                <Lock className="w-3 h-3" />
                                                            )}
                                                            Not Released
                                                        </button>
                                                    )}
                                                </td>
                                            </motion.tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                        </>
                    )}
                </motion.div>
            </main>

            {/* Auto Release Settings Modal */}
            <AnimatePresence>
                {showAutoReleaseModal && (
                    <AutoReleaseSettingsModal
                        isOpen={showAutoReleaseModal}
                        onClose={() => setShowAutoReleaseModal(false)}
                        settings={autoReleaseSettings}
                        onSave={handleSaveAutoReleaseSettings}
                    />
                )}
            </AnimatePresence>
        </>
    );
};

export default CourseReports;

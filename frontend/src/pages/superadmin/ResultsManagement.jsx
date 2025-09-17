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
    FileSpreadsheet as ExcelIcon
} from 'lucide-react';
import { useNotification } from '../../contexts/NotificationContext';
import api from '../../services/api';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Test Details View Component
const TestDetailsView = ({ 
    test, 
    testAttempts, 
    onBack, 
    onStudentClick, 
    onExportTestResults, 
    exportLoading 
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
                                onClick={() => onExportTestResults(test.test_id, test.test_name, 'complete')}
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
                                onClick={() => onExportTestResults(test.test_id, test.test_name, 'excel')}
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
                                onClick={() => onExportTestResults(test.test_id, test.test_name, 'csv')}
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
                                            {student.student_email || '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {student.campus_name || '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {student.course_name || '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {student.batch_name || '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {student.has_attempted ? student.total_questions : '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {student.has_attempted ? student.correct_answers : '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            {student.has_attempted ? (
                                                <span className={`${
                                                    student.highest_score >= 70 ? 'text-green-600' :
                                                    student.highest_score >= 50 ? 'text-yellow-600' : 'text-red-600'
                                                }`}>
                                                    {student.highest_score.toFixed(1)}%
                                                </span>
                                            ) : (
                                                <span className="text-gray-400">-</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {student.attempts_count}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {student.has_attempted ? (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onStudentClick(student.student_id, test.test_id);
                                                    }}
                                                    className="text-blue-600 hover:text-blue-800 transition-colors"
                                                    title="View Details"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>
                                            ) : (
                                                <span className="text-gray-400" title="No attempts to view">
                                                    <Eye className="w-4 h-4" />
                                                </span>
                                            )}
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                
                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="bg-white px-6 py-4 border-t border-gray-200">
                        <div className="flex items-center justify-between">
                            <div className="text-sm text-gray-700">
                                Showing {startIndex + 1} to {Math.min(endIndex, filteredAttempts.length)} of {filteredAttempts.length} students
                            </div>
                            <div className="flex items-center space-x-2">
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                    className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Previous
                                </button>
                                
                                <div className="flex space-x-1">
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

const ResultsManagement = () => {
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState("");
    const [tests, setTests] = useState([]);
    const [expandedTest, setExpandedTest] = useState(null);
    const [testAttempts, setTestAttempts] = useState({});
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [studentAttemptDetails, setStudentAttemptDetails] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [exportLoading, setExportLoading] = useState(false);
    const [currentView, setCurrentView] = useState('list'); // 'list' or 'test-details'
    const [selectedTest, setSelectedTest] = useState(null);
    const [studentExportLoading, setStudentExportLoading] = useState(false);
    const { error, success } = useNotification();

    useEffect(() => {
        window.scrollTo(0, 0);
        fetchTests();
    }, []);

    const fetchTests = async () => {
        try {
            setLoading(true);
            setErrorMsg("");
            
            const response = await api.get('/superadmin/online-tests-overview');
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
            const response = await api.get(`/superadmin/test-attempts/${testId}`);
            if (response.data.success) {
                setTestAttempts(prev => ({
                    ...prev,
                    [testId]: response.data.data || []
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
        }
    };

    const handleBackToList = () => {
        setCurrentView('list');
        setSelectedTest(null);
        setExpandedTest(null);
    };

    const handleStudentClick = async (studentId, testId) => {
        try {
            const response = await api.get(`/superadmin/student-attempts/${studentId}/${testId}`);
            if (response.data.success) {
                console.log("student attempt details",response.data);
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

    // Export functions for student attempt details
    const exportStudentAttemptToExcel = async () => {
        if (!studentAttemptDetails || studentAttemptDetails.length === 0) {
            error('No attempt details available to export');
            return;
        }

        setStudentExportLoading(true);
        try {
            // Get student information from the first attempt
            const firstAttempt = studentAttemptDetails[0];
            const studentInfo = {
                'Student Name': firstAttempt.student_name || 'N/A',
                'Roll Number': firstAttempt.roll_number || 'N/A',
                'Email': firstAttempt.email || 'N/A',
                'Test Name': firstAttempt.test_name || 'N/A',
                'Total Attempts': studentAttemptDetails.length,
                'Export Date': new Date().toLocaleString()
            };

            // Prepare comprehensive question-wise data
            const questionData = [];
            let totalCorrect = 0;
            let totalIncorrect = 0;
            let totalScore = 0;
            let totalQuestions = 0;

            studentAttemptDetails.forEach((attempt, attemptIndex) => {
                if (attempt.detailed_results && attempt.detailed_results.length > 0) {
                    totalQuestions = attempt.detailed_results.length; // Get total questions from first attempt
                    
                    attempt.detailed_results.forEach((result, questionIndex) => {
                        const marksObtained = result.marks_obtained || (result.is_correct ? 1 : 0);
                        
                        questionData.push({
                            'Attempt': attemptIndex + 1,
                            'Question #': questionIndex + 1,
                            'Question Text': String(result.question_text || 'N/A'),
                            'Question Type': String(result.question_type || 'N/A'),
                            'Student Answer': String(result.student_answer || result.selected_answer || 'No answer provided'),
                            'Correct Answer': String(result.correct_answer_text || result.correct_answer || 'N/A'),
                            'Status': result.is_correct ? 'Correct' : 'Incorrect',
                            'Marks Obtained': marksObtained,
                            'Max Marks': result.max_marks || 1,
                            'Similarity Score': result.similarity_score ? `${result.similarity_score.toFixed(1)}%` : 'N/A',
                            'Student Transcript': String(result.student_text || 'N/A'),
                            'Original Text': String(result.original_text || 'N/A'),
                            'Submitted At': attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString() : 'N/A',
                            'Time Taken': attempt.time_taken ? `${attempt.time_taken} min` : 'N/A',
                            'Attempt Score': attempt.score_percentage ? `${attempt.score_percentage.toFixed(1)}%` : '0%'
                        });

                        if (result.is_correct) totalCorrect++;
                        else totalIncorrect++;
                        totalScore += marksObtained;
                    });
                }
            });

            // Calculate summary statistics
            const totalAttempts = studentAttemptDetails.length;
            const averageScore = totalAttempts > 0 ? (totalScore / totalAttempts).toFixed(1) : 0;
            const accuracy = totalQuestions > 0 ? ((totalCorrect / (totalQuestions * totalAttempts)) * 100).toFixed(1) : 0;

            // Summary data
            const summaryData = [
                { 'Metric': 'Total Questions', 'Value': totalQuestions },
                { 'Metric': 'Total Attempts', 'Value': totalAttempts },
                { 'Metric': 'Total Correct Answers', 'Value': totalCorrect },
                { 'Metric': 'Total Incorrect Answers', 'Value': totalIncorrect },
                { 'Metric': 'Total Score', 'Value': totalScore },
                { 'Metric': 'Average Score per Attempt', 'Value': averageScore },
                { 'Metric': 'Overall Accuracy', 'Value': `${accuracy}%` },
                { 'Metric': 'Export Date', 'Value': new Date().toLocaleString() }
            ];

            // Create workbook
            const wb = XLSX.utils.book_new();
            
            // Add student info sheet
            const studentInfoWS = XLSX.utils.json_to_sheet([studentInfo]);
            XLSX.utils.book_append_sheet(wb, studentInfoWS, 'Student Information');

            // Add questions sheet with better formatting
            const questionsWS = XLSX.utils.json_to_sheet(questionData);
            
            // Set column widths
            const colWidths = [
                { wch: 8 },   // Attempt
                { wch: 10 },  // Question #
                { wch: 50 },  // Question Text
                { wch: 15 },  // Question Type
                { wch: 30 },  // Student Answer
                { wch: 30 },  // Correct Answer
                { wch: 12 },  // Status
                { wch: 12 },  // Marks Obtained
                { wch: 10 },  // Max Marks
                { wch: 15 },  // Similarity Score
                { wch: 30 },  // Student Transcript
                { wch: 30 },  // Original Text
                { wch: 20 },  // Submitted At
                { wch: 12 },  // Time Taken
                { wch: 15 }   // Attempt Score
            ];
            questionsWS['!cols'] = colWidths;
            
            XLSX.utils.book_append_sheet(wb, questionsWS, 'Question Details');

            // Add summary sheet
            const summaryWS = XLSX.utils.json_to_sheet(summaryData);
            XLSX.utils.book_append_sheet(wb, summaryWS, 'Summary');

            // Generate filename
            const studentName = (firstAttempt.student_name || 'Student').replace(/[^a-zA-Z0-9]/g, '_');
            const testName = (firstAttempt.test_name || 'Test').replace(/[^a-zA-Z0-9]/g, '_');
            const filename = `${studentName}_${testName}_AttemptDetails_${new Date().toISOString().split('T')[0]}.xlsx`;

            // Save file
            XLSX.writeFile(wb, filename);
            success('Excel file exported successfully!');
        } catch (err) {
            console.error('Error exporting to Excel:', err);
            error('Failed to export Excel file');
        } finally {
            setStudentExportLoading(false);
        }
    };

    const exportStudentAttemptToPDF = async () => {
        if (!studentAttemptDetails || studentAttemptDetails.length === 0) {
            error('No attempt details available to export');
            return;
        }
    
        setStudentExportLoading(true);
        try {
            const firstAttempt = studentAttemptDetails[0];
            const studentName = firstAttempt.student_name || 'N/A';
            const testName = firstAttempt.test_name || 'N/A';
            
            // Create PDF in portrait orientation
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            let yPosition = 20;
    
            // Color scheme: Green, White, Black
            const colors = {
                primary: [34, 139, 34],      // Forest Green
                secondary: [240, 248, 240],  // Light Green
                accent: [0, 100, 0],         // Dark Green
                text: [0, 0, 0],             // Black
                white: [255, 255, 255],      // White
                lightGray: [245, 245, 245]   // Light Gray
            };
    
            // Helper function to add text with word wrap and alignment
            const addText = (text, x, y, maxWidth = pageWidth - 40, color = colors.text, fontSize = 10, fontStyle = 'normal', align = 'left') => {
                pdf.setFontSize(fontSize);
                pdf.setFont('helvetica', fontStyle);
                pdf.setTextColor(color[0], color[1], color[2]);
                
                // For center alignment, calculate text width directly
                if (align === 'center') {
                    const textWidth = pdf.getStringUnitWidth(String(text)) * fontSize / pdf.internal.scaleFactor;
                    const centerX = x - (textWidth / 2);
                    pdf.text(String(text), centerX, y);
                    return y + (fontSize * 0.35);
                }
                
                const lines = pdf.splitTextToSize(String(text), maxWidth);
                
                // Handle text alignment
                lines.forEach((line, index) => {
                    let textX = x;
                    if (align === 'right') {
                        const textWidth = pdf.getStringUnitWidth(line) * fontSize / pdf.internal.scaleFactor;
                        textX = x + (maxWidth - textWidth);
                    }
                    
                    pdf.text(line, textX, y + (index * (fontSize * 0.35)));
                });
                
                return y + (lines.length * (fontSize * 0.35));
            };
    
            // Helper function to add a new page if needed
            const checkNewPage = (requiredSpace = 20) => {
                if (yPosition + requiredSpace > pageHeight - 20) {
                    pdf.addPage();
                    yPosition = 20;
                    return true;
                }
                return false;
            };
    
            // Helper function to draw a rectangle with color
            const drawRect = (x, y, width, height, fillColor = colors.white, strokeColor = colors.primary) => {
                pdf.setFillColor(fillColor[0], fillColor[1], fillColor[2]);
                pdf.setDrawColor(strokeColor[0], strokeColor[1], strokeColor[2]);
                pdf.rect(x, y, width, height, 'FD');
            };
    
            // Helper function to draw a table cell with proper alignment
            const drawTableCell = (x, y, width, height, text, textColor = colors.text, fontSize = 9, fontStyle = 'normal', align = 'left', fillColor = colors.white) => {
                drawRect(x, y, width, height, fillColor, colors.primary);
                
                const textY = y + height/2 + fontSize/3;
                
                if (align === 'center') {
                    const textWidth = pdf.getStringUnitWidth(String(text)) * fontSize / pdf.internal.scaleFactor;
                    const centerX = x + (width - textWidth) / 2;
                    pdf.setFontSize(fontSize);
                    pdf.setFont('helvetica', fontStyle);
                    pdf.setTextColor(textColor[0], textColor[1], textColor[2]);
                    pdf.text(String(text), centerX, textY);
                } else {
                    const textX = align === 'right' ? x + width - 3 : x + 3;
                    addText(text, textX, textY, width - 6, textColor, fontSize, fontStyle, align);
                }
            };
    
            // Helper function to calculate required row height based on text length
            const calculateRowHeight = (text, maxWidth, fontSize = 6) => {
                const lines = pdf.splitTextToSize(String(text), maxWidth);
                return Math.max(8, lines.length * (fontSize * 0.4) + 4);
            };
    
            // Title with green background - properly centered
            drawRect(10, 10, pageWidth - 20, 15, colors.primary);
            addText(`${studentName}'s TEST ATTEMPT DETAILS`, pageWidth/2, 12, undefined, colors.white, 14, 'bold', 'center');
            yPosition = 30;
    
            // Student Information Box - optimized for A4 portrait
            const margin = 15; // Standard margin for A4 portrait
            const infoBoxHeight = 35;
            drawRect(margin, yPosition, pageWidth - (margin * 2), infoBoxHeight, colors.secondary);
            
            // Student Information Title - centered
            addText('STUDENT INFORMATION', pageWidth/2, yPosition + 8, undefined, colors.accent, 12, 'bold', 'center');
            
            // Student details in two columns for portrait (better fit)
            const colWidth = (pageWidth - (margin * 2) - 20) / 2;
            const col1 = margin + 10;
            const col2 = col1 + colWidth;
            
            // First row of details
            addText(`Student Name: ${studentName}`, col1, yPosition + 18, colWidth - 5, colors.text, 10);
            addText(`Roll Number: ${firstAttempt.roll_number || 'N/A'}`, col2, yPosition + 18, colWidth - 5, colors.text, 10);
            
            // Second row of details
            addText(`Email: ${firstAttempt.email || 'N/A'}`, col1, yPosition + 25, colWidth - 5, colors.text, 10);
            addText(`Test Name: ${testName}`, col2, yPosition + 25, colWidth - 5, colors.text, 10);
            
            // Third row of details
            addText(`Total Attempts: ${studentAttemptDetails.length}`, col1, yPosition + 32, colWidth - 5, colors.text, 10);
            addText(`Export Date: ${new Date().toLocaleString()}`, col2, yPosition + 32, colWidth - 5, colors.text, 10);
            
            yPosition += infoBoxHeight + 10;
    
            // Process each attempt
            let totalCorrect = 0;
            let totalIncorrect = 0;
            let totalScore = 0;
            let totalQuestions = 0;
    
            studentAttemptDetails.forEach((attempt, attemptIndex) => {
                checkNewPage(40);
                
                 // Attempt header with green background - A4 portrait optimized
                 drawRect(margin, yPosition, pageWidth - (margin * 2), 12, colors.primary);
                 addText(`ATTEMPT ${attemptIndex + 1}`, pageWidth/2, yPosition + 7, pageWidth - (margin * 2), colors.white, 12, 'bold', 'center');
                 yPosition += 15;
    
                // Attempt details - A4 portrait optimized margins
                addText(`Submitted: ${attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString() : 'N/A'}`, margin + 5, yPosition, pageWidth - (margin * 2) - 10, colors.text, 10);
                yPosition += 6;
                addText(`Time Taken: ${attempt.time_taken || 'N/A'} min`, margin + 5, yPosition, pageWidth - (margin * 2) - 10, colors.text, 10);
                yPosition += 6;
                addText(`Score: ${attempt.score_percentage?.toFixed(1) || 0}%`, margin + 5, yPosition, pageWidth - (margin * 2) - 10, colors.text, 10);
                yPosition += 12;
    
                if (attempt.detailed_results && attempt.detailed_results.length > 0) {
                    totalQuestions = attempt.detailed_results.length;
                    
                    // Questions table - optimized for A4 portrait
                    const tableX = margin;
                    const tableWidth = pageWidth - (margin * 2);
                    
                    // Column widths for portrait (210mm total width - 30mm margins = 180mm available)
                    const colWidths = [
                        15,  // Q# (15mm)
                        80,  // Question (80mm)
                        40,  // Student Answer (40mm)
                        40,  // Correct Answer (40mm)
                        5    // Status (5mm)
                    ]; // Total: 180mm
                    
                    const headerRowHeight = 10;
                    const rowHeight = 12;
                    
                    // Table header
                    checkNewPage(headerRowHeight + (attempt.detailed_results.length * rowHeight) + 10);
                    
                    drawRect(tableX, yPosition, tableWidth, headerRowHeight, colors.accent);
                    addText('Q#', tableX + colWidths[0]/2, yPosition + 6, colWidths[0], colors.white, 8, 'bold', 'center');
                    addText('Question', tableX + colWidths[0] + colWidths[1]/2, yPosition + 6, colWidths[1], colors.white, 8, 'bold', 'center');
                    addText('Student Answer', tableX + colWidths[0] + colWidths[1] + colWidths[2]/2, yPosition + 6, colWidths[2], colors.white, 8, 'bold', 'center');
                    addText('Correct Answer', tableX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3]/2, yPosition + 6, colWidths[3], colors.white, 8, 'bold', 'center');
                    addText('✓/✗', tableX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4]/2, yPosition + 6, colWidths[4], colors.white, 8, 'bold', 'center');
                    
                    yPosition += headerRowHeight;
    
                    // Process each question in table format
                    attempt.detailed_results.forEach((result, questionIndex) => {
                        const isCorrect = result.is_correct;
                        const score = isCorrect ? 1 : 0;
                        
                        // Check if we need a new page
                        checkNewPage(rowHeight + 5);
                        
                        // Row background color based on correctness
                        const rowFillColor = isCorrect ? [240, 255, 240] : [255, 240, 240]; // Light green/red
                        const textColor = isCorrect ? [0, 100, 0] : [150, 0, 0];
                        
                        // Question number (centered)
                        drawTableCell(tableX, yPosition, colWidths[0], rowHeight, 
                                     (questionIndex + 1).toString(), colors.text, 8, 'bold', 'center', rowFillColor);
                        
                        // Question text (left aligned, wrapped)
                        const questionText = String(result.question_text || 'N/A');
                        drawTableCell(tableX + colWidths[0], yPosition, colWidths[1], rowHeight, 
                                     questionText, colors.text, 7, 'normal', 'left', rowFillColor);
                        
                        // Student answer (left aligned, wrapped)
                        const studentAnswer = String(result.student_answer || result.selected_answer || 'No answer');
                        drawTableCell(tableX + colWidths[0] + colWidths[1], yPosition, colWidths[2], rowHeight, 
                                     studentAnswer, textColor, 7, 'normal', 'left', rowFillColor);
                        
                        // Correct answer (left aligned, wrapped)
                        const correctAnswer = String(result.correct_answer_text || result.correct_answer || 'N/A');
                        drawTableCell(tableX + colWidths[0] + colWidths[1] + colWidths[2], yPosition, colWidths[3], rowHeight, 
                                     correctAnswer, colors.text, 7, 'normal', 'left', rowFillColor);
                        
                        // Status (centered)
                        const statusSymbol = isCorrect ? '✓' : '✗';
                        drawTableCell(tableX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], yPosition, colWidths[4], rowHeight, 
                                     statusSymbol, textColor, 10, 'bold', 'center', rowFillColor);
                        
                        yPosition += rowHeight;
    
                        if (isCorrect) totalCorrect++;
                        else totalIncorrect++;
                        totalScore += score;
                    });
                }
                yPosition += 15;
            });
    
            // Summary section with green background
            checkNewPage(40);
            drawRect(margin, yPosition, pageWidth - (margin * 2), 12, colors.primary);
            addText('SUMMARY', pageWidth/2, yPosition + 7, undefined, colors.white, 12, 'bold', 'center');
            yPosition += 15;
    
            // Summary details in a nice box
            const summaryBoxHeight = 40;
            drawRect(margin, yPosition, pageWidth - (margin * 2), summaryBoxHeight, colors.secondary);
            
            const totalAttempts = studentAttemptDetails.length;
            const averageScore = totalAttempts > 0 ? (totalScore / (totalQuestions * totalAttempts) * 100).toFixed(1) : 0;
            const accuracy = totalQuestions > 0 ? ((totalCorrect / (totalQuestions * totalAttempts)) * 100).toFixed(1) : 0;
    
            // Summary details in two columns for portrait
            addText(`Total Questions: ${totalQuestions}`, col1, yPosition + 10, colWidth, colors.text, 10, 'bold');
            addText(`Total Attempts: ${totalAttempts}`, col2, yPosition + 10, colWidth, colors.text, 10, 'bold');
            
            addText(`Total Correct: ${totalCorrect}`, col1, yPosition + 18, colWidth, colors.accent, 10, 'bold');
            addText(`Total Incorrect: ${totalIncorrect}`, col2, yPosition + 18, colWidth, colors.text, 10, 'bold');
            
            addText(`Total Score: ${totalScore}/${totalQuestions * totalAttempts}`, col1, yPosition + 26, colWidth, colors.text, 10, 'bold');
            addText(`Average Score: ${averageScore}%`, col2, yPosition + 26, colWidth, colors.text, 10, 'bold');
            
            addText(`Overall Accuracy: ${accuracy}%`, col1, yPosition + 34, colWidth, colors.accent, 11, 'bold');
    
            // Save PDF
            const filename = `${studentName.replace(/[^a-zA-Z0-9]/g, '_')}_${testName.replace(/[^a-zA-Z0-9]/g, '_')}_AttemptDetails_${new Date().toISOString().split('T')[0]}.pdf`;
            pdf.save(filename);
            success('PDF file exported successfully!');
        } catch (err) {
            console.error('Error exporting to PDF:', err);
            error('Failed to export PDF file: ' + err.message);
        } finally {
            setStudentExportLoading(false);
        }
    };

    const handleExportTestResults = async (testId, testName, format = 'excel') => {
        setExportLoading(true);
        try {
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
        } catch (err) {
            console.error('Export error:', err);
            error('Failed to export test results. Please try again.');
        } finally {
            setExportLoading(false);
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
                                            Actions
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
                                                    <p className="text-gray-500">No online tests are available in the system.</p>
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
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    <Eye className="w-5 h-5" />
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

            {/* Student Attempt Details Modal */}
            {showDetailsModal && studentAttemptDetails && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
                    >
                        <div className="p-6 border-b border-gray-200">
                            <div className="flex justify-between items-center">
                                <h3 className="text-xl font-semibold text-gray-900">
                                    Student Attempt Details
                                </h3>
                                <div className="flex items-center gap-3">
                                    {/* Export Buttons */}
                                        <button
                                        onClick={exportStudentAttemptToExcel}
                                        disabled={studentExportLoading}
                                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <ExcelIcon className="w-4 h-4" />
                                        {studentExportLoading ? 'Exporting...' : 'Export Excel'}
                                        </button>
                                        <button
                                        onClick={exportStudentAttemptToPDF}
                                        disabled={studentExportLoading}
                                        className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <FileText className="w-4 h-4" />
                                        {studentExportLoading ? 'Exporting...' : 'Export PDF'}
                                        </button>
                                    <button
                                        onClick={closeDetailsModal}
                                        className="text-gray-400 hover:text-gray-600 transition-colors p-2"
                                    >
                                        <XCircle className="w-6 h-6" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 overflow-y-auto max-h-[70vh]">
                            {studentAttemptDetails.length === 0 ? (
                                <div className="text-center py-8">
                                    <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                                    <h3 className="text-lg font-medium text-gray-900 mb-2">No attempt details found</h3>
                                    <p className="text-gray-500">No detailed results available for this student's attempt.</p>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {studentAttemptDetails.map((attempt, attemptIndex) => (
                                        <div key={attemptIndex} className="border border-gray-200 rounded-lg p-4">
                                            <div className="flex justify-between items-center mb-4">
                                                <h4 className="text-lg font-medium text-gray-900">
                                                    Attempt {attemptIndex + 1}
                                                </h4>
                                                <div className="flex items-center gap-4 text-sm text-gray-600">
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="w-4 h-4" />
                                                        {attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleDateString() : 'N/A'}
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="w-4 h-4" />
                                                        {attempt.time_taken || 'N/A'} min
                                                    </span>
                                                    <span className="font-medium text-green-600">
                                                        Score: {attempt.score_percentage?.toFixed(1) || 0}%
                                                    </span>
                                                </div>
                                            </div>

                                            {attempt.detailed_results && attempt.detailed_results.length > 0 && (
                                                <div className="space-y-3">
                                                    {attempt.detailed_results.map((result, questionIndex) => (
                                                        <div key={questionIndex} className="border border-gray-100 rounded-lg p-4">
                                                            <div className="flex justify-between items-start mb-2">
                                                                <h5 className="font-medium text-gray-900">
                                                                    Question {questionIndex + 1}
                                                                </h5>
                                                                <div className={`flex items-center gap-1 ${
                                                                    result.is_correct ? 'text-green-600' : 'text-red-600'
                                                                }`}>
                                                                    {result.is_correct ? (
                                                                        <CheckCircle className="w-5 h-5" />
                                                                    ) : (
                                                                        <XCircle className="w-5 h-5" />
                                                                    )}
                                                                    <span className="text-sm font-medium">
                                                                        {result.is_correct ? 'Correct' : 'Incorrect'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            
                                                            <div className="mb-3">
                                                                <p className="text-gray-700 mb-2">
                                                                    {result.question_text || 'Question text not available'}
                                                                </p>
                                                            </div>

                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                <div>
                                                                    <label className="text-sm font-medium text-gray-600">Student's Answer:</label>
                                                                    <p className={`mt-1 p-2 rounded ${
                                                                        result.is_correct ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                                                                    }`}>
                                                                        {result.student_answer || result.selected_answer || 'No answer provided'}
                                                                    </p>
                                                                </div>
                                                                <div>
                                                                    <label className="text-sm font-medium text-gray-600">Correct Answer:</label>
                                                                    <p className="mt-1 p-2 rounded bg-gray-50 text-gray-800">
                                                                        {result.correct_answer_text || result.correct_answer || 'Not available'}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            {/* Audio-specific details for listening/speaking tests */}
                                                            {(result.question_type === 'audio' || result.question_type === 'listening' || result.question_type === 'speaking') && (
                                                                <div className="mt-4 space-y-3">
                                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                        <div>
                                                                            <label className="text-sm font-medium text-gray-600">Student Transcript:</label>
                                                                            <p className="mt-1 p-2 rounded bg-blue-50 text-blue-800">
                                                                                {result.student_text || result.student_answer || 'No transcript available'}
                                                                            </p>
                                                                        </div>
                                                                        <div>
                                                                            <label className="text-sm font-medium text-gray-600">Original Text:</label>
                                                                            <p className="mt-1 p-2 rounded bg-gray-50 text-gray-800">
                                                                                {result.original_text || result.correct_answer || 'Not available'}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                    
                                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                        <div>
                                                                            <label className="text-sm font-medium text-gray-600">Similarity Score:</label>
                                                                            <div className="mt-1 flex items-center gap-2">
                                                                                <div className="flex-1 bg-gray-200 rounded-full h-2">
                                                                                    <div 
                                                                                        className={`h-2 rounded-full ${
                                                                                            result.similarity_score >= 70 ? 'bg-green-500' : 
                                                                                            result.similarity_score >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                                                                                        }`}
                                                                                        style={{ width: `${Math.min(result.similarity_score || 0, 100)}%` }}
                                                                                    ></div>
                                                                                </div>
                                                                                <span className="text-sm font-medium text-gray-700">
                                                                                    {result.similarity_score?.toFixed(1) || 0}%
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                        <div>
                                                                            <label className="text-sm font-medium text-gray-600">Student Audio:</label>
                                                                            {result.student_audio_url ? (
                                                                                <div className="mt-1">
                                                                                    <audio controls className="w-full">
                                                                                        <source src={result.student_audio_url} type="audio/webm" />
                                                                                        <source src={result.student_audio_url} type="audio/wav" />
                                                                                        <source src={result.student_audio_url} type="audio/mp3" />
                                                                                        Your browser does not support the audio element.
                                                                                    </audio>
                                                                                    <a 
                                                                                        href={result.student_audio_url} 
                                                                                        target="_blank" 
                                                                                        rel="noopener noreferrer"
                                                                                        className="text-xs text-blue-600 hover:text-blue-800 mt-1 inline-block"
                                                                                    >
                                                                                        Download Audio
                                                                                    </a>
                                                                                </div>
                                                                            ) : (
                                                                                <p className="mt-1 text-sm text-gray-500">No audio available</p>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </>
    );
};

export default ResultsManagement;

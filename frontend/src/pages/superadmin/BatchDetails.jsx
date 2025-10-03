import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotification } from '../../contexts/NotificationContext';


import LoadingSpinner from '../../components/common/LoadingSpinner';
import UploadPreviewModal from '../../components/common/UploadPreviewModal';
import CredentialsDisplayModal from '../../components/common/CredentialsDisplayModal';
import StudentUploadVerificationModal from '../../components/common/StudentUploadVerificationModal';
import ErrorDisplayModal from '../../components/common/ErrorDisplayModal';
import api, { getBatchCourses } from '../../services/api';
import { Users, ArrowLeft, Upload, Edit, Trash2, Download, X, Save, User, Mail, Key, Building, Book, ListChecks, BarChart2, CheckCircle, XCircle, Shield, MessageSquare, Send } from 'lucide-react';
import { useDropzone } from 'react-dropzone';

const BatchDetails = () => {
    const { batchId } = useParams();
    const [batchInfo, setBatchInfo] = useState(null);
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const { success, error } = useNotification();

    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [previewData, setPreviewData] = useState([]);
    const [originalFile, setOriginalFile] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [createdStudents, setCreatedStudents] = useState([]);
    const [isCredentialsModalOpen, setIsCredentialsModalOpen] = useState(false);
    
    // CRUD states
    const [editingStudent, setEditingStudent] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editFormData, setEditFormData] = useState({});

    // New state for modals
    const [isModulesModalOpen, setIsModulesModalOpen] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [isStudentModulesModalOpen, setIsStudentModulesModalOpen] = useState(false);
    const [studentModulesData, setStudentModulesData] = useState([]);
    const [studentModulesLoading, setStudentModulesLoading] = useState(false);
    const [studentModulesError, setStudentModulesError] = useState(null);
    const [selectedModule, setSelectedModule] = useState(null);
    const [isModuleResultsModalOpen, setIsModuleResultsModalOpen] = useState(false);

    const [isStudentUploadModalOpen, setIsStudentUploadModalOpen] = useState(false);
    const [selectedCourseIds, setSelectedCourseIds] = useState([]);
    const [uploadFile, setUploadFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [batchCourses, setBatchCourses] = useState([]);

    const [studentForm, setStudentForm] = useState({ name: '', rollNumber: '', email: '', mobile: '', courseId: '' });
    const [addingStudent, setAddingStudent] = useState(false);
    
    // Verification modal state
    const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);
    const [lastUploadedStudents, setLastUploadedStudents] = useState([]);
    
    // Error modal state
    const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
    const [detailedErrors, setDetailedErrors] = useState([]);
    
    // Email/SMS sending state
    const [isSendingEmails, setIsSendingEmails] = useState(false);
    const [isSendingSms, setIsSendingSms] = useState(false);
    const [emailProgress, setEmailProgress] = useState(0);
    const [smsProgress, setSmsProgress] = useState(0);
    const [sendingStatus, setSendingStatus] = useState('');

    const fetchBatchDetails = useCallback(async () => {
        try {
            setLoading(true);
            const res = await api.get(`/batch-management/batch/${batchId}/students`);
            setBatchInfo(res.data.batch_info);
            setStudents(res.data.data);
        } catch (err) {
            error('Failed to fetch batch details.');
        } finally {
            setLoading(false);
        }
    }, [batchId]);

    useEffect(() => {
        fetchBatchDetails();
    }, [fetchBatchDetails]);

    useEffect(() => {
        if (batchInfo?.campus_ids && batchInfo.campus_ids.length > 0) {
            getBatchCourses(batchInfo.campus_ids).then(res => {
                setBatchCourses(res.data.data || []);
            }).catch(() => setBatchCourses([]));
        }
    }, [batchInfo]);

    const handleFileDrop = async (acceptedFiles) => {
        const file = acceptedFiles[0];
        if (!file) return;
        
        setOriginalFile(file);
        const formData = new FormData();
        formData.append('file', file);
        // Always send a valid campus_id for validation
        let campusId = batchInfo?.campus_id;
        if (!campusId && Array.isArray(batchInfo?.campus_ids) && batchInfo.campus_ids.length > 0) {
            campusId = batchInfo.campus_ids[0];
        }
        if (campusId) {
            formData.append('campus_id', campusId);
        }

        try {
            const res = await api.post('/batch-management/validate-student-upload', formData);
            if(res.data.success){
                setPreviewData(res.data.data);
                setIsUploadModalOpen(true);
            } else {
                error(res.data.message || 'File validation failed.');
            }
        } catch (err) {
            error(err.response?.data?.message || 'An error occurred during file validation.');
        }
    };

    const handleConfirmUpload = async () => {
        if (!originalFile) {
            error("No file selected for upload.");
            return;
        }
        setIsSubmitting(true);
        try {
            const formData = new FormData();
            formData.append('student_file', originalFile);
            const response = await api.post(`/batch-management/${batchId}/add-students`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            
            // Handle both success and partial success (207 status)
            if (response.data.success || response.status === 207) {
                const createdStudents = response.data.data?.created_students || response.data.created_students || [];
                const uploadErrors = response.data.errors || [];
                
                if (createdStudents.length > 0) {
                    success(`Successfully uploaded ${createdStudents.length} student(s).`);
                    setCreatedStudents(createdStudents);
                    setLastUploadedStudents(createdStudents);
                    setIsCredentialsModalOpen(true);
                    setIsUploadModalOpen(false);
                    fetchBatchDetails();
                }
                
                // Show detailed error messages if any
                if (uploadErrors.length > 0) {
                    if (uploadErrors.length > 1) {
                        setDetailedErrors(uploadErrors);
                        setIsErrorModalOpen(true);
                    } else {
                        error(`Upload error: ${uploadErrors[0]}`);
                    }
                }
                
                // If no students were created, show general error
                if (createdStudents.length === 0) {
                    error('No students were uploaded. Please check your file and try again.');
                }
            } else {
                error(response.data.message || 'Failed to add students.');
            }
        } catch (err) {
            console.error('Upload error:', err);
            
            // Handle different types of errors
            if (err.response?.status === 207) {
                // Partial success - some students uploaded, some failed
                const responseData = err.response.data;
                const createdStudents = responseData.data?.created_students || responseData.created_students || [];
                const uploadErrors = responseData.errors || [];
                
                if (createdStudents.length > 0) {
                    success(`Partially successful: ${createdStudents.length} student(s) uploaded.`);
                    setCreatedStudents(createdStudents);
                    setLastUploadedStudents(createdStudents);
                    setIsCredentialsModalOpen(true);
                    setIsUploadModalOpen(false);
                    fetchBatchDetails();
                }
                
                if (uploadErrors.length > 0) {
                    if (uploadErrors.length > 1) {
                        setDetailedErrors(uploadErrors);
                        setIsErrorModalOpen(true);
                    } else {
                        error(`Upload error: ${uploadErrors[0]}`);
                    }
                }
            } else if (err.response?.data?.errors && Array.isArray(err.response.data.errors)) {
                // Multiple validation errors
                const errorMessages = err.response.data.errors;
                if (errorMessages.length > 1) {
                    setDetailedErrors(errorMessages);
                    setIsErrorModalOpen(true);
                } else {
                    error(`Validation error: ${errorMessages[0]}`);
                }
            } else if (err.response?.data?.message) {
                // Single error message
                error(err.response.data.message);
            } else {
                error('An error occurred during upload. Please check your file format and try again.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDownloadTemplate = () => {
        // Get campus and course information for the template
        const campusName = batchInfo?.campus_name || 'Campus Name';
        const courseName = batchInfo?.course_name || 'Course Name';
        
        const headers = ['Campus Name', 'Course Name', 'Student Name', 'Roll Number', 'Email', 'Mobile Number'];
        const exampleRow = [campusName, courseName, 'John Doe', 'ROLL001', 'john.doe@example.com', '1234567890'];
        
        let csvRows = [headers, exampleRow];
        let csvString = csvRows.map(row => row.map(val => `"${val}"`).join(',')).join('\r\n');
        
        const encodedUri = "data:text/csv;charset=utf-8," + encodeURIComponent(csvString);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `student_upload_template_${batchInfo?.name || 'batch'}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        success('Template downloaded successfully!');
    };

    // CRUD Operations
    const handleEditStudent = (student) => {
        setEditingStudent(student);
        setEditFormData({
            name: student.name,
            roll_number: student.roll_number,
            email: student.email,
            mobile_number: student.mobile_number || ''
        });
        setIsEditModalOpen(true);
    };

    const handleUpdateStudent = async () => {
        try {
            await api.put(`/batch-management/student/${editingStudent.id}`, editFormData);
            success('Student updated successfully!');
            setIsEditModalOpen(false);
            setEditingStudent(null);
            fetchBatchDetails();
        } catch (err) {
            error(err.response?.data?.message || 'Failed to update student.');
        }
    };

    const handleDeleteStudent = async (studentId) => {
        if (window.confirm('Are you sure you want to delete this student? This action cannot be undone.')) {
            try {
                await api.delete(`/batch-management/student/${studentId}`);
                success('Student deleted successfully!');
                fetchBatchDetails();
            } catch (err) {
                error(err.response?.data?.message || 'Failed to delete student.');
            }
        }
    };

    // Fetch per-student modules when modal opens (use new endpoint)
    useEffect(() => {
        if (isStudentModulesModalOpen && selectedStudent) {
            setStudentModulesLoading(true);
            setStudentModulesError(null);
            api.get(`/superadmin/student-assigned-modules?student=${encodeURIComponent(selectedStudent.email)}&batch=${batchId}`)
                .then(res => {
                    setStudentModulesData(res.data.data || []);
                })
                .catch(() => setStudentModulesError('Failed to load module analytics.'))
                .finally(() => setStudentModulesLoading(false));
        }
    }, [isStudentModulesModalOpen, selectedStudent, batchId]);

    const handleOpenStudentUploadModal = () => {
        setIsStudentUploadModalOpen(true);
        setSelectedCourseIds([]);
        setUploadFile(null);
    };

    const handleCloseStudentUploadModal = () => {
        setIsStudentUploadModalOpen(false);
        setSelectedCourseIds([]);
        setUploadFile(null);
    };

    const handleCourseToggle = (id) => {
        setSelectedCourseIds(prev => prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]);
    };

    const handleStudentFileDrop = (acceptedFiles) => {
        setUploadFile(acceptedFiles[0]);
    };

    const handleStudentUpload = async () => {
        if (!uploadFile) {
            error('Please select a file to upload.');
            return;
        }
        if (!selectedCourseIds.length) {
            error('Please select at least one course.');
            return;
        }
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', uploadFile);
            formData.append('batch_id', batchId);
            selectedCourseIds.forEach(cid => formData.append('course_ids', cid));
            const res = await api.post('/batch-management/upload-students', formData);
            
            // Handle both success and partial success (207 status)
            if (res.data.success || res.status === 207) {
                const createdStudents = res.data.data?.created_students || res.data.created_students || [];
                const uploadErrors = res.data.errors || [];
                
                if (createdStudents.length > 0) {
                    success(`Successfully uploaded ${createdStudents.length} student(s).`);
                    setCreatedStudents(createdStudents);
                    setLastUploadedStudents(createdStudents);
                    setIsCredentialsModalOpen(true);
                    handleCloseStudentUploadModal();
                    fetchBatchDetails();
                }
                
                // Show detailed error messages if any
                if (uploadErrors.length > 0) {
                    if (uploadErrors.length > 1) {
                        setDetailedErrors(uploadErrors);
                        setIsErrorModalOpen(true);
                    } else {
                        error(`Upload error: ${uploadErrors[0]}`);
                    }
                }
                
                // If no students were created, show general error
                if (createdStudents.length === 0) {
                    error('No students were uploaded. Please check your file and try again.');
                }
            } else {
                error(res.data.message || 'Failed to upload students.');
            }
        } catch (err) {
            console.error('Upload error:', err);
            
            // Handle different types of errors
            if (err.response?.status === 207) {
                // Partial success - some students uploaded, some failed
                const responseData = err.response.data;
                const createdStudents = responseData.data?.created_students || responseData.created_students || [];
                const uploadErrors = responseData.errors || [];
                
                if (createdStudents.length > 0) {
                    success(`Partially successful: ${createdStudents.length} student(s) uploaded.`);
                    setCreatedStudents(createdStudents);
                    setLastUploadedStudents(createdStudents);
                    setIsCredentialsModalOpen(true);
                    handleCloseStudentUploadModal();
                    fetchBatchDetails();
                }
                
                if (uploadErrors.length > 0) {
                    if (uploadErrors.length > 1) {
                        setDetailedErrors(uploadErrors);
                        setIsErrorModalOpen(true);
                    } else {
                        error(`Upload error: ${uploadErrors[0]}`);
                    }
                }
            } else if (err.response?.data?.errors && Array.isArray(err.response.data.errors)) {
                // Multiple validation errors
                const errorMessages = err.response.data.errors;
                if (errorMessages.length > 1) {
                    setDetailedErrors(errorMessages);
                    setIsErrorModalOpen(true);
                } else {
                    error(`Validation error: ${errorMessages[0]}`);
                }
            } else if (err.response?.data?.message) {
                // Single error message
                error(err.response.data.message);
            } else {
                error('An error occurred during upload. Please check your file format and try again.');
            }
        } finally {
            setUploading(false);
        }
    };

    const handleDownloadStudentTemplate = () => {
        const headers = ['Student Name', 'Roll Number', 'Email', 'Mobile Number'];
        const exampleRow = ['John Doe', 'ROLL001', 'john.doe@email.com', '1234567890'];
        let csvRows = [headers, exampleRow];
        let csvString = csvRows.map(row => row.map(val => `"${val}"`).join(',')).join('\r\n');
        const encodedUri = "data:text/csv;charset=utf-8," + encodeURIComponent(csvString);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `student_upload_template.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        success('Template downloaded successfully!');
    };

    // Always filter batchCourses by batchInfo.course_ids for course options
    const courseOptions = batchCourses.filter(course => (batchInfo?.course_ids || []).includes(course.id));

    const handleStudentFormChange = (e) => {
        const { name, value } = e.target;
        setStudentForm(prev => ({ ...prev, [name]: value }));
    };

    const handleAddStudent = async () => {
        if (!studentForm.name || !studentForm.rollNumber || !studentForm.email || !studentForm.courseId) {
            error('Please fill all required fields.');
            return;
        }
        setAddingStudent(true);
        try {
            const res = await api.post('/batch-management/add-student', {
                batch_id: batchId,
                course_id: studentForm.courseId,
                name: studentForm.name,
                roll_number: studentForm.rollNumber,
                email: studentForm.email,
                mobile_number: studentForm.mobile,
            });
            if (res.data.success) {
                success(res.data.message || 'Student added successfully!');
                setCreatedStudents(res.data.created_students ? res.data.created_students : []);
                setIsCredentialsModalOpen(true);
                setStudentForm({ name: '', rollNumber: '', email: '', mobile: '', courseId: '' });
                setIsStudentUploadModalOpen(false);
                fetchBatchDetails();
            } else {
                error(res.data.message || 'Failed to add student.');
            }
        } catch (err) {
            console.error('Add student error:', err);
            if (err.response?.data?.message) {
                error(err.response.data.message);
            } else {
                error('An error occurred while adding student.');
            }
        } finally {
            setAddingStudent(false);
        }
    };

    // Email and SMS sending functions
    const handleSendEmails = async () => {
        if (students.length === 0) {
            error('No students found in this batch.');
            return;
        }

        const studentsWithEmail = students.filter(s => s.email);
        if (studentsWithEmail.length === 0) {
            error('No students with email addresses found in this batch.');
            return;
        }

        setIsSendingEmails(true);
        setEmailProgress(0);
        setSendingStatus('Preparing to send emails...');

        try {
            // Simulate progress for better UX
            setEmailProgress(25);
            setSendingStatus('Sending emails to students...');
            
            const response = await api.post(`/batch-management/batch/${batchId}/send-emails`);
            
            setEmailProgress(75);
            setSendingStatus('Processing email responses...');
            
            if (response.data.success) {
                const successfulCount = response.data.successful_emails || studentsWithEmail.length;
                const failedCount = response.data.failed_emails || 0;
                
                setEmailProgress(100);
                setSendingStatus(`Emails sent successfully! ${successfulCount} sent, ${failedCount} failed`);
                
                if (successfulCount > 0) {
                    success(`Successfully sent emails to ${successfulCount} students!`);
                }
                if (failedCount > 0) {
                    error(`${failedCount} emails failed to send.`);
                }
            } else {
                setEmailProgress(100);
                setSendingStatus('Email sending failed.');
                error(response.data.message || 'Failed to send emails.');
            }
        } catch (err) {
            console.error('Email sending error:', err);
            setEmailProgress(100);
            setSendingStatus('Email sending failed.');
            error(err.response?.data?.message || 'Failed to send emails.');
        } finally {
            setIsSendingEmails(false);
            setTimeout(() => {
                setSendingStatus('');
                setEmailProgress(0);
            }, 5000);
        }
    };

    const handleSendSms = async () => {
        if (students.length === 0) {
            error('No students found in this batch.');
            return;
        }

        const studentsWithMobile = students.filter(s => s.mobile_number);
        if (studentsWithMobile.length === 0) {
            error('No students with mobile numbers found in this batch.');
            return;
        }

        setIsSendingSms(true);
        setSmsProgress(0);
        setSendingStatus('Preparing to send SMS...');

        try {
            // Simulate progress for better UX
            setSmsProgress(25);
            setSendingStatus('Sending SMS to students...');
            
            const response = await api.post(`/batch-management/batch/${batchId}/send-sms`);
            
            setSmsProgress(75);
            setSendingStatus('Processing SMS responses...');
            
            if (response.data.success) {
                const successfulCount = response.data.successful_sms || studentsWithMobile.length;
                const failedCount = response.data.failed_sms || 0;
                
                setSmsProgress(100);
                setSendingStatus(`SMS sent successfully! ${successfulCount} sent, ${failedCount} failed`);
                
                if (successfulCount > 0) {
                    success(`Successfully sent SMS to ${successfulCount} students!`);
                }
                if (failedCount > 0) {
                    error(`${failedCount} SMS failed to send.`);
                }
            } else {
                setSmsProgress(100);
                setSendingStatus('SMS sending failed.');
                error(response.data.message || 'Failed to send SMS.');
            }
        } catch (err) {
            console.error('SMS sending error:', err);
            setSmsProgress(100);
            setSendingStatus('SMS sending failed.');
            error(err.response?.data?.message || 'Failed to send SMS.');
        } finally {
            setIsSendingSms(false);
            setTimeout(() => {
                setSendingStatus('');
                setSmsProgress(0);
            }, 5000);
        }
    };

    if (loading) {
        return <div className="flex justify-center items-center h-screen"><LoadingSpinner /></div>;
    }

    return (
        <>
        <main className="px-6 lg:px-10 py-12">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                        <div className="flex justify-between items-center mb-8">
                            <div>
                                <Link to="/superadmin/batches" className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-2">
                                    <ArrowLeft size={16} />
                                    Back to Batches
                                </Link>
                                <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">{batchInfo?.name}</h1>
                                <p className="mt-1 text-lg text-gray-600">
                                    {batchInfo?.campus_name} &bull; {batchInfo?.course_name}
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={handleOpenStudentUploadModal}
                                    className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                                >
                                    <Upload className="mr-2 h-5 w-5" />
                                    Add Students
                                </button>
                                {lastUploadedStudents.length > 0 && (
                                    <button
                                        onClick={() => setIsVerificationModalOpen(true)}
                                        className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                                    >
                                        <Shield className="mr-2 h-5 w-5" />
                                        Verify Upload
                                    </button>
                                )}
                                <button
                                    onClick={handleSendEmails}
                                    disabled={isSendingEmails || students.length === 0}
                                    className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Mail className="mr-2 h-5 w-5" />
                                    {isSendingEmails ? 'Sending Emails...' : 'Send Emails'}
                                </button>
                                <button
                                    onClick={handleSendSms}
                                    disabled={isSendingSms || students.length === 0}
                                    className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <MessageSquare className="mr-2 h-5 w-5" />
                                    {isSendingSms ? 'Sending SMS...' : 'Send SMS'}
                                </button>
                            </div>
                        </div>

                        {/* Email/SMS Progress Indicator */}
                        {(isSendingEmails || isSendingSms || sendingStatus) && (
                            <div className="mb-6 bg-white rounded-lg shadow-md p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-lg font-semibold text-gray-900">
                                        {isSendingEmails ? 'Sending Emails' : isSendingSms ? 'Sending SMS' : 'Status'}
                                    </h3>
                                    <span className="text-sm text-gray-500">
                                        {isSendingEmails ? `${emailProgress}%` : isSendingSms ? `${smsProgress}%` : ''}
                                    </span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                                    <div 
                                        className={`h-2 rounded-full transition-all duration-300 ${
                                            isSendingEmails ? 'bg-blue-600' : 'bg-green-600'
                                        }`}
                                        style={{ 
                                            width: `${isSendingEmails ? emailProgress : smsProgress}%` 
                                        }}
                                    ></div>
                                </div>
                                <p className="text-sm text-gray-600">{sendingStatus}</p>
                            </div>
                        )}

                        <div className="bg-white rounded-2xl shadow-lg flex justify-center">
                            <div className="w-full max-w-6xl">
                                <div className="p-6 flex justify-between items-center">
                                    <div>
                                        <h3 className="text-xl font-semibold flex items-center gap-2">
                                            <Users />
                                            Students in this Batch ({students.length})
                                        </h3>
                                        <div className="mt-2 flex gap-4 text-sm text-gray-600">
                                            <span className="flex items-center gap-1">
                                                <Mail className="w-4 h-4" />
                                                {students.filter(s => s.email).length} with email
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <MessageSquare className="w-4 h-4" />
                                                {students.filter(s => s.mobile_number).length} with mobile
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200 rounded-xl overflow-hidden mt-6">
                                        <thead className="bg-gradient-to-r from-blue-700 to-black">
                                            <tr>
                                                <th className="px-4 py-2 text-left text-xs font-bold text-white uppercase tracking-wider">Student Name</th>
                                                <th className="px-4 py-2 text-left text-xs font-bold text-white uppercase tracking-wider">Roll Number</th>
                                                <th className="px-4 py-2 text-left text-xs font-bold text-white uppercase tracking-wider">Email</th>
                                                <th className="px-4 py-2 text-left text-xs font-bold text-white uppercase tracking-wider">Mobile</th>
                                                <th className="px-4 py-2 text-left text-xs font-bold text-white uppercase tracking-wider">Campus</th>
                                                <th className="px-4 py-2 text-left text-xs font-bold text-white uppercase tracking-wider">Course</th>
                                                <th className="px-4 py-2 text-center text-xs font-bold text-white uppercase tracking-wider">Actions</th>
                                                <th className="px-4 py-2 text-center text-xs font-bold text-white uppercase tracking-wider">Modules</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {students.length === 0 ? (
                                                <tr><td colSpan="8" className="text-center text-gray-500 py-8">No students found.</td></tr>
                                            ) : students.map((student, idx) => (
                                                <tr key={student.id} className={idx % 2 === 0 ? 'bg-blue-50' : 'bg-white'}>
                                                    <td className="px-4 py-2 text-sm font-bold text-blue-900">{student.name}</td>
                                                    <td className="px-4 py-2 text-sm text-black">{student.roll_number}</td>
                                                    <td className="px-4 py-2 text-sm text-blue-700">{student.email}</td>
                                                    <td className="px-4 py-2 text-sm text-blue-600">{student.mobile_number}</td>
                                                    <td className="px-4 py-2 text-sm text-black">{student.campus_name}</td>
                                                    <td className="px-4 py-2 text-sm text-black">{student.course_name}</td>
                                                    <td className="px-4 py-2 text-center">
                                                        <button onClick={() => handleEditStudent(student)} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 mr-2"><Edit size={14}/> Edit</button>
                                                        <button onClick={() => handleDeleteStudent(student.id)} className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"><Trash2 size={14}/> Delete</button>
                                                    </td>
                                                    <td className="px-4 py-2 text-center">
                                                        <button onClick={() => { setSelectedStudent(student); setIsStudentModulesModalOpen(true); }} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-700 text-white rounded hover:bg-blue-900"><ListChecks size={14}/> View Modules</button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </main>
            {/* Student Modules Modal */}
            {isStudentModulesModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
                <div className="bg-white rounded-2xl shadow-xl p-8 max-w-2xl w-full relative">
                  <button onClick={() => setIsStudentModulesModalOpen(false)} className="absolute top-3 right-3 text-gray-500 hover:text-red-600 text-xl">&times;</button>
                  <h2 className="text-2xl font-bold mb-4">Assigned Modules for {selectedStudent?.name}</h2>
                  {studentModulesLoading ? (
                    <div className="flex justify-center items-center h-32"><LoadingSpinner /></div>
                  ) : studentModulesError ? (
                    <div className="text-red-600 text-center">{studentModulesError}</div>
                  ) : (
                    <div className="overflow-x-auto max-h-96">
                      {studentModulesData.length === 0 ? (
                        <div className="text-gray-500 text-center py-8">No modules assigned.</div>
                      ) : (
                        <table className="min-w-full divide-y divide-gray-200 rounded-xl overflow-hidden">
                          <thead className="bg-blue-700">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-bold text-white uppercase tracking-wider">Module</th>
                              <th className="px-4 py-2 text-left text-xs font-bold text-white uppercase tracking-wider">Level</th>
                              <th className="px-4 py-2 text-left text-xs font-bold text-white uppercase tracking-wider">Test Name</th>
                              <th className="px-4 py-2 text-left text-xs font-bold text-white uppercase tracking-wider">Status</th>
                              <th className="px-4 py-2 text-left text-xs font-bold text-white uppercase tracking-wider">Attempts</th>
                              <th className="px-4 py-2 text-left text-xs font-bold text-white uppercase tracking-wider">Best Score</th>
                            </tr>
                          </thead>
                          <tbody>
                            {studentModulesData.map((mod, idx) => (
                              <tr key={mod.test_id || idx} className={idx % 2 === 0 ? 'bg-blue-50' : 'bg-white'}>
                                <td className="px-4 py-2 text-sm">{mod.module_display_name}</td>
                                <td className="px-4 py-2 text-sm">{mod.level_display_name}</td>
                                <td className="px-4 py-2 text-sm">{mod.test_name}</td>
                                <td className="px-4 py-2 text-sm capitalize">{mod.status}</td>
                                <td className="px-4 py-2 text-sm">{mod.total_attempts}</td>
                                <td className="px-4 py-2 text-sm">{mod.best_score}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            {isStudentUploadModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
                    <div className="bg-white rounded-2xl shadow-xl p-8 max-w-2xl w-full relative">
                        <button onClick={handleCloseStudentUploadModal} className="absolute top-3 right-3 text-gray-500 hover:text-red-600 text-xl">&times;</button>
                        <h2 className="text-2xl font-bold mb-4">Add Students to Batch</h2>
                        
                        {/* File Upload Section */}
                        <div className="mb-6">
                            <h3 className="text-lg font-semibold mb-3">Upload Students File</h3>
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                                <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                                <p className="text-sm text-gray-600 mb-2">
                                    Drag and drop a CSV file here, or click to select
                                </p>
                                <input
                                    type="file"
                                    accept=".csv,.xlsx"
                                    onChange={(e) => setUploadFile(e.target.files[0])}
                                    className="hidden"
                                    id="file-upload"
                                />
                                <label
                                    htmlFor="file-upload"
                                    className="cursor-pointer bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                                >
                                    Choose File
                                </label>
                                {uploadFile && (
                                    <p className="mt-2 text-sm text-green-600">
                                        Selected: {uploadFile.name}
                                    </p>
                                )}
                            </div>
                            
                            {/* Course Selection */}
                            <div className="mt-4">
                                <label className="block font-semibold mb-2">Select Courses for Students</label>
                                <div className="space-y-2">
                                    {courseOptions.map(course => (
                                        <label key={course.id} className="flex items-center">
                                            <input
                                                type="checkbox"
                                                checked={selectedCourseIds.includes(course.id)}
                                                onChange={() => handleCourseToggle(course.id)}
                                                className="mr-2"
                                            />
                                            {course.name}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="mt-4 flex gap-2">
                                <button
                                    onClick={handleStudentUpload}
                                    disabled={!uploadFile || selectedCourseIds.length === 0 || uploading}
                                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
                                >
                                    {uploading ? 'Uploading...' : 'Upload Students'}
                                </button>
                                <button
                                    onClick={handleDownloadStudentTemplate}
                                    className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
                                >
                                    Download Template
                                </button>
                            </div>
                        </div>
                        
                        <div className="border-t pt-6">
                            <h3 className="text-lg font-semibold mb-3">Add Single Student</h3>
                        <div className="mb-4">
                            <label className="block font-semibold mb-1">Select Course</label>
                            <select
                                name="courseId"
                                value={studentForm.courseId}
                                onChange={handleStudentFormChange}
                                className="w-full px-3 py-2 border rounded mb-2"
                            >
                                <option value="">-- Select Course --</option>
                                {courseOptions.map(course => (
                                    <option key={course.id} value={course.id}>{course.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="mb-4">
                            <label className="block font-semibold mb-1">Student Name</label>
                            <input
                                type="text"
                                name="name"
                                value={studentForm.name}
                                onChange={handleStudentFormChange}
                                className="w-full px-3 py-2 border rounded"
                            />
                        </div>
                        <div className="mb-4">
                            <label className="block font-semibold mb-1">Roll Number</label>
                            <input
                                type="text"
                                name="rollNumber"
                                value={studentForm.rollNumber}
                                onChange={handleStudentFormChange}
                                className="w-full px-3 py-2 border rounded"
                            />
                        </div>
                        <div className="mb-4">
                            <label className="block font-semibold mb-1">Email</label>
                            <input
                                type="email"
                                name="email"
                                value={studentForm.email}
                                onChange={handleStudentFormChange}
                                className="w-full px-3 py-2 border rounded"
                            />
                        </div>
                        <div className="mb-4">
                            <label className="block font-semibold mb-1">Mobile Number</label>
                            <input
                                type="text"
                                name="mobile"
                                value={studentForm.mobile}
                                onChange={handleStudentFormChange}
                                className="w-full px-3 py-2 border rounded"
                            />
                        </div>
                        <button
                            onClick={handleAddStudent}
                            disabled={addingStudent}
                            className="w-full bg-indigo-600 text-white font-semibold py-2 rounded-lg shadow hover:bg-indigo-700 transition disabled:opacity-50"
                        >
                            {addingStudent ? 'Adding...' : 'Add Student'}
                        </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Upload Preview Modal */}
            {isUploadModalOpen && (
                <UploadPreviewModal
                    isOpen={isUploadModalOpen}
                    onClose={() => setIsUploadModalOpen(false)}
                    previewData={previewData}
                    onConfirm={handleConfirmUpload}
                    isSubmitting={isSubmitting}
                    onDownloadTemplate={handleDownloadTemplate}
                />
            )}

            {/* Credentials Display Modal */}
            {isCredentialsModalOpen && (
                <CredentialsDisplayModal
                    isOpen={isCredentialsModalOpen}
                    onClose={() => setIsCredentialsModalOpen(false)}
                    createdStudents={createdStudents}
                    title="Student Credentials"
                />
            )}

            {/* Student Upload Verification Modal */}
            {isVerificationModalOpen && (
                <StudentUploadVerificationModal
                    isOpen={isVerificationModalOpen}
                    onClose={() => setIsVerificationModalOpen(false)}
                    batchId={batchId}
                    uploadedStudents={lastUploadedStudents}
                    onVerificationComplete={fetchBatchDetails}
                />
            )}

            {/* Edit Student Modal */}
            {isEditModalOpen && editingStudent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
                    <div className="bg-white rounded-2xl shadow-xl p-8 max-w-lg w-full relative">
                        <button onClick={() => setIsEditModalOpen(false)} className="absolute top-3 right-3 text-gray-500 hover:text-red-600 text-xl">&times;</button>
                        <h2 className="text-2xl font-bold mb-4">Edit Student</h2>
                        <div className="mb-4">
                            <label className="block font-semibold mb-1">Student Name</label>
                            <input
                                type="text"
                                value={editFormData.name}
                                onChange={(e) => setEditFormData({...editFormData, name: e.target.value})}
                                className="w-full px-3 py-2 border rounded"
                            />
                        </div>
                        <div className="mb-4">
                            <label className="block font-semibold mb-1">Roll Number</label>
                            <input
                                type="text"
                                value={editFormData.roll_number}
                                onChange={(e) => setEditFormData({...editFormData, roll_number: e.target.value})}
                                className="w-full px-3 py-2 border rounded"
                            />
                        </div>
                        <div className="mb-4">
                            <label className="block font-semibold mb-1">Email</label>
                            <input
                                type="email"
                                value={editFormData.email}
                                onChange={(e) => setEditFormData({...editFormData, email: e.target.value})}
                                className="w-full px-3 py-2 border rounded"
                            />
                        </div>
                        <div className="mb-4">
                            <label className="block font-semibold mb-1">Mobile Number</label>
                            <input
                                type="text"
                                value={editFormData.mobile_number}
                                onChange={(e) => setEditFormData({...editFormData, mobile_number: e.target.value})}
                                className="w-full px-3 py-2 border rounded"
                            />
                        </div>
                        <button
                            onClick={handleUpdateStudent}
                            className="w-full bg-indigo-600 text-white font-semibold py-2 rounded-lg shadow hover:bg-indigo-700 transition"
                        >
                            Update Student
                        </button>
                    </div>
                </div>
            )}

            {/* Error Display Modal */}
            <ErrorDisplayModal
                isOpen={isErrorModalOpen}
                onClose={() => setIsErrorModalOpen(false)}
                errors={detailedErrors}
                title="Upload Errors"
            />
        </>
    );
};

export default BatchDetails; 
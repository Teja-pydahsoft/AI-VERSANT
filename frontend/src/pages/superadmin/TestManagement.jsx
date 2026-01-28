import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useForm, Controller } from 'react-hook-form'
import { useAuth } from '../../contexts/AuthContext'
import { useNotification } from '../../contexts/NotificationContext'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'


import LoadingSpinner from '../../components/common/LoadingSpinner'
import api from '../../services/api'
import { Upload, Plus, Trash2, ChevronLeft, ChevronRight, FileText, CheckCircle, Briefcase, Users, FileQuestion, Sparkles, Eye, Edit, MoreVertical, Play, Pause, AlertTriangle, ChevronDown, Code, Mic, AlertCircle, X, Shuffle, Download } from 'lucide-react'
import { MultiSelect } from 'react-multi-select-component'
import clsx from 'clsx'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { uploadModuleQuestions, getRandomQuestionsFromBank, createTestFromBank, getAllTests, getStudentCount } from '../../services/api'
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import Modal from '../../components/common/Modal';
import TestSummaryDisplay from './TestSummaryDisplay';
import MCQUpload from './MCQUpload';
import AudioUpload from './AudioUpload';
import SentenceUpload from './SentenceUpload';
import ReadingUpload from './ReadingUpload';
import TestQuestionUpload from './TestQuestionUpload';
import WritingUpload from './WritingUpload';
import TechnicalTestQuestionType from './TechnicalTestQuestionType';

// Config for modules and levels
const MODULE_CONFIG = {
  GRAMMAR: {
    label: 'Grammar',
    type: 'MCQ',
    levels: ['Noun', 'Pronoun', 'Verb', 'Adjective', 'Adverb', 'Preposition', 'Conjunction', 'Interjection'],
    uploadComponent: MCQUpload,
  },
  VOCABULARY: {
    label: 'Vocabulary',
    type: 'MCQ',
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    uploadComponent: MCQUpload,
  },
  READING: {
    label: 'Reading',
    type: 'MCQ',
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    uploadComponent: ReadingUpload,
  },
  LISTENING: {
    label: 'Listening',
    type: 'SENTENCE',
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    uploadComponent: SentenceUpload,
  },
  SPEAKING: {
    label: 'Speaking',
    type: 'SENTENCE',
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    uploadComponent: SentenceUpload,
  },
  WRITING: {
    label: 'Writing',
    type: 'PARAGRAPH',
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    uploadComponent: WritingUpload,
  },
  CRT: {
    label: 'CRT',
    type: 'MCQ',
    levels: ['Aptitude', 'Reasoning', 'Technical'],
    uploadComponent: MCQUpload,
  },
};

const TestManagement = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  const location = useLocation()
  const [view, setView] = useState('list')
  const [currentTestId, setCurrentTestId] = useState(null)
  const [tests, setTests] = useState([])
  const [loading, setLoading] = useState(true)
  const [processingTests, setProcessingTests] = useState(new Set())
  const { success, error } = useNotification()
  const { loading: isAuthLoading, user } = useAuth()
  const pollingIntervalRef = useRef(null)
  const [selectedTest, setSelectedTest] = useState(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [baseName, setBaseName] = useState('')
  const [sequence, setSequence] = useState(1)
  const [uploadedQuestions, setUploadedQuestions] = useState([])
  const [notifyModalOpen, setNotifyModalOpen] = useState(false)
  const [successModalOpen, setSuccessModalOpen] = useState(false)
  const [createdTestId, setCreatedTestId] = useState(null)
  const [notifyLoading, setNotifyLoading] = useState(false)
  const [notifyResults, setNotifyResults] = useState([])

  // Check if we're on the question-bank-upload route and set view accordingly
  useEffect(() => {
    if (location.pathname === '/superadmin/question-bank-upload') {
      setView('module-upload')
    }
  }, [location.pathname])

  const fetchTests = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get('/test-management/tests')
      setTests(res.data.data)
    } catch (err) {
      error("Failed to fetch tests.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isAuthLoading && view === 'list') {
      fetchTests()
    }
  }, [view, fetchTests, isAuthLoading])

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await api.get('/test-management/tests');
        const updatedTests = res.data.data;
        setTests(updatedTests);

        const stillProcessing = new Set();
        let allDone = true;

        processingTests.forEach(testId => {
          const matchingTest = updatedTests.find(t => t._id === testId);
          if (matchingTest && matchingTest.status === 'processing') {
            stillProcessing.add(testId);
            allDone = false;
          }
        });

        setProcessingTests(stillProcessing);

        if (allDone) {
          success("All pending tests have finished processing.");
        }
      } catch (err) {
        error("Could not update test statuses.");
      }
    };

    if (processingTests.size > 0 && !pollingIntervalRef.current) {
      pollingIntervalRef.current = setInterval(poll, 5000); // Poll every 5 seconds
    } else if (processingTests.size === 0 && pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    // Cleanup on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [processingTests]);

  const handleTestCreated = (newTestId) => {
    setView('list')
    setUploadedQuestions([]) // Reset uploaded questions when test is created
    if (newTestId) {
      setCreatedTestId(newTestId)
      setSuccessModalOpen(true)
      setProcessingTests(prev => new Set(prev).add(newTestId));
      // Manually add a placeholder to the list for immediate feedback
      setTests(prev => [
        {
          _id: newTestId,
          name: 'New Test (Processing...)',
          status: 'processing',
          question_count: 'N/A',
          campus_name: 'N/A',
          test_type: 'N/A'
        },
        ...prev
      ]);
    }
  }

  const handleViewTest = async (testId) => {
    if (!testId) {
      error("Cannot view test: Invalid Test ID provided.");
      return;
    }
    setIsPreviewLoading(true);
    setView('preview'); // Switch view immediately to show loading state
    try {
      const response = await api.get(`/test-management/tests/${testId}`);
      if (response.data.success) {
        console.log("Fetched Test Data:", JSON.stringify(response.data.data, null, 2));
        setSelectedTest(response.data.data);
      } else {
        error(response.data.message || 'Failed to fetch test details.');
        setView('list'); // Go back to list if fetch fails
      }
    } catch (err) {
      console.error("Error fetching test details:", err);
      error('An error occurred while fetching test details.');
      setView('list'); // Go back to list on error
    } finally {
      setIsPreviewLoading(false);
    }
  }

  const handleDeleteTest = async (testId) => {
    if (window.confirm('Are you sure you want to delete this test? This action cannot be undone.')) {
      try {
        await api.delete(`/test-management/tests/${testId}`)
        success("Test deleted successfully.")
        fetchTests() // Refresh the list
      } catch (err) {
        error(err.response?.data?.message || "Failed to delete test.")
      }
    }
  }

  const handleBackToList = () => {
    setView('list')
  }

  // Test email service handler
  const handleTestEmail = async () => {
    try {
      const testEmail = prompt('Enter test email address:', 'test@example.com');
      if (!testEmail) return;

      success('Testing email service...');
      const res = await api.post('/test-management/test-email', { email: testEmail });
      if (res.data && res.data.success) {
        success(`Test email sent successfully to ${testEmail}`);
      } else {
        error(res.data.message || 'Email test failed');
      }
    } catch (e) {
      error('Email test failed. Please try again.');
    }
  }

  // Fix audio URLs handler
  const handleFixAudioUrls = async () => {
    try {
      success('Fixing corrupted audio URLs...');
      const res = await api.post('/test-management/fix-audio-urls');
      if (res.data && res.data.success) {
        success(`Fixed ${res.data.fixed_count} tests with corrupted audio URLs`);
        // Refresh the test data
        fetchTests();
      } else {
        error(res.data.message || 'Failed to fix audio URLs');
      }
    } catch (e) {
      error('Failed to fix audio URLs. Please try again.');
    }
  }

  // Notify students handler
  const handleNotifyStudents = async () => {
    setNotifyModalOpen(true);
    setNotifyLoading(true);
    setNotifyResults([]);
    try {
      const res = await api.post(`/test-management/notify-students/${selectedTest._id}`);
      if (res.data && res.data.success) {
        setNotifyResults(res.data.results || []);
        success('Students notified successfully!');
      } else {
        error(res.data.message || 'Failed to notify students');
      }
    } catch (e) {
      error('Failed to notify students. Please try again.');
    } finally {
      setNotifyLoading(false);
    }
  }

  // Remind students handler
  const handleRemindStudents = async () => {
    const loadingToast = toast.loading('Sending test reminders...');
    try {
      const res = await api.post('/test-management/remind-students', {});
      if (res.data && res.data.success) {
        toast.success(res.data.message || 'Test reminders sent successfully!', { id: loadingToast });
        const data = res.data.data || {};
        if (data.total_sent > 0) {
          toast.success(`📱 ${data.total_sent} reminders sent!`);
        }
      } else {
        toast.error(res.data.message || 'Failed to send reminders', { id: loadingToast });
      }
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to send reminders. Please try again.', { id: loadingToast });
    }
  }

  const renderContent = () => {
    switch (view) {
      case 'create':
        return <TestCreationWizard onTestCreated={handleTestCreated} setView={setView} uploadedQuestions={uploadedQuestions} setUploadedQuestions={setUploadedQuestions} />
      case 'preview':
        if (isPreviewLoading) {
          return <div className="flex justify-center items-center h-screen"><LoadingSpinner /></div>;
        }
        return <TestPreviewView test={selectedTest} onBack={handleBackToList} onTestEmail={handleTestEmail} onFixAudioUrls={handleFixAudioUrls} onNotifyStudents={handleNotifyStudents} onRemindStudents={handleRemindStudents} />
      case 'module-upload':
        return <ModuleQuestionUpload onBack={() => setView('list')} />
      case 'list':
      default:
        return <TestListView tests={tests} loading={loading} setView={setView} onViewTest={handleViewTest} onDeleteTest={handleDeleteTest} onTestEmail={handleTestEmail} onFixAudioUrls={handleFixAudioUrls} user={user} />
    }
  }

  return (
    <main className="px-6 lg:px-10 py-12">
      {renderContent()}

      {/* Notify Students Modal */}
      {notifyModalOpen && (
        <Modal onClose={() => setNotifyModalOpen(false)} title="Notify Students">
          <div className="mb-4">
            <h3 className="font-semibold text-xl mb-4 text-center text-blue-700">Notification Status</h3>
            {notifyLoading ? (
              <div className="text-blue-600 text-center py-8">Sending notifications...</div>
            ) : (
              <div className="overflow-x-auto rounded-lg shadow">
                <table className="min-w-full text-sm border rounded-lg bg-white">
                  <thead className="bg-blue-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Name</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Email</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Mobile</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Test Status</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Email Notification</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">SMS Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notifyResults.map((s, idx) => (
                      <tr key={s.email} className={idx % 2 === 0 ? 'bg-white' : 'bg-blue-50'}>
                        <td className="px-4 py-2 border-b">{s.name}</td>
                        <td className="px-4 py-2 border-b">{s.email}</td>
                        <td className="px-4 py-2 border-b">{s.mobile_number || '-'}</td>
                        <td className="px-4 py-2 border-b">
                          {s.test_status === 'completed' ? (
                            <span className="text-green-600 font-semibold">Completed</span>
                          ) : (
                            <span className="text-green-600 font-semibold">Pending</span>
                          )}
                        </td>
                        <td className="px-4 py-2 border-b">
                          {s.notify_status === 'sent' && <span className="text-green-700 font-semibold">Sent</span>}
                          {s.notify_status === 'skipped' && <span className="text-gray-500 font-semibold">Skipped</span>}
                          {s.notify_status === 'pending' && <span className="text-blue-500 font-semibold">Pending</span>}
                          {s.notify_status === 'failed' && <span className="text-red-600 font-semibold">Failed</span>}
                        </td>
                        <td className="px-4 py-2 border-b">
                          {s.sms_status === 'sent' && <span className="text-green-700 font-semibold">Sent</span>}
                          {s.sms_status === 'failed' && <span className="text-red-600 font-semibold">Failed</span>}
                          {s.sms_status === 'no_mobile' && <span className="text-gray-500 font-semibold">No Mobile</span>}
                          {!s.sms_status && <span className="text-gray-400 font-semibold">-</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!notifyLoading && notifyResults.length > 0 && (
              <div className="mt-6 text-sm text-center bg-blue-50 rounded-lg py-3">
                <span className="font-semibold">Summary:</span> {notifyResults.filter(r => r.notify_status === 'sent').length} notified, {notifyResults.filter(r => r.notify_status === 'skipped').length} skipped (already completed), {notifyResults.filter(r => r.notify_status === 'failed').length} failed.
              </div>
            )}
          </div>
          <div className="flex justify-center mt-4">
            <button onClick={() => setNotifyModalOpen(false)} className="px-6 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 shadow">Close</button>
          </div>
        </Modal>
      )}

      {/* Success Modal with Exam URL */}
      {successModalOpen && (
        <Modal onClose={() => setSuccessModalOpen(false)} title="Test Created Successfully!">
          <div className="text-center py-6">
            <div className="mb-6">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
                <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Test Created Successfully!</h3>
              <p className="text-gray-600 mb-4">Your test has been created and is ready for students to take.</p>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h4 className="font-medium text-gray-900 mb-2">Exam URL:</h4>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={`https://crt.pydahsoft.in/student/exam/${createdTestId}`}
                  readOnly
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-white text-sm font-mono"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`https://crt.pydahsoft.in/student/exam/${createdTestId}`);
                    success('URL copied to clipboard!');
                  }}
                  className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
                >
                  Copy
                </button>
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => setSuccessModalOpen(false)}
                className="px-6 py-2 rounded-lg bg-gray-600 text-white font-semibold hover:bg-gray-700 shadow"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setSuccessModalOpen(false);
                  setView('list');
                }}
                className="px-6 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 shadow"
              >
                View Test List
              </button>
            </div>
          </div>
        </Modal>
      )}
    </main>
  )
}

const TestListView = ({ tests, loading, setView, onViewTest, onDeleteTest, onTestEmail, onFixAudioUrls, user }) => {
  const [filters, setFilters] = useState({
    module: '',
    level: '',
    campus: '',
    batch: '',
    status: '',
  });

  const filteredTests = useMemo(() => {
    return tests.filter(test => {
      const matchesModule = filters.module ? test.module_id === filters.module : true;
      const matchesLevel = filters.level ? test.level === filters.level : true;
      const matchesCampus = filters.campus ? test.campus === filters.campus : true;

      // Normalize batches field into an array of strings (handles string, array, or missing)
      let batchesArray = [];
      if (Array.isArray(test.batches)) {
        batchesArray = test.batches.map(b => String(b).trim()).filter(Boolean);
      } else if (typeof test.batches === 'string') {
        batchesArray = test.batches
          .split(',')
          .map(b => b.trim())
          .filter(Boolean);
      }

      const matchesBatch = filters.batch ? batchesArray.includes(filters.batch) : true;
      const matchesStatus = filters.status ? test.status === filters.status : true;

      return matchesModule && matchesLevel && matchesCampus && matchesBatch && matchesStatus;
    });
  }, [tests, filters]);

  const moduleOptions = useMemo(
    () => [...new Set(tests.map(t => t.module_id).filter(Boolean))],
    [tests]
  );
  const levelOptions = useMemo(
    () => [...new Set(tests.map(t => t.level).filter(Boolean))],
    [tests]
  );
  const campusOptions = useMemo(
    () => [...new Set(tests.map(t => t.campus).filter(Boolean))],
    [tests]
  );
  const batchOptions = useMemo(() => {
    const values = [];

    tests.forEach(t => {
      if (!t.batches) return;

      if (Array.isArray(t.batches)) {
        t.batches
          .map(b => String(b).trim())
          .filter(Boolean)
          .forEach(b => values.push(b));
      } else if (typeof t.batches === 'string') {
        t.batches
          .split(',')
          .map(b => b.trim())
          .filter(Boolean)
          .forEach(b => values.push(b));
      }
    });

    return [...new Set(values)];
  }, [tests]);
  const statusOptions = useMemo(
    () => [...new Set(tests.map(t => t.status).filter(Boolean))],
    [tests]
  );

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const clearFilters = () => {
    setFilters({ module: '', level: '', campus: '', batch: '', status: '' });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Test Management</h1>
          <p className="mt-2 text-gray-500">Browse, manage, and create new tests.</p>
        </div>
        <div className="flex space-x-3">
          {user?.role !== 'campus_admin' && (
            <button
              onClick={onFixAudioUrls}
              className="inline-flex items-center justify-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-orange-500 hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 transition-transform transform hover:scale-105"
            >
              🔧 Fix Audio URLs
            </button>
          )}
          {user?.role !== 'campus_admin' && (
            <button
              onClick={onTestEmail}
              className="inline-flex items-center justify-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-500 hover:bg-purple-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-transform transform hover:scale-105"
            >
              📧 Test Email
            </button>
          )}
          {user?.role !== 'campus_admin' && (
            <button
              onClick={() => {
                setView('create');
                setUploadedQuestions([]);
              }}
              className="inline-flex items-center justify-center px-5 py-2.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-500 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-transform transform hover:scale-105"
            >
              <Plus className="h-5 w-5 mr-2" />
              Create Test
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg">
        <div className="p-6 flex justify-between items-center border-b border-gray-200">
          <h3 className="text-xl font-semibold text-gray-800">All Created Tests</h3>
          <button onClick={clearFilters} className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline">Clear Filters</button>
        </div>
        <div className="overflow-x-hidden">
          {loading ? <LoadingSpinner /> : (
            <table className="w-full table-fixed divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-14">S. No</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Test Name</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Type</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    <span className="block mb-1">Module</span>
                    <select
                      name="module"
                      value={filters.module}
                      onChange={handleFilterChange}
                      className="w-full border-gray-300 rounded-md shadow-sm text-xs font-normal normal-case focus:ring-indigo-500 focus:border-indigo-500 bg-gray-700 text-white"
                    >
                      <option value="">All</option>
                      {moduleOptions.map(opt => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    <span className="block mb-1">Level</span>
                    <select name="level" value={filters.level} onChange={handleFilterChange} className="w-full border-gray-300 rounded-md shadow-sm text-xs font-normal normal-case focus:ring-indigo-500 focus:border-indigo-500 bg-gray-700 text-white">
                      <option value="">All</option>
                      {levelOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    <span className="block mb-1">Campus</span>
                    <select name="campus" value={filters.campus} onChange={handleFilterChange} className="w-full border-gray-300 rounded-md shadow-sm text-xs font-normal normal-case focus:ring-indigo-500 focus:border-indigo-500 bg-gray-700 text-white">
                      <option value="">All</option>
                      {campusOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    <span className="block mb-1">Batch</span>
                    <select
                      name="batch"
                      value={filters.batch}
                      onChange={handleFilterChange}
                      className="w-full border-gray-300 rounded-md shadow-sm text-xs font-normal normal-case focus:ring-indigo-500 focus:border-indigo-500 bg-gray-700 text-white"
                    >
                      <option value="">All</option>
                      {batchOptions.map(opt => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Courses</th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Questions</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    <span className="block mb-1">Status</span>
                    <select name="status" value={filters.status} onChange={handleFilterChange} className="w-full border-gray-300 rounded-md shadow-sm text-xs font-normal normal-case focus:ring-indigo-500 focus:border-indigo-500 bg-gray-700 text-white">
                      <option value="">All</option>
                      {statusOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Created At</th>
                  <th scope="col" className="px-4 py-3 relative"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredTests.map((test, index) => (
                  <tr key={test._id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50 hover:bg-indigo-50'}>
                    <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-700">{index + 1}</td>
                    <td className="px-4 py-3 whitespace-normal break-words text-sm font-medium text-gray-900">{test.name}</td>
                    <td className="px-4 py-3 whitespace-normal break-words text-sm text-gray-500 capitalize">{test.test_type}</td>
                    <td className="px-4 py-3 whitespace-normal break-words text-sm text-gray-500 capitalize">{test.module_id || 'N/A'}</td>
                    <td className="px-4 py-3 whitespace-normal break-words text-sm text-gray-500 capitalize">{test.level || 'N/A'}</td>
                    <td className="px-4 py-3 whitespace-normal break-words text-sm text-gray-500">{test.campus || 'N/A'}</td>
                    <td className="px-4 py-3 whitespace-normal break-words text-sm text-gray-500">{test.batches}</td>
                    <td className="px-4 py-3 whitespace-normal break-words text-sm text-gray-500">{test.courses}</td>
                    <td className="px-3 py-3 whitespace-normal break-words text-sm text-gray-500 text-center">{test.question_count}</td>
                    <td className="px-4 py-3 whitespace-normal break-words text-sm">
                      <span className={clsx('px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full', {
                        'bg-green-100 text-green-800': test.status === 'active',
                        'bg-yellow-100 text-yellow-800': test.status === 'processing',
                        'bg-red-100 text-red-800': test.status === 'failed',
                      })}>
                        {test.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-normal break-words text-sm text-gray-500">
                      {test.created_at ? new Date(test.created_at).toLocaleString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                      }) : 'N/A'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button onClick={() => onViewTest(test._id)} className="text-indigo-600 hover:text-indigo-900 p-1 rounded-full hover:bg-gray-200" title="View Test"><Eye className="h-5 w-5" /></button>
                        <button className="text-gray-400 cursor-not-allowed p-1 rounded-full" title="Edit Test (soon)"><Edit className="h-5 w-5" /></button>
                        <button onClick={() => onDeleteTest(test._id)} className="text-red-600 hover:text-red-800 p-1 rounded-full hover:bg-gray-200" title="Delete Test"><Trash2 className="h-5 w-5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </motion.div>
  )
}

const TestPreviewView = ({ test, onBack, onTestEmail, onFixAudioUrls, onNotifyStudents, onRemindStudents }) => {
  const { success, error } = useNotification();

  const navigate = useNavigate();

  if (!test) {
    return (
      <div className="text-center p-8">
        <h2 className="text-lg font-semibold text-gray-800">No test data to display.</h2>
        <p className="text-gray-500">There might have been an issue loading the test details.</p>
        <button onClick={onBack} className="mt-4 bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600">
          Return to List
        </button>
      </div>
    );
  }

  // Helper to format date/time
  const formatDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-IN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  // Fix audio URLs handler
  const handleFixAudioUrls = async () => {
    try {
      success('Fixing corrupted audio URLs...');
      const res = await api.post('/test-management/fix-audio-urls');
      if (res.data && res.data.success) {
        success(`Fixed ${res.data.fixed_count} tests with corrupted audio URLs`);
        // Refresh the test data
        onBack();
      } else {
        error(res.data.message || 'Failed to fix audio URLs');
      }
    } catch (e) {
      error('Failed to fix audio URLs. Please try again.');
    }
  };

  const handleTestEmail = async () => {
    try {
      const testEmail = prompt('Enter test email address:', 'test@example.com');
      if (!testEmail) return;

      success('Testing email service...');
      const res = await api.post('/test-management/test-email', { email: testEmail });
      if (res.data && res.data.success) {
        success(`Test email sent successfully to ${testEmail}`);
      } else {
        error(res.data.message || 'Email test failed');
      }
    } catch (e) {
      error('Email test failed. Please try again.');
    }
  };





  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">{test.name}</h1>
          <div className="flex flex-wrap items-center gap-4 text-gray-500 text-base">
            <span className="flex items-center"><Briefcase className="w-4 h-4 mr-1.5" /> <span className="font-semibold">Type:</span> {test.test_type}</span>
            <span className={clsx("flex items-center", {
              'text-green-600': test.status === 'active',
              'text-yellow-600': test.status === 'processing',
              'text-red-600': test.status === 'failed'
            })}>
              <CheckCircle className="w-4 h-4 mr-1.5" /> <span className="font-semibold">Status:</span> <span className="font-semibold">{test.status}</span>
            </span>
            <span className="flex items-center"><FileQuestion className="w-4 h-4 mr-1.5" /> <span className="font-semibold">Questions:</span> {test.questions?.length || 0}</span>
            {test.test_type === 'online' && (
              <>
                {test.startDateTime && (
                  <span className="flex items-center"><span className="font-semibold text-gray-700 ml-2">Start:</span> {formatDateTime(test.startDateTime)}</span>
                )}
                {test.endDateTime && (
                  <span className="flex items-center"><span className="font-semibold text-gray-700 ml-2">End:</span> {formatDateTime(test.endDateTime)}</span>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col md:flex-row gap-2 md:gap-4 mt-4 md:mt-0">
          <button onClick={onBack} className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md text-gray-800 bg-gray-100 hover:bg-gray-200 transition-colors">
            <ChevronLeft className="h-5 w-5 mr-1" /> Back to List
          </button>
          <button
            onClick={onFixAudioUrls}
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 transition-colors"
          >
            🔧 Fix Audio URLs
          </button>
          <button
            onClick={onTestEmail}
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 transition-colors"
          >
            📧 Test Email
          </button>
          <button
            onClick={onNotifyStudents}
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors"
          >
            Notify Students
          </button>
          <button
            onClick={onRemindStudents}
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 transition-colors"
          >
            🔔 Remind Students
          </button>
          <button
            onClick={() => navigate(`/superadmin/results?test_id=${test._id}`)}
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 transition-colors"
          >
            Results
          </button>
        </div>
      </div>

      <div className="space-y-8">
        {test.questions && test.questions.map((q, index) => {
          // ✅ Transform flat fields into options object
          const options = {
            A: q.optionA,
            B: q.optionB,
            C: q.optionC,
            D: q.optionD,
          };

          return (
            <div
              key={q._id || index}
              className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm"
            >
              <h3 className="font-semibold text-lg text-gray-800 mb-4">
                Question {index + 1}
              </h3>
              <p className="text-gray-700 mb-4 whitespace-pre-line">{q.question}</p>

              {q.question_type === "mcq" ? (
                <div className="space-y-2 text-base">
                  <h4 className="font-semibold text-gray-600 mb-1">Options:</h4>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 list-none pl-0">
                    {Object.entries(options).map(([key, value]) => (
                      <li
                        key={key}
                        className={clsx("rounded border px-4 py-2", {
                          "bg-green-50 border-green-400 font-bold text-green-700":
                            q.answer === key,
                          "bg-gray-50 border-gray-200": q.answer !== key,
                        })}
                      >
                        <span className="font-semibold">{key}:</span> {value}
                      </li>
                    ))}
                  </ul>
                  <div className="pt-2">
                    <p className="font-semibold text-gray-600">
                      Answer:{" "}
                      <span className="font-bold text-green-600">{q.answer}</span>
                    </p>
                  </div>
                </div>
              ) : q.audio_presigned_url ? (
                <div>
                  <audio controls className="w-full">
                    <source src={q.audio_presigned_url} type="audio/mpeg" />
                    Your browser does not support the audio element.
                  </audio>
                  <div className="mt-2 text-sm text-gray-500">
                    Audio URL: {q.audio_presigned_url}
                  </div>
                </div>
              ) : (
                <div className="flex items-center space-x-2 bg-yellow-100 text-yellow-800 text-sm font-medium px-4 py-3 rounded-md">
                  <AlertTriangle className="h-5 w-5" />
                  <span>
                    Audio not available. Check backend audio generation and S3
                    configuration.
                  </span>
                  <div className="mt-2 text-xs">
                    <div>Audio URL: {q.audio_url || "None"}</div>
                    <div>Presigned URL: {q.audio_presigned_url || "None"}</div>
                    <div>Has Audio: {q.has_audio ? "Yes" : "No"}</div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>


    </motion.div>
  )
}

const TestCreationWizard = ({ onTestCreated, setView, uploadedQuestions, setUploadedQuestions }) => {
  const [step, setStep] = useState(1);
  const [testData, setTestData] = useState({
    category: '',
    module: '',
    level: '',
    subcategory: '',
    test_name: '',
    test_type: '',
    duration: 30,
    passing_score: 70,
    selectedCampuses: [],
    selectedBatches: [],
    selectedCourses: [],
    topic_id: '',
    selectedTopic: '',
    technical_question_type: 'compiler', // Default for technical tests
    question_type: 'mcq', // Default for other tests
    startDateTime: null, // For online tests
    endDateTime: null, // For online tests
  });

  const nextStep = () => {
    // For CRT_TECHNICAL module, add an extra step for question type selection
    if (testData.module === 'CRT_TECHNICAL' && step === 4) {
      setStep(5); // Go to technical question type step
    } else if (testData.module === 'CRT_TECHNICAL' && step === 5) {
      setStep(6); // Go to question upload step
    } else if (testData.module === 'CRT_TECHNICAL' && step === 6) {
      setStep(7); // Go to final confirmation step
    } else if (testData.test_type?.toLowerCase() === 'online' && step === 4) {
      setStep(5); // Go to online test configuration step
    } else if (testData.test_type?.toLowerCase() === 'online' && step === 5) {
      setStep(6); // Go to question upload step
    } else if (testData.test_type?.toLowerCase() === 'online' && step === 6) {
      setStep(7); // Go to final confirmation step
    } else {
      setStep(prev => prev < 7 ? prev + 1 : prev);
    }
  }

  const prevStep = () => {
    // For CRT_TECHNICAL module, handle the extra step
    if (testData.module === 'CRT_TECHNICAL' && step === 6) {
      setStep(5); // Go back to technical question type step
    } else if (testData.module === 'CRT_TECHNICAL' && step === 5) {
      setStep(4); // Go back to audience selection step
    } else if (testData.test_type?.toLowerCase() === 'online' && step === 7) {
      setStep(6); // Go back to question upload step
    } else if (testData.test_type?.toLowerCase() === 'online' && step === 6) {
      setStep(5); // Go back to online test configuration step
    } else if (testData.test_type?.toLowerCase() === 'online' && step === 5) {
      setStep(4); // Go back to audience selection step
    } else {
      setStep(prev => prev > 1 ? prev - 1 : prev);
    }
  }

  const updateTestData = (data) => {
    setTestData(prev => ({ ...prev, ...data }));
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return <Step1TestCategory nextStep={nextStep} prevStep={prevStep} updateTestData={updateTestData} testData={testData} />;
      case 2:
        return <Step2TestType nextStep={nextStep} prevStep={prevStep} updateTestData={updateTestData} testData={testData} />;
      case 3:
        return <Step3TestName nextStep={nextStep} prevStep={prevStep} updateTestData={updateTestData} testData={testData} />;
      case 4:
        return <Step4AudienceSelection nextStep={nextStep} prevStep={prevStep} updateTestData={updateTestData} testData={testData} />;
      case 5:
        // Show online test configuration step for online tests
        if (testData.test_type?.toLowerCase() === 'online') {
          return <Step5OnlineTestConfig nextStep={nextStep} prevStep={prevStep} updateTestData={updateTestData} testData={testData} />;
        }
        // Show technical question type step only for CRT_TECHNICAL
        else if (testData.module === 'CRT_TECHNICAL') {
          return <TechnicalTestQuestionType onNext={nextStep} onBack={prevStep} updateTestData={updateTestData} testData={testData} />;
        } else {
          return <Step5QuestionUpload nextStep={nextStep} prevStep={prevStep} updateTestData={updateTestData} testData={testData} uploadedQuestions={uploadedQuestions} setUploadedQuestions={setUploadedQuestions} />;
        }
      case 6:
        // Show question upload step
        if (testData.module === 'CRT_TECHNICAL') {
          return <Step5QuestionUpload nextStep={nextStep} prevStep={prevStep} updateTestData={updateTestData} testData={testData} uploadedQuestions={uploadedQuestions} setUploadedQuestions={setUploadedQuestions} />;
        } else if (testData.test_type?.toLowerCase() === 'online') {
          return <Step5QuestionUpload nextStep={nextStep} prevStep={prevStep} updateTestData={updateTestData} testData={testData} uploadedQuestions={uploadedQuestions} setUploadedQuestions={setUploadedQuestions} />;
        } else {
          return <Step6ConfirmAndGenerate prevStep={prevStep} testData={testData} onTestCreated={onTestCreated} uploadedQuestions={uploadedQuestions} />;
        }
      case 7:
        // Final confirmation step for CRT_TECHNICAL and online tests
        return <Step6ConfirmAndGenerate prevStep={prevStep} testData={testData} onTestCreated={onTestCreated} uploadedQuestions={uploadedQuestions} />;
      default:
        return <Step1TestCategory nextStep={nextStep} prevStep={prevStep} updateTestData={updateTestData} testData={testData} />;
    }
  };

  // Calculate total steps based on module and test type
  const totalSteps = (testData.module === 'CRT_TECHNICAL' || testData.test_type?.toLowerCase() === 'online') ? 7 : 6;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Create a New Test</h1>
          <p className="mt-2 text-base text-gray-600">Follow the steps to configure and launch a test.</p>
        </div>
        <button onClick={() => setView('list')} className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors duration-200 hover:bg-blue-50 rounded-lg">
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to Test List
        </button>
      </div>
      <div className="bg-gradient-to-br from-white to-blue-50 rounded-3xl shadow-2xl border border-blue-100 p-8 sm:p-10">
        <div className="mb-10">
          <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
            <motion.div
              className="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full shadow-lg"
              animate={{ width: `${((step - 1) / (totalSteps - 1)) * 100}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
          <p className="text-right text-sm font-medium text-gray-600 mt-3">
            Step {step} of {totalSteps}: {
              step === 1 ? 'Select Test Category' :
                step === 2 ? 'Select Test Type' :
                  step === 3 ? 'Select Module and Level' :
                    step === 4 ? 'Select Audience' :
                      step === 5 ? (testData.test_type?.toLowerCase() === 'online' ? 'Configure Online Test' : 
                                   testData.module === 'CRT_TECHNICAL' ? 'Select Question Type' : 'Upload Questions') :
                        step === 6 ? (testData.module === 'CRT_TECHNICAL' ? 'Upload Questions' : 
                                     testData.test_type?.toLowerCase() === 'online' ? 'Upload Questions' : 'Final Confirmation') :
                          step === 7 ? 'Final Confirmation' : ''
            }
          </p>
        </div>
        {renderStep()}
      </div>
    </motion.div>
  )
}

const Step1TestCategory = ({ nextStep, prevStep, updateTestData, testData }) => {
  const { error } = useNotification()

  const handleCategorySelect = (category) => {
    updateTestData({ testCategory: category })
    nextStep()
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
      <div className="space-y-10">
        <div className="flex items-center space-x-4 border-b border-gray-100 pb-6">
          <div className="bg-gradient-to-r from-blue-500 to-purple-500 p-3 rounded-xl text-white shadow-lg">
            <Briefcase className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Select Test Category</h2>
            <p className="text-gray-600 mt-1">Choose the category of test you want to create</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* CRT Option */}
          <button
            onClick={() => handleCategorySelect('CRT')}
            className="group p-8 border-2 border-gray-200 rounded-2xl text-left transition-all duration-300 hover:border-orange-400 hover:shadow-xl hover:scale-105 bg-white hover:bg-gradient-to-br hover:from-orange-50 hover:to-orange-100"
          >
            <div className="flex items-center space-x-4 mb-6">
              <div className="bg-gradient-to-r from-orange-500 to-red-500 p-4 rounded-xl text-white shadow-lg group-hover:shadow-xl transition-shadow">
                <Code className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-800 group-hover:text-orange-700 transition-colors">CRT (Campus Recruitment Test)</h3>
                <p className="text-gray-600 mt-1">Technical and aptitude assessment</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <div className="bg-green-100 p-2 rounded-full">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                <span className="text-gray-700 font-medium">Aptitude Testing</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="bg-green-100 p-2 rounded-full">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                <span className="text-gray-700 font-medium">Reasoning Assessment</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="bg-green-100 p-2 rounded-full">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                <span className="text-gray-700 font-medium">Technical Programming</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="bg-green-100 p-2 rounded-full">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                <span className="text-gray-700 font-medium">Code Execution & Validation</span>
              </div>
            </div>
            <div className="mt-6">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-800">
                Technical Assessment
              </span>
            </div>
          </button>

          {/* Versant Option */}
          <button
            onClick={() => handleCategorySelect('VERSANT')}
            className="group p-8 border-2 border-gray-200 rounded-2xl text-left transition-all duration-300 hover:border-blue-400 hover:shadow-xl hover:scale-105 bg-white hover:bg-gradient-to-br hover:from-blue-50 hover:to-blue-100"
          >
            <div className="flex items-center space-x-4 mb-6">
              <div className="bg-gradient-to-r from-blue-500 to-purple-500 p-4 rounded-xl text-white shadow-lg group-hover:shadow-xl transition-shadow">
                <Mic className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-800 group-hover:text-blue-700 transition-colors">Versant</h3>
                <p className="text-gray-600 mt-1">Language proficiency assessment</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <div className="bg-green-100 p-2 rounded-full">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                <span className="text-gray-700 font-medium">Grammar Testing</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="bg-green-100 p-2 rounded-full">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                <span className="text-gray-700 font-medium">Vocabulary Assessment</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="bg-green-100 p-2 rounded-full">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                <span className="text-gray-700 font-medium">Reading Comprehension</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="bg-green-100 p-2 rounded-full">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                <span className="text-gray-700 font-medium">Listening & Speaking</span>
              </div>
            </div>
            <div className="mt-6">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                Language Assessment
              </span>
            </div>
          </button>
        </div>

        <div className="flex justify-between items-center pt-8 border-t border-gray-100 mt-10">
          <button
            type="button"
            onClick={() => setView('list')}
            className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium rounded-xl text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all duration-200 hover:shadow-md transform hover:scale-105"
          >
            <ChevronLeft className="h-5 w-5 mr-2" />
            Back to Test List
          </button>
        </div>
      </div>
    </motion.div>
  )
}

const Step1TestDetails = ({ nextStep, prevStep, updateTestData, testData, step }) => {
  // Normalize testData to ensure we always have string IDs, not objects
  const normalizedModule = typeof testData.module === 'object' ? testData.module?.id : testData.module;
  const normalizedLevel = typeof testData.level === 'object' ? testData.level?.id : testData.level;
  const normalizedSubcategory = typeof testData.subcategory === 'object' ? testData.subcategory?.id : testData.subcategory;

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    defaultValues: {
      module: normalizedModule || '',
      level: normalizedLevel || '',
      subcategory: normalizedSubcategory || '',
    }
  })
  const { error } = useNotification()
  const selectedModule = watch('module')
  const [modules, setModules] = useState([])
  const [allLevels, setAllLevels] = useState([])
  const [filteredLevels, setFilteredLevels] = useState([])
  const [grammarCategories, setGrammarCategories] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const res = await api.get('/test-management/get-test-data')
        setModules(res.data.data.modules || [])
        // Convert levels object to array format
        const levelsData = res.data.data.levels || {};
        const levelsArray = Object.entries(levelsData).map(([id, levelData]) => ({
          id: id,
          name: levelData.name || levelData,
          module_id: levelData.module_id || id.split('_')[0]
        }));
        setAllLevels(levelsArray)
        setGrammarCategories(res.data.data.grammar_categories || [])
      } catch (err) {
        error("Failed to fetch modules and levels")
      } finally {
        setLoading(false)
      }
    }
    fetchOptions()
  }, [])

  // Filter levels based on selected module
  useEffect(() => {
    if (selectedModule && allLevels.length > 0) {
      let filtered = [];

      if (selectedModule === 'GRAMMAR') {
        // For Grammar, use grammar categories instead of levels
        setFilteredLevels([]);
        return;
      } else if (selectedModule === 'CRT') {
        // For CRT, use predefined levels
        filtered = [
          { id: 'Aptitude', name: 'Aptitude' },
          { id: 'Reasoning', name: 'Reasoning' },
          { id: 'Technical', name: 'Technical' }
        ];
      } else {
        // For other modules, filter levels that start with the module name
        filtered = allLevels.filter(level =>
          level.id && level.id.startsWith(selectedModule)
        );

        // If no levels found, create default levels
        if (filtered.length === 0) {
          filtered = [
            { id: `${selectedModule}_BEGINNER`, name: 'Beginner' },
            { id: `${selectedModule}_INTERMEDIATE`, name: 'Intermediate' },
            { id: `${selectedModule}_ADVANCED`, name: 'Advanced' }
          ];
        }
      }

      setFilteredLevels(filtered);

      // Reset level selection when module changes
      setValue('level', '');
      setValue('subcategory', '');
    } else {
      setFilteredLevels([]);
    }
  }, [selectedModule, allLevels, setValue])

  const onSubmit = async (data) => {
    // Only update test data and go to next step, do not check test name here
    updateTestData(data)
    nextStep()
  }

  if (loading) {
    return <LoadingSpinner />
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-500 p-2 rounded-full text-white">
            <Briefcase className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-bold mb-4">Select Module and Level</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="module" className="block text-sm font-medium text-gray-800 mb-1">Module</label>
            <select
              id="module"
              {...register('module', { required: 'Please select a module.' })}
              className="mt-1 block w-full rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm transition bg-gray-700 text-white border-gray-600"
            >
              <option value="">Select Module</option>
              {modules.map(module => (
                <option key={module.id} value={module.id}>{module.name}</option>
              ))}
            </select>
            {errors.module && <p className="text-red-500 text-xs mt-1">{errors.module.message}</p>}
          </div>
          {selectedModule === 'GRAMMAR' ? (
            <div>
              <label htmlFor="subcategory" className="block text-sm font-medium text-gray-800 mb-1">Grammar Category</label>
              <select
                id="subcategory"
                {...register('subcategory', { required: 'Please select a category.' })}
                className="mt-1 block w-full rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm transition bg-gray-700 text-white border-gray-600"
              >
                <option value="">Select Category</option>
                {grammarCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              {errors.subcategory && <p className="text-red-500 text-xs mt-1">{errors.subcategory.message}</p>}
            </div>
          ) : selectedModule && filteredLevels.length > 0 ? (
            <div>
              <label htmlFor="level" className="block text-sm font-medium text-gray-800 mb-1">Level</label>
              <select
                id="level"
                {...register('level', { required: 'Please select a level.' })}
                className="mt-1 block w-full rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm transition bg-gray-700 text-white border-gray-600"
              >
                <option value="">Select Level</option>
                {filteredLevels.map(level => (
                  <option key={level.id} value={level.id}>{level.name}</option>
                ))}
              </select>
              {errors.level && <p className="text-red-500 text-xs mt-1">{errors.level.message}</p>}
            </div>
          ) : selectedModule ? (
            <div>
              <label htmlFor="level" className="block text-sm font-medium text-gray-800 mb-1">Level</label>
              <select
                id="level"
                disabled
                className="mt-1 block w-full rounded-md shadow-sm bg-gray-300 text-gray-500 sm:text-sm border-gray-300"
              >
                <option value="">No levels available</option>
              </select>
              <p className="text-yellow-600 text-xs mt-1">No levels found for this module</p>
            </div>
          ) : null}
        </div>
        <div className="flex justify-between items-center pt-4">
          <button type="button" onClick={prevStep} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md text-gray-800 bg-gray-100 hover:bg-gray-200 transition-colors">
            <ChevronLeft className="h-5 w-5 mr-1" /> Back
          </button>
          <button type="submit" className="inline-flex items-center justify-center px-5 py-2.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-500 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-transform transform hover:scale-105">
            Next: Enter Test Name <ChevronRight className="h-5 w-5 ml-2" />
          </button>
        </div>
      </form>
    </motion.div>
  )
}

const Step2TestType = ({ nextStep, prevStep, updateTestData, testData }) => {
  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm({
    defaultValues: {
      testType: testData.test_type,
    }
  })
  const { error } = useNotification()

  const testType = watch('testType')

  const onSubmit = (data) => {
    if (!data.testType) {
      error("Please select a test type");
      return;
    }
    updateTestData({ test_type: data.testType })
    nextStep()
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-10">
        <div className="flex items-center space-x-4 border-b border-gray-100 pb-6">
          <div className="bg-gradient-to-r from-blue-500 to-purple-500 p-3 rounded-xl text-white shadow-lg">
            <Briefcase className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Select Test Type</h2>
            <p className="text-gray-600 mt-1">Choose the type of test you want to create</p>
          </div>
        </div>

        <div className="space-y-6">
          <label className="block text-lg font-semibold text-gray-800 mb-4">Test Type</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <label className={clsx(
              'relative group cursor-pointer transition-all duration-300 transform hover:scale-105',
              'bg-white border-2 rounded-2xl p-6 shadow-lg hover:shadow-xl',
              'hover:border-green-300 hover:bg-green-50/50',
              {
                'border-green-500 bg-gradient-to-br from-green-50 to-green-100 shadow-xl ring-4 ring-green-100': testType === 'Practice',
                'border-gray-200': testType !== 'Practice'
              }
            )}>
              <input
                type="radio"
                {...register('testType', { required: 'Please select a test type' })}
                value="Practice"
                className="sr-only"
              />
              <div className="flex items-start space-x-4">
                <div className={clsx(
                  'p-3 rounded-xl transition-colors duration-300',
                  {
                    'bg-gradient-to-r from-green-500 to-emerald-500 text-white': testType === 'Practice',
                    'bg-gray-100 text-gray-400 group-hover:bg-green-100 group-hover:text-green-600': testType !== 'Practice'
                  }
                )}>
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-800 mb-2">Practice Module</h3>
                  <p className="text-gray-600 leading-relaxed">Low-stakes module for student practice and skill development.</p>
                  <div className="mt-3 flex items-center text-sm text-gray-500">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Recommended for learning
                    </span>
                  </div>
                </div>
                {testType === 'Practice' && (
                  <div className="absolute top-4 right-4">
                    <div className="bg-green-500 text-white rounded-full p-1">
                      <CheckCircle className="h-5 w-5" />
                    </div>
                  </div>
                )}
              </div>
            </label>

            <label className={clsx(
              'relative group cursor-pointer transition-all duration-300 transform hover:scale-105',
              'bg-white border-2 rounded-2xl p-6 shadow-lg hover:shadow-xl',
              'hover:border-purple-300 hover:bg-purple-50/50',
              {
                'border-purple-500 bg-gradient-to-br from-purple-50 to-purple-100 shadow-xl ring-4 ring-purple-100': testType === 'Online',
                'border-gray-200': testType !== 'Online'
              }
            )}>
              <input
                type="radio"
                {...register('testType', { required: 'Please select a test type' })}
                value="Online"
                className="sr-only"
              />
              <div className="flex items-start space-x-4">
                <div className={clsx(
                  'p-3 rounded-xl transition-colors duration-300',
                  {
                    'bg-gradient-to-r from-purple-500 to-indigo-500 text-white': testType === 'Online',
                    'bg-gray-100 text-gray-400 group-hover:bg-purple-100 group-hover:text-purple-600': testType !== 'Online'
                  }
                )}>
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-800 mb-2">Online Exam</h3>
                  <p className="text-gray-600 leading-relaxed">Formal, graded assessment with time limits and scoring.</p>
                  <div className="mt-3 flex items-center text-sm text-gray-500">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                      For evaluation
                    </span>
                  </div>
                </div>
                {testType === 'Online' && (
                  <div className="absolute top-4 right-4">
                    <div className="bg-purple-500 text-white rounded-full p-1">
                      <CheckCircle className="h-5 w-5" />
                    </div>
                  </div>
                )}
              </div>
            </label>
          </div>
        </div>

        <div className="flex justify-between items-center pt-8 border-t border-gray-100 mt-10">
          <button
            type="button"
            onClick={prevStep}
            className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium rounded-xl text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all duration-200 hover:shadow-md transform hover:scale-105"
          >
            <ChevronLeft className="h-5 w-5 mr-2" />
            Back
          </button>
          <button
            type="submit"
            className="inline-flex items-center justify-center px-8 py-3 text-sm font-medium rounded-xl shadow-lg text-white bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 focus:outline-none focus:ring-4 focus:ring-blue-200 transition-all duration-200 transform hover:scale-105 hover:shadow-xl"
          >
            Next: Select Module and Level
            <ChevronRight className="h-5 w-5 ml-2" />
          </button>
        </div>
      </form>
    </motion.div>
  )
}

const Step3TestName = ({ nextStep, prevStep, updateTestData, testData }) => {
  const [module, setModule] = useState(testData.module || '');
  const [level, setLevel] = useState(testData.level || '');
  const [subcategory, setSubcategory] = useState(testData.subcategory || '');
  const [testName, setTestName] = useState(testData.test_name || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [levels, setLevels] = useState([]);
  const [grammarCategories, setGrammarCategories] = useState([]);
  const [crtTopics, setCrtTopics] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState('');
  const [isCheckingName, setIsCheckingName] = useState(false);
  const [nameExists, setNameExists] = useState(false);
  const [nameAvailable, setNameAvailable] = useState(false);
  const { error: showError } = useNotification();

  // Fetch levels and grammar categories when component mounts
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await api.get('/test-management/get-test-data');
        if (response.data.success) {
          // Convert levels object to array format
          const levelsData = response.data.data.levels || {};
          const levelsArray = Object.entries(levelsData).map(([id, levelData]) => ({
            id: id,
            name: levelData.name || levelData,
            module_id: levelData.module_id || id.split('_')[0]
          }));
          setLevels(levelsArray);
          setGrammarCategories(response.data.data.grammar_categories || []);
          setCrtTopics(response.data.data.crt_topics || []);
        }
      } catch (error) {
        console.error('Error fetching levels:', error);
        showError('Failed to fetch levels');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Get modules based on selected category
  const getModulesForCategory = () => {
    if (testData.testCategory === 'CRT') {
      return [
        {
          id: 'CRT_APTITUDE',
          name: 'Aptitude',
          description: 'Mathematical and logical reasoning questions',
          icon: '🧮'
        },
        {
          id: 'CRT_REASONING',
          name: 'Reasoning',
          description: 'Logical and analytical reasoning questions',
          icon: '🧠'
        },
        {
          id: 'CRT_TECHNICAL',
          name: 'Technical',
          description: 'Technical and domain-specific questions',
          icon: '💻'
        }
      ];
    } else if (testData.testCategory === 'VERSANT') {
      return [
        { id: 'GRAMMAR', name: 'Grammar' },
        { id: 'VOCABULARY', name: 'Vocabulary' },
        { id: 'READING', name: 'Reading' },
        { id: 'LISTENING', name: 'Listening' },
        { id: 'SPEAKING', name: 'Speaking' },
        { id: 'WRITING', name: 'Writing' }
      ];
    }
    return [];
  };

  // Filter levels based on selected module
  const getFilteredLevels = () => {
    if (!module) return [];
    if (module === 'GRAMMAR') {
      return grammarCategories;
    } else if (module.startsWith('CRT_')) {
      // For CRT modules, no additional level selection needed
      return [];
    } else {
      // Find all levels for this module from backend
      const moduleLevels = levels.filter(level =>
        level && level.id && level.name && level.id.startsWith(module)
      );
      if (moduleLevels.length > 0) {
        return moduleLevels;
      }
      // Fallback to default levels
      return [
        { id: `${module}_BEGINNER`, name: 'Beginner' },
        { id: `${module}_INTERMEDIATE`, name: 'Intermediate' },
        { id: `${module}_ADVANCED`, name: 'Advanced' }
      ];
    }
  };

  const handleModuleChange = (e) => {
    setModule(e.target.value);
    setLevel(''); // Reset level when module changes
    setSubcategory(''); // Reset subcategory when module changes
    setSelectedTopic(''); // Reset topic when module changes
  };

  const handleTopicChange = (e) => {
    setSelectedTopic(e.target.value);
  };

  // Get topics for the selected CRT module
  const getTopicsForModule = () => {
    if (!module || !module.startsWith('CRT_')) return [];
    return crtTopics.filter(topic => topic.module_id === module);
  };

  const handleLevelChange = (e) => {
    setLevel(e.target.value);
  };

  const handleSubcategoryChange = (e) => {
    setSubcategory(e.target.value);
  };

  // Check if test name already exists
  const checkTestName = async (name) => {
    if (!name.trim()) {
      setNameExists(false);
      setNameAvailable(false);
      return;
    }

    setIsCheckingName(true);
    try {
      const response = await api.post('/test-management/check-test-name', { name: name.trim() });
      if (response.data.exists) {
        setNameExists(true);
        setNameAvailable(false);
      } else {
        setNameExists(false);
        setNameAvailable(true);
      }
    } catch (error) {
      console.error('Error checking test name:', error);
      setNameExists(false);
      setNameAvailable(false);
    } finally {
      setIsCheckingName(false);
    }
  };

  // Debounced test name check
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (testName.trim()) {
        checkTestName(testName);
      } else {
        setNameExists(false);
        setNameAvailable(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [testName]);

  const handleNext = () => {
    if (!module) {
      setError('Please select a module.');
      return;
    }

    if (module === 'GRAMMAR' && !subcategory) {
      setError('Please select a grammar category.');
      return;
    } else if (module !== 'GRAMMAR' && !module.startsWith('CRT_') && !level) {
      setError('Please select a level.');
      return;
    }

    if (!testName.trim()) {
      setError('Please enter a test name.');
      return;
    }

    if (nameExists) {
      setError('This test name already exists. Please choose a different name.');
      return;
    }

    if (isCheckingName) {
      setError('Please wait while we check the test name availability.');
      return;
    }

    setError('');
    const updateData = {
      module,
      level: module === 'GRAMMAR' ? subcategory : (module.startsWith('CRT_') ? module : level),
      subcategory: module === 'GRAMMAR' ? subcategory : null,
      topic_id: module.startsWith('CRT_') ? selectedTopic : null,
      test_name: testName
    };
    updateTestData(updateData);
    nextStep();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
      <div className="space-y-10">
        <div className="flex items-center space-x-4 border-b border-gray-100 pb-6">
          <div className="bg-gradient-to-r from-blue-500 to-purple-500 p-3 rounded-xl text-white shadow-lg">
            <FileQuestion className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Select Module, Level, and Enter Test Name</h2>
            <p className="text-gray-600 mt-1">Configure the test details and provide a unique name</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 space-y-8">
          <div>
            <label className="block text-base font-semibold text-gray-800 mb-2">Module</label>
            {testData.testCategory === 'CRT' ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {getModulesForCategory().map(mod => (
                  <div
                    key={mod.id}
                    onClick={() => setModule(mod.id)}
                    className={`p-4 border-2 rounded-xl cursor-pointer transition-all duration-200 ${module === mod.id
                      ? 'border-blue-500 bg-blue-50 ring-4 ring-blue-200'
                      : 'border-gray-200 hover:border-blue-300 bg-white'
                      }`}
                  >
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">{mod.icon}</span>
                      <div>
                        <h3 className="font-semibold text-gray-800">{mod.name}</h3>
                        <p className="text-sm text-gray-600">{mod.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <select
                value={module}
                onChange={handleModuleChange}
                className="w-full p-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-200 focus:border-blue-500 transition-all duration-200 bg-white hover:border-blue-300"
              >
                <option value="">Select Module</option>
                {getModulesForCategory().map(mod => (
                  <option key={mod.id} value={mod.id}>{mod.name}</option>
                ))}
              </select>
            )}
          </div>

          {module && module === 'GRAMMAR' && (
            <div>
              <label className="block text-base font-semibold text-gray-800 mb-2">Grammar Category</label>
              <select
                value={subcategory}
                onChange={handleSubcategoryChange}
                className="w-full p-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-200 focus:border-blue-500 transition-all duration-200 bg-white hover:border-blue-300"
                disabled={loading}
              >
                <option value="">Select Grammar Category</option>
                {Object.entries(grammarCategories).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value}
                  </option>
                ))}

              </select>
            </div>
          )}

          {module && module !== 'GRAMMAR' && !module.startsWith('CRT_') && (
            <div>
              <label className="block text-base font-semibold text-gray-800 mb-2">Level</label>
              <select
                value={level}
                onChange={handleLevelChange}
                className="w-full p-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-200 focus:border-blue-500 transition-all duration-200 bg-white hover:border-blue-300"
                disabled={loading}
              >
                <option value="">Select Level</option>
                {getFilteredLevels().map(lvl => (
                  <option key={lvl.id} value={lvl.id}>{lvl.name}</option>
                ))}
              </select>
            </div>
          )}

          {module && module.startsWith('CRT_') && (
            <div>
              <label className="block text-base font-semibold text-gray-800 mb-2">Topic (Optional)</label>
              <select
                value={selectedTopic}
                onChange={handleTopicChange}
                className="w-full p-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-200 focus:border-blue-500 transition-all duration-200 bg-white hover:border-blue-300"
                disabled={loading}
              >
                <option value="">Select Topic (Optional)</option>
                {getTopicsForModule().map(topic => (
                  <option key={topic._id} value={topic._id}>
                    {topic.topic_name} ({topic.total_questions || 0} questions, {topic.completion_percentage}% completed)
                  </option>
                ))}
              </select>
              {getTopicsForModule().length === 0 && (
                <p className="text-sm text-gray-500 mt-1">No topics available for this module. Questions will be selected from all available questions.</p>
              )}
              {selectedTopic && (
                <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-800">
                    <strong>Selected Topic:</strong> {getTopicsForModule().find(t => t._id === selectedTopic)?.topic_name}
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    Total Questions: {getTopicsForModule().find(t => t._id === selectedTopic)?.total_questions || 0} |
                    Available: {getTopicsForModule().find(t => t._id === selectedTopic)?.total_questions - getTopicsForModule().find(t => t._id === selectedTopic)?.used_questions || 0}
                  </p>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-base font-semibold text-gray-800 mb-2">Test Name</label>
            <div className="relative">
              <input
                value={testName}
                onChange={e => setTestName(e.target.value)}
                className={`w-full p-4 border-2 rounded-xl focus:ring-4 focus:ring-blue-200 focus:border-blue-500 transition-all duration-200 ${nameExists ? 'border-red-500 bg-red-50' :
                  nameAvailable ? 'border-green-500 bg-green-50' :
                    'border-gray-200 hover:border-blue-300'
                  }`}
                placeholder="Enter test name"
              />
              {isCheckingName && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                </div>
              )}
              {nameAvailable && !isCheckingName && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <svg className="h-5 w-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
              {nameExists && !isCheckingName && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <svg className="h-5 w-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              )}
            </div>
            {nameExists && !isCheckingName && (
              <p className="text-red-600 text-sm mt-1">This test name already exists. Please choose a different name.</p>
            )}
            {nameAvailable && !isCheckingName && (
              <p className="text-green-600 text-sm mt-1">Test name is available!</p>
            )}
          </div>

          {error && <div className="text-red-600 p-4 bg-red-50 border-2 border-red-200 rounded-xl">{error}</div>}

          <div className="flex justify-between items-center pt-8 border-t border-gray-100 mt-10">
            <button
              onClick={prevStep}
              className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium rounded-xl text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all duration-200 hover:shadow-md transform hover:scale-105"
            >
              <ChevronLeft className="h-5 w-5 mr-2" />
              Back
            </button>
            <button
              onClick={handleNext}
              className="inline-flex items-center justify-center px-8 py-3 text-sm font-medium rounded-xl shadow-lg text-white bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 focus:outline-none focus:ring-4 focus:ring-blue-200 transition-all duration-200 transform hover:scale-105 hover:shadow-xl"
            >
              Next: Select Audience
              <ChevronRight className="h-5 w-5 ml-2" />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const Step4AudienceSelection = ({ nextStep, prevStep, updateTestData, testData }) => {
  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm({
    defaultValues: {
      campus_id: testData.campus?.value || '',
      batch_ids: testData.batches?.map(b => b.value) || [],
      course_ids: testData.courses?.map(c => c.value) || [],
    }
  })
  const { error } = useNotification()
  const { user } = useAuth()

  const [campuses, setCampuses] = useState([])
  const [batches, setBatches] = useState([])
  const [courses, setCourses] = useState([])

  const [loadingStates, setLoadingStates] = useState({
    campuses: true,
    batches: false,
    courses: false,
  })

  const selectedCampusId = watch('campus_id')
  const selectedBatchIds = watch('batch_ids')

  // Get the appropriate API endpoint based on user role
  const getCampusEndpoint = () => {
    if (user?.role === 'campus_admin') {
      return '/campus-admin/courses' // This will return courses for the campus admin's campus
    } else if (user?.role === 'course_admin') {
      return '/course-admin/batches' // This will return batches for the course admin's course
    } else {
      return '/campus-management/' // Super admin can see all campuses
    }
  }

  // Fetch Campuses on mount
  useEffect(() => {
    const fetchCampuses = async () => {
      setLoadingStates(prev => ({ ...prev, campuses: true }))
      try {
        let res;
        if (user?.role === 'campus_admin') {
          // For campus admin, get courses (which implies campus)
          res = await api.get('/campus-admin/courses')
        setCampuses(res.data.data.map(c => ({ label: c.name, value: c.id })))
        } else if (user?.role === 'course_admin') {
          // For course admin, get batches (which implies course)
          res = await api.get('/course-admin/batches')
          setCampuses(res.data.data.map(b => ({ label: b.name, value: b.id })))
        } else {
          // For super admin, get all campuses
          res = await api.get('/campus-management/')
          setCampuses(res.data.data.map(c => ({ label: c.name, value: c.id })))
        }
      } catch (err) {
        error("Failed to fetch campuses")
      } finally {
        setLoadingStates(prev => ({ ...prev, campuses: false }))
      }
    }
    fetchCampuses()
  }, [user?.id])

  // Fetch Batches when Campus changes
  useEffect(() => {
    const fetchBatches = async (campusId) => {
      setLoadingStates(prev => ({ ...prev, batches: true, courses: false }))
      try {
        let res;
        if (user?.role === 'campus_admin') {
          // For campus admin, get batches for their campus
          res = await api.get('/campus-admin/batches')
        setBatches(res.data.data.map(b => ({ label: b.name, value: b.id })))
        } else if (user?.role === 'course_admin') {
          // For course admin, batches are already loaded in the "campus" dropdown
          setBatches([]) // No additional batches to fetch
        } else {
          // For super admin, get batches for the selected campus
          res = await api.get(`/batch-management/campus/${campusId}/batches`)
          setBatches(res.data.data.map(b => ({ label: b.name, value: b.id })))
        }
      } catch (err) {
        error("Failed to fetch batches")
        setBatches([])
      } finally {
        setLoadingStates(prev => ({ ...prev, batches: false }))
      }
    }

    if (selectedCampusId) {
      setValue('batch_ids', [])
      setValue('course_ids', [])
      setCourses([])
      fetchBatches(selectedCampusId)
    } else {
      setBatches([])
      setValue('batch_ids', [])
      setValue('course_ids', [])
      setCourses([])
    }
  }, [selectedCampusId, setValue, error, user])

  // Fetch Courses when Batches change
  useEffect(() => {
    const fetchCoursesForBatches = async (batchIds) => {
      if (!batchIds || batchIds.length === 0) {
        setCourses([])
        setValue('course_ids', [])
        return
      }
      setLoadingStates(prev => ({ ...prev, courses: true }))
      try {
        let allCourses = [];
        if (user?.role === 'campus_admin') {
          // For campus admin, get courses for their campus
          const res = await api.get('/campus-admin/courses')
          allCourses = res.data.data
        } else if (user?.role === 'course_admin') {
          // For course admin, they only have one course, so no need to fetch
          allCourses = []
        } else {
          // For super admin, get courses for the selected batches
        const coursePromises = batchIds.map(batchId =>
          api.get(`/course-management/batch/${batchId}/courses`)
        )
        const courseResults = await Promise.all(coursePromises)
          allCourses = courseResults.flatMap(res => res.data.data)
        }
        
        const uniqueCourses = [...new Map(allCourses.map(item => [item.id, item])).values()]
        setCourses(uniqueCourses.map(c => ({ label: c.name, value: c.id })))
      } catch (err) {
        error("Failed to fetch courses")
        setCourses([])
      } finally {
        setLoadingStates(prev => ({ ...prev, courses: false }))
      }
    }

    fetchCoursesForBatches(selectedBatchIds)
  }, [selectedBatchIds, setValue, user?.id])

  const onSubmit = (data) => {
    // Validate that we have the required selections based on user role
    if (user?.role === 'course_admin') {
      // For course admin, they only need to select batches (which are already loaded)
      if (!data.campus_id) {
        error("Please select a batch");
        return;
      }
    } else if (user?.role === 'campus_admin') {
      // For campus admin, they need to select batches and courses
      if (!data.campus_id) {
        error("Please select a course");
        return;
      }
      if (!data.batch_ids || data.batch_ids.length === 0) {
        error("Please select at least one batch");
        return;
      }
    } else {
      // For super admin, they need to select campus, batches, and courses
    if (!data.campus_id) {
      error("Please select a campus");
      return;
    }
    if (!data.batch_ids || data.batch_ids.length === 0) {
      error("Please select at least one batch");
      return;
    }
    if (!data.course_ids || data.course_ids.length === 0) {
      error("Please select at least one course");
      return;
      }
    }

    const selectedCampus = campuses.find(c => c.value === data.campus_id);
    const selectedBatches = batches.filter(b => data.batch_ids.includes(b.value));
    const selectedCourses = courses.filter(c => data.course_ids.includes(c.value));

    console.log('Step4AudienceSelection - Selected data:', {
      campus: selectedCampus,
      batches: selectedBatches,
      courses: selectedCourses,
    });

    updateTestData({
      campus: selectedCampus,
      batches: selectedBatches,
      courses: selectedCourses,
    });
    nextStep();
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        <div className="flex items-center space-x-3 border-b pb-4 border-gray-200">
          <div className="bg-blue-500 p-2 rounded-full text-white">
            <Briefcase className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-bold mb-4">Select Audience</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Column 1: Campus/Course/Batch based on role */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg text-gray-800">
              {user?.role === 'course_admin' ? '1. Select Batch' : 
               user?.role === 'campus_admin' ? '1. Select Course' : 
               '1. Select Campus'}
            </h3>
            {loadingStates.campuses ? <LoadingSpinner /> : (
              <>
                <select
                  {...register('campus_id', { required: 'Please make a selection' })}
                  className="w-full p-2 border border-gray-200 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 transition"
                >
                  <option value="" disabled>
                    {user?.role === 'course_admin' ? 'Choose a batch' : 
                     user?.role === 'campus_admin' ? 'Choose a course' : 
                     'Choose a campus'}
                  </option>
                  {campuses.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                {errors.campus_id && <p className="text-red-500 text-xs mt-1">{errors.campus_id.message}</p>}
              </>
            )}
          </div>

          {/* Column 2: Batches (only for campus admin and super admin) */}
          {user?.role !== 'course_admin' && (
          <div className={clsx("space-y-4", { 'opacity-50': !selectedCampusId })}>
            <h3 className="font-semibold text-lg text-gray-800">2. Select Batches</h3>
            {loadingStates.batches ? <LoadingSpinner /> : (
              batches.length > 0 ? (
                <Controller
                  name="batch_ids"
                  control={control}
                  rules={{ required: 'Please select at least one batch.' }}
                  render={({ field }) => (
                    <div className="space-y-2 max-h-60 overflow-y-auto border rounded-md p-2 border-gray-200">
                      {batches.map(batch => (
                        <CheckboxCard
                          key={batch.value}
                          id={`batch-${batch.value}`}
                          label={batch.label}
                          checked={field.value.includes(batch.value)}
                          onChange={(isChecked) => {
                            const newValue = isChecked
                              ? [...field.value, batch.value]
                              : field.value.filter(id => id !== batch.value);
                            field.onChange(newValue);
                          }}
                        />
                      ))}
                    </div>
                  )}
                />
                ) : <p className="text-sm text-gray-500 italic">
                  {selectedCampusId ? 'No batches found.' : 
                   user?.role === 'campus_admin' ? 'Select a course to see batches.' :
                   'Select a campus to see batches.'}
                </p>
            )}
            {errors.batch_ids && <p className="text-red-500 text-xs mt-1">{errors.batch_ids.message}</p>}
          </div>
          )}

          {/* Column 3: Courses (only for super admin) */}
          {user?.role === 'superadmin' && (
          <div className={clsx("space-y-4", { 'opacity-50': !selectedBatchIds || selectedBatchIds.length === 0 })}>
            <h3 className="font-semibold text-lg text-gray-800">3. Select Courses</h3>
            {loadingStates.courses ? <LoadingSpinner /> : (
              courses.length > 0 ? (
                <Controller
                  name="course_ids"
                  control={control}
                  rules={{ required: 'Please select at least one course.' }}
                  render={({ field }) => (
                    <div className="space-y-2 max-h-60 overflow-y-auto border rounded-md p-2 border-gray-200">
                      {courses.map(course => (
                        <CheckboxCard
                          key={course.value}
                          id={`course-${course.value}`}
                          label={course.label}
                          checked={field.value.includes(course.value)}
                          onChange={(isChecked) => {
                            const newValue = isChecked
                              ? [...field.value, course.value]
                              : field.value.filter(id => id !== course.value);
                            field.onChange(newValue);
                          }}
                        />
                      ))}
                    </div>
                  )}
                />
              ) : <p className="text-sm text-gray-500 italic">{selectedBatchIds?.length > 0 ? 'No courses found.' : 'Select one or more batches to see courses.'}</p>
            )}
            {errors.course_ids && <p className="text-red-500 text-xs mt-1">{errors.course_ids.message}</p>}
          </div>
          )}
        </div>

        <div className="flex justify-between items-center pt-8 border-t mt-8 border-gray-200">
          <button type="button" onClick={prevStep} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md text-gray-800 bg-gray-100 hover:bg-gray-200 transition-colors">
            <ChevronLeft className="h-5 w-5 mr-1" /> Back
          </button>
          <button type="submit" className="inline-flex items-center justify-center px-5 py-2.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-500 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-transform transform hover:scale-105">
            Next: Upload Questions <ChevronRight className="h-5 w-5 ml-2" />
          </button>
        </div>
      </form>
    </motion.div>
  )
}

const CheckboxCard = ({ id, label, checked, onChange }) => {
  return (
    <label
      htmlFor={id}
      className={clsx(
        'flex items-center p-3 w-full rounded-md cursor-pointer transition-all duration-200 ease-in-out border',
        {
          'bg-blue-100 border-blue-500 ring-1 ring-blue-500': checked,
          'bg-white hover:bg-gray-50 border-gray-200': !checked,
        }
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
      />
      <span className={clsx('ml-3 text-sm font-medium', { 'text-blue-900': checked, 'text-gray-800': !checked })}>
        {label}
      </span>
    </label>
  );
}

// Audio Generation Status Component
const AudioGenerationStatus = () => {
  const [status, setStatus] = useState('checking');
  const [available, setAvailable] = useState(false);
  const [details, setDetails] = useState('');

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await api.get('/test-management/check-audio-generation');
        if (response.data.success) {
          setAvailable(response.data.available);
          if (response.data.available) {
            setStatus('available');
            setDetails('Audio generation is working properly');
          } else {
            setStatus('unavailable');
            const missing = [];
            if (!response.data.gtts_available) missing.push('gtts');
            if (!response.data.pydub_available) missing.push('pydub');
            setDetails(`Missing packages: ${missing.join(', ')}`);
          }
        } else {
          setStatus('error');
          setDetails('Unable to check audio generation status');
        }
      } catch (error) {
        setStatus('error');
        setDetails('Failed to check audio generation status');
      }
    };

    checkStatus();
  }, []);

  const getStatusColor = () => {
    switch (status) {
      case 'available': return 'text-green-600';
      case 'unavailable': return 'text-red-600';
      case 'error': return 'text-yellow-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'available': return '✅';
      case 'unavailable': return '❌';
      case 'error': return '⚠️';
      default: return '⏳';
    }
  };

  return (
    <div className={`text-xs ${getStatusColor()} flex items-center space-x-1`}>
      <span>{getStatusIcon()}</span>
      <span>{details}</span>
    </div>
  );
};

const Step5OnlineTestConfig = ({ nextStep, prevStep, updateTestData, testData }) => {
  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm({
    defaultValues: {
      startDateTime: testData.startDateTime ? new Date(testData.startDateTime) : null,
      endDateTime: testData.endDateTime ? new Date(testData.endDateTime) : null,
      duration: testData.duration || 30,
    }
  })
  const { error } = useNotification()

  const startDateTime = watch('startDateTime')
  const endDateTime = watch('endDateTime')
  const duration = watch('duration')

  const onSubmit = (data) => {
    // Validate that start date is before end date
    if (data.startDateTime && data.endDateTime && data.startDateTime >= data.endDateTime) {
      error("Start date must be before end date");
      return;
    }

    // Validate that start date is in the future
    if (data.startDateTime && data.startDateTime <= new Date()) {
      error("Start date must be in the future");
      return;
    }

    // Validate duration is positive
    if (data.duration <= 0) {
      error("Duration must be greater than 0");
      return;
    }

    updateTestData({
      startDateTime: data.startDateTime,
      endDateTime: data.endDateTime,
      duration: data.duration,
    });
    nextStep();
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        <div className="flex items-center space-x-3 border-b pb-4 border-gray-200">
          <div className="bg-purple-500 p-2 rounded-full text-white">
            <Briefcase className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-bold mb-4">Configure Online Test</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Start Date & Time */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg text-gray-800">Start Date & Time</h3>
            <Controller
              name="startDateTime"
              control={control}
              rules={{ required: 'Start date and time are required' }}
              render={({ field }) => (
                <DatePicker
                  selected={field.value}
                  onChange={(date) => field.onChange(date)}
                  showTimeSelect
                  timeFormat="HH:mm"
                  timeIntervals={15}
                  dateFormat="MMMM d, yyyy h:mm aa"
                  minDate={new Date()}
                  className="w-full p-3 border border-gray-200 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 transition"
                  placeholderText="Select start date and time"
                />
              )}
            />
            {errors.startDateTime && <p className="text-red-500 text-xs mt-1">{errors.startDateTime.message}</p>}
          </div>

          {/* End Date & Time */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg text-gray-800">End Date & Time</h3>
            <Controller
              name="endDateTime"
              control={control}
              rules={{ required: 'End date and time are required' }}
              render={({ field }) => (
                <DatePicker
                  selected={field.value}
                  onChange={(date) => field.onChange(date)}
                  showTimeSelect
                  timeFormat="HH:mm"
                  timeIntervals={15}
                  dateFormat="MMMM d, yyyy h:mm aa"
                  minDate={startDateTime || new Date()}
                  className="w-full p-3 border border-gray-200 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 transition"
                  placeholderText="Select end date and time"
                />
              )}
            />
            {errors.endDateTime && <p className="text-red-500 text-xs mt-1">{errors.endDateTime.message}</p>}
          </div>
        </div>

        {/* Duration */}
        <div className="space-y-4">
          <h3 className="font-semibold text-lg text-gray-800">Test Duration (minutes)</h3>
          <input
            {...register('duration', { 
              required: 'Duration is required',
              min: { value: 1, message: 'Duration must be at least 1 minute' },
              max: { value: 480, message: 'Duration cannot exceed 8 hours' }
            })}
            type="number"
            min="1"
            max="480"
            className="w-full p-3 border border-gray-200 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 transition"
            placeholder="Enter test duration in minutes"
          />
          {errors.duration && <p className="text-red-500 text-xs mt-1">{errors.duration.message}</p>}
          <p className="text-sm text-gray-600">Maximum duration: 8 hours (480 minutes)</p>
        </div>

        {/* Information Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Online Test Configuration</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Students can only access the test during the specified time window</li>
                <li>The duration is the maximum time each student has to complete the test</li>
                <li>Once started, students must complete the test within the duration limit</li>
                <li>Tests will automatically close when the end time is reached</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center pt-8 border-t border-gray-100 mt-10">
          <button
            type="button"
            onClick={prevStep}
            className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium rounded-xl text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all duration-200 hover:shadow-md transform hover:scale-105"
          >
            <ChevronLeft className="h-5 w-5 mr-2" />
            Back
          </button>
          <button
            type="submit"
            className="inline-flex items-center justify-center px-8 py-3 text-sm font-medium rounded-xl shadow-lg text-white bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 focus:outline-none focus:ring-4 focus:ring-purple-200 transition-all duration-200 transform hover:scale-105 hover:shadow-xl"
          >
            Next: Upload Questions
            <ChevronRight className="h-5 w-5 ml-2" />
          </button>
        </div>
      </form>
    </motion.div>
  );
};

const Step5QuestionUpload = ({ nextStep, prevStep, updateTestData, testData, uploadedQuestions, setUploadedQuestions }) => {
  const { success, error: showError } = useNotification();
  const [questionSource, setQuestionSource] = useState('manual');
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bankQuestions, setBankQuestions] = useState([]);
  const [selectedBankQuestions, setSelectedBankQuestions] = useState([]);
  const [loadingBankQuestions, setLoadingBankQuestions] = useState(false);
  const [showQuestionCountModal, setShowQuestionCountModal] = useState(false);
  const [showQuestionPreview, setShowQuestionPreview] = useState(false);
  const [questionCount, setQuestionCount] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMoreQuestions, setHasMoreQuestions] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState('');

  // New state for technical test question type
  const [technicalQuestionType, setTechnicalQuestionType] = useState('compiler'); // 'compiler' or 'mcq'
  const [showQuestionTypeModal, setShowQuestionTypeModal] = useState(false);

  // Audio generation state
  const [generatedAudioFiles, setGeneratedAudioFiles] = useState([]);
  const [audioGenerationProgress, setAudioGenerationProgress] = useState(0);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);

  // Fetch questions from bank when source changes
  useEffect(() => {
    if (questionSource === 'bank') {
      fetchQuestionsFromBank();
    }
  }, [questionSource, testData.module, testData.level, testData.subcategory]);

  // Update selectedTopic when testData changes
  useEffect(() => {
    if (testData.topic_id || testData.selectedTopic) {
      setSelectedTopic(testData.topic_id || testData.selectedTopic || '');
    }
  }, [testData.topic_id, testData.selectedTopic]);

  const fetchQuestionsFromBank = async (count = 50, page = 1, append = false) => {
    if (page === 1) {
      setLoadingBankQuestions(true);
    } else {
      setLoadingMore(true);
    }

    try {
      // Determine the correct level_id based on module type
      let levelId = testData.level;
      let subcategory = testData.subcategory;
      let topicId = testData.topic_id || selectedTopic;

      if (testData.module.startsWith('CRT_')) {
        // For CRT modules, don't set level_id unless it's specifically needed
        // The backend will handle CRT modules without level_id
        levelId = null;
        subcategory = null;
      } else if (testData.module === 'GRAMMAR') {
        // For Grammar, use level as level_id (since level contains the grammar category)
        levelId = testData.level;
        subcategory = testData.subcategory;
      } else {
        // For other modules (VOCABULARY, READING, LISTENING, SPEAKING, WRITING)
        levelId = testData.level;
        subcategory = null;
      }

      console.log('Fetching questions for CRT module:', {
        module_id: testData.module,
        level_id: levelId,
        subcategory: subcategory,
        topic_id: topicId,
        count: count,
        page: page,
        original_level: testData.level,
        original_subcategory: testData.subcategory,
        isCRT: testData.module.startsWith('CRT_')
      });

      // Use the new bulk selection endpoint
      const payload = {
        module_id: testData.module,
        level_id: levelId,
        subcategory: subcategory,
        topic_id: topicId,
        question_count: count,
        page: page,
        limit: count
      };

      let response = await api.post('/test-management/question-bank/bulk-selection', payload);

      // If no questions found and it's Grammar, try with subcategory as level_id
      if (testData.module === 'GRAMMAR' && (!response.data.success || !response.data.questions || response.data.questions.length === 0)) {
        console.log('No questions found with level, trying with subcategory as level_id');
        payload.level_id = testData.subcategory;
        payload.subcategory = null;
        response = await api.post('/test-management/question-bank/bulk-selection', payload);
      }

      // If no questions found for CRT_TECHNICAL, try without level_id
      if (testData.module === 'CRT_TECHNICAL' && (!response.data.success || !response.data.questions || response.data.questions.length === 0)) {
        console.log('No questions found for CRT_TECHNICAL with level_id, trying without level_id');
        delete payload.level_id;
        response = await api.post('/test-management/question-bank/bulk-selection', payload);
      }

      if (response.data.success) {
        const questions = response.data.questions || [];
        const totalQuestions = response.data.total_count || 0;
        const hasMore = response.data.has_more || false;

        console.log('Successfully fetched questions:', {
          questionsCount: questions.length,
          totalQuestions: totalQuestions,
          hasMore: hasMore,
          firstQuestion: questions[0] ? questions[0].question?.substring(0, 100) : 'No questions',
          module: testData.module,
          level: testData.level,
          topic_id: testData.topic_id
        });

        if (append) {
          setBankQuestions(prev => [...prev, ...questions]);
        } else {
          setBankQuestions(questions);
        }

        setHasMoreQuestions(hasMore);
        setCurrentPage(page);
        console.log('Fetched questions:', questions.length, 'Total:', totalQuestions, 'Has more:', hasMore);
        return questions;
      } else {
        console.error('Failed to fetch questions:', response.data.message);
        console.error('Response data:', response.data);
        setError('Failed to fetch questions from bank');
        return [];
      }
    } catch (error) {
      console.error('Error fetching questions from bank:', error);
      setError('Failed to fetch questions from bank');
      return [];
    } finally {
      setLoadingBankQuestions(false);
      setLoadingMore(false);
    }
  };

  const loadMoreQuestions = async () => {
    if (loadingMore || !hasMoreQuestions) return;

    const nextPage = currentPage + 1;
    await fetchQuestionsFromBank(50, nextPage, true);
  };

  const handleQuestionBankSelect = async () => {
    setQuestionSource('bank'); // Set the question source to bank
    setShowQuestionCountModal(true);
  };

  const handleQuestionCountConfirm = async () => {
    setShowQuestionCountModal(false);
    setLoadingBankQuestions(true);

    try {
      console.log('Starting question selection with:', {
        module: testData.module,
        level: testData.level,
        topic_id: testData.topic_id,
        selectedTopic: selectedTopic,
        questionCount: questionCount
      });

      // Debug: Log the test data to understand the configuration
      console.log('Test data configuration:', {
        module: testData.module,
        level: testData.level,
        moduleType: typeof testData.module,
        levelType: typeof testData.level
      });

      // For CRT modules, try to get more questions to ensure variety
      const fetchCount = testData.module?.startsWith('CRT_') ? questionCount * 2 : questionCount * 3;
      const fetchedQuestions = await fetchQuestionsFromBank(fetchCount);

      console.log('Fetched questions result:', {
        count: fetchedQuestions.length,
        questions: fetchedQuestions.slice(0, 2) // Log first 2 questions for debugging
      });

      // Debug: Log the structure of the first question to understand the data format
      if (fetchedQuestions.length > 0) {
        console.log('First question structure:', {
          id: fetchedQuestions[0]._id,
          question: fetchedQuestions[0].question,
          sentence: fetchedQuestions[0].sentence,
          text: fetchedQuestions[0].text,
          question_type: fetchedQuestions[0].question_type,
          module_id: fetchedQuestions[0].module_id,
          level_id: fetchedQuestions[0].level_id,
          fullQuestion: fetchedQuestions[0]
        });
      }

      if (fetchedQuestions.length > 0) {
        // Sample WITHOUT replacement to avoid repeats within the same test
        const shuffledQuestions = shuffleArray([...fetchedQuestions]);
        const selectedQuestions = shuffledQuestions.slice(0, Math.min(questionCount, fetchedQuestions.length));

        if (selectedQuestions.length < questionCount) {
          const moduleName = testData.module?.startsWith('CRT_') ? testData.module.replace('CRT_', '') : testData.module;
          showError(`Only ${selectedQuestions.length} unique questions available in the ${moduleName} bank. Please reduce the count or add more questions.`);
          return;
        }

        // Add repeat count information to each question
        const questionsWithRepeatInfo = selectedQuestions.map(question => {
          const historicalUsage = question.used_count || 0;
          const currentUsage = historicalUsage + 1; // This will be the current usage count

          // Determine repetition status
          let repetitionStatus = '';
          if (currentUsage === 1) {
            repetitionStatus = 'first_time'; // First time being used
          } else if (currentUsage === 2) {
            repetitionStatus = 'repeating_first_time'; // Second time total (first repeat)
          } else if (currentUsage === 3) {
            repetitionStatus = 'repeating_second_time'; // Third time total (second repeat)
          } else {
            repetitionStatus = `repeating_${currentUsage - 1}_time`; // Nth time total ((N-1)th repeat)
          }

          return {
            ...question,
            repeatCount: historicalUsage, // Keep original for display
            currentUsage: currentUsage, // Total times this question will be used
            repetitionStatus: repetitionStatus // Status for display
          };
        });

        // For LISTENING module, check and generate audio files if needed
        if (testData.module === 'LISTENING') {
          const questionsNeedingAudio = questionsWithRepeatInfo.filter(q => !q.audio_url && !q.has_audio);
          if (questionsNeedingAudio.length > 0) {
            success(`Selected ${selectedQuestions.length} questions. ${questionsNeedingAudio.length} questions need audio generation. Audio will be generated automatically.`);

            // Generate audio for questions that don't have it
            try {
              await generateAudioForQuestions(questionsNeedingAudio);
              // Update questions with audio URLs
              const updatedQuestions = questionsWithRepeatInfo.map(q => {
                if (!q.audio_url && !q.has_audio) {
                  // Find the generated audio for this question
                  const generatedAudio = generatedAudioFiles.find(audio => audio.question_id === q._id);
                  if (generatedAudio) {
                    return { ...q, audio_url: generatedAudio.audio_url, has_audio: true };
                  }
                }
                return q;
              });
              setUploadedQuestions(updatedQuestions);
              setSelectedBankQuestions(updatedQuestions);
            } catch (error) {
              console.error('Error generating audio:', error);
              const errorMessage = error.message.includes('packages')
                ? `Audio generation is not available on the server. Required packages (gtts, pydub) are not installed. You can continue without audio or contact your administrator to install the required packages.`
                : `Audio generation failed for ${questionsNeedingAudio.length} questions: ${error.message}. You can continue without audio or try again later.`;

              // Show warning instead of error, since user can continue
              showError(errorMessage);
              // Still show questions but without audio
              setUploadedQuestions(questionsWithRepeatInfo);
              setSelectedBankQuestions(questionsWithRepeatInfo);
            }
          } else {
            success(`Successfully selected ${selectedQuestions.length} questions from ${fetchedQuestions.length} available questions in the ${testData.module} question bank. All questions have audio files.`);
            setUploadedQuestions(questionsWithRepeatInfo);
            setSelectedBankQuestions(questionsWithRepeatInfo);
          }

          // Show info about audio generation process
          if (testData.module === 'LISTENING') {
            showError(`Note: Audio generation for ${questionsNeedingAudio.length} questions will be processed efficiently.`);
          }
        } else {
          setUploadedQuestions(questionsWithRepeatInfo);
          setSelectedBankQuestions(questionsWithRepeatInfo);
        }

        setShowQuestionPreview(true);
      } else {
        const moduleName = testData.module?.startsWith('CRT_') ? testData.module.replace('CRT_', '') : testData.module;
        const errorMessage = `No questions found in the ${moduleName} bank for the selected criteria. Please upload questions first using the "Manual Upload" option or check the question bank.`;
        setError(errorMessage);
        showError(errorMessage);
      }
    } catch (error) {
      console.error('Error selecting questions:', error);
      showError('Failed to select questions from the question bank.');
    } finally {
      setLoadingBankQuestions(false);
    }
  };

  const handlePreviewConfirm = () => {
    if (questionSource === 'bank') {
      // Add status field to question bank questions for consistency
      const questionsWithStatus = selectedBankQuestions.map(q => ({
        ...q,
        status: 'existing', // Question bank questions are always existing
        source: 'question_bank',
        // Preserve repetition status and other question bank specific fields
        repetitionStatus: q.repetitionStatus,
        repeatCount: q.repeatCount,
        currentUsage: q.currentUsage
      }));
      setUploadedQuestions(questionsWithStatus);
      // Keep questionSource as 'bank' to maintain proper UI display
      setQuestionSource('bank');
    } else {
      // For manual uploads, questions are already in uploadedQuestions
      setQuestionSource('manual');
    }
    setShowQuestionPreview(false);
    
    // Show success message and allow user to proceed
    const questionCount = questionSource === 'bank' ? selectedBankQuestions.length : uploadedQuestions.length;
    success(`Successfully processed ${questionCount} questions for test creation`);
  };

  const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // Function to check if audio generation is available
  const checkAudioGenerationAvailability = async () => {
    try {
      const response = await api.get('/test-management/check-audio-generation');
      return response.data.available;
    } catch (error) {
      console.error('Error checking audio generation availability:', error);
      return false;
    }
  };

  // Function to get audio generation configuration
  const getAudioGenerationConfig = () => {
    return {
      maxRetries: 3,
      minDelay: 1000, // 1 second
      maxDelay: 3000, // 3 seconds
      sequentialProcessing: true // Process efficiently for better performance
    };
  };

  // Function to generate audio for questions
  const generateAudioForQuestions = async (questions) => {
    // Check if audio generation is available first
    const isAvailable = await checkAudioGenerationAvailability();
    if (!isAvailable) {
      throw new Error('Audio generation is not available on the server. Required packages (gtts, pydub) are not installed.');
    }

    setIsGeneratingAudio(true);
    setAudioGenerationProgress(0);

    try {
      // Process questions efficiently for bulk audio generation
      const results = [];
      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        try {
          // Show progress without artificial delays
          if (i > 0) {
            showError(`Processing question ${i + 1}/${questions.length}...`);
          }

          // Call backend to generate audio
          const response = await api.post('/test-management/generate-audio', {
            text: question.text || question.question || question.sentence,
            question_id: question._id,
            module_id: testData.module,
            level_id: testData.level,
            audio_config: {
              accent: 'en-US',
              speed: 1.0
            }
          });

          if (response.data.success) {
            setAudioGenerationProgress((i + 1) / questions.length * 100);
            results.push({
              question_id: question._id,
              audio_url: response.data.audio_url,
              success: true
            });
          } else {
            throw new Error(response.data.message || 'Audio generation failed');
          }
        } catch (error) {
          console.error(`Error generating audio for question ${question._id}:`, error);

          // Simple error handling without rate limiting delays
          results.push({
            question_id: question._id,
            error: error.message,
            success: false
          });
        }
      }

      const successfulAudio = results.filter(r => r.success);
      const failedAudio = results.filter(r => !r.success);

      if (failedAudio.length > 0) {
        console.warn(`${failedAudio.length} audio files failed to generate:`, failedAudio);

        // Show error messages for failed audio generation
        failedAudio.forEach(failed => {
          if (failed.error) {
            showError(failed.error);
          }
        });
      }

      setGeneratedAudioFiles(successfulAudio);
      return successfulAudio;

    } catch (error) {
      console.error('Error in audio generation:', error);
      throw error;
    } finally {
      setIsGeneratingAudio(false);
      setAudioGenerationProgress(0);
    }
  };

  const handleQuestionSourceChange = (source) => {
    setQuestionSource(source);
    setError(''); // Clear any previous errors
    if (source === 'manual') {
      setUploadedQuestions([]);
      setSelectedBankQuestions([]);
    } else {
      setUploadedQuestions([]);
    }
  };

  const handleBankQuestionToggle = (question) => {
    setSelectedBankQuestions(prev => {
      const isSelected = prev.find(q => q._id === question._id);
      if (isSelected) {
        return prev.filter(q => q._id !== question._id);
      } else {
        return [...prev, question];
      }
    });
  };

  const handleConfirmBankQuestions = () => {
    // Add status field to question bank questions for consistency
    const questionsWithStatus = selectedBankQuestions.map(q => ({
      ...q,
      status: 'existing', // Question bank questions are always existing
      source: 'question_bank',
      // Preserve repetition status and other question bank specific fields
      repetitionStatus: q.repetitionStatus,
      repeatCount: q.repeatCount,
      currentUsage: q.currentUsage
    }));
    setUploadedQuestions(questionsWithStatus);
    setQuestionSource('bank'); // Keep as 'bank' to maintain proper UI display
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      setError('');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please select a file first.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('module_id', testData.module);
      formData.append('level_id', testData.level);

      // Add question type for technical tests
      if (testData.technical_question_type) {
        formData.append('question_type', testData.technical_question_type);
      }

      if (testData.subcategory) {
        formData.append('subcategory', testData.subcategory);
      }

      if (testData.topic_id) {
        formData.append('topic_id', testData.topic_id);
      }

      const response = await api.post('/test-management/upload-questions', formData);

      if (response.data.success) {
        console.log('Upload response:', response.data);
        console.log('Questions received:', response.data.questions);
        setUploadedQuestions(response.data.questions);
        
        // Show status information
        const statusSummary = response.data.status_summary;
        if (statusSummary) {
          const message = `Questions processed: ${statusSummary.new_questions} new, ${statusSummary.existing_questions} existing in database`;
          toast.success(message);
        } else {
        toast.success('Questions uploaded successfully!');
        }
        
        // Questions are now displayed directly in the main UI
        // No need to show preview modal for manual uploads
      } else {
        setError(response.data.message || 'Failed to upload questions');
      }
    } catch (error) {
      console.error('Error uploading questions:', error);
      setError(error.response?.data?.message || 'Failed to upload questions');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (uploadedQuestions.length === 0) {
      setError('Please add at least one question.');
      return;
    }
    setError('');
    updateTestData({ questions: uploadedQuestions });
    nextStep();
  };

  // Get display names for module and level
  const getModuleDisplayName = () => {
    const moduleNames = {
      'GRAMMAR': 'Grammar',
      'VOCABULARY': 'Vocabulary',
      'READING': 'Reading',
      'LISTENING': 'Listening',
      'SPEAKING': 'Speaking',
      'WRITING': 'Writing',
      'CRT': 'CRT'
    };
    return moduleNames[testData.module] || testData.module;
  };

  const getLevelDisplayName = () => {
    if (testData.module === 'GRAMMAR') {
      return testData.subcategory || 'Unknown Category';
    } else if (testData.module === 'CRT') {
      return testData.level || 'Unknown Level';
    } else {
      return testData.level || 'Unknown Level';
    }
  };

  // Get question count for the current module/topic
  const [localQuestionCount, setLocalQuestionCount] = useState(null);

  const getQuestionCount = () => {
    return localQuestionCount;
  };

  // Fetch question count when module/topic changes
  useEffect(() => {
    const fetchQuestionCount = async () => {
      if (!testData.module) return;

      try {
        // Determine the correct level_id based on module type
        let levelId = testData.level;

        if (testData.module.startsWith('CRT_')) {
          // For CRT modules, don't set level_id unless it's specifically needed
          // The backend will handle CRT modules without level_id
          levelId = null;
        }

        const payload = {
          module_id: testData.module,
          level_id: levelId,
          topic_id: testData.topic_id || selectedTopic
        };

        console.log('Fetching question count with payload:', payload);

        const response = await api.post('/test-management/question-bank/count', payload);
        if (response.data.success) {
          setLocalQuestionCount(response.data.available_count);
          console.log('Question count response:', response.data);
          console.log('Available count for CRT module:', response.data.available_count);
        } else {
          console.error('Question count failed:', response.data.message);
        }
      } catch (error) {
        console.error('Error fetching question count:', error);
        setLocalQuestionCount(0);
      }
    };

    fetchQuestionCount();
  }, [testData.module, testData.level, testData.topic_id, selectedTopic]);

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <div className="bg-blue-500 p-2 rounded-full text-white">
          <FileQuestion className="h-6 w-6" />
        </div>
        <h2 className="text-2xl font-bold">Question Upload</h2>
      </div>

      {/* Selected Module and Level Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-blue-800">Module:</span>
            <span className="text-sm text-blue-900 bg-blue-100 px-2 py-1 rounded">{getModuleDisplayName()}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-blue-800">Level:</span>
            <span className="text-sm text-blue-900 bg-blue-100 px-2 py-1 rounded">{getLevelDisplayName()}</span>
          </div>
          {testData.module === 'GRAMMAR' && testData.subcategory && (
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-blue-800">Category:</span>
              <span className="text-sm text-blue-900 bg-blue-100 px-2 py-1 rounded">{testData.subcategory}</span>
            </div>
          )}
        </div>
      </div>

      {/* Question Source Selection */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Choose Question Source</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <button
            onClick={() => handleQuestionSourceChange('manual')}
            className={`p-4 border-2 rounded-lg text-left transition-colors ${questionSource === 'manual'
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200 hover:border-gray-300'
              }`}
          >
            <div className="flex items-center space-x-3">
              <Upload className="h-6 w-6 text-blue-500" />
              <div>
                <h4 className="font-semibold">Manual Upload</h4>
                <p className="text-sm text-gray-600">Upload questions manually via file or form</p>
              </div>
            </div>
          </button>

          <button
            onClick={handleQuestionBankSelect}
            className={`p-4 border-2 rounded-lg text-left transition-colors ${questionSource === 'bank'
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200 hover:border-gray-300'
              }`}
          >
            <div className="flex items-center space-x-3">
              <Briefcase className="h-6 w-6 text-blue-500" />
              <div>
                <h4 className="font-semibold">Question Bank</h4>
                <p className="text-sm text-gray-600">Select questions from existing question bank</p>
                {testData.module && (
                  <p className="text-xs text-blue-600 mt-1">
                    Available: {getQuestionCount() || 'Loading...'} questions
                  </p>
                )}
                {testData.module === 'LISTENING' && (
                  <div className="mt-1">
                    <p className="text-xs text-green-600">
                      🎵 Audio will be auto-generated for listening tests
                    </p>
                    <AudioGenerationStatus />
                  </div>
                )}
              </div>
            </div>
          </button>

          {testData.test_type?.toLowerCase() === 'online' && (
            <button
              onClick={() => handleQuestionSourceChange('random')}
              className={`p-4 border-2 rounded-lg text-left transition-colors ${questionSource === 'random'
                ? 'border-green-500 bg-green-50'
                : 'border-gray-200 hover:border-gray-300'
                }`}
            >
              <div className="flex items-center space-x-3">
                <Shuffle className="h-6 w-6 text-green-500" />
                <div>
                  <h4 className="font-semibold">Random Questions</h4>
                  <p className="text-sm text-gray-600">Each student gets different random questions</p>
                </div>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Question Bank Selection */}
      {questionSource === 'bank' && (
        <div className="bg-white rounded-lg shadow-md p-6">


          {uploadedQuestions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No questions selected from the bank.</p>
              <p className="text-sm mt-2">Click on "Question Bank" to select questions.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Professional Header Section */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                      <CheckCircle className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-blue-900">
                        Question Selection Complete
                      </h3>
                      <p className="text-blue-700 text-sm">
                        {uploadedQuestions.length} unique questions selected from question bank
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-blue-600">{uploadedQuestions.length}</div>
                    <div className="text-xs text-blue-500 uppercase tracking-wide">Questions</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white rounded-lg p-4 border border-blue-100">
                    <div className="flex items-center space-x-2 mb-2">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <span className="text-sm font-medium text-gray-700">Quality Assurance</span>
                    </div>
                    <p className="text-xs text-gray-600">
                      Questions have been shuffled with no duplicates within this test. Repetition status shows usage across all tests.
                    </p>
                  </div>

                  {testData.module === 'LISTENING' && (
                    <div className="bg-white rounded-lg p-4 border border-blue-100">
                      <div className="flex items-center space-x-2 mb-2">
                        <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                        <span className="text-sm font-medium text-gray-700">Audio Generation</span>
                      </div>
                      <p className="text-xs text-gray-600">
                        Audio files will be automatically generated using AWS text-to-speech for optimal listening experience.
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t border-blue-200">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-blue-600 font-medium">Ready to proceed?</span>
                    <button
                      onClick={handleNext}
                      disabled={uploadedQuestions.length === 0}
                      className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                    >
                      Continue to Next Step →
                    </button>
                  </div>
                </div>
              </div>

              {/* Professional Question Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {uploadedQuestions.map((question, index) => {
                  const isTechnicalQuestion = question.question_type === 'technical' ||
                    (testData.module === 'CRT' && testData.level === 'Technical');
                  const isSentenceQuestion = testData.module === 'LISTENING' || testData.module === 'SPEAKING' || question.question_type === 'sentence';

                  return (
                    <div
                      key={index}
                      className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow"
                    >
                      {/* Question Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                            <span className="text-white text-sm font-bold">Q{index + 1}</span>
                          </div>
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900 text-lg leading-tight">
                              {question.question || question.questionTitle || question.statement || question.problemStatement || question.text || 'Question text not available'}
                            </h4>
                          </div>
                        </div>
                      </div>

                      {/* Question Content */}
                      {isTechnicalQuestion ? (
                        <div className="space-y-3">
                          <div className="bg-gray-50 rounded-lg p-3">
                            <div className="text-sm font-medium text-gray-700 mb-2">Problem Statement</div>
                            <div className="text-gray-600">{question.problemStatement || question.statement || 'N/A'}</div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-blue-50 rounded-lg p-3">
                              <div className="text-xs font-medium text-blue-700 mb-1">Language</div>
                              <div className="text-blue-600 font-semibold">{question.language || 'python'}</div>
                            </div>
                            <div className="bg-green-50 rounded-lg p-3">
                              <div className="text-xs font-medium text-green-700 mb-1">Test Cases</div>
                              <div className="text-green-600 font-semibold">{Array.isArray(question.testCases) ? question.testCases.length : 'N/A'}</div>
                            </div>
                          </div>
                        </div>
                      ) : isSentenceQuestion ? (
                        <div className="space-y-4">
                          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-100">
                            <div className="flex items-center space-x-2 mb-2">
                              <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                                <span className="text-white text-xs">📝</span>
                              </div>
                              <span className="text-sm font-medium text-blue-700">Sentence Text</span>
                            </div>
                            <div className="text-gray-800 text-base leading-relaxed">
                              {question.text || question.question || question.questionTitle || question.statement || question.problemStatement || 'Sentence text not available'}
                            </div>
                          </div>

                          {testData.module === 'LISTENING' && (
                            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-4 border border-green-100">
                              <div className="flex items-center space-x-2 mb-2">
                                <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                                  <span className="text-white text-xs">🎵</span>
                                </div>
                                <span className="text-sm font-medium text-green-700">Audio Generation</span>
                              </div>
                              <div className="text-gray-700 text-sm">
                                Audio will be automatically generated using AWS text-to-speech for optimal listening experience.
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-gray-50 rounded-lg p-2">
                              <div className="text-xs font-medium text-gray-600">A</div>
                              <div className="text-gray-800">{question.optionA || 'N/A'}</div>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-2">
                              <div className="text-xs font-medium text-gray-600">B</div>
                              <div className="text-gray-800">{question.optionB || 'N/A'}</div>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-2">
                              <div className="text-xs font-medium text-gray-600">C</div>
                              <div className="text-gray-800">{question.optionC || 'N/A'}</div>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-2">
                              <div className="text-xs font-medium text-gray-600">D</div>
                              <div className="text-gray-800">{question.optionD || 'N/A'}</div>
                            </div>
                          </div>
                          <div className="bg-green-50 rounded-lg p-3 border border-green-100">
                            <div className="text-sm font-medium text-green-700 mb-1">Correct Answer</div>
                            <div className="text-green-800 font-semibold">{question.answer || 'N/A'}</div>
                          </div>
                        </div>
                      )}

                      {/* Question Tags */}
                      <div className="mt-4 pt-3 border-t border-gray-100">
                        <div className="flex flex-wrap gap-2">
                          {/* Source Tags */}
                          {question.source === 'question_bank' ? (
                            <>
                              <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full font-medium">
                                Question Bank
                              </span>
                              <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full font-medium">
                                Randomly Selected
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-medium">
                                Manual Upload
                              </span>
                              {question.status === 'new' && (
                                <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full font-medium">
                                  New (Added to DB)
                                </span>
                              )}
                              {question.status === 'existing' && (
                                <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full font-medium">
                                  Already in DB
                                </span>
                              )}
                            </>
                          )}
                          
                          {/* Module and Type Tags */}
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                            {testData.module || 'Module'}
                          </span>
                          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                            {question.question_type || 'Type'}
                          </span>
                          
                          {/* Usage Tags */}
                          {question.used_count > 0 && (
                            <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded-full font-medium">
                              Used {question.used_count} times
                            </span>
                          )}
                          
                          {/* Repetition Status Tags for Question Bank */}
                          {question.source === 'question_bank' && (
                            <>
                              <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-medium">
                                Selected
                              </span>
                              {question.repetitionStatus === 'first_time' && (
                                <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full font-medium">
                                  First Time
                                </span>
                              )}
                              {question.repetitionStatus === 'repeating_first_time' && (
                                <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full font-medium">
                                  Repeating First Time
                                </span>
                              )}
                              {question.repetitionStatus === 'repeating_second_time' && (
                                <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full font-medium">
                                  Repeating Second Time
                                </span>
                              )}
                              {question.repetitionStatus && question.repetitionStatus.startsWith('repeating_') && question.repetitionStatus !== 'repeating_first_time' && question.repetitionStatus !== 'repeating_second_time' && (
                                <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full font-medium">
                                  {question.repetitionStatus.replace('repeating_', 'Repeating ').replace('_', ' ').replace('time', 'Time')}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Random Question Configuration */}
      {questionSource === 'random' && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center space-x-2 mb-4">
            <Shuffle className="h-5 w-5 text-green-600" />
            <h3 className="text-lg font-semibold">Random Question Configuration</h3>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <div className="flex items-center space-x-2 mb-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="text-green-800 font-medium">Anti-Cheating Features</span>
            </div>
            <ul className="text-green-700 text-sm space-y-1">
              <li>• Each student receives different random questions from the question bank</li>
              <li>• MCQ options are shuffled for each student</li>
              <li>• Questions are distributed evenly across all students</li>
              <li>• No two students will have the same question set</li>
            </ul>
          </div>

          {/* Audio Generation Progress */}
          {isGeneratingAudio && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-center space-x-2 mb-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                <span className="text-blue-800 font-medium">Generating Audio Files</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2 mb-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${audioGenerationProgress}%` }}
                ></div>
              </div>
              <p className="text-blue-700 text-sm">
                Progress: {Math.round(audioGenerationProgress)}% - Generating audio for listening questions...
              </p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Questions per Student
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={questionCount}
                onChange={(e) => setQuestionCount(parseInt(e.target.value) || 10)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Number of questions per student"
              />
              <p className="text-xs text-gray-500 mt-1">
                Each student will receive this many random questions from the question bank
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Info className="h-4 w-4 text-blue-600" />
                <span className="text-blue-800 font-medium">Question Bank Status</span>
              </div>
              <div className="text-blue-700 text-sm space-y-1">
                <p>Available questions in bank: <span className="font-semibold">{bankQuestions.length}</span></p>
                <p>Questions needed: <span className="font-semibold">{questionCount} × {studentList.length} = {questionCount * studentList.length}</span></p>
                {bankQuestions.length < questionCount * studentList.length && (
                  <p className="text-red-600 font-semibold">
                    ⚠️ Not enough questions available. Please add more questions to the bank or reduce the count.
                  </p>
                )}
                {bankQuestions.length >= questionCount * studentList.length && (
                  <p className="text-green-600 font-semibold">
                    ✅ Sufficient questions available for all students
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Upload Section */}
      {questionSource === 'manual' && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4">
            Upload {testData.module === 'CRT_TECHNICAL' ?
              (testData.technical_question_type === 'compiler' ? 'Compiler-Integrated' : 'MCQ') :
              ''} Questions for {testData.module}
          </h3>

          {/* Audio Generation Status for Listening Module */}
          {testData.module === 'LISTENING' && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center space-x-2">
                <span className="text-yellow-600">🎵</span>
                <span className="text-sm text-yellow-800">
                  <strong>Note:</strong> For listening tests, audio files will be automatically generated from the text.
                  Make sure the text is clear and properly formatted for best audio quality.
                </span>
              </div>
            </div>
          )}

          {/* Technical Test Instructions */}
          {testData.module === 'CRT_TECHNICAL' && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center space-x-2 mb-3">
                <AlertCircle className="h-5 w-5 text-blue-600" />
                <h4 className="font-semibold text-blue-900">
                  {testData.technical_question_type === 'compiler' ? 'Compiler-Integrated' : 'MCQ'} Format
                </h4>
              </div>

              {testData.technical_question_type === 'compiler' ? (
                <div className="text-sm text-blue-800">
                  <p className="mb-2"><strong>Required CSV Format for Compiler-Integrated Questions:</strong></p>
                  <div className="space-y-1 font-mono text-xs bg-white p-3 rounded border border-blue-200">
                    <div><strong>Columns:</strong></div>
                    <div>• QuestionTitle - Title of the problem</div>
                    <div>• ProblemStatement - Detailed problem description</div>
                    <div>• Language - python, c, cpp, java, html</div>
                    <div>• Instructions - How to solve (optional)</div>
                    <div>• TestCaseID - Unique ID (TC001, TC002, etc.)</div>
                    <div>• Input - Test case input</div>
                    <div>• ExpectedOutput - Expected output</div>
                    <div>• Points - Points for this test case (default: 5)</div>
                    <div>• IsSample - true/false (visible to students)</div>
                  </div>
                  <p className="mt-3 text-xs bg-white p-2 rounded border border-blue-200">
                    <strong>Example Row:</strong><br/>
                    "Reverse String", "Write a function to reverse a string", "python", "Read string and print reversed", "TC001", "hello", "olleh", "5", "true"
                  </p>
                  <p className="mt-2 text-xs text-blue-700">
                    <strong>Note:</strong> Multiple test cases for same question = multiple rows with same QuestionTitle
                  </p>
                  <button
                    onClick={() => {
                      const csvContent = `QuestionTitle,ProblemStatement,Language,Instructions,TestCaseID,Input,ExpectedOutput,Points,IsSample
Reverse String,Write a function that takes a string as input and returns the reversed string,python,"Read a string from input and print the reversed string",TC001,hello,olleh,5,true
Reverse String,Write a function that takes a string as input and returns the reversed string,python,"Read a string from input and print the reversed string",TC002,world,dlrow,5,false
Sum Two Numbers,Write a program that reads two integers and prints their sum,python,"Read two integers from input (one per line) and print their sum",TC001,"5\n3",8,5,true
Sum Two Numbers,Write a program that reads two integers and prints their sum,python,"Read two integers from input (one per line) and print their sum",TC002,"10\n20",30,5,false`;
                      const blob = new Blob([csvContent], { type: 'text/csv' });
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'CRT_TECHNICAL_SAMPLE.csv';
                      a.click();
                      window.URL.revokeObjectURL(url);
                      toast.success('Sample CSV downloaded!');
                    }}
                    className="mt-3 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Download Sample CSV
                  </button>
                </div>
              ) : (
                <div className="text-sm text-blue-800">
                  <p className="mb-2"><strong>Required CSV Format for MCQ Questions:</strong></p>
                  <div className="space-y-1 font-mono text-xs">
                    <div>• Question, A, B, C, D</div>
                    <div>• Answer (A/B/C/D)</div>
                    <div>• Instructions (optional)</div>
                  </div>
                  <p className="mt-3 text-xs">
                    <strong>Example:</strong> "What is the time complexity of binary search?", "O(1)", "O(log n)", "O(n)", "O(n²)", "B"
                  </p>
                </div>
              )}
            </div>
          )}

          {/* File Upload Area */}
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors">
            <div className="flex flex-col items-center space-y-4">
              <Upload className="h-12 w-12 text-gray-400" />
              <div>
                <p className="text-lg font-medium text-gray-900">Choose a file or drag it here</p>
                <p className="text-sm text-gray-500 mt-1">
                  Supports CSV and Excel files
                </p>
              </div>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 cursor-pointer transition-colors"
              >
                Select File
              </label>
            </div>
          </div>

          {selectedFile && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="text-green-800 font-medium">File selected: {selectedFile.name}</span>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center space-x-2">
                <X className="h-5 w-5 text-red-600" />
                <span className="text-red-800">{error}</span>
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button
              onClick={handleUpload}
              disabled={!selectedFile || loading}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Uploading...' : 'Upload Questions'}
            </button>
          </div>

          {/* Display Uploaded Questions */}
          {uploadedQuestions.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-semibold text-gray-800">
                  Uploaded Questions ({uploadedQuestions.length})
                </h4>
                <div className="flex items-center space-x-2">
                  {questionSource === 'bank' ? (
                    <span className="text-sm text-gray-600">
                      {uploadedQuestions.filter(q => q.repetitionStatus === 'first_time').length} first time, {uploadedQuestions.filter(q => q.repetitionStatus && q.repetitionStatus.startsWith('repeating_')).length} repeating
                    </span>
                  ) : (
                    <span className="text-sm text-gray-600">
                      {uploadedQuestions.filter(q => q.status === 'new').length} new, {uploadedQuestions.filter(q => q.status === 'existing').length} existing
                    </span>
                  )}
                  <span className="text-xs text-gray-500">
                    (Total: {uploadedQuestions.length})
                  </span>
                </div>
              </div>
              
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {uploadedQuestions.map((question, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-sm font-medium text-gray-500">Question {index + 1}</span>
                      <div className="flex items-center space-x-2">
                        {question.source === 'question_bank' ? (
                          <>
                            <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">Question Bank</span>
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Randomly Selected</span>
                            {question.repetitionStatus === 'first_time' && (
                              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                First Time
                              </span>
                            )}
                            {question.repetitionStatus === 'repeating_first_time' && (
                              <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
                                Repeating First Time
                              </span>
                            )}
                            {question.repetitionStatus === 'repeating_second_time' && (
                              <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                                Repeating Second Time
                              </span>
                            )}
                            {question.repetitionStatus && question.repetitionStatus.startsWith('repeating_') && question.repetitionStatus !== 'repeating_first_time' && question.repetitionStatus !== 'repeating_second_time' && (
                              <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">
                                {question.repetitionStatus.replace('repeating_', 'Repeating ').replace('_', ' ').replace('time', 'Time')}
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Manual Upload</span>
                            {question.status === 'new' && (
                              <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                                New (Added to DB)
                              </span>
                            )}
                            {question.status === 'existing' && (
                              <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                                Already in DB
                              </span>
                            )}
                          </>
                        )}
                        <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">
                          MCQ
                        </span>
                      </div>
                    </div>
                    
                    <div className="mb-3">
                      <h4 className="font-medium text-gray-800 mb-2">{question.question_text || question.question}</h4>
                      {question.instructions && (
                        <p className="text-sm text-gray-600 mb-2">{question.instructions}</p>
                      )}
                      {question.source === 'question_bank' && question.repeatCount !== undefined && (
                        <p className="text-xs text-gray-500 mb-2">
                          Previously used {question.repeatCount} times | Current usage: {question.currentUsage || question.repeatCount + 1}
                        </p>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      {question.options ? (
                        // Manual upload format (object with A, B, C, D keys)
                        Object.entries(question.options).map(([key, value]) => (
                          <div key={key} className="flex items-center space-x-2">
                            <span className="font-medium text-gray-600 w-6">{key}.</span>
                            <span className="text-gray-700">{value}</span>
                            {question.correct_answer === key && (
                              <span className="text-green-600 text-sm font-medium">✓ Correct</span>
                            )}
                          </div>
                        ))
                      ) : (
                        // Question bank format (optionA, optionB, optionC, optionD fields)
                        ['A', 'B', 'C', 'D'].map(letter => {
                          const optionValue = question[`option${letter}`];
                          if (!optionValue) return null;
                          return (
                            <div key={letter} className="flex items-center space-x-2">
                              <span className="font-medium text-gray-600 w-6">{letter}.</span>
                              <span className="text-gray-700">{optionValue}</span>
                              {question.answer === letter && (
                                <span className="text-green-600 text-sm font-medium">✓ Correct</span>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-4 pt-4 border-t border-blue-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-blue-600 font-medium">Ready to proceed?</span>
                  <button
                    onClick={handleNext}
                    disabled={uploadedQuestions.length === 0}
                    className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                    Continue to Next Step →
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}



      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600">{error}</p>
        </div>
      )}



      {/* Question Count Modal */}
      {showQuestionCountModal && (
        <Modal
          isOpen={showQuestionCountModal}
          onClose={() => setShowQuestionCountModal(false)}
          title="Select Number of Questions"
        >
          <div className="space-y-4">
            <p className="text-gray-600">
              How many questions would you like to select from the question bank?
            </p>
            <p className="text-sm text-blue-600 bg-blue-50 p-2 rounded">
              Note: Questions will be randomly selected without duplicates within this test. Questions will show their repetition status (First Time, Repeating First Time, Repeating Second Time, etc.).
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Number of Questions
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={questionCount}
                onChange={(e) => setQuestionCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter number of questions"
              />
            </div>
            <div className="flex justify-end space-x-3 pt-4">
              <button
                onClick={() => setShowQuestionCountModal(false)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleQuestionCountConfirm}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                Confirm
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Question Preview Modal */}
      {showQuestionPreview && (
        <Modal
          isOpen={showQuestionPreview}
          onClose={() => {
            // Don't clear selectedBankQuestions when closing modal
            setShowQuestionPreview(false);
          }}
          title={`Preview Questions (${questionSource === 'bank' ? selectedBankQuestions.length : uploadedQuestions.length} selected)`}
          size="lg"
        >
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {testData.module === 'LISTENING' && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">🎵</span>
                  </div>
                  <span className="text-blue-800 font-medium text-sm">Audio Generation</span>
                </div>
                <p className="text-blue-700 text-xs mt-1">
                  Audio files will be automatically generated from sentence text using AWS text-to-speech for listening tests.
                </p>
              </div>
            )}
            {(() => {
              const questionsToShow = questionSource === 'bank' ? selectedBankQuestions : uploadedQuestions;
              return questionsToShow.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-gray-500 mb-4">
                  <FileQuestion className="w-12 h-12 mx-auto mb-2" />
                  <p className="text-lg font-medium">No questions found</p>
                    <p className="text-sm">No questions are available for this module.</p>
                </div>
                <div className="text-sm text-gray-600 space-y-2">
                  <p>• Make sure questions have been uploaded for <strong>{testData.module}</strong></p>
                  <p>• Check that the questions are uploaded with the correct module and level</p>
                  <p>• Try uploading questions manually or check the question bank</p>
                </div>
              </div>
            ) : (
                questionsToShow.map((question, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-sm font-medium text-gray-500">Question {index + 1}</span>
                    <div className="flex items-center space-x-2">
                      {questionSource === 'bank' ? (
                        <>
                          <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">Question Bank</span>
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Randomly Selected</span>
                          {question.repetitionStatus === 'first_time' && (
                            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                              First Time
                            </span>
                          )}
                          {question.repetitionStatus === 'repeating_first_time' && (
                            <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
                              Repeating First Time
                            </span>
                          )}
                          {question.repetitionStatus === 'repeating_second_time' && (
                            <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                              Repeating Second Time
                            </span>
                          )}
                          {question.repetitionStatus && question.repetitionStatus.startsWith('repeating_') && question.repetitionStatus !== 'repeating_first_time' && question.repetitionStatus !== 'repeating_second_time' && (
                            <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">
                              {question.repetitionStatus.replace('repeating_', 'Repeating ').replace('_', ' ').replace('time', 'Time')}
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Manual Upload</span>
                          {question.status === 'new' && (
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                              New (Added to DB)
                            </span>
                          )}
                          {question.status === 'existing' && (
                            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                              Already in DB
                            </span>
                          )}
                        </>
                      )}
                      {(question.question_type === 'compiler_integrated' || question.question_type === 'compiler') && (
                        <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">
                          Compiler
                        </span>
                      )}
                      {question.question_type === 'mcq' && (
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                          MCQ
                        </span>
                      )}
                      {(testData.module === 'LISTENING' || testData.module === 'SPEAKING' || question.question_type === 'sentence') && (
                        <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                          Sentence
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Usage information for question bank questions */}
                  {questionSource === 'bank' && question.repeatCount !== undefined && (
                    <div className="mb-3 p-2 bg-gray-50 rounded text-xs text-gray-600">
                      Previously used {question.repeatCount} times | Current usage: {question.currentUsage || question.repeatCount + 1}
                    </div>
                  )}

                  {/* Display based on question type */}
                  {questionSource === 'bank' && question.question_type === 'mcq' ? (
                    <div>
                      <div className="mb-3">
                        <h4 className="font-medium text-gray-800 mb-2">{question.question}</h4>
                        {question.instructions && (
                          <p className="text-sm text-gray-600 mb-2">{question.instructions}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        {['A', 'B', 'C', 'D'].map(letter => {
                          const optionValue = question[`option${letter}`];
                          if (!optionValue) return null;
                          return (
                            <div key={letter} className="flex items-center space-x-2">
                              <span className="font-medium text-gray-600 w-6">{letter}.</span>
                              <span className="text-gray-700">{optionValue}</span>
                              {question.answer === letter && (
                                <span className="text-green-600 text-sm font-medium">✓ Correct</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : questionSource === 'manual' && question.question_type === 'MCQ' ? (
                    <div>
                      <div className="mb-3">
                        <h4 className="font-medium text-gray-800 mb-2">{question.question_text}</h4>
                        {question.instructions && (
                          <p className="text-sm text-gray-600 mb-2">{question.instructions}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        {question.options && Object.entries(question.options).map(([key, value]) => (
                          <div key={key} className="flex items-center space-x-2">
                            <span className="font-medium text-gray-600 w-6">{key}.</span>
                            <span className="text-gray-700">{value}</span>
                            {question.correct_answer === key && (
                              <span className="text-green-600 text-sm font-medium">✓ Correct</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (question.question_type === 'compiler_integrated' || question.question_type === 'compiler') ? (
                    <div>
                      <div className="mb-3">
                        <h4 className="font-medium text-gray-800 mb-2">{question.questionTitle || question.question}</h4>
                        <p className="text-gray-700">{question.problemStatement || question.statement}</p>
                      </div>
                      <div className="grid grid-cols-1 gap-2 text-sm">
                        <div className="bg-gray-50 p-2 rounded">
                          <span className="font-medium">Language:</span> {question.language || 'python'}
                        </div>
                        {question.instructions && (
                          <div className="bg-gray-50 p-2 rounded">
                            <span className="font-medium">Instructions:</span> {question.instructions}
                          </div>
                        )}
                        {(question.testCases || question.test_cases) && (question.testCases?.length > 0 || question.test_cases?.length > 0) && (
                          <div className="bg-gray-50 p-2 rounded">
                            <span className="font-medium">Test Cases:</span> {(question.testCases || question.test_cases).length} case(s)
                            <div className="mt-2 space-y-1">
                              {Array.isArray(question.testCases || question.test_cases) ? (
                                (question.testCases || question.test_cases).map((testCase, idx) => (
                                  <div key={idx} className="text-xs bg-white p-1 rounded border">
                                    <div><strong>Input:</strong> {testCase.input || testCase}</div>
                                    <div><strong>Expected:</strong> {testCase.expected_output || testCase.expectedOutput || 'N/A'}</div>
                                    <div><strong>Points:</strong> {testCase.points || 5}</div>
                                    {testCase.is_sample !== undefined && (
                                      <div><strong>Sample:</strong> {testCase.is_sample ? 'Yes (Visible)' : 'No (Hidden)'}</div>
                                    )}
                                  </div>
                                ))
                              ) : (
                                <div className="text-xs bg-white p-1 rounded border">
                                  <div><strong>Test Cases:</strong> {question.testCases || question.test_cases}</div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (testData.module === 'LISTENING' || testData.module === 'SPEAKING' || question.question_type === 'sentence') ? (
                    <div>
                      <p className="text-gray-800 mb-3">{question.text || question.question || question.questionTitle || question.statement || question.problemStatement || 'Sentence text not available'}</p>
                      <div className="bg-blue-50 p-3 rounded">
                        <div className="text-sm text-blue-800">
                          <strong>Type:</strong> Sentence-based Question
                        </div>
                        {testData.module === 'LISTENING' && (
                          <div className="mt-2 text-sm">
                            <strong>Audio Status:</strong> 🎵 Audio will be auto-generated for listening test
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-gray-800 mb-3">{question.question || question.questionTitle || question.statement || question.problemStatement || 'Question text not available'}</p>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="bg-gray-50 p-2 rounded">
                          <span className="font-medium">A:</span> {question.optionA || 'N/A'}
                        </div>
                        <div className="bg-gray-50 p-2 rounded">
                          <span className="font-medium">B:</span> {question.optionB || 'N/A'}
                        </div>
                        <div className="bg-gray-50 p-2 rounded">
                          <span className="font-medium">C:</span> {question.optionC || 'N/A'}
                        </div>
                        <div className="bg-gray-50 p-2 rounded">
                          <span className="font-medium">D:</span> {question.optionD || 'N/A'}
                        </div>
                      </div>
                      <div className="mt-2 text-sm">
                        <span className="font-medium text-green-600">Answer:</span> {question.answer || 'N/A'}
                      </div>
                    </div>
                  )}
                </div>
              ))
            );
            })()}
          </div>
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              onClick={() => {
                // Don't clear selectedBankQuestions when canceling
                setShowQuestionPreview(false);
              }}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handlePreviewConfirm}
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
            >
              Use These Questions
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

const Step6ConfirmAndGenerate = ({ prevStep, testData, onTestCreated, uploadedQuestions }) => {
  const [studentCount, setStudentCount] = useState(null);
  const [studentList, setStudentList] = useState([]);
  useEffect(() => {
    const fetchStudentCount = async () => {
      try {
        const res = await getStudentCount({
          campus: testData.campus?.value,
          batches: testData.batches?.map(b => b.value),
          courses: testData.courses?.map(c => c.value),
        });
        setStudentCount(res.data.count);
        setStudentList(res.data.students || []);
      } catch (error) {
        console.error('Error fetching student count:', error);
        setStudentCount('N/A');
        setStudentList([]);
      }
    };
    fetchStudentCount();
  }, [testData.campus, testData.batches, testData.courses]);

  const { success, error } = useNotification()
  const [loading, setLoading] = useState(false)
  const { control, handleSubmit } = useForm({
    defaultValues: {
      accent: testData.accent,
      speed: testData.speed,
    }
  })

  // Check if this is an MCQ module
  const isMcqModule = testData.module && ['GRAMMAR', 'VOCABULARY', 'READING'].includes(testData.module) || testData.module?.startsWith('CRT_')

  // Helper to format date/time
  const formatDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-IN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  // Validation for online test
  const isOnline = testData.test_type?.toLowerCase() === 'online';
  const missingDate = isOnline && (!testData.startDateTime || !testData.endDateTime);

  const accentOptions = [
    { value: 'en-US', label: 'English (US)' },
    { value: 'en-GB', label: 'English (UK)' },
    { value: 'en-AU', label: 'English (Australia)' },
  ]

  const speedOptions = [
    { value: 0.75, label: 'Slow (0.75x)' },
    { value: 1.0, label: 'Normal (1.0x)' },
    { value: 1.25, label: 'Fast (1.25x)' },
  ]

  const onSubmit = async (data) => {
    setLoading(true)
    try {
      // Ensure all questions have test_cases array for consistency
      const processedQuestions = uploadedQuestions.map(question => ({
        ...question,
        test_cases: question.test_cases || [] // Ensure test_cases array exists
      }));

      const payload = {
        test_name: testData.test_name,
        test_type: testData.test_type?.toLowerCase(),
        module_id: testData.module,
        campus_id: testData.campus?.value,
        course_ids: testData.courses.map(c => c.value),
        batch_ids: testData.batches.map(b => b.value),
        questions: processedQuestions,
        audio_config: isMcqModule ? {} : { accent: data.accent, speed: data.speed },
        assigned_student_ids: studentList && studentList.length > 0 ? studentList.map(s => s.id) : [], // Only assign to confirmed students
      };

      // Add question_type for CRT modules to ensure proper backend identification
      if (testData.module?.startsWith('CRT_')) {
        payload.question_type = testData.module === 'CRT_TECHNICAL' ? 'compiler' : 'mcq';
      }
      if (testData.test_type?.toLowerCase() === 'online') {
        // Always send ISO strings for startDateTime and endDateTime
        if (!testData.startDateTime || !testData.endDateTime) {
          error('Start and end date/time are required for online tests.');
          setLoading(false);
          return;
        }
        payload.startDateTime = new Date(testData.startDateTime).toISOString();
        payload.endDateTime = new Date(testData.endDateTime).toISOString();
        payload.duration = Number(testData.duration);
      }
      if (testData.module === 'GRAMMAR') {
        payload.subcategory = testData.subcategory;
        payload.level_id = null;
      } else if (testData.module === 'VOCABULARY') {
        payload.subcategory = null;
        payload.level_id = null;
      } else if (testData.module?.startsWith('CRT_')) {
        // For CRT modules, use the module ID directly as level_id
        payload.level_id = testData.module;
        payload.subcategory = null;
      } else {
        payload.level_id = testData.level;
        payload.subcategory = null;
      }
      // Debug log
      console.log('Submitting test creation payload:', payload);
      const res = await api.post('/test-management/create-test', payload)
      const newTestId = res.data?.data?.test_id;
      if (isMcqModule) {
        success("MCQ module created successfully!")
      } else {
        success("Test creation started! Audio generation is in progress.")
      }
      if (onTestCreated) onTestCreated(newTestId)
    } catch (err) {
      const errorMessage = err.response?.data?.message || "An unexpected error occurred while creating the test."
      if (err.response?.status === 409) {
        error(errorMessage);
      } else if (errorMessage.includes("E11000")) {
        error("A test with this ID already exists. Please try creating it again.")
      } else {
        error(errorMessage)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {loading && <LoadingSpinner message={isMcqModule ? "Creating MCQ module..." : "Generating audio and creating test..."} />}
        <div className="flex items-center space-x-3">
          <div className="bg-blue-500 p-2 rounded-full text-white">
            <Sparkles className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-bold mb-4">Final Confirmation</h2>
        </div>
        {missingDate && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <strong>Start and end date/time are required for online tests.</strong>
          </div>
        )}
        <div className="bg-gray-50 border border-gray-200 p-6 rounded-lg space-y-4">
          <h3 className="font-semibold text-lg text-gray-800 border-b border-gray-200 pb-3 mb-4">Test Summary</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <div><strong className="text-gray-500 block">Name:</strong><p className="text-gray-800">{testData.test_name}</p></div>
            <div><strong className="text-gray-500 block">Type:</strong><p className="text-gray-800">{testData.test_type}</p></div>
            <div><strong className="text-gray-500 block">Module:</strong><p className="text-gray-800">{typeof testData.module === 'object' ? testData.module.name || testData.module.label : testData.module}</p></div>
            {testData.subcategory ? (
              <div><strong className="text-gray-500 block">Category:</strong><p className="text-gray-800">{testData.subcategory}</p></div>
            ) : testData.level ? (
              <div><strong className="text-gray-500 block">Level:</strong><p className="text-gray-800">{testData.level}</p></div>
            ) : null}
            <div><strong className="text-gray-500 block">Campus:</strong><p className="text-gray-800">{testData.campus?.label}</p></div>
            <div><strong className="text-gray-500 block">Batches:</strong><p className="text-gray-800">{testData.batches?.map(b => b.label).join(', ')}</p></div>
            <div><strong className="text-gray-500 block">Courses:</strong><p className="text-gray-800">{testData.courses?.map(c => c.label).join(', ')}</p></div>
            {isOnline && (
              <>
                <div><strong className="text-gray-500 block">Start Date & Time:</strong><p className="text-gray-800">{formatDateTime(testData.startDateTime)}</p></div>
                <div><strong className="text-gray-500 block">End Date & Time:</strong><p className="text-gray-800">{formatDateTime(testData.endDateTime)}</p></div>
              </>
            )}
            <div><strong className="text-gray-500 block">Student Count:</strong><p className="text-gray-800">{studentCount === null ? 'Loading...' : studentCount}</p></div>
            <div className="col-span-full"><strong className="text-gray-500 block">Total Questions:</strong><p className="text-gray-800">{uploadedQuestions?.length}</p></div>
          </div>
          {/* Student List Table */}
          <div className="mt-6">
            <h4 className="font-semibold text-gray-700 mb-2">Students who will get access:</h4>
            <div className="max-h-48 overflow-y-auto border border-gray-200 rounded bg-white">
              {studentList.length === 0 ? (
                <div className="text-gray-500 text-sm p-4 text-center">
                  <div className="flex flex-col items-center space-y-2">
                    <AlertTriangle className="h-8 w-8 text-yellow-500" />
                    <p className="font-medium">No students found for the selected criteria</p>
                    <p className="text-xs text-gray-600">
                      This could be due to:
                    </p>
                    <ul className="text-xs text-gray-600 text-left space-y-1">
                      <li>• Students not uploaded to the selected batches</li>
                      <li>• Students not assigned to the selected courses</li>
                      <li>• Incorrect batch-course combinations</li>
                    </ul>
                    <div className="mt-3 p-2 bg-blue-50 rounded border border-blue-200">
                      <p className="text-xs text-blue-800">
                        <strong>Selected:</strong> Campus: {testData.campus?.label},
                        Batches: {testData.batches?.map(b => b.label).join(', ')},
                        Courses: {testData.courses?.map(c => c.label).join(', ')}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="p-3 bg-green-50 border-b border-green-200">
                    <p className="text-sm text-green-800 font-medium">
                      ✅ Found {studentList.length} student{studentList.length !== 1 ? 's' : ''} for this test
                    </p>
                  </div>
                  <table className="min-w-full text-sm border-separate border-spacing-0">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold text-gray-700 border-b">Name</th>
                        <th className="px-4 py-2 text-left font-semibold text-gray-700 border-b">Email</th>
                        <th className="px-4 py-2 text-center font-semibold text-gray-700 border-b">Roll Number</th>
                        <th className="px-4 py-2 text-center font-semibold text-gray-700 border-b">Course</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentList.map((s, idx) => (
                        <tr key={s.id} className={idx % 2 === 0 ? 'bg-white hover:bg-blue-50' : 'bg-gray-50 hover:bg-blue-50'}>
                          <td className="px-4 py-2 text-gray-900 border-b align-middle">{s.name}</td>
                          <td className="px-4 py-2 text-gray-900 border-b align-middle">{s.email}</td>
                          <td className="px-4 py-2 text-gray-900 border-b align-middle text-center">{s.roll_number || '-'}</td>
                          <td className="px-4 py-2 text-gray-600 border-b align-middle text-center">
                            {s.course_name && s.course_name !== 'Unknown Course' ? (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                                {s.course_name}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                                {s.course_name || 'Unknown Course'}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </div>
        </div>
        {!isMcqModule && (
          <div>
            <h3 className="text-lg font-medium text-gray-800 mb-2">Audio Configuration</h3>
            {testData.module === 'LISTENING' && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center space-x-2">
                  <span className="text-blue-600">ℹ️</span>
                  <span className="text-sm text-blue-800">
                    <strong>Audio Generation Status:</strong> Audio files will be automatically generated for listening questions.
                    If audio generation fails, the test will still be created but without audio files.
                  </span>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1">Voice Accent</label>
                <Controller
                  name="accent"
                  control={control}
                  render={({ field }) => (
                    <select {...field} className="mt-1 block w-full rounded-md border-gray-200 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm transition">
                      {accentOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  )}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1">Speech Speed</label>
                <Controller
                  name="speed"
                  control={control}
                  render={({ field }) => (
                    <select {...field} className="mt-1 block w-full rounded-md border-gray-200 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm transition">
                      {speedOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  )}
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center pt-4">
          <button type="button" onClick={prevStep} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md text-gray-800 bg-gray-100 hover:bg-gray-200 transition-colors">
            <ChevronLeft className="h-5 w-5 mr-1" /> Back
          </button>
          <button type="submit" disabled={loading || missingDate} className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-500 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-400 disabled:cursor-not-allowed transition-transform transform hover:scale-105">
            <CheckCircle className="h-6 w-6 mr-2" />
            {loading ? 'Processing...' : (isMcqModule ? 'Create MCQ Module' : (testData.module === 'LISTENING' ? 'Confirm and Create Test' : 'Confirm and Generate Audio'))}
          </button>
        </div>
      </form>
    </motion.div>
  )
}

// ModuleQuestionUpload component
const ModuleQuestionUpload = ({ onBack }) => {
  const [selectedModule, setSelectedModule] = useState(null);
  const [levelId, setLevelId] = useState('');
  const [questions, setQuestions] = useState([]);
  const [modules, setModules] = useState([]);
  const [levels, setLevels] = useState([]);
  const [currentStep, setCurrentStep] = useState('modules'); // 'modules' or 'levels'
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const { success, error } = useNotification();
  const [loading, setLoading] = useState(false);
  const [notifyModalOpen, setNotifyModalOpen] = useState(false);
  const [notifyResults, setNotifyResults] = useState([]);
  const [notifyLoading, setNotifyLoading] = useState(false);

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const res = await api.get('/test-management/get-test-data');
        setModules(res.data.data.modules || []);
        // Convert levels object to array format
        const levelsData = res.data.data.levels || {};
        const levelsArray = Object.entries(levelsData).map(([id, levelData]) => ({
          id: id,
          name: levelData.name || levelData,
          module_id: levelData.module_id || id.split('_')[0]
        }));
        setLevels(levelsArray);
      } catch (err) {
        error('Failed to fetch modules and levels');
      }
    };
    fetchOptions();
  }, []);

  const handleModuleSelect = (module) => {
    setSelectedModule(module);
    setCurrentStep('levels');
  };

  const handleBackToModules = () => {
    setSelectedModule(null);
    setLevelId('');
    setCurrentStep('modules');
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const fileExtension = file.name.toLowerCase().split('.').pop();
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let parsedQuestions = [];
        if (fileExtension === 'csv') {
          const result = Papa.parse(e.target.result, { header: true, skipEmptyLines: true });
          parsedQuestions = result.data.map(row => ({
            question: row.question || row.Question || '',
            instructions: row.instructions || row.Instructions || '',
          }));
        } else {
          const workbook = XLSX.read(e.target.result, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          parsedQuestions = jsonData.map(row => ({
            question: row.question || row.Question || '',
            instructions: row.instructions || row.Instructions || '',
          }));
        }
        setQuestions(parsedQuestions.filter(q => q && q.question && q.question.trim() !== ''));
        success(`Loaded ${parsedQuestions.length} questions.`);
      } catch (err) {
        error('Failed to parse file.');
      }
    };
    if (fileExtension === 'csv') {
      reader.readAsText(file, 'UTF-8');
    } else {
      reader.readAsArrayBuffer(file);
    }
    event.target.value = null;
  };

  const handleUpload = async () => {
    if (!selectedModule || !levelId || questions.length === 0) {
      error('Please select module, level, and upload questions.');
      return;
    }
    setLoading(true);
    try {
      await uploadModuleQuestions(selectedModule.id, levelId, questions);
      success('Questions uploaded to module bank!');
      setQuestions([]);
      // Reset to modules view after successful upload
      setSelectedModule(null);
      setLevelId('');
      setCurrentStep('modules');
    } catch (err) {
      error('Failed to upload questions.');
    } finally {
      setLoading(false);
    }
  };

  const handleNotifyStudents = async () => {
    setNotifyModalOpen(true);
    setNotifyLoading(true);
    try {
      if (!selectedModule || !levelId) {
        error('Please select a module and level.');
        setNotifyLoading(false);
        return;
      }
      // Find the test for this module/level (assume you have a way to get testId for the selected module/level)
      // If you have a test list, find the matching testId. Otherwise, you may need to fetch it.
      // For now, let's assume you have a function getTestIdForModuleLevel(selectedModule.id, levelId)
      const testId = await getTestIdForModuleLevel(selectedModule.id, levelId);
      if (!testId) {
        error('No test found for this module and level.');
        setNotifyLoading(false);
        return;
      }
      const res = await api.post(`/test-management/notify-students/${testId}`);
      const notifyResults = res.data.results || [];
      setNotifyResults(notifyResults);
    } catch (e) {
      error('Failed to notify students.');
      setNotifyResults([]);
    } finally {
      setNotifyLoading(false);
    }
  };

  // Render modules selection view
  if (currentStep === 'modules') {
    // Sort modules: Grammar, Vocabulary, then others
    const moduleOrder = ['Grammar', 'Vocabulary', 'Listening', 'Speaking', 'Reading', 'Writing'];
    const sortedModules = [
      ...moduleOrder
        .map(name => modules.find(m => m.name.toLowerCase() === name.toLowerCase()))
        .filter(Boolean),
      ...modules.filter(m => !moduleOrder.map(n => n.toLowerCase()).includes(m.name.toLowerCase())),
    ];
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800">Select Module for Question Upload</h1>
          <button onClick={onBack} className="text-sm font-medium text-gray-500 hover:text-green-600">&larr; Back</button>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Available Modules</h2>
            <p className="text-gray-600 mb-6">Click on a module to proceed with question upload for that module.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedModules.map((module) => (
              <motion.div
                key={module.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="bg-gradient-to-br from-green-50 to-green-100 border border-green-300 rounded-xl p-6 cursor-pointer hover:shadow-lg transition-all duration-200 hover:border-green-500"
                onClick={() => handleModuleSelect(module)}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="bg-green-600 p-2 rounded-lg">
                    <FileQuestion className="h-6 w-6 text-white" />
                  </div>
                  <ChevronRight className="h-5 w-5 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">{module.name}</h3>
                <p className="text-sm text-gray-600">Click to upload questions for this module</p>
              </motion.div>
            ))}
          </div>

          {modules.length === 0 && (
            <div className="text-center py-12">
              <FileQuestion className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No modules available</p>
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  // Render levels selection and upload view
  // For Grammar module, show grammar-specific levels
  const grammarLevels = [
    { id: 'noun', name: 'Noun' },
    { id: 'verb', name: 'Verb' },
    { id: 'adjective', name: 'Adjective' },
    { id: 'adverb', name: 'Adverb' },
    { id: 'preposition', name: 'Preposition' },
    { id: 'conjunction', name: 'Conjunction' },
    { id: 'interjection', name: 'Interjection' },
    { id: 'pronoun', name: 'Pronoun' },
  ];
  const isGrammar = selectedModule && selectedModule.name.toLowerCase() === 'grammar';
  const levelOptions = isGrammar ? grammarLevels : levels;

  // Dropdown animation state
  const selectedLevel = levelOptions.find(l => l.id === levelId);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Upload Questions</h1>
          <p className="text-gray-600 mt-2">Module: <span className="font-semibold text-green-700">{selectedModule?.name}</span></p>
        </div>
        <button onClick={handleBackToModules} className="text-sm font-medium text-gray-500 hover:text-green-600 transition-colors">&larr; Back to Modules</button>
      </div>
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="bg-gradient-to-br from-green-50 to-white rounded-2xl shadow-xl border border-green-200 p-8 max-w-3xl mx-auto"
      >
        {/* Level Dropdown */}
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:space-x-8 space-y-4 md:space-y-0">
          <div className="w-full md:w-1/2">
            <label className="block text-sm font-semibold text-gray-800 mb-2">Select Level</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setDropdownOpen(o => !o)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border-2 transition-all duration-200 bg-white text-gray-800 font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-green-200 ${dropdownOpen ? 'border-green-600' : 'border-green-300 hover:border-green-500'}`}
              >
                <span>{selectedLevel ? selectedLevel.name : 'Select Level'}</span>
                <motion.span animate={{ rotate: dropdownOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronDown className="h-5 w-5 text-green-600" />
                </motion.span>
              </button>
              {dropdownOpen && (
                <motion.ul
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute z-10 mt-2 w-full bg-white border border-green-200 rounded-lg shadow-lg max-h-60 overflow-y-auto"
                >
                  {levelOptions.map(l => (
                    <li
                      key={l.id}
                      onClick={() => { setLevelId(l.id); setDropdownOpen(false); }}
                      className={`px-4 py-2 cursor-pointer hover:bg-green-50 transition-colors ${levelId === l.id ? 'bg-green-100 text-green-700 font-semibold' : 'text-gray-800'}`}
                    >
                      {l.name}
                    </li>
                  ))}
                </motion.ul>
              )}
            </div>
          </div>
          {/* File Upload */}
          <div className="w-full md:w-1/2">
            <label className="block text-sm font-semibold text-gray-800 mb-2">Upload Questions (CSV/XLSX)</label>
            <label className="flex items-center gap-2 px-4 py-3 rounded-lg bg-green-50 border-2 border-green-300 hover:bg-green-100 hover:border-green-500 cursor-pointer transition-all duration-200 shadow-sm font-medium text-green-700">
              <Upload className="h-5 w-5 mr-2 text-green-600" />
              <span>Choose File</span>
              <input
                type="file"
                accept=".csv,.xlsx"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            <span className="block mt-2 text-xs text-gray-500">{questions.length === 0 ? 'No file chosen' : `${questions.length} questions loaded.`}</span>
          </div>
        </div>
        <hr className="my-6 border-green-100" />
        {/* Questions Status & Upload Button */}
        <div className="flex flex-col items-center space-y-4">
          <p className="text-gray-700">
            {questions.length > 0 ? (
              <span className="text-green-700 font-medium">{questions.length} questions ready to upload.</span>
            ) : (
              <span className="text-gray-500">No questions loaded yet. Please upload a file.</span>
            )}
          </p>
          <motion.button
            whileHover={{ scale: questions.length > 0 && levelId ? 1.04 : 1, boxShadow: questions.length > 0 && levelId ? '0 4px 16px 0 rgba(22, 163, 74, 0.15)' : 'none' }}
            whileTap={{ scale: questions.length > 0 && levelId ? 0.98 : 1 }}
            onClick={handleUpload}
            disabled={loading || !levelId || questions.length === 0}
            className={`w-full md:w-auto px-8 py-3 rounded-lg font-semibold transition-all duration-200 text-white ${loading || !levelId || questions.length === 0 ? 'bg-gray-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 shadow-lg'}`}
          >
            {loading ? 'Uploading...' : 'Upload to Module Bank'}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// Helper function to get testId for a module and level (implement as needed)
async function getTestIdForModuleLevel(moduleId, levelId) {
  // You may need to fetch all tests and find the one matching moduleId and levelId
  try {
    const res = await api.get('/test-management/tests');
    const tests = res.data.data || [];
    const test = tests.find(t => t.module_id === moduleId && t.level_id === levelId);
    return test ? test._id || test.id : null;
  } catch {
    return null;
  }
}

export default TestManagement;

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useForm, Controller } from 'react-hook-form'
import { useAuth } from '../../contexts/AuthContext'
import { useNotification } from '../../contexts/NotificationContext'
import { useLocation } from 'react-router-dom'
import Header from '../../components/common/Header'
import SuperAdminSidebar from '../../components/common/SuperAdminSidebar'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import api from '../../services/api'
import { Upload, Plus, Trash2, ChevronLeft, ChevronRight, FileText, CheckCircle, Briefcase, Users, FileQuestion, Sparkles, Eye, Edit, MoreVertical, Play, Pause, AlertTriangle, ChevronDown } from 'lucide-react'
import { MultiSelect } from 'react-multi-select-component'
import clsx from 'clsx'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { uploadModuleQuestions, getRandomQuestionsFromBank, createTestFromBank, getAllTests, getStudentCount } from '../../services/api'
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import Modal from '../../components/common/Modal';

const TestManagement = () => {
  const location = useLocation()
  const [view, setView] = useState('list')
  const [currentTestId, setCurrentTestId] = useState(null)
  const [tests, setTests] = useState([])
  const [loading, setLoading] = useState(true)
  const [processingTests, setProcessingTests] = useState(new Set())
  const { success, error, a } = useNotification()
  const { loading: isAuthLoading } = useAuth()
  const pollingIntervalRef = useRef(null)
  const [selectedTest, setSelectedTest] = useState(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [baseName, setBaseName] = useState('')
  const [sequence, setSequence] = useState(1)

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
  }, [error])

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
  }, [processingTests, success, error]);

  const handleTestCreated = (newTestId) => {
    setView('list')
    if (newTestId) {
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

  const renderContent = () => {
    switch (view) {
      case 'create':
        return <TestCreationWizard onTestCreated={handleTestCreated} setView={setView} />
      case 'preview':
        if (isPreviewLoading) {
          return <div className="flex justify-center items-center h-screen"><LoadingSpinner /></div>;
        }
        return <TestPreviewView test={selectedTest} onBack={handleBackToList} />
      case 'module-upload':
        return <ModuleQuestionUpload onBack={() => setView('list')} />
      case 'list':
      default:
        return <TestListView tests={tests} loading={loading} setView={setView} onViewTest={handleViewTest} onDeleteTest={handleDeleteTest} />
    }
  }

  return (
    <div className="min-h-screen bg-background flex">
      <SuperAdminSidebar onModuleUpload={() => setView('module-upload')} />
      <div className="flex-1 lg:pl-64">
        <Header />
        <main className="px-6 lg:px-10 py-12">
          {renderContent()}
        </main>
      </div>
    </div>
  )
}

const TestListView = ({ tests, loading, setView, onViewTest, onDeleteTest }) => {
  const [filters, setFilters] = useState({
    module: '',
    level: '',
    campus: '',
    status: '',
  });

  const filteredTests = useMemo(() => {
    return tests.filter(test => {
      return (
        (filters.module ? test.module_name === filters.module : true) &&
        (filters.level ? test.level_name === filters.level : true) &&
        (filters.campus ? test.campus_name === filters.campus : true) &&
        (filters.status ? test.status === filters.status : true)
      );
    });
  }, [tests, filters]);

  const moduleOptions = useMemo(() => [...new Set(tests.map(t => t.module_name).filter(Boolean))], [tests]);
  const levelOptions = useMemo(() => [...new Set(tests.map(t => t.level_name).filter(Boolean))], [tests]);
  const campusOptions = useMemo(() => [...new Set(tests.map(t => t.campus_name).filter(Boolean))], [tests]);
  const statusOptions = useMemo(() => [...new Set(tests.map(t => t.status).filter(Boolean))], [tests]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const clearFilters = () => {
    setFilters({ module: '', level: '', campus: '', status: '' });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Test Management</h1>
          <p className="mt-2 text-gray-500">Browse, manage, and create new tests.</p>
        </div>
        <button 
          onClick={() => setView('create')}
          className="inline-flex items-center justify-center px-5 py-2.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-500 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-transform transform hover:scale-105"
        >
          <Plus className="h-5 w-5 mr-2"/>
          Create Test
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-lg">
        <div className="p-6 flex justify-between items-center border-b border-gray-200">
          <h3 className="text-xl font-semibold text-gray-800">All Created Tests</h3>
          <button onClick={clearFilters} className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline">Clear Filters</button>
        </div>
        <div className="overflow-x-auto">
          {loading ? <LoadingSpinner /> : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th scope="col" className="w-1/6 px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Test Name</th>
                  <th scope="col" className="w-1/12 px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Type</th>
                  <th scope="col" className="w-1/12 px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    <span className="block mb-1">Module</span>
                    <select name="module" value={filters.module} onChange={handleFilterChange} className="w-full border-gray-300 rounded-md shadow-sm text-xs font-normal normal-case focus:ring-indigo-500 focus:border-indigo-500 bg-gray-700 text-white">
                      <option value="">All</option>
                      {moduleOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </th>
                  <th scope="col" className="w-1/12 px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    <span className="block mb-1">Level</span>
                    <select name="level" value={filters.level} onChange={handleFilterChange} className="w-full border-gray-300 rounded-md shadow-sm text-xs font-normal normal-case focus:ring-indigo-500 focus:border-indigo-500 bg-gray-700 text-white">
                      <option value="">All</option>
                      {levelOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </th>
                  <th scope="col" className="w-1/6 px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    <span className="block mb-1">Campus</span>
                    <select name="campus" value={filters.campus} onChange={handleFilterChange} className="w-full border-gray-300 rounded-md shadow-sm text-xs font-normal normal-case focus:ring-indigo-500 focus:border-indigo-500 bg-gray-700 text-white">
                      <option value="">All</option>
                      {campusOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </th>
                  <th scope="col" className="w-1/6 px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Batch</th>
                  <th scope="col" className="w-1/6 px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Courses</th>
                  <th scope="col" className="w-1/12 px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Questions</th>
                  <th scope="col" className="w-1/12 px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    <span className="block mb-1">Status</span>
                    <select name="status" value={filters.status} onChange={handleFilterChange} className="w-full border-gray-300 rounded-md shadow-sm text-xs font-normal normal-case focus:ring-indigo-500 focus:border-indigo-500 bg-gray-700 text-white">
                      <option value="">All</option>
                      {statusOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </th>
                  <th scope="col" className="w-1/12 px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Created At</th>
                  <th scope="col" className="w-1/12 relative px-6 py-4"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredTests.map((test, index) => (
                  <tr key={test._id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50 hover:bg-indigo-50'}>
                    <td className="px-6 py-4 whitespace-normal break-words text-sm font-medium text-gray-900">{test.name}</td>
                    <td className="px-6 py-4 whitespace-normal break-words text-sm text-gray-500 capitalize">{test.test_type}</td>
                    <td className="px-6 py-4 whitespace-normal break-words text-sm text-gray-500 capitalize">{test.module_name}</td>
                    <td className="px-6 py-4 whitespace-normal break-words text-sm text-gray-500 capitalize">{test.level_name || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-normal break-words text-sm text-gray-500">{test.campus_name || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-normal break-words text-sm text-gray-500">{test.batches}</td>
                    <td className="px-6 py-4 whitespace-normal break-words text-sm text-gray-500">{test.courses}</td>
                    <td className="px-6 py-4 whitespace-normal break-words text-sm text-gray-500 text-center">{test.question_count}</td>
                    <td className="px-6 py-4 whitespace-normal break-words text-sm">
                      <span className={clsx('px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full', {
                        'bg-green-100 text-green-800': test.status === 'active',
                        'bg-yellow-100 text-yellow-800': test.status === 'processing',
                        'bg-red-100 text-red-800': test.status === 'failed',
                      })}>
                        {test.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-normal break-words text-sm text-gray-500">{test.created_at}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button onClick={() => onViewTest(test._id)} className="text-indigo-600 hover:text-indigo-900 p-1 rounded-full hover:bg-gray-200" title="View Test"><Eye className="h-5 w-5"/></button>
                        <button className="text-gray-400 cursor-not-allowed p-1 rounded-full" title="Edit Test (soon)"><Edit className="h-5 w-5"/></button>
                        <button onClick={() => onDeleteTest(test._id)} className="text-red-600 hover:text-red-800 p-1 rounded-full hover:bg-gray-200" title="Delete Test"><Trash2 className="h-5 w-5"/></button>
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

const TestPreviewView = ({ test, onBack }) => {
  const { success, error } = useNotification();
  const [notifying, setNotifying] = useState(false);
  const [notifyModalOpen, setNotifyModalOpen] = useState(false);
  const [notifyResults, setNotifyResults] = useState([]);
  const [notifyLoading, setNotifyLoading] = useState(false);

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

  // Notify students handler
  const handleNotifyStudents = async () => {
    setNotifyModalOpen(true);
    setNotifyLoading(true);
    setNotifyResults([]);
    try {
      const res = await api.post(`/test-management/notify-students/${test._id}`);
      if (res.data && res.data.results) {
        setNotifyResults(res.data.results);
        success('Notification process completed!');
      } else {
        error('No results returned from notification API.');
      }
    } catch (e) {
      error('Failed to send notification.');
    } finally {
      setNotifyLoading(false);
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
            onClick={handleNotifyStudents}
            disabled={notifying}
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed"
          >
            {notifying ? 'Notifying...' : 'Notify Students'}
          </button>
        </div>
      </div>

      <div className="space-y-8">
        {test.questions && test.questions.map((q, index) => (
          <div key={q.question_id || index} className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
            <h3 className="font-semibold text-lg text-gray-800 mb-4">Question {index + 1}</h3>
            <p className="text-gray-700 mb-4 whitespace-pre-line">{q.question}</p>
            {q.question_type === 'mcq' ? (
              <div className="space-y-2 text-base">
                <h4 className="font-semibold text-gray-600 mb-1">Options:</h4>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 list-none pl-0">
                  {Object.entries(q.options).map(([key, value]) => (
                    <li key={key} className={clsx('rounded border px-4 py-2', {
                      'bg-green-50 border-green-400 font-bold text-green-700': q.correct_answer === key,
                      'bg-gray-50 border-gray-200': q.correct_answer !== key
                    })}>
                      <span className="font-semibold">{key}:</span> {value}
                    </li>
                  ))}
                </ul>
                <div className="pt-2">
                  <p className="font-semibold text-gray-600">Answer: <span className="font-bold text-green-600">{q.correct_answer}</span></p>
                </div>
              </div>
            ) : q.audio_presigned_url ? (
              <AudioPlayer src={q.audio_presigned_url} />
            ) : (
              <div className="flex items-center space-x-2 bg-yellow-100 text-yellow-800 text-sm font-medium px-4 py-3 rounded-md">
                <AlertTriangle className="h-5 w-5" />
                <span>Audio not available.</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Notify Students Modal */}
      {notifyModalOpen && (
        <Modal onClose={() => setNotifyModalOpen(false)} title="Notify Students">
          <div className="mb-4">
            <h3 className="font-semibold text-lg mb-2">Notification Status</h3>
            {notifyLoading ? (
              <div className="text-blue-600">Sending notifications...</div>
            ) : (
              <table className="min-w-full text-sm border rounded">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Email</th>
                    <th className="px-3 py-2 text-left">Mobile</th>
                    <th className="px-3 py-2 text-left">Test Status</th>
                    <th className="px-3 py-2 text-left">Email Notification</th>
                    <th className="px-3 py-2 text-left">SMS Status</th>
                  </tr>
                </thead>
                <tbody>
                  {notifyResults.map((s, idx) => (
                    <tr key={s.email} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-2">{s.name}</td>
                      <td className="px-3 py-2">{s.email}</td>
                      <td className="px-3 py-2">{s.mobile_number || '-'}</td>
                      <td className="px-3 py-2">
                        {s.test_status === 'completed' ? (
                          <span className="text-green-600 font-semibold">Completed</span>
                        ) : (
                          <span className="text-yellow-600 font-semibold">Pending</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {s.notify_status === 'sent' && <span className="text-green-700">Sent</span>}
                        {s.notify_status === 'skipped' && <span className="text-gray-500">Skipped</span>}
                        {s.notify_status === 'pending' && <span className="text-blue-500">Pending</span>}
                        {s.notify_status === 'failed' && <span className="text-red-600">Failed</span>}
                      </td>
                      <td className="px-3 py-2">
                        {s.sms_status === 'sent' && <span className="text-green-700">Sent</span>}
                        {s.sms_status === 'failed' && <span className="text-red-600">Failed</span>}
                        {s.sms_status === 'no_mobile' && <span className="text-gray-500">No Mobile</span>}
                        {!s.sms_status && <span className="text-gray-400">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!notifyLoading && notifyResults.length > 0 && (
              <div className="mt-4 text-sm">
                <span className="font-semibold">Summary:</span> {notifyResults.filter(r => r.notify_status === 'sent').length} notified, {notifyResults.filter(r => r.notify_status === 'skipped').length} skipped (already completed), {notifyResults.filter(r => r.notify_status === 'failed').length} failed.
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <button onClick={() => setNotifyModalOpen(false)} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">Close</button>
          </div>
        </Modal>
      )}
    </motion.div>
  )
}

const TestCreationWizard = ({ onTestCreated, setView }) => {
  const [step, setStep] = useState(1)
  const [testData, setTestData] = useState({
    testName: '',
    testType: '', // Start empty, force selection
    module: null,
    level: null,
    subcategory: null,
    campus: null,
    batches: [],
    courses: [],
    questions: [],
    accent: 'en-US',
    speed: 1.0,
  })

  const nextStep = () => setStep(prev => prev < 6 ? prev + 1 : prev)
  const prevStep = () => setStep(prev => prev > 1 ? prev - 1 : prev)

  const updateTestData = (data) => {
    setTestData(prev => ({ ...prev, ...data }))
  }

  const renderStep = () => {
    switch (step) {
      case 1:
        return <Step4AudienceSelection nextStep={nextStep} updateTestData={updateTestData} testData={testData} />;
      case 2:
        return <Step2TestType nextStep={nextStep} prevStep={prevStep} updateTestData={updateTestData} testData={testData} />;
      case 3:
        return <Step1TestDetails nextStep={nextStep} prevStep={prevStep} updateTestData={updateTestData} testData={testData} />;
      case 4:
        return <Step3TestName nextStep={nextStep} prevStep={prevStep} updateTestData={updateTestData} testData={testData} />;
      case 5:
        return <Step5QuestionUpload nextStep={nextStep} prevStep={prevStep} updateTestData={updateTestData} testData={testData} />;
      case 6:
        return <Step4ConfirmAndGenerate prevStep={prevStep} testData={testData} onTestCreated={onTestCreated} />;
      default:
        return <Step4AudienceSelection nextStep={nextStep} updateTestData={updateTestData} testData={testData} />;
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Create a New Test</h1>
          <p className="mt-2 text-gray-500">Follow the steps to configure and launch a test.</p>
        </div>
        <button onClick={() => setView('list')} className="text-sm font-medium text-gray-500 hover:text-blue-500">
          &larr; Back to Test List
        </button>
      </div>
      <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8">
        <div className="mb-8">
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <motion.div 
              className="bg-blue-500 h-2.5 rounded-full" 
              animate={{ width: `${((step - 1) / 5) * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <p className="text-right text-sm text-gray-500 mt-2">
            Step {step} of 6: {
              step === 1 ? 'Select Campus, Batch, and Course' :
              step === 2 ? 'Select Test Type' :
              step === 3 ? 'Select Module and Level' :
              step === 4 ? 'Enter Test Name' :
              step === 5 ? 'Upload Questions' :
              step === 6 ? 'Final Confirmation' : ''
            }
          </p>
        </div>
        {renderStep()}
      </div>
    </motion.div>
  )
}

const Step1TestDetails = ({ nextStep, prevStep, updateTestData, testData, step }) => {
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: {
      testName: testData.testName,
      testType: testData.testType,
      module: testData.module,
      level: testData.level,
      subcategory: testData.subcategory,
    }
  })
  const { error } = useNotification()
  const testType = watch('testType')
  const selectedModule = watch('module')
  const [modules, setModules] = useState([])
  const [levels, setLevels] = useState([])
  const [grammarCategories, setGrammarCategories] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const res = await api.get('/test-management/get-test-data')
        setModules(res.data.data.modules || [])
        setLevels(res.data.data.levels || [])
        setGrammarCategories(res.data.data.grammar_categories || [])
      } catch (err) {
        error("Failed to fetch modules and levels")
      } finally {
        setLoading(false)
      }
    }
    fetchOptions()
  }, [error])

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
            <Briefcase className="h-6 w-6"/>
          </div>
          <h2 className="text-2xl font-bold mb-4">Select Module and Level</h2>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-800">Test Type</label>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className={clsx('relative flex p-4 border rounded-lg cursor-pointer hover:bg-blue-50 transition', {
              'bg-blue-50 border-blue-500 ring-2 ring-blue-500': testType === 'Practice'
            })}>
              <input type="radio" {...register('testType')} value="Practice" className="sr-only" />
              <div className="flex-1">
                <span className="font-medium text-gray-800">Practice Module</span>
                <p className="text-sm text-gray-500">Low-stakes module for student practice.</p>
              </div>
              {testType === 'Practice' && <CheckCircle className="h-5 w-5 text-blue-500 absolute top-2 right-2" />}
            </label>
            <label className={clsx('relative flex p-4 border rounded-lg cursor-pointer hover:bg-blue-50 transition', {
              'bg-blue-50 border-blue-500 ring-2 ring-blue-500': testType === 'Online'
            })}>
              <input type="radio" {...register('testType')} value="Online" className="sr-only" />
              <div className="flex-1">
                <span className="font-medium text-gray-800">Online Exam</span>
                <p className="text-sm text-gray-500">Formal, graded assessment.</p>
              </div>
              {testType === 'Online' && <CheckCircle className="h-5 w-5 text-blue-500 absolute top-2 right-2" />}
            </label>
          </div>
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
          ) : selectedModule !== 'VOCABULARY' ? (
            <div>
              <label htmlFor="level" className="block text-sm font-medium text-gray-800 mb-1">Level</label>
              <select
                id="level"
                {...register('level', { required: 'Please select a level.' })}
                className="mt-1 block w-full rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm transition bg-gray-700 text-white border-gray-600"
              >
                <option value="">Select Level</option>
                {levels.map(level => (
                  <option key={level.id} value={level.id}>{level.name}</option>
                ))}
              </select>
              {errors.level && <p className="text-red-500 text-xs mt-1">{errors.level.message}</p>}
            </div>
          ) : null}
        </div>
        <div className="flex justify-end pt-4">
          <button type="submit" className="inline-flex items-center justify-center px-5 py-2.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-500 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-transform transform hover:scale-105">
            Next: Select Test Type <ChevronRight className="h-5 w-5 ml-2" />
          </button>
        </div>
      </form>
    </motion.div>
  )
}

const Step2TestType = ({ nextStep, prevStep, updateTestData, testData }) => {
  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm({
    defaultValues: {
      testType: testData.testType,
    }
  })
  const { error } = useNotification()

  const testType = watch('testType')

  const onSubmit = (data) => {
    updateTestData({ testType: data.testType })
    nextStep()
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        <div className="flex items-center space-x-3 border-b pb-4 border-gray-200">
          <div className="bg-blue-500 p-2 rounded-full text-white">
            <Briefcase className="h-6 w-6"/>
          </div>
          <h2 className="text-2xl font-bold mb-4">Select Test Type</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <label className="block text-sm font-medium text-gray-800">Test Type</label>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className={clsx('relative flex p-4 border rounded-lg cursor-pointer hover:bg-blue-50 transition', {
                'bg-blue-50 border-blue-500 ring-2 ring-blue-500': testType === 'Practice'
              })}>
                <input type="radio" {...register('testType')} value="Practice" className="sr-only" />
                <div className="flex-1">
                  <span className="font-medium text-gray-800">Practice Module</span>
                  <p className="text-sm text-gray-500">Low-stakes module for student practice.</p>
                </div>
                {testType === 'Practice' && <CheckCircle className="h-5 w-5 text-blue-500 absolute top-2 right-2" />}
              </label>
              <label className={clsx('relative flex p-4 border rounded-lg cursor-pointer hover:bg-blue-50 transition', {
                'bg-blue-50 border-blue-500 ring-2 ring-blue-500': testType === 'Online'
              })}>
                <input type="radio" {...register('testType')} value="Online" className="sr-only" />
                <div className="flex-1">
                  <span className="font-medium text-gray-800">Online Exam</span>
                  <p className="text-sm text-gray-500">Formal, graded assessment.</p>
                </div>
                {testType === 'Online' && <CheckCircle className="h-5 w-5 text-blue-500 absolute top-2 right-2" />}
              </label>
            </div>
          </div>
        </div>
        
        <div className="flex justify-between items-center pt-8 border-t mt-8 border-gray-200">
          <button type="button" onClick={prevStep} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md text-gray-800 bg-gray-100 hover:bg-gray-200 transition-colors">
            <ChevronLeft className="h-5 w-5 mr-1" /> Back
          </button>
          <button type="submit" className="inline-flex items-center justify-center px-5 py-2.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-500 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-transform transform hover:scale-105">
            Next: Select Test Name <ChevronRight className="h-5 w-5 ml-2" />
          </button>
        </div>
      </form>
    </motion.div>
  )
}

const Step3TestName = ({ nextStep, prevStep, updateTestData, testData }) => {
  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm({
    defaultValues: {
      testName: testData.testName,
      startDateTime: testData.startDateTime || '',
      endDateTime: testData.endDateTime || '',
    }
  })
  const { error } = useNotification()
  const [baseName, setBaseName] = useState('')
  const [sequence, setSequence] = useState(1)
  const [existingTestNames, setExistingTestNames] = useState([]);
  const [loadingNames, setLoadingNames] = useState(true);
  const [modules, setModules] = useState([]);
  const [levels, setLevels] = useState([]);
  const [grammarCategories, setGrammarCategories] = useState([]);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const testName = watch('testName')
  const testType = testData.testType?.toLowerCase();

  // Use testData.startDateTime and testData.endDateTime as the source of truth
  const startDateTime = testData.startDateTime ? new Date(testData.startDateTime) : null;
  const endDateTime = testData.endDateTime ? new Date(testData.endDateTime) : null;

  // Update testData immediately when date changes
  const handleStartDateChange = (date) => {
    updateTestData({ startDateTime: date ? date.toISOString() : '' });
  };
  const handleEndDateChange = (date) => {
    updateTestData({ endDateTime: date ? date.toISOString() : '' });
  };

  const onSubmit = async (data) => {
    try {
      const res = await api.post('/test-management/check-test-name', {
        name: data.testName,
        module: testData.module,
        level: testData.level,
        campus: testData.campus?.value,
        batches: testData.batches?.map(b => b.value),
        courses: testData.courses?.map(c => c.value),
      });
      if (res.data.exists) {
        error(`A test with the name '${data.testName}' already exists for the selected module, level, campus, batch, and course.`);
        return;
      }
      if (testType === 'online') {
        if (!testData.startDateTime || !testData.endDateTime) {
          error('Start and End date/time are required for Online Exam.');
          return;
        }
        updateTestData({ testName: data.testName });
      } else {
        updateTestData({ testName: data.testName })
      }
      nextStep()
    } catch (err) {
      error("Failed to verify test name. Please try again.");
    }
  }

  useEffect(() => {
    const fetchTestNames = async () => {
      try {
        const res = await getAllTests();
        setExistingTestNames(res.data.data.map(t => t.name));
      } catch (e) {
        setExistingTestNames([]);
      } finally {
        setLoadingNames(false);
      }
    };
    fetchTestNames();
  }, []);

  useEffect(() => {
    const fetchMeta = async () => {
      try {
        const res = await api.get('/test-management/get-test-data');
        setModules(res.data.data.modules || []);
        setLevels(res.data.data.levels || []);
        setGrammarCategories(res.data.data.grammar_categories || []);
      } catch (err) {
        setModules([]); setLevels([]); setGrammarCategories([]);
      } finally {
        setLoadingMeta(false);
      }
    };
    fetchMeta();
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        <div className="flex items-center space-x-3 border-b pb-4 border-gray-200">
          <div className="bg-blue-500 p-2 rounded-full text-white">
            <Briefcase className="h-6 w-6"/>
          </div>
          <h2 className="text-2xl font-bold mb-4">Enter Test Name</h2>
        </div>
        {/* Selections Summary */}
        <div className="mb-6 bg-gray-50 border border-gray-200 p-4 rounded-lg">
          <h3 className="font-semibold text-gray-700 mb-2">Selections So Far:</h3>
          {loadingMeta ? (
            <div className="text-gray-500 text-sm">Loading selections...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div><strong className="text-gray-500 block">Campus:</strong><span className="text-gray-800">{testData.campus?.label || 'N/A'}</span></div>
              <div><strong className="text-gray-500 block">Batches:</strong><span className="text-gray-800">{testData.batches?.map(b => b.label).join(', ') || 'N/A'}</span></div>
              <div><strong className="text-gray-500 block">Courses:</strong><span className="text-gray-800">{testData.courses?.map(c => c.label).join(', ') || 'N/A'}</span></div>
              <div><strong className="text-gray-500 block">Test Type:</strong><span className="text-gray-800">{testData.testType || 'N/A'}</span></div>
              <div><strong className="text-gray-500 block">Module:</strong><span className="text-gray-800">{modules.find(m => m.id === testData.module)?.name || testData.module || 'N/A'}</span></div>
              {testData.module === 'GRAMMAR' && testData.subcategory ? (
                <div><strong className="text-gray-500 block">Grammar Category:</strong><span className="text-gray-800">{grammarCategories.find(cat => cat.id === testData.subcategory)?.name || testData.subcategory}</span></div>
              ) : testData.module !== 'VOCABULARY' && testData.level ? (
                <div><strong className="text-gray-500 block">Level:</strong><span className="text-gray-800">{levels.find(l => l.id === testData.level)?.name || testData.level}</span></div>
              ) : null}
            </div>
          )}
        </div>
        {/* Test Name Input and Already Uploaded Names */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <label htmlFor="testName" className="block text-sm font-medium text-gray-800">Test Name</label>
            <input
              type="text"
              id="testName"
              {...register('testName', { required: 'Test name is required' })}
              className="mt-1 block w-full rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm transition bg-gray-700 text-white border-gray-600 placeholder-gray-400"
              placeholder="e.g. Mid-term English Proficiency"
            />
            {errors.testName && <p className="text-red-500 text-xs mt-1">{errors.testName.message}</p>}
            <div className="mt-4">
              <div className="font-semibold text-gray-700 mb-1">Already Uploaded Test Names:</div>
              {loadingNames ? (
                <div className="text-gray-500 text-sm">Loading...</div>
              ) : (
                <div className="max-h-32 overflow-y-auto border border-gray-300 rounded bg-gray-50 p-2 text-sm text-gray-800">
                  {existingTestNames.length === 0 ? (
                    <div className="text-gray-400">No tests found.</div>
                  ) : (
                    <ul>
                      {existingTestNames.map((name, idx) => (
                        <li key={idx} className="truncate">{name}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
          {/* Start/End DateTime for Online Test */}
          {testType === 'online' && (
            <div className="space-y-4">
              <label className="block text-sm font-medium text-gray-800">Start Date & Time</label>
              <DatePicker
                selected={startDateTime}
                onChange={handleStartDateChange}
                showTimeSelect
                timeFormat="HH:mm"
                timeIntervals={15}
                dateFormat="dd-MM-yyyy HH:mm"
                placeholderText="Select start date & time"
                minDate={new Date()}
                className="mt-1 block w-full rounded-lg shadow focus:border-blue-600 focus:ring-2 focus:ring-blue-500 sm:text-base bg-white text-gray-900 border border-blue-300 placeholder-gray-400 transition"
                calendarClassName="rounded-lg border-blue-300 shadow-lg"
                popperClassName="z-50"
              />
              <label className="block text-sm font-medium text-gray-800">End Date & Time</label>
              <DatePicker
                selected={endDateTime}
                onChange={handleEndDateChange}
                showTimeSelect
                timeFormat="HH:mm"
                timeIntervals={15}
                dateFormat="dd-MM-yyyy HH:mm"
                placeholderText="Select end date & time"
                minDate={startDateTime || new Date()}
                className="mt-1 block w-full rounded-lg shadow focus:border-blue-600 focus:ring-2 focus:ring-blue-500 sm:text-base bg-white text-gray-900 border border-blue-300 placeholder-gray-400 transition"
                calendarClassName="rounded-lg border-blue-300 shadow-lg"
                popperClassName="z-50"
              />
            </div>
          )}
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700">Test Duration (minutes)</label>
          <input
            type="number"
            min="1"
            value={testData.duration || ''}
            onChange={e => updateTestData({ ...testData, duration: e.target.value })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            required={testData.testType === 'Online'}
            placeholder="Enter duration in minutes"
          />
        </div>
        <div className="flex justify-between items-center pt-8 border-t mt-8 border-gray-200">
          <button type="button" onClick={prevStep} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md text-gray-800 bg-gray-100 hover:bg-gray-200 transition-colors">
            <ChevronLeft className="h-5 w-5 mr-1" /> Back
          </button>
          <button type="submit" className="inline-flex items-center justify-center px-5 py-2.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-500 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-transform transform hover:scale-105">
            Next: Select Audience <ChevronRight className="h-5 w-5 ml-2" />
          </button>
        </div>
      </form>
    </motion.div>
  )
}

const Step4AudienceSelection = ({ nextStep, prevStep, updateTestData, testData }) => {
  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm({
    defaultValues: {
      campus_id: testData.campus?.value || '',
      batch_ids: testData.batches?.map(b => b.value) || [],
      course_ids: testData.courses?.map(c => c.value) || [],
    }
  })
  const { error } = useNotification()

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

  // Fetch Campuses on mount
  useEffect(() => {
    const fetchCampuses = async () => {
      setLoadingStates(prev => ({ ...prev, campuses: true }))
      try {
        const res = await api.get('/campus-management/')
        setCampuses(res.data.data.map(c => ({ label: c.name, value: c.id })))
      } catch (err) {
        error("Failed to fetch campuses")
      } finally {
        setLoadingStates(prev => ({ ...prev, campuses: false }))
      }
    }
    fetchCampuses()
  }, [error])

  // Fetch Batches when Campus changes
  useEffect(() => {
    const fetchBatches = async (campusId) => {
      setLoadingStates(prev => ({ ...prev, batches: true, courses: false }))
      try {
        const res = await api.get(`/batch-management/campus/${campusId}/batches`)
        setBatches(res.data.data.map(b => ({ label: b.name, value: b.id })))
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
  }, [selectedCampusId, setValue, error])

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
        const coursePromises = batchIds.map(batchId =>
          api.get(`/course-management/batch/${batchId}/courses`)
        )
        const courseResults = await Promise.all(coursePromises)
        const allCourses = courseResults.flatMap(res => res.data.data)
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
  }, [selectedBatchIds, setValue, error])

  const onSubmit = (data) => {
    const selectedCampus = campuses.find(c => c.value === data.campus_id)
    const selectedBatches = batches.filter(b => data.batch_ids.includes(b.value))
    const selectedCourses = courses.filter(c => data.course_ids.includes(c.value))
    
    updateTestData({
      campus: selectedCampus,
      batches: selectedBatches,
      courses: selectedCourses,
    })
    nextStep()
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        <div className="flex items-center space-x-3 border-b pb-4 border-gray-200">
          <div className="bg-blue-500 p-2 rounded-full text-white">
            <Briefcase className="h-6 w-6"/>
          </div>
          <h2 className="text-2xl font-bold mb-4">Select Audience</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Column 1: Campus */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg text-gray-800">1. Select Campus</h3>
            {loadingStates.campuses ? <LoadingSpinner/> : (
              <>
                <select 
                  {...register('campus_id', { required: 'Please select a campus' })}
                  className="w-full p-2 border border-gray-200 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 transition"
                >
                  <option value="" disabled>Choose a campus</option>
                  {campuses.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                {errors.campus_id && <p className="text-red-500 text-xs mt-1">{errors.campus_id.message}</p>}
              </>
            )}
          </div>

          {/* Column 2: Batches */}
          <div className={clsx("space-y-4", { 'opacity-50': !selectedCampusId })}>
            <h3 className="font-semibold text-lg text-gray-800">2. Select Batches</h3>
            {loadingStates.batches ? <LoadingSpinner/> : (
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
              ) : <p className="text-sm text-gray-500 italic">{selectedCampusId ? 'No batches found.' : 'Select a campus to see batches.'}</p>
            )}
            {errors.batch_ids && <p className="text-red-500 text-xs mt-1">{errors.batch_ids.message}</p>}
          </div>

          {/* Column 3: Courses */}
          <div className={clsx("space-y-4", { 'opacity-50': !selectedBatchIds || selectedBatchIds.length === 0 })}>
            <h3 className="font-semibold text-lg text-gray-800">3. Select Courses</h3>
            {loadingStates.courses ? <LoadingSpinner/> : (
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
      <span className={clsx('ml-3 text-sm font-medium', {'text-blue-900': checked, 'text-gray-800': !checked})}>
        {label}
      </span>
    </label>
  );
}

const Step5QuestionUpload = ({ nextStep, prevStep, updateTestData, testData }) => {
  const [questions, setQuestions] = useState(testData.questions || [])
  const [previewQuestions, setPreviewQuestions] = useState([])
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
  const { success, error } = useNotification()

  // Check if this is an MCQ module (Grammar or Vocabulary)
  const isMcqModule = testData.module && ['GRAMMAR', 'VOCABULARY'].includes(testData.module)

  const processQuestionsForPreview = (parsedQuestions) => {
    const existingQuestionTexts = new Set(questions.map(q => q.question.trim().toLowerCase()));
    const questionsForPreview = [];

    parsedQuestions.forEach(q => {
      const questionText = q.question?.trim();
      if (!questionText) {
        return; // Ignore empty rows
      }
      const questionTextLower = questionText.toLowerCase();

      // Check against questions already in the list AND questions in the current upload batch
      if (existingQuestionTexts.has(questionTextLower)) {
        questionsForPreview.push({ ...q, status: 'Duplicate' });
      } else {
        questionsForPreview.push({ ...q, status: 'New' });
        existingQuestionTexts.add(questionTextLower); // Add to set to prevent duplicates from same file being marked as 'New'
      }
    });

    if (questionsForPreview.length === 0) {
        error("Could not find any questions in the uploaded file.");
        return;
    }

    setPreviewQuestions(questionsForPreview);
    setIsPreviewModalOpen(true);
  };
  
  const handleConfirmPreview = () => {
    const newQuestions = previewQuestions.filter(q => q.status === 'New');
    setQuestions(current => [...current, ...newQuestions]);
    setIsPreviewModalOpen(false);
    setPreviewQuestions([]);
    if (newQuestions.length > 0) {
        success(`${newQuestions.length} new question(s) have been added.`);
    } else {
        error("No new questions were added as all were duplicates.");
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0]
    if (!file) return

    // Validate file type
    const allowedTypes = [
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'application/octet-stream' // fallback for some Excel files
    ]
    
    const fileExtension = file.name.toLowerCase().split('.').pop()
    const isValidExtension = ['csv', 'xlsx', 'xls'].includes(fileExtension)
    const isValidType = allowedTypes.includes(file.type) || file.type === ''
    
    if (!isValidExtension && !isValidType) {
      error(`Invalid file type. Please upload a .csv, .xlsx, or .xls file. Received: ${file.type || fileExtension}`)
      event.target.value = null
      return
    }

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        let parsedQuestions = [];
        
        if (fileExtension === 'csv' || file.type === 'text/csv') {
          // CSV parsing for template format
          const result = Papa.parse(e.target.result, { header: true, skipEmptyLines: true, trimHeaders: true, trimValues: true });
          if (result.errors.length > 0) console.warn("CSV parsing warnings:", result.errors);
          if (result.data.length === 0) throw new Error("No data found in CSV file.");
          
          parsedQuestions = result.data.map(row => ({
            question: row.question || row.Question || '',
            instructions: row.instructions || row.Instructions || '',
          }));

        } else {
          // Excel parsing (.xlsx, .xls)
          const workbook = XLSX.read(e.target.result, { type: 'array' });
          if (!workbook.SheetNames.length) throw new Error("No sheets found in Excel file.");
          
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          if (!worksheet) throw new Error(`Sheet "${sheetName}" not found.`);

          // For MCQ modules, detect if it's the "block" format (no headers) or "template" format (with headers).
          let isBlockFormat = false;
          if (isMcqModule) {
            const firstRowJson = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: 0 });
            if (firstRowJson.length > 0) {
              const header = String(firstRowJson[0][0] || '').trim().toLowerCase();
              if (header !== 'question') {
                isBlockFormat = true;
              }
            } else {
              // Empty sheet, let the downstream logic handle it.
              isBlockFormat = true;
            }
          }

          if (isBlockFormat && isMcqModule) {
            // New "block" parsing logic for user-friendly MCQ format
            const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
            const questionsFromSheet = [];
            let currentQuestionLines = [];

            for (const row of data) {
              const cellValue = row[0] ? String(row[0]).trim() : '';
              if (cellValue) {
                currentQuestionLines.push(cellValue);
              }

              // A question block is considered complete when we find the answer line.
              if (cellValue.toLowerCase().startsWith('answer:')) {
                if (currentQuestionLines.length > 1) { // Ensure it's not just an answer line by itself
                  questionsFromSheet.push({
                    question: currentQuestionLines.join('\n'),
                    instructions: '', // This format doesn't have an instructions column
                  });
                }
                currentQuestionLines = []; // Reset for the next question
              }
            }
            parsedQuestions = questionsFromSheet;
          } else {
            // Original "template" parsing logic (header-based)
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            parsedQuestions = jsonData.map(row => ({
              question: row.question || row.Question || '',
              instructions: row.instructions || row.Instructions || '',
            }));
          }
        }

        const finalQuestions = parsedQuestions.filter(q => q && q.question && q.question.trim() !== '');

        if (finalQuestions.length === 0) {
          throw new Error("No valid questions found in the file. Please check the file's format and content.");
        }

        processQuestionsForPreview(finalQuestions);
        
      } catch (err) {
        error(`File processing error: ${err.message}`);
        console.error("File Processing Error:", err);
      }
    };
    
    reader.onerror = () => {
      error("An unexpected error occurred while reading the file. Please try again.");
    };

    // Read file based on type
    if (fileExtension === 'csv' || file.type === 'text/csv') {
      reader.readAsText(file, 'UTF-8');
    } else {
      reader.readAsArrayBuffer(file);
    }
    
    // Reset file input
    event.target.value = null
  }

  const handleAddQuestion = () => {
    if (isMcqModule) {
      // Add MCQ question template
      const mcqTemplate = `Which of the following is a proper noun?
A) city
B) school
C) London
D) teacher
Answer: C`
      setQuestions([...questions, { question: mcqTemplate, instructions: '' }])
    } else {
      setQuestions([...questions, { question: '', instructions: '' }])
    }
  }

  const handleRemoveQuestion = (index) => {
    setQuestions(questions.filter((_, i) => i !== index))
  }

  const handleQuestionChange = (index, field, value) => {
    const newQuestions = [...questions]
    newQuestions[index][field] = value
    setQuestions(newQuestions)
  }

  const downloadTemplate = () => {
    let headers, example
    if (isMcqModule) {
      headers = "question,instructions\n"
      example = `"Which of the following is a proper noun?\nA) city\nB) school\nC) London\nD) teacher\nAnswer: C","Please select the correct answer."\n`
    } else {
      headers = "question,instructions\n"
      example = `"What is the capital of France?","Please answer in a complete sentence."\n`
    }
    
    const blob = new Blob([headers, example], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement("a")
    if (link.download !== undefined) { 
      const url = URL.createObjectURL(blob)
      link.setAttribute("href", url)
      link.setAttribute("download", isMcqModule ? "mcq_question_template.csv" : "question_template.csv")
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  const validateMcqQuestion = (questionText) => {
    const lines = questionText.trim().split('\n')
    if (lines.length < 6) return false
    
    const hasAnswer = lines.some(line => line.trim().startsWith('Answer:'))
    const hasOptions = lines.filter(line => line.trim().match(/^[A-D]\)/)).length === 4
    
    return hasAnswer && hasOptions
  }

  const onSubmit = () => {
    if (questions.some(q => !q.question.trim())) {
      error("All questions must have text. Please remove empty questions before proceeding.")
      return
    }
    if (questions.length === 0) {
      error("Please add at least one question.")
      return
    }
    
    // Validate MCQ questions if it's an MCQ module
    if (isMcqModule) {
      for (let i = 0; i < questions.length; i++) {
        if (!validateMcqQuestion(questions[i].question)) {
          error(`Question ${i + 1} is not in the correct MCQ format. Please use the template format.`)
          return
        }
      }
    }
    
    updateTestData({ questions })
    nextStep()
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
      {isPreviewModalOpen && (
        <QuestionPreviewModal
            questionsToPreview={previewQuestions}
            onClose={() => setIsPreviewModalOpen(false)}
            onConfirm={handleConfirmPreview}
        />
      )}
      <div className="space-y-6">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-500 p-2 rounded-full text-white">
            <FileQuestion className="h-6 w-6"/>
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-gray-800">Upload Questions</h2>
            {isMcqModule && (
              <p className="text-sm text-gray-500 mt-1">
                This module uses MCQ format. Questions should include options A, B, C, D and the correct answer.
              </p>
            )}
          </div>
        </div>
        
        {isMcqModule && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <h3 className="text-sm font-medium text-blue-800 mb-2">MCQ Question Format:</h3>
            <div className="text-sm text-blue-700 font-mono bg-white p-3 rounded border">
              <div>Which of the following is a proper noun?</div>
              <div>A) city</div>
              <div>B) school</div>
              <div>C) London</div>
              <div>D) teacher</div>
              <div>Answer: C</div>
            </div>
          </div>
        )}
        
        <div className="flex items-center space-x-4">
          <label className="inline-flex items-center px-4 py-2 bg-white border border-gray-200 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors">
            <Upload className="h-5 w-5 mr-2 text-gray-500" />
            Upload from File
            <input 
              type='file' 
              className="hidden" 
              onChange={handleFileUpload} 
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" 
            />
          </label>
          <button onClick={downloadTemplate} type="button" className="inline-flex items-center text-sm text-blue-500 hover:text-blue-700 hover:underline">
            <FileText className="h-4 w-4 mr-1" /> Download Template
          </button>
        </div>
        
        <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
          <p className="text-sm text-gray-500">
            <strong>Supported formats:</strong> CSV (.csv), Excel (.xlsx, .xls)
          </p>
          <p className="text-sm text-gray-500 mt-1">
            <strong>Required columns:</strong> "question" (or "Question") - Instructions column is optional
          </p>
          {isMcqModule && (
            <p className="text-sm text-blue-500 mt-1">
              <strong>Note:</strong> For MCQ modules, put the entire question with options and answer in the question column
            </p>
          )}
        </div>
        
        <div className="mt-4 space-y-4 max-h-[400px] overflow-y-auto p-1">
          {questions.map((q, index) => (
            <motion.div key={index} layout className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg border border-gray-200 shadow-sm">
              <span className="text-blue-500 font-semibold">{index + 1}.</span>
              <div className="flex-grow space-y-2">
                {isMcqModule ? (
                  <textarea
                    placeholder="Enter MCQ question with options and answer..."
                    value={q.question}
                    onChange={(e) => handleQuestionChange(index, 'question', e.target.value)}
                    className="w-full h-32 border-gray-200 rounded-md shadow-sm sm:text-sm focus:ring-blue-500 focus:border-blue-500 font-mono"
                  />
                ) : (
                  <input
                    type="text"
                    placeholder="Enter question text..."
                    value={q.question}
                    onChange={(e) => handleQuestionChange(index, 'question', e.target.value)}
                    className="w-full border-gray-200 rounded-md shadow-sm sm:text-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                )}
                <input
                  type="text"
                  placeholder="Instructions for student (optional)..."
                  value={q.instructions}
                  onChange={(e) => handleQuestionChange(index, 'instructions', e.target.value)}
                  className="w-full border-gray-200 rounded-md shadow-sm sm:text-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <button type="button" onClick={() => handleRemoveQuestion(index)} className="p-2 text-gray-400 hover:text-red-600 rounded-full transition-colors">
                <Trash2 className="h-5 w-5" />
              </button>
            </motion.div>
          ))}
        </div>
        
        <button type="button" onClick={handleAddQuestion} className="mt-4 inline-flex items-center text-sm font-medium text-blue-500 hover:text-blue-700">
          <Plus className="h-5 w-5 mr-1" /> Add Question Manually
        </button>
        
        <div className="flex justify-between items-center pt-4">
          <button type="button" onClick={prevStep} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md text-gray-800 bg-gray-100 hover:bg-gray-200 transition-colors">
            <ChevronLeft className="h-5 w-5 mr-1" /> Back
          </button>
          <button type="button" onClick={onSubmit} className="inline-flex items-center justify-center px-5 py-2.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-500 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-transform transform hover:scale-105">
            Next: {isMcqModule ? 'Review & Create' : 'Configure Audio'} <ChevronRight className="h-5 w-5 ml-2" />
          </button>
        </div>
      </div>
    </motion.div>
  )
}

const QuestionPreviewModal = ({ questionsToPreview, onClose, onConfirm }) => {
  const newQuestionsCount = questionsToPreview.filter(q => q.status === 'New').length;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
      <div className="relative mx-auto p-5 border w-full max-w-3xl shadow-lg rounded-md bg-white">
        <div className="mt-3 text-center">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Upload Preview</h3>
          <div className="mt-2 px-7 py-3">
            <p className="text-sm text-gray-500">
              Found {questionsToPreview.length} questions in the file. {newQuestionsCount} are new and will be added.
            </p>
            <div className="mt-4 max-h-80 overflow-y-auto border-t border-b">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Question</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {questionsToPreview.map((q, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{index + 1}</td>
                      <td className="px-6 py-4 text-left text-sm text-gray-900">{q.question.substring(0, 100)}{q.question.length > 100 ? '...' : ''}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${q.status === 'New' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                          {q.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="items-center px-4 py-3">
            <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md mr-2 hover:bg-gray-300">
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
              disabled={newQuestionsCount === 0}
            >
              Add {newQuestionsCount} New Questions
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Step4ConfirmAndGenerate = ({ prevStep, testData, onTestCreated }) => {
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
      } catch {
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
  const isMcqModule = testData.module && ['GRAMMAR', 'VOCABULARY'].includes(testData.module)

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
  const isOnline = testData.testType?.toLowerCase() === 'online';
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
      const payload = {
        test_name: testData.testName,
        test_type: testData.testType?.toLowerCase(),
        module_id: testData.module,
        campus_id: testData.campus?.value,
        course_ids: testData.courses.map(c => c.value),
        batch_ids: testData.batches.map(b => b.value),
        questions: testData.questions,
        audio_config: isMcqModule ? {} : { accent: data.accent, speed: data.speed },
      };
      if (testData.testType?.toLowerCase() === 'online') {
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
    } catch(err) {
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
            <Sparkles className="h-6 w-6"/>
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
            <div><strong className="text-gray-500 block">Name:</strong><p className="text-gray-800">{testData.testName}</p></div>
            <div><strong className="text-gray-500 block">Type:</strong><p className="text-gray-800">{testData.testType}</p></div>
            <div><strong className="text-gray-500 block">Module:</strong><p className="text-gray-800">{testData.module}</p></div>
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
            <div className="col-span-full"><strong className="text-gray-500 block">Total Questions:</strong><p className="text-gray-800">{testData.questions?.length}</p></div>
          </div>
          {/* Student List Table */}
          <div className="mt-6">
            <h4 className="font-semibold text-gray-700 mb-2">Students who will get access:</h4>
            <div className="max-h-48 overflow-y-auto border border-gray-200 rounded bg-white">
              {studentList.length === 0 ? (
                <div className="text-gray-500 text-sm p-4">No students found for the selected criteria.</div>
              ) : (
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-600">Name</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-600">Email</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-600">Roll Number</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentList.map((s) => (
                      <tr key={s.id} className="even:bg-gray-50">
                        <td className="px-4 py-2 text-gray-800">{s.name}</td>
                        <td className="px-4 py-2 text-gray-800">{s.email}</td>
                        <td className="px-4 py-2 text-gray-800">{s.roll_number}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
        {!isMcqModule && (
          <div>
            <h3 className="text-lg font-medium text-gray-800 mb-2">Audio Configuration</h3>
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
            {loading ? 'Processing...' : (isMcqModule ? 'Create MCQ Module' : 'Confirm and Generate Audio')}
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
        setLevels(res.data.data.levels || []);
      } catch (err) {
        error('Failed to fetch modules and levels');
      }
    };
    fetchOptions();
  }, [error]);

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
      // Simulate fetching students for this module/level (use backend logic as in test assignment)
      // You may need to call a backend endpoint to get students for this module/level
      // For now, call /test-management/student-count with selectedModule, levelId, etc.
      const res = await api.post('/test-management/student-count', {
        campus: null, // or selected campus if available
        batches: [], // or selected batches if available
        courses: [], // or selected courses if available
        module_id: selectedModule?.id,
        level_id: levelId,
      });
      const students = res.data.students || [];
      // For each student, check their test status (pending/completed) if needed
      // For now, mark all as pending
      setNotifyResults(students.map(s => ({
        name: s.name,
        email: s.email,
        roll_number: s.roll_number,
        test_status: 'pending',
        notify_status: 'pending',
      })));
    } catch (e) {
      error('Failed to fetch students for notification.');
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

export default TestManagement 
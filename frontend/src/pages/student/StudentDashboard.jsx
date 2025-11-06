import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../../contexts/AuthContext'
import { useNotification } from '../../contexts/NotificationContext'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import EmailCollectionPrompt from '../../components/common/EmailCollectionPrompt'
import FormPortalPopup from '../../components/common/FormPortalPopup'
import { useFormPortal } from '../../contexts/FormPortalContext'
import FormStats from '../../components/student/FormStats'
import ReleasedFormData from '../../components/student/ReleasedFormData'
import NotificationSubscribeButton from '../../components/student/NotificationSubscribeButton'
import api from '../../services/api'
import { 
  BrainCircuit, 
  BookOpen, 
  Target, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  Award,
  Calendar,
  BarChart3,
  FileText,
  PlayCircle,
  BookOpenCheck,
  Trophy,
  Star,
  Zap
} from 'lucide-react'

const StudentDashboard = () => {
  const { user } = useAuth()
  const { success, error } = useNotification()
  const { hasIncompleteRequiredForms, hasIncompleteForms, loading: formLoading } = useFormPortal()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [progressData, setProgressData] = useState(null)
  const [grammarResults, setGrammarResults] = useState([])
  const [vocabularyResults, setVocabularyResults] = useState([])
  const [unlockedModules, setUnlockedModules] = useState([])
  const [unlockedLoading, setUnlockedLoading] = useState(true)
  const [unlockedError, setUnlockedError] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [onlineExams, setOnlineExams] = useState([])
  const [onlineExamsLoading, setOnlineExamsLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [activeExamModal, setActiveExamModal] = useState({ show: false, exam: null })
  const [completedExamIds, setCompletedExamIds] = useState([])

  // Helper function to safely format numbers
  const safeToFixed = (value, decimals = 1) => {
    if (typeof value === 'number' && !isNaN(value)) {
      return value.toFixed(decimals)
    }
    const num = parseFloat(value || 0)
    return isNaN(num) ? '0.0' : num.toFixed(decimals)
  }

  // Helper function to format time remaining
  const getTimeRemaining = (startDateTime) => {
    const start = new Date(startDateTime)
    const diff = start - currentTime
    
    if (diff <= 0) {
      return { text: 'Started', status: 'active' }
    }
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((diff % (1000 * 60)) / 1000)
    
    if (days > 0) {
      return { text: `${days}d ${hours}h`, status: 'upcoming' }
    } else if (hours > 0) {
      return { text: `${hours}h ${minutes}m`, status: 'upcoming' }
    } else if (minutes > 0) {
      return { text: `${minutes}m ${seconds}s`, status: 'urgent' }
    } else {
      return { text: `${seconds}s`, status: 'urgent' }
    }
  }

  // Helper function to get exam status
  const getExamStatus = (exam) => {
    // Check if exam is completed first
    if (completedExamIds.includes(exam._id)) {
      return 'completed'
    }
    
    const start = new Date(exam.startDateTime)
    const end = new Date(exam.endDateTime)
    
    if (currentTime < start) {
      return 'upcoming'
    } else if (currentTime >= start && currentTime <= end) {
      return 'active'
    } else {
      return 'ended'
    }
  }

  const coreModules = [
    { id: 'GRAMMAR', name: 'Grammar', icon: '🧠', color: 'bg-indigo-500' },
    { id: 'VOCABULARY', name: 'Vocabulary', icon: '📚', color: 'bg-green-500' }
  ]

  useEffect(() => {
    fetchDashboardData()
    fetchUserProfile()
    fetchCompletedExams() // Fetch completed exams first
  }, [])

  // Fetch online exams after completed exams are loaded
  useEffect(() => {
    if (completedExamIds.length >= 0) { // This will be true even if empty array
      fetchOnlineExams()
    }
  }, [completedExamIds])

  // Refresh completed exams when user returns to dashboard (e.g., after submitting an exam)
  useEffect(() => {
    const handleFocus = () => {
      fetchCompletedExams()
    }
    
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  // Real-time clock for time remaining updates
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000) // Update every second

    return () => clearInterval(interval)
  }, [])

  // Check for active exams and show popup
  useEffect(() => {
    if (onlineExams.length > 0 && completedExamIds.length >= 0) {
      // Find the first active exam that is NOT completed
      const activeExam = onlineExams.find(exam => {
        const status = getExamStatus(exam)
        // Only show modal for active exams that are NOT completed
        return status === 'active' && !completedExamIds.includes(exam._id)
      })
      
      // Only show modal if we found an active non-completed exam and modal is not already showing
      if (activeExam && !activeExamModal.show) {
        setActiveExamModal({ show: true, exam: activeExam })
      }
      
      // If the currently shown exam in modal is now completed, hide the modal
      if (activeExamModal.show && activeExamModal.exam && completedExamIds.includes(activeExamModal.exam._id)) {
        setActiveExamModal({ show: false, exam: null })
      }
    }
  }, [onlineExams, currentTime, activeExamModal.show, completedExamIds])

  const fetchUserProfile = async () => {
    try {
      const response = await api.get('/student/profile')
      if (response.data.success) {
        setUserProfile(response.data.data)
      }
    } catch (error) {
      console.error('Error fetching user profile:', error)
    }
  }

  const handleEmailUpdated = (newEmail) => {
    setUserProfile(prev => ({
      ...prev,
      email: newEmail
    }))
    // Also update the auth context if needed
    if (user) {
      user.email = newEmail
    }
  }

  useEffect(() => {
    const fetchUnlocked = async () => {
      try {
        setUnlockedLoading(true)
        setUnlockedError(null)
        const res = await api.get('/student/unlocked-modules')
        setUnlockedModules(res.data.data || [])
      } catch (e) {
        setUnlockedError('Failed to load unlocked modules.')
      } finally {
        setUnlockedLoading(false)
      }
    }
    fetchUnlocked()
}, [])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      const [summaryRes, grammarRes, vocabularyRes] = await Promise.all([
        api.get('/student/progress-summary'),
        api.get('/student/grammar-detailed-results'),
        api.get('/student/vocabulary-detailed-results')
      ])
      
      setProgressData(summaryRes.data.data)
      setGrammarResults(grammarRes.data.data)
      setVocabularyResults(vocabularyRes.data.data)
    } catch (err) {
      error('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  const fetchOnlineExams = async () => {
    try {
      setOnlineExamsLoading(true)
      const response = await api.get('/student/online-exams')
      if (response.data.success) {
        const exams = response.data.data || []
        
        // Filter out only ended exams, show upcoming, active, and completed
        const now = new Date()
        const filteredExams = exams.filter(exam => {
          const start = new Date(exam.startDateTime)
          const end = new Date(exam.endDateTime)
          // Show upcoming, active, and completed exams (not ended)
          return now <= end
        })
        
        // Separate exams by status
        const upcomingExams = filteredExams.filter(exam => {
          const start = new Date(exam.startDateTime)
          return start > now && !completedExamIds.includes(exam._id)
        })
        
        const activeExams = filteredExams.filter(exam => {
          const start = new Date(exam.startDateTime)
          const end = new Date(exam.endDateTime)
          return start <= now && now <= end && !completedExamIds.includes(exam._id)
        })
        
        const completedExams = filteredExams.filter(exam => {
          return completedExamIds.includes(exam._id)
        })
        
        // Debug logging
        console.log('Completed exam IDs:', completedExamIds)
        console.log('Completed exams found:', completedExams.length)
        
        // Sort each category
        upcomingExams.sort((a, b) => new Date(a.startDateTime) - new Date(b.startDateTime))
        activeExams.sort((a, b) => new Date(a.startDateTime) - new Date(b.startDateTime))
        completedExams.sort((a, b) => new Date(b.startDateTime) - new Date(a.startDateTime)) // Most recent first
        
        // Combine: active first, then upcoming, then only the most recent completed exam
        // This ensures we show at most 1 completed exam, prioritizing the most recent one
        const sortedExams = [
          ...activeExams,      // Show all active exams first
          ...upcomingExams,    // Then all upcoming exams
          ...(completedExams.length > 0 ? [completedExams[0]] : []) // Only show the most recent completed exam
        ]
        
        // Debug logging
        console.log('Active exams:', activeExams.length)
        console.log('Upcoming exams:', upcomingExams.length)
        console.log('Completed exams (showing 1):', completedExams.length > 0 ? 1 : 0)
        console.log('Total sorted exams:', sortedExams.length)
        
        setOnlineExams(sortedExams)
      }
    } catch (err) {
      console.error('Error fetching online exams:', err)
      setOnlineExams([])
    } finally {
      setOnlineExamsLoading(false)
    }
  }

  const fetchCompletedExams = async () => {
    try {
      const response = await api.get('/student/completed-exams')
      if (response.data.success) {
        setCompletedExamIds(response.data.data || [])
      }
    } catch (err) {
      console.error('Error fetching completed exams:', err)
      setCompletedExamIds([])
    }
  }

  if (loading || formLoading) {
    return <LoadingSpinner size="lg" />
  }

  // Block dashboard content if there are any incomplete forms (required or optional)
  const shouldBlockDashboard = hasIncompleteForms()

  return (
    <div className="min-h-screen bg-[#fefefe]">
      {/* Block dashboard content if forms are required */}
      {shouldBlockDashboard && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-50 z-30 flex items-center justify-center">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl p-8 max-w-md mx-4 text-center shadow-2xl"
          >
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Please Complete All Forms</h3>
            <p className="text-gray-600">You need to complete all pending forms before accessing the dashboard.</p>
          </motion.div>
        </div>
      )}
      
      <div className={`w-full p-4 sm:p-6 lg:p-8 ${shouldBlockDashboard ? 'pointer-events-none opacity-50' : ''}`}>
        {/* Enhanced Header Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8 w-full"
        >
          <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
              <div className="flex-1">
                <div className="flex items-center mb-6">
                  <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mr-4 shadow-lg">
                    <Trophy className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-800">
                      Welcome back, {user?.name?.split(' ')[0] || 'Student'}!
                    </h1>
                    <p className="text-gray-600 text-base mt-1">
                      Ready to continue your English learning journey?
                    </p>
                  </div>
                </div>
                
                {/* Progress Overview */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div className="text-center p-4 bg-blue-50 rounded-xl">
                    <div className="text-2xl font-bold text-blue-600 mb-1">
                      {progressData?.overall_progress ? safeToFixed(progressData.overall_progress) : '0'}%
                    </div>
                    <div className="text-sm text-blue-700 font-medium">Overall Progress</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-xl">
                    <div className="text-2xl font-bold text-green-600 mb-1">
                      {progressData?.total_tests_completed || 0}
                    </div>
                    <div className="text-sm text-green-700 font-medium">Tests Completed</div>
                  </div>
                  <div className="text-center p-4 bg-purple-50 rounded-xl">
                    <div className="text-2xl font-bold text-purple-600 mb-1">
                      {progressData?.highest_score ? safeToFixed(progressData.highest_score) : '0'}%
                    </div>
                    <div className="text-sm text-purple-700 font-medium">Best Score</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Online Exams Section - Prominently placed after header */}
        {!onlineExamsLoading && onlineExams.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-8"
          >
            <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900 flex items-center">
                  <Calendar className="h-6 w-6 text-orange-600 mr-3" />
                  Upcoming Online Exams
                </h2>
                <Link 
                  to="/student/exams" 
                  className="text-orange-600 hover:text-orange-700 text-sm font-medium flex items-center"
                >
                  View All
                  <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {onlineExams.slice(0, 6).map((exam, index) => {
                  const examStatus = getExamStatus(exam)
                  const timeRemaining = getTimeRemaining(exam.startDateTime)
                  
                  return (
                    <motion.div
                      key={exam._id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      whileHover={{ scale: 1.02 }}
                      className={`rounded-xl p-6 border-2 transition-all duration-300 ${
                        examStatus === 'completed'
                          ? 'bg-gradient-to-br from-purple-50 to-purple-100 border-purple-300 shadow-lg'
                          : examStatus === 'active' 
                          ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-300 shadow-lg' 
                          : examStatus === 'upcoming'
                          ? 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-300 hover:border-blue-400'
                          : 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-300'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-gray-900 mb-2 line-clamp-2">
                            {exam.name}
                          </h3>
                          <div className="flex items-center text-sm text-gray-600 mb-2">
                            <BookOpen className="h-4 w-4 mr-2" />
                            {exam.module_name} - {exam.level_name}
                          </div>
                          <div className="flex items-center text-sm text-gray-600">
                            <FileText className="h-4 w-4 mr-2" />
                            {exam.question_count} Questions
                          </div>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                          examStatus === 'completed'
                            ? 'bg-purple-100 text-purple-800'
                            : examStatus === 'active'
                            ? 'bg-green-100 text-green-800'
                            : examStatus === 'upcoming'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {examStatus === 'completed' ? 'Completed' : examStatus === 'active' ? 'Live' : examStatus === 'upcoming' ? 'Upcoming' : 'Ended'}
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Start Time:</span>
                          <span className="font-medium text-gray-900">
                            {new Date(exam.startDateTime).toLocaleString()}
                          </span>
                        </div>
                        
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">End Time:</span>
                          <span className="font-medium text-gray-900">
                            {new Date(exam.endDateTime).toLocaleString()}
                          </span>
                        </div>
                        
                        {examStatus === 'upcoming' && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">Time Remaining:</span>
                            <span className={`font-bold ${
                              timeRemaining.status === 'urgent' 
                                ? 'text-red-600' 
                                : 'text-blue-600'
                            }`}>
                              {timeRemaining.text}
                            </span>
                          </div>
                        )}
                        
                        {examStatus === 'completed' && (
                          <div className="w-full bg-purple-200 text-purple-800 font-medium py-2 px-4 rounded-lg text-center">
                            ✓ Exam Submitted
                          </div>
                        )}
                        
                        {examStatus === 'active' && (
                          <Link
                            to={`/student/exam?testid=${exam._id}`}
                            className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200 text-center block"
                          >
                            Start Exam
                          </Link>
                        )}
                        
                        {examStatus === 'upcoming' && (
                          <div className="w-full bg-gray-200 text-gray-600 font-medium py-2 px-4 rounded-lg text-center">
                            Exam Not Started
                          </div>
                        )}
                        
                        {examStatus === 'ended' && (
                          <div className="w-full bg-gray-200 text-gray-600 font-medium py-2 px-4 rounded-lg text-center">
                            Exam Ended
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )
                })}
              </div>
              
              {onlineExams.length > 6 && (
                <div className="text-center mt-6">
                  <Link
                    to="/student/exams"
                    className="inline-flex items-center text-orange-600 hover:text-orange-700 font-medium"
                  >
                    View {onlineExams.length - 6} more exams
                    <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Show message when no online exams */}
        {!onlineExamsLoading && onlineExams.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-8"
          >
            <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Calendar className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Online Exams</h3>
              <p className="text-gray-600">You don't have any online exams scheduled at the moment.</p>
            </div>
          </motion.div>
        )}

        {/* Enhanced Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mb-8"
        >
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <h2 className="text-xl font-semibold text-gray-800 mb-6 flex items-center">
              <Zap className="h-5 w-5 text-blue-600 mr-2" />
              Quick Actions
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link
              to="/student/practice"
              className="group bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 p-6 border border-blue-200 hover:border-blue-300"
            >
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mr-4 group-hover:bg-blue-700 transition-colors shadow-lg">
                  <PlayCircle className="h-6 w-6 text-white" />
                </div>
                <div className="text-blue-600 group-hover:translate-x-1 transition-transform duration-300">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-blue-700 transition-colors">
                Practice Tests
              </h3>
              <p className="text-gray-600 text-sm">
                Take practice tests to improve your skills
              </p>
            </Link>

            <Link
              to="/student/exams"
              className="group bg-gradient-to-br from-green-50 to-green-100 rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 p-6 border border-green-200 hover:border-green-300"
            >
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-green-600 rounded-xl flex items-center justify-center mr-4 group-hover:bg-green-700 transition-colors shadow-lg">
                  <Target className="h-6 w-6 text-white" />
                </div>
                <div className="text-green-600 group-hover:translate-x-1 transition-transform duration-300">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-green-700 transition-colors">
                Online Exams
              </h3>
              <p className="text-gray-600 text-sm">
                Scheduled exams and assessments
              </p>
            </Link>

            <Link
              to="/student/progress"
              className="group bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 p-6 border border-purple-200 hover:border-purple-300"
            >
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center mr-4 group-hover:bg-purple-700 transition-colors shadow-lg">
                  <BarChart3 className="h-6 w-6 text-white" />
                </div>
                <div className="text-purple-600 group-hover:translate-x-1 transition-transform duration-300">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-purple-700 transition-colors">
                Progress Tracker
              </h3>
              <p className="text-gray-600 text-sm">
Track your learning progress
              </p>
            </Link>

            <Link
              to="/student/history"
              className="group bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 p-6 border border-orange-200 hover:border-orange-300"
            >
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-orange-600 rounded-xl flex items-center justify-center mr-4 group-hover:bg-orange-700 transition-colors shadow-lg">
                  <Clock className="h-6 w-6 text-white" />
                </div>
                <div className="text-orange-600 group-hover:translate-x-1 transition-transform duration-300">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-orange-700 transition-colors">
                Test History
              </h3>
              <p className="text-gray-600 text-sm">
                View your past test results
              </p>
            </Link>
            </div>
          </div>
        </motion.div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8">
          {/* Left Column */}
          <div className="xl:col-span-2 space-y-6 lg:space-y-8">
            {/* Learning Progress Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold text-gray-900 flex items-center">
                  <TrendingUp className="h-6 w-6 text-blue-600 mr-3" />
                  Learning Progress
                </h2>
                <Link 
                  to="/student/progress" 
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center"
                >
                  View Details
                  <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {coreModules.map((coreModule) => {
                  const moduleProgress = progressData?.modules?.find(m => m.module_name === coreModule.id)
                  const progressPercentage = moduleProgress?.progress_percentage || 0
                  const highestScore = moduleProgress?.highest_score || 0
                  
                  return (
                    <motion.div
                      key={coreModule.id}
                      whileHover={{ scale: 1.02 }}
                      className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 border border-gray-200 hover:border-gray-300 transition-all duration-300"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${coreModule.color}`}>
                          {coreModule.icon}
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-gray-900">{safeToFixed(progressPercentage)}%</p>
                          <p className="text-sm text-gray-600">Complete</p>
                        </div>
                      </div>
                      
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">
                        {coreModule.name}
                      </h3>
                      
                      <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Progress</span>
                          <span className="font-medium text-gray-900">{safeToFixed(progressPercentage)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3">
                          <div
                            className={`h-3 rounded-full transition-all duration-500 ${coreModule.color}`}
                            style={{ width: `${progressPercentage}%` }}
                          />
                        </div>
                        
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Best Score</span>
                          <span className="font-medium text-gray-900">{safeToFixed(highestScore)}%</span>
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </motion.div>

            {/* Grammar Progress */}
            {grammarResults.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100"
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 flex items-center">
                    <BrainCircuit className="h-6 w-6 text-indigo-600 mr-3" />
                    Grammar Progress
                  </h2>
                  <div className="flex items-center text-indigo-600 text-sm font-medium">
                    <Star className="h-4 w-4 mr-1" />
                    {grammarResults.filter(cat => cat.status === 'completed').length} / {grammarResults.length} Completed
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {grammarResults.map((category, index) => (
                    <motion.div
                      key={index}
                      whileHover={{ scale: 1.02 }}
                      className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-xl p-5 border border-indigo-200 hover:border-indigo-300 transition-all duration-300"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-gray-900">{category.subcategory_display_name}</h3>
                        <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                          category.status === 'completed' 
                            ? 'bg-green-100 text-green-800 border border-green-200' 
                            : 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                        }`}>
                          {category.status === 'completed' ? 'Completed' : 'In Progress'}
                        </span>
                      </div>
                      <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Best Score</span>
                          <span className="font-semibold text-gray-900">{safeToFixed(category.highest_score)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-2 rounded-full transition-all duration-500"
                            style={{ width: `${category.highest_score}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-gray-600">
                          <span>{category.total_attempts} attempts</span>
                          <span className="font-medium">{safeToFixed(category.highest_score)}%</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Released Form Data - Inside Learning Progress Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="mt-8"
            >
              <ReleasedFormData />
            </motion.div>
          </div>

          {/* Right Column */}
          <div className="space-y-6 lg:space-y-8">
            {/* Form Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <FormStats />
            </motion.div>


            {/* Recent Activity */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100"
            >
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
                <Clock className="h-5 w-5 text-blue-600 mr-3" />
                Recent Activity
              </h2>
              <div className="space-y-4">
                {progressData?.recent_activity?.slice(0, 5).map((activity, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center justify-between py-3 px-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-100 hover:border-blue-200 transition-all duration-300"
                  >
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-blue-500 rounded-full mr-3" />
                      <div>
                        <span className="text-gray-900 font-medium">Practice Test</span>
                        <p className="text-xs text-gray-600">Completed</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-blue-600">
                        {safeToFixed(activity.average_score)}%
                      </span>
                      <p className="text-xs text-gray-500">
                        {new Date(activity.submitted_at).toLocaleDateString()}
                      </p>
                    </div>
                  </motion.div>
                ))}
                {(!progressData?.recent_activity || progressData.recent_activity.length === 0) && (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Clock className="h-8 w-8 text-gray-400" />
                    </div>
                    <p className="text-gray-500 font-medium">No recent activity</p>
                    <p className="text-sm text-gray-400 mt-1">Start practicing to see your progress!</p>
                  </div>
                )}
              </div>
            </motion.div>

          </div>
        </div>
      </div>
      
      {/* Email Collection Prompt */}
      <EmailCollectionPrompt 
        user={userProfile || user} 
        onEmailUpdated={handleEmailUpdated}
      />
      
      {/* Form Portal Popup */}
      <FormPortalPopup />
      
      {/* Active Exam Modal */}
      {activeExamModal.show && activeExamModal.exam && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl"
          >
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Target className="h-8 w-8 text-green-600" />
              </div>
              
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                Exam is Live!
              </h3>
              
              <p className="text-gray-600 mb-6">
                <strong>{activeExamModal.exam.name}</strong> is currently active and ready to be taken.
              </p>
              
              <div className="bg-green-50 rounded-lg p-4 mb-6">
                <div className="text-sm text-gray-600 mb-2">Exam Details:</div>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span>Module:</span>
                    <span className="font-medium">{activeExamModal.exam.module_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Questions:</span>
                    <span className="font-medium">{activeExamModal.exam.question_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Ends at:</span>
                    <span className="font-medium">
                      {new Date(activeExamModal.exam.endDateTime).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex space-x-4">
                <button
                  onClick={() => setActiveExamModal({ show: false, exam: null })}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-3 px-4 rounded-lg transition-colors duration-200"
                >
                  Maybe Later
                </button>
                <Link
                  to={`/student/exam?testid=${activeExamModal.exam._id}`}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200 text-center"
                  onClick={() => setActiveExamModal({ show: false, exam: null })}
                >
                  Start Exam
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      )}
      
      {/* Floating Notification Subscribe Button */}
      <NotificationSubscribeButton />
    </div>
  )
}

export default StudentDashboard
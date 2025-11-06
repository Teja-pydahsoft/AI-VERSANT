import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../../contexts/AuthContext'
import { useNotification } from '../../contexts/NotificationContext'

import LoadingSpinner from '../../components/common/LoadingSpinner'
import api from '../../services/api'
import { 
  BookOpen, 
  BrainCircuit, 
  Award, 
  Calendar, 
  ChevronDown, 
  ChevronUp, 
  Eye, 
  Clock,
  CheckCircle,
  XCircle,
  TrendingUp,
  BarChart3,
  Target,
  Star
} from 'lucide-react'

const TestHistory = () => {
  const { user } = useAuth()
  const { error } = useNotification()
  const [loading, setLoading] = useState(true)
  const [results, setResults] = useState([])
  const [expandedTests, setExpandedTests] = useState(new Set())
  const [selectedAttempt, setSelectedAttempt] = useState(null)

  useEffect(() => {
    fetchTestResults()
  }, [])

  const fetchTestResults = async () => {
    try {
      setLoading(true)
      const response = await api.get('/student/test-history')
      setResults(response.data.data)
    } catch (err) {
      error('Failed to load test history')
    } finally {
      setLoading(false)
    }
  }

  const getModuleIcon = (moduleName) => {
    switch (moduleName) {
      case 'Grammar':
        return <BrainCircuit size={16} className="text-indigo-600" />
      case 'Vocabulary':
        return <BookOpen size={16} className="text-green-600" />
      default:
        return <Award size={16} className="text-blue-600" />
    }
  }

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-yellow-600'
    return 'text-red-600'
  }

  const formatDateTimeIST = (dateString) => {
    if (!dateString) return 'N/A';
    try {
    const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return 'Invalid Date';
      }
    return date.toLocaleString('en-IN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'Asia/Kolkata',
    });
    } catch (error) {
      console.error('Error formatting date:', error, 'Input:', dateString);
      return 'Invalid Date';
    }
  };

  const toggleTestExpansion = (testId) => {
    const newExpanded = new Set(expandedTests);
    if (newExpanded.has(testId)) {
      newExpanded.delete(testId);
    } else {
      newExpanded.add(testId);
    }
    setExpandedTests(newExpanded);
  };

  const viewAttemptDetails = (attempt) => {
    setSelectedAttempt(attempt);
  };

  const closeAttemptDetails = () => {
    setSelectedAttempt(null);
  };

  if (loading) {
    return <LoadingSpinner size="lg" />
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8"
      >
        <div className="text-center sm:text-left">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
            Test History
          </h1>
          <p className="text-sm sm:text-base text-gray-600 max-w-2xl">
            Track your progress and review detailed results from all completed tests
          </p>
        </div>
      </motion.div>

      <div className="space-y-8">
        {results.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-lg border border-gray-100 p-8 sm:p-12 text-center"
          >
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <BookOpen className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">
              No Tests Completed Yet
            </h3>
            <p className="text-sm sm:text-base text-gray-500 max-w-md mx-auto">
              Start taking tests to see your progress and detailed results here.
            </p>
          </motion.div>
        ) : (
          <>
            {/* Online Tests Section */}
            {results.filter(testGroup => testGroup.test_type === 'online').length > 0 && (
              <div className="space-y-6">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Award className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                      Online Exams
                    </h2>
                    <p className="text-xs sm:text-sm text-gray-500">
                      {results.filter(testGroup => testGroup.test_type === 'online').length} exam{results.filter(testGroup => testGroup.test_type === 'online').length !== 1 ? 's' : ''} completed
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                  {results.filter(testGroup => testGroup.test_type === 'online').map((testGroup) => (
                    <motion.div
                      key={testGroup.test_id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden hover:shadow-xl hover:scale-105 transition-all duration-300 aspect-square flex flex-col group"
                    >
                      {/* Test Card Content */}
                      <div className="p-5 flex flex-col h-full relative">
                        {/* Header with Module Badge */}
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center space-x-2">
                            {getModuleIcon(testGroup.module_name)}
                            <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-200">
                              {testGroup.module_name}
                            </span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleTestExpansion(testGroup.test_id);
                            }}
                            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            {expandedTests.has(testGroup.test_id) ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </button>
                        </div>

                        {/* Test Name */}
                        <div className="mb-4 flex-1">
                          <h3 className="text-lg font-bold text-gray-900 leading-tight overflow-hidden" style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical'
                          }}>
                            {testGroup.test_name}
                          </h3>
                        </div>

                        {/* Score Display - Centered and Prominent */}
                        <div className="text-center mb-4">
                          {(() => {
                            // Use percentage from latest attempt if available (for technical tests with partial credit)
                            const latestAttempt = testGroup.attempts && testGroup.attempts.length > 0 ? testGroup.attempts[0] : null;
                            const score = latestAttempt?.percentage !== undefined 
                              ? latestAttempt.percentage 
                              : (() => {
                                  const correctAnswers = testGroup.latest_correct_answers || 0;
                                  const totalQuestions = testGroup.total_questions || 0;
                                  return totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;
                                })();
                            const correctAnswers = testGroup.latest_correct_answers || 0;
                            const totalQuestions = testGroup.total_questions || 0;
                            return (
                              <div className="space-y-1">
                                <div className={`text-3xl font-bold ${getScoreColor(score)}`}>
                                  {score.toFixed(1)}%
                                </div>
                                <div className="text-xs text-gray-600 font-medium">
                                  {correctAnswers} of {totalQuestions} correct
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        {/* Footer Info */}
                        <div className="mt-auto space-y-3">
                          {/* Stats Row */}
                          <div className="flex items-center justify-between text-xs text-gray-600">
                            <div className="flex items-center space-x-1">
                              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                              <span className="font-medium">{testGroup.attempt_count} attempt{testGroup.attempt_count !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Calendar className="h-3 w-3" />
                              <span className="font-medium">{new Date(testGroup.latest_submitted_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                          
                          {/* Action Button */}
                          <button
                            onClick={() => {
                              if (testGroup.attempts && testGroup.attempts.length > 0) {
                                viewAttemptDetails(testGroup.attempts[0]);
                              }
                            }}
                            className="w-full py-2 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg transition-colors group-hover:bg-indigo-100"
                          >
                            View Details
                          </button>
                        </div>
                      </div>

                      {/* Expanded Attempts - Only shown when arrow is clicked */}
                      {expandedTests.has(testGroup.test_id) && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="border-t border-gray-200 bg-gray-50"
                        >
                          <div className="p-4">
                            <div className="flex items-center justify-between mb-4">
                              <h4 className="text-sm font-bold text-gray-800">
                                All Attempts ({testGroup.attempts.length})
                              </h4>
                              <div className="text-xs text-gray-500">
                                Click any attempt to view details
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {testGroup.attempts.map((attempt, index) => (
                                <motion.div
                                  key={attempt._id}
                                  initial={{ opacity: 0, scale: 0.95 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ delay: index * 0.05 }}
                                  className="p-3 bg-white rounded-xl border border-gray-200 hover:shadow-md hover:border-indigo-300 transition-all duration-200 cursor-pointer group"
                                  onClick={() => viewAttemptDetails(attempt)}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                      <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center group-hover:bg-indigo-200 transition-colors">
                                        <span className="text-xs font-bold text-indigo-600">
                                          {index + 1}
                                        </span>
                                      </div>
                                      <div>
                                        <div className="text-xs font-semibold text-gray-900">
                                          Attempt #{index + 1}
                                        </div>
                                        <div className="text-xs text-gray-500 flex items-center">
                                          <Calendar className="h-3 w-3 mr-1" />
                                          {new Date(attempt.end_time || attempt.submitted_at).toLocaleDateString()}
                                        </div>
                                      </div>
                                    </div>
                                    
                                    <div className="text-right">
                                      {(() => {
                                        const correctAnswers = attempt.correct_answers || 0;
                                        const totalQuestions = attempt.total_questions || 0;
                                        const calculatedScore = totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;
                                        return (
                                          <div className="space-y-1">
                                            <div className={`text-sm font-bold ${getScoreColor(calculatedScore)}`}>
                                              {calculatedScore.toFixed(1)}%
                                            </div>
                                            <div className="text-xs text-gray-500">
                                              {correctAnswers}/{totalQuestions}
                                            </div>
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                </motion.div>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </motion.div>
                  ))}
                </div>
                    </div>
            )}

            {/* Practice Tests Section */}
            {results.filter(testGroup => testGroup.test_type === 'practice').length > 0 && (
              <div className="space-y-6">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <BookOpen className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                      Practice Modules
                    </h2>
                    <p className="text-xs sm:text-sm text-gray-500">
                      {results.filter(testGroup => testGroup.test_type === 'practice').length} module{results.filter(testGroup => testGroup.test_type === 'practice').length !== 1 ? 's' : ''} completed
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                  {results.filter(testGroup => testGroup.test_type === 'practice').map((testGroup) => (
                    <motion.div
                      key={testGroup.test_id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden hover:shadow-xl hover:scale-105 transition-all duration-300 aspect-square flex flex-col group"
                    >
                      {/* Test Card Content */}
                      <div className="p-5 flex flex-col h-full relative">
                        {/* Header with Module Badge */}
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center space-x-2">
                            {getModuleIcon(testGroup.module_name)}
                            <span className="text-xs font-semibold text-green-700 bg-green-50 px-3 py-1.5 rounded-full border border-green-200">
                              {testGroup.module_name}
                            </span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleTestExpansion(testGroup.test_id);
                            }}
                            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            {expandedTests.has(testGroup.test_id) ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </button>
                        </div>

                        {/* Test Name */}
                        <div className="mb-4 flex-1">
                          <h3 className="text-lg font-bold text-gray-900 leading-tight overflow-hidden" style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical'
                          }}>
                            {testGroup.test_name}
                          </h3>
                        </div>

                        {/* Score Display - Centered and Prominent */}
                        <div className="text-center mb-4">
                          {(() => {
                            // Use percentage from latest attempt if available (for technical tests with partial credit)
                            const latestAttempt = testGroup.attempts && testGroup.attempts.length > 0 ? testGroup.attempts[0] : null;
                            const score = latestAttempt?.percentage !== undefined 
                              ? latestAttempt.percentage 
                              : (() => {
                                  const correctAnswers = testGroup.latest_correct_answers || 0;
                                  const totalQuestions = testGroup.total_questions || 0;
                                  return totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;
                                })();
                            const correctAnswers = testGroup.latest_correct_answers || 0;
                            const totalQuestions = testGroup.total_questions || 0;
                            return (
                              <div className="space-y-1">
                                <div className={`text-3xl font-bold ${getScoreColor(score)}`}>
                                  {score.toFixed(1)}%
                                </div>
                                <div className="text-xs text-gray-600 font-medium">
                                  {correctAnswers} of {totalQuestions} correct
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        {/* Footer Info */}
                        <div className="mt-auto space-y-3">
                          {/* Stats Row */}
                          <div className="flex items-center justify-between text-xs text-gray-600">
                            <div className="flex items-center space-x-1">
                              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                              <span className="font-medium">{testGroup.attempt_count} attempt{testGroup.attempt_count !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Calendar className="h-3 w-3" />
                              <span className="font-medium">{new Date(testGroup.latest_submitted_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                          
                          {/* Action Button */}
                          <button
                            onClick={() => {
                              if (testGroup.attempts && testGroup.attempts.length > 0) {
                                viewAttemptDetails(testGroup.attempts[0]);
                              }
                            }}
                            className="w-full py-2 px-3 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-semibold rounded-lg transition-colors group-hover:bg-green-100"
                          >
                            View Details
                          </button>
                        </div>
                      </div>

                      {/* Expanded Attempts - Only shown when arrow is clicked */}
                      {expandedTests.has(testGroup.test_id) && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="border-t border-gray-200 bg-gray-50"
                        >
                          <div className="p-4">
                            <div className="flex items-center justify-between mb-4">
                              <h4 className="text-sm font-bold text-gray-800">
                                All Attempts ({testGroup.attempts.length})
                              </h4>
                              <div className="text-xs text-gray-500">
                                Click any attempt to view details
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {testGroup.attempts.map((attempt, index) => (
                                <motion.div
                                  key={attempt._id}
                                  initial={{ opacity: 0, scale: 0.95 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ delay: index * 0.05 }}
                                  className="p-3 bg-white rounded-xl border border-gray-200 hover:shadow-md hover:border-green-300 transition-all duration-200 cursor-pointer group"
                                  onClick={() => viewAttemptDetails(attempt)}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                      <div className="w-7 h-7 bg-green-100 rounded-full flex items-center justify-center group-hover:bg-green-200 transition-colors">
                                        <span className="text-xs font-bold text-green-600">
                                          {index + 1}
                                        </span>
                                      </div>
                                      <div>
                                        <div className="text-xs font-semibold text-gray-900">
                                          Attempt #{index + 1}
                                        </div>
                                        <div className="text-xs text-gray-500 flex items-center">
                                          <Calendar className="h-3 w-3 mr-1" />
                                          {new Date(attempt.end_time || attempt.submitted_at).toLocaleDateString()}
                                        </div>
                                      </div>
                                    </div>
                                    
                                    <div className="text-right">
                                      {(() => {
                                        // Use percentage from attempt if available (for technical tests with partial credit)
                                        const score = attempt.percentage !== undefined 
                                          ? attempt.percentage 
                                          : (() => {
                                              const correctAnswers = attempt.correct_answers || 0;
                                              const totalQuestions = attempt.total_questions || 0;
                                              return totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;
                                            })();
                                        const correctAnswers = attempt.correct_answers || 0;
                                        const totalQuestions = attempt.total_questions || 0;
                                        return (
                                          <div className="space-y-1">
                                            <div className={`text-sm font-bold ${getScoreColor(score)}`}>
                                              {score.toFixed(1)}%
                                            </div>
                                            <div className="text-xs text-gray-500">
                                              {correctAnswers}/{totalQuestions}
                                            </div>
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                </motion.div>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Attempt Details Modal */}
      {selectedAttempt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[95vh] overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 sm:px-6 py-4 sm:py-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                    <BarChart3 className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      Attempt Details
                    </h3>
                    <p className="text-blue-100 text-sm">
                      Test performance analysis
                    </p>
                  </div>
                </div>
                <button
                  onClick={closeAttemptDetails}
                  className="text-white hover:text-blue-200 transition-colors p-2 rounded-lg hover:bg-white hover:bg-opacity-10"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Content */}
            <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(95vh-120px)]">
              {/* Performance Overview */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-3 rounded-lg border border-orange-200">
                  <div className="text-xs font-medium text-orange-600 mb-1">Score</div>
                  {(() => {
                    // Use percentage from attempt if available, otherwise calculate
                    const score = selectedAttempt.percentage !== undefined 
                      ? selectedAttempt.percentage 
                      : (() => {
                          const correctAnswers = selectedAttempt.correct_answers || 0;
                          const totalQuestions = selectedAttempt.total_questions || 0;
                          return totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;
                        })();
                    return (
                      <div className={`text-lg font-bold ${getScoreColor(score)}`}>
                        {score.toFixed(1)}%
                      </div>
                    );
                  })()}
                </div>
                
                <div className="bg-gradient-to-br from-green-50 to-green-100 p-3 rounded-lg border border-green-200">
                  <div className="text-xs font-medium text-green-600 mb-1">Correct</div>
                  <div className="text-lg font-bold text-green-700">
                    {(() => {
                      // For technical tests, count questions with 100% score
                      if (selectedAttempt.detailed_results) {
                        const fullyCorrect = selectedAttempt.detailed_results.filter(r => r.is_correct === true).length;
                        return fullyCorrect > 0 ? fullyCorrect : (selectedAttempt.correct_answers || 0);
                      }
                      return selectedAttempt.correct_answers || 0;
                    })()}
                  </div>
                </div>
                
                <div className="bg-gradient-to-br from-red-50 to-red-100 p-3 rounded-lg border border-red-200">
                  <div className="text-xs font-medium text-red-600 mb-1">Incorrect</div>
                  <div className="text-lg font-bold text-red-700">
                    {(() => {
                      const total = selectedAttempt.total_questions || 0;
                      // For technical tests, count questions not fully correct
                      if (selectedAttempt.detailed_results) {
                        const fullyCorrect = selectedAttempt.detailed_results.filter(r => r.is_correct === true).length;
                        return total - fullyCorrect;
                      }
                      return total - (selectedAttempt.correct_answers || 0);
                    })()}
                  </div>
                </div>
                
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-3 rounded-lg border border-purple-200">
                  <div className="text-xs font-medium text-purple-600 mb-1">Total</div>
                  <div className="text-lg font-bold text-purple-700">
                    {selectedAttempt.total_questions || 0}
                  </div>
                </div>
              </div>

              {/* Question-wise Results */}
              {selectedAttempt.detailed_results && selectedAttempt.detailed_results.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center">
                      <TrendingUp className="h-4 w-4 text-blue-600" />
                    </div>
                    <h4 className="text-base font-semibold text-gray-900">
                      Question Analysis
                    </h4>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-4">
                    {selectedAttempt.detailed_results.map((result, index) => {
                      const isCompilerQuestion = result.question_type === 'compiler' || result.question_type === 'technical';
                      
                      // Get test results from multiple sources
                      let testResults = result.test_results || [];
                      
                      // Also check answers object for test results
                      if (isCompilerQuestion && selectedAttempt.answers) {
                        const answerData = selectedAttempt.answers[result.question_id];
                        if (answerData && answerData.results && answerData.results.test_results) {
                          // Use test results from answers if detailed_results doesn't have them
                          if (testResults.length === 0) {
                            testResults = answerData.results.test_results;
                          }
                        }
                      }
                      
                      // Get code from answers object if student_answer is empty
                      let studentCode = result.student_answer || '';
                      if (isCompilerQuestion && selectedAttempt.answers) {
                        const answerData = selectedAttempt.answers[result.question_id];
                        if (answerData) {
                          // Always prefer code from answers object (it's the source of truth)
                          if (answerData.code !== undefined && answerData.code !== null) {
                            studentCode = answerData.code;
                          }
                          // Get language from answers if not in detailed_results
                          if (!result.language && answerData.language) {
                            // We'll handle this below
                          }
                        }
                      }
                      
                      // Get language from answers if not in detailed_results
                      let questionLanguage = result.language || '';
                      if (isCompilerQuestion && !questionLanguage && selectedAttempt.answers) {
                        const answerData = selectedAttempt.answers[result.question_id];
                        if (answerData && answerData.language) {
                          questionLanguage = answerData.language;
                        }
                      }
                      
                      return (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: index * 0.05 }}
                          className={`p-4 rounded-lg border ${
                            result.is_correct
                              ? 'bg-green-50 border-green-200'
                              : 'bg-red-50 border-red-200'
                          }`}
                        >
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                  result.is_correct ? 'bg-green-200' : 'bg-red-200'
                                }`}>
                                  <span className="text-xs font-bold text-gray-700">
                                    {index + 1}
                                  </span>
                                </div>
                                <span className="text-sm font-medium text-gray-900">
                                  Question {index + 1}
                                </span>
                                {result.question && (
                                  <span className="text-sm font-semibold text-gray-700">
                                    {result.question}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {isCompilerQuestion && result.score !== undefined && (
                                  <span className="text-xs font-medium text-gray-600">
                                    Score: {result.score}/{result.max_score || 1} ({result.percentage?.toFixed(1) || 0}%)
                                  </span>
                                )}
                                <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  result.is_correct 
                                    ? 'bg-green-100 text-green-700' 
                                    : 'bg-red-100 text-red-700'
                                }`}>
                                  {result.is_correct ? 'Correct' : 'Incorrect'}
                                </div>
                              </div>
                            </div>
                            
                            {/* Compiler/Technical Question Display */}
                            {isCompilerQuestion ? (
                              <div className="space-y-3 bg-white p-3 rounded border">
                                {/* Language and Code */}
                                {questionLanguage && (
                                  <div className="text-xs text-gray-600">
                                    <span className="font-medium">Language: </span>
                                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                                      {questionLanguage}
                                    </span>
                                  </div>
                                )}
                                
                                {/* Submitted Code */}
                                {studentCode ? (
                                  <div>
                                    <div className="text-xs font-medium text-gray-700 mb-1">
                                      Your Code:
                                    </div>
                                    <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded overflow-x-auto max-h-48 overflow-y-auto">
                                      <code>{studentCode}</code>
                                    </pre>
                                  </div>
                                ) : (
                                  <div className="text-xs text-gray-500 italic">
                                    No code submitted
                                  </div>
                                )}
                                
                                {/* Test Case Results */}
                                {testResults.length > 0 && (
                                  <div>
                                    <div className="text-xs font-medium text-gray-700 mb-2">
                                      Test Case Results:
                                    </div>
                                    <div className="space-y-2">
                                      {testResults.map((testCase, tcIndex) => (
                                        <div
                                          key={tcIndex}
                                          className={`p-2 rounded border text-xs ${
                                            testCase.passed
                                              ? 'bg-green-50 border-green-200'
                                              : testCase.status === 'partial'
                                              ? 'bg-yellow-50 border-yellow-200'
                                              : 'bg-red-50 border-red-200'
                                          }`}
                                        >
                                          <div className="flex items-center justify-between mb-1">
                                            <span className="font-medium text-gray-700">
                                              Test Case {testCase.test_case_number || tcIndex + 1}
                                              {testCase.is_sample && (
                                                <span className="ml-2 text-xs text-blue-600">(Sample)</span>
                                              )}
                                            </span>
                                            <div className="flex items-center gap-2">
                                              {testCase.passed && (
                                                <span className="text-green-600 font-medium">✓ Passed</span>
                                              )}
                                              {testCase.status === 'partial' && (
                                                <span className="text-yellow-600 font-medium">⚠ Partial</span>
                                              )}
                                              {!testCase.passed && testCase.status !== 'partial' && (
                                                <span className="text-red-600 font-medium">✗ Failed</span>
                                              )}
                                              <span className="text-gray-600">
                                                {testCase.points_earned || 0}/{testCase.points || 1} pts
                                              </span>
                                            </div>
                                          </div>
                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                                            <div>
                                              <span className="text-gray-500">Input: </span>
                                              <span className="font-mono bg-gray-100 px-1 rounded">
                                                {testCase.input || 'N/A'}
                                              </span>
                                            </div>
                                            <div>
                                              <span className="text-gray-500">Expected: </span>
                                              <span className="font-mono bg-gray-100 px-1 rounded">
                                                {testCase.expected_output || 'N/A'}
                                              </span>
                                            </div>
                                            <div>
                                              <span className="text-gray-500">Actual: </span>
                                              <span className={`font-mono px-1 rounded ${
                                                testCase.passed ? 'bg-green-100' : 'bg-red-100'
                                              }`}>
                                                {testCase.actual_output || 'N/A'}
                                              </span>
                                            </div>
                                            {testCase.execution_time !== undefined && (
                                              <div>
                                                <span className="text-gray-500">Time: </span>
                                                <span className="font-mono bg-gray-100 px-1 rounded">
                                                  {testCase.execution_time}ms
                                                </span>
                                              </div>
                                            )}
                                          </div>
                                          {testCase.error && (
                                            <div className="mt-1 text-xs text-red-600 bg-red-50 p-1 rounded">
                                              <span className="font-medium">Error: </span>
                                              {testCase.error}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              /* MCQ Question Display */
                              <div className="space-y-2 bg-white p-3 rounded border">
                                {result.question && (
                                  <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                                    {result.question}
                                  </div>
                                )}
                                
                                <div className="space-y-1">
                                  <div className="text-xs">
                                    <span className="text-gray-500">Your answer: </span>
                                    <span className={`font-medium ${
                                      result.is_correct ? 'text-green-700' : 'text-red-700'
                                    }`}>
                                      {result.student_answer || 'No answer'}
                                    </span>
                                  </div>
                                  
                                  {!result.is_correct && (
                                    <div className="text-xs">
                                      <span className="text-gray-500">Correct: </span>
                                      <span className="font-medium text-green-700">
                                        {result.correct_answer_text || result.correct_answer || 'N/A'}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

export default TestHistory 
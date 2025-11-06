import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { useNotification } from '../../contexts/NotificationContext';
import api from '../../services/api';
import TechnicalCodeEditor from '../../components/TechnicalCodeEditor';

import { motion } from 'framer-motion';
import clsx from 'clsx';

const PracticeModuleTaking = () => {
  const { testId } = useParams();
  const { error: showError, success } = useNotification();
  const [module, setModule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [cheatWarning, setCheatWarning] = useState(false);
  const [cheatCount, setCheatCount] = useState(0);
  const examRef = useRef(null);
  const [recordings, setRecordings] = useState({});
  const [isRecording, setIsRecording] = useState(false);
  const [recordingQuestionId, setRecordingQuestionId] = useState(null);
  const [audioURLs, setAudioURLs] = useState({});
  const [result, setResult] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchModule = async () => {
      setLoading(true);
      setFetchError(null);
      try {
        const res = await api.get(`/student/test/${testId}`);
        setModule(res.data.data);
        // Use shuffled questions if available (same as backend), otherwise use original questions
        const questions = res.data.data.shuffled_questions || res.data.data.questions || [];
        setQuestions(questions);
      } catch (err) {
        setFetchError(err.response?.data?.message || 'Failed to load module.');
        showError(err.response?.data?.message || 'Failed to load module.');
      } finally {
        setLoading(false);
      }
    };
    fetchModule();
  }, [testId, showError]);

  useEffect(() => {
    // Anti-cheating: Prevent tab switching
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        setCheatWarning(true);
        setCheatCount(prev => prev + 1);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    // Prevent copy/cut/paste and text selection
    const preventAction = (e) => e.preventDefault();
    const examNode = examRef.current;
    if (examNode) {
      examNode.addEventListener('copy', preventAction);
      examNode.addEventListener('cut', preventAction);
      examNode.addEventListener('paste', preventAction);
      examNode.addEventListener('contextmenu', preventAction);
      examNode.addEventListener('selectstart', preventAction);
    }
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (examNode) {
        examNode.removeEventListener('copy', preventAction);
        examNode.removeEventListener('cut', preventAction);
        examNode.removeEventListener('paste', preventAction);
        examNode.removeEventListener('contextmenu', preventAction);
        examNode.removeEventListener('selectstart', preventAction);
      }
    };
  }, [cheatCount]);

  const handleAnswerChange = (questionId, answer) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const handleCodeSubmit = (questionId, code, language, results) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: {
        code,
        language,
        type: 'code',
        results: results // Store validation results
      }
    }));
  };

  // Audio recording logic for Speaking module (placeholder, implement as needed)

  const handleSubmit = async () => {
    try {
      const formData = new FormData();
      formData.append('test_id', module._id);
      
      // Use question index format to match backend expectations
      questions.forEach((question, index) => {
        const questionId = question.question_id || question._id;
        if (answers[questionId]) {
          const answer = answers[questionId];
          // If it's a code answer with results, send structured data
          if (answer && typeof answer === 'object' && answer.type === 'code') {
            if (answer.results) {
              // For compiler questions, send pre-calculated results
              formData.append(`answer_${index}`, JSON.stringify({
                code: answer.code,
                language: answer.language,
                results: answer.results,
                total_score: answer.results.total_score,
                max_score: answer.results.max_score,
                passed_count: answer.results.passed_count,
                failed_count: answer.results.failed_count
              }));
            } else {
              formData.append(`answer_${index}`, JSON.stringify(answer));
            }
          } else {
            formData.append(`answer_${index}`, answer);
          }
        }
      });
      
      // Use question index format for audio recordings
      questions.forEach((question, index) => {
        const questionId = question.question_id || question._id;
        if (recordings[questionId]) {
          formData.append(`question_${index}`, recordings[questionId], `answer_${index}.wav`);
        }
      });
      const res = await api.post('/student/submit-practice-test', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data.success) {
        success('Module submitted successfully!');
        setResult(res.data.data);
      } else {
        showError(res.data.message || 'Failed to submit your answers.');
      }
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to submit your answers. Please try again.');
    }
  };

  if (loading) return <LoadingSpinner />;
  if (fetchError) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-xl shadow text-center">
        <h2 className="text-2xl font-bold text-red-600 mb-4">Error</h2>
        <p className="text-gray-700 mb-4">{fetchError}</p>
        <button onClick={() => navigate('/student/practice')} className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg">Go to Practice Modules</button>
      </div>
    </div>
  );
  if (!module) return null;
  if (result) return <ResultView result={result} onBack={() => { setResult(null); setCurrentQuestionIndex(0); }} />;
  if (questions.length === 0) return <div className="text-center p-8">This module has no questions.</div>;

  const currentQuestion = questions[currentQuestionIndex];
  
  // Debug: Log question type
  console.log('Current question:', currentQuestion);
  console.log('Question type:', currentQuestion?.question_type);
  console.log('Has test_cases:', currentQuestion?.test_cases);
  
  // Detect if this is a compiler question (has test_cases)
  const isCompilerQuestion = currentQuestion && (
    currentQuestion.question_type === 'compiler' || 
    currentQuestion.question_type === 'technical' ||
    (currentQuestion.test_cases && currentQuestion.test_cases.length > 0)
  );
  
  console.log('Is compiler question:', isCompilerQuestion);
  
  // Create options object from individual option fields if not already present (only for MCQ)
  if (currentQuestion && !isCompilerQuestion && currentQuestion.question_type === 'mcq' && !currentQuestion.options) {
    currentQuestion.options = {
      'A': currentQuestion.optionA || '',
      'B': currentQuestion.optionB || '',
      'C': currentQuestion.optionC || '',
      'D': currentQuestion.optionD || ''
    };
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="px-6 lg:px-10 py-12">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="flex justify-between items-center mb-4">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 truncate">{module.name}</h1>
            </div>
            {cheatWarning && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded mb-4 text-center">
                <strong>Tab switching or leaving the exam is not allowed!</strong> ({cheatCount} warning{cheatCount > 1 ? 's' : ''})
              </div>
            )}
            <div ref={examRef} className={`bg-white rounded-2xl shadow-lg mx-auto p-4 sm:p-8 w-full min-h-[350px] flex flex-col select-none ${
              isCompilerQuestion
                ? 'max-w-6xl' 
                : 'max-w-md justify-center'
            }`}>
              <div className="text-center mb-6 text-sm font-semibold text-gray-500">
                Question {currentQuestionIndex + 1} of {questions.length}
              </div>
              <div className={isCompilerQuestion ? 'text-left' : 'text-center'}>
                {currentQuestion.question_type === 'audio' && currentQuestion.audio_url && (
                  <audio controls className="mx-auto mb-4">
                    <source src={currentQuestion.audio_url} type="audio/mpeg" />
                    Your browser does not support the audio element.
                  </audio>
                )}
                <p className="text-lg sm:text-xl text-gray-800 mb-8 break-words">{currentQuestion.question}</p>
                {isCompilerQuestion && currentQuestion.instructions && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
                    <p className="text-sm text-blue-800"><strong>Instructions:</strong> {currentQuestion.instructions}</p>
                  </div>
                )}
              </div>
              {!isCompilerQuestion && currentQuestion.question_type === 'mcq' && currentQuestion.options && (
                <div className="space-y-4 max-w-lg mx-auto w-full">
                  {Object.entries(currentQuestion.options).map(([key, value]) => (
                    <label
                      key={key}
                      className={clsx(
                        'flex items-center p-4 rounded-lg border-2 cursor-pointer transition-all w-full',
                        {
                          'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-300': answers[currentQuestion.question_id] === value,
                          'border-gray-200 hover:border-indigo-400': answers[currentQuestion.question_id] !== value,
                        }
                      )}
                    >
                      <input
                        type="radio"
                        name={currentQuestion.question_id}
                        value={value}
                        checked={answers[currentQuestion.question_id] === value}
                        onChange={() => handleAnswerChange(currentQuestion.question_id, value)}
                        className="h-5 w-5 mr-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                      />
                      <span className="font-semibold text-gray-700">{key}.</span>
                      <span className="ml-3 text-gray-800">{value}</span>
                    </label>
                  ))}
                </div>
              )}
              {isCompilerQuestion && (
                <div className="w-full">
                  <TechnicalCodeEditor
                    question={currentQuestion}
                    onCodeChange={(code, language) => handleCodeSubmit(currentQuestion.question_id || currentQuestion._id, code, language)}
                    onSubmit={(results) => handleCodeSubmit(currentQuestion.question_id || currentQuestion._id, answers[currentQuestion.question_id || currentQuestion._id]?.code || '', answers[currentQuestion.question_id || currentQuestion._id]?.language || currentQuestion.language || 'python', results)}
                    initialCode={answers[currentQuestion.question_id || currentQuestion._id]?.code || ''}
                    initialLanguage={answers[currentQuestion.question_id || currentQuestion._id]?.language || currentQuestion.language || 'python'}
                  />
                </div>
              )}
              {/* Add more question types as needed */}
              <div className="flex justify-between mt-8">
                <button
                  disabled={currentQuestionIndex === 0}
                  onClick={() => setCurrentQuestionIndex(i => Math.max(0, i - 1))}
                  className="px-4 py-2 rounded bg-gray-200 text-gray-700 font-semibold hover:bg-gray-300 disabled:opacity-50"
                >
                  Previous
                </button>
                {currentQuestionIndex < questions.length - 1 ? (
                  <button
                    onClick={() => setCurrentQuestionIndex(i => Math.min(questions.length - 1, i + 1))}
                    className="px-4 py-2 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700"
                  >
                    Next
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    className="px-6 py-2 rounded bg-green-600 text-white font-bold hover:bg-green-700"
                  >
                    Submit
                  </button>
                )}
              </div>
            </div>
          </motion.div>
      </main>
    </div>
  );
};

// ResultView copied from PracticeModules.jsx
const ResultView = ({ result, onBack }) => {
  if (!result) {
    return (
      <div className="text-center">
        <h1 className="text-2xl font-bold">An error occurred while calculating your results.</h1>
        <button onClick={onBack} className="mt-8 px-8 py-3 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition">
          Back to Modules
        </button>
      </div>
    );
  }
  const { correct_answers, total_questions, average_score, results } = result;
  const scorePercentage = average_score || 0;
  const renderWordDiff = (expected, got) => {
    const expectedWords = expected.split(' ');
    const gotWords = got.split(' ');
    return (
      <span>{got}</span>
    );
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl mx-auto">
      <div className="bg-white p-8 rounded-2xl shadow-lg text-center">
        <h1 className="text-3xl font-bold text-gray-800">Practice Test Submitted!</h1>
        <p className="text-gray-600 mt-2">Here are your results:</p>
        <div className="my-8">
          <p className="text-6xl font-bold text-indigo-600">{correct_answers}<span className="text-4xl text-gray-500">/{total_questions}</span></p>
          <p className="text-xl font-semibold text-gray-700">Questions Correct</p>
        </div>
        <div className="bg-gray-100 p-6 rounded-lg mb-8">
          <h3 className="text-lg font-semibold">Your Score</h3>
          <p className="text-4xl font-bold text-green-600 mt-2">{scorePercentage.toFixed(0)}%</p>
        </div>
        <div className="mt-8 text-left">
          {results && results.map((q, idx) => (
            <div key={idx} className="mb-8 p-6 rounded-xl shadow border bg-white">
              <div className="mb-2 font-semibold text-indigo-700">Question {idx + 1}</div>
              {q.question_type === 'audio' ? (
                <>
                  {q.audio_url && (
                    <audio controls className="mb-2">
                      <source src={q.audio_url} type="audio/mpeg" />
                      Your browser does not support the audio element.
                    </audio>
                  )}
                  <div className="mb-2"><span className="font-semibold">Prompt:</span> {q.original_text || q.question}</div>
                  <div className="mb-2 text-green-700 font-semibold">Result: Similarity Score: {q.similarity_score}</div>
                  <div className="mb-2">
                    <span className="font-semibold">Detailed Diff:</span>
                    <div className="border rounded p-2 mt-1 bg-gray-50">
                      {renderWordDiff(q.original_text || q.question, q.student_text || '')}
                    </div>
                  </div>
                  {q.missing_words && q.missing_words.length > 0 && (
                    <div className="text-sm text-yellow-700 mt-1">Missing: {q.missing_words.join(', ')}</div>
                  )}
                  {q.extra_words && q.extra_words.length > 0 && (
                    <div className="text-sm text-blue-700 mt-1">Extra: {q.extra_words.join(', ')}</div>
                  )}
                  {q.student_audio_url && (
                    <div className="mt-2">
                      <span className="font-semibold">Your Submitted Audio:</span>
                      <audio controls className="mt-1">
                        <source src={q.student_audio_url} type="audio/wav" />
                        Your browser does not support the audio element.
                      </audio>
                    </div>
                  )}
                </>
              ) : q.question_type === 'compiler' || q.question_type === 'technical' ? (
                <>
                  <div className="mb-2 font-semibold">{q.question}</div>
                  <div className="mb-2">
                    <span className="font-semibold">Language:</span> {q.language}
                  </div>
                  <div className="mb-2">
                    <span className="font-semibold">Test Cases:</span> 
                    <span className={q.passed_cases === q.total_cases ? 'text-green-700 font-semibold ml-2' : 'text-red-700 font-semibold ml-2'}>
                      {q.passed_cases}/{q.total_cases} Passed
                    </span>
                  </div>
                  {q.test_results && q.test_results.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <div className="font-semibold text-sm">Test Case Results:</div>
                      {q.test_results.map((tc, tcIdx) => (
                        <div key={tcIdx} className={`p-3 rounded border ${tc.passed ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold text-sm">Test Case {tcIdx + 1}</span>
                            <span className={`text-xs font-bold ${tc.passed ? 'text-green-700' : 'text-red-700'}`}>
                              {tc.passed ? '✓ PASSED' : '✗ FAILED'}
                            </span>
                          </div>
                          {tc.is_sample && (
                            <>
                              <div className="text-xs mt-1"><strong>Input:</strong> {tc.input}</div>
                              <div className="text-xs"><strong>Expected:</strong> {tc.expected_output}</div>
                              <div className="text-xs"><strong>Your Output:</strong> {tc.actual_output || 'No output'}</div>
                            </>
                          )}
                          {!tc.is_sample && (
                            <div className="text-xs text-gray-600 italic">Hidden test case</div>
                          )}
                          {tc.error && (
                            <div className="text-xs text-red-600 mt-1"><strong>Error:</strong> {tc.error}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {q.student_code && (
                    <div className="mt-3">
                      <div className="font-semibold text-sm mb-1">Your Code:</div>
                      <pre className="bg-gray-900 text-gray-100 p-3 rounded text-xs overflow-x-auto">
                        <code>{q.student_code}</code>
                      </pre>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="mb-2 font-semibold">{q.question}</div>
                  <div className="mb-2">Your Answer: <span className={q.is_correct ? 'text-green-700 font-semibold' : 'text-red-700 font-semibold'}>{q.student_answer}</span></div>
                  <div className="mb-2">Correct Answer: <span className="font-semibold">{q.correct_answer_text || q.correct_answer}</span></div>
                </>
              )}
            </div>
          ))}
        </div>
        <button onClick={onBack} className="mt-8 px-8 py-3 rounded-lg bg-orange-500 text-white font-semibold hover:bg-orange-600 transition">
          Retry Practice Test
        </button>
      </div>
    </motion.div>
  );
};

export default PracticeModuleTaking; 
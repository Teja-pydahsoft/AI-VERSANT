import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import api from '../../services/api';
import { useNotification } from '../../contexts/NotificationContext';

const OnlineExamTaking = () => {
  const { examId } = useParams();
  const { error: showError, success } = useNotification();
  const [questions, setQuestions] = useState([]);
  const [exam, setExam] = useState(null);
  const [answers, setAnswers] = useState({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [cheatWarning, setCheatWarning] = useState(false);
  const [cheatCount, setCheatCount] = useState(0);
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const examRef = useRef(null);
  const navigate = useNavigate();
  const [startTime, setStartTime] = useState(null);
  const [assignmentId, setAssignmentId] = useState(null);
  const [attemptId, setAttemptId] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [examDuration, setExamDuration] = useState(0);
  const [timerWarning, setTimerWarning] = useState(false);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const timerRef = useRef(null);
  const [recordings, setRecordings] = useState({});
  const [isRecording, setIsRecording] = useState(false);
  const [recordingQuestionId, setRecordingQuestionId] = useState(null);
  const [audioURLs, setAudioURLs] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExamFetched, setIsExamFetched] = useState(false);
  const [alreadyAttempted, setAlreadyAttempted] = useState(false);

  // Security measures for exam taking
  useEffect(() => {
    // Disable right-click context menu
    const handleContextMenu = (e) => e.preventDefault();
    
    // Disable text selection
    const handleSelectStart = (e) => e.preventDefault();
    
    // Disable drag and drop
    const handleDragStart = (e) => e.preventDefault();
    
    // Disable F12, Ctrl+Shift+I, Ctrl+U, Ctrl+S, Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
    const handleKeyDown = (e) => {
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && e.key === 'I') ||
        (e.ctrlKey && e.key === 'u') ||
        (e.ctrlKey && e.key === 's') ||
        (e.ctrlKey && e.key === 'a') ||
        (e.ctrlKey && e.key === 'c') ||
        (e.ctrlKey && e.key === 'v') ||
        (e.ctrlKey && e.key === 'x') ||
        (e.ctrlKey && e.key === 'p')
      ) {
        e.preventDefault();
        showError('This action is not allowed during the exam.');
      }
    };
    
    // Prevent page refresh
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = 'Are you sure you want to leave? Your progress will be lost.';
      return 'Are you sure you want to leave? Your progress will be lost.';
    };
    
    // Disable back button
    const handlePopState = (e) => {
      e.preventDefault();
      window.history.pushState(null, '', window.location.href);
      showError('You cannot navigate away from the exam.');
    };
    
    // Add event listeners
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('selectstart', handleSelectStart);
    document.addEventListener('dragstart', handleDragStart);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);
    
    // Push initial state to prevent back navigation
    window.history.pushState(null, '', window.location.href);
    
    // Cleanup
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('selectstart', handleSelectStart);
      document.removeEventListener('dragstart', handleDragStart);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [showError]);

  useEffect(() => {
    const fetchExam = async () => {
      // Prevent multiple API calls
      if (isExamFetched) return;
      
      try {
        setLoading(true);
        setIsExamFetched(true);
        
        // First, check if student has already attempted this test
        try {
          // Check completed exams first
          const completedExamsRes = await api.get('/student/completed-exams');
          const completedExamIds = completedExamsRes.data.data || [];
          
          if (completedExamIds.includes(examId)) {
            setAlreadyAttempted(true);
            return;
          }
          
          // Try to start the test - this will give us attempt_id if not already attempted
          // or fail if already attempted
          try {
            const startRes = await api.post(`/student/tests/${examId}/start`);
            // Store the attempt_id from the response
            setAttemptId(startRes.data.data.attempt_id);
            console.log('✅ Test started successfully, attempt_id:', startRes.data.data.attempt_id);
          } catch (startErr) {
            if (startErr.response?.status === 409 || 
                startErr.response?.data?.message?.includes('already attempted') ||
                startErr.response?.data?.message?.includes('Test already attempted')) {
              setAlreadyAttempted(true);
              return;
            }
            // If it's a different error, continue with exam loading
            console.warn('Test start failed:', startErr.response?.data?.message);
          }
        } catch (err) {
          console.warn('Could not check completed exams:', err);
          // Continue with exam loading if check fails
        }
        
        // Get the test details to check if it's a random assignment test
        try {
          const testRes = await api.get(`/student/test/${examId}`);
          const testData = testRes.data.data;
          
          // Set exam duration from the test data
          const duration = testData.duration || 0;
          setExamDuration(duration);
          setTimeRemaining(duration * 60); // Convert minutes to seconds
          
          
          // Check if this is a random assignment test
          if (testData.test_type === 'random_assignment' || testData.has_random_questions) {
            // Try to get the random assignment
            try {
              const res = await api.get(`/student/test/${examId}/random-assignment`);
              setExam(res.data.data);
              setQuestions(res.data.data.questions || []);
              setAssignmentId(res.data.data.assignment_id);
            } catch (randomErr) {
              // If random assignment fails, fall back to regular test
              setExam(testData);
              setQuestions(testData.questions || []);
              setAssignmentId(null);
            }
          } else {
            // Regular online test - use regular test endpoint
            setExam(testData);
            setQuestions(testData.questions || []);
            setAssignmentId(null);
            
            // Note: Test start was already called above and attempt_id is already stored
            // If we reach here, the test is not already attempted and we have attempt_id
          }
        } catch (err) {
          throw err; // Re-throw to be caught by outer catch
        }
      } catch (err) {
        showError('Failed to load exam.');
        setExam(null);
      } finally {
        setLoading(false);
      }
    };
    if (examId && !isExamFetched) fetchExam();
  }, [examId, isExamFetched]); // Removed loading from dependencies to prevent infinite loop

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
  }, []);

  // Auto-submit after 2 warnings or when time runs out
  useEffect(() => {
    if (cheatCount >= 2 && !autoSubmitted) {
      setAutoSubmitted(true);
      handleSubmit();
    }
  }, [cheatCount, autoSubmitted]);

  // Auto-submit when time runs out (only if timer is active and properly initialized)
  useEffect(() => {
    if (isTimerActive && timeRemaining <= 0 && examDuration > 0 && !autoSubmitted) {
      console.log('Auto-submitting due to time expiration');
      setAutoSubmitted(true);
      handleSubmit();
    }
  }, [timeRemaining, isTimerActive, examDuration, autoSubmitted]);

  // Timer persistence - save timer state to localStorage
  useEffect(() => {
    if (isTimerActive && timeRemaining > 0) {
      localStorage.setItem(`exam_timer_${examId}`, JSON.stringify({
        timeRemaining,
        startTime: startTime,
        examDuration
      }));
    }
  }, [timeRemaining, isTimerActive, examId, startTime, examDuration]);

  // Load timer state from localStorage on component mount
  useEffect(() => {
    if (examId && examDuration > 0) {
      const savedTimer = localStorage.getItem(`exam_timer_${examId}`);
      if (savedTimer) {
        try {
          const timerData = JSON.parse(savedTimer);
          const elapsed = startTime ? (Date.now() - startTime) / 1000 : 0;
          const remaining = Math.max(0, timerData.timeRemaining - elapsed);
          console.log('Loading timer from localStorage:', { timerData, elapsed, remaining });
          setTimeRemaining(remaining);
          if (remaining > 0) {
            setIsTimerActive(true);
          }
        } catch (err) {
          console.error('Error loading timer state:', err);
        }
      }
    }
  }, [examId, examDuration, startTime]);

  // Clean up localStorage when exam is submitted
  useEffect(() => {
    return () => {
      if (examId) {
        localStorage.removeItem(`exam_timer_${examId}`);
      }
      // Stop any ongoing recording
      if (window.currentMediaRecorder && isRecording) {
        window.currentMediaRecorder.stop();
      }
    };
  }, [examId, isRecording]);

  useEffect(() => {
    if (!loading && questions.length > 0 && !startTime) {
      setStartTime(Date.now());
      setIsTimerActive(true);
      console.log('Timer activated. Duration:', examDuration, 'minutes, Time remaining:', timeRemaining, 'seconds');
    }
  }, [loading, questions, startTime, examDuration, timeRemaining]);

  // Timer countdown effect
  useEffect(() => {
    if (isTimerActive && timeRemaining > 0) {
      console.log('Starting timer countdown. Initial time:', timeRemaining);
      timerRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          const newTime = prev - 1;
          
          // Show warning when 5 minutes or less remain
          if (newTime <= 300 && !timerWarning) {
            setTimerWarning(true);
            showError('Warning: Only 5 minutes remaining!');
          }
          
          // Show critical warning when 1 minute remains
          if (newTime <= 60 && newTime > 0) {
            showError(`Critical: Only ${newTime} seconds remaining!`);
          }
          
          // Auto-submit when time runs out
          if (newTime <= 0) {
            console.log('Time expired, auto-submitting...', {
              newTime,
              isTimerActive,
              examDuration,
              autoSubmitted,
              questionsLength: questions.length
            });
            setIsTimerActive(false);
            setAutoSubmitted(true);
            handleSubmit();
            return 0;
          }
          
          return newTime;
        });
      }, 1000);
    } else if (timeRemaining <= 0 && examDuration > 0) {
      console.log('Timer stopped. Time remaining:', timeRemaining, 'Exam duration:', examDuration);
      setIsTimerActive(false);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isTimerActive, timeRemaining, timerWarning, showError, examDuration]);

  // Debug logging for audio URLs
  useEffect(() => {
    if (questions.length > 0 && currentQuestionIndex < questions.length) {
      const currentQuestion = questions[currentQuestionIndex];
      if (currentQuestion && currentQuestion.audio_url) {
        console.log(`Question ${currentQuestionIndex + 1} Audio URL:`, currentQuestion.audio_url);
      }
    }
  }, [currentQuestionIndex, questions]);

  // Format time for display (clean MM:SS format)
  const formatTime = (seconds) => {
    const totalSeconds = Math.floor(seconds); // Remove any decimal places
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleAnswerChange = (questionId, answer) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  // Audio recording functionality for listening modules
  const startRecording = async (questionId) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Check what audio formats are supported
      const supportedTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/wav'
      ];
      
      let selectedType = 'audio/webm';
      for (const type of supportedTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          selectedType = type;
          break;
        }
      }
      
      console.log(`Using audio format: ${selectedType}`);
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType: selectedType });
      const audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
        audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: selectedType });
        const audioUrl = URL.createObjectURL(audioBlob);
        console.log(`Recording stopped for question ${questionId}: ${audioBlob.size} bytes, type: ${selectedType}`);
        setRecordings(prev => {
          const newRecordings = { ...prev, [questionId]: audioBlob };
          console.log('Updated recordings:', Object.keys(newRecordings));
          return newRecordings;
        });
        setAudioURLs(prev => ({ ...prev, [questionId]: audioUrl }));
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingQuestionId(questionId);
      
      // Store the media recorder for stopping
      window.currentMediaRecorder = mediaRecorder;
    } catch (err) {
      showError('Failed to access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (window.currentMediaRecorder && isRecording) {
      window.currentMediaRecorder.stop();
      setIsRecording(false);
      setRecordingQuestionId(null);
    }
  };

  const handleSubmit = async () => {
    try {
      // Prevent multiple submissions
      if (isSubmitting || autoSubmitted) {
        console.log('Submission already in progress, skipping...');
        return;
      }

      setIsSubmitting(true);

      // Stop the timer
      setIsTimerActive(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      const endTime = Date.now();
      const timeTakenMs = startTime ? endTime - startTime : null;

      // Check if this is a listening module that requires audio submission
      const isListeningModule = exam?.module_id === 'LISTENING' || exam?.module_id === 'SPEAKING';
      
      if (isListeningModule) {
        // Validate that all questions have audio recordings for listening modules
        const missingRecordings = [];
        questions.forEach((question, index) => {
          const questionId = question.question_id || question._id;
          if (!recordings[questionId]) {
            missingRecordings.push(index + 1);
          }
        });
        
        if (missingRecordings.length > 0) {
          showError(`Audio recording is required for questions: ${missingRecordings.join(', ')}`);
          setIsSubmitting(false);
          return;
        }
        
        // Submit using FormData for listening modules with audio recordings
        console.log('Submitting listening module with audio recordings to online listening endpoint');
        const formData = new FormData();
        formData.append('test_id', examId);
        
        // Process each question with correct indexing
        questions.forEach((question, index) => {
          const questionId = question.question_id || question._id;
          
          // Add text answer if exists (using question ID format)
          if (answers[questionId]) {
            formData.append(`question_${questionId}`, answers[questionId]);
            console.log(`Added text answer for question ${index}: ${questionId} = ${answers[questionId]}`);
          }
          
          // Add audio recording if exists (using question index format)
          if (recordings[questionId]) {
            let fileExtension = 'webm'; // default
            if (recordings[questionId].type.includes('webm')) {
              fileExtension = 'webm';
            } else if (recordings[questionId].type.includes('mp4')) {
              fileExtension = 'mp4';
            } else if (recordings[questionId].type.includes('wav')) {
              fileExtension = 'wav';
            }
            
            formData.append(`question_${index}`, recordings[questionId], `answer_${index}.${fileExtension}`);
            console.log(`Added audio recording for question ${index}: ${questionId} -> ${recordings[questionId].size} bytes, type: ${recordings[questionId].type}`);
          } else {
            console.log(`No recording found for question ${index}: ${questionId}`);
          }
        });
        
        // Debug: Log what we're sending
        console.log('FormData contents:');
        for (let [key, value] of formData.entries()) {
          if (value instanceof File || value instanceof Blob) {
            console.log(`${key}: File/Blob (${value.size} bytes, ${value.type})`);
          } else {
            console.log(`${key}: ${value}`);
          }
        }
        
        const res = await api.post('/test-management/submit-online-listening-test', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        
        if (res.data.success) {
          success('Online listening exam submitted successfully!');
          navigate('/student/history');
        } else {
          showError(res.data.message || 'Failed to submit your online listening exam.');
        }
      } else if (assignmentId) {
        // Submit using random assignment endpoint
        console.log('Submitting via random assignment endpoint with assignment_id:', assignmentId);
        const payload = {
          assignment_id: assignmentId,
          answers: answers,
          time_taken_ms: timeTakenMs
        };
        const res = await api.post(`/student/test/${examId}/submit-random`, payload);
        if (res.data.success) {
          success('Exam submitted successfully!');
          navigate('/student/history');
        } else {
          showError(res.data.message || 'Failed to submit your answers.');
        }
      } else {
        // Submit using regular test endpoint (for tests without random questions)
        
        if (!attemptId) {
          showError('No attempt ID found. Please refresh the page and try again.');
          return;
        }
        
        const payload = {
          attempt_id: attemptId,
          answers: answers,
          time_taken_ms: timeTakenMs
        };
        const res = await api.post(`/student/tests/${examId}/submit`, payload);
        if (res.data.success) {
          success('Exam submitted successfully!');
          navigate('/student/history');
        } else {
          showError(res.data.message || 'Failed to submit your answers.');
        }
      }
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to submit your answers. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
        className="text-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="w-16 h-16 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6"
        >
          <LoadingSpinner />
        </motion.div>
        <motion.h3 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="text-xl font-semibold text-slate-800 mb-2"
        >
          Loading Exam
        </motion.h3>
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="text-slate-600"
        >
          Checking access and preparing your test...
        </motion.p>
      </motion.div>
    </div>
  );

  if (alreadyAttempted) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
        className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/20 p-12 max-w-md mx-4 text-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="w-20 h-20 bg-gradient-to-r from-amber-100 to-orange-100 rounded-full flex items-center justify-center mx-auto mb-6"
        >
          <svg className="w-10 h-10 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </motion.div>
        
        <motion.h2 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="text-2xl font-bold text-slate-800 mb-4"
        >
          Test Already Attempted
        </motion.h2>
        
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="text-slate-600 mb-8 leading-relaxed"
        >
          You have already completed this test. Each test can only be attempted once.
        </motion.p>
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="space-y-4"
        >
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate('/student/exams')}
            className="w-full px-8 py-4 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-2xl font-semibold shadow-lg hover:from-blue-600 hover:to-indigo-600 transition-all duration-300 flex items-center justify-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Go to Exams
          </motion.button>
          
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate('/student/dashboard')}
            className="w-full px-8 py-3 border-2 border-slate-300 text-slate-700 rounded-2xl font-medium hover:bg-slate-50 transition-all duration-300 flex items-center justify-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Back to Dashboard
          </motion.button>
        </motion.div>
      </motion.div>
    </div>
  );

  if (!exam) return <div className="text-center p-8">Exam not found or unavailable.</div>;
  if (questions.length === 0) return <div className="text-center p-8">This exam has no questions.</div>;

  const currentQuestion = questions[currentQuestionIndex];


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 fixed inset-0 overflow-auto">
      <main className="w-full h-full px-4 py-6">
        {/* Header with Timer */}
        <header className="pb-6 mb-6 border-b border-gradient-to-r from-transparent via-slate-200 to-transparent flex justify-between items-center">
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="text-xl sm:text-2xl font-medium text-slate-700 tracking-wide"
          >
            {exam.name}
          </motion.h1>
          <div className="flex items-center space-x-6">
            <motion.span 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="bg-gradient-to-r from-blue-100 to-indigo-100 text-slate-700 px-3 py-1.5 rounded-full text-xs font-medium shadow-sm border border-blue-200"
            >
              Question {currentQuestionIndex + 1} of {questions.length}
            </motion.span>
            {/* Timer Display - Top Right */}
            {examDuration > 0 ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className={`px-4 py-2 rounded-xl border-2 font-semibold text-sm shadow-lg backdrop-blur-sm transition-all duration-500 ${
                  timeRemaining <= 300 
                    ? timeRemaining <= 60 
                      ? 'bg-gradient-to-r from-red-50 to-pink-50 border-red-300 text-red-600 animate-pulse shadow-red-200' 
                      : 'bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-300 text-amber-600 shadow-amber-200'
                    : 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-300 text-blue-600 shadow-blue-200'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <motion.svg 
                    className="w-6 h-6" 
                    fill="currentColor" 
                    viewBox="0 0 20 20"
                    animate={{ rotate: timeRemaining <= 60 ? [0, 10, -10, 0] : 0 }}
                    transition={{ duration: 0.5, repeat: timeRemaining <= 60 ? Infinity : 0 }}
                  >
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                  </motion.svg>
                  <span className="font-mono tracking-wider">{formatTime(timeRemaining)}</span>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="px-4 py-2 rounded-xl border-2 font-semibold text-sm bg-gradient-to-r from-slate-50 to-gray-50 border-slate-300 text-slate-600 shadow-lg"
              >
                <div className="flex items-center space-x-3">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                  </svg>
                  <span>No Time Limit</span>
                </div>
              </motion.div>
            )}
          </div>
        </header>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-white/20 p-8"
        >
          {/* Warning Messages */}
          {cheatWarning && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-gradient-to-r from-red-50 to-pink-50 border border-red-200 text-red-700 px-6 py-4 rounded-2xl mb-6 text-center shadow-lg"
            >
              <strong className="text-lg">Tab switching or leaving the exam is not allowed!</strong> ({cheatCount} warning{cheatCount > 1 ? 's' : ''})
              {autoSubmitted && <div className="mt-2 font-bold">Exam auto-submitted due to repeated tab switching.</div>}
            </motion.div>
          )}
          {timeRemaining <= 60 && timeRemaining > 0 && !autoSubmitted && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-gradient-to-r from-red-50 to-pink-50 border border-red-200 text-red-700 px-6 py-4 rounded-2xl mb-6 text-center shadow-lg animate-pulse"
            >
              <strong className="text-base">⚠️ CRITICAL: Only {formatTime(timeRemaining)} remaining!</strong>
              <div className="mt-2 text-xs">Exam will auto-submit when time runs out.</div>
            </motion.div>
          )}
          {timeRemaining <= 300 && timeRemaining > 60 && !timerWarning && !autoSubmitted && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 text-amber-700 px-6 py-4 rounded-2xl mb-6 text-center shadow-lg"
            >
              <strong className="text-base">⏰ Warning: Only {formatTime(timeRemaining)} remaining!</strong>
              <div className="mt-2 text-xs">Please complete your exam soon.</div>
            </motion.div>
          )}

          {/* Progress Bar */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-8"
          >
            <div className="flex justify-between text-xs text-slate-600 mb-3">
              <span className="font-medium">Progress: {Object.keys({...answers, ...recordings}).length} / {questions.length} answered</span>
              <span className="font-semibold text-slate-700">{Math.round((Object.keys({...answers, ...recordings}).length / questions.length) * 100)}%</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
              <motion.div 
                className="bg-gradient-to-r from-blue-500 to-indigo-500 h-3 rounded-full shadow-sm"
                initial={{ width: 0 }}
                animate={{ width: `${(Object.keys({...answers, ...recordings}).length / questions.length) * 100}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Question Area */}
            <div className="lg:col-span-2">
              <motion.div 
                ref={examRef} 
                className="select-none"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
              >
                <fieldset disabled={autoSubmitted} style={{ opacity: autoSubmitted ? 0.6 : 1 }}>
                  <motion.h3 
                    className="text-lg font-medium mb-6 text-slate-700 leading-relaxed"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                  >
                    {currentQuestion.question}
                  </motion.h3>


                  {/* Audio playback for listening modules */}
                  {(currentQuestion.question_type === 'audio' || currentQuestion.audio_url) && (
                    <motion.div 
                      className="mb-8 text-center"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: 0.4 }}
                    >
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                        <p className="text-blue-700 font-medium mb-2 text-sm">Listen to the audio:</p>
                        <audio 
                          key={`audio-${currentQuestion.question_id}-${currentQuestionIndex}`}
                          controls 
                          className="mx-auto w-full max-w-md"
                          onError={(e) => {
                            const error = e.target.error;
                            let errorMessage = 'Failed to load audio file.';
                            
                            if (error) {
                              switch (error.code) {
                                case MediaError.MEDIA_ERR_NETWORK:
                                  errorMessage = 'Network error loading audio. Please check your connection.';
                                  break;
                                case MediaError.MEDIA_ERR_DECODE:
                                  errorMessage = 'Audio format not supported. Please try a different browser.';
                                  break;
                                case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                                  errorMessage = 'Audio source not supported. Please contact support.';
                                  break;
                                default:
                                  errorMessage = 'Audio loading failed. Please refresh and try again.';
                              }
                            }
                            
                            showError(errorMessage);
                          }}
                          preload="auto"
                        >
                          <source src={currentQuestion.audio_url} type="audio/mpeg" />
                          <source src={currentQuestion.audio_url} type="audio/wav" />
                          <source src={currentQuestion.audio_url} type="audio/ogg" />
                          Your browser does not support the audio element.
                        </audio>
                      </div>
                    </motion.div>
                  )}
                  
                  {currentQuestion.question_type === 'mcq' && (
                    <motion.div 
                      className="space-y-4"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.6, delay: 0.5 }}
                    >
                      {Object.entries(currentQuestion.options).map(([key, value], index) => (
                        <motion.div
                          key={key}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.4, delay: 0.6 + index * 0.1 }}
                          className={`border-2 rounded-2xl p-5 cursor-pointer transition-all duration-300 hover:shadow-lg hover:scale-[1.02] ${
                            answers[currentQuestion.question_id] === value
                              ? 'border-blue-400 bg-gradient-to-r from-blue-50 to-indigo-50 ring-4 ring-blue-100 shadow-lg scale-[1.02]'
                              : 'border-slate-200 hover:border-blue-300 hover:bg-gradient-to-r hover:from-slate-50 hover:to-blue-50'
                          }`}
                          onClick={() => handleAnswerChange(currentQuestion.question_id, value)}
                        >
                          <div className="flex items-center">
                            <motion.div
                              className={`h-5 w-5 mr-4 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                                answers[currentQuestion.question_id] === value
                                  ? 'border-blue-500 bg-blue-500'
                                  : 'border-slate-300 hover:border-blue-400'
                              }`}
                            >
                              {answers[currentQuestion.question_id] === value && (
                                <motion.div
                                  className="w-2 h-2 bg-white rounded-full"
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  transition={{ duration: 0.2 }}
                                />
                              )}
                            </motion.div>
                            <input
                              type="radio"
                              name={currentQuestion.question_id}
                              value={value}
                              checked={answers[currentQuestion.question_id] === value}
                              onChange={() => handleAnswerChange(currentQuestion.question_id, value)}
                              className="sr-only"
                            />
                            <span className="font-semibold text-slate-600 mr-3 text-lg">{key}.</span>
                            <span className="text-slate-700 text-lg leading-relaxed">{value}</span>
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>
                  )}

                  {/* Audio recording interface for listening modules */}
                  {(currentQuestion.question_type === 'audio' || currentQuestion.audio_url || exam?.module_id === 'LISTENING' || exam?.module_id === 'SPEAKING') && (
                    <motion.div 
                      className="space-y-6"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.6, delay: 0.5 }}
                    >
                      <div className="text-center">
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                          <h4 className="text-lg font-semibold text-yellow-800 mb-2">Instructions for Listening Module:</h4>
                          <p className="text-yellow-700">
                            1. Listen to the audio above carefully<br/>
                            2. Click "Start Recording" to record your response<br/>
                            3. Speak clearly into your microphone<br/>
                            4. Click "Stop Recording" when finished<br/>
                            5. You can also type your response below (optional)
                          </p>
                        </div>
                        
                        {/* Recording Controls */}
                        <div className="flex justify-center space-x-4 mb-6">
                          {!isRecording ? (
                            <motion.button
                              onClick={() => startRecording(currentQuestion.question_id)}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              className="px-6 py-3 bg-red-500 text-white rounded-2xl font-semibold hover:bg-red-600 transition-all duration-300 shadow-lg flex items-center"
                            >
                              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                              </svg>
                              Start Recording
                            </motion.button>
                          ) : (
                            <motion.button
                              onClick={stopRecording}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              className="px-6 py-3 bg-gray-500 text-white rounded-2xl font-semibold hover:bg-gray-600 transition-all duration-300 shadow-lg flex items-center"
                            >
                              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1zm4 0a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                              Stop Recording
                            </motion.button>
                          )}
                        </div>

                        {/* Recording Status */}
                        {isRecording && recordingQuestionId === currentQuestion.question_id && (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg mb-4"
                          >
                            <div className="flex items-center justify-center">
                              <div className="w-3 h-3 bg-red-500 rounded-full mr-2 animate-pulse"></div>
                              Recording in progress...
                            </div>
                          </motion.div>
                        )}

                        {/* Playback of recorded audio */}
                        {audioURLs[currentQuestion.question_id] && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4"
                          >
                            <p className="text-green-700 font-semibold mb-2">Your Recording:</p>
                            <audio controls className="w-full">
                              <source src={audioURLs[currentQuestion.question_id]} type="audio/wav" />
                              Your browser does not support the audio element.
                            </audio>
                          </motion.div>
                        )}

                        {/* Text input for listening modules */}
                        <div className="mt-6">
                          <label className="block text-sm font-medium text-slate-700 mb-2">
                            Type your response (optional):
                          </label>
                          <textarea
                            value={answers[currentQuestion.question_id] || ''}
                            onChange={(e) => handleAnswerChange(currentQuestion.question_id, e.target.value)}
                            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                            rows={4}
                            placeholder="Type your response here..."
                            disabled={autoSubmitted}
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Fallback: Show recording interface for any question with audio_url or listening module */}
                  {(!currentQuestion.question_type && currentQuestion.audio_url) || (exam?.module_id === 'LISTENING' && !currentQuestion.question_type) && (
                    <motion.div 
                      className="space-y-6"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.6, delay: 0.5 }}
                    >
                      <div className="text-center">
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                          <h4 className="text-lg font-semibold text-yellow-800 mb-2">Instructions for Listening Module:</h4>
                          <p className="text-yellow-700">
                            1. Listen to the audio above carefully<br/>
                            2. Click "Start Recording" to record your response<br/>
                            3. Speak clearly into your microphone<br/>
                            4. Click "Stop Recording" when finished<br/>
                            5. You can also type your response below (optional)
                          </p>
                        </div>
                        
                        {/* Recording Controls */}
                        <div className="flex justify-center space-x-4 mb-6">
                          {!isRecording ? (
                            <motion.button
                              onClick={() => startRecording(currentQuestion.question_id)}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              className="px-6 py-3 bg-red-500 text-white rounded-2xl font-semibold hover:bg-red-600 transition-all duration-300 shadow-lg flex items-center"
                            >
                              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                              </svg>
                              Start Recording
                            </motion.button>
                          ) : (
                            <motion.button
                              onClick={stopRecording}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              className="px-6 py-3 bg-gray-500 text-white rounded-2xl font-semibold hover:bg-gray-600 transition-all duration-300 shadow-lg flex items-center"
                            >
                              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1zm4 0a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                              Stop Recording
                            </motion.button>
                          )}
                        </div>

                        {/* Recording Status */}
                        {isRecording && recordingQuestionId === currentQuestion.question_id && (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg mb-4"
                          >
                            <div className="flex items-center justify-center">
                              <div className="w-3 h-3 bg-red-500 rounded-full mr-2 animate-pulse"></div>
                              Recording in progress...
                            </div>
                          </motion.div>
                        )}

                        {/* Playback of recorded audio */}
                        {audioURLs[currentQuestion.question_id] && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4"
                          >
                            <p className="text-green-700 font-semibold mb-2">Your Recording:</p>
                            <audio controls className="w-full">
                              <source src={audioURLs[currentQuestion.question_id]} type="audio/wav" />
                              Your browser does not support the audio element.
                            </audio>
                          </motion.div>
                        )}

                        {/* Text input for listening modules */}
                        <div className="mt-6">
                          <label className="block text-sm font-medium text-slate-700 mb-2">
                            Type your response (optional):
                          </label>
                          <textarea
                            value={answers[currentQuestion.question_id] || ''}
                            onChange={(e) => handleAnswerChange(currentQuestion.question_id, e.target.value)}
                            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                            rows={4}
                            placeholder="Type your response here..."
                            disabled={autoSubmitted}
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Navigation Buttons */}
                  <motion.div 
                    className="flex justify-between mt-10"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.8 }}
                  >
                    <motion.button
                      onClick={() => setCurrentQuestionIndex(prev => prev - 1)}
                      disabled={currentQuestionIndex === 0}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="px-8 py-3 border-2 border-slate-300 text-sm font-medium rounded-2xl text-slate-700 bg-white/80 backdrop-blur-sm hover:bg-gradient-to-r hover:from-slate-50 hover:to-blue-50 hover:border-blue-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center shadow-lg transition-all duration-300"
                    >
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      Previous
                    </motion.button>
                    {currentQuestionIndex === questions.length - 1 ? (
                      <motion.button
                        onClick={handleSubmit}
                        disabled={(() => {
                          if (autoSubmitted || isSubmitting) return true;
                          if (exam?.module_id === 'LISTENING' || exam?.module_id === 'SPEAKING') {
                            // For listening/speaking modules, all questions must have recordings
                            return Object.keys(recordings).length !== questions.length;
                          } else {
                            // For other modules, check answers
                            return Object.keys(answers).length !== questions.length;
                          }
                        })()}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className={`px-8 py-3 border-2 border-transparent text-sm font-medium rounded-2xl shadow-lg text-white flex items-center transition-all duration-300 ${
                          timeRemaining <= 60 
                            ? 'bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 animate-pulse' 
                            : 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600'
                        } disabled:bg-gradient-to-r disabled:from-gray-400 disabled:to-gray-500`}
                      >
                        {isSubmitting ? 'Submitting...' : autoSubmitted ? 'Auto-Submitting...' : 'Submit Exam'}
                        <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </motion.button>
                    ) : (
                      <motion.button
                        onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
                        disabled={currentQuestionIndex === questions.length - 1}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="px-8 py-3 border-2 border-transparent text-sm font-medium rounded-2xl shadow-lg text-white bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 disabled:opacity-50 flex items-center transition-all duration-300"
                      >
                        Next
                        <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </motion.button>
                    )}
                  </motion.div>
                </fieldset>
              </motion.div>
            </div>

            {/* Question Navigation Panel */}
            <motion.div 
              className="lg:col-span-1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <div className="bg-white/60 backdrop-blur-sm p-6 rounded-3xl shadow-xl border border-white/20">
                <motion.h5 
                  className="text-center mb-6 font-light text-slate-700 text-lg"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.5 }}
                >
                  Question Navigation
                </motion.h5>
                <motion.div 
                  className="grid grid-cols-5 gap-3 mb-6"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6, delay: 0.6 }}
                >
                  {questions.map((_, index) => (
                    <motion.button
                      key={index}
                      onClick={() => setCurrentQuestionIndex(index)}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      className={`w-12 h-12 rounded-2xl text-sm font-medium transition-all duration-300 shadow-lg relative ${
                        index === currentQuestionIndex
                          ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-blue-200'
                          : answers[questions[index]?.question_id] || recordings[questions[index]?.question_id]
                          ? 'bg-gradient-to-r from-green-100 to-emerald-100 text-green-700 border-2 border-green-300 hover:shadow-green-200'
                          : 'bg-white text-slate-700 border-2 border-slate-200 hover:bg-gradient-to-r hover:from-slate-50 hover:to-blue-50 hover:border-blue-300'
                      }`}
                    >
                      {index + 1}
                      {/* Show microphone icon for recorded questions in listening modules */}
                      {(exam?.module_id === 'LISTENING' || exam?.module_id === 'SPEAKING') && recordings[questions[index]?.question_id] && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                          <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                          </svg>
                        </div>
                      )}
                    </motion.button>
                  ))}
                </motion.div>
                
                {/* Legend */}
                <motion.div 
                  className="mb-6 text-sm text-slate-600 space-y-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.7 }}
                >
                  <div className="flex items-center">
                    <div className="w-4 h-4 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full mr-3 shadow-sm"></div>
                    <span className="font-medium">Current Question</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-4 h-4 bg-gradient-to-r from-green-100 to-emerald-100 border-2 border-green-300 rounded-full mr-3"></div>
                    <span className="font-medium">Answered</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-4 h-4 bg-white border-2 border-slate-300 rounded-full mr-3"></div>
                    <span className="font-medium">Not Answered</span>
                  </div>
                </motion.div>

                <motion.div 
                  className="space-y-3"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.8 }}
                >
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full px-4 py-3 text-sm border-2 border-slate-200 rounded-2xl bg-white/80 backdrop-blur-sm hover:bg-gradient-to-r hover:from-slate-50 hover:to-blue-50 hover:border-blue-300 flex items-center justify-center shadow-lg transition-all duration-300"
                    onClick={() => {
                      // Mark for review functionality (placeholder)
                      console.log('Mark for review');
                    }}
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                    </svg>
                    Mark for Review
                  </motion.button>
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full px-4 py-3 text-sm border-2 border-slate-200 rounded-2xl bg-white/80 backdrop-blur-sm hover:bg-gradient-to-r hover:from-slate-50 hover:to-red-50 hover:border-red-300 flex items-center justify-center shadow-lg transition-all duration-300"
                    onClick={() => {
                      // Clear response functionality
                      handleAnswerChange(currentQuestion.question_id, '');
                    }}
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Clear Response
                  </motion.button>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default OnlineExamTaking; 
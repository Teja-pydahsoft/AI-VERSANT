import axios from 'axios'

// API Configuration
// Environment Variables:
// - VITE_API_URL: Set to 'https://crt-backend.raviburaga.shop' for direct backend access

// - VITE_API_URL: Set to '/api' for development with Vite proxy

// Determine API URL based on environment
const isDevelopment = import.meta.env.DEV

// Get API URL from environment variables 
let API_URL = import.meta.env.VITE_API_URL

// If no environment variable is set, use  
if (!API_URL) {
  if (isDevelopment) {
    API_URL = '/api' // Use Vite proxy in development
  } else {
    // In production, use direct backend access
    API_URL = 'https://crt-backend.raviburaga.shop'
}
}

// For development, always use the proxy regardless of VITE_API_URL
if (isDevelopment) {
  API_URL = '/api'
}

// Ensure we're using the correct backend URL for production
if (!isDevelopment && API_URL.includes('https://crt-backend.raviburaga.shop')) {
  API_URL = 'https://crt-backend.raviburaga.shop'
}

console.log('API Service - VITE_API_URL:', import.meta.env.VITE_API_URL)
console.log('API Service - DEV mode:', isDevelopment)
console.log('API Service - Using API_URL:', API_URL)
console.log('API Service - Full request URL example:', `${API_URL}/auth/login`)

// Test backend connectivity
if (!isDevelopment) {
  fetch(`${API_URL}/health`)
    .then(response => response.json())
    .then(data => console.log('Backend health check:', data))
    .catch(error => console.error('Backend health check failed:', error))
}

const api = axios.create({
  baseURL: API_URL,
  timeout: 500000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Enable credentials for CORS
})

console.log('API Service - Created axios instance with baseURL:', api.defaults.baseURL)

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token')
    if (token && token !== 'null' && token !== 'undefined') {
      console.log('Sending Authorization header:', token)
      config.headers.Authorization = `Bearer ${token}`
    }
    
    // If we are sending FormData, we need to let the browser set the Content-Type
    // which will include the boundary.
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type']
    }
    
    console.log('API Request:', config.method?.toUpperCase(), config.url)
    return config
  },
  (error) => {
    console.error('API Request Error:', error)
    return Promise.reject(error)
  }
)

// Response interceptor to handle token refresh
api.interceptors.response.use(
  (response) => {
    console.log('API Response:', response.status, response.config.url)
    return response
  },
  async (error) => {
    console.error('API Response Error:', error.response?.status, error.config?.url, error.message)
    
    // Handle 404 errors
    if (error.response?.status === 404) {
      console.error('404 Error - Endpoint not found:', error.config?.url)
    }
    
    // Handle CORS errors specifically
    if (error.message === 'Network Error' || error.code === 'ERR_NETWORK') {
      console.error('CORS/Network Error detected. This might be due to:')
      console.error('1. Backend not running')
      console.error('2. CORS configuration issue - check backend CORS settings')
      console.error('3. Network connectivity problem')
      console.error('4. Environment variable VITE_API_URL not set correctly')
      console.error('Current API URL:', API_URL)
      console.error('Request URL:', error.config?.url)
      console.error('Environment:', isDevelopment ? 'Development' : 'Production')
      console.error('VITE_API_URL:', import.meta.env.VITE_API_URL)

      console.error('Expected backend URL: https://crt-backend.raviburaga.shop')

    }
    
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        const refreshToken = localStorage.getItem('refresh_token')
        console.log('Attempting token refresh with:', refreshToken)
        if (refreshToken && refreshToken !== 'null' && refreshToken !== 'undefined') {
          const response = await axios.post(
            `${API_URL}/auth/refresh`,
            { refresh_token: refreshToken }
          )
          
          const { access_token } = response.data.data
          localStorage.setItem('access_token', access_token)
          
          originalRequest.headers.Authorization = `Bearer ${access_token}`
          return api(originalRequest)
        }
      } catch (refreshError) {
        // Don't automatically redirect, let the component handle it
        console.error('Token refresh failed:', refreshError)
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        // Remove the automatic redirect - let the AuthContext handle it
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

export const getCourses = async () => {
  return api.get('/course-management/');
};

export const getCampuses = async () => {
  return api.get('/campus-management/');
};

export const createCampus = async (campusData) => {
  return api.post('/campus-management/', campusData);
};

export const updateCampus = async (campusId, campusData) => {
  return api.put(`/campus-management/${campusId}`, campusData);
};

export const deleteCampus = async (campusId) => {
  return api.delete(`/campus-management/${campusId}`);
};

export const getCampusDetails = async (campusId) => {
  return api.get(`/campus-management/${campusId}/details`);
};

export const getCoursesByCampus = async (campusId) => {
  return api.get(`/course-management/${campusId}`);
};

export const createCourse = async (campusId, courseData) => {
  return api.post(`/course-management/${campusId}`, courseData);
};

export const updateCourse = async (courseId, courseData) => {
  return api.put(`/course-management/${courseId}`, courseData);
};

export const deleteCourse = async (courseId) => {
  return api.delete(`/course-management/${courseId}`);
};

export const getUserCountsByCampus = async () => {
  return api.get('/user-management/counts/campus');
};

export const getUserCountsByCourse = async () => {
  return api.get('/user-management/counts/course');
};

export const listUsersByCampus = async (campusId) => {
  return api.get(`/user-management/list/campus/${campusId}`);
};

export const listUsersByCourse = async (courseId) => {
  return api.get(`/user-management/list/course/${courseId}`);
};

// Batch Management API functions
export const getBatches = async () => {
  return api.get('/batch-management/');
};

export const createBatch = async (batchData) => {
  return api.post('/batch-management/', batchData);
};

export const updateBatch = async (batchId, batchData) => {
  return api.put(`/batch-management/${batchId}`, batchData);
};

export const deleteBatch = async (batchId) => {
  return api.delete(`/batch-management/${batchId}`);
};

export const getBatchCampuses = async () => {
  return api.get('/batch-management/campuses');
};

export const getBatchCourses = async (campusIds) => {
  const params = new URLSearchParams();
  campusIds.forEach(id => params.append('campus_ids', id));
  return api.get(`/batch-management/courses?${params.toString()}`);
};

export const validateStudentUpload = async (formData) => {
  return api.post('/batch-management/validate-student-upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const uploadStudentsToBatch = async (campusId, batchId, students) => {
  return api.post('/batch-management/upload-students', {
    campus_id: campusId,
    batch_id: batchId,
    students: students,
  });
};

export const verifyStudentsUpload = async (batchId, studentEmails, studentRollNumbers = []) => {
  return api.post(`/batch-management/${batchId}/verify-students`, {
    student_emails: studentEmails,
    student_roll_numbers: studentRollNumbers,
  });
};

export const cleanupFailedStudents = async (batchId, studentEmails) => {
  return api.post(`/batch-management/${batchId}/cleanup-failed-students`, {
    student_emails: studentEmails,
  });
};

export const getBatchStudents = async (batchId, course_id) => {
  let url = `/batch-management/batch/${batchId}/students`;
  if (course_id) {
    url += `?course_id=${course_id}`;
  }
  return api.get(url);
};

export const getBatchesForCourse = async (courseId) => {
  return api.get(`/batch-management/course/${courseId}/batches`);
};

export const getStudentDetails = async (studentId) => {
  return api.get(`/batch-management/student/${studentId}`);
};

export const authorizeStudentLevel = async (studentId, level) => {
  return api.post(`/batch-management/student/${studentId}/authorize-level`, { level });
};

export const lockStudentLevel = async (studentId, level) => {
  return api.post(`/batch-management/student/${studentId}/lock-level`, { level });
};

// Student Management
export const updateStudent = async (studentId, data) => {
  return api.put(`/batch-management/student/${studentId}`, data);
};

export const deleteStudent = async (studentId) => {
  return api.delete(`/batch-management/student/${studentId}`);
};

// New organized question bank upload endpoints
export const uploadQuestions = async (formData) => {
  return api.post('/test-management/upload-questions', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

export const uploadSentences = async (formData) => {
  return api.post('/test-management/upload-sentences', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

export const uploadParagraphs = async (formData) => {
  return api.post('/test-management/upload-paragraphs', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

export const uploadTechnicalQuestions = async (formData) => {
  return api.post('/test-management/upload-technical-questions', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

export const getModules = async () => {
  return api.get('/test-management/modules');
};

export const getLevels = async (moduleId) => {
  return api.get(`/test-management/levels?module_id=${moduleId}`);
};

// Legacy endpoint for backward compatibility
export const uploadModuleQuestions = async (moduleId, levelId, questions) => {
  return api.post('/test-management/module-question-bank/upload', {
    module_id: moduleId,
    level_id: levelId,
    questions,
  });
};

export const getRandomQuestionsFromBank = async (moduleId, levelId, count) => {
  return api.post('/test-management/module-question-bank/random', {
    module_id: moduleId,
    level_id: levelId,
    count,
  });
};

export const getRandomQuestionsForOnlineTest = async (moduleId, levelId, subcategory, questionCount, studentCount) => {
  return api.post('/test-management/question-bank/random-selection', {
    module_id: moduleId,
    level_id: levelId,
    subcategory,
    question_count: questionCount,
    student_count: studentCount
  });
};

export const createOnlineTestWithRandomQuestions = async (testData) => {
  return api.post('/test-management/create-online-test-with-random-questions', testData);
};

export const getStudentRandomTestAssignment = async (testId) => {
  return api.get(`/student/test/${testId}/random-assignment`);
};

export const submitRandomTest = async (testId, assignmentId, answers) => {
  return api.post(`/student/test/${testId}/submit-random`, {
    assignment_id: assignmentId,
    answers
  });
};

export const createTestFromBank = async (testData) => {
  return api.post('/test-management/create-test-from-bank', testData);
};

export const getAllTests = async () => api.get('/test-management/tests');

// Returns { count, students: [ ... ] }
export const getStudentCount = async ({ campus, batches, courses }) =>
  api.post('/test-management/student-count', { campus, batches, courses });

export const getStudentAccessStatus = async (studentId) => {
  return api.get(`/batch-management/student/${studentId}/access-status`);
};

export const authorizeStudentModule = async (studentId, moduleId) => {
  return api.post(`/batch-management/student/${studentId}/authorize-module`, { module: moduleId });
};

export const lockStudentModule = async (studentId, moduleId) => {
  return api.post(`/batch-management/student/${studentId}/lock-module`, { module: moduleId });
};

export const getStudentDetailedInsights = async (studentId) => {
  return api.get(`/batch-management/student/${studentId}/detailed-insights`);
};

export const bulkMigrateStudentsProgress = async () => {
  return api.post('/batch-management/students/bulk-migrate-progress');
};

// Question Bank CRUD Operations
export const getQuestions = async (moduleId, levelId) => {
  return api.get('/test-management/questions', {
    params: { module_id: moduleId, level_id: levelId }
  });
};

export const updateQuestion = async (questionId, data) => {
  return api.put(`/test-management/questions/${questionId}`, data);
};

export const deleteQuestion = async (questionId) => {
  return api.delete(`/test-management/questions/${questionId}`);
};

export const bulkDeleteQuestions = async (questionIds) => {
  return api.delete('/test-management/questions/bulk', {
    data: { ids: questionIds }
  });
};

// Student API functions
export const getStudentTests = async (params = {}) => {
  return api.get('/student/tests', { params });
};

export const getStudentTestDetails = async (testId) => {
  return api.get(`/student/test/${testId}`);
};

export const submitPracticeTest = async (formData) => {
  return api.post('/test-management/submit-practice-test', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
};

export const getUnlockedModules = async () => {
  return api.get('/student/unlocked-modules');
};

export const getGrammarProgress = async () => {
    return api.get('/student/grammar-progress');
};

export const getTestResultById = async (testId) => {
    return api.get(`/student/test-result/${testId}`);
};

export default api
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { toast } from 'react-hot-toast';
import api from '../../services/api';
import MCQUpload from './MCQUpload';

const MCQ_MODULES = [
  { 
    id: 'GRAMMAR', 
    name: 'Grammar', 
    color: 'from-blue-500 to-blue-600',
    icon: '📚',
    description: 'Upload grammar questions with categories like Noun, Pronoun, etc.'
  },
  { 
    id: 'VOCABULARY', 
    name: 'Vocabulary', 
    color: 'from-green-500 to-green-600',
    icon: '📖',
    description: 'Upload vocabulary questions with difficulty levels'
  },
  { 
    id: 'READING', 
    name: 'Reading', 
    color: 'from-purple-500 to-purple-600',
    icon: '📖',
    description: 'Upload reading comprehension questions'
  },
  { 
    id: 'LISTENING', 
    name: 'Listening', 
    color: 'from-yellow-500 to-yellow-600',
    icon: '🎧',
    description: 'Upload listening comprehension questions with audio'
  },
  { 
    id: 'SPEAKING', 
    name: 'Speaking', 
    color: 'from-red-500 to-red-600',
    icon: '🎤',
    description: 'Upload speaking practice questions with prompts'
  },
  { 
    id: 'WRITING', 
    name: 'Writing', 
    color: 'from-indigo-500 to-indigo-600',
    icon: '✍️',
    description: 'Upload writing practice questions and prompts'
  }
];

const QuestionBankUpload = () => {
  const [selectedModule, setSelectedModule] = useState(null);
  const [selectedLevel, setSelectedLevel] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [modules, setModules] = useState([]);
  const [levels, setLevels] = useState([]);
  const [currentStep, setCurrentStep] = useState('modules');
  const [loading, setLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [showFileDetails, setShowFileDetails] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileQuestions, setFileQuestions] = useState([]);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredQuestions, setFilteredQuestions] = useState([]);

  useEffect(() => {
    fetchModules();
    fetchUploadedFiles();
  }, []);

  useEffect(() => {
    if (selectedModule) {
      try {
        fetchLevels();
      } catch (error) {
        console.error('Error in fetchLevels useEffect:', error);
        // Set default levels as fallback
        if (selectedModule === 'GRAMMAR') {
          setLevels([
            { id: 'NOUN', name: 'Noun' },
            { id: 'PRONOUN', name: 'Pronoun' },
            { id: 'ADJECTIVE', name: 'Adjective' },
            { id: 'VERB', name: 'Verb' },
            { id: 'ADVERB', name: 'Adverb' },
            { id: 'CONJUNCTION', name: 'Conjunction' }
          ]);
        } else {
          setLevels([
            { id: `${selectedModule}_BEGINNER`, name: 'Beginner' },
            { id: `${selectedModule}_INTERMEDIATE`, name: 'Intermediate' },
            { id: `${selectedModule}_ADVANCED`, name: 'Advanced' }
          ]);
        }
      }
    } else {
      setLevels([]);
    }
  }, [selectedModule]);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredQuestions(questions);
    } else {
      const filtered = questions.filter(question =>
        question.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
        question.optionA.toLowerCase().includes(searchTerm.toLowerCase()) ||
        question.optionB.toLowerCase().includes(searchTerm.toLowerCase()) ||
        question.optionC.toLowerCase().includes(searchTerm.toLowerCase()) ||
        question.optionD.toLowerCase().includes(searchTerm.toLowerCase()) ||
        question.answer.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredQuestions(filtered);
    }
  }, [questions, searchTerm]);

  const fetchModules = async () => {
    try {
      const response = await api.get('/test-management/get-test-data');
      if (response.data.success && response.data.data.modules) {
        setModules(response.data.data.modules);
      } else {
        throw new Error('Invalid response structure');
      }
    } catch (error) {
      console.error('Error fetching modules:', error);
      // Provide fallback modules
      setModules([
        { id: 'GRAMMAR', name: 'Grammar' },
        { id: 'VOCABULARY', name: 'Vocabulary' },
        { id: 'READING', name: 'Reading' },
        { id: 'LISTENING', name: 'Listening' },
        { id: 'SPEAKING', name: 'Speaking' },
        { id: 'WRITING', name: 'Writing' }
      ]);
      toast.error('Failed to fetch modules from server, using default values');
    }
  };

  const fetchLevels = async () => {
    try {
      const response = await api.get('/test-management/get-test-data');
      if (response.data.success) {
        if (selectedModule === 'GRAMMAR') {
          setLevels(response.data.data.grammar_categories || []);
        } else {
          // For VOCABULARY, READING, LISTENING, SPEAKING, WRITING - filter levels that start with the module name
          const moduleLevels = response.data.data.levels?.filter(level => 
            level && level.id && level.name && level.id.startsWith(selectedModule)
          ).map(level => ({
            id: level.id,
            name: level.name
          })) || [];
          
          // If no levels found, create default levels
          if (moduleLevels.length === 0) {
            setLevels([
              { id: `${selectedModule}_BEGINNER`, name: 'Beginner' },
              { id: `${selectedModule}_INTERMEDIATE`, name: 'Intermediate' },
              { id: `${selectedModule}_ADVANCED`, name: 'Advanced' }
            ]);
          } else {
            setLevels(moduleLevels);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching levels:', error);
      // Provide fallback levels based on module
      if (selectedModule === 'GRAMMAR') {
        setLevels([
          { id: 'NOUN', name: 'Noun' },
          { id: 'PRONOUN', name: 'Pronoun' },
          { id: 'ADJECTIVE', name: 'Adjective' },
          { id: 'VERB', name: 'Verb' },
          { id: 'ADVERB', name: 'Adverb' },
          { id: 'CONJUNCTION', name: 'Conjunction' }
        ]);
      } else {
        setLevels([
          { id: `${selectedModule}_BEGINNER`, name: 'Beginner' },
          { id: `${selectedModule}_INTERMEDIATE`, name: 'Intermediate' },
          { id: `${selectedModule}_ADVANCED`, name: 'Advanced' }
        ]);
      }
      toast.error('Failed to fetch levels from server, using default values');
    }
  };

  const fetchUploadedFiles = async () => {
    try {
      const response = await api.get('/test-management/uploaded-files');
      if (response.data.success) {
        setUploadedFiles(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching uploaded files:', error);
      // Don't show error toast as this might be a new endpoint
    }
  };

  const fetchFileQuestions = async (fileId) => {
    try {
      const response = await api.get(`/test-management/uploaded-files/${fileId}/questions`);
      if (response.data.success) {
        setFileQuestions(response.data.data);
        setShowFileDetails(true);
      }
    } catch (error) {
      console.error('Error fetching file questions:', error);
      toast.error('Failed to fetch file questions');
    }
  };

  const fetchExistingQuestionsForLevel = async (moduleId, levelId) => {
    try {
      if (!moduleId || !levelId) {
        console.warn('Missing moduleId or levelId for fetching questions');
        setQuestions([]);
        setFilteredQuestions([]);
        return;
      }
      
      const response = await api.get(`/test-management/existing-questions?module_id=${moduleId}&level_id=${levelId}`);
      if (response.data.success) {
        setQuestions(response.data.data || []);
        setFilteredQuestions(response.data.data || []);
      } else {
        setQuestions([]);
        setFilteredQuestions([]);
      }
    } catch (error) {
      console.error('Error fetching existing questions for level:', error);
      setQuestions([]);
      setFilteredQuestions([]);
      // Don't show error toast as this might be a new level
    }
  };

  const handleModuleSelect = (module) => {
    // Ensure we're passing a string ID, not an object
    const moduleId = typeof module === 'object' ? module.id : module;
    console.log('Selected module:', moduleId, 'Type:', typeof moduleId);
    
    if (!moduleId) {
      console.error('Invalid module selected:', module);
      toast.error('Invalid module selection');
      return;
    }
    
    setSelectedModule(moduleId);
    setCurrentStep('levels');
  };

  const handleLevelSelect = (level) => {
    // Ensure we're passing a level object with proper structure
    let levelData;
    if (typeof level === 'object' && level !== null) {
      // Extract only the id and name properties to avoid any unexpected properties
      levelData = {
        id: level.id || level.module_id || '',
        name: level.name || ''
      };
    } else {
      levelData = { id: level, name: level };
    }
    
    console.log('Selected level:', levelData);
    
    if (!levelData || !levelData.id || !levelData.name) {
      console.error('Invalid level selected:', level);
      toast.error('Invalid level selection');
      return;
    }
    
    setSelectedLevel(levelData);
    setCurrentStep('upload');
    // Add a small delay to ensure state is updated before fetching questions
    setTimeout(() => {
      fetchExistingQuestionsForLevel(selectedModule, levelData.id);
    }, 100);
  };

  const handleViewQuestions = (file) => {
    setSelectedFile(file);
    setCurrentStep('questions');
    fetchFileQuestions(file._id);
  };

  const handleBackToModules = () => {
    setSelectedModule(null);
    setSelectedLevel(null);
    setCurrentStep('modules');
    setQuestions([]);
    setShowFileDetails(false);
    setSelectedFile(null);
    setEditingQuestion(null);
    setShowAddQuestion(false);
  };

  const handleBackToLevels = () => {
    setSelectedLevel(null);
    setCurrentStep('levels');
    setQuestions([]);
  };

  const handleUploadSuccess = () => {
    fetchUploadedFiles();
    // Refresh questions for current level if we're on upload step
    if (currentStep === 'upload' && selectedModule && selectedLevel) {
      fetchExistingQuestionsForLevel(selectedModule, selectedLevel.id);
    }
  };

  const downloadTemplate = () => {
    let templateData;
    
    // Create template based on module type
    if (selectedModule === 'LISTENING') {
      templateData = [
        {
          Question: 'Listen to the audio and answer the question: What is the main topic of the conversation?',
          A: 'Weather',
          B: 'Travel',
          C: 'Food',
          D: 'Sports',
          Answer: 'B',
          AudioPrompt: 'Audio file or transcript of the conversation'
        },
        {
          Question: 'Based on the audio, what time does the meeting start?',
          A: '9:00 AM',
          B: '10:00 AM',
          C: '11:00 AM',
          D: '2:00 PM',
          Answer: 'C',
          AudioPrompt: 'Audio file or transcript mentioning meeting time'
        }
      ];
    } else if (selectedModule === 'SPEAKING') {
      templateData = [
        {
          Question: 'Describe your hometown in detail. What makes it special?',
          A: 'Speaking prompt - no multiple choice',
          B: 'Speaking prompt - no multiple choice',
          C: 'Speaking prompt - no multiple choice',
          D: 'Speaking prompt - no multiple choice',
          Answer: 'A',
          Instructions: 'Student should speak for 2-3 minutes about their hometown'
        },
        {
          Question: 'What are the advantages and disadvantages of online learning?',
          A: 'Speaking prompt - no multiple choice',
          B: 'Speaking prompt - no multiple choice',
          C: 'Speaking prompt - no multiple choice',
          D: 'Speaking prompt - no multiple choice',
          Answer: 'A',
          Instructions: 'Student should speak for 3-4 minutes about online learning pros and cons'
        }
      ];
    } else if (selectedModule === 'WRITING') {
      templateData = [
        {
          Question: 'Write an essay about the importance of environmental conservation. (Minimum 200 words)',
          A: 'Writing prompt - no multiple choice',
          B: 'Writing prompt - no multiple choice',
          C: 'Writing prompt - no multiple choice',
          D: 'Writing prompt - no multiple choice',
          Answer: 'A',
          Instructions: 'Student should write a well-structured essay with introduction, body, and conclusion'
        },
        {
          Question: 'Write a formal letter to your local government requesting better public transportation.',
          A: 'Writing prompt - no multiple choice',
          B: 'Writing prompt - no multiple choice',
          C: 'Writing prompt - no multiple choice',
          D: 'Writing prompt - no multiple choice',
          Answer: 'A',
          Instructions: 'Student should write a formal letter with proper format and tone'
        }
      ];
    } else {
      // Default MCQ template for Grammar, Vocabulary, Reading
      templateData = [
        {
          Question: 'What is the next number in the sequence: 2, 4, 8, 16, ?',
          A: '24',
          B: '32',
          C: '30',
          D: '28',
          Answer: 'B'
        },
        {
          Question: 'If a train travels 120 km in 2 hours, what is its speed?',
          A: '40 km/h',
          B: '50 km/h',
          C: '60 km/h',
          D: '70 km/h',
          Answer: 'C'
        }
      ];
    }

    const csv = Papa.unparse(templateData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${selectedModule}_${selectedLevel?.name || 'MCQ'}_Template.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeleteQuestion = async (questionId) => {
    try {
      await api.delete(`/test-management/questions/${questionId}`);
      toast.success('Question deleted successfully');
      // Refresh questions based on current context
      if (currentStep === 'questions' && selectedFile) {
        fetchFileQuestions(selectedFile._id);
      } else if (currentStep === 'upload' && selectedModule && selectedLevel) {
        fetchExistingQuestionsForLevel(selectedModule, selectedLevel.id);
      }
    } catch (error) {
      console.error('Error deleting question:', error);
      toast.error('Failed to delete question');
    }
  };

  const handleEditQuestion = (question) => {
    setEditingQuestion(question);
  };

  const handleSaveEdit = async (questionData) => {
    try {
      await api.put(`/test-management/questions/${editingQuestion._id}`, questionData);
      toast.success('Question updated successfully');
      setEditingQuestion(null);
      // Refresh questions based on current context
      if (currentStep === 'questions' && selectedFile) {
        fetchFileQuestions(selectedFile._id);
      } else if (currentStep === 'upload' && selectedModule && selectedLevel) {
        fetchExistingQuestionsForLevel(selectedModule, selectedLevel.id);
      }
    } catch (error) {
      console.error('Error updating question:', error);
      toast.error('Failed to update question');
    }
  };

  const handleAddQuestion = async (questionData) => {
    try {
      let response;
      if (currentStep === 'questions' && selectedFile) {
        // Add to specific file
        response = await api.post(`/test-management/uploaded-files/${selectedFile._id}/questions`, questionData);
      } else if (currentStep === 'upload' && selectedModule && selectedLevel) {
        // Add to module/level
        const payload = {
          ...questionData,
          module_id: selectedModule,
          level_id: selectedLevel.id
        };
        response = await api.post('/test-management/questions/add', payload);
      } else {
        throw new Error('Invalid context for adding question');
      }
      
      if (response.data.success) {
        toast.success('Question added successfully');
        setShowAddQuestion(false);
        // Refresh questions based on current context
        if (currentStep === 'questions' && selectedFile) {
          fetchFileQuestions(selectedFile._id);
        } else if (currentStep === 'upload' && selectedModule && selectedLevel) {
          fetchExistingQuestionsForLevel(selectedModule, selectedLevel.id);
        }
      } else {
        toast.error(response.data.message || 'Failed to add question');
      }
    } catch (error) {
      console.error('Error adding question:', error);
      toast.error('Failed to add question');
    }
  };

  const renderModuleCards = () => (
    <main className="px-4 mt-6">
        {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-gray-800 mb-2">
              Question Bank Upload
          </h1>
            <p className="text-gray-600">
              Upload questions for different modules and manage your question bank
          </p>
        </div>

        {/* Module Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-blue-800">Available Modules:</span>
              <span className="text-sm text-blue-900 bg-blue-100 px-2 py-1 rounded">{MCQ_MODULES.length}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-blue-800">Total Uploaded Files:</span>
              <span className="text-sm text-blue-900 bg-blue-100 px-2 py-1 rounded">{uploadedFiles.length}</span>
            </div>
          </div>
        </div>

        {/* Module Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
          {MCQ_MODULES.map((module, index) => (
              <motion.div
                key={module.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer border border-gray-200"
                onClick={() => handleModuleSelect(module)}
              >
              <div className="p-8">
                  <div className="flex items-center mb-6">
                    <div className={`w-16 h-16 rounded-xl flex items-center justify-center text-3xl ${
                      module.id === 'GRAMMAR' ? 'bg-red-100 text-red-600' :
                      module.id === 'VOCABULARY' ? 'bg-blue-100 text-blue-600' :
                      module.id === 'READING' ? 'bg-purple-100 text-purple-600' :
                      module.id === 'LISTENING' ? 'bg-yellow-100 text-yellow-600' :
                      module.id === 'SPEAKING' ? 'bg-red-100 text-red-600' :
                      module.id === 'WRITING' ? 'bg-indigo-100 text-indigo-600' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {module.icon}
                    </div>
                  </div>
                <h3 className="text-2xl font-bold text-gray-800 mb-3">
                  {module.name}
                </h3>
                  <p className="text-gray-600 text-base mb-6 leading-relaxed">
                  {module.description}
                </p>
                  <div className="flex items-center text-blue-600 font-semibold text-base">
                  <span>Upload Questions</span>
                  <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
              </motion.div>
            ))}
        </div>

        {/* Uploaded Files Section */}
        {uploadedFiles.length > 0 && (
            <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Recently Uploaded Files</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {uploadedFiles.slice(0, 6).map((file) => (
                  <div key={file._id} className="bg-white rounded-xl shadow-md p-6 border border-gray-200 hover:shadow-lg transition-shadow">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-gray-800 text-lg">{file.module_name}</h3>
                      <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded-full">{file.level_name}</span>
          </div>
                    <div className="text-sm text-gray-600 mb-4 space-y-1">
                    <p><strong>File:</strong> {file.filename}</p>
                    <p><strong>Questions:</strong> {file.question_count}</p>
                    <p><strong>Uploaded:</strong> {new Date(file.uploaded_at).toLocaleDateString()}</p>
        </div>
                <button
                      onClick={() => handleViewQuestions(file)}
                      className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                  >
                    View Questions
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        </main>
  );

  const renderLevelsSection = () => (
    <main className="px-4 mt-6">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={handleBackToModules}
            className="flex items-center text-blue-600 hover:text-blue-800 font-semibold mb-4 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Modules
          </button>
            <h1 className="text-2xl font-semibold text-gray-800 mb-2">
              Select Level for {selectedModule}
          </h1>
          <p className="text-gray-600">
              Choose a level to upload questions for {selectedModule}
          </p>
          </div>

          {/* Selected Module Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-blue-800">Selected Module:</span>
                <span className="text-sm text-blue-900 bg-blue-100 px-2 py-1 rounded">{selectedModule}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-blue-800">Available Levels:</span>
                <span className="text-sm text-blue-900 bg-blue-100 px-2 py-1 rounded">{levels.length}</span>
              </div>
            </div>
          </div>

          {/* Levels Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {levels && levels.length > 0 ? (
              levels.map((level, index) => {
                // Ensure level has the expected structure
                const safeLevel = {
                  id: level?.id || level?.module_id || `level_${index}`,
                  name: level?.name || 'Unknown Level'
                };
                
                return (
                  <motion.div
                    key={safeLevel.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer border border-gray-200"
                    onClick={() => handleLevelSelect(safeLevel)}
                  >
                    <div className="p-8">
                      <div className="flex items-center mb-6">
                        <div className="w-16 h-16 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center text-2xl font-bold">
                          {safeLevel.id && safeLevel.id.includes('_') ? safeLevel.id.split('_')[1] : (safeLevel.name ? safeLevel.name.charAt(0) : 'L')}
                        </div>
                      </div>
                      <h3 className="text-2xl font-bold text-gray-800 mb-3">
                        {safeLevel.name}
                      </h3>
                      <p className="text-gray-600 text-base mb-6 leading-relaxed">
                        Upload questions for {safeLevel.name} level
                      </p>
                      <div className="flex items-center text-blue-600 font-semibold text-base">
                        <span>Upload Questions</span>
                        <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            ) : (
              <div className="col-span-full text-center py-12">
                <div className="text-4xl mb-4">📚</div>
                <p className="text-gray-500 text-lg">No levels available for {selectedModule}</p>
                <p className="text-gray-400 text-sm">Please check the module configuration</p>
              </div>
            )}
          </div>
        </main>
  );

  const renderUploadSection = () => {
    // Don't render if we don't have the required data
    if (!selectedModule || !selectedLevel) {
      return (
        <main className="px-4 mt-6">
              <div className="text-center py-12">
                <div className="text-4xl mb-4">⚠️</div>
                <p className="text-gray-500 text-lg">Missing module or level information</p>
                <button
                  onClick={handleBackToLevels}
                  className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Back to Levels
                </button>
              </div>
            </main>
      );
    }

    return (
    <main className="px-4 mt-6">
          {/* Header */}
          <div className="mb-8">
            <button
              onClick={handleBackToLevels}
              className="flex items-center text-blue-600 hover:text-blue-800 font-semibold mb-4 transition-colors"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Levels
            </button>
            
            <h1 className="text-2xl font-semibold text-gray-800 mb-2">
              Upload Questions for {selectedModule} - {selectedLevel?.name}
            </h1>
            <p className="text-gray-600">
              Upload your CSV or XLSX file with questions for {selectedLevel?.name}
            </p>
          </div>

          {/* Selected Module and Level Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-blue-800">Module:</span>
                <span className="text-sm text-blue-900 bg-blue-100 px-2 py-1 rounded">{selectedModule}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-blue-800">Level:</span>
                <span className="text-sm text-blue-900 bg-blue-100 px-2 py-1 rounded">{selectedLevel?.name}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-blue-800">Level ID:</span>
                <span className="text-sm text-blue-900 bg-blue-100 px-2 py-1 rounded">{selectedLevel?.id}</span>
              </div>
            </div>
          </div>

          {/* Upload Card */}
          <div className="bg-white rounded-2xl shadow-lg p-10 mb-8">
            {/* Template Download - Moved to corner */}
            <div className="flex justify-end mb-8">
            <button
                onClick={downloadTemplate}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-base flex items-center"
            >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download Template
            </button>
          </div>

          {/* MCQ Upload Component */}
          {selectedModule && selectedLevel?.id && (
            <MCQUpload
              questions={questions}
              setQuestions={setQuestions}
              onNext={handleUploadSuccess}
              onBack={handleBackToModules}
              moduleName={selectedModule}
              levelId={selectedLevel.id}
              onUploadSuccess={handleUploadSuccess}
            />
          )}

          {/* Add Question Button */}
          <div className="flex justify-end mt-6">
            <button
              onClick={() => setShowAddQuestion(true)}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-base flex items-center"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add Question
            </button>
          </div>
        </div>

        {/* Existing Questions Section */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-800">
              Existing Questions for {selectedModule} - {selectedLevel?.name}
            </h2>
            <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
              {filteredQuestions.length} of {questions.length} questions
            </span>
          </div>

          {/* Search Bar */}
          <div className="mb-6">
            <div className="relative">
              <input
                type="text"
                placeholder="Search questions, options, or answers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-3 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  <svg className="h-5 w-5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          
          {filteredQuestions.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredQuestions.map((question, index) => (
                <div key={question._id || index} className="bg-gray-50 rounded-xl p-6 border border-gray-200 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-800 text-sm">
                      Q{index + 1}: {question.question.length > 50 ? question.question.substring(0, 50) + '...' : question.question}
                    </h3>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleEditQuestion(question)}
                        className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteQuestion(question._id)}
                        className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2 text-xs text-gray-600">
                    <div className="p-2 bg-white rounded border">A: {question.optionA}</div>
                    <div className="p-2 bg-white rounded border">B: {question.optionB}</div>
                    <div className="p-2 bg-white rounded border">C: {question.optionC}</div>
                    <div className="p-2 bg-white rounded border">D: {question.optionD}</div>
                  </div>
                  <div className="mt-3 text-xs">
                    <span className="font-medium text-green-600">Answer: {question.answer}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : searchTerm ? (
            <div className="text-center py-8 text-gray-500">
              <div className="text-4xl mb-4">🔍</div>
              <p>No questions found matching "{searchTerm}"</p>
              <p className="text-sm">Try a different search term</p>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <div className="text-4xl mb-4">📝</div>
              <p>No questions uploaded yet for {selectedModule} - {selectedLevel?.name}</p>
              <p className="text-sm">Upload your first question file to get started</p>
            </div>
          )}
        </div>
        </main>
  );
  };

  const renderFileDetails = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
            <h2 className="text-2xl font-bold text-gray-800">
              File Questions - {selectedFile?.filename}
            </h2>
              <div className="text-sm text-gray-600 mt-2">
                <p><strong>Module:</strong> {selectedFile?.module_name} | <strong>Level:</strong> {selectedFile?.level_name}</p>
                <p><strong>Uploaded:</strong> {selectedFile?.uploaded_at ? new Date(selectedFile.uploaded_at).toLocaleString() : 'N/A'}</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowAddQuestion(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm flex items-center"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Question
              </button>
            <button
                onClick={() => {
                  setShowFileDetails(false);
                  setCurrentStep('modules');
                }}
              className="text-gray-500 hover:text-gray-700"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          </div>
        </div>
        
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {fileQuestions.map((question, index) => (
            <div key={index} className="mb-6 p-6 border border-gray-200 rounded-lg bg-gray-50">
              {editingQuestion && editingQuestion._id === question._id ? (
                <EditQuestionForm 
                  question={question} 
                  onSave={handleSaveEdit} 
                  onCancel={() => setEditingQuestion(null)}
                />
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-800 text-lg">
                Q{index + 1}: {question.question}
              </h3>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleEditQuestion(question)}
                        className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteQuestion(question._id)}
                        className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-600">
                    <div className="p-3 bg-white rounded border">A: {question.optionA}</div>
                    <div className="p-3 bg-white rounded border">B: {question.optionB}</div>
                    <div className="p-3 bg-white rounded border">C: {question.optionC}</div>
                    <div className="p-3 bg-white rounded border">D: {question.optionD}</div>
                  </div>
                  <div className="mt-3 text-sm">
                    <span className="font-medium text-green-600">Answer: {question.answer}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderAddQuestionModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-800">Add New Question</h2>
            <button
              onClick={() => setShowAddQuestion(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <AddQuestionForm 
          onSave={handleAddQuestion} 
          onCancel={() => setShowAddQuestion(false)}
        />
      </div>
    </div>
  );

  return (
    <div>
      {currentStep === 'modules' && renderModuleCards()}
      {currentStep === 'levels' && renderLevelsSection()}
      {currentStep === 'upload' && renderUploadSection()}
      {currentStep === 'questions' && renderFileDetails()}
      {showAddQuestion && renderAddQuestionModal()}
    </div>
  );
};

// Edit Question Form Component
const EditQuestionForm = ({ question, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    question: question.question || '',
    optionA: question.optionA || '',
    optionB: question.optionB || '',
    optionC: question.optionC || '',
    optionD: question.optionD || '',
    answer: question.answer || ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Question</label>
        <textarea
          value={formData.question}
          onChange={(e) => handleInputChange('question', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          rows="3"
          required
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Option A</label>
          <input
            type="text"
            value={formData.optionA}
            onChange={(e) => setFormData({...formData, optionA: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Option B</label>
          <input
            type="text"
            value={formData.optionB}
            onChange={(e) => setFormData({...formData, optionB: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Option C</label>
          <input
            type="text"
            value={formData.optionC}
            onChange={(e) => setFormData({...formData, optionC: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Option D</label>
          <input
            type="text"
            value={formData.optionD}
            onChange={(e) => setFormData({...formData, optionD: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Correct Answer</label>
        <select
          value={formData.answer}
          onChange={(e) => setFormData({...formData, answer: e.target.value})}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          required
        >
          <option value="">Select answer</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
          <option value="D">D</option>
        </select>
      </div>
      <div className="flex justify-end space-x-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Save Changes
        </button>
      </div>
    </form>
  );
};

// Add Question Form Component
const AddQuestionForm = ({ onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    question: '',
    optionA: '',
    optionB: '',
    optionC: '',
    optionD: '',
    answer: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Question</label>
        <textarea
          value={formData.question}
          onChange={(e) => setFormData({...formData, question: e.target.value})}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          rows="3"
          required
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Option A</label>
          <input
            type="text"
            value={formData.optionA}
            onChange={(e) => setFormData({...formData, optionA: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Option B</label>
          <input
            type="text"
            value={formData.optionB}
            onChange={(e) => setFormData({...formData, optionB: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Option C</label>
          <input
            type="text"
            value={formData.optionC}
            onChange={(e) => setFormData({...formData, optionC: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Option D</label>
          <input
            type="text"
            value={formData.optionD}
            onChange={(e) => setFormData({...formData, optionD: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Correct Answer</label>
        <select
          value={formData.answer}
          onChange={(e) => setFormData({...formData, answer: e.target.value})}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          required
        >
          <option value="">Select answer</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
          <option value="D">D</option>
        </select>
      </div>
      <div className="flex justify-end space-x-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          Add Question
        </button>
      </div>
    </form>
  );
};

export default QuestionBankUpload; 
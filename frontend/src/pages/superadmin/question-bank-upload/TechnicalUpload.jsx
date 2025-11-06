import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  FileText, 
  Upload, 
  Download, 
  AlertCircle, 
  CheckCircle, 
  Code,
  Cpu,
  Settings,
  Play,
  TestTube
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import api, { uploadTechnicalQuestions } from '../../../services/api';
import { 
  validateFile, 
  parseFile, 
  handleUploadSuccess, 
  handleUploadError, 
  removeFile, 
  withLoading,
  generateCSVTemplate,
  PreviewModal,
  validateRequired,
  validateLength
} from './CommonUploadUtils';

const TechnicalUpload = ({ moduleName, levelId, onUploadSuccess }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [previewQuestions, setPreviewQuestions] = useState([]);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [questionType, setQuestionType] = useState('compiler'); // 'compiler' or 'mcq'
  const [language, setLanguage] = useState('python');
  const [difficulty, setDifficulty] = useState('medium'); // 'easy', 'medium', 'hard'
  const [uploadResponse, setUploadResponse] = useState(null);
  const [isResponseModalOpen, setIsResponseModalOpen] = useState(false);

  // Enhanced technical question validation
  const validateTechnicalQuestion = (question) => {
    const errors = [];
    
    if (questionType === 'compiler') {
      // Validate compiler-integrated questions
      if (!question.questionTitle || question.questionTitle.trim() === '') {
        errors.push('Question title is required');
      }
      
      if (!question.problemStatement || question.problemStatement.trim() === '') {
        errors.push('Problem statement is required');
      }
      
      if (!question.language || question.language.trim() === '') {
        errors.push('Programming language is required');
      }
      
      // Validate test cases
      if (!question.testCases || question.testCases.length === 0) {
        errors.push('At least one test case is required');
      } else {
        question.testCases.forEach((testCase, index) => {
          if (!testCase.input && !testCase.expectedOutput) {
            errors.push(`Test case ${index + 1} must have input or expected output`);
          }
        });
      }
      
      // Validate problem statement length
      if (question.problemStatement && question.problemStatement.length < 20) {
        errors.push('Problem statement must be at least 20 characters');
      }
      
      if (question.problemStatement && question.problemStatement.length > 1000) {
        errors.push('Problem statement must be less than 1000 characters');
      }
    } else {
      // Validate MCQ questions
      if (!question.question || question.question.trim() === '') {
        errors.push('Question text is required');
      }
      
      if (!question.optionA || question.optionA.trim() === '') {
        errors.push('Option A is required');
      }
      
      if (!question.optionB || question.optionB.trim() === '') {
        errors.push('Option B is required');
      }
      
      if (!question.optionC || question.optionC.trim() === '') {
        errors.push('Option C is required');
      }
      
      if (!question.optionD || question.optionD.trim() === '') {
        errors.push('Option D is required');
      }
      
      if (!question.answer || question.answer.trim() === '') {
        errors.push('Answer is required');
      }
      
      // Validate answer format
      const validAnswers = ['A', 'B', 'C', 'D', 'a', 'b', 'c', 'd'];
      if (question.answer && !validAnswers.includes(question.answer.trim())) {
        errors.push('Answer must be A, B, C, or D');
      }
      
      // Check for duplicate options
      const options = [
        question.optionA?.trim(),
        question.optionB?.trim(),
        question.optionC?.trim(),
        question.optionD?.trim()
      ].filter(Boolean);
      
      if (new Set(options).size !== options.length) {
        errors.push('All options must be unique');
      }
      
      // Validate question length
      if (question.question && question.question.length < 10) {
        errors.push('Question must be at least 10 characters');
      }
      
      if (question.question && question.question.length > 500) {
        errors.push('Question must be less than 500 characters');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const validation = validateFile(selectedFile, ['csv', 'xlsx', 'xls']);
      if (!validation.valid) {
        setError(validation.error);
        return;
      }
      setFile(selectedFile);
      setError('');
    }
  };

  const processFileForPreview = async () => {
    if (!file) return;

    try {
      const fileExtension = file.name.toLowerCase().split('.').pop();
      const parsedData = await parseFile(file, fileExtension);
      
      let questions = [];
      
      if (questionType === 'compiler') {
        // Parse compiler-integrated questions with enhanced structure
        questions = parsedData.map((row, index) => {
          const testCases = [];

          // Parse test cases (up to 10)
          for (let i = 1; i <= 10; i++) {
            const inputKey = `TestCase${i}Input`;
            const outputKey = `TestCase${i}Output`;
            const descriptionKey = `TestCase${i}Description`;
            const responseTimeKey = `TestCase${i}ResponseTime`;
            const pointsKey = `TestCase${i}Points`;
            const isSampleKey = `TestCase${i}IsSample`;

            if (row[inputKey] || row[outputKey]) {
              testCases.push({
                id: i,
                input: row[inputKey] || '',
                expected_output: row[outputKey] || '', // Changed to snake_case
                description: row[descriptionKey] || `Test case ${i}`,
                response_time: parseInt(row[responseTimeKey]) || null, // Optional response time in ms
                points: parseInt(row[pointsKey]) || 1, // Points for this test case
                is_sample: row[isSampleKey] ? row[isSampleKey].toLowerCase() === 'true' : i <= 2 // First 2 are sample by default
              });
            }
          }

          return {
            questionTitle: row.QuestionTitle || row.title || row.Title || '',
            problemStatement: row.ProblemStatement || row.statement || row.Statement || '',
            language: row.Language || row.language || language,
            difficulty: row.Difficulty || row.difficulty || difficulty,
            testCases: testCases,
            instructions: row.Instructions || row.instructions || '',
            timeLimit: row.TimeLimit || row.timeLimit || 30, // minutes
            memoryLimit: row.MemoryLimit || row.memoryLimit || 256, // MB
            category: row.Category || row.category || 'algorithms',
            index: index + 1
          };
        });
      } else {
        // Parse MCQ questions with enhanced structure
        questions = parsedData.map((row, index) => ({
          question: row.Question || row.question || '',
          optionA: row.OptionA || row.optionA || row.A || '',
          optionB: row.OptionB || row.optionB || row.B || '',
          optionC: row.OptionC || row.optionC || row.C || '',
          optionD: row.OptionD || row.optionD || row.D || '',
          answer: (row.Answer || row.answer || '').toUpperCase(),
          difficulty: row.Difficulty || row.difficulty || difficulty,
          category: row.Category || row.category || 'general',
          explanation: row.Explanation || row.explanation || '',
          instructions: row.Instructions || row.instructions || '',
          timeLimit: row.TimeLimit || row.timeLimit || 2, // minutes per question
          index: index + 1
        }));
      }

      // Validate questions
      const validatedQuestions = questions.map(question => {
        const validation = validateTechnicalQuestion(question);
        return {
          ...question,
          status: validation.valid ? 'Valid' : 'Invalid',
          errors: validation.errors
        };
      });

      setPreviewQuestions(validatedQuestions);
      setIsPreviewModalOpen(true);
      
      const validCount = validatedQuestions.filter(q => q.status === 'Valid').length;
      const invalidCount = validatedQuestions.filter(q => q.status === 'Invalid').length;
      
      if (validCount > 0) {
        toast.success(`${validCount} valid questions found`);
      }
      if (invalidCount > 0) {
        toast.error(`${invalidCount} invalid questions found`);
      }
      
    } catch (error) {
      setError(`Error processing file: ${error.message}`);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file to upload');
      return;
    }

    const validQuestions = previewQuestions.filter(q => q.status === 'Valid');
    if (validQuestions.length === 0) {
      setError('No valid questions to upload');
      return;
    }

    await withLoading(setUploading, async () => {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('module_id', moduleName);
        formData.append('level_id', levelId);
        formData.append('question_type', questionType);
        formData.append('language', language);
        formData.append('difficulty', difficulty);

        const response = await uploadTechnicalQuestions(formData);

        if (response.data.success) {
          setUploadResponse(response.data);
          setIsResponseModalOpen(true);
          setSuccess('Upload completed successfully');
          setFile(null);
          setIsPreviewModalOpen(false);
          if (onUploadSuccess) {
            onUploadSuccess();
          }
        } else {
          setUploadResponse(response.data);
          setIsResponseModalOpen(true);
          setError(response.data.message || 'Upload failed');
        }
      } catch (error) {
        handleUploadError(error, 'Failed to upload technical questions');
      }
    });
  };

  const downloadCompilerTemplate = () => {
    const headers = [
      'QuestionTitle',
      'ProblemStatement',
      'Language',
      'Difficulty',
      'Category',
      'TimeLimit',
      'MemoryLimit',
      'Instructions',
      'TestCase1Input',
      'TestCase1Output',
      'TestCase1Description',
      'TestCase1ResponseTime',
      'TestCase1Points',
      'TestCase1IsSample',
      'TestCase2Input',
      'TestCase2Output',
      'TestCase2Description',
      'TestCase2ResponseTime',
      'TestCase2Points',
      'TestCase2IsSample',
      'TestCase3Input',
      'TestCase3Output',
      'TestCase3Description',
      'TestCase3ResponseTime',
      'TestCase3Points',
      'TestCase3IsSample'
    ];
    generateCSVTemplate(headers, `${moduleName}_Compiler_Template.csv`);
  };

  const downloadMCQTemplate = () => {
    const headers = [
      'Question', 
      'OptionA', 
      'OptionB', 
      'OptionC', 
      'OptionD', 
      'Answer', 
      'Difficulty',
      'Category',
      'Explanation',
      'Instructions',
      'TimeLimit'
    ];
    generateCSVTemplate(headers, `${moduleName}_MCQ_Template.csv`);
  };

  const downloadSampleCompilerData = () => {
    const sampleData = `QuestionTitle,ProblemStatement,Language,Difficulty,Category,TimeLimit,MemoryLimit,Instructions,TestCase1Input,TestCase1Output,TestCase1Description,TestCase1Points,TestCase1IsSample,TestCase2Input,TestCase2Output,TestCase2Description,TestCase2Points,TestCase2IsSample,TestCase3Input,TestCase3Output,TestCase3Description,TestCase3Points,TestCase3IsSample
"Sum of Two Numbers","Write a program that takes two integers as input and outputs their sum. The program should read two numbers from standard input and print their sum to standard output.",python,easy,arithmetic,30,128,"Read two integers from input and print their sum. Input format: two space-separated integers on a single line.",5 3,8,"Basic addition test",1,true,10 20,30,"Larger numbers test",1,true,-5 15,10,"Negative number test",1,false
"String Reversal","Write a program that reads a string from input and prints it in reverse order. Handle strings with spaces and special characters.",python,easy,strings,30,128,"Read a line of text and output it reversed. Preserve spaces and case.",hello,olleh,"Simple word reversal",1,true,"Hello World","dlroW olleH","String with space",1,true,"123!@#","#@!321","Special characters",1,false
"Even or Odd","Write a program that determines if a given integer is even or odd. Print 'Even' for even numbers and 'Odd' for odd numbers.",python,easy,conditionals,30,128,"Read an integer and determine if it's even or odd. Output exactly 'Even' or 'Odd'.",4,Even,"Even number test",1,true,7,Odd,"Odd number test",1,true,0,Even,"Zero test",1,false`;

    const blob = new Blob([sampleData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${moduleName}_Compiler_Sample.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const downloadSampleMCQData = () => {
    const sampleData = `Question,OptionA,OptionB,OptionC,OptionD,Answer,Difficulty,Category,Explanation,Instructions,TimeLimit
"What is the time complexity of binary search?",O(log n),O(n),O(n²),O(1),A,medium,algorithms,"Binary search divides the search space in half with each iteration, resulting in logarithmic time complexity.","Select the correct time complexity for binary search algorithm.",2
"Which data structure uses LIFO principle?",Queue,Stack,Tree,Graph,B,easy,data_structures,"Stack follows Last In First Out (LIFO) principle where the last element added is the first one to be removed.","Choose the data structure that follows LIFO principle.",2`;
    
    const blob = new Blob([sampleData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${moduleName}_MCQ_Sample.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <div className="flex items-center space-x-3 mb-2">
          <Code className="h-8 w-8 text-blue-500" />
          <h2 className="text-2xl font-bold text-gray-900">Technical Questions Upload - {moduleName}</h2>
        </div>
        <p className="text-gray-600">
          Upload technical questions for {moduleName} module. Support both compiler-integrated and MCQ formats with enhanced structure.
        </p>
      </div>

      {/* Question Type Selection */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Question Type</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => setQuestionType('compiler')}
            className={`p-4 border-2 rounded-lg text-left transition-colors ${
              questionType === 'compiler'
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center space-x-3">
              <Code className="h-6 w-6 text-blue-500" />
              <div>
                <h4 className="font-semibold">Compiler-Integrated</h4>
                <p className="text-sm text-gray-600">Programming questions with test cases and execution</p>
                <div className="mt-2 text-xs text-gray-500">
                  • Multiple test cases<br/>
                  • Time & memory limits<br/>
                  • Language-specific execution
                </div>
              </div>
            </div>
          </button>

          <button
            onClick={() => setQuestionType('mcq')}
            className={`p-4 border-2 rounded-lg text-left transition-colors ${
              questionType === 'mcq'
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center space-x-3">
              <Cpu className="h-6 w-6 text-blue-500" />
              <div>
                <h4 className="font-semibold">Multiple Choice</h4>
                <p className="text-sm text-gray-600">MCQ questions with explanations and categories</p>
                <div className="mt-2 text-xs text-gray-500">
                  • 4 options (A, B, C, D)<br/>
                  • Difficulty levels<br/>
                  • Category classification
                </div>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Configuration Section */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {questionType === 'compiler' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Programming Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="python">Python</option>
                <option value="java">Java</option>
                <option value="cpp">C++</option>
                <option value="javascript">JavaScript</option>
                <option value="c">C</option>
                <option value="csharp">C#</option>
                <option value="php">PHP</option>
                <option value="ruby">Ruby</option>
              </select>
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Difficulty Level</label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
            <select
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="algorithms">Algorithms</option>
              <option value="data_structures">Data Structures</option>
              <option value="strings">Strings</option>
              <option value="arrays">Arrays</option>
              <option value="dynamic_programming">Dynamic Programming</option>
              <option value="graphs">Graphs</option>
              <option value="trees">Trees</option>
              <option value="general">General</option>
            </select>
          </div>
        </div>
      </div>

      {/* File Upload Section */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Upload Questions</h3>
          <div className="flex space-x-2">
            <button
              onClick={questionType === 'compiler' ? downloadCompilerTemplate : downloadMCQTemplate}
              className="flex items-center space-x-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Download className="h-4 w-4" />
              <span>{questionType === 'compiler' ? 'Compiler Template' : 'MCQ Template'}</span>
            </button>
            <button
              onClick={questionType === 'compiler' ? downloadSampleCompilerData : downloadSampleMCQData}
              className="flex items-center space-x-2 px-3 py-2 text-sm border border-green-300 rounded-lg hover:bg-green-50 text-green-700"
            >
              <Play className="h-4 w-4" />
              <span>Sample Data</span>
            </button>
          </div>
        </div>

        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-2">
            Drag and drop your file here, or click to browse
          </p>
          <p className="text-sm text-gray-500 mb-4">
            Supported formats: CSV, Excel (.xlsx, .xls)
          </p>
          <input
            type="file"
            onChange={handleFileChange}
            accept=".csv,.xlsx,.xls"
            className="hidden"
            id="technical-file-upload"
          />
          <label
            htmlFor="technical-file-upload"
            className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 cursor-pointer"
          >
            Choose File
          </label>
        </div>

        {file && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <FileText className="h-5 w-5 text-gray-500" />
                <span className="text-sm font-medium">{file.name}</span>
                <span className="text-xs text-gray-500">
                  ({(file.size / 1024).toFixed(1)} KB)
                </span>
              </div>
              <button
                onClick={() => removeFile(setFile, setError, setSuccess)}
                className="text-red-500 hover:text-red-700"
              >
                Remove
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <span className="text-red-700">{error}</span>
            </div>
          </div>
        )}

        {success && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span className="text-green-700">{success}</span>
            </div>
          </div>
        )}
      </div>

      {/* Upload Button */}
      {file && (
        <div className="flex justify-center">
          <button
            onClick={processFileForPreview}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Preview Questions
          </button>
        </div>
      )}

      {/* Preview Modal */}
      <PreviewModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        title="Question Preview"
        onConfirm={handleUpload}
        confirmText="Upload Questions"
      >
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="font-medium">Preview of Questions</h4>
            <div className="text-sm text-gray-500">
              Type: {questionType === 'compiler' ? 'Compiler-Integrated' : 'MCQ'} | 
              Language: {language} | 
              Difficulty: {difficulty} | 
              Showing {previewQuestions.length} questions
            </div>
          </div>
          
          <div className="max-h-96 overflow-y-auto space-y-3">
            {previewQuestions.map((question, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border ${
                  question.status === 'Valid' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="text-sm font-medium">Question {question.index}</span>
                  <div className="flex items-center space-x-2">
                    <span className={`text-xs px-2 py-1 rounded ${
                      question.status === 'Valid' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {question.status}
                    </span>
                    {question.difficulty && (
                      <span className={`text-xs px-2 py-1 rounded ${
                        question.difficulty === 'easy' ? 'bg-green-100 text-green-800' :
                        question.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {question.difficulty}
                      </span>
                    )}
                  </div>
                </div>
                
                {questionType === 'compiler' ? (
                  <div className="space-y-2">
                    <div className="text-sm">
                      <strong>Title:</strong> {question.questionTitle}
                    </div>
                    <div className="text-sm">
                      <strong>Problem:</strong> {question.problemStatement}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div><strong>Language:</strong> {question.language}</div>
                      <div><strong>Category:</strong> {question.category}</div>
                      <div><strong>Time Limit:</strong> {question.timeLimit}min</div>
                    </div>
                    {question.testCases && question.testCases.length > 0 && (
                      <div className="text-sm">
                        <strong>Test Cases:</strong> {question.testCases.length} case(s)
                        <div className="mt-1 text-xs text-gray-600">
                          {question.testCases.slice(0, 2).map((tc, i) => (
                            <div key={i}>• {tc.description}: Input={tc.input}, Output={tc.expectedOutput}</div>
                          ))}
                          {question.testCases.length > 2 && <div>• ... and {question.testCases.length - 2} more</div>}
                        </div>
                      </div>
                    )}
                    {question.instructions && (
                      <div className="text-sm">
                        <strong>Instructions:</strong> {question.instructions}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-sm">
                      <strong>Q:</strong> {question.question}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><strong>A:</strong> {question.optionA}</div>
                      <div><strong>B:</strong> {question.optionB}</div>
                      <div><strong>C:</strong> {question.optionC}</div>
                      <div><strong>D:</strong> {question.optionD}</div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div><strong>Answer:</strong> {question.answer}</div>
                      <div><strong>Category:</strong> {question.category}</div>
                      <div><strong>Time:</strong> {question.timeLimit}min</div>
                    </div>
                    {question.explanation && (
                      <div className="text-sm">
                        <strong>Explanation:</strong> {question.explanation}
                      </div>
                    )}
                  </div>
                )}
                
                {question.errors && question.errors.length > 0 && (
                  <div className="mt-2 text-xs text-red-600">
                    {question.errors.join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </PreviewModal>

      {/* Upload Response Modal */}
      {uploadResponse && isResponseModalOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => {
            setIsResponseModalOpen(false);
            setUploadResponse(null);
          }}
        >
          <div 
            className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Upload Results
              </h3>
              <button
                onClick={() => {
                  setIsResponseModalOpen(false);
                  setUploadResponse(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {uploadResponse.details?.total_questions || 0}
                </div>
                <div className="text-sm text-blue-800">Total Questions</div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {uploadResponse.details?.valid_questions || 0}
                </div>
                <div className="text-sm text-green-800">Successfully Uploaded</div>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">
                  {uploadResponse.details?.duplicate_questions || 0}
                </div>
                <div className="text-sm text-yellow-800">Duplicates Skipped</div>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-red-600">
                  {uploadResponse.details?.invalid_questions || 0}
                </div>
                <div className="text-sm text-red-800">Invalid Questions</div>
              </div>
            </div>

            {/* Duplicate Questions */}
            {uploadResponse.details?.duplicates && uploadResponse.details.duplicates.length > 0 && (
              <div className="mb-6">
                <h4 className="text-md font-semibold text-gray-900 mb-3 flex items-center">
                  <AlertCircle className="h-5 w-5 text-yellow-500 mr-2" />
                  Duplicate Questions (Skipped)
                </h4>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {uploadResponse.details.duplicates.map((duplicate, index) => (
                    <div key={index} className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-yellow-800">
                            Question #{duplicate.index}
                          </div>
                          <div className="text-sm text-yellow-700 mt-1">
                            {duplicate.question}
                          </div>
                          <div className="text-xs text-yellow-600 mt-1">
                            {duplicate.reason}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Invalid Questions */}
            {uploadResponse.details?.invalid && uploadResponse.details.invalid.length > 0 && (
              <div className="mb-6">
                <h4 className="text-md font-semibold text-gray-900 mb-3 flex items-center">
                  <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
                  Invalid Questions (Skipped)
                </h4>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {uploadResponse.details.invalid.map((invalid, index) => (
                    <div key={index} className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-red-800">
                            Question #{invalid.index}
                          </div>
                          <div className="text-sm text-red-700 mt-1">
                            {invalid.question || 'Empty question'}
                          </div>
                          <div className="text-xs text-red-600 mt-1">
                            {invalid.reason}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setIsResponseModalOpen(false);
                  setUploadResponse(null);
                }}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TechnicalUpload; 
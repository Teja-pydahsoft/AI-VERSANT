import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FileText, Upload, Eye, Download, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api, { uploadQuestions, getModules, getLevels } from '../../../services/api';
import { 
  validateFile, 
  parseFile, 
  generatePreview, 
  handleUploadSuccess, 
  handleUploadError, 
  removeFile, 
  withLoading,
  generateCSVTemplate,
  PreviewModal,
  mcqDuplicateKey
} from './CommonUploadUtils';

const MCQUpload = ({ moduleName, levelId, onUploadSuccess }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [previewQuestions, setPreviewQuestions] = useState([]);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [existingQuestions, setExistingQuestions] = useState([]);
  const [uploadResponse, setUploadResponse] = useState(null);
  const [isResponseModalOpen, setIsResponseModalOpen] = useState(false);

  useEffect(() => {
    if (moduleName && levelId) {
      fetchExistingQuestions();
    }
  }, [moduleName, levelId]);

  const fetchExistingQuestions = async () => {
    try {
      const response = await api.get(`/test-management/existing-questions?module_id=${moduleName}&level_id=${levelId}`);
      if (response.data.success) {
        setExistingQuestions(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching existing questions:', error);
    }
  };

  // MCQ-specific validation
  const validateMCQQuestion = (question) => {
    const errors = [];
    
    // Check if question has required fields
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
    
    return {
      valid: errors.length === 0,
      errors
    };
  };

  // Parse human-readable MCQ format
  const parseHumanReadableMCQ = (text) => {
    const blocks = text.split(/\n\s*\d+\./).filter(Boolean);
    const questions = [];
    
    blocks.forEach(block => {
      const lines = block.trim().split(/\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length < 6) return;
      
      const questionLine = lines[0];
      const options = {};
      let answer = '';
      
      lines.forEach(line => {
        if (/^A\)/.test(line)) options.A = line.replace(/^A\)\s*/, '');
        if (/^B\)/.test(line)) options.B = line.replace(/^B\)\s*/, '');
        if (/^C\)/.test(line)) options.C = line.replace(/^C\)\s*/, '');
        if (/^D\)/.test(line)) options.D = line.replace(/^D\)\s*/, '');
        if (/^Answer:/i.test(line)) answer = line.replace(/^Answer:\s*/i, '').trim();
      });
      
      if (questionLine && options.A && options.B && options.C && options.D && answer) {
        questions.push({
          question: questionLine,
          optionA: options.A,
          optionB: options.B,
          optionC: options.C,
          optionD: options.D,
          answer: answer.toUpperCase(),
        });
      }
    });
    
    return questions;
  };

  const handleFileChange = async (event) => {
    const selectedFile = event.target.files[0];
    if (!selectedFile) return;

    const validation = validateFile(selectedFile);
    if (!validation.valid) {
      setError(validation.error);
      event.target.value = null;
      return;
    }

    setFile(selectedFile);
    setError('');
    setSuccess('');

    try {
      const fileExtension = selectedFile.name.toLowerCase().split('.').pop();
      const parsedData = await parseFile(selectedFile, fileExtension);
      
      let questions = [];
      
      if (fileExtension === 'txt') {
        // Parse human-readable format
        const text = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.readAsText(selectedFile);
        });
        questions = parseHumanReadableMCQ(text);
      } else {
        // Parse CSV/Excel format
        questions = parsedData.map(row => ({
          question: row.question || row.Question || row.QUESTION || '',
          optionA: row.optionA || row.OptionA || row.OPTIONA || row.A || '',
          optionB: row.optionB || row.OptionB || row.OPTIONB || row.B || '',
          optionC: row.optionC || row.OptionC || row.OPTIONC || row.C || '',
          optionD: row.optionD || row.OptionD || row.OPTIOND || row.D || '',
          answer: (row.answer || row.Answer || row.ANSWER || '').toUpperCase(),
          instructions: row.instructions || row.Instructions || row.INSTRUCTIONS || ''
        }));
      }

      // Generate preview with validation — duplicate = same question + options + answer
      const existingKeys = new Set(
        existingQuestions.map((q) => mcqDuplicateKey(q)).filter(Boolean)
      );
      const seenInFile = new Set();
      const previewData = questions.map(q => {
        const validation = validateMCQQuestion(q);
        const key = mcqDuplicateKey(q);
        const isDuplicate = Boolean(key && (existingKeys.has(key) || seenInFile.has(key)));
        if (key && validation.valid && !isDuplicate) {
          seenInFile.add(key);
        }
        
        return {
          ...q,
          status: validation.valid ? (isDuplicate ? 'Duplicate' : 'Valid') : 'Invalid',
          errors: validation.errors,
          isDuplicate
        };
      });

      setPreviewQuestions(previewData);
      setIsPreviewModalOpen(true);
      
      const validCount = previewData.filter(q => q.status === 'Valid').length;
      const duplicateCount = previewData.filter(q => q.status === 'Duplicate').length;
      const invalidCount = previewData.filter(q => q.status === 'Invalid').length;
      
      if (validCount > 0) {
        toast.success(`${validCount} valid questions found`);
      }
      if (duplicateCount > 0) {
        toast(`${duplicateCount} duplicate questions will be skipped`, {
          icon: '⚠️',
          style: {
            background: '#fbbf24',
            color: '#1f2937',
          },
        });
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
        formData.append('question_type', 'mcq');

        const response = await uploadQuestions(formData);

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
        handleUploadError(error, 'Failed to upload MCQ questions');
      }
    });
  };

  const downloadTemplate = () => {
    const headers = ['Question', 'OptionA', 'OptionB', 'OptionC', 'OptionD', 'Answer', 'Instructions'];
    generateCSVTemplate(headers, `${moduleName}_MCQ_Template.csv`);
  };

  const downloadTextTemplate = () => {
    const template = `1. What is the capital of France?
A) London
B) Paris
C) Berlin
D) Madrid
Answer: B

2. Which programming language is this?
A) Python
B) Java
C) JavaScript
D) C++
Answer: A`;
    
    const blob = new Blob([template], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${moduleName}_MCQ_Text_Template.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">MCQ Upload - {moduleName}</h2>
        <p className="text-gray-600">
          Upload multiple choice questions for {moduleName} module. Support both CSV/Excel and text formats.
        </p>
      </div>

      {/* File Upload Section */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Upload Questions</h3>
          <div className="flex space-x-2">
            <button
              onClick={downloadTemplate}
              className="flex items-center space-x-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Download className="h-4 w-4" />
              <span>CSV Template</span>
            </button>
            <button
              onClick={downloadTextTemplate}
              className="flex items-center space-x-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <FileText className="h-4 w-4" />
              <span>Text Template</span>
            </button>
          </div>
        </div>

        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-2">
            Drag and drop your file here, or click to browse
          </p>
          <p className="text-sm text-gray-500 mb-4">
            Supported formats: CSV, Excel (.xlsx, .xls), Text (.txt)
          </p>
          <input
            type="file"
            onChange={handleFileChange}
            accept=".csv,.xlsx,.xls,.txt"
            className="hidden"
            id="mcq-file-upload"
          />
          <label
            htmlFor="mcq-file-upload"
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
            onClick={handleUpload}
            disabled={uploading}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? 'Uploading...' : 'Upload Questions'}
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
              Showing {previewQuestions.length} questions
            </div>
          </div>
          
          <div className="max-h-96 overflow-y-auto space-y-3">
            {previewQuestions.map((question, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border ${
                  question.status === 'Valid' ? 'border-green-200 bg-green-50' :
                  question.status === 'Duplicate' ? 'border-yellow-200 bg-yellow-50' :
                  'border-red-200 bg-red-50'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="text-sm font-medium">Question {index + 1}</span>
                  <span className={`text-xs px-2 py-1 rounded ${
                    question.status === 'Valid' ? 'bg-green-100 text-green-800' :
                    question.status === 'Duplicate' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {question.status}
                  </span>
                </div>
                
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
                  <div className="text-sm">
                    <strong>Answer:</strong> {question.answer}
                  </div>
                </div>
                
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

export default MCQUpload; 
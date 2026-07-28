import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { toast } from 'react-hot-toast';
import api from '../../services/api';

function parseHumanReadableMCQ(text) {
  // Split by question blocks
  const blocks = text.split(/\n\s*\d+\./).filter(Boolean);
  const questions = [];
  blocks.forEach(block => {
    // Extract question
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
        answer,
      });
    }
  });
  return questions;
}

export default function MCQUpload({ questions, setQuestions, onNext, onBack, moduleName, levelId, onUploadSuccess }) {
  const [existingQuestions, setExistingQuestions] = useState([]);
  const [previewQuestions, setPreviewQuestions] = useState([]);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

  const processQuestionsForPreview = (parsedQuestions) => {
    const existingKeys = new Set(
      existingQuestions
        .map((q) => {
          const question = (q.question || '').trim().toLowerCase().replace(/\s+/g, ' ');
          if (!question) return '';
          const optionA = (q.optionA || '').trim().toLowerCase().replace(/\s+/g, ' ');
          const optionB = (q.optionB || '').trim().toLowerCase().replace(/\s+/g, ' ');
          const optionC = (q.optionC || '').trim().toLowerCase().replace(/\s+/g, ' ');
          const optionD = (q.optionD || '').trim().toLowerCase().replace(/\s+/g, ' ');
          const answer = (q.answer || '').trim().toUpperCase();
          return `${question}|A:${optionA}|B:${optionB}|C:${optionC}|D:${optionD}|ANS:${answer}`;
        })
        .filter(Boolean)
    );
    const questionsForPreview = [];
    let duplicateCount = 0;
    let newCount = 0;

    parsedQuestions.forEach(q => {
      const questionText = q.question?.trim();
      if (!questionText) return;

      const question = questionText.toLowerCase().replace(/\s+/g, ' ');
      const optionA = (q.optionA || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const optionB = (q.optionB || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const optionC = (q.optionC || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const optionD = (q.optionD || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const answer = (q.answer || '').trim().toUpperCase();
      const key = `${question}|A:${optionA}|B:${optionB}|C:${optionC}|D:${optionD}|ANS:${answer}`;

      if (existingKeys.has(key)) {
        questionsForPreview.push({ ...q, status: 'Duplicate' });
        duplicateCount++;
      } else {
        questionsForPreview.push({ ...q, status: 'New' });
        existingKeys.add(key);
        newCount++;
      }
    });

    if (questionsForPreview.length === 0) {
      setError('Could not find any questions in the uploaded file.');
      return;
    }

    setPreviewQuestions(questionsForPreview);
    setIsPreviewModalOpen(true);
    
    // Show summary
    if (duplicateCount > 0) {
      toast(`${duplicateCount} duplicate questions found and will be skipped.`, {
        icon: '⚠️',
        style: {
          background: '#fbbf24',
          color: '#1f2937',
        },
      });
    }
    if (newCount > 0) {
      toast.success(`${newCount} new questions will be uploaded.`);
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!levelId) {
      toast.error('Please select a level first');
      event.target.value = null;
      return;
    }

    const allowedTypes = [
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/octet-stream',
      'text/plain'
    ];
    
    const fileExtension = file.name.toLowerCase().split('.').pop();
    const isValidExtension = ['csv', 'xlsx', 'xls', 'txt'].includes(fileExtension);
    const isValidType = allowedTypes.includes(file.type) || file.type === '';
    
    if (!isValidExtension && !isValidType) {
      setError(`Invalid file type. Please upload a .csv, .xlsx, .xls, or .txt file. Received: ${file.type || fileExtension}`);
      event.target.value = null;
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let parsedQuestions = [];
        
        // Check if this is a technical module
        const isTechnicalModule = levelId === 'CRT_TECHNICAL' || levelId === 'TECHNICAL';
        
        if (fileExtension === 'csv' || file.type === 'text/csv') {
          const result = Papa.parse(e.target.result, { 
            header: true, 
            skipEmptyLines: true, 
            trimHeaders: true, 
            trimValues: true 
          });
          
          if (result.data.length === 0) {
            throw new Error('No data found in CSV file.');
          }
          
          if (isTechnicalModule) {
            // Handle technical question format
            parsedQuestions = result.data.map(row => ({
              question: row.Question || row.question || '',
              testCases: row.TestCases || row.testCases || '',
              expectedOutput: row.ExpectedOutput || row.expectedOutput || row.ExpectedOu || '',
              language: row.Language || row.language || 'python',
              // For technical questions, we need to create MCQ format for compatibility
              optionA: 'A',
              optionB: 'B', 
              optionC: 'C',
              optionD: 'D',
              answer: 'A' // Default answer for technical questions
            }));
          } else {
            // Handle MCQ format
            parsedQuestions = result.data.map(row => ({
              question: row.question || row.Question || '',
              optionA: row.optionA || row.OptionA || row.A || '',
              optionB: row.optionB || row.OptionB || row.B || '',
              optionC: row.optionC || row.OptionC || row.C || '',
              optionD: row.optionD || row.OptionD || row.D || '',
              answer: row.answer || row.Answer || '',
              instructions: row.instructions || row.Instructions || ''
            }));
          }
        } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
          const workbook = XLSX.read(e.target.result, { type: 'array' });
          if (!workbook.SheetNames.length) {
            throw new Error('No sheets found in Excel file.');
          }
          
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          if (!worksheet) {
            throw new Error(`Sheet "${sheetName}" not found.`);
          }
          
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          
          if (isTechnicalModule) {
            // Handle technical question format
            parsedQuestions = jsonData.map(row => ({
              question: row.Question || row.question || '',
              testCases: row.TestCases || row.testCases || '',
              expectedOutput: row.ExpectedOutput || row.expectedOutput || row.ExpectedOu || '',
              language: row.Language || row.language || 'python',
              optionA: 'A',
              optionB: 'B',
              optionC: 'C', 
              optionD: 'D',
              answer: 'A'
            }));
          } else {
            // Handle MCQ format
            parsedQuestions = jsonData.map(row => ({
              question: row.question || row.Question || '',
              optionA: row.optionA || row.OptionA || row.A || '',
              optionB: row.optionB || row.OptionB || row.B || '',
              optionC: row.optionC || row.OptionC || row.C || '',
              optionD: row.optionD || row.OptionD || row.D || '',
              answer: row.answer || row.Answer || '',
              instructions: row.instructions || row.Instructions || ''
            }));
          }
        } else if (fileExtension === 'txt' || file.type === 'text/plain') {
          if (isTechnicalModule) {
            throw new Error('Text files are not supported for technical questions. Please use CSV or Excel format.');
          } else {
            parsedQuestions = parseHumanReadableMCQ(e.target.result);
          }
        } else {
          // Try to parse as plain text as fallback (only for MCQ)
          if (isTechnicalModule) {
            throw new Error('Text files are not supported for technical questions. Please use CSV or Excel format.');
          } else {
            parsedQuestions = parseHumanReadableMCQ(e.target.result);
          }
        }

        // Filter questions based on module type
        let finalQuestions;
        if (isTechnicalModule) {
          finalQuestions = parsedQuestions.filter(q => 
            q && q.question && q.testCases && q.expectedOutput && q.language
          );
        } else {
          finalQuestions = parsedQuestions.filter(q => 
            q && q.question && q.optionA && q.optionB && q.optionC && q.optionD && q.answer
          );
        }

        if (finalQuestions.length === 0) {
          throw new Error('No valid questions found in the file.');
        }

        processQuestionsForPreview(finalQuestions);
        
      } catch (err) {
        setError(`File processing error: ${err.message}`);
        toast.error(`File processing error: ${err.message}`);
      }
    };
    
    reader.onerror = () => {
      setError('An unexpected error occurred while reading the file.');
      toast.error('An unexpected error occurred while reading the file.');
    };
    
    if (fileExtension === 'csv' || file.type === 'text/csv' || fileExtension === 'txt' || file.type === 'text/plain') {
      reader.readAsText(file, 'UTF-8');
    } else {
      reader.readAsArrayBuffer(file);
    }
    
    event.target.value = null;
  };

  const handleConfirmPreview = async () => {
    const newQuestions = previewQuestions.filter(q => q.status === 'New');
    
    if (newQuestions.length === 0) {
      toast.error('No new questions to upload');
      setIsPreviewModalOpen(false);
      return;
    }

    setLoading(true);
    try {
      // Check if this is a technical module
      const isTechnicalModule = levelId === 'CRT_TECHNICAL' || levelId === 'TECHNICAL';
      const isSentenceModule = moduleName === 'LISTENING' || moduleName === 'SPEAKING';
      
      let payload;
      if (isTechnicalModule) {
        payload = {
          module_id: moduleName,
          level_id: levelId,
          questions: newQuestions.map(q => ({
            question: q.question,
            testCases: q.testCases,
            expectedOutput: q.expectedOutput,
            language: q.language,
            optionA: q.optionA,
            optionB: q.optionB,
            optionC: q.optionC,
            optionD: q.optionD,
            answer: q.answer,
            instructions: q.instructions || ''
          }))
        };
      } else if (isSentenceModule) {
        // For listening and speaking modules, handle sentences
        payload = {
          module_id: moduleName,
          level_id: levelId,
          questions: newQuestions.map(q => ({
            sentence: q.question, // Use question field as sentence
            question: q.question, // Keep for compatibility
            audio_url: q.audio_url,
            audio_config: q.audio_config,
            transcript_validation: q.transcript_validation,
            has_audio: moduleName === 'LISTENING',
            instructions: q.instructions || ''
          }))
        };
      } else {
        payload = {
          module_id: moduleName,
          level_id: levelId,
          questions: newQuestions.map(q => ({
            question: q.question,
            options: [q.optionA, q.optionB, q.optionC, q.optionD],
            answer: q.answer,
            instructions: q.instructions || ''
          }))
        };
      }

      const response = await api.post('/test-management/module-question-bank/upload', payload);
      
      if (response.data.success) {
        toast.success(`Successfully uploaded ${newQuestions.length} questions`);
        setIsPreviewModalOpen(false);
        setPreviewQuestions([]);
        setError('');
        
        // Call the success callback
        if (onUploadSuccess) {
          onUploadSuccess();
        }
      } else {
        toast.error(response.data.message || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Upload failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-lg mb-4">
          Upload {levelId === 'CRT_TECHNICAL' || levelId === 'TECHNICAL' ? 'Technical' : 'MCQ'} Questions for {moduleName}
        </h3>
        
        {/* File Upload Area */}
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
          <input
            type="file"
            accept=".csv,.xlsx,.xls,.txt"
            onChange={handleFileUpload}
            className="hidden"
            id="file-upload"
          />
          <label htmlFor="file-upload" className="cursor-pointer">
            <div className="text-4xl mb-4">📁</div>
            <p className="text-lg font-medium text-gray-700 mb-2">
              Choose a file or drag it here
            </p>
            <p className="text-sm text-gray-500 mb-4">
              {levelId === 'CRT_TECHNICAL' || levelId === 'TECHNICAL' 
                ? 'Supports CSV and Excel files with columns: Question (with problem statement and sample test cases), TestCases, ExpectedOutput, Language'
                : 'Supports CSV, XLSX, XLS, and TXT files with columns: Question, A, B, C, D, Answer'
              }
            </p>
            <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              Select File
            </button>
          </label>
        </div>
        
        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600">{error}</p>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {isPreviewModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h4 className="text-xl font-bold text-gray-800">Preview Questions</h4>
                <button
                  onClick={() => setIsPreviewModalOpen(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="text-sm text-gray-600 mt-2">
                <p><strong>Module:</strong> {moduleName} | <strong>Level:</strong> {levelId}</p>
                <p><strong>New Questions:</strong> {previewQuestions.filter(q => q.status === 'New').length} | 
                   <strong>Duplicates:</strong> {previewQuestions.filter(q => q.status === 'Duplicate').length}</p>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              <div className="space-y-4">
                {previewQuestions.map((q, i) => {
                  const isTechnicalModule = levelId === 'CRT_TECHNICAL' || levelId === 'TECHNICAL';
                  
                  return (
                    <div key={i} className={`p-4 border rounded-lg ${
                      q.status === 'Duplicate' ? 'border-yellow-200 bg-yellow-50' : 'border-green-200 bg-green-50'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="font-medium text-gray-800">Q{i + 1}: {q.question}</h5>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          q.status === 'Duplicate' ? 'bg-yellow-200 text-yellow-800' : 'bg-green-200 text-green-800'
                        }`}>
                          {q.status}
                        </span>
                      </div>
                      
                      {isTechnicalModule ? (
                        <div className="space-y-2 text-sm text-gray-600">
                          <div className="p-2 bg-white rounded border">
                            <strong>Test Cases:</strong>
                            <pre className="mt-1 text-xs font-mono bg-gray-50 p-2 rounded">{q.testCases}</pre>
                          </div>
                          <div className="p-2 bg-white rounded border">
                            <strong>Expected Output:</strong>
                            <pre className="mt-1 text-xs font-mono bg-gray-50 p-2 rounded">{q.expectedOutput}</pre>
                          </div>
                          <div className="p-2 bg-white rounded border">
                            <strong>Language:</strong> {q.language}
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600">
                          <div>A: {q.optionA}</div>
                          <div>B: {q.optionB}</div>
                          <div>C: {q.optionC}</div>
                          <div>D: {q.optionD}</div>
                        </div>
                      )}
                      
                      {!isTechnicalModule && (
                        <div className="mt-2 text-sm">
                          <span className="font-medium text-green-600">Answer: {q.answer}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
              <button
                onClick={() => setIsPreviewModalOpen(false)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmPreview}
                disabled={loading || previewQuestions.filter(q => q.status === 'New').length === 0}
                className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                  loading || previewQuestions.filter(q => q.status === 'New').length === 0
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {loading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Uploading...
                  </div>
                ) : (
                  `Upload ${previewQuestions.filter(q => q.status === 'New').length} Questions`
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex gap-3 justify-between pt-6 border-t border-gray-200">
        <button
          onClick={onBack}
          className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
        >
          Back
        </button>
      </div>
    </div>
  );
} 
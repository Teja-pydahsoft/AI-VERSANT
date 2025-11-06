import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { Play, Send, Code, AlertCircle, CheckCircle, XCircle, Clock, TestTube, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import api from '../services/api';
import { toast } from 'react-hot-toast';

const TechnicalCodeEditor = ({
  question,
  testId,
  onSubmit,
  allowedLanguages = ['python', 'c', 'cpp', 'java', 'html'],
  showSubmit = true,
  readOnly = false
}) => {
  const [selectedLanguage, setSelectedLanguage] = useState('python');
  const [code, setCode] = useState('');
  const [stdin, setStdin] = useState('');
  const [output, setOutput] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [individualTestResults, setIndividualTestResults] = useState({});
  const [runningTestCase, setRunningTestCase] = useState(null);
  const [testCaseResults, setTestCaseResults] = useState([]);
  const [isValidating, setIsValidating] = useState(false);
  const [expandedTestCases, setExpandedTestCases] = useState(new Set());
  
  // Normalize test cases field
  const testCases = question?.test_cases || question?.testCases || [];
  
  console.log('Selected Language:', selectedLanguage);
  console.log('Code:', code);
  console.log('Stdin:', stdin);
  console.log('Output:', output);
  console.log(" Test ID:", testId);
  console.log('Question:', question);
  console.log('Test Cases:', testCases);

  // Language configuration
  const languageConfig = {
    python: {
      name: 'Python',
      monacoLang: 'python',
      defaultCode: '# Write your Python code here\nprint("Hello, World!")'
    },
    c: {
      name: 'C',
      monacoLang: 'c',
      defaultCode: '#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}'
    },
    cpp: {
      name: 'C++',
      monacoLang: 'cpp',
      defaultCode: '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}'
    },
    java: {
      name: 'Java',
      monacoLang: 'java',
      defaultCode: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}'
    },
    html: {
      name: 'HTML',
      monacoLang: 'html',
      defaultCode: '<!DOCTYPE html>\n<html>\n<head>\n    <title>My Page</title>\n</head>\n<body>\n    <h1>Hello, World!</h1>\n</body>\n</html>'
    }
  };

  // Initialize code when language changes
  useEffect(() => {
    if (question?.starter_code) {
      setCode(question.starter_code);
    } else {
      setCode(languageConfig[selectedLanguage]?.defaultCode || '');
    }
  }, [selectedLanguage, question]);

  // Handle language change
  const handleLanguageChange = (e) => {
    const newLang = e.target.value;
    setSelectedLanguage(newLang);
    setOutput(null);
    setTestResults(null);
    setTestCaseResults([]);
    setIndividualTestResults({});
    setExpandedTestCases(new Set());
  };

  // Toggle test case expansion
  const toggleTestCaseExpansion = (testCaseIndex) => {
    setExpandedTestCases(prev => {
      const newSet = new Set(prev);
      if (newSet.has(testCaseIndex)) {
        newSet.delete(testCaseIndex);
      } else {
        newSet.add(testCaseIndex);
      }
      return newSet;
    });
  };

  // Run code (test with sample input)
  const handleRunCode = async () => {
    if (!code.trim()) {
      toast.error('Please write some code first');
      return;
    }

    setIsRunning(true);
    setOutput(null);

    try {
      const response = await api.post('/test-management/technical/compile', {
        language: selectedLanguage,
        code: code,
        stdin: stdin
      });

      if (response.data.success) {
        setOutput({
          stdout: response.data.stdout,
          stderr: response.data.stderr,
          exitCode: response.data.exit_code,
          executionTime: response.data.execution_time
        });

        if (response.data.stderr) {
          toast.error('Code has errors');
        } else {
          toast.success('Code executed successfully!');
        }
      } else {
        setOutput({
          stderr: response.data.error || 'Compilation failed',
          exitCode: 1
        });
        toast.error('Compilation failed');
      }
    } catch (error) {
      console.error('Error running code:', error);
      setOutput({
        stderr: error.response?.data?.error || 'Failed to execute code',
        exitCode: 1
      });
      toast.error('Failed to execute code');
    } finally {
      setIsRunning(false);
    }
  };

  // Run individual test case
  const handleRunTestCase = async (testCase, testCaseIndex) => {
    if (!code.trim()) {
      toast.error('Please write some code first');
      return;
    }

    setRunningTestCase(testCaseIndex);

    try {
      const response = await api.post('/test-management/technical/compile', {
        language: selectedLanguage,
        code: code,
        stdin: testCase.input || ''
      });

      const result = {
        testCaseIndex,
        input: testCase.input || '',
        expectedOutput: testCase.expected_output || '',
        actualOutput: response.data.success ? (response.data.stdout || '') : '',
        passed: false,
        status: 'wrong',
        executionTime: response.data.execution_time || 0,
        error: response.data.success ? null : (response.data.error || 'Execution failed'),
        points: testCase.points || 1,
        pointsEarned: 0,
        isSample: testCase.is_sample || false
      };

      // Normalize outputs for comparison
      const normalizeOutput = (output) => {
        if (!output) return '';
        return output.split('\n').map(line => line.trim()).filter(line => line).join('\n');
      };

      const normalizedActual = normalizeOutput(result.actualOutput);
      const normalizedExpected = normalizeOutput(result.expectedOutput);
      
      // Check output match
      const outputPassed = normalizedActual === normalizedExpected;
      
      // Check response time if provided
      const expectedResponseTime = testCase.response_time;
      if (outputPassed) {
        if (expectedResponseTime && result.executionTime > expectedResponseTime) {
          // Partial credit: output correct but time exceeded
          result.passed = false;
          result.status = 'partial';
          result.pointsEarned = result.points * 0.5;
        } else {
          // Full credit: output correct and time within limit
          result.passed = true;
          result.status = 'correct';
          result.pointsEarned = result.points;
        }
      } else {
        result.passed = false;
        result.status = 'wrong';
        result.pointsEarned = 0;
      }

      // Update individual test results
      setIndividualTestResults(prev => ({
        ...prev,
        [testCaseIndex]: result
      }));

      toast.success(`Test case ${testCaseIndex + 1}: ${result.passed ? 'PASSED' : result.status === 'partial' ? 'PARTIAL' : 'FAILED'}`);

    } catch (error) {
      console.error('Error running test case:', error);
      const errorResult = {
        testCaseIndex,
        input: testCase.input || '',
        expectedOutput: testCase.expected_output || '',
        actualOutput: '',
        passed: false,
        status: 'wrong',
        executionTime: 0,
        error: error.response?.data?.error || 'Failed to execute test case',
        points: testCase.points || 1,
        pointsEarned: 0,
        isSample: testCase.is_sample || false
      };

      setIndividualTestResults(prev => ({
        ...prev,
        [testCaseIndex]: errorResult
      }));

      toast.error(`Test case ${testCaseIndex + 1} failed to execute`);
    } finally {
      setRunningTestCase(null);
    }
  };

  // Validate code against all test cases and submit
  const handleValidateAllTestCases = async () => {
    if (!code.trim()) {
      toast.error('Please write some code first');
      return;
    }

    if (!testCases || testCases.length === 0) {
      toast.error('No test cases available for this question');
      return;
    }

    setIsValidating(true);
    const results = [];
    let totalScore = 0;
    let maxScore = 0;
    let passedCount = 0;
    let failedCount = 0;

    try {
      // Run all test cases sequentially
      for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        maxScore += testCase.points || 1;

        try {
          const response = await api.post('/test-management/technical/compile', {
            language: selectedLanguage,
            code: code,
            stdin: testCase.input || ''
          });

          if (response.data.success) {
            const actualOutput = response.data.stdout || '';
            const expectedOutput = testCase.expected_output || '';
            const executionTime = response.data.execution_time || 0;
            const expectedResponseTime = testCase.response_time || null;
            
            // Check output match
            const outputPassed = actualOutput.trim() === expectedOutput.trim();
            
            // Check response time if provided
            let passed = false;
            let pointsEarned = 0;
            let status = 'wrong'; // 'correct', 'partial', 'wrong'
            
            if (outputPassed) {
              if (expectedResponseTime && executionTime > expectedResponseTime) {
                // Partial credit: output correct but time exceeded
                passed = false;
                pointsEarned = (testCase.points || 1) * 0.5;
                status = 'partial';
              } else {
                // Full credit: output correct and time within limit
                passed = true;
                pointsEarned = testCase.points || 1;
                status = 'correct';
              }
            } else {
              passed = false;
              pointsEarned = 0;
              status = 'wrong';
            }

            if (passed) {
              totalScore += pointsEarned;
              passedCount++;
            } else if (status === 'partial') {
              totalScore += pointsEarned;
            } else {
              failedCount++;
            }

            const result = {
              test_case_number: i + 1,
              input: testCase.input || '',
              expected_output: expectedOutput,
              actual_output: actualOutput,
              passed: passed,
              status: status, // 'correct', 'partial', 'wrong'
              points: testCase.points || 1,
              points_earned: pointsEarned,
              execution_time: executionTime,
              expected_response_time: expectedResponseTime,
              is_sample: testCase.is_sample || false,
              error: response.data.stderr || ''
            };

            results.push(result);

            // Update individual test results
            setIndividualTestResults(prev => ({
              ...prev,
              [i]: {
                passed,
                status,
                actualOutput,
                executionTime: executionTime,
                pointsEarned: pointsEarned,
                points: testCase.points || 1,
                error: response.data.stderr || ''
              }
            }));

          } else {
            failedCount++;
            const result = {
              test_case_number: i + 1,
              input: testCase.input || '',
              expected_output: testCase.expected_output || '',
              actual_output: '',
              passed: false,
              status: 'wrong',
              points: testCase.points || 1,
              points_earned: 0,
              execution_time: 0,
              is_sample: testCase.is_sample || false,
              error: response.data.error || 'Execution failed'
            };
            results.push(result);

            setIndividualTestResults(prev => ({
              ...prev,
              [i]: {
                passed: false,
                status: 'wrong',
                actualOutput: '',
                executionTime: 0,
                pointsEarned: 0,
                points: testCase.points || 1,
                error: response.data.error || 'Execution failed'
              }
            }));
          }
        } catch (error) {
          failedCount++;
          const result = {
            test_case_number: i + 1,
            input: testCase.input || '',
            expected_output: testCase.expected_output || '',
            actual_output: '',
            passed: false,
            status: 'wrong',
            points: testCase.points || 1,
            points_earned: 0,
            execution_time: 0,
            is_sample: testCase.is_sample || false,
            error: error.response?.data?.error || 'Failed to execute test case'
          };
          results.push(result);

          setIndividualTestResults(prev => ({
            ...prev,
            [i]: {
              passed: false,
              status: 'wrong',
              actualOutput: '',
              executionTime: 0,
              pointsEarned: 0,
              points: testCase.points || 1,
              error: error.response?.data?.error || 'Failed to execute test case'
            }
          }));
        }
      }

      // Prepare final results
      const finalResults = {
        test_results: results,
        total_score: totalScore,
        max_score: maxScore,
        passed_count: passedCount,
        failed_count: failedCount,
        percentage: maxScore > 0 ? (totalScore / maxScore * 100) : 0
      };

      setTestResults(finalResults);
      setTestCaseResults(results);

      // Call onSubmit callback with results, including code and language
      if (onSubmit) {
        onSubmit({
          questionId: questionId,
          code: code.trim(),
          language: selectedLanguage,
          results: finalResults
        });
      }

      toast.success(`Validation complete! ${passedCount}/${testCases.length} test cases passed`);

    } catch (error) {
      console.error('Error validating test cases:', error);
      toast.error('Failed to validate test cases');
    } finally {
      setIsValidating(false);
    }
  };

  // Submit answer (with pre-calculated scores)
  const handleSubmit = async () => {
    if (!testResults) {
      toast.error('Please validate your code against test cases first');
      return;
    }

    // Ensure all required fields are present
    const questionId = question?._id || question?.question_id;
    if (!testId || !questionId || !selectedLanguage || !code.trim()) {
      console.error('Missing required fields:', {
        testId,
        questionId,
        selectedLanguage,
        codeLength: code?.trim()?.length
      });
      toast.error('Missing required fields: testId, questionId, language, or code');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        test_id: testId,
        question_id: questionId,
        language: selectedLanguage,
        code: code.trim(),
        test_results: testResults.test_results,
        total_score: testResults.total_score,
        max_score: testResults.max_score,
        passed_count: testResults.passed_count,
        failed_count: testResults.failed_count
      };

      console.log('Submitting compiler answer with payload:', payload);

      console.log('API URL being called:', '/test-management/technical/submit-answer');
      const response = await api.post('/test-management/technical/submit-answer', payload);
      console.log('API response:', response);

      if (response.data.success) {
        toast.success(`Answer submitted! Score: ${testResults.total_score}/${testResults.max_score}`);
        if (onSubmit) {
          onSubmit({
            questionId: questionId,
            code: code.trim(),
            language: selectedLanguage,
            results: testResults
          });
        }
      } else {
        toast.error(response.data.message || 'Submission failed');
      }
    } catch (error) {
      console.error('Error submitting answer:', error);
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to submit answer';
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="technical-code-editor bg-white rounded-lg shadow-lg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Code className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">Code Editor</h3>
        </div>
        {/* Submit Button always visible if showSubmit is true */}
        {showSubmit && (
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            onClick={handleSubmit}
            disabled={isSubmitting || !testId || !question?._id || !selectedLanguage || !code.trim()}
          >
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </button>
        )}
      </div>

      {/* Language Selector */}
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700">Language:</label>
        <select
          value={selectedLanguage}
          onChange={handleLanguageChange}
          disabled={readOnly || isRunning || isSubmitting}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          {allowedLanguages.map(lang => (
            <option key={lang} value={lang}>
              {languageConfig[lang]?.name || lang}
            </option>
          ))}
        </select>
      </div>

      {/* Question */}
      {question && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="font-semibold text-gray-900 mb-2">Question:</h4>
          <p className="text-gray-700 whitespace-pre-wrap">{question.question}</p>
          {question.instructions && (
            <div className="mt-2">
              <p className="text-sm font-medium text-gray-600">Instructions:</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{question.instructions}</p>
            </div>
          )}
        </div>
      )}

      {/* Code Editor */}
      <div className="mb-4">
        <div className="border border-gray-300 rounded-lg overflow-hidden">
          <Editor
            height="400px"
            language={languageConfig[selectedLanguage]?.monacoLang || 'plaintext'}
            value={code}
            onChange={(value) => setCode(value || '')}
            theme="vs-light"
            options={{
              fontSize: 14,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              automaticLayout: true,
              readOnly: readOnly || isRunning || isSubmitting,
              lineNumbers: 'on',
              renderLineHighlight: 'all',
              scrollbar: {
                vertical: 'visible',
                horizontal: 'visible'
              }
            }}
          />
        </div>
      </div>

      {/* Input Section (for testing) */}
      {selectedLanguage !== 'html' && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Input (stdin) - Optional:
          </label>
          <textarea
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
            disabled={readOnly || isRunning || isSubmitting}
            placeholder="Enter input for your program (one value per line)..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
            rows="3"
          />
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 mb-4">
        <button
          onClick={handleRunCode}
          disabled={readOnly || isRunning || isSubmitting || !code.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isRunning ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
              Running...
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Run Code
            </>
          )}
        </button>

        {/* Validate All Test Cases Button */}
        <button
          onClick={handleValidateAllTestCases}
          disabled={readOnly || isValidating || isSubmitting || !code.trim() || !question?.test_cases?.length}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isValidating ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
              Validating...
            </>
          ) : (
            <>
              <TestTube className="h-4 w-4" />
              Validate All Test Cases
            </>
          )}
        </button>

        {showSubmit && (
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !testResults || !testId || !(question?._id || question?.question_id) || !selectedLanguage || !code.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                Submitting...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Submit Answer
              </>
            )}
          </button>
        )}
      </div>

      {/* Output Section */}
      {output && (
        <div className="mb-4 p-4 bg-gray-50 border border-gray-300 rounded-lg">
          <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
            {output.exitCode === 0 ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <XCircle className="h-5 w-5 text-red-600" />
            )}
            Output:
          </h4>

          {output.stdout && (
            <div className="mb-2">
              <p className="text-sm font-medium text-green-700">✅ Output:</p>
              <pre className="mt-1 p-2 bg-white border border-gray-200 rounded text-sm font-mono whitespace-pre-wrap">
                {output.stdout}
              </pre>
            </div>
          )}

          {output.stderr && (
            <div className="mb-2">
              <p className="text-sm font-medium text-red-700">❌ Errors:</p>
              <pre className="mt-1 p-2 bg-red-50 border border-red-200 rounded text-sm font-mono whitespace-pre-wrap text-red-700">
                {output.stderr}
              </pre>
            </div>
          )}

          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Execution Time: {output.executionTime || 0}ms
            </span>
            <span>Exit Code: {output.exitCode}</span>
          </div>
        </div>
      )}

      {/* Test Cases Section */}
      {testCases && testCases.length > 0 && (
        <div className="p-4 bg-gray-50 border border-gray-300 rounded-lg">
          <h4 className="font-semibold text-gray-900 mb-3">Test Cases:</h4>

          <div className="space-y-3">
            {testCases.map((testCase, idx) => {
              const individualResult = individualTestResults[idx];
              const isRunningThis = runningTestCase === idx;
              const isExpanded = expandedTestCases.has(idx);

              return (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border transition-all cursor-pointer ${
                    individualResult
                      ? (individualResult.passed
                          ? 'bg-green-50 border-green-200'
                          : individualResult.status === 'partial'
                          ? 'bg-yellow-50 border-yellow-200'
                          : 'bg-red-50 border-red-200')
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => toggleTestCaseExpansion(idx)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        Test Case {idx + 1}
                        {testCase.is_sample && <span className="ml-2 text-xs text-blue-600">(Sample)</span>}
                      </span>
                      {individualResult && (
                        <span className={`flex items-center gap-1 text-sm font-medium ${
                          individualResult.passed ? 'text-green-700' : 
                          individualResult.status === 'partial' ? 'text-yellow-700' : 'text-red-700'
                        }`}>
                          {individualResult.passed ? (
                            <><CheckCircle className="h-4 w-4" /> PASSED</>
                          ) : individualResult.status === 'partial' ? (
                            <><AlertTriangle className="h-4 w-4" /> PARTIAL</>
                          ) : (
                            <><XCircle className="h-4 w-4" /> FAILED</>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRunTestCase(testCase, idx);
                        }}
                        disabled={isRunningThis || isValidating || isSubmitting || !code.trim()}
                        className={`px-3 py-1 text-xs rounded transition-colors ${
                          isRunningThis
                            ? 'bg-gray-400 text-white cursor-not-allowed'
                            : individualResult
                              ? (individualResult.passed
                                  ? 'bg-green-600 hover:bg-green-700 text-white'
                                  : individualResult.status === 'partial'
                                  ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                                  : 'bg-red-600 hover:bg-red-700 text-white')
                              : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                      >
                        {isRunningThis ? (
                          <div className="flex items-center gap-1">
                            <div className="animate-spin rounded-full h-3 w-3 border border-white border-t-transparent"></div>
                            Running...
                          </div>
                        ) : (
                          'Run Test'
                        )}
                      </button>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-gray-500" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-500" />
                      )}
                    </div>
                  </div>

                  {/* Expandable details */}
                  {isExpanded && (
                    <div className="text-sm border-t pt-3 mt-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="font-medium text-gray-700">Input:</p>
                          <pre className="mt-1 p-2 bg-white border border-gray-200 rounded text-xs font-mono whitespace-pre-wrap">
                            {testCase.input || 'No input'}
                          </pre>
                        </div>
                        <div>
                          <p className="font-medium text-gray-700">Expected Output:</p>
                          <pre className="mt-1 p-2 bg-white border border-gray-200 rounded text-xs font-mono whitespace-pre-wrap">
                            {testCase.expected_output || 'No expected output'}
                          </pre>
                        </div>
                      </div>

                      {individualResult && (
                        <div className="mt-3">
                          <p className="font-medium text-gray-700">Your Output:</p>
                          <pre className={`mt-1 p-2 border rounded text-xs font-mono whitespace-pre-wrap ${
                            individualResult.passed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                          }`}>
                            {individualResult.actualOutput || 'No output'}
                          </pre>

                          {individualResult.error && (
                            <div className="mt-2">
                              <p className="font-medium text-red-700">Error:</p>
                              <pre className="mt-1 p-2 bg-red-50 border border-red-200 rounded text-xs font-mono whitespace-pre-wrap text-red-700">
                                {individualResult.error}
                              </pre>
                            </div>
                          )}

                          <div className="mt-2 flex justify-between text-xs text-gray-600">
                            <span>Execution Time: {individualResult.executionTime || 0}ms</span>
                            <span>Points: {individualResult.pointsEarned || 0}/{individualResult.points || 0}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Test Case Results Summary */}
      {testCaseResults.length > 0 && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="font-semibold text-gray-900 mb-3">Validation Results Summary:</h4>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center p-3 bg-white rounded-lg">
              <p className="text-2xl font-bold text-blue-600">{testResults?.total_score || 0}</p>
              <p className="text-sm text-gray-600">Score</p>
            </div>
            <div className="text-center p-3 bg-white rounded-lg">
              <p className="text-2xl font-bold text-gray-600">{testResults?.max_score || 0}</p>
              <p className="text-sm text-gray-600">Max Score</p>
            </div>
            <div className="text-center p-3 bg-white rounded-lg">
              <p className="text-2xl font-bold text-green-600">{testResults?.passed_count || 0}</p>
              <p className="text-sm text-gray-600">Passed</p>
            </div>
            <div className="text-center p-3 bg-white rounded-lg">
              <p className="text-2xl font-bold text-red-600">{testResults?.failed_count || 0}</p>
              <p className="text-sm text-gray-600">Failed</p>
            </div>
          </div>

          <div className="text-center">
            <p className="text-lg font-semibold text-gray-700">
              {testResults?.passed_count || 0} / {testCaseResults.length} test cases passed
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default TechnicalCodeEditor;

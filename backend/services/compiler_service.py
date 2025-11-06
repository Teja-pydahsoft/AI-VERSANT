"""
Compiler Service for Technical Test Module
Integrates with OneCompiler API via RapidAPI
Supports: Python, C, C++, Java, HTML
"""

import requests
import os
from typing import Dict, List, Any, Optional
import json

class CompilerService:
    """Service to compile and execute code using OneCompiler API"""
    
    def __init__(self):
        self.api_key = os.getenv('RAPIDAPI_KEY', 'f744734571mshb636ee6aecb15e3p16c0e7jsnd142c0e341e6')
        self.api_host = os.getenv('RAPIDAPI_HOST', 'onecompiler-apis.p.rapidapi.com')
        self.api_url = 'https://onecompiler-apis.p.rapidapi.com/api/v1/run'
        
        # Language configuration
        self.supported_languages = {
            'python': {
                'extension': 'py',
                'default_code': 'print("Hello, World!")',
                'display_name': 'Python'
            },
            'c': {
                'extension': 'c',
                'default_code': '#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}',
                'display_name': 'C'
            },
            'cpp': {
                'extension': 'cpp',
                'default_code': '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}',
                'display_name': 'C++'
            },
            'java': {
                'extension': 'java',
                'default_code': 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}',
                'display_name': 'Java'
            },
            'html': {
                'extension': 'html',
                'default_code': '<!DOCTYPE html>\n<html>\n<head>\n    <title>My Page</title>\n</head>\n<body>\n    <h1>Hello, World!</h1>\n</body>\n</html>',
                'display_name': 'HTML',
                'syntax_only': True
            }
        }
    
    def compile_and_run(self, language: str, code: str, stdin: str = '') -> Dict[str, Any]:
        """
        Compile and execute code using OneCompiler API
        
        Args:
            language: Programming language (python, c, cpp, java, html)
            code: Source code to execute
            stdin: Standard input for the program
            
        Returns:
            Dict with execution results
        """
        try:
            # Validate language
            if language not in self.supported_languages:
                return {
                    'success': False,
                    'error': f'Unsupported language: {language}',
                    'supported_languages': list(self.supported_languages.keys())
                }
            
            # Validate code
            if not code or not code.strip():
                return {
                    'success': False,
                    'error': 'Code cannot be empty'
                }
            
            lang_config = self.supported_languages[language]
            
            # For HTML, just validate syntax (no execution)
            if lang_config.get('syntax_only'):
                return self._validate_html(code)
            
            # Prepare API request
            headers = {
                'x-rapidapi-key': self.api_key,
                'x-rapidapi-host': self.api_host,
                'Content-Type': 'application/json'
            }
            
            payload = {
                'language': language,
                'stdin': stdin,
                'files': [
                    {
                        'name': f'main.{lang_config["extension"]}',
                        'content': code
                    }
                ]
            }
            
            # Make API request
            response = requests.post(
                self.api_url,
                headers=headers,
                json=payload,
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                return {
                    'success': True,
                    'stdout': result.get('stdout', ''),
                    'stderr': result.get('stderr', ''),
                    'exit_code': result.get('exitCode', 0),
                    'execution_time': result.get('executionTime', 0),
                    'memory_used': result.get('memory', 0)
                }
            else:
                return {
                    'success': False,
                    'error': f'API Error: {response.status_code}',
                    'details': response.text
                }
                
        except requests.exceptions.Timeout:
            return {
                'success': False,
                'error': 'Execution timeout. Code took too long to run.'
            }
        except requests.exceptions.RequestException as e:
            return {
                'success': False,
                'error': f'Network error: {str(e)}'
            }
        except Exception as e:
            return {
                'success': False,
                'error': f'Compilation failed: {str(e)}'
            }
    
    def _normalize_output(self, output: str) -> str:
        """
        Normalize output for comparison
        - Strips leading/trailing whitespace from each line
        - Removes empty lines at start and end
        - Normalizes line endings
        """
        if not output:
            return ''
        
        # Split into lines and strip each line
        lines = [line.rstrip() for line in output.split('\n')]
        
        # Remove empty lines from start
        while lines and not lines[0]:
            lines.pop(0)
        
        # Remove empty lines from end
        while lines and not lines[-1]:
            lines.pop()
        
        # Join back with newlines
        return '\n'.join(lines)
    
    def validate_against_test_cases(self, language: str, code: str, test_cases: List[Dict]) -> Dict[str, Any]:
        """
        Run code against multiple test cases and validate outputs
        Handles multi-line inputs and outputs properly
        
        Args:
            language: Programming language
            code: Source code
            test_cases: List of test cases with input and expected_output
            
        Returns:
            Dict with test results and score
        """
        try:
            results = []
            total_score = 0
            max_score = 0
            passed_count = 0
            failed_count = 0
            
            for idx, test_case in enumerate(test_cases):
                test_input = test_case.get('input', '')
                expected_output = self._normalize_output(test_case.get('expected_output', ''))
                points = test_case.get('points', 1)
                is_sample = test_case.get('is_sample', False)
                
                max_score += points
                
                # Run code with this test case input
                execution_result = self.compile_and_run(language, code, test_input)
                
                if execution_result['success']:
                    actual_output = self._normalize_output(execution_result.get('stdout', ''))
                    
                    # Compare normalized outputs
                    passed = actual_output == expected_output
                    
                    if passed:
                        total_score += points
                        passed_count += 1
                    else:
                        failed_count += 1
                    
                    results.append({
                        'test_case_number': idx + 1,
                        'input': test_input if is_sample else '[Hidden]',
                        'expected_output': expected_output if is_sample else '[Hidden]',
                        'actual_output': actual_output if is_sample else ('[Correct]' if passed else '[Incorrect]'),
                        'passed': passed,
                        'points': points,
                        'points_earned': points if passed else 0,
                        'execution_time': execution_result.get('execution_time', 0),
                        'is_sample': is_sample,
                        'error': execution_result.get('stderr', '')
                    })
                else:
                    # Execution failed
                    failed_count += 1
                    results.append({
                        'test_case_number': idx + 1,
                        'input': test_input if is_sample else '[Hidden]',
                        'expected_output': expected_output if is_sample else '[Hidden]',
                        'actual_output': '',
                        'passed': False,
                        'points': points,
                        'points_earned': 0,
                        'execution_time': 0,
                        'is_sample': is_sample,
                        'error': execution_result.get('error', 'Execution failed')
                    })
            
            return {
                'success': True,
                'test_results': results,
                'total_score': total_score,
                'max_score': max_score,
                'passed_count': passed_count,
                'failed_count': failed_count,
                'percentage': (total_score / max_score * 100) if max_score > 0 else 0
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f'Test validation failed: {str(e)}'
            }
    
    def _validate_html(self, html_code: str) -> Dict[str, Any]:
        """
        Validate HTML syntax (basic validation)
        
        Args:
            html_code: HTML code to validate
            
        Returns:
            Dict with validation results
        """
        try:
            # Basic HTML validation
            errors = []
            warnings = []
            
            # Check for basic HTML structure
            if '<!DOCTYPE' not in html_code.upper():
                warnings.append('Missing DOCTYPE declaration')
            
            if '<html' not in html_code.lower():
                errors.append('Missing <html> tag')
            
            if '<head' not in html_code.lower():
                warnings.append('Missing <head> tag')
            
            if '<body' not in html_code.lower():
                errors.append('Missing <body> tag')
            
            # Check for unclosed tags (basic check)
            opening_tags = html_code.count('<') - html_code.count('</')
            closing_tags = html_code.count('</')
            
            if opening_tags != closing_tags:
                warnings.append('Possible unclosed tags detected')
            
            return {
                'success': True,
                'valid': len(errors) == 0,
                'errors': errors,
                'warnings': warnings,
                'message': 'HTML validation complete' if len(errors) == 0 else 'HTML has errors'
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f'HTML validation failed: {str(e)}'
            }
    
    def get_supported_languages(self) -> List[Dict[str, str]]:
        """Get list of supported languages"""
        return [
            {
                'code': lang_code,
                'name': lang_info['display_name'],
                'extension': lang_info['extension'],
                'default_code': lang_info['default_code']
            }
            for lang_code, lang_info in self.supported_languages.items()
        ]
    
    def get_default_code(self, language: str) -> Optional[str]:
        """Get default starter code for a language"""
        if language in self.supported_languages:
            return self.supported_languages[language]['default_code']
        return None


# Singleton instance
compiler_service = CompilerService()

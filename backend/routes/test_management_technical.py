from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from bson import ObjectId
from datetime import datetime
import pytz
from mongo import mongo_db
from routes.test_management import require_superadmin, generate_unique_test_id, convert_objectids
from services.compiler_service import compiler_service

technical_test_bp = Blueprint('technical_test_management', __name__)

@technical_test_bp.route('/create', methods=['POST'])
@jwt_required()
@require_superadmin
def create_technical_test():
    """Create technical test for CRT Technical module"""
    try:
        data = request.get_json()
        test_name = data.get('test_name')
        test_type = data.get('test_type')
        module_id = data.get('module_id')
        level_id = data.get('level_id')
        campus_id = data.get('campus_id')
        course_ids = data.get('course_ids', [])
        batch_ids = data.get('batch_ids', [])
        questions = data.get('questions', [])
        assigned_student_ids = data.get('assigned_student_ids', []) or []
        startDateTime = data.get('startDateTime')
        endDateTime = data.get('endDateTime')
        duration = data.get('duration')

        # Validate required fields
        if not all([test_name, test_type, module_id, campus_id, course_ids, batch_ids]):
            return jsonify({'success': False, 'message': 'Missing required fields'}), 400

        # Validate technical modules (only CRT_TECHNICAL)
        if module_id != 'CRT_TECHNICAL' and level_id != 'TECHNICAL':
            return jsonify({'success': False, 'message': f'Invalid module for technical test: {module_id}'}), 400

        # Check if test name already exists (case-insensitive)
        existing_test = mongo_db.tests.find_one({'name': {'$regex': f'^{test_name}$', '$options': 'i'}})
        if existing_test:
            return jsonify({'success': False, 'message': f'Test name "{test_name}" already exists. Please choose a different name.'}), 409

        # Check for duplicate questions within the test
        question_texts = []
        duplicate_questions = []
        for i, question in enumerate(questions):
            # Handle both question formats: from question bank ('question') and from manual upload ('question_text')
            question_text = question.get('question_text', question.get('question', '')).strip().lower()
            if question_text in question_texts:
                # Get the display text for error message
                display_text = question.get('question_text', question.get('question', ''))[:50]
                duplicate_questions.append(f"Question {i+1}: '{display_text}...'")
            else:
                question_texts.append(question_text)
        
        if duplicate_questions:
            return jsonify({
                'success': False, 
                'message': f'Duplicate questions found: {", ".join(duplicate_questions)}. Please remove duplicates and try again.'
            }), 400

        # Generate unique test ID
        test_id = generate_unique_test_id()

        # Check for existing questions in database
        existing_questions = list(mongo_db.question_bank.find(
            {'module_id': module_id, 'level_id': level_id, 'question_type': 'technical'},
            {'question': 1, '_id': 1, 'used_count': 1}
        ))
        existing_question_texts = {q['question'].strip().lower(): str(q['_id']) for q in existing_questions}
        existing_question_objects = {q['question'].strip().lower(): q['_id'] for q in existing_questions}
        
        # Process questions for technical - store in database and get ObjectIds
        processed_questions = []
        new_questions_to_store = []
        questions_to_update_usage = []
        
        for i, question in enumerate(questions):
            question_text = question.get('question_text') or question.get('question', '')
            question_text_lower = question_text.strip().lower()
            is_existing = question_text_lower in existing_question_texts
            
            # Prepare question document for database storage
            # Handle test_cases - convert from various formats to array
            test_cases = question.get('test_cases', question.get('testCases', []))
            if isinstance(test_cases, str):
                # If it's a string, try to parse it or leave it empty
                test_cases = []
            elif not isinstance(test_cases, list):
                test_cases = []
            
            question_doc = {
                'module_id': module_id,
                'level_id': level_id,
                'question_type': 'compiler',  # Changed to 'compiler' for clarity
                'question': question_text,
                'test_cases': test_cases,  # Use snake_case for consistency
                'testCases': question.get('testCases', ''),  # Keep for backward compatibility
                'expectedOutput': question.get('expectedOutput', ''),
                'language': question.get('language', 'python'),
                'instructions': question.get('instructions', ''),
                'time_limit': question.get('time_limit', 5000),  # Overall time limit in ms
                'memory_limit': question.get('memory_limit', 256),  # Memory limit in MB
                'used_in_tests': [],
                'used_count': 0,
                'last_used': None,
                'created_at': datetime.utcnow(),
                'source': 'manual_upload'
            }
            
            if is_existing:
                # Use existing question ObjectId
                question_id = existing_question_objects.get(question_text_lower)
                questions_to_update_usage.append(question_id)
            else:
                # Store new question and get ObjectId
                new_questions_to_store.append(question_doc)
        
        # Store new questions in database
        stored_question_ids = {}
        if new_questions_to_store:
            result = mongo_db.question_bank.insert_many(new_questions_to_store)
            for i, question_doc in enumerate(new_questions_to_store):
                question_text_lower = question_doc['question'].strip().lower()
                stored_question_ids[question_text_lower] = result.inserted_ids[i]
        
        # Create processed questions with correct ObjectIds
        for i, question in enumerate(questions):
            question_text = question.get('question_text') or question.get('question', '')
            question_text_lower = question_text.strip().lower()
            is_existing = question_text_lower in existing_question_texts
            
            # Get the correct ObjectId
            if is_existing:
                question_id = existing_question_objects.get(question_text_lower)
            else:
                question_id = stored_question_ids.get(question_text_lower)
            
            # Handle test_cases for processed question
            test_cases = question.get('test_cases', question.get('testCases', []))
            if isinstance(test_cases, str):
                test_cases = []
            elif not isinstance(test_cases, list):
                test_cases = []
            
            processed_question = {
                '_id': question_id if question_id else ObjectId(),
                'question': question_text,
                'question_type': 'compiler',  # Changed to 'compiler' for clarity
                'module_id': module_id,
                'test_cases': test_cases,  # Use snake_case for consistency
                'language': question.get('language', 'python'),
                'instructions': question.get('instructions', ''),
                'time_limit': question.get('time_limit', 5000),  # Overall time limit in ms
                'memory_limit': question.get('memory_limit', 256)   # Memory limit in MB
            }
            processed_questions.append(processed_question)
        
        # Update usage count for existing questions
        if questions_to_update_usage:
            mongo_db.question_bank.update_many(
                {'_id': {'$in': questions_to_update_usage}},
                {
                    '$inc': {'used_count': 1},
                    '$set': {'last_used': datetime.utcnow()}
                }
            )

        # Create test document
        test_doc = {
            'test_id': test_id,
            'name': test_name,
            'test_type': test_type.lower(),
            'module_id': module_id,
            'level_id': level_id,
            'campus_ids': [ObjectId(campus_id)],
            'course_ids': [ObjectId(cid) for cid in course_ids],
            'batch_ids': [ObjectId(bid) for bid in batch_ids],
            'questions': processed_questions,
            'assigned_student_ids': [ObjectId(sid) for sid in assigned_student_ids],
            'created_by': ObjectId(get_jwt_identity()),
            'created_at': datetime.now(pytz.utc),
            'status': 'active',
            'is_active': True
        }

        # Add online test specific fields
        if test_type.lower() == 'online':
            if not all([startDateTime, endDateTime, duration]):
                return jsonify({'success': False, 'message': 'Start date, end date, and duration are required for online tests'}), 400
            
            test_doc.update({
                'startDateTime': datetime.fromisoformat(startDateTime.replace('Z', '+00:00')),
                'endDateTime': datetime.fromisoformat(endDateTime.replace('Z', '+00:00')),
                'duration': int(duration),
                'is_released': False,  # Results are not released by default
                'released_at': None,
                'released_by': None
            })

        # Insert test
        result = mongo_db.tests.insert_one(test_doc)
        test_object_id = str(result.inserted_id)  # MongoDB ObjectId (for internal operations)
        custom_test_id = test_doc.get('test_id')  # Custom test_id (ABC123 format)
        
        current_app.logger.info(f"✅ Technical test created - ObjectId: {test_object_id}, Custom ID: {custom_test_id}")
        
        # Create auto-release schedule for online tests
        if test_type.lower() == 'online':
            try:
                from services.auto_release_scheduler import get_scheduler
                scheduler = get_scheduler(mongo_db)
                
                created_at = datetime.utcnow()
                end_date = None
                if startDateTime and endDateTime:
                    end_date = datetime.fromisoformat(endDateTime.replace('Z', '+00:00'))
                
                scheduler.create_schedule_for_test(test_object_id, test_type.lower(), created_at, end_date)
            except Exception as e:
                current_app.logger.warning(f"Failed to create auto-release schedule for test {test_object_id}: {e}")
        
        # Update question usage count for questions from the bank
        if questions:
            for question in questions:
                if question.get('_id'):  # Only update questions that have an _id (from question bank)
                    try:
                        mongo_db.question_bank.update_one(
                            {'_id': ObjectId(question['_id'])},
                            {
                                '$inc': {'used_count': 1},
                                '$set': {'last_used': datetime.now(pytz.utc)},
                                '$push': {'used_in_tests': custom_test_id}  # Use custom ID
                            }
                        )
                    except Exception as e:
                        current_app.logger.warning(f"Failed to update usage count for question {question.get('_id')}: {e}")

        # Send test notifications to students in background
        try:
            from utils.test_student_selector import get_students_by_batch_course_combination
            from utils.batch_processor import create_test_notification_batch_job
            
            # Get students for this test
            students = get_students_by_batch_course_combination(batch_ids, course_ids)
            
            if students:
                # Format start date for notification
                start_date_str = startDateTime if test_type.lower() == 'online' else 'Immediately'
                
                # Create batch job for test notifications
                batch_result = create_test_notification_batch_job(
                    test_id=custom_test_id,  # Custom test_id for SMS (ABC123)
                    object_id=test_object_id,  # MongoDB _id for emails
                    test_name=test_name,
                    start_date=start_date_str,
                    students=students,
                    batch_size=100,
                    interval_minutes=3
                )
                
                current_app.logger.info(f"📧📱 Technical test notification batch created: {batch_result}")
            else:
                current_app.logger.warning(f"⚠️ No students found for technical test notification: batch_ids={batch_ids}, course_ids={course_ids}")
                
        except Exception as e:
            current_app.logger.error(f"❌ Failed to create technical test notification batch: {e}")
            # Don't fail test creation if notifications fail

        # Send email & SMS notifications via notification-service
        try:
            import requests
            import os
            notification_service_url = os.getenv('NOTIFICATION_SERVICE_URL', 'http://localhost:3001')
            notification_service_url = notification_service_url.rstrip('/api').rstrip('/')
            
            email_sms_notification_url = f"{notification_service_url}/api/notifications/test-created"
            
            current_app.logger.info(f"📧📱 Sending email & SMS notifications for test: {test_object_id}")
            
            # Fire-and-forget: don't wait for response
            response = requests.post(
                email_sms_notification_url,
                json={'test_id': test_object_id},  # Use ObjectId for notification service
                timeout=1  # Very short timeout - fire and forget
            )
            
            current_app.logger.info(f"✅ Email & SMS notifications queued for test: {test_object_id}")
                
        except requests.exceptions.Timeout:
            current_app.logger.debug(f"📧 Email & SMS notification request sent (timeout expected): {test_object_id}")
        except Exception as e:
            current_app.logger.warning(f"⚠️ Failed to queue email & SMS notifications: {e}")
            # Don't fail test creation if notifications fail

        return jsonify({
            'success': True,
            'message': 'Technical test created successfully',
            'data': {
                'test_id': test_object_id,  # Return MongoDB ObjectId
                'custom_test_id': custom_test_id,  # Return custom ABC123 ID
                'question_count': len(processed_questions)
            }
        }), 201

    except Exception as e:
        current_app.logger.error(f"Error creating technical test: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@technical_test_bp.route('/<test_id>', methods=['GET'])
@jwt_required()
def get_technical_test(test_id):
    """Get technical test details"""
    try:
        # Check user permissions
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)
        
        if not user:
            return jsonify({'success': False, 'message': 'Access denied. Authentication required.'}), 401
        
        # Allow superadmin, campus_admin, and course_admin
        allowed_roles = ['superadmin', 'campus_admin', 'course_admin']
        if user.get('role') not in allowed_roles:
            return jsonify({'success': False, 'message': 'Access denied. Admin privileges required.'}), 403
        
        test = mongo_db.tests.find_one({'_id': ObjectId(test_id)})
        if not test:
            return jsonify({'success': False, 'message': 'Test not found'}), 404
        
        # Campus admin can only see tests for their campus
        if user.get('role') == 'campus_admin':
            campus_id = user.get('campus_id')
            if campus_id:
                test_campus_ids = test.get('campus_ids', [])
                test_campus_id = test.get('campus_id')
                
                # Check both formats
                if (test_campus_ids and ObjectId(campus_id) not in test_campus_ids) or \
                   (test_campus_id and ObjectId(campus_id) != ObjectId(test_campus_id)) or \
                   (not test_campus_ids and not test_campus_id):
                    return jsonify({'success': False, 'message': 'This test does not belong to your campus.'}), 403
            else:
                return jsonify({'success': False, 'message': 'No campus assigned to this admin.'}), 403
        
        # Course admin can only see tests for their course
        elif user.get('role') == 'course_admin':
            course_id = user.get('course_id')
            if course_id and ObjectId(course_id) not in test.get('course_ids', []):
                return jsonify({'success': False, 'message': 'This test does not belong to your course.'}), 403

        # Validate it's a technical test (only CRT_TECHNICAL)
        if test.get('module_id') != 'CRT_TECHNICAL' and test.get('level_id') != 'TECHNICAL':
            return jsonify({'success': False, 'message': 'Not a technical test'}), 400

        test['_id'] = str(test['_id'])
        test = convert_objectids(test)
        
        return jsonify({'success': True, 'data': test}), 200
    except Exception as e:
        current_app.logger.error(f"Error fetching technical test {test_id}: {e}")
        return jsonify({'success': False, 'message': f'An error occurred while fetching the test: {e}'}), 500

@technical_test_bp.route('/<test_id>/validate', methods=['POST'])
@jwt_required()
@require_superadmin
def validate_technical_test(test_id):
    """Validate technical test configuration"""
    try:
        test = mongo_db.tests.find_one({'_id': ObjectId(test_id)})
        if not test:
            return jsonify({'success': False, 'message': 'Test not found'}), 404

        # Validate technical test structure
        questions = test.get('questions', [])
        if not questions:
            return jsonify({'success': False, 'message': 'Test has no questions'}), 400

        validation_results = []
        for i, question in enumerate(questions):
            validation = {
                'question_index': i,
                'question': question.get('question', ''),
                'has_test_cases': 'testCases' in question and question['testCases'],
                'has_expected_output': 'expectedOutput' in question and question['expectedOutput'],
                'has_language': 'language' in question and question['language'],
                'is_valid': True,
                'errors': []
            }
            
            if not validation['has_test_cases']:
                validation['is_valid'] = False
                validation['errors'].append('Missing test cases')
            
            if not validation['has_expected_output']:
                validation['is_valid'] = False
                validation['errors'].append('Missing expected output')
            
            if not validation['has_language']:
                validation['is_valid'] = False
                validation['errors'].append('Missing programming language')
            
            validation_results.append(validation)

        all_valid = all(v['is_valid'] for v in validation_results)
        
        return jsonify({
            'success': True,
            'data': {
                'test_id': test_id,
                'total_questions': len(questions),
                'valid_questions': sum(1 for v in validation_results if v['is_valid']),
                'invalid_questions': sum(1 for v in validation_results if not v['is_valid']),
                'all_valid': all_valid,
                'validation_results': validation_results
            }
        }), 200
    except Exception as e:
        current_app.logger.error(f"Error validating technical test {test_id}: {e}")
        return jsonify({'success': False, 'message': f'An error occurred while validating the test: {e}'}), 500

@technical_test_bp.route('/<test_id>/notify', methods=['POST'])
@jwt_required()
@require_superadmin
def notify_technical_test_students(test_id):
    """Notify students about technical test"""
    try:
        test = mongo_db.tests.find_one({'_id': ObjectId(test_id)})
        if not test:
            return jsonify({'success': False, 'message': 'Test not found'}), 404

        # Get students for this test
        from routes.student import get_students_for_test_ids
        student_list = get_students_for_test_ids([test_id])
        
        if not student_list:
            return jsonify({'success': False, 'message': 'No students found for this test'}), 404

        # Send notifications
        results = []
        for student in student_list:
            try:
                # Send multi-channel notification (email, SMS, and push)
                from services.enhanced_notification_service import enhancedNotificationService
                
                # Format start date for notification
                start_date_str = test.get('startDateTime', 'Immediately') if test.get('test_type', '').lower() == 'online' else 'Immediately'
                
                notification_data = {
                    'title': f'New Technical Test: {test["name"]} 🔧',
                    'message': f'A new technical test has been scheduled for {start_date_str}. Click to view details!',
                    'type': 'test_scheduled',
                    'url': f'/student/exam/{test_id}',
                    'data': {
                        'test_id': str(test['_id']),
                        'test_name': test['name'],
                        'test_type': 'Technical',
                        'start_date': start_date_str,
                        'exam_url': f"https://crt.pydahsoft.in/student/exam/{test_id}"
                    }
                }
                
                # Send notification via enhanced service
                user_id = student.get('user_id')
                if user_id:
                    result = enhancedNotificationService.send_notification_to_user(user_id, notification_data)
                else:
                    result = {'push_sent': False, 'email_sent': False, 'sms_sent': False, 'errors': ['No user_id found']}
                
                # Also send email using existing service for compatibility
                from utils.email_service import send_email, render_template
                html_content = render_template('test_notification.html', 
                    student_name=student['name'],
                    test_name=test['name'],
                    test_id=str(test['_id']),
                    test_type='Technical',
                    module=test.get('module_id', 'Unknown'),
                    level=test.get('level_id', 'Unknown'),
                    module_display_name=test.get('module_id', 'Unknown'),
                    level_display_name=test.get('level_id', 'Unknown'),
                    question_count=len(test.get('questions', [])),
                    is_online=test.get('test_type') == 'online',
                    start_dt=test.get('startDateTime', 'Not specified'),
                    end_dt=test.get('endDateTime', 'Not specified'),
                    duration=test.get('duration', 'Not specified')
                )
                email_sent = send_email(
                    to_email=student['email'],
                    to_name=student['name'],
                    subject=f"New Technical Test Available: {test['name']}",
                    html_content=html_content
                )
                
                results.append({
                    'student_id': str(student['_id']),
                    'name': student['name'],
                    'email': student['email'],
                    'mobile_number': student.get('mobile_number'),
                    'user_id': user_id,
                    'push_sent': result.get('push_sent', False),
                    'email_sent': email_sent or result.get('email_sent', False),
                    'sms_sent': result.get('sms_sent', False),
                    'test_status': 'pending',
                    'notify_status': 'sent' if email_sent else 'failed',
                    'sms_status': 'no_mobile',
                    'status': 'success' if email_sent else 'failed'
                })
            except Exception as e:
                current_app.logger.error(f"Failed to notify student {student['_id']}: {e}")
                results.append({
                    'student_id': str(student['_id']),
                    'name': student['name'],
                    'email': student['email'],
                    'mobile_number': student.get('mobile_number'),
                    'test_status': 'pending',
                    'notify_status': 'failed',
                    'sms_status': 'no_mobile',
                    'email_sent': False,
                    'status': 'failed',
                    'error': str(e)
                })

        return jsonify({
            'success': True,
            'message': f'Technical test notification sent to {len(results)} students',
            'data': {
                'test_id': test_id,
                'test_name': test['name'],
                'notifications_sent': len(results),
                'results': results
            }
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error notifying technical test students: {e}")
        return jsonify({'success': False, 'message': f'Failed to send notifications: {e}'}), 500


# ==================== NEW COMPILER ENDPOINTS ====================

@technical_test_bp.route('/compile', methods=['POST'])
@jwt_required()
def compile_code():
    """
    Compile and Run Code
    ---
    tags:
      - Technical Tests
    summary: Compile and execute code using OneCompiler API
    description: |
      Compiles and runs code in the specified programming language.
      Used by students during test taking to test their code against sample inputs.
      
      **Supported Languages:**
      - python
      - java
      - cpp (C++)
      - c
      - javascript
      - go
      - rust
      - php
      - ruby
      - swift
    security:
      - BearerAuth: []
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required:
              - language
              - code
            properties:
              language:
                type: string
                example: "python"
                description: Programming language
              code:
                type: string
                example: "print('Hello, World!')"
                description: Source code to compile and run
              stdin:
                type: string
                example: ""
                description: Standard input for the program
    responses:
      200:
        description: Code executed successfully
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: true
                stdout:
                  type: string
                  example: "Hello, World!"
                stderr:
                  type: string
                  example: ""
                execution_time:
                  type: number
                  format: float
                  example: 0.123
                  description: Execution time in seconds
                memory_used:
                  type: integer
                  example: 1024
                  description: Memory used in bytes
      400:
        description: Invalid request or compilation error
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: false
                message:
                  type: string
                  example: "Language and code are required"
                error:
                  type: string
                  example: "Compilation failed"
      401:
        description: Unauthorized
      500:
        description: Internal server error
    """
    try:
        data = request.get_json()
        language = data.get('language')
        code = data.get('code')
        stdin = data.get('stdin', '')
        
        if not language or not code:
            return jsonify({
                'success': False,
                'message': 'Language and code are required'
            }), 400
        
        # Compile and run code
        result = compiler_service.compile_and_run(language, code, stdin)
        
        return jsonify(result), 200 if result.get('success') else 400
        
    except Exception as e:
        current_app.logger.error(f"Error compiling code: {e}")
        return jsonify({
            'success': False,
            'error': f'Compilation failed: {str(e)}'
        }), 500


@technical_test_bp.route('/validate-test-cases', methods=['POST'])
@jwt_required()
def validate_test_cases():
    """
    Validate code against test cases for frontend scoring
    Returns detailed results for each test case execution
    """
    try:
        data = request.get_json()
        language = data.get('language')
        code = data.get('code')
        test_cases = data.get('test_cases', [])

        if not language or not code:
            return jsonify({
                'success': False,
                'message': 'Language and code are required'
            }), 400

        if not test_cases:
            return jsonify({
                'success': False,
                'message': 'Test cases are required'
            }), 400

        # Validate code against test cases
        result = compiler_service.validate_against_test_cases(language, code, test_cases)

        return jsonify(result), 200 if result.get('success') else 400

    except Exception as e:
        current_app.logger.error(f"Error validating test cases: {e}")
        return jsonify({
            'success': False,
            'error': f'Validation failed: {str(e)}'
        }), 500


@technical_test_bp.route('/submit-answer', methods=['POST'])
@jwt_required()
def submit_technical_answer():
    """
    Submit student's answer for a technical question
    Handles both compiler questions (pre-calculated scores) and MCQ questions (backend validation)
    """
    try:
        current_user_id = get_jwt_identity()
        data = request.get_json()

        test_id = data.get('test_id')
        question_id = data.get('question_id')

        print(f"Submit answer request - test_id: {test_id}, question_id: {question_id}")
        print(f"Request data keys: {list(data.keys())}")

        if not all([test_id, question_id]):
            return jsonify({
                'success': False,
                'message': 'test_id and question_id are required'
            }), 400

        # Get question details to determine question type
        test = mongo_db.tests.find_one({'_id': ObjectId(test_id)})
        if not test:
            return jsonify({'success': False, 'message': 'Test not found'}), 404

        # Find the question in the test
        question = None
        for q in test.get('questions', []):
            if str(q.get('_id')) == question_id:
                question = q
                break

        if not question:
            print(f"Question not found in test. Available questions: {[str(q.get('_id')) for q in test.get('questions', [])]}")
            return jsonify({'success': False, 'message': 'Question not found in test'}), 404

        question_type = question.get('question_type', 'mcq')
        print(f"Question type: {question_type}")

        if question_type == 'compiler':
            # Handle compiler questions with pre-calculated scores from frontend
            return _submit_compiler_answer(current_user_id, data, question)
        elif question_type == 'mcq':
            # Handle MCQ questions with backend validation
            return _submit_mcq_answer(current_user_id, data, question)
        else:
            return jsonify({
                'success': False,
                'message': f'Unsupported question type: {question_type}'
            }), 400

    except Exception as e:
        current_app.logger.error(f"Error submitting technical answer: {e}")
        return jsonify({
            'success': False,
            'error': f'Submission failed: {str(e)}'
        }), 500


def _submit_compiler_answer(current_user_id, data, question):
    """Handle compiler question submission with pre-calculated scores"""
    language = data.get('language')
    code = data.get('code')

    print(f"Compiler submission - language: {language}, code length: {len(code) if code else 0}")

    # For compiler questions, accept pre-calculated scores
    test_results = data.get('test_results', [])
    total_score = data.get('total_score', 0)
    max_score = data.get('max_score', 0)
    passed_count = data.get('passed_count', 0)
    failed_count = data.get('failed_count', 0)

    print(f"Scores - total: {total_score}, max: {max_score}, passed: {passed_count}, failed: {failed_count}")

    if not all([language, code]):
        print("Missing language or code")
        return jsonify({
            'success': False,
            'message': 'language and code are required for compiler questions'
        }), 400

    test_id = data.get('test_id')
    question_id = data.get('question_id')

    # Store submission with pre-calculated scores
    submission_doc = {
        'student_id': ObjectId(current_user_id),
        'test_id': ObjectId(test_id),
        'question_id': ObjectId(question_id),
        'language': language,
        'submitted_code': code,
        'test_results': test_results,  # Pre-calculated from frontend
        'total_score': total_score,
        'max_score': max_score,
        'percentage': (total_score / max_score * 100) if max_score > 0 else 0,
        'passed_count': passed_count,
        'failed_count': failed_count,
        'status': 'completed',
        'submitted_at': datetime.utcnow()
    }

    # Check if submission already exists
    existing_submission = mongo_db.technical_submissions.find_one({
        'student_id': ObjectId(current_user_id),
        'test_id': ObjectId(test_id),
        'question_id': ObjectId(question_id)
    })

    if existing_submission:
        # Update existing submission
        mongo_db.technical_submissions.update_one(
            {'_id': existing_submission['_id']},
            {'$set': submission_doc}
        )
        submission_id = str(existing_submission['_id'])
    else:
        # Create new submission
        result = mongo_db.technical_submissions.insert_one(submission_doc)
        submission_id = str(result.inserted_id)

    return jsonify({
        'success': True,
        'message': 'Compiler answer submitted successfully',
        'data': {
            'submission_id': submission_id,
            'total_score': total_score,
            'max_score': max_score,
            'percentage': (total_score / max_score * 100) if max_score > 0 else 0,
            'passed_count': passed_count,
            'failed_count': failed_count,
            'test_results': test_results
        }
    }), 200


def _submit_mcq_answer(current_user_id, data, question):
    """Handle MCQ question submission with backend validation"""
    student_answer = data.get('answer')

    if student_answer is None:
        return jsonify({
            'success': False,
            'message': 'Answer is required for MCQ questions'
        }), 400

    test_id = data.get('test_id')
    question_id = data.get('question_id')

    # Get correct answer from question
    correct_answer = question.get('answer', '').strip().upper()
    student_answer_upper = str(student_answer).strip().upper()

    # Validate answer
    is_correct = student_answer_upper == correct_answer
    score = 1 if is_correct else 0

    # Store MCQ submission
    submission_doc = {
        'student_id': ObjectId(current_user_id),
        'test_id': ObjectId(test_id),
        'question_id': ObjectId(question_id),
        'question_type': 'mcq',
        'student_answer': student_answer,
        'correct_answer': correct_answer,
        'is_correct': is_correct,
        'score': score,
        'status': 'completed',
        'submitted_at': datetime.utcnow()
    }

    # Check if submission already exists
    existing_submission = mongo_db.technical_submissions.find_one({
        'student_id': ObjectId(current_user_id),
        'test_id': ObjectId(test_id),
        'question_id': ObjectId(question_id)
    })

    if existing_submission:
        # Update existing submission
        mongo_db.technical_submissions.update_one(
            {'_id': existing_submission['_id']},
            {'$set': submission_doc}
        )
        submission_id = str(existing_submission['_id'])
    else:
        # Create new submission
        result = mongo_db.technical_submissions.insert_one(submission_doc)
        submission_id = str(result.inserted_id)

    return jsonify({
        'success': True,
        'message': 'MCQ answer submitted successfully',
        'data': {
            'submission_id': submission_id,
            'is_correct': is_correct,
            'score': score,
            'correct_answer': correct_answer
        }
    }), 200


@technical_test_bp.route('/languages', methods=['GET'])
def get_supported_languages():
    """Get list of supported programming languages"""
    try:
        languages = compiler_service.get_supported_languages()
        return jsonify({
            'success': True,
            'data': languages
        }), 200
    except Exception as e:
        current_app.logger.error(f"Error getting supported languages: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@technical_test_bp.route('/default-code/<language>', methods=['GET'])
def get_default_code(language):
    """Get default starter code for a language"""
    try:
        default_code = compiler_service.get_default_code(language)
        if default_code is None:
            return jsonify({
                'success': False,
                'message': f'Unsupported language: {language}'
            }), 400
        
        return jsonify({
            'success': True,
            'data': {
                'language': language,
                'default_code': default_code
            }
        }), 200
    except Exception as e:
        current_app.logger.error(f"Error getting default code: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500 
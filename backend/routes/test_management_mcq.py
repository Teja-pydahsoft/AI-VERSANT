from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from bson import ObjectId
from datetime import datetime
import pytz
from mongo import mongo_db
from routes.test_management import require_superadmin, generate_unique_test_id, convert_objectids

mcq_test_bp = Blueprint('mcq_test_management', __name__)

@mcq_test_bp.route('/create', methods=['POST'])
@jwt_required()
@require_superadmin
def create_mcq_test():
    """Create MCQ test for Grammar, Vocabulary, Reading modules"""
    try:
        data = request.get_json()
        test_name = data.get('test_name')
        test_type = data.get('test_type')
        module_id = data.get('module_id')
        level_id = data.get('level_id')
        subcategory = data.get('subcategory')
        campus_id = data.get('campus_id')
        course_ids = data.get('course_ids', [])
        batch_ids = data.get('batch_ids', [])
        questions = data.get('questions', [])
        assigned_student_ids = data.get('assigned_student_ids', [])
        startDateTime = data.get('startDateTime')
        endDateTime = data.get('endDateTime')
        duration = data.get('duration')

        # Validate required fields
        if not all([test_name, test_type, module_id, campus_id, course_ids, batch_ids]):
            return jsonify({'success': False, 'message': 'Missing required fields'}), 400

        # Validate MCQ modules (including CRT Aptitude and Reasoning)
        mcq_modules = ['GRAMMAR', 'VOCABULARY', 'READING', 'CRT_APTITUDE', 'CRT_REASONING']
        if module_id not in mcq_modules:
            return jsonify({'success': False, 'message': f'Invalid module for MCQ test: {module_id}'}), 400

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

        # Create test document
        test_doc = {
            'test_id': test_id,
            'name': test_name,
            'test_type': test_type.lower(),
            'module_id': module_id,
            'level_id': level_id,
            'subcategory': subcategory,
            'campus_ids': [ObjectId(campus_id)],
            'course_ids': [ObjectId(cid) for cid in course_ids],
            'batch_ids': [ObjectId(bid) for bid in batch_ids],
            'questions': questions,
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
        
        current_app.logger.info(f"✅ MCQ test created - ObjectId: {test_object_id}, Custom ID: {custom_test_id}")
        
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



        # Send push notifications via notification-service (fire-and-forget)
        try:
            import requests
            import os
            notification_service_url = os.getenv('NOTIFICATION_SERVICE_URL', 'http://localhost:3001')
            notification_service_url = notification_service_url.rstrip('/api').rstrip('/')
            
            push_notification_url = f"{notification_service_url}/api/test-notifications/test-created"
            
            current_app.logger.info(f"📱 Sending push notifications for test: {test_object_id}")
            
            # Fire-and-forget: don't wait for response
            response = requests.post(
                push_notification_url,
                json={'test_id': test_object_id},  # Use ObjectId for notification service
                timeout=1  # Very short timeout - fire and forget
            )
            
            current_app.logger.info(f"✅ Push notifications queued for test: {test_object_id}")
                
        except requests.exceptions.Timeout:
            current_app.logger.debug(f"📱 Push notification request sent (timeout expected): {test_object_id}")
        except Exception as e:
            current_app.logger.warning(f"⚠️ Failed to queue push notifications: {e}")
            # Don't fail test creation if push notifications fail

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
                
        except requests.exceptions.ConnectionError:
            current_app.logger.warning(f"⚠️ Cannot connect to notification service for push notifications")
        except Exception as e:
            current_app.logger.error(f"❌ Failed to send push notifications: {e}")
            # Don't fail test creation if push notifications fail

        return jsonify({
            'success': True,
            'message': 'MCQ test created successfully',
            'data': {
                'test_id': test_object_id,  # Return MongoDB ObjectId
                'custom_test_id': custom_test_id  # Return custom ABC123 ID
            }
        }), 201

    except Exception as e:
        current_app.logger.error(f"Error creating MCQ test: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@mcq_test_bp.route('/<test_id>', methods=['GET'])
@jwt_required()
def get_mcq_test(test_id):
    """Get MCQ test details"""
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

        # Validate it's an MCQ test (including CRT Aptitude and Reasoning)
        mcq_modules = ['GRAMMAR', 'VOCABULARY', 'READING', 'CRT_APTITUDE', 'CRT_REASONING']
        if test.get('module_id') not in mcq_modules:
            return jsonify({'success': False, 'message': 'Not an MCQ test'}), 400

        test['_id'] = str(test['_id'])
        test = convert_objectids(test)
        
        return jsonify({'success': True, 'data': test}), 200
    except Exception as e:
        current_app.logger.error(f"Error fetching MCQ test {test_id}: {e}")
        return jsonify({'success': False, 'message': f'An error occurred while fetching the test: {e}'}), 500

@mcq_test_bp.route('/<test_id>/validate', methods=['POST'])
@jwt_required()
@require_superadmin
def validate_mcq_test(test_id):
    """Validate MCQ test configuration"""
    try:
        test = mongo_db.tests.find_one({'_id': ObjectId(test_id)})
        if not test:
            return jsonify({'success': False, 'message': 'Test not found'}), 404

        # Validate MCQ test structure
        questions = test.get('questions', [])
        if not questions:
            return jsonify({'success': False, 'message': 'Test has no questions'}), 400

        validation_results = []
        for i, question in enumerate(questions):
            validation = {
                'question_index': i,
                'question': question.get('question', ''),
                'has_options': all(key in question for key in ['optionA', 'optionB', 'optionC', 'optionD']),
                'has_answer': 'answer' in question and question['answer'],
                'is_valid': True,
                'errors': []
            }
            
            if not validation['has_options']:
                validation['is_valid'] = False  
                validation['errors'].append('Missing MCQ options')
            
            if not validation['has_answer']:
                validation['is_valid'] = False
                validation['errors'].append('Missing correct answer')
            
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
        current_app.logger.error(f"Error validating MCQ test {test_id}: {e}")
        return jsonify({'success': False, 'message': f'An error occurred while validating the test: {e}'}), 500

@mcq_test_bp.route('/<test_id>/notify', methods=['POST'])
@jwt_required()
@require_superadmin
def notify_mcq_test_students(test_id):
    """Notify students about MCQ test"""
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
                    'title': f'New MCQ Test: {test["name"]} 📋',
                    'message': f'A new MCQ test has been scheduled for {start_date_str}. Click to view details!',
                    'type': 'test_scheduled',
                    'url': f'/student/exam/{test_id}',
                    'data': {
                        'test_id': str(test['_id']),
                        'test_name': test['name'],
                        'test_type': 'MCQ',
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
                    test_type='MCQ',
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
                    subject=f"New MCQ Test Available: {test['name']}",
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
            'message': f'MCQ test notification sent to {len(results)} students',
            'data': {
                'test_id': test_id,
                'test_name': test['name'],
                'notifications_sent': len(results),
                'results': results
            }
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error notifying MCQ test students: {e}")
        return jsonify({'success': False, 'message': f'Failed to send notifications: {e}'}), 500 
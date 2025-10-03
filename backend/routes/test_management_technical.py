from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from bson import ObjectId
from datetime import datetime
import pytz
from mongo import mongo_db
from routes.test_management import require_superadmin, generate_unique_test_id, convert_objectids

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
            question_doc = {
                'module_id': module_id,
                'level_id': level_id,
                'question_type': 'technical',
                'question': question_text,
                'testCases': question.get('testCases', ''),
                'expectedOutput': question.get('expectedOutput', ''),
                'language': question.get('language', 'python'),
                'instructions': question.get('instructions', ''),
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
            
            processed_question = {
                '_id': question_id if question_id else ObjectId(),
                'question': question_text,
                'question_type': 'technical',
                'module_id': module_id,
                'testCases': question.get('testCases', ''),
                'expectedOutput': question.get('expectedOutput', ''),
                'language': question.get('language', 'python'),
                'instructions': question.get('instructions', '')
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
        test_id = str(result.inserted_id)
        
        # Create auto-release schedule for online tests
        if test_type.lower() == 'online':
            try:
                from services.auto_release_scheduler import get_scheduler
                scheduler = get_scheduler(mongo_db)
                
                created_at = datetime.utcnow()
                end_date = None
                if startDateTime and endDateTime:
                    end_date = datetime.fromisoformat(endDateTime.replace('Z', '+00:00'))
                
                scheduler.create_schedule_for_test(test_id, test_type.lower(), created_at, end_date)
            except Exception as e:
                current_app.logger.warning(f"Failed to create auto-release schedule for test {test_id}: {e}")
        
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
                                '$push': {'used_in_tests': test_id}
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
                
                # Get the custom test_id from the test document
                test_doc = mongo_db.tests.find_one({'_id': ObjectId(test_id)})
                custom_test_id = test_doc.get('test_id', test_id) if test_doc else test_id
                
                # Create batch job for test notifications
                batch_result = create_test_notification_batch_job(
                    test_id=custom_test_id,  # Custom test_id for SMS
                    object_id=test_id,  # MongoDB _id for emails
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

        return jsonify({
            'success': True,
            'message': 'Technical test created successfully',
            'data': {
                'test_id': str(result.inserted_id),
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
                # Send email notification
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
                    'test_status': 'pending',
                    'notify_status': 'sent' if email_sent else 'failed',
                    'sms_status': 'no_mobile',
                    'email_sent': email_sent,
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
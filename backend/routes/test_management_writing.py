from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from bson import ObjectId
from datetime import datetime
import pytz
from mongo import mongo_db
from routes.test_management import require_superadmin, generate_unique_test_id, convert_objectids

writing_test_bp = Blueprint('writing_test_management', __name__)

@writing_test_bp.route('/create', methods=['POST'])
@jwt_required()
@require_superadmin
def create_writing_test():
    """Create writing test for Writing module"""
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
        assigned_student_ids = data.get('assigned_student_ids', [])
        startDateTime = data.get('startDateTime')
        endDateTime = data.get('endDateTime')
        duration = data.get('duration')

        # Validate required fields
        if not all([test_name, test_type, module_id, campus_id, course_ids, batch_ids]):
            return jsonify({'success': False, 'message': 'Missing required fields'}), 400

        # Validate writing module
        if module_id != 'WRITING':
            return jsonify({'success': False, 'message': f'Invalid module for writing test: {module_id}'}), 400

        # Check if test name already exists
        existing_test = mongo_db.tests.find_one({'name': test_name})
        if existing_test:
            return jsonify({'success': False, 'message': f'Test name "{test_name}" already exists. Please choose a different name.'}), 409

        # Generate unique test ID
        test_id = generate_unique_test_id()

        # Process questions for writing
        processed_questions = []
        for i, question in enumerate(questions):
            processed_question = {
                'question_id': f'q_{i+1}',
                'question': question.get('paragraph') or question.get('question', ''),
                'question_type': 'writing',
                'module_id': module_id,
                'instructions': question.get('instructions', ''),
                'min_words': question.get('min_words', 50),
                'max_words': question.get('max_words', 500),
                'min_characters': question.get('min_characters', 200),
                'max_characters': question.get('max_characters', 2000)
            }
            processed_questions.append(processed_question)

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
                'duration': int(duration)
            })

        # Insert test
        result = mongo_db.tests.insert_one(test_doc)
        
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

        return jsonify({
            'success': True,
            'message': 'Writing test created successfully',
            'data': {
                'test_id': test_id,
                'question_count': len(processed_questions)
            }
        }), 201

    except Exception as e:
        current_app.logger.error(f"Error creating writing test: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@writing_test_bp.route('/<test_id>', methods=['GET'])
@jwt_required()
@require_superadmin
def get_writing_test(test_id):
    """Get writing test details"""
    try:
        test = mongo_db.tests.find_one({'_id': ObjectId(test_id)})
        if not test:
            return jsonify({'success': False, 'message': 'Test not found'}), 404

        # Validate it's a writing test
        if test.get('module_id') != 'WRITING':
            return jsonify({'success': False, 'message': 'Not a writing test'}), 400

        test['_id'] = str(test['_id'])
        test = convert_objectids(test)
        
        return jsonify({'success': True, 'data': test}), 200
    except Exception as e:
        current_app.logger.error(f"Error fetching writing test {test_id}: {e}")
        return jsonify({'success': False, 'message': f'An error occurred while fetching the test: {e}'}), 500

@writing_test_bp.route('/<test_id>/validate', methods=['POST'])
@jwt_required()
@require_superadmin
def validate_writing_test(test_id):
    """Validate writing test configuration"""
    try:
        test = mongo_db.tests.find_one({'_id': ObjectId(test_id)})
        if not test:
            return jsonify({'success': False, 'message': 'Test not found'}), 404

        # Validate writing test structure
        questions = test.get('questions', [])
        if not questions:
            return jsonify({'success': False, 'message': 'Test has no questions'}), 400

        validation_results = []
        for i, question in enumerate(questions):
            validation = {
                'question_index': i,
                'question': question.get('question', ''),
                'has_paragraph': 'paragraph' in question and question['paragraph'],
                'has_word_limit': 'word_limit' in question and question['word_limit'],
                'has_time_limit': 'time_limit' in question and question['time_limit'],
                'is_valid': True,
                'errors': []
            }
            
            if not validation['has_paragraph']:
                validation['is_valid'] = False
                validation['errors'].append('Missing paragraph text')
            
            if not validation['has_word_limit']:
                validation['is_valid'] = False
                validation['errors'].append('Missing word limit')
            
            if not validation['has_time_limit']:
                validation['is_valid'] = False
                validation['errors'].append('Missing time limit')
            
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
        current_app.logger.error(f"Error validating writing test {test_id}: {e}")
        return jsonify({'success': False, 'message': f'An error occurred while validating the test: {e}'}), 500

@writing_test_bp.route('/<test_id>/notify', methods=['POST'])
@jwt_required()
@require_superadmin
def notify_writing_test_students(test_id):
    """Notify students about writing test"""
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
                from utils.email_service import send_email
                email_sent = send_email(
                    to_email=student['email'],
                    subject=f"New Writing Test Available: {test['name']}",
                    template='test_notification.html',
                    context={
                        'student_name': student['name'],
                        'test_name': test['name'],
                        'test_type': 'Writing',
                        'module_id': test.get('module_id', 'Unknown'),
                        'level_id': test.get('level_id', 'Unknown'),
                        'question_count': len(test.get('questions', [])),
                        'start_date': test.get('startDateTime', 'Not specified'),
                        'end_date': test.get('endDateTime', 'Not specified'),
                        'duration': test.get('duration', 'Not specified')
                    }
                )
                
                results.append({
                    'student_id': student['_id'],
                    'student_name': student['name'],
                    'email': student['email'],
                    'email_sent': email_sent,
                    'status': 'success' if email_sent else 'failed'
                })
            except Exception as e:
                current_app.logger.error(f"Failed to notify student {student['_id']}: {e}")
                results.append({
                    'student_id': student['_id'],
                    'student_name': student['name'],
                    'email': student['email'],
                    'email_sent': False,
                    'status': 'failed',
                    'error': str(e)
                })

        return jsonify({
            'success': True,
            'message': f'Writing test notification sent to {len(results)} students',
            'data': {
                'test_id': test_id,
                'test_name': test['name'],
                'notifications_sent': len(results),
                'results': results
            }
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error notifying writing test students: {e}")
        return jsonify({'success': False, 'message': f'Failed to send notifications: {e}'}), 500 
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from bson import ObjectId
import csv
import io
import os
import uuid
from datetime import datetime, timezone
import boto3
import threading
# Make audio processing packages optional
try:
    from pydub import AudioSegment
    PYDUB_AVAILABLE = True
except ImportError:
    PYDUB_AVAILABLE = False
    print("Warning: pydub package not available. Audio processing will not work.")

try:
    from gtts import gTTS
    GTTS_AVAILABLE = True
except ImportError:
    GTTS_AVAILABLE = False
    print("Warning: gTTS package not available. Audio generation will not work.")

# Make speech_recognition optional
try:
    import speech_recognition as sr
    SPEECH_RECOGNITION_AVAILABLE = True
except ImportError:
    SPEECH_RECOGNITION_AVAILABLE = False
    print("Warning: speech_recognition package not available. Audio transcription will not work.")
from difflib import SequenceMatcher 
import json
from mongo import mongo_db
from config.constants import ROLES, MODULES, LEVELS, TEST_TYPES, GRAMMAR_CATEGORIES, CRT_CATEGORIES, QUESTION_TYPES, TEST_CATEGORIES, MODULE_CATEGORIES
from config.aws_config import s3_client, S3_BUCKET_NAME
from utils.audio_generator import generate_audio_from_text, calculate_similarity_score, transcribe_audio
import functools
import string
import random
from dateutil import tz
from pymongo import DESCENDING
from collections import defaultdict
from utils.email_service import send_email, render_template
import requests
import pytz
from routes.access_control import require_permission
from models import Test

# OneCompiler API Configuration
ONECOMPILER_API_KEY = 'f744734571mshb636ee6aecb15e3p16c0e7jsnd142c0e341e6'
ONECOMPILER_API_HOST = 'onecompiler-apis.p.rapidapi.com'

test_management_bp = Blueprint('test_management', __name__)

# ==================== SHARED UTILITY FUNCTIONS ====================

def generate_unique_test_id(length=6):
    """Generates a unique 6-character alphanumeric ID for tests."""
    while True:
        test_id = ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))
        if mongo_db.tests.find_one({'test_id': test_id}) is None:
            return test_id

def require_superadmin(f):
    @functools.wraps(f)
    def decorated_function(*args, **kwargs):
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)
        allowed_roles = ['superadmin']
        if not user or user.get('role') not in allowed_roles:
            return jsonify({
                'success': False,
                'message': 'Access denied. Super admin privileges required.'
            }), 403
        return f(*args, **kwargs)
    return decorated_function

def is_mcq_module(module_id):
    """Check if the module requires MCQ questions"""
    module_name = MODULES.get(module_id, '')
    return module_name in ['Grammar', 'Vocabulary']

def convert_objectids(obj):
    """Convert ObjectIds to strings recursively"""
    if obj is None:
        return None
    elif isinstance(obj, dict):
        return {k: convert_objectids(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_objectids(i) for i in obj]
    elif isinstance(obj, ObjectId):
        return str(obj)
    else:
        return obj

def generate_audio_from_text(text, accent='en-US', speed=1.0):
    """Generate audio from text using gTTS with custom accent and speed"""
    try:
        # Import the utility function instead of duplicating code
        from utils.audio_generator import generate_audio_from_text as generate_audio_util
        
        # Convert accent format (en-US -> en)
        lang = accent.split('-')[0] if '-' in accent else accent
        
        # Call the utility function with proper error handling
        return generate_audio_util(text, lang, speed)
        
    except Exception as e:
        current_app.logger.error(f"AUDIO GENERATION FAILED: {str(e)}", exc_info=True)
        # Re-raise with more context
        if "429" in str(e) or "Too Many Requests" in str(e):
            raise Exception(f"Rate limit exceeded from TTS API. Please wait a few minutes and try again. Error: {str(e)}")
        elif "gTTS" in str(e):
            raise Exception(f"Text-to-speech conversion failed: {str(e)}. Please check the text content and try again.")
        elif "AudioSegment" in str(e):
            raise Exception(f"Audio processing failed: {str(e)}. Please check if the audio file was generated correctly.")
        else:
            raise Exception(f"Audio generation failed: {str(e)}. Please try again or contact support.")

def audio_generation_worker(app, test_id, questions, audio_config):
    """Background worker for generating audio for test questions"""
    with app.app_context():
        try:
            current_app.logger.info(f"Starting audio generation for test {test_id}")
            
            for i, question in enumerate(questions):
                question_text = question.get('question', '')
                if not question_text:
                    continue
                
                # Generate audio
                accent = audio_config.get('accent', 'en-US')
                speed = audio_config.get('speed', 1.0)
                
                # Ensure speed is a float to prevent type comparison errors
                try:
                    speed = float(speed) if speed is not None else 1.0
                except (ValueError, TypeError):
                    speed = 1.0
                    current_app.logger.warning(f"Invalid speed value '{audio_config.get('speed')}', using default 1.0")
                
                try:
                    audio_url = generate_audio_from_text(question_text, accent, speed)
                    
                    if audio_url:
                        # Update the question with audio URL
                        mongo_db.tests.update_one(
                            {'_id': ObjectId(test_id)},
                            {'$set': {f'questions.{i}.audio_url': audio_url}}
                        )
                        current_app.logger.info(f"Generated audio for question {i+1}")
                    else:
                        current_app.logger.error(f"Failed to generate audio for question {i+1}")
                        
                except Exception as audio_error:
                    current_app.logger.error(f"Failed to generate audio for question {i+1}: {str(audio_error)}")
                    # Continue with next question instead of failing entire batch
                    continue
                

            
            current_app.logger.info(f"Completed audio generation for test {test_id}")
        except Exception as e:
            current_app.logger.error(f"Error in audio generation worker: {str(e)}")

# ==================== ROUTING ENDPOINTS ====================

@test_management_bp.route('/create-test', methods=['POST'])
@jwt_required()
@require_permission(module='test_management', action='manage_tests')
def create_test_with_instances():
    """Route to appropriate test creation endpoint based on module type"""
    try:
        data = request.get_json()
        module_id = data.get('module_id')
        
        # Route to appropriate test creation endpoint based on module type
        if module_id in ['GRAMMAR', 'VOCABULARY', 'READING']:
            # Redirect to MCQ test creation
            from routes.test_management_mcq import create_mcq_test
            return create_mcq_test()
        elif module_id in ['LISTENING', 'SPEAKING']:
            # Redirect to audio test creation
            from routes.test_management_audio import create_audio_test
            return create_audio_test()
        elif module_id == 'WRITING':
            # Redirect to writing test creation
            from routes.test_management_writing import create_writing_test
            return create_writing_test()
        elif module_id in ['CRT_APTITUDE', 'CRT_REASONING', 'CRT_TECHNICAL'] or data.get('level_id') == 'TECHNICAL':
            # Redirect to technical test creation for all CRT modules
            from routes.test_management_technical import create_technical_test
            return create_technical_test()
        else:
            return jsonify({'success': False, 'message': f'Unsupported module type: {module_id}'}), 400

    except Exception as e:
        current_app.logger.error(f"Error routing test creation: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@test_management_bp.route('/tests/<test_id>', methods=['GET'])
@jwt_required()
@require_superadmin
def get_single_test(test_id):
    """Route to appropriate test retrieval endpoint based on module type"""
    try:
        current_app.logger.info(f"Fetching full details for test_id: {test_id}")
        test = mongo_db.tests.find_one({'_id': ObjectId(test_id)})
        if not test:
            current_app.logger.warning(f"Test not found for id: {test_id}")
            return jsonify({'success': False, 'message': 'Test not found'}), 404

        module_id = test.get('module_id')
        
        # Route to appropriate test retrieval based on module type
        if module_id in ['GRAMMAR', 'VOCABULARY', 'READING']:
            # Redirect to MCQ test retrieval
            from routes.test_management_mcq import get_mcq_test
            return get_mcq_test(test_id)
        elif module_id in ['LISTENING', 'SPEAKING']:
            # Redirect to audio test retrieval
            from routes.test_management_audio import get_audio_test
            return get_audio_test(test_id)
        elif module_id == 'WRITING':
            # Redirect to writing test retrieval
            from routes.test_management_writing import get_writing_test
            return get_writing_test(test_id)
        elif module_id in ['CRT_APTITUDE', 'CRT_REASONING', 'CRT_TECHNICAL'] or test.get('level_id') == 'TECHNICAL':
            # Redirect to technical test retrieval for all CRT modules
            from routes.test_management_technical import get_technical_test
            return get_technical_test(test_id)
        else:
            # Fallback to original implementation for unknown modules
            current_app.logger.info(f"Test found. Processing {len(test.get('questions', []))} questions for presigned URLs.")
            
            # Fix corrupted audio URLs first
            test = fix_audio_urls_in_test(test)
            
            # Generate presigned URLs for audio files
            for question in test.get('questions', []):
                if 'audio_url' in question and question['audio_url']:
                    try:
                        url = s3_client.generate_presigned_url(
                            'get_object',
                            Params={'Bucket': S3_BUCKET_NAME, 'Key': question['audio_url']},
                            ExpiresIn=3600  # URL expires in 1 hour
                        )
                        question['audio_presigned_url'] = url
                        current_app.logger.info(f"Generated presigned URL for question_id: {question.get('question_id')}")
                    except Exception as e:
                        current_app.logger.error(f"Error generating presigned URL for {question['audio_url']}: {e}")
                        question['audio_presigned_url'] = None
                else:
                    current_app.logger.warning(f"Question_id {question.get('question_id')} is missing 'audio_url' or it is empty.")
            test['_id'] = str(test['_id'])
            # Convert all ObjectIds in the test document to strings
            test = convert_objectids(test)
            current_app.logger.info(f"Successfully processed test {test_id}. Sending to frontend.")
            return jsonify({'success': True, 'data': test}), 200
            
    except Exception as e:
        import traceback
        current_app.logger.error(f"Error fetching test {test_id}: {e}\n{traceback.format_exc()}")
        return jsonify({'success': False, 'message': f'An error occurred while fetching the test: {e}'}), 500

# ==================== SHARED ENDPOINTS ====================

@test_management_bp.route('/get-test-data', methods=['GET'])
@jwt_required()
@require_superadmin
def get_test_data():
    """Get campuses, courses, and batches for dropdowns"""
    try:
        # Get campuses
        campuses = list(mongo_db.campuses.find({}, {'name': 1, '_id': 1}))
        
        # Get courses
        courses = list(mongo_db.courses.find({}, {'name': 1, '_id': 1}))
        
        # Get batches
        batches = list(mongo_db.batches.find({}, {'name': 1, '_id': 1}))
        
        # Use the imported constants directly
        try:
            grammar_categories = GRAMMAR_CATEGORIES
        except NameError:
            current_app.logger.warning("GRAMMAR_CATEGORIES not found, using default values")
            grammar_categories = {
                'NOUN': 'Noun',
                'PRONOUN': 'Pronoun',
                'ADJECTIVE': 'Adjective',
                'VERB': 'Verb',
                'ADVERB': 'Adverb',
                'CONJUNCTION': 'Conjunction'
            }
            
        try:
            crt_categories = CRT_CATEGORIES
        except NameError:
            current_app.logger.warning("CRT_CATEGORIES not found, using default values")
            crt_categories = {
                'CRT_APTITUDE': 'Aptitude',
                'CRT_REASONING': 'Reasoning', 
                'CRT_TECHNICAL': 'Technical'
            }
        
        # Get CRT topics with progress
        crt_topics = []
        try:
            topics = list(mongo_db.crt_topics.find({}).sort('created_at', -1))
            for topic in topics:
                topic_id = topic['_id']
                
                # Count total questions for this topic
                total_questions = mongo_db.question_bank.count_documents({
                    'topic_id': topic_id,
                    'module_id': {'$in': ['CRT_APTITUDE', 'CRT_REASONING', 'CRT_TECHNICAL']}
                })
                
                # Count questions used in tests
                used_questions = mongo_db.question_bank.count_documents({
                    'topic_id': topic_id,
                    'module_id': {'$in': ['CRT_APTITUDE', 'CRT_REASONING', 'CRT_TECHNICAL']},
                    'used_count': {'$gt': 0}
                })
                
                # Calculate completion percentage
                completion_percentage = (used_questions / total_questions * 100) if total_questions > 0 else 0
                
                topic['_id'] = str(topic['_id'])
                topic['total_questions'] = total_questions
                topic['used_questions'] = used_questions
                topic['completion_percentage'] = round(completion_percentage, 1)
                topic['created_at'] = topic['created_at'].isoformat() if topic['created_at'] else None
                
                crt_topics.append(topic)
        except Exception as e:
            current_app.logger.error(f"Error fetching CRT topics: {e}")
        
        # Convert ObjectIds to strings
        for campus in campuses:
            campus['_id'] = str(campus['_id'])
        for course in courses:
            course['_id'] = str(course['_id'])
        for batch in batches:
            batch['_id'] = str(batch['_id'])
        
        return jsonify({
            'success': True,
            'data': {
                'campuses': campuses,
                'courses': courses,
                'batches': batches,
                'modules': MODULES,
                'levels': LEVELS,
                'test_types': TEST_TYPES,
                'grammar_categories': grammar_categories,
                'crt_categories': crt_categories,
                'crt_topics': crt_topics
            }
        }), 200
    except Exception as e:
        current_app.logger.error(f"Error fetching test data: {e}")
        return jsonify({'success': False, 'message': f'Failed to fetch test data: {e}'}), 500

@test_management_bp.route('/tests', methods=['GET'])
@jwt_required()
@require_superadmin
def get_all_tests():
    """Get all created tests with detailed information."""
    try:
        pipeline = [
            {
                '$lookup': {
                    'from': 'campuses',
                    'localField': 'campus_ids',
                    'foreignField': '_id',
                    'as': 'campus_info'
                }
            },
            {
                '$lookup': {
                    'from': 'batches',
                    'localField': 'batch_ids',
                    'foreignField': '_id',
                    'as': 'batch_info'
                }
            },
            {
                '$lookup': {
                    'from': 'courses',
                    'localField': 'course_ids',
                    'foreignField': '_id',
                    'as': 'course_info'
                }
            },
            {
                '$project': {
                    '_id': 1,
                    'name': 1,
                    'test_type': 1,
                    'status': 1,
                    'created_at': 1,
                    'question_count': {'$size': '$questions'},
                    'module_id': 1,
                    'level_id': 1,
                    'subcategory': 1,
                    'campus_names': '$campus_info.name',
                    'batches': '$batch_info.name',
                    'courses': '$course_info.name',
                    'questions': 1
                }
            },
            {'$sort': {'created_at': -1}}
        ]

        tests = list(mongo_db.tests.aggregate(pipeline))

        tests_data = []
        for test in tests:
            test['_id'] = str(test['_id'])
            test['created_at'] = test['created_at'].isoformat() if test['created_at'] else None
            
            # Format campus, batch, and course names properly
            test['campus'] = ', '.join(test.get('campus_names', [])) if test.get('campus_names') else 'N/A'
            test['batch'] = ', '.join(test.get('batches', [])) if test.get('batches') else 'N/A'
            test['course'] = ', '.join(test.get('courses', [])) if test.get('courses') else 'N/A'
            
            # Format level properly
            if test.get('level_id'):
                test['level'] = test['level_id'].replace('_', ' ').title()
            else:
                test['level'] = 'N/A'
            
            tests_data.append(test)

        return jsonify({'success': True, 'data': tests_data}), 200
    except Exception as e:
        current_app.logger.error(f"Error fetching all tests: {e}")
        return jsonify({'success': False, 'message': f'Failed to fetch tests: {e}'}), 500

@test_management_bp.route('/tests/<test_id>', methods=['DELETE'])
@jwt_required()
@require_superadmin
def delete_test(test_id):
    """Delete a test and its associated S3 audio files (if any)."""
    try:
        test_to_delete = mongo_db.tests.find_one({'_id': ObjectId(test_id)})
        if not test_to_delete:
            return jsonify({'success': False, 'message': 'Test not found'}), 404

        # Only delete S3 audio files when the test is actually deleted
        # This ensures audio files persist until test deletion
        module_id = test_to_delete.get('module_id')
        mcq_modules = ['GRAMMAR', 'VOCABULARY', 'READING']
        if module_id not in mcq_modules:
            questions = test_to_delete.get('questions', [])
            objects_to_delete = [{'Key': q['audio_url']} for q in questions if 'audio_url' in q and q['audio_url']]
            if objects_to_delete and s3_client:
                try:
                    s3_client.delete_objects(
                        Bucket=S3_BUCKET_NAME,
                        Delete={'Objects': objects_to_delete}
                    )
                    current_app.logger.info(f"Deleted {len(objects_to_delete)} audio files for test {test_id}")
                except Exception as e:
                    current_app.logger.error(f"Error deleting audio files for test {test_id}: {e}")
                    # Continue with test deletion even if audio deletion fails

        # Delete the test from the database
        mongo_db.tests.delete_one({'_id': ObjectId(test_id)})

        return jsonify({'success': True, 'message': 'Test deleted successfully'}), 200
    except Exception as e:
        current_app.logger.error(f"Error deleting test {test_id}: {e}")
        return jsonify({'success': False, 'message': 'An error occurred while deleting the test.'}), 500

@test_management_bp.route('/student-count', methods=['POST'])
@jwt_required()
@require_superadmin
def get_student_count():
    """Get student count and list for given campus, batches, and courses"""
    try:
        current_app.logger.info("Student count endpoint called")
        data = request.get_json()
        current_app.logger.info(f"Received data: {data}")
        
        campus_id = data.get('campus')
        batch_ids = data.get('batches', [])
        course_ids = data.get('courses', [])
        
        current_app.logger.info(f"Campus ID: {campus_id}")
        current_app.logger.info(f"Batch IDs: {batch_ids}")
        current_app.logger.info(f"Course IDs: {course_ids}")
        
        if not campus_id:
            return jsonify({'success': False, 'message': 'Campus ID is required'}), 400
        
        # Enhanced student query - try multiple approaches
        student_query = {}
        student_list = []
        
        # Approach 1: Try batch-course instances first
        if batch_ids and course_ids:
            instance_query = {'campus_id': ObjectId(campus_id)}
            instance_query['batch_id'] = {'$in': [ObjectId(bid) for bid in batch_ids]}
            instance_query['course_id'] = {'$in': [ObjectId(cid) for cid in course_ids]}
            
            current_app.logger.info(f"Instance query: {instance_query}")
            instances = list(mongo_db.db.batch_course_instances.find(instance_query))
            current_app.logger.info(f"Found {len(instances)} instances")
            
            if instances:
                instance_ids = [instance['_id'] for instance in instances]
                students = list(mongo_db.students.find({'batch_course_instance_id': {'$in': instance_ids}}))
                current_app.logger.info(f"Found {len(students)} students via instances")
                
                for student in students:
                    user = mongo_db.users.find_one({'_id': student['user_id']})
                    if user:
                        student_list.append({
                            'id': str(student['_id']),
                            'name': user.get('name', ''),
                            'email': user.get('email', ''),
                            'roll_number': student.get('roll_number', ''),
                            'source': 'batch_course_instance'
                        })
        
        # Approach 2: If no students found, try direct batch query
        if not student_list and batch_ids:
            current_app.logger.info("Trying direct batch query")
            students = list(mongo_db.students.find({'batch_id': {'$in': [ObjectId(bid) for bid in batch_ids]}}))
            current_app.logger.info(f"Found {len(students)} students via direct batch query")
            
            for student in students:
                user = mongo_db.users.find_one({'_id': student['user_id']})
                if user:
                    student_list.append({
                        'id': str(student['_id']),
                        'name': user.get('name', ''),
                        'email': user.get('email', ''),
                        'roll_number': student.get('roll_number', ''),
                        'source': 'direct_batch'
                    })
        
        # Approach 3: If still no students, try campus-wide query
        if not student_list:
            current_app.logger.info("Trying campus-wide query")
            # Get all batches for this campus
            campus_batches = list(mongo_db.batches.find({'campus_id': ObjectId(campus_id)}))
            if campus_batches:
                batch_ids_campus = [str(batch['_id']) for batch in campus_batches]
                students = list(mongo_db.students.find({'batch_id': {'$in': [ObjectId(bid) for bid in batch_ids_campus]}}))
                current_app.logger.info(f"Found {len(students)} students via campus-wide query")
                
                for student in students:
                    user = mongo_db.users.find_one({'_id': student['user_id']})
                    if user:
                        student_list.append({
                            'id': str(student['_id']),
                            'name': user.get('name', ''),
                            'email': user.get('email', ''),
                            'roll_number': student.get('roll_number', ''),
                            'source': 'campus_wide'
                        })
        
        # Remove duplicates based on student ID
        unique_students = {}
        for student in student_list:
            if student['id'] not in unique_students:
                unique_students[student['id']] = student
        
        final_student_list = list(unique_students.values())
        
        current_app.logger.info(f"Final student count: {len(final_student_list)}")
        
        if not final_student_list:
            return jsonify({
                'success': True,
                'count': 0,
                'students': [],
                'message': 'No students found for the selected criteria. Please ensure students are uploaded to the selected batches and courses.'
            }), 200
        
        return jsonify({
            'success': True,
            'count': len(final_student_list),
            'students': final_student_list
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting student count: {e}")
        import traceback
        current_app.logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({'success': False, 'message': str(e)}), 500

@test_management_bp.route('/check-test-name', methods=['POST'])
@jwt_required()
@require_superadmin
def check_test_name():
    """Check if a test name already exists."""
    try:
        data = request.get_json()
        test_name = data.get('name')
        if not test_name:
            return jsonify({'success': False, 'message': 'Test name is required.'}), 400

        if mongo_db.tests.find_one({'name': test_name}):
            return jsonify({'exists': True}), 200
        else:
            return jsonify({'exists': False}), 200
    except Exception as e:
        current_app.logger.error(f"Error checking test name: {e}")
        return jsonify({'success': False, 'message': 'An error occurred while checking the test name.'}), 500

@test_management_bp.route('/notify-students/<test_id>', methods=['POST'])
@jwt_required()
@require_superadmin
def notify_students(test_id):
    """Notify all students assigned to a test by email with test details."""
    try:
        # Fetch test details
        test = mongo_db.tests.find_one({'_id': ObjectId(test_id)})
        if not test:
            return jsonify({'success': False, 'message': 'Test not found.'}), 404

        # Fetch all assigned students
        from routes.student import get_students_for_test_ids
        try:
            if test.get('assigned_student_ids'):
                student_list = get_students_for_test_ids([test_id], assigned_student_ids=test['assigned_student_ids'])
            else:
                student_list = get_students_for_test_ids([test_id])
            
            current_app.logger.info(f"Found {len(student_list)} students for test {test_id}")
            
            if not student_list:
                return jsonify({'success': False, 'message': 'No students found for this test.'}), 404
        except Exception as e:
            current_app.logger.error(f"Error fetching students for test {test_id}: {e}")
            return jsonify({'success': False, 'message': f'Error fetching students: {e}'}), 500

        # Check email service configuration
        from utils.email_service import check_email_configuration
        email_config = check_email_configuration()
        if email_config.get('issues'):
            current_app.logger.warning(f"Email service has configuration issues: {email_config['issues']}")
            current_app.logger.info("Proceeding with notifications, but some may fail")
        
        # Send notifications
        results = []
        current_app.logger.info(f"Starting to send notifications to {len(student_list)} students")
        
        for student in student_list:
            try:
                current_app.logger.info(f"Processing notification for student: {student['name']} ({student['email']})")
                
                # Send email notification
                try:
                    html_content = render_template('test_notification.html', 
                        student_name=student['name'],
                        test_name=test['name'],
                        test_id=str(test['_id']),
                        test_type=test.get('test_type', 'Practice'),
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
                    current_app.logger.info(f"Template rendered successfully for {student['email']}")
                except Exception as template_error:
                    current_app.logger.error(f"Template rendering failed for {student['email']}: {template_error}")
                    # Use a simple fallback template
                    html_content = f"""
                    <html>
                    <body>
                        <h2>New Test Available: {test['name']}</h2>
                        <p>Hello {student['name']},</p>
                        <p>You have been assigned a new test: {test['name']}</p>
                        <p>Module: {test.get('module_id', 'Unknown')}</p>
                        <p>Level: {test.get('level_id', 'Unknown')}</p>
                        <p>Type: {test.get('test_type', 'Practice')}</p>
                        <p>Questions: {len(test.get('questions', []))}</p>
                        <p>Please log in to your account to take the test.</p>
                    </body>
                    </html>
                    """
                
                email_sent = send_email(
                    to_email=student['email'],
                    to_name=student['name'],
                    subject=f"New Test Available: {test['name']}",
                    html_content=html_content
                )
                
                current_app.logger.info(f"Email sent to {student['email']}: {email_sent}")
                
                results.append({
                    'student_id': student['student_id'],
                    'student_name': student['name'],
                    'email': student['email'],
                    'email_sent': email_sent,
                    'status': 'success' if email_sent else 'failed'
                })
            except Exception as e:
                current_app.logger.error(f"Failed to notify student {student['student_id']}: {e}")
                import traceback
                current_app.logger.error(f"Full traceback: {traceback.format_exc()}")
                results.append({
                    'student_id': student['student_id'],
                    'student_name': student['name'],
                    'email': student['email'],
                    'email_sent': False,
                    'status': 'failed',
                    'error': str(e)
                })

        # Calculate success/failure statistics
        successful_notifications = sum(1 for r in results if r['status'] == 'success')
        failed_notifications = sum(1 for r in results if r['status'] == 'failed')
        
        current_app.logger.info(f"Notification summary: {successful_notifications} successful, {failed_notifications} failed")
        
        return jsonify({
            'success': True,
            'message': f'Notifications processed: {successful_notifications} successful, {failed_notifications} failed',
            'results': results,
            'summary': {
                'total': len(results),
                'successful': successful_notifications,
                'failed': failed_notifications
            }
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error notifying students: {e}")
        return jsonify({'success': False, 'message': f'Failed to send notification: {e}'}), 500



# ==================== QUESTION BANK ENDPOINTS ====================

@test_management_bp.route('/module-question-bank/upload', methods=['POST'])
@jwt_required()
@require_superadmin
def upload_module_questions():
    try:
        data = request.get_json()
        module_id = data.get('module_id')
        level_id = data.get('level_id')
        questions = data.get('questions')
        topic_id = data.get('topic_id')  # Optional topic_id for CRT modules
        
        if not module_id or not questions:
            return jsonify({'success': False, 'message': 'module_id and questions are required.'}), 400
        
        # For non-CRT modules, level_id is required
        if not module_id.startswith('CRT_') and not level_id:
            return jsonify({'success': False, 'message': 'level_id is required for non-CRT modules.'}), 400
        
        # Generate upload session ID
        upload_session_id = str(uuid.uuid4())
        
        # Store each question in a question_bank collection
        inserted = []
        for q in questions:
            doc = {
                'module_id': module_id,
                'level_id': level_id,
                'question': q.get('question'),
                'optionA': q.get('options', [])[0] if q.get('options') else q.get('optionA', ''),
                'optionB': q.get('options', [])[1] if q.get('options') and len(q.get('options')) > 1 else q.get('optionB', ''),
                'optionC': q.get('options', [])[2] if q.get('options') and len(q.get('options')) > 2 else q.get('optionC', ''),
                'optionD': q.get('options', [])[3] if q.get('options') and len(q.get('options')) > 3 else q.get('optionD', ''),
                'answer': q.get('answer', ''),
                'instructions': q.get('instructions', ''),
                'used_in_tests': [], # Track test_ids where used
                'used_count': 0,
                'last_used': None,
                'created_at': datetime.utcnow(),
                'upload_session_id': upload_session_id
            }
            
            # Add topic_id if provided (for CRT modules)
            if topic_id:
                doc['topic_id'] = ObjectId(topic_id)
            
            # Handle different question types based on module
            if module_id == 'CRT_TECHNICAL' or level_id == 'CRT_TECHNICAL':
                # Check question type
                question_type = q.get('questionType', 'compiler_integrated')
                doc['question_type'] = question_type
                
                if question_type == 'compiler_integrated':
                    doc['testCases'] = q.get('testCases', '')
                    doc['expectedOutput'] = q.get('expectedOutput', '')
                    doc['language'] = q.get('language', 'python')
                    doc['testCaseId'] = q.get('testCaseId', '')
                    
                    # Validate compiler-integrated question
                    if not doc['testCases'] or not doc['expectedOutput']:
                        current_app.logger.warning(f"Skipping question without test cases: {q.get('question', '')}")
                        continue
                        
                elif question_type == 'mcq':
                    # MCQ format for technical questions
                    doc['question_type'] = 'mcq'
                    # The MCQ fields are already set above
                    
                    # Validate MCQ question
                    if not doc['optionA'] or not doc['optionB'] or not doc['optionC'] or not doc['optionD'] or not doc['answer']:
                        current_app.logger.warning(f"Skipping incomplete MCQ question: {q.get('question', '')}")
                        continue
            elif module_id in ['LISTENING', 'SPEAKING']:
                # For listening and speaking, handle sentence-type questions
                doc['question_type'] = 'sentence'
                # Add sentence-specific fields
                doc['sentence'] = q.get('question') or q.get('sentence', '')
                doc['audio_url'] = q.get('audio_url')
                doc['audio_config'] = q.get('audio_config')
                doc['transcript_validation'] = q.get('transcript_validation')
                doc['has_audio'] = q.get('has_audio', False)
                # For speaking module
                if module_id == 'SPEAKING':
                    doc['question_type'] = 'speaking'
            else:
                doc['question_type'] = 'mcq'
            
            # Support sublevel/subcategory for grammar
            if 'subcategory' in q:
                doc['subcategory'] = q['subcategory']
                
            mongo_db.question_bank.insert_one(doc)
            inserted.append(doc['question'])
        
        current_app.logger.info(f"Successfully uploaded {len(inserted)} questions to module bank")
        
        return jsonify({'success': True, 'message': f'Uploaded {len(inserted)} questions to module bank.'}), 201
    except Exception as e:
        current_app.logger.error(f"Error uploading module questions: {e}")
        return jsonify({'success': False, 'message': f'Upload failed: {e}'}), 500

@test_management_bp.route('/existing-questions', methods=['GET'])
@jwt_required()
@require_superadmin
def get_existing_questions():
    """Get existing questions for duplicate checking"""
    try:
        module_id = request.args.get('module_id')
        level_id = request.args.get('level_id')
        topic_id = request.args.get('topic_id')  # New parameter for CRT topics
        
        if not module_id:
            return jsonify({'success': False, 'message': 'module_id is required'}), 400
        
        # Build query based on module type
        if module_id.startswith('CRT_'):
            # For CRT modules, we can filter by topic_id if provided
            query = {'module_id': module_id}
            if topic_id:
                query['topic_id'] = ObjectId(topic_id)
        else:
            # For other modules, require level_id
            if not level_id:
                return jsonify({'success': False, 'message': 'level_id is required for non-CRT modules'}), 400
            query = {'module_id': module_id, 'level_id': level_id}
        
        # Build projection based on module type
        if module_id in ['LISTENING', 'SPEAKING']:
            projection = {
                'sentence': 1,
                'question': 1,
                'audio_url': 1,
                'audio_config': 1,
                'transcript_validation': 1,
                'has_audio': 1,
                'question_type': 1,
                'used_count': 1
            }
        else:
            projection = {
                'question': 1,
                'optionA': 1,
                'optionB': 1,
                'optionC': 1,
                'optionD': 1,
                'answer': 1,
                'topic_id': 1,
                'used_count': 1
            }
        
        questions = list(mongo_db.question_bank.find(query, projection))
        
        # Convert ObjectIds to strings
        for q in questions:
            q['_id'] = str(q['_id'])
            if 'topic_id' in q and q['topic_id']:
                q['topic_id'] = str(q['topic_id'])
        
        return jsonify({'success': True, 'data': questions}), 200
    except Exception as e:
        current_app.logger.error(f"Error fetching existing questions: {e}")
        return jsonify({'success': False, 'message': f'Failed to fetch existing questions: {e}'}), 500

@test_management_bp.route('/question-bank/fetch-for-test', methods=['POST'])
@jwt_required()
@require_superadmin
def fetch_questions_for_test():
    data = request.get_json()
    module_id = data.get('module_id')
    level_id = data.get('level_id')
    subcategory = data.get('subcategory')  # For grammar
    n = int(data.get('count', 20))
    
    # Build query based on module type
    query = {'module_id': module_id}
    
    if module_id == 'GRAMMAR':
        # For Grammar, use level_id (which contains the grammar category like 'NOUN', 'VERB', etc.)
        query['level_id'] = level_id
        # Don't add subcategory to query as it's not used in the stored data
    elif module_id == 'CRT':
        # For CRT modules, level_id contains the category (e.g., CRT_APTITUDE, CRT_TECHNICAL)
        query['level_id'] = level_id
    else:
        # For other modules (VOCABULARY, READING, etc.)
        query['level_id'] = level_id
    
    current_app.logger.info(f"Fetching questions with query: {query}")
    
    # Build projection based on module type
    if module_id in ['LISTENING', 'SPEAKING']:
        projection = {
            'sentence': 1,
            'question': 1,
            'audio_url': 1,
            'audio_config': 1,
            'transcript_validation': 1,
            'has_audio': 1,
            'question_type': 1,
            'used_count': 1,
            'last_used': 1
        }
    else:
        projection = {
            'question': 1,
            'optionA': 1,
            'optionB': 1,
            'optionC': 1,
            'optionD': 1,
            'answer': 1,
            'used_count': 1,
            'last_used': 1
        }
    
    questions = list(mongo_db.question_bank.find(query, projection).sort([
        ('used_count', 1),
        ('last_used', 1)
    ]).limit(n))
    
    for q in questions:
        q['_id'] = str(q['_id'])
    
    current_app.logger.info(f"Found {len(questions)} questions for module {module_id}, level {level_id}")
    
    return jsonify({'success': True, 'questions': questions}), 200

# ==================== RANDOM QUESTION SELECTION FOR ONLINE TESTS ====================

@test_management_bp.route('/question-bank/bulk-selection', methods=['POST'])
@jwt_required()
@require_superadmin
def get_bulk_questions_from_bank():
    """Get bulk questions from question bank with filtering options"""
    try:
        data = request.get_json()
        module_id = data.get('module_id')
        level_id = data.get('level_id')
        subcategory = data.get('subcategory')
        topic_id = data.get('topic_id')  # For CRT modules
        question_count = data.get('question_count', 50)
        page = data.get('page', 1)
        limit = data.get('limit', 50)
        
        if not module_id:
            return jsonify({'success': False, 'message': 'Module ID is required'}), 400
        
        # Build query based on module type
        query = {'module_id': module_id}
        
        # Handle CRT modules differently
        if module_id.startswith('CRT_'):
            # For CRT modules, level_id contains the category
            if level_id:
                query['level_id'] = level_id
            
            if topic_id and topic_id.strip():
                # Check if topic_id is a valid ObjectId
                try:
                    # If it's a valid ObjectId, use it directly
                    if len(topic_id) == 24 and all(c in '0123456789abcdef' for c in topic_id.lower()):
                        query['topic_id'] = ObjectId(topic_id)
                    else:
                        # If it's not a valid ObjectId, try to find the topic by name
                        # Remove any percentage or completion info
                        topic_name = topic_id.split('(')[0].strip()
                        topic = mongo_db.crt_topics.find_one({'topic_name': topic_name})
                        if topic:
                            query['topic_id'] = topic['_id']
                        else:
                            current_app.logger.warning(f"Topic not found: {topic_id}")
                            # Don't add topic_id to query if not found
                except Exception as e:
                    current_app.logger.error(f"Error processing topic_id {topic_id}: {e}")
                    # Don't add topic_id to query if there's an error
        else:
            # For non-CRT modules, level_id is required
            if not level_id:
                return jsonify({'success': False, 'message': 'level_id is required for non-CRT modules.'}), 400
            query['level_id'] = level_id
            
            # Add subcategory if provided (for Grammar module)
            if subcategory:
                query['subcategory'] = subcategory
        
        current_app.logger.info(f"Bulk question query: {query}")
        
        # Get total count
        total_count = mongo_db.question_bank.count_documents(query)
        
        # Get questions with pagination
        skip = (page - 1) * limit
        questions = list(mongo_db.question_bank.find(query).skip(skip).limit(limit))
        
        # If no questions found for CRT_TECHNICAL and level_id is set, try without level_id
        if module_id == 'CRT_TECHNICAL' and len(questions) == 0 and level_id:
            current_app.logger.info(f"No questions found with level_id {level_id}, trying without level_id")
            fallback_query = {'module_id': module_id}
            if topic_id and topic_id.strip():
                try:
                    if len(topic_id) == 24 and all(c in '0123456789abcdef' for c in topic_id.lower()):
                        fallback_query['topic_id'] = ObjectId(topic_id)
                    else:
                        topic_name = topic_id.split('(')[0].strip()
                        topic = mongo_db.crt_topics.find_one({'topic_name': topic_name})
                        if topic:
                            fallback_query['topic_id'] = topic['_id']
                except Exception as e:
                    current_app.logger.error(f"Error processing topic_id {topic_id}: {e}")
            
            current_app.logger.info(f"Fallback query: {fallback_query}")
            total_count = mongo_db.question_bank.count_documents(fallback_query)
            questions = list(mongo_db.question_bank.find(fallback_query).skip(skip).limit(limit))
        
        # Convert ObjectIds to strings and format questions
        for question in questions:
            question['_id'] = str(question['_id'])
            if 'topic_id' in question:
                question['topic_id'] = str(question['topic_id'])
            
            # Handle sentence-based questions (LISTENING and SPEAKING)
            if module_id in ['LISTENING', 'SPEAKING']:
                if question.get('question_type') == 'sentence' or 'sentence' in question:
                    question['question_type'] = 'sentence'
                    # Map sentence field to question field for consistency
                    if 'sentence' in question:
                        question['question'] = question['sentence']
                        question['text'] = question['sentence']  # Add text field for frontend compatibility
                    # Ensure audio information is preserved
                    if module_id == 'LISTENING':
                        question['has_audio'] = question.get('has_audio', False)
                        question['audio_url'] = question.get('audio_url', None)
                        question['audio_config'] = question.get('audio_config', {})
            
            # Ensure question_type is set for technical questions
            if question.get('module_id') == 'CRT_TECHNICAL':
                # Check for compiler-integrated questions first
                if ('questionTitle' in question and question['questionTitle']) or ('problemStatement' in question and question['problemStatement']):
                    question['question_type'] = 'compiler_integrated'
                    # Ensure proper field mapping for compiler questions
                    if 'questionTitle' in question:
                        question['question'] = question['questionTitle']
                    if 'problemStatement' in question:
                        question['statement'] = question['problemStatement']
                    # Ensure testCases are properly formatted
                    if 'testCases' in question and isinstance(question['testCases'], list):
                        # Convert testCases array to string format for display
                        test_cases_input = []
                        test_cases_output = []
                        for tc in question['testCases']:
                            if isinstance(tc, dict):
                                test_cases_input.append(tc.get('input', ''))
                                test_cases_output.append(tc.get('expectedOutput', ''))
                        question['testCases'] = '\n'.join(test_cases_input)
                        question['expectedOutput'] = '\n'.join(test_cases_output)
                elif 'question' in question and 'optionA' in question:
                    question['question_type'] = 'mcq'
                else:
                    # Default to compiler_integrated for CRT_TECHNICAL if unclear
                    question['question_type'] = 'compiler_integrated'
                    # Ensure proper field mapping
                    if 'questionTitle' in question:
                        question['question'] = question['questionTitle']
                    if 'problemStatement' in question:
                        question['statement'] = question['problemStatement']
            
            # For other modules, preserve existing question_type
            elif 'question_type' not in question:
                # Check if it's a sentence-based question (LISTENING or SPEAKING)
                if module_id in ['LISTENING', 'SPEAKING']:
                    question['question_type'] = 'sentence'
                    # Map sentence field to question field for consistency
                    if 'sentence' in question:
                        question['question'] = question['sentence']
                        question['text'] = question['sentence']  # Add text field for frontend compatibility
                else:
                    question['question_type'] = 'mcq'  # Default for other modules
        
        current_app.logger.info(f"Found {len(questions)} questions out of {total_count} total")
        
        return jsonify({
            'success': True,
            'questions': questions,
            'total_count': total_count,
            'current_page': page,
            'total_pages': (total_count + limit - 1) // limit,
            'has_more': (page * limit) < total_count
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting bulk questions: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@test_management_bp.route('/check-audio-generation', methods=['GET'])
@jwt_required()
@require_superadmin
def check_audio_generation_availability():
    """Check if audio generation packages are available"""
    try:
        from utils.audio_generator import get_audio_generation_status
        
        status = get_audio_generation_status()
        
        return jsonify({
            'success': True,
            'available': status['fully_available'],
            'gtts_available': status['gtts_available'],
            'pydub_available': status['pydub_available'],
            'aws_status': status.get('aws_status', {}),
            'message': 'Audio generation availability checked successfully'
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error checking audio generation availability: {e}")
        return jsonify({
            'success': False,
            'available': False,
            'message': f'Error checking availability: {str(e)}'
        }), 500

@test_management_bp.route('/generate-audio', methods=['POST'])
@jwt_required()
@require_superadmin
def generate_audio_for_question():
    """Generate audio for a specific question"""
    try:
        data = request.get_json()
        text = data.get('text')
        question_id = data.get('question_id')
        module_id = data.get('module_id')
        level_id = data.get('level_id')
        audio_config = data.get('audio_config', {})
        
        if not text or not question_id:
            return jsonify({'success': False, 'message': 'Text and question_id are required'}), 400
        
        # Generate audio using the existing utility
        accent = audio_config.get('accent', 'en-US')
        speed = audio_config.get('speed', 1.0)
        
        current_app.logger.info(f"Audio generation request - Text: '{text[:50]}...', Accent: {accent}, Speed: {speed} (type: {type(speed)})")
        
        # Ensure speed is a float to prevent type comparison errors
        try:
            speed = float(speed) if speed is not None else 1.0
            current_app.logger.info(f"Speed converted to float: {speed}")
        except (ValueError, TypeError) as e:
            speed = 1.0
            current_app.logger.warning(f"Invalid speed value '{audio_config.get('speed')}' (type: {type(audio_config.get('speed'))}), using default 1.0. Error: {e}")
        
        try:
            current_app.logger.info(f"Calling generate_audio_from_text with speed: {speed} (type: {type(speed)})")
            audio_url = generate_audio_from_text(text, accent, speed)
            
            if audio_url:
                # Update the question in the database with the audio URL
                try:
                    mongo_db.question_bank.update_one(
                        {'_id': ObjectId(question_id)},
                        {
                            '$set': {
                                'audio_url': audio_url,
                                'has_audio': True,
                                'audio_config': audio_config,
                                'audio_generated_at': datetime.utcnow()
                            }
                        }
                    )
                except Exception as e:
                    current_app.logger.warning(f"Failed to update question with audio URL: {e}")
                
                return jsonify({
                    'success': True,
                    'audio_url': audio_url,
                    'message': 'Audio generated successfully'
                }), 200
            else:
                return jsonify({
                    'success': False,
                    'message': 'Audio generation returned no result'
                }), 500
                
        except Exception as audio_error:
            current_app.logger.error(f"Audio generation error for text '{text}': {audio_error}")
            # Provide more specific error messages
            if "429" in str(audio_error) or "Too Many Requests" in str(audio_error):
                error_message = "Audio generation rate limit exceeded. The system will automatically retry. Please wait a moment and try again."
            elif "Rate limit exceeded" in str(audio_error):
                error_message = "Audio generation rate limit exceeded after multiple attempts. Please wait a few minutes and try again."
            elif "str" in str(audio_error) and "float" in str(audio_error):
                error_message = f"Audio generation failed due to a type conversion error. This has been fixed. Please try again."
            elif "gTTS" in str(audio_error):
                error_message = f"Text-to-speech conversion failed: {str(audio_error)}"
            elif "AudioSegment" in str(audio_error):
                error_message = f"Audio processing failed: {str(audio_error)}"
            elif "S3" in str(audio_error) or "boto" in str(audio_error):
                error_message = f"Failed to upload audio to storage: {str(audio_error)}"
            else:
                error_message = f"Audio generation failed: {str(audio_error)}"
            
            return jsonify({
                'success': False,
                'message': error_message
            }), 500
            
    except Exception as e:
        current_app.logger.error(f"Error generating audio: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@test_management_bp.route('/question-bank/count', methods=['POST'])
@jwt_required()
@require_superadmin
def get_question_count():
    """Get question count for CRT modules and topics"""
    try:
        data = request.get_json()
        module_id = data.get('module_id')
        level_id = data.get('level_id')  # Add level_id parameter
        topic_id = data.get('topic_id')
        
        if not module_id:
            return jsonify({'success': False, 'message': 'Module ID is required'}), 400
        
        # Build query
        query = {'module_id': module_id}
        
        # Handle CRT modules with level_id
        if module_id.startswith('CRT_'):
            if level_id:
                query['level_id'] = level_id
            
            if topic_id and topic_id.strip():
                try:
                    # Check if topic_id is a valid ObjectId
                    if len(topic_id) == 24 and all(c in '0123456789abcdef' for c in topic_id.lower()):
                        query['topic_id'] = ObjectId(topic_id)
                    else:
                        # If it's not a valid ObjectId, try to find the topic by name
                        topic_name = topic_id.split('(')[0].strip()
                        topic = mongo_db.crt_topics.find_one({'topic_name': topic_name})
                        if topic:
                            query['topic_id'] = topic['_id']
                except Exception as e:
                    current_app.logger.error(f"Error processing topic_id {topic_id}: {e}")
        else:
            # For non-CRT modules, level_id is required
            if level_id:
                query['level_id'] = level_id
        
        current_app.logger.info(f"Question count query: {query}")
        
        # Get total count
        total_count = mongo_db.question_bank.count_documents(query)
        
        # If no questions found for CRT_TECHNICAL and level_id is set, try without level_id
        if module_id == 'CRT_TECHNICAL' and total_count == 0 and level_id:
            current_app.logger.info(f"No questions found with level_id {level_id}, trying without level_id")
            fallback_query = {'module_id': module_id}
            if topic_id and topic_id.strip():
                try:
                    if len(topic_id) == 24 and all(c in '0123456789abcdef' for c in topic_id.lower()):
                        fallback_query['topic_id'] = ObjectId(topic_id)
                    else:
                        topic_name = topic_id.split('(')[0].strip()
                        topic = mongo_db.crt_topics.find_one({'topic_name': topic_name})
                        if topic:
                            fallback_query['topic_id'] = topic['_id']
                except Exception as e:
                    current_app.logger.error(f"Error processing topic_id {topic_id}: {e}")
            
            current_app.logger.info(f"Fallback count query: {fallback_query}")
            total_count = mongo_db.question_bank.count_documents(fallback_query)
        
        # Get available count (questions not used or used less frequently)
        available_query = {**query, 'used_count': {'$lt': 3}}  # Questions used less than 3 times
        available_count = mongo_db.question_bank.count_documents(available_query)
        
        # Get topic info if it's a CRT module
        topic_info = None
        if module_id.startswith('CRT_') and topic_id and topic_id.strip():
            try:
                if len(topic_id) == 24 and all(c in '0123456789abcdef' for c in topic_id.lower()):
                    topic_info = mongo_db.crt_topics.find_one({'_id': ObjectId(topic_id)})
                else:
                    topic_name = topic_id.split('(')[0].strip()
                    topic_info = mongo_db.crt_topics.find_one({'topic_name': topic_name})
                
                if topic_info:
                    topic_info['_id'] = str(topic_info['_id'])
            except Exception as e:
                current_app.logger.error(f"Error getting topic info: {e}")
        
        current_app.logger.info(f"Found {total_count} total questions, {available_count} available")
        
        return jsonify({
            'success': True,
            'total_count': total_count,
            'available_count': available_count,
            'topic_info': topic_info,
            'module_id': module_id
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting question count: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@test_management_bp.route('/question-bank/random-selection', methods=['POST'])
@jwt_required()
@require_superadmin
def get_random_questions_for_online_test():
    """Get random questions from question bank for online test creation"""
    try:
        data = request.get_json()
        module_id = data.get('module_id')
        level_id = data.get('level_id')
        subcategory = data.get('subcategory')  # For grammar
        question_count = int(data.get('question_count', 20))
        student_count = int(data.get('student_count', 1))  # Number of students to generate questions for
        
        if not module_id or not level_id:
            return jsonify({'success': False, 'message': 'module_id and level_id are required'}), 400
        
        # Build query based on module type
        query = {'module_id': module_id}
        
        if module_id == 'GRAMMAR':
            query['level_id'] = level_id
        elif module_id == 'CRT':
            query['level_id'] = level_id
        else:
            query['level_id'] = level_id
        
        current_app.logger.info(f"Fetching random questions with query: {query}")
        
        # Get all available questions for this module/level
        all_questions = list(mongo_db.question_bank.find(query))
        
        if not all_questions:
            return jsonify({'success': False, 'message': 'No questions found for the specified criteria'}), 404
        
        # Calculate total questions needed (question_count per student)
        total_questions_needed = question_count * student_count
        
        if len(all_questions) < total_questions_needed:
            return jsonify({
                'success': False, 
                'message': f'Not enough questions available. Need {total_questions_needed}, but only {len(all_questions)} found.'
            }), 400
        
        # Shuffle all questions and select the required number
        import random
        random.shuffle(all_questions)
        selected_questions = all_questions[:total_questions_needed]
        
        # Group questions for each student
        student_question_sets = []
        for i in range(student_count):
            start_idx = i * question_count
            end_idx = start_idx + question_count
            student_questions = selected_questions[start_idx:end_idx]
            
            # Process questions for this student (shuffle options for MCQ)
            processed_questions = []
            for j, question in enumerate(student_questions):
                processed_question = {
                    'question_id': f'q_{j+1}',
                    'question': question.get('question', ''),
                    'question_type': question.get('question_type', 'mcq'),
                    'module_id': question.get('module_id'),
                    'level_id': question.get('level_id'),
                    'created_at': question.get('created_at'),
                    '_id': str(question['_id'])
                }
                
                # Handle MCQ questions with option shuffling
                if question.get('question_type') == 'mcq' or module_id in ['GRAMMAR', 'VOCABULARY', 'READING']:
                    options = {
                        'A': question.get('optionA', ''),
                        'B': question.get('optionB', ''),
                        'C': question.get('optionC', ''),
                        'D': question.get('optionD', '')
                    }
                    
                    # Remove empty options
                    options = {k: v for k, v in options.items() if v.strip()}
                    
                    # Shuffle options
                    option_items = list(options.items())
                    random.shuffle(option_items)
                    
                    # Create new options dict with shuffled order
                    shuffled_options = {}
                    answer_mapping = {}
                    
                    for idx, (old_key, value) in enumerate(option_items):
                        new_key = chr(ord('A') + idx)
                        shuffled_options[new_key] = value
                        answer_mapping[old_key] = new_key
                    
                    processed_question['options'] = shuffled_options
                    processed_question['correct_answer'] = answer_mapping.get(question.get('answer', 'A'), 'A')
                    processed_question['original_answer'] = question.get('answer', 'A')
                    
                # Handle audio questions (Listening/Speaking)
                elif module_id in ['LISTENING', 'SPEAKING']:
                    processed_question.update({
                        'sentence': question.get('sentence', ''),
                        'audio_url': question.get('audio_url'),
                        'audio_config': question.get('audio_config'),
                        'transcript_validation': question.get('transcript_validation'),
                        'has_audio': question.get('has_audio', False)
                    })
                
                # Handle writing questions
                elif module_id == 'WRITING':
                    processed_question.update({
                        'paragraph': question.get('paragraph', ''),
                        'instructions': question.get('instructions', ''),
                        'min_words': question.get('min_words', 50),
                        'max_words': question.get('max_words', 500),
                        'min_characters': question.get('min_characters', 200),
                        'max_characters': question.get('max_characters', 2000)
                    })
                
                processed_questions.append(processed_question)
            
            student_question_sets.append({
                'student_index': i,
                'questions': processed_questions
            })
        
        # Update usage statistics for selected questions
        question_ids = [q['_id'] for q in selected_questions]
        mongo_db.question_bank.update_many(
            {'_id': {'$in': question_ids}},
            {
                '$inc': {'used_count': 1},
                '$set': {'last_used': datetime.utcnow()}
            }
        )
        
        return jsonify({
            'success': True,
            'message': f'Generated {len(student_question_sets)} question sets for {student_count} students',
            'data': {
                'student_question_sets': student_question_sets,
                'total_questions_used': len(selected_questions),
                'questions_per_student': question_count
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error in random question selection: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Failed to generate random questions: {str(e)}'
        }), 500

@test_management_bp.route('/create-online-test-with-random-questions', methods=['POST'])
@jwt_required()
@require_superadmin
def create_online_test_with_random_questions():
    """Create an online test with random questions assigned to each student"""
    try:
        data = request.get_json()
        test_name = data.get('test_name')
        test_type = data.get('test_type', 'online')
        module_id = data.get('module_id')
        level_id = data.get('level_id')
        subcategory = data.get('subcategory')
        campus_id = data.get('campus_id')
        course_ids = data.get('course_ids', [])
        batch_ids = data.get('batch_ids', [])
        assigned_student_ids = data.get('assigned_student_ids', [])
        question_count = int(data.get('question_count', 20))
        startDateTime = data.get('startDateTime')
        endDateTime = data.get('endDateTime')
        duration = data.get('duration')
        
        # Validate required fields
        if not all([test_name, module_id, level_id, campus_id, course_ids, batch_ids, assigned_student_ids]):
            return jsonify({'success': False, 'message': 'Missing required fields'}), 400
        
        if test_type.lower() != 'online':
            return jsonify({'success': False, 'message': 'This endpoint is for online tests only'}), 400
        
        if not all([startDateTime, endDateTime, duration]):
            return jsonify({'success': False, 'message': 'Start date, end date, and duration are required for online tests'}), 400
        
        # Get student count
        student_count = len(assigned_student_ids)
        if student_count == 0:
            return jsonify({'success': False, 'message': 'No students assigned to test'}), 400
        
        # Generate random questions for all students
        random_questions_payload = {
            'module_id': module_id,
            'level_id': level_id,
            'subcategory': subcategory,
            'question_count': question_count,
            'student_count': student_count
        }
        
        # Call the random question selection endpoint
        from flask import current_app
        with current_app.test_client() as client:
            response = client.post('/test-management/question-bank/random-selection', 
                                 json=random_questions_payload)
            
            if response.status_code != 200:
                return jsonify({'success': False, 'message': 'Failed to generate random questions'}), 500
            
            random_questions_data = response.get_json()
            student_question_sets = random_questions_data['data']['student_question_sets']
        
        # Generate unique test ID
        test_id = generate_unique_test_id()
        
        # Create base test document
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
            'assigned_student_ids': [ObjectId(sid) for sid in assigned_student_ids],
            'created_by': ObjectId(get_jwt_identity()),
            'created_at': datetime.utcnow(),
            'status': 'active',
            'is_active': True,
            'startDateTime': datetime.fromisoformat(startDateTime.replace('Z', '+00:00')),
            'endDateTime': datetime.fromisoformat(endDateTime.replace('Z', '+00:00')),
            'duration': int(duration),
            'question_count': question_count,
            'student_count': student_count,
            'has_random_questions': True  # Flag to indicate this test uses random questions
        }
        
        # Insert the base test
        test_result = mongo_db.tests.insert_one(test_doc)
        test_object_id = test_result.inserted_id
        
        # Create student-specific test assignments
        student_assignments = []
        for i, student_id in enumerate(assigned_student_ids):
            if i < len(student_question_sets):
                question_set = student_question_sets[i]
                
                assignment_doc = {
                    'test_id': test_object_id,
                    'student_id': ObjectId(student_id),
                    'questions': question_set['questions'],
                    'assigned_at': datetime.utcnow(),
                    'status': 'assigned',
                    'attempted': False,
                    'started_at': None,
                    'completed_at': None,
                    'score': 0,
                    'total_marks': question_count
                }
                
                student_assignments.append(assignment_doc)
        
        # Insert all student assignments
        if student_assignments:
            mongo_db.student_test_assignments.insert_many(student_assignments)
        
        return jsonify({
            'success': True,
            'message': f'Online test created successfully with random questions for {student_count} students',
            'data': {
                'test_id': str(test_object_id),
                'test_name': test_name,
                'student_count': student_count,
                'question_count': question_count,
                'assignments_created': len(student_assignments)
            }
        }), 201
        
    except Exception as e:
        current_app.logger.error(f"Error creating online test with random questions: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Failed to create online test: {str(e)}'
        }), 500

# ==================== STUDENT TEST SUBMISSION ENDPOINTS ====================

@test_management_bp.route('/submit-practice-test', methods=['POST'])
@jwt_required()
def submit_practice_test():
    """Submit practice test with student audio recordings or MCQ answers"""
    try:
        print("entered into submit practive test: ")
        current_user_id = get_jwt_identity()
        print("user practive test: ",current_user_id)
        data = request.form.to_dict()
        files = request.files

        
        # Validate required fields
        if not data.get('test_id'):
            return jsonify({
                'success': False,
                'message': 'Test ID is required'
            }), 400
        
        test_id = ObjectId(data['test_id'])
        test = mongo_db.tests.find_one({'_id': test_id})
        
        if not test:
            return jsonify({
                'success': False,
                'message': 'Test not found'
            }), 404
        
        # Check if student has access to this test
        test_user_id = ObjectId(current_user_id)
        print(test_user_id)
        student = mongo_db.students.find_one({'user_id': test_user_id})
        if not student:
            return jsonify({
                'success': False,
                'message': 'Student profile not found'
            }), 404
        
        # Validate access based on campus, course, batch
        has_access = False
        if test.get('campus_ids') and student.get('campus_id') in test['campus_ids']:
            has_access = True
        if test.get('course_ids') and student.get('course_id') in test['course_ids']:
            has_access = True
        if test.get('batch_ids') and student.get('batch_id') in test['batch_ids']:
            has_access = True
        
        if not has_access:
            return jsonify({
                'success': False,
                'message': 'Access denied to this test'
            }), 403
        
        # Process questions and calculate results
        results = []
        total_score = 0
        correct_answers = 0
        print("data : ",data)
        for i, question in enumerate(test['questions']):
            if question.get('question_type') == 'mcq':
                # Handle MCQ question
                print("question : ",question)
                id = question.get('id') or question.get('_id')
                answer_key = f'answer_{id}'
                print("answerkey:", answer_key)
                if answer_key in data:
                    student_answer = data[answer_key]
                    correct_answer = question.get('answer', '')
                    print("student_data : ",student_answer," Correct_answer : ",correct_answer)
                    is_correct = student_answer == correct_answer
                    score = 1 if is_correct else 0
                    
                    if is_correct:
                        correct_answers += 1
                    total_score += score
                    
                    results.append({
                        'question_index': i,
                        'question': question['question'],
                        'question_type': 'mcq',
                        'student_answer': student_answer,
                        'correct_answer': correct_answer,
                        'is_correct': is_correct,
                        'score': score
                    })
            else:
                # Handle audio question (Listening or Speaking)
                audio_key = f'question_{i}'
                if audio_key not in files:
                    return jsonify({
                        'success': False,
                        'message': f'Audio recording for question {i+1} is required'
                    }), 400
                
                audio_file = files[audio_key]
                
                # Save student audio to S3
                student_audio_key = f"student_audio/{current_user_id}/{test_id}/{uuid.uuid4()}.wav"
                s3_client.upload_fileobj(audio_file, S3_BUCKET_NAME, student_audio_key)
                
                # Download for transcription
                temp_audio_path = f"temp_student_{uuid.uuid4()}.wav"
                s3_client.download_file(S3_BUCKET_NAME, student_audio_key, temp_audio_path)
                
                # Transcribe student audio
                student_text = transcribe_audio(temp_audio_path)
                os.remove(temp_audio_path)
                
                # Get the original text to compare against
                original_text = question.get('question') or question.get('sentence', '')
                
                # Calculate similarity score
                similarity_score = calculate_similarity_score(original_text, student_text)
                
                # Determine if answer is correct based on module type
                is_correct = False
                score = 0
                
                if test.get('module_id') == 'LISTENING':
                    # For listening, check if similarity is above threshold
                    threshold = question.get('transcript_validation', {}).get('tolerance', 0.8)
                    is_correct = similarity_score >= threshold
                    score = similarity_score
                elif test.get('module_id') == 'SPEAKING':
                    # For speaking, similar logic but with different threshold
                    threshold = question.get('transcript_validation', {}).get('tolerance', 0.7)
                    is_correct = similarity_score >= threshold
                    score = similarity_score
                
                if is_correct:
                    correct_answers += 1
                total_score += score
                
                results.append({
                    'question_index': i,
                    'question': question['question'],
                    'question_type': 'audio',
                    'student_audio_url': student_audio_key,
                    'student_text': student_text,
                    'original_text': original_text,
                    'similarity_score': similarity_score,
                    'is_correct': is_correct,
                    'score': score
                })
        
        # Calculate average score
        average_score = total_score / len(test['questions']) if test['questions'] else 0
        
        # Save test result
        result_doc = {
            'test_id': test_id,
            'student_id': current_user_id,
            'results': results,
            'total_score': total_score,
            'average_score': average_score,
            'correct_answers': correct_answers,
            'total_questions': len(test['questions']),
            'submitted_at': datetime.utcnow(),
            'test_type': 'practice'
        }
        
        mongo_db.student_test_attempts.insert_one(result_doc)
        
        return jsonify({
            'success': True,
            'message': 'Test submitted successfully',
            'data': {
                'total_score': total_score,
                'average_score': average_score,
                'correct_answers': correct_answers,
                'total_questions': len(test['questions'])
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error submitting practice test: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Failed to submit test: {str(e)}'
        }), 500

@test_management_bp.route('/submit-technical-test', methods=['POST'])
@jwt_required()
def submit_technical_test():
    """Submit technical test with compiler integration"""
    try:
        data = request.get_json()
        test_id = data.get('test_id')
        answers = data.get('answers', {})
        results = data.get('results', {})
        
        if not test_id:
            return jsonify({'success': False, 'message': 'Test ID is required'}), 400
        
        # Get test details
        test = mongo_db.tests.find_one({'_id': ObjectId(test_id)})
        if not test:
            return jsonify({'success': False, 'message': 'Test not found'}), 404
        
        # Calculate scores
        total_questions = len(test.get('questions', []))
        correct_answers = 0
        total_score = 0
        
        for question_index, result in results.items():
            if result.get('passed'):
                correct_answers += 1
                total_score += result.get('score', 100)
        
        # Calculate percentage
        percentage = (total_score / (total_questions * 100)) * 100 if total_questions > 0 else 0
        
        # Determine pass/fail
        passing_score = test.get('passing_score', 70)
        passed = percentage >= passing_score
        
        # Create result document
        result_doc = {
            'test_id': ObjectId(test_id),
            'student_id': get_jwt_identity(),
            'answers': answers,
            'results': results,
            'total_questions': total_questions,
            'correct_answers': correct_answers,
            'total_score': total_score,
            'percentage': percentage,
            'passed': passed,
            'submitted_at': datetime.utcnow(),
            'test_type': 'technical'
        }
        
        # Insert result
        result_id = mongo_db.test_results.insert_one(result_doc).inserted_id
        
        # Update test usage statistics
        for question_index, answer in answers.items():
            if int(question_index) < len(test.get('questions', [])):
                question_id = test['questions'][int(question_index)].get('_id')
                if question_id:
                    # Update question usage
                    mongo_db.question_bank.update_one(
                        {'_id': ObjectId(question_id)},
                        {
                            '$inc': {'used_count': 1},
                            '$set': {'last_used': datetime.utcnow()},
                            '$addToSet': {'used_in_tests': test_id}
                        }
                    )
        
        return jsonify({
            'success': True,
            'message': 'Technical test submitted successfully',
            'data': {
                'result_id': str(result_id),
                'total_questions': total_questions,
                'correct_answers': correct_answers,
                'percentage': percentage,
                'passed': passed
            }
        }), 201
        
    except Exception as e:
        current_app.logger.error(f"Error submitting technical test: {e}")
        return jsonify({'success': False, 'message': f'Failed to submit test: {str(e)}'}), 500

# ==================== TECHNICAL TEST ENDPOINTS ====================

@test_management_bp.route('/run-code', methods=['POST'])
@jwt_required()
def run_code():
    """Run code using OneCompiler API"""
    try:
        data = request.get_json()
        code = data.get('code')
        language = data.get('language', 'python')
        test_cases = data.get('test_cases', [])
        stdin = data.get('stdin', '')
        
        if not code:
            return jsonify({'success': False, 'message': 'Code is required'}), 400
        
        # Prepare the request for OneCompiler API
        headers = {
            'X-RapidAPI-Key': ONECOMPILER_API_KEY,
            'X-RapidAPI-Host': ONECOMPILER_API_HOST,
            'Content-Type': 'application/json'
        }
        
        # Create the request body
        request_body = {
            'language': language,
            'stdin': stdin,
            'files': [{'name': f'main.{get_file_extension(language)}', 'content': code}]
        }
        
        # Add test cases if provided
        if test_cases and isinstance(test_cases, list):
            stdin_data = '\n'.join(test_cases)
            request_body['stdin'] = stdin_data
        elif stdin:
            request_body['stdin'] = stdin
        
        current_app.logger.info(f"Running code with language: {language}, stdin: {stdin[:100]}...")
        
        # Make the API call
        response = requests.post(
            'https://onecompiler-apis.p.rapidapi.com/api/v1/run',
            headers=headers,
            json=request_body,
            timeout=30  # Add timeout
        )
        
        if response.status_code == 200:
            result = response.json()
            
            # Check for compilation errors
            if result.get('stderr'):
                return jsonify({
                    'success': False,
                    'message': 'Compilation error',
                    'data': {
                        'stdout': result.get('stdout', ''),
                        'stderr': result.get('stderr', ''),
                        'executionTime': result.get('executionTime', 0)
                    }
                }), 200
            
            return jsonify({
                'success': True,
                'data': {
                    'stdout': result.get('stdout', ''),
                    'stderr': result.get('stderr', ''),
                    'executionTime': result.get('executionTime', 0),
                    'memory': result.get('memory', 0)
                }
            }), 200
        else:
            current_app.logger.error(f"OneCompiler API error: {response.status_code} - {response.text}")
            return jsonify({
                'success': False,
                'message': f'Code execution failed: {response.text}'
            }), 500
            
    except requests.exceptions.Timeout:
        current_app.logger.error("Code execution timeout")
        return jsonify({
            'success': False,
            'message': 'Code execution timed out. Please try again.'
        }), 500
    except Exception as e:
        current_app.logger.error(f"Error running code: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Failed to run code: {str(e)}'
        }), 500

def get_file_extension(language):
    """Get file extension for programming language"""
    extensions = {
        'python': 'py',
        'javascript': 'js',
        'java': 'java',
        'cpp': 'cpp',
        'c': 'c'
    }
    return extensions.get(language.lower(), 'txt')

# ==================== TRANSCRIPT VALIDATION ENDPOINTS ====================

@test_management_bp.route('/validate-transcript', methods=['POST'])
@jwt_required()
def validate_transcript():
    """Validate student transcript against original text"""
    try:
        data = request.get_json()
        original_text = data.get('original_text')
        student_text = data.get('student_text')
        tolerance = data.get('tolerance', 0.8)
        
        if not original_text or not student_text:
            return jsonify({
                'success': False,
                'message': 'Original text and student text are required'
            }), 400
        
        # Calculate similarity score
        similarity_score = calculate_similarity_score(original_text, student_text)
        
        # Determine if transcript is valid
        is_valid = similarity_score >= tolerance
        
        return jsonify({
            'success': True,
            'data': {
                'similarity_score': similarity_score,
                'is_valid': is_valid,
                'tolerance': tolerance,
                'original_text': original_text,
                'student_text': student_text
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error validating transcript: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Failed to validate transcript: {str(e)}'
        }), 500

@test_management_bp.route('/transcribe-audio', methods=['POST'])
@jwt_required()
def transcribe_audio():
    """Transcribe uploaded audio file"""
    try:
        if 'audio' not in request.files:
            return jsonify({
                'success': False,
                'message': 'Audio file is required'
            }), 400
        
        audio_file = request.files['audio']
        
        # Save audio file temporarily
        temp_path = f"temp_audio_{uuid.uuid4()}.wav"
        audio_file.save(temp_path)
        
        try:
            # Transcribe the audio
            transcribed_text = transcribe_audio(temp_path)
            
            return jsonify({
                'success': True,
                'data': {
                    'transcribed_text': transcribed_text
                }
            }), 200
            
        finally:
            # Clean up temporary file
            if os.path.exists(temp_path):
                os.remove(temp_path)
        
    except Exception as e:
        current_app.logger.error(f"Error transcribing audio: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Failed to transcribe audio: {str(e)}'
        }), 500

# ==================== CRT TOPICS ENDPOINTS ====================

@test_management_bp.route('/crt-topics', methods=['GET'])
@jwt_required()
@require_superadmin
def get_crt_topics():
    """Get all CRT topics with completion statistics"""
    try:
        topics = list(mongo_db.crt_topics.find({}).sort('created_at', -1))
        
        for topic in topics:
            topic_id = topic['_id']
            
            # Count total questions for this topic
            total_questions = mongo_db.question_bank.count_documents({
                'topic_id': topic_id,
                'module_id': {'$in': ['CRT_APTITUDE', 'CRT_REASONING', 'CRT_TECHNICAL']}
            })
            
            # Count questions used in tests
            used_questions = mongo_db.question_bank.count_documents({
                'topic_id': topic_id,
                'module_id': {'$in': ['CRT_APTITUDE', 'CRT_REASONING', 'CRT_TECHNICAL']},
                'used_count': {'$gt': 0}
            })
            
            # Calculate completion percentage
            completion_percentage = (used_questions / total_questions * 100) if total_questions > 0 else 0
            
            topic['_id'] = str(topic['_id'])
            topic['total_questions'] = total_questions
            topic['used_questions'] = used_questions
            topic['completion_percentage'] = round(completion_percentage, 1)
            topic['created_at'] = topic['created_at'].isoformat() if topic['created_at'] else None
        
        return jsonify({
            'success': True,
            'data': topics
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error fetching CRT topics: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Failed to fetch CRT topics: {str(e)}'
        }), 500

@test_management_bp.route('/crt-topics', methods=['POST'])
@jwt_required()
@require_superadmin
def create_crt_topic():
    """Create a new CRT topic"""
    try:
        data = request.get_json()
        topic_name = data.get('topic_name')
        module_id = data.get('module_id')
        
        if not topic_name or not topic_name.strip():
            return jsonify({
                'success': False,
                'message': 'Topic name is required'
            }), 400
        
        if not module_id:
            return jsonify({
                'success': False,
                'message': 'Module ID is required'
            }), 400
        
        # Validate module_id is a valid CRT module
        valid_crt_modules = ['CRT_APTITUDE', 'CRT_REASONING', 'CRT_TECHNICAL']
        if module_id not in valid_crt_modules:
            return jsonify({
                'success': False,
                'message': f'Invalid module ID. Must be one of: {", ".join(valid_crt_modules)}'
            }), 400
        
        # Check if topic name already exists for this module
        existing_topic = mongo_db.crt_topics.find_one({
            'topic_name': topic_name.strip(),
            'module_id': module_id
        })
        
        if existing_topic:
            return jsonify({
                'success': False,
                'message': f'Topic "{topic_name}" already exists for this module'
            }), 400
        
        # Create new topic
        topic_doc = {
            'topic_name': topic_name.strip(),
            'module_id': module_id,
            'created_at': datetime.utcnow(),
            'created_by': get_jwt_identity()
        }
        
        result = mongo_db.crt_topics.insert_one(topic_doc)
        
        # Return the created topic with ID as string
        topic_doc['_id'] = str(result.inserted_id)
        topic_doc['created_at'] = topic_doc['created_at'].isoformat()
        topic_doc['total_questions'] = 0
        topic_doc['used_questions'] = 0
        topic_doc['completion_percentage'] = 0.0
        
        return jsonify({
            'success': True,
            'message': 'Topic created successfully',
            'data': topic_doc
        }), 201
        
    except Exception as e:
        current_app.logger.error(f"Error creating CRT topic: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Failed to create topic: {str(e)}'
        }), 500

@test_management_bp.route('/crt-topics/<topic_id>', methods=['GET'])
@jwt_required()
@require_superadmin
def get_crt_topic(topic_id):
    """Get a specific CRT topic by ID"""
    try:
        topic = mongo_db.crt_topics.find_one({'_id': ObjectId(topic_id)})
        
        if not topic:
            return jsonify({
                'success': False,
                'message': 'Topic not found'
            }), 404
        
        # Convert ObjectId to string
        topic['_id'] = str(topic['_id'])
        topic['created_at'] = topic['created_at'].isoformat() if topic['created_at'] else None
        
        return jsonify({
            'success': True,
            'data': topic
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error fetching CRT topic: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Failed to fetch topic: {str(e)}'
        }), 500

@test_management_bp.route('/crt-topics/<topic_id>', methods=['PUT'])
@jwt_required()
@require_superadmin
def update_crt_topic(topic_id):
    """Update a CRT topic"""
    try:
        data = request.get_json()
        topic_name = data.get('topic_name')
        
        if not topic_name or not topic_name.strip():
            return jsonify({
                'success': False,
                'message': 'Topic name is required'
            }), 400
        
        # Check if topic exists
        existing_topic = mongo_db.crt_topics.find_one({'_id': ObjectId(topic_id)})
        if not existing_topic:
            return jsonify({
                'success': False,
                'message': 'Topic not found'
            }), 404
        
        # Check if new name already exists for the same module
        duplicate_topic = mongo_db.crt_topics.find_one({
            'topic_name': topic_name.strip(),
            'module_id': existing_topic['module_id'],
            '_id': {'$ne': ObjectId(topic_id)}
        })
        
        if duplicate_topic:
            return jsonify({
                'success': False,
                'message': f'Topic "{topic_name}" already exists for this module'
            }), 400
        
        # Update the topic
        result = mongo_db.crt_topics.update_one(
            {'_id': ObjectId(topic_id)},
            {
                '$set': {
                    'topic_name': topic_name.strip(),
                    'updated_at': datetime.utcnow()
                }
            }
        )
        
        if result.modified_count == 0:
            return jsonify({
                'success': False,
                'message': 'No changes made to topic'
            }), 400
        
        return jsonify({
            'success': True,
            'message': 'Topic updated successfully'
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error updating CRT topic: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Failed to update topic: {str(e)}'
        }), 500

@test_management_bp.route('/crt-topics/<topic_id>', methods=['DELETE'])
@jwt_required()
@require_superadmin
def delete_crt_topic(topic_id):
    """Delete a CRT topic"""
    try:
        # Check if topic exists
        existing_topic = mongo_db.crt_topics.find_one({'_id': ObjectId(topic_id)})
        if not existing_topic:
            return jsonify({
                'success': False,
                'message': 'Topic not found'
            }), 404
        
        # Check if topic has questions
        question_count = mongo_db.question_bank.count_documents({
            'topic_id': ObjectId(topic_id)
        })
        
        if question_count > 0:
            return jsonify({
                'success': False,
                'message': f'Cannot delete topic. It has {question_count} questions associated with it. Please remove or reassign the questions first.'
            }), 400
        
        # Delete the topic
        result = mongo_db.crt_topics.delete_one({'_id': ObjectId(topic_id)})
        
        if result.deleted_count == 0:
            return jsonify({
                'success': False,
                'message': 'Failed to delete topic'
            }), 500
        
        return jsonify({
            'success': True,
            'message': 'Topic deleted successfully'
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error deleting CRT topic: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Failed to delete topic: {str(e)}'
        }), 500



@test_management_bp.route('/crt-topics/<topic_id>/questions', methods=['GET'])
@jwt_required()
@require_superadmin
def get_topic_questions(topic_id):
    """Get questions from a specific CRT topic"""
    try:
        # Check if topic exists
        topic = mongo_db.crt_topics.find_one({'_id': ObjectId(topic_id)})
        if not topic:
            return jsonify({
                'success': False,
                'message': 'Topic not found'
            }), 404
        
        # Get questions for this topic
        questions = list(mongo_db.question_bank.find({
            'topic_id': ObjectId(topic_id)
        }).sort('created_at', -1))
        
        # Convert ObjectIds to strings
        for question in questions:
            question['_id'] = str(question['_id'])
            if question.get('topic_id'):
                question['topic_id'] = str(question['topic_id'])
            if question.get('created_at'):
                question['created_at'] = question['created_at'].isoformat()
        
        return jsonify({
            'success': True,
            'data': questions,
            'topic': {
                'id': str(topic['_id']),
                'name': topic['topic_name'],
                'description': topic.get('description', ''),
                'module_id': topic['module_id']
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error fetching topic questions: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Failed to fetch topic questions: {str(e)}'
        }), 500

@test_management_bp.route('/crt-modules/separate', methods=['POST'])
@jwt_required()
@require_superadmin
def separate_crt_modules():
    """Separate CRT modules into distinct categories for better organization"""
    try:
        data = request.get_json()
        module_id = data.get('module_id')
        
        if not module_id or not module_id.startswith('CRT_'):
            return jsonify({'success': False, 'message': 'Invalid CRT module ID'}), 400
        
        # Define CRT module categories
        crt_categories = {
            'CRT_APTITUDE': {
                'name': 'Aptitude',
                'description': 'Mathematical and logical reasoning questions',
                'subcategories': ['Numbers', 'Algebra', 'Geometry', 'Data Interpretation']
            },
            'CRT_REASONING': {
                'name': 'Reasoning',
                'description': 'Logical and analytical reasoning questions',
                'subcategories': ['Verbal', 'Non-Verbal', 'Analytical', 'Critical Thinking']
            },
            'CRT_TECHNICAL': {
                'name': 'Technical',
                'description': 'Technical and domain-specific questions',
                'subcategories': ['Programming', 'Database', 'Networking', 'System Design']
            }
        }
        
        if module_id not in crt_categories:
            return jsonify({'success': False, 'message': f'Invalid CRT module: {module_id}'}), 400
        
        category_info = crt_categories[module_id]
        
        # Get questions for this CRT module
        questions = list(mongo_db.question_bank.find({'module_id': module_id}))
        
        # Group questions by subcategory if available
        grouped_questions = {}
        for question in questions:
            subcategory = question.get('subcategory', 'General')
            if subcategory not in grouped_questions:
                grouped_questions[subcategory] = []
            grouped_questions[subcategory].append(question)
        
        return jsonify({
            'success': True,
            'module_id': module_id,
            'category_info': category_info,
            'total_questions': len(questions),
            'grouped_questions': grouped_questions,
            'subcategories': list(grouped_questions.keys())
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error separating CRT modules: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@test_management_bp.route('/crt-topics/<topic_id>/questions', methods=['POST'])
@jwt_required()
@require_superadmin
def add_questions_to_topic(topic_id):
    """Add questions to a specific CRT topic"""
    try:
        data = request.get_json()
        questions = data.get('questions', [])
        
        if not questions:
            return jsonify({
                'success': False,
                'message': 'Questions are required'
            }), 400
        
        # Check if topic exists
        topic = mongo_db.crt_topics.find_one({'_id': ObjectId(topic_id)})
        if not topic:
            return jsonify({
                'success': False,
                'message': 'Topic not found'
            }), 404
        
        # Process and insert questions
        processed_questions = []
        for question in questions:
            # Add topic_id to each question
            question['topic_id'] = ObjectId(topic_id)
            question['created_at'] = datetime.utcnow()
            question['used_count'] = 0
            
            # Ensure module_id matches the topic's module
            if 'module_id' not in question or question['module_id'] != topic['module_id']:
                question['module_id'] = topic['module_id']
            
            # Handle question type for technical questions
            if topic['module_id'] == 'CRT_TECHNICAL':
                question_type = question.get('questionType', 'compiler_integrated')
                question['question_type'] = question_type
                
                if question_type == 'compiler_integrated':
                    # Ensure technical fields are present
                    if 'testCases' not in question:
                        question['testCases'] = ''
                    if 'expectedOutput' not in question:
                        question['expectedOutput'] = ''
                    if 'language' not in question:
                        question['language'] = 'python'
                elif question_type == 'mcq':
                    # Ensure MCQ fields are present
                    if 'optionA' not in question:
                        question['optionA'] = ''
                    if 'optionB' not in question:
                        question['optionB'] = ''
                    if 'optionC' not in question:
                        question['optionC'] = ''
                    if 'optionD' not in question:
                        question['optionD'] = ''
                    if 'answer' not in question:
                        question['answer'] = ''
            
            processed_questions.append(question)
        
        # Insert questions into question bank
        if processed_questions:
            result = mongo_db.question_bank.insert_many(processed_questions)
            
            return jsonify({
                'success': True,
                'message': f'Successfully added {len(result.inserted_ids)} questions to topic',
                'data': {
                    'inserted_count': len(result.inserted_ids),
                    'topic_id': topic_id,
                    'topic_name': topic['topic_name']
                }
            }), 201
        else:
            return jsonify({
                'success': False,
                'message': 'No valid questions to add'
            }), 400
        
    except Exception as e:
        current_app.logger.error(f"Error adding questions to topic: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Failed to add questions to topic: {str(e)}'
        }), 500

# ==================== UPLOADED FILES ENDPOINTS ====================

@test_management_bp.route('/uploaded-files', methods=['GET'])
@jwt_required()
@require_superadmin
def get_uploaded_files():
    """Get all uploaded files with metadata"""
    try:
        # Get files from question_bank collection grouped by upload session
        pipeline = [
            {
                '$group': {
                    '_id': '$upload_session_id',
                    'module_id': {'$first': '$module_id'},
                    'level_id': {'$first': '$level_id'},
                    'topic_id': {'$first': '$topic_id'},
                    'question_count': {'$sum': 1},
                    'uploaded_at': {'$first': '$created_at'},
                    'file_name': {'$first': '$file_name'}
                }
            },
            {
                '$sort': {'uploaded_at': -1}
            }
        ]
        
        files = list(mongo_db.question_bank.aggregate(pipeline))
        
        # Convert ObjectIds to strings and format dates
        for file in files:
            file['_id'] = str(file['_id'])
            if file.get('topic_id'):
                file['topic_id'] = str(file['topic_id'])
            if file.get('uploaded_at'):
                file['uploaded_at'] = file['uploaded_at'].isoformat()
        
        return jsonify({
            'success': True,
            'data': files
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error fetching uploaded files: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Failed to fetch uploaded files: {str(e)}'
        }), 500

@test_management_bp.route('/uploaded-files/<file_id>/questions', methods=['GET'])
@jwt_required()
@require_superadmin
def get_file_questions(file_id):
    """Get questions from a specific uploaded file"""
    try:
        # Find questions by upload session ID
        questions = list(mongo_db.question_bank.find({
            'upload_session_id': file_id
        }).sort('created_at', -1))
        
        # Convert ObjectIds to strings
        for question in questions:
            question['_id'] = str(question['_id'])
            if question.get('topic_id'):
                question['topic_id'] = str(question['topic_id'])
            if question.get('created_at'):
                question['created_at'] = question['created_at'].isoformat()
        
        return jsonify({
            'success': True,
            'data': questions
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error fetching file questions: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Failed to fetch file questions: {str(e)}'
        }), 500

@test_management_bp.route('/uploaded-files/<file_id>/questions', methods=['POST'])
@jwt_required()
@require_superadmin
def add_question_to_file(file_id):
    """Add a single question to an uploaded file"""
    try:
        data = request.get_json()
        
        # Get the file metadata to ensure consistency
        file_metadata = mongo_db.question_bank.find_one({'upload_session_id': file_id})
        if not file_metadata:
            return jsonify({
                'success': False,
                'message': 'File not found'
            }), 404
        
        # Add the question with the same metadata
        question_data = {
            **data,
            'upload_session_id': file_id,
            'module_id': file_metadata.get('module_id'),
            'level_id': file_metadata.get('level_id'),
            'topic_id': file_metadata.get('topic_id'),
            'created_at': datetime.utcnow(),
            'used_count': 0
        }
        
        result = mongo_db.question_bank.insert_one(question_data)
        
        return jsonify({
            'success': True,
            'message': 'Question added successfully',
            'data': {
                'question_id': str(result.inserted_id)
            }
        }), 201
        
    except Exception as e:
        current_app.logger.error(f"Error adding question to file: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Failed to add question: {str(e)}'
        }), 500

# ==================== QUESTIONS MANAGEMENT ENDPOINTS ====================

@test_management_bp.route('/questions', methods=['GET'])
@jwt_required()
@require_superadmin
def get_questions():
    """Get questions for a specific module and level"""
    try:
        module_id = request.args.get('module_id')
        level_id = request.args.get('level_id')
        
        if not module_id or not level_id:
            return jsonify({'success': False, 'message': 'module_id and level_id are required'}), 400
        
        # Build query
        query = {
            'module_id': module_id,
            'level_id': level_id
        }
        
        # Get questions from question_bank collection
        questions = list(mongo_db.question_bank.find(query))
        
        # Convert ObjectIds to strings
        for question in questions:
            question['_id'] = str(question['_id'])
            if 'created_at' not in question:
                question['created_at'] = question.get('uploaded_at', datetime.now())
        
        return jsonify({
            'success': True,
            'data': questions
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error fetching questions: {e}")
        return jsonify({'success': False, 'message': f'Failed to fetch questions: {str(e)}'}), 500

@test_management_bp.route('/questions/add', methods=['POST'])
@jwt_required()
@require_superadmin
def add_question():
    """Add a single question to the question bank"""
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['question', 'module_id']
        for field in required_fields:
            if not data.get(field):
                return jsonify({
                    'success': False,
                    'message': f'{field} is required'
                }), 400
        
        # Add metadata
        question_data = {
            **data,
            'created_at': datetime.utcnow(),
            'used_count': 0
        }
        
        # Generate upload session ID if not provided
        if 'upload_session_id' not in question_data:
            question_data['upload_session_id'] = str(uuid.uuid4())
        
        result = mongo_db.question_bank.insert_one(question_data)
        
        return jsonify({
            'success': True,
            'message': 'Question added successfully',
            'data': {
                'question_id': str(result.inserted_id)
            }
        }), 201
        
    except Exception as e:
        current_app.logger.error(f"Error adding question: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Failed to add question: {str(e)}'
        }), 500

@test_management_bp.route('/questions/<question_id>', methods=['PUT'])
@jwt_required()
@require_superadmin
def update_question(question_id):
    """Update a question in the question bank"""
    try:
        data = request.get_json()
        
        # Check if question exists
        existing_question = mongo_db.question_bank.find_one({'_id': ObjectId(question_id)})
        if not existing_question:
            return jsonify({
                'success': False,
                'message': 'Question not found'
            }), 404
        
        # Update the question
        update_data = {
            **data,
            'updated_at': datetime.utcnow()
        }
        
        result = mongo_db.question_bank.update_one(
            {'_id': ObjectId(question_id)},
            {'$set': update_data}
        )
        
        if result.modified_count == 0:
            return jsonify({
                'success': False,
                'message': 'No changes made to question'
            }), 400
        
        return jsonify({
            'success': True,
            'message': 'Question updated successfully'
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error updating question: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Failed to update question: {str(e)}'
        }), 500

@test_management_bp.route('/questions/<question_id>', methods=['DELETE'])
@jwt_required()
@require_superadmin
def delete_question(question_id):
    """Delete a question from the question bank"""
    try:
        # Check if question exists
        existing_question = mongo_db.question_bank.find_one({'_id': ObjectId(question_id)})
        if not existing_question:
            return jsonify({
                'success': False,
                'message': 'Question not found'
            }), 404
        
        # Check if question is used in any tests
        if existing_question.get('used_count', 0) > 0:
            return jsonify({
                'success': False,
                'message': f'Cannot delete question. It has been used {existing_question["used_count"]} times in tests.'
            }), 400
        
        # Delete the question
        result = mongo_db.question_bank.delete_one({'_id': ObjectId(question_id)})
        
        if result.deleted_count == 0:
            return jsonify({
                'success': False,
                'message': 'Failed to delete question'
            }), 500
        
        return jsonify({
            'success': True,
            'message': 'Question deleted successfully'
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error deleting question: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Failed to delete question: {str(e)}'
        }), 500

@test_management_bp.route('/questions/bulk', methods=['DELETE'])
@jwt_required()
@require_superadmin
def bulk_delete_questions():
    """Bulk delete question bank items"""
    try:
        data = request.get_json()
        question_ids = data.get('ids', [])
        
        if not question_ids:
            return jsonify({'success': False, 'message': 'No question IDs provided'}), 400
        
        # Convert string IDs to ObjectIds
        object_ids = [ObjectId(qid) for qid in question_ids]
        
        result = mongo_db.question_bank.delete_many({'_id': {'$in': object_ids}})
        
        return jsonify({
            'success': True,
            'message': f'{result.deleted_count} questions deleted successfully'
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error bulk deleting questions: {e}")
        return jsonify({'success': False, 'message': f'Failed to delete questions: {str(e)}'}), 500

@test_management_bp.route('/technical-questions', methods=['GET'])
@jwt_required()
def get_technical_questions():
    """Get technical questions with compiler integration details"""
    try:
        module_id = request.args.get('module_id')
        level_id = request.args.get('level_id')
        topic_id = request.args.get('topic_id')
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 20))
        
        if not module_id:
            return jsonify({'success': False, 'message': 'Module ID is required'}), 400
        
        # Build query
        query = {'module_id': module_id}
        
        if level_id:
            query['level_id'] = level_id
            
        if topic_id and topic_id.strip():
            try:
                if len(topic_id) == 24 and all(c in '0123456789abcdef' for c in topic_id.lower()):
                    query['topic_id'] = ObjectId(topic_id)
                else:
                    topic_name = topic_id.split('(')[0].strip()
                    topic = mongo_db.crt_topics.find_one({'topic_name': topic_name})
                    if topic:
                        query['topic_id'] = topic['_id']
            except Exception as e:
                current_app.logger.error(f"Error processing topic_id {topic_id}: {e}")
        
        # Get questions with pagination
        skip = (page - 1) * limit
        questions = list(mongo_db.question_bank.find(query).skip(skip).limit(limit))
        
        # Convert ObjectIds to strings and format for frontend
        formatted_questions = []
        for question in questions:
            formatted_question = {
                'id': str(question['_id']),
                'question': question.get('question', ''),
                'question_type': question.get('question_type', 'mcq'),
                'instructions': question.get('instructions', ''),
                'created_at': question.get('created_at', ''),
                'used_count': question.get('used_count', 0)
            }
            
            # Add compiler-specific fields for technical questions
            if question.get('question_type') == 'compiler_integrated':
                formatted_question.update({
                    'testCases': question.get('testCases', ''),
                    'expectedOutput': question.get('expectedOutput', ''),
                    'language': question.get('language', 'python'),
                    'testCaseId': question.get('testCaseId', '')
                })
            else:
                # Add MCQ fields
                formatted_question.update({
                    'optionA': question.get('optionA', ''),
                    'optionB': question.get('optionB', ''),
                    'optionC': question.get('optionC', ''),
                    'optionD': question.get('optionD', ''),
                    'answer': question.get('answer', '')
                })
            
            if 'topic_id' in question:
                formatted_question['topic_id'] = str(question['topic_id'])
                
            formatted_questions.append(formatted_question)
        
        # Get total count
        total_count = mongo_db.question_bank.count_documents(query)
        
        return jsonify({
            'success': True,
            'questions': formatted_questions,
            'total_count': total_count,
            'current_page': page,
            'total_pages': (total_count + limit - 1) // limit,
            'has_more': (page * limit) < total_count
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting technical questions: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

# ==================== FILE UPLOAD ENDPOINTS FOR ORGANIZED QUESTION BANK ====================

@test_management_bp.route('/upload-questions', methods=['POST'])
@jwt_required()
@require_superadmin
def upload_questions():
    """Upload MCQ questions from file"""
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'message': 'No file uploaded'}), 400
        
        file = request.files['file']
        module_id = request.form.get('module_id')
        level_id = request.form.get('level_id')
        question_type = request.form.get('question_type', 'mcq')
        
        if not file or file.filename == '':
            return jsonify({'success': False, 'message': 'No file selected'}), 400
        
        if not module_id or not level_id:
            return jsonify({'success': False, 'message': 'module_id and level_id are required'}), 400
        
        # Read and parse the file
        content = file.read().decode('utf-8')
        questions = []
        
        if file.filename.endswith('.csv'):
            import csv
            import io
            csv_reader = csv.DictReader(io.StringIO(content))
            for row in csv_reader:
                question = {
                    'question': row.get('Question', row.get('question', '')),
                    'optionA': row.get('OptionA', row.get('A', '')),
                    'optionB': row.get('OptionB', row.get('B', '')),
                    'optionC': row.get('OptionC', row.get('C', '')),
                    'optionD': row.get('OptionD', row.get('D', '')),
                    'answer': row.get('Answer', row.get('answer', '')),
                    'instructions': row.get('Instructions', row.get('instructions', ''))
                }
                questions.append(question)
        elif file.filename.endswith('.txt'):
            # Parse human-readable format
            lines = content.split('\n')
            current_question = None
            
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                
                if line[0].isdigit() and '. ' in line:
                    # New question
                    if current_question:
                        questions.append(current_question)
                    current_question = {
                        'question': line.split('. ', 1)[1],
                        'optionA': '',
                        'optionB': '',
                        'optionC': '',
                        'optionD': '',
                        'answer': ''
                    }
                elif line.startswith('A)') and current_question:
                    current_question['optionA'] = line[2:].strip()
                elif line.startswith('B)') and current_question:
                    current_question['optionB'] = line[2:].strip()
                elif line.startswith('C)') and current_question:
                    current_question['optionC'] = line[2:].strip()
                elif line.startswith('D)') and current_question:
                    current_question['optionD'] = line[2:].strip()
                elif line.startswith('Answer:') and current_question:
                    current_question['answer'] = line[7:].strip()
            
            if current_question:
                questions.append(current_question)
        
        # Validate questions
        valid_questions = []
        for q in questions:
            if (q['question'] and q['optionA'] and q['optionB'] and 
                q['optionC'] and q['optionD'] and q['answer']):
                valid_questions.append(q)
        
        if not valid_questions:
            return jsonify({'success': False, 'message': 'No valid questions found in file'}), 400
        
        # Store questions in database
        upload_session_id = str(uuid.uuid4())
        inserted_count = 0
        
        for q in valid_questions:
            doc = {
                'module_id': module_id,
                'level_id': level_id,
                'question_type': question_type,
                'question': q['question'],
                'optionA': q['optionA'],
                'optionB': q['optionB'],
                'optionC': q['optionC'],
                'optionD': q['optionD'],
                'answer': q['answer'].upper(),
                'instructions': q.get('instructions', ''),
                'used_in_tests': [],
                'used_count': 0,
                'last_used': None,
                'created_at': datetime.utcnow(),
                'upload_session_id': upload_session_id
            }
            
            mongo_db.question_bank.insert_one(doc)
            inserted_count += 1
        
        return jsonify({
            'success': True,
            'message': f'Successfully uploaded {inserted_count} questions',
            'count': inserted_count
        }), 201
        
    except Exception as e:
        current_app.logger.error(f"Error uploading questions: {e}")
        return jsonify({'success': False, 'message': f'Upload failed: {str(e)}'}), 500

@test_management_bp.route('/upload-sentences', methods=['POST'])
@jwt_required()
@require_superadmin
def upload_sentences():
    """Upload sentence questions for listening/speaking modules"""
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'message': 'No file uploaded'}), 400
        
        file = request.files['file']
        module_id = request.form.get('module_id')
        level_id = request.form.get('level_id')
        module_type = request.form.get('module_type', 'LISTENING')
        
        if not file or file.filename == '':
            return jsonify({'success': False, 'message': 'No file selected'}), 400
        
        if not module_id or not level_id:
            return jsonify({'success': False, 'message': 'module_id and level_id are required'}), 400
        
        # Handle audio file if present
        audio_file = request.files.get('audio_file')
        audio_url = None
        
        if audio_file and module_type == 'LISTENING':
            # Upload audio to S3
            audio_filename = f"audio_{uuid.uuid4()}.{audio_file.filename.split('.')[-1]}"
            s3_key = f"audio/{module_id}/{level_id}/{audio_filename}"
            
            try:
                s3_client.upload_fileobj(audio_file, S3_BUCKET_NAME, s3_key)
                audio_url = f"https://{S3_BUCKET_NAME}.s3.amazonaws.com/{s3_key}"
            except Exception as e:
                current_app.logger.error(f"Error uploading audio: {e}")
                return jsonify({'success': False, 'message': 'Failed to upload audio file'}), 500
        
        # Parse configuration
        audio_config = json.loads(request.form.get('audio_config', '{}'))
        transcript_validation = json.loads(request.form.get('transcript_validation', '{}'))
        
        # Read and parse the file
        content = file.read().decode('utf-8')
        sentences = []
        
        if file.filename.endswith('.csv'):
            import csv
            import io
            csv_reader = csv.DictReader(io.StringIO(content))
            for row in csv_reader:
                sentence = {
                    'sentence': row.get('Sentence', row.get('sentence', '')),
                    'level': row.get('Level', row.get('level', '')),
                    'instructions': row.get('Instructions', row.get('instructions', ''))
                }
                sentences.append(sentence)
        elif file.filename.endswith('.txt'):
            # Parse text file - one sentence per line
            lines = content.split('\n')
            for line in lines:
                line = line.strip()
                if line:
                    sentences.append({
                        'sentence': line,
                        'level': 'Beginner',
                        'instructions': ''
                    })
        
        # Validate sentences
        valid_sentences = []
        for s in sentences:
            if s['sentence'] and len(s['sentence']) >= 10:
                valid_sentences.append(s)
        
        if not valid_sentences:
            return jsonify({'success': False, 'message': 'No valid sentences found in file'}), 400
        
        # Store sentences in database
        upload_session_id = str(uuid.uuid4())
        inserted_count = 0
        
        for s in valid_sentences:
            doc = {
                'module_id': module_id,
                'level_id': level_id,
                'question_type': 'sentence',
                'module_type': module_type,
                'sentence': s['sentence'],
                'level': s['level'],
                'instructions': s.get('instructions', ''),
                'audio_url': audio_url,
                'audio_config': audio_config,
                'transcript_validation': transcript_validation,
                'has_audio': bool(audio_url),
                'used_in_tests': [],
                'used_count': 0,
                'last_used': None,
                'created_at': datetime.utcnow(),
                'upload_session_id': upload_session_id
            }
            
            mongo_db.question_bank.insert_one(doc)
            inserted_count += 1
        
        return jsonify({
            'success': True,
            'message': f'Successfully uploaded {inserted_count} sentences',
            'count': inserted_count
        }), 201
        
    except Exception as e:
        current_app.logger.error(f"Error uploading sentences: {e}")
        return jsonify({'success': False, 'message': f'Upload failed: {str(e)}'}), 500

@test_management_bp.route('/upload-paragraphs', methods=['POST'])
@jwt_required()
@require_superadmin
def upload_paragraphs():
    """Upload paragraph questions for writing module"""
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'message': 'No file uploaded'}), 400
        
        file = request.files['file']
        module_id = request.form.get('module_id')
        level_id = request.form.get('level_id')
        
        if not file or file.filename == '':
            return jsonify({'success': False, 'message': 'No file selected'}), 400
        
        if not module_id or not level_id:
            return jsonify({'success': False, 'message': 'module_id and level_id are required'}), 400
        
        # Parse writing configuration
        writing_config = json.loads(request.form.get('writing_config', '{}'))
        
        # Read and parse the file
        content = file.read().decode('utf-8')
        paragraphs = []
        
        if file.filename.endswith('.csv'):
            import csv
            import io
            csv_reader = csv.DictReader(io.StringIO(content))
            for row in csv_reader:
                paragraph = {
                    'topic': row.get('Topic', row.get('topic', '')),
                    'paragraph': row.get('Paragraph', row.get('paragraph', '')),
                    'level': row.get('Level', row.get('level', '')),
                    'instructions': row.get('Instructions', row.get('instructions', ''))
                }
                paragraphs.append(paragraph)
        elif file.filename.endswith('.txt'):
            # Parse text file - paragraphs separated by double newlines
            blocks = content.split('\n\n')
            for i, block in enumerate(blocks):
                block = block.strip()
                if block:
                    lines = block.split('\n')
                    topic = f"Topic {i+1}"
                    paragraph = block
                    
                    # Try to extract topic from first line
                    if lines and lines[0].startswith('Topic:'):
                        topic = lines[0].replace('Topic:', '').strip()
                        paragraph = '\n'.join(lines[1:]).strip()
                    
                    paragraphs.append({
                        'topic': topic,
                        'paragraph': paragraph,
                        'level': 'Beginner',
                        'instructions': ''
                    })
        
        # Validate paragraphs
        valid_paragraphs = []
        for p in paragraphs:
            if p['paragraph'] and len(p['paragraph']) >= 150:
                valid_paragraphs.append(p)
        
        if not valid_paragraphs:
            return jsonify({'success': False, 'message': 'No valid paragraphs found in file'}), 400
        
        # Store paragraphs in database
        upload_session_id = str(uuid.uuid4())
        inserted_count = 0
        
        for p in valid_paragraphs:
            doc = {
                'module_id': module_id,
                'level_id': level_id,
                'question_type': 'paragraph',
                'topic': p['topic'],
                'paragraph': p['paragraph'],
                'level': p['level'],
                'instructions': p.get('instructions', ''),
                'writing_config': writing_config,
                'used_in_tests': [],
                'used_count': 0,
                'last_used': None,
                'created_at': datetime.utcnow(),
                'upload_session_id': upload_session_id
            }
            
            mongo_db.question_bank.insert_one(doc)
            inserted_count += 1
        
        return jsonify({
            'success': True,
            'message': f'Successfully uploaded {inserted_count} paragraphs',
            'count': inserted_count
        }), 201
        
    except Exception as e:
        current_app.logger.error(f"Error uploading paragraphs: {e}")
        return jsonify({'success': False, 'message': f'Upload failed: {str(e)}'}), 500

@test_management_bp.route('/upload-technical-questions', methods=['POST'])
@jwt_required()
@require_superadmin
def upload_technical_questions():
    """Upload technical questions (MCQ + Compiler)"""
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'message': 'No file uploaded'}), 400
        
        file = request.files['file']
        module_id = request.form.get('module_id')
        level_id = request.form.get('level_id')
        question_type = request.form.get('question_type', 'compiler')
        language = request.form.get('language', 'python')
        
        if not file or file.filename == '':
            return jsonify({'success': False, 'message': 'No file selected'}), 400
        
        if not module_id or not level_id:
            return jsonify({'success': False, 'message': 'module_id and level_id are required'}), 400
        
        # Read and parse the file
        content = file.read().decode('utf-8')
        questions = []
        
        if file.filename.endswith('.csv'):
            import csv
            import io
            csv_reader = csv.DictReader(io.StringIO(content))
            for row in csv_reader:
                if question_type == 'compiler':
                    question = {
                        'questionTitle': row.get('QuestionTitle', row.get('title', '')),
                        'problemStatement': row.get('ProblemStatement', row.get('statement', '')),
                        'language': row.get('Language', row.get('language', language)),
                        'testCases': [],
                        'instructions': row.get('Instructions', row.get('instructions', ''))
                    }
                    
                    # Parse test cases
                    for i in range(1, 6):
                        input_key = f'TestCase{i}Input'
                        output_key = f'TestCase{i}Output'
                        if row.get(input_key) or row.get(output_key):
                            question['testCases'].append({
                                'id': i,
                                'input': row.get(input_key, ''),
                                'expectedOutput': row.get(output_key, '')
                            })
                else:
                    question = {
                        'question': row.get('Question', row.get('question', '')),
                        'optionA': row.get('OptionA', row.get('A', '')),
                        'optionB': row.get('OptionB', row.get('B', '')),
                        'optionC': row.get('OptionC', row.get('C', '')),
                        'optionD': row.get('OptionD', row.get('D', '')),
                        'answer': row.get('Answer', row.get('answer', '')),
                        'instructions': row.get('Instructions', row.get('instructions', ''))
                    }
                questions.append(question)
        
        # Validate questions
        valid_questions = []
        for q in questions:
            if question_type == 'compiler':
                if (q['questionTitle'] and q['problemStatement'] and 
                    q['language'] and q['testCases']):
                    valid_questions.append(q)
            else:
                if (q['question'] and q['optionA'] and q['optionB'] and 
                    q['optionC'] and q['optionD'] and q['answer']):
                    valid_questions.append(q)
        
        if not valid_questions:
            return jsonify({'success': False, 'message': 'No valid questions found in file'}), 400
        
        # Store questions in database
        upload_session_id = str(uuid.uuid4())
        inserted_count = 0
        
        for q in valid_questions:
            if question_type == 'compiler':
                doc = {
                    'module_id': module_id,
                    'level_id': level_id,
                    'question_type': 'compiler_integrated',
                    'questionTitle': q['questionTitle'],
                    'problemStatement': q['problemStatement'],
                    'language': q['language'],
                    'difficulty': q.get('difficulty', 'medium'),
                    'category': q.get('category', 'algorithms'),
                    'timeLimit': q.get('timeLimit', 30),
                    'memoryLimit': q.get('memoryLimit', 256),
                    'testCases': q['testCases'],
                    'instructions': q.get('instructions', ''),
                    'used_in_tests': [],
                    'used_count': 0,
                    'last_used': None,
                    'created_at': datetime.utcnow(),
                    'upload_session_id': upload_session_id
                }
                
                # Ensure testCases are properly formatted as array of objects
                if isinstance(doc['testCases'], list):
                    # Already in correct format
                    pass
                elif isinstance(doc['testCases'], str):
                    # Convert string format to array format
                    test_cases = []
                    lines = doc['testCases'].split('\n')
                    for i, line in enumerate(lines):
                        if line.strip():
                            test_cases.append({
                                'id': i + 1,
                                'input': line.strip(),
                                'expectedOutput': '',
                                'description': f'Test case {i + 1}'
                            })
                    doc['testCases'] = test_cases
            else:
                doc = {
                    'module_id': module_id,
                    'level_id': level_id,
                    'question_type': 'mcq',
                    'question': q['question'],
                    'optionA': q['optionA'],
                    'optionB': q['optionB'],
                    'optionC': q['optionC'],
                    'optionD': q['optionD'],
                    'answer': q['answer'].upper(),
                    'difficulty': q.get('difficulty', 'medium'),
                    'category': q.get('category', 'general'),
                    'explanation': q.get('explanation', ''),
                    'timeLimit': q.get('timeLimit', 2),
                    'instructions': q.get('instructions', ''),
                    'used_in_tests': [],
                    'used_count': 0,
                    'last_used': None,
                    'created_at': datetime.utcnow(),
                    'upload_session_id': upload_session_id
                }
            
            mongo_db.question_bank.insert_one(doc)
            inserted_count += 1
        
        return jsonify({
            'success': True,
            'message': f'Successfully uploaded {inserted_count} technical questions',
            'count': inserted_count
        }), 201
        
    except Exception as e:
        current_app.logger.error(f"Error uploading technical questions: {e}")
        return jsonify({'success': False, 'message': f'Upload failed: {str(e)}'}), 500

# ==================== MODULES AND LEVELS ENDPOINTS ====================

@test_management_bp.route('/modules', methods=['GET'])
@jwt_required()
@require_superadmin
def get_modules():
    """Get available modules with question counts"""
    try:
        modules = []
        
        # Define module configurations
        module_configs = {
            'GRAMMAR': {'name': 'Grammar', 'type': 'mcq'},
            'VOCABULARY': {'name': 'Vocabulary', 'type': 'mcq'},
            'READING': {'name': 'Reading', 'type': 'mcq'},
            'LISTENING': {'name': 'Listening', 'type': 'sentence'},
            'SPEAKING': {'name': 'Speaking', 'type': 'sentence'},
            'WRITING': {'name': 'Writing', 'type': 'paragraph'}
        }
        
        # Only return Versant modules (exclude CRT modules and Technical)
        versant_modules = ['GRAMMAR', 'VOCABULARY', 'READING', 'LISTENING', 'SPEAKING', 'WRITING']
        
        for module_id, config in module_configs.items():
            # Only include Versant modules
            if module_id in versant_modules:
                # Get question count for this module
                count = mongo_db.question_bank.count_documents({'module_id': module_id})
                
                modules.append({
                    'id': module_id,
                    'name': config['name'],
                    'type': config['type'],
                    'question_count': count
                })
        
        return jsonify({
            'success': True,
            'data': modules
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error fetching modules: {e}")
        return jsonify({'success': False, 'message': f'Failed to fetch modules: {str(e)}'}), 500

@test_management_bp.route('/levels', methods=['GET'])
@jwt_required()
@require_superadmin
def get_levels():
    """Get levels for a specific module"""
    try:
        module_id = request.args.get('module_id')
        
        if not module_id:
            return jsonify({'success': False, 'message': 'module_id is required'}), 400
        
        levels = []
        
        if module_id == 'GRAMMAR':
            # Grammar has specific categories
            grammar_categories = [
                {'id': 'NOUN', 'name': 'Noun'},
                {'id': 'PRONOUN', 'name': 'Pronoun'},
                {'id': 'ADJECTIVE', 'name': 'Adjective'},
                {'id': 'VERB', 'name': 'Verb'},
                {'id': 'ADVERB', 'name': 'Adverb'},
                {'id': 'CONJUNCTION', 'name': 'Conjunction'}
            ]
            
            for category in grammar_categories:
                count = mongo_db.question_bank.count_documents({
                    'module_id': module_id,
                    'level_id': category['id']
                })
                levels.append({
                    **category,
                    'question_count': count
                })
        else:
            # Other modules have standard levels
            standard_levels = [
                {'id': f'{module_id}_BEGINNER', 'name': 'Beginner'},
                {'id': f'{module_id}_INTERMEDIATE', 'name': 'Intermediate'},
                {'id': f'{module_id}_ADVANCED', 'name': 'Advanced'}
            ]
            
            for level in standard_levels:
                count = mongo_db.question_bank.count_documents({
                    'module_id': module_id,
                    'level_id': level['id']
                })
                levels.append({
                    **level,
                    'question_count': count
                })
        
        return jsonify({
            'success': True,
            'data': levels
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error fetching levels: {e}")
        return jsonify({'success': False, 'message': f'Failed to fetch levels: {str(e)}'}), 500

# ==================== TEST RESULT ENDPOINTS ====================

@test_management_bp.route('/get-test-result/<result_id>', methods=['GET'])
@jwt_required()
def get_test_result(result_id):
    """Get detailed test result by result ID"""
    try:
        current_user_id = get_jwt_identity()
        
        # Find the result document
        result = mongo_db.student_test_attempts.find_one({'_id': ObjectId(result_id)})
        if not result:
            return jsonify({'success': False, 'message': 'Test result not found'}), 404
        
        # Check if user has permission to view this result
        if str(result.get('student_id')) != str(current_user_id):
            # Check if user is admin
            user = mongo_db.find_user_by_id(current_user_id)
            if not user or user.get('role') not in ['superadmin', 'admin', 'campus_admin', 'course_admin']:
                return jsonify({'success': False, 'message': 'Access denied'}), 403
        
        # Get test details
        test = mongo_db.tests.find_one({'_id': ObjectId(result.get('test_id'))})
        if not test:
            return jsonify({'success': False, 'message': 'Test not found'}), 404
        
        # Process detailed results based on test type
        detailed_results = []
        
        if result.get('test_type') == 'practice':
            # For practice tests (audio/speaking/listening)
            for i, question_result in enumerate(result.get('results', [])):
                detailed_result = {
                    'question_index': i,
                    'question': question_result.get('question', ''),
                    'question_type': question_result.get('question_type', 'audio'),
                    'student_audio_url': question_result.get('student_audio_url', ''),
                    'student_text': question_result.get('student_text', ''),
                    'original_text': question_result.get('original_text', ''),
                    'similarity_score': question_result.get('similarity_score', 0),
                    'is_correct': question_result.get('is_correct', False),
                    'score': question_result.get('score', 0),
                    'missing_words': question_result.get('missing_words', []),
                    'extra_words': question_result.get('extra_words', [])
                }
                detailed_results.append(detailed_result)
        
        elif result.get('test_type') == 'technical':
            # For technical tests (compiler-integrated)
            for i, question_result in enumerate(result.get('results', [])):
                detailed_result = {
                    'question_index': i,
                    'question': question_result.get('question', ''),
                    'question_type': 'compiler_integrated',
                    'student_code': question_result.get('student_code', ''),
                    'language': question_result.get('language', ''),
                    'test_cases': question_result.get('test_cases', []),
                    'passed_test_cases': question_result.get('passed_test_cases', 0),
                    'total_test_cases': question_result.get('total_test_cases', 0),
                    'is_correct': question_result.get('passed', False),
                    'score': question_result.get('score', 0),
                    'execution_time': question_result.get('execution_time', 0),
                    'memory_used': question_result.get('memory_used', 0),
                    'compiler_output': question_result.get('compiler_output', ''),
                    'error_message': question_result.get('error_message', '')
                }
                detailed_results.append(detailed_result)
        
        elif result.get('test_type') == 'mcq':
            # For MCQ tests
            for i, question_result in enumerate(result.get('results', [])):
                detailed_result = {
                    'question_index': i,
                    'question': question_result.get('question', ''),
                    'question_type': 'mcq',
                    'options': question_result.get('options', {}),
                    'student_answer': question_result.get('student_answer', ''),
                    'correct_answer': question_result.get('correct_answer', ''),
                    'is_correct': question_result.get('is_correct', False),
                    'score': question_result.get('score', 0),
                    'explanation': question_result.get('explanation', '')
                }
                detailed_results.append(detailed_result)
        
        # Prepare the response
        response_data = {
            '_id': str(result['_id']),
            'test_id': str(result.get('test_id')),
            'test_name': test.get('name', ''),
            'module_id': test.get('module_id', ''),
            'module_name': test.get('module_id', ''),  # Will be converted to readable name
            'test_type': result.get('test_type', ''),
            'student_id': str(result.get('student_id')),
            'total_questions': result.get('total_questions', 0),
            'correct_answers': result.get('correct_answers', 0),
            'average_score': result.get('average_score', 0),
            'total_score': result.get('total_score', 0),
            'submitted_at': result.get('submitted_at', '').isoformat() if result.get('submitted_at') else '',
            'duration': result.get('duration', 0),
            'time_taken': result.get('time_taken', 0),
            'auto_submitted': result.get('auto_submitted', False),
            'cheat_detected': result.get('cheat_detected', False),
            'detailed_results': detailed_results
        }
        
        # Add student details if available
        student = mongo_db.users.find_one({'_id': ObjectId(result.get('student_id'))})
        if student:
            response_data['student_name'] = student.get('name', '')
            response_data['student_email'] = student.get('email', '')
        
        # Add campus and course details if available
        student_profile = mongo_db.students.find_one({'user_id': ObjectId(result.get('student_id'))})
        if student_profile:
            campus = mongo_db.campuses.find_one({'_id': ObjectId(student_profile.get('campus_id'))})
            if campus:
                response_data['campus_name'] = campus.get('name', '')
            
            course = mongo_db.courses.find_one({'_id': ObjectId(student_profile.get('course_id'))})
            if course:
                response_data['course_name'] = course.get('name', '')
            
            batch = mongo_db.batches.find_one({'_id': ObjectId(student_profile.get('batch_id'))})
            if batch:
                response_data['batch_name'] = batch.get('name', '')
        
        return jsonify({
            'success': True,
            'data': response_data
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error fetching test result {result_id}: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Failed to fetch test result: {str(e)}'
        }), 500

@test_management_bp.route('/validate-mcq-result', methods=['POST'])
@jwt_required()
def validate_mcq_result():
    """Validate MCQ test result with detailed analysis"""
    try:
        data = request.get_json()
        result_id = data.get('result_id')
        question_index = data.get('question_index')
        
        if not result_id:
            return jsonify({'success': False, 'message': 'Result ID is required'}), 400
        
        # Get the result
        result = mongo_db.student_test_attempts.find_one({'_id': ObjectId(result_id)})
        if not result:
            return jsonify({'success': False, 'message': 'Test result not found'}), 404
        
        # Get the specific question result
        if question_index is not None:
            question_result = result.get('results', [])[question_index] if question_index < len(result.get('results', [])) else None
            if not question_result:
                return jsonify({'success': False, 'message': 'Question result not found'}), 404
            
            # Validate MCQ answer
            validation = {
                'question': question_result.get('question', ''),
                'student_answer': question_result.get('student_answer', ''),
                'correct_answer': question_result.get('correct_answer', ''),
                'is_correct': question_result.get('is_correct', False),
                'score': question_result.get('score', 0),
                'options': question_result.get('options', {}),
                'explanation': question_result.get('explanation', ''),
                'time_taken': question_result.get('time_taken', 0)
            }
            
            return jsonify({
                'success': True,
                'data': validation
            }), 200
        
        return jsonify({'success': False, 'message': 'Question index is required'}), 400
        
    except Exception as e:
        current_app.logger.error(f"Error validating MCQ result: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Failed to validate MCQ result: {str(e)}'
        }), 500

@test_management_bp.route('/validate-technical-result', methods=['POST'])
@jwt_required()
def validate_technical_result():
    """Validate technical test result with compiler analysis"""
    try:
        data = request.get_json()
        result_id = data.get('result_id')
        question_index = data.get('question_index')
        
        if not result_id:
            return jsonify({'success': False, 'message': 'Result ID is required'}), 400
        
        # Get the result
        result = mongo_db.student_test_attempts.find_one({'_id': ObjectId(result_id)})
        if not result:
            return jsonify({'success': False, 'message': 'Test result not found'}), 404
        
        # Get the specific question result
        if question_index is not None:
            question_result = result.get('results', [])[question_index] if question_index < len(result.get('results', [])) else None
            if not question_result:
                return jsonify({'success': False, 'message': 'Question result not found'}), 404
            
            # Validate technical result
            validation = {
                'question': question_result.get('question', ''),
                'student_code': question_result.get('student_code', ''),
                'language': question_result.get('language', ''),
                'test_cases': question_result.get('test_cases', []),
                'passed_test_cases': question_result.get('passed_test_cases', 0),
                'total_test_cases': question_result.get('total_test_cases', 0),
                'passed': question_result.get('passed', False),
                'score': question_result.get('score', 0),
                'execution_time': question_result.get('execution_time', 0),
                'memory_used': question_result.get('memory_used', 0),
                'compiler_output': question_result.get('compiler_output', ''),
                'error_message': question_result.get('error_message', ''),
                'difficulty': question_result.get('difficulty', ''),
                'category': question_result.get('category', ''),
                'time_limit': question_result.get('time_limit', 0),
                'memory_limit': question_result.get('memory_limit', 0)
            }
            
            return jsonify({
                'success': True,
                'data': validation
            }), 200
        
        return jsonify({'success': False, 'message': 'Question index is required'}), 400
        
    except Exception as e:
        current_app.logger.error(f"Error validating technical result: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Failed to validate technical result: {str(e)}'
        }), 500

@test_management_bp.route('/validate-audio-result', methods=['POST'])
@jwt_required()
def validate_audio_result():
    """Validate audio test result with transcript analysis"""
    try:
        data = request.get_json()
        result_id = data.get('result_id')
        question_index = data.get('question_index')
        
        if not result_id:
            return jsonify({'success': False, 'message': 'Result ID is required'}), 400
        
        # Get the result
        result = mongo_db.student_test_attempts.find_one({'_id': ObjectId(result_id)})
        if not result:
            return jsonify({'success': False, 'message': 'Test result not found'}), 404
        
        # Get the specific question result
        if question_index is not None:
            question_result = result.get('results', [])[question_index] if question_index < len(result.get('results', [])) else None
            if not question_result:
                return jsonify({'success': False, 'message': 'Question result not found'}), 404
            
            # Validate audio result
            validation = {
                'question': question_result.get('question', ''),
                'student_audio_url': question_result.get('student_audio_url', ''),
                'student_text': question_result.get('student_text', ''),
                'original_text': question_result.get('original_text', ''),
                'similarity_score': question_result.get('similarity_score', 0),
                'is_correct': question_result.get('is_correct', False),
                'score': question_result.get('score', 0),
                'missing_words': question_result.get('missing_words', []),
                'extra_words': question_result.get('extra_words', []),
                'tolerance': question_result.get('tolerance', 0.8),
                'pronunciation_score': question_result.get('pronunciation_score', 0),
                'fluency_score': question_result.get('fluency_score', 0),
                'completeness_score': question_result.get('completeness_score', 0)
            }
            
            return jsonify({
                'success': True,
                'data': validation
            }), 200
        
        return jsonify({'success': False, 'message': 'Question index is required'}), 400
        
    except Exception as e:
        current_app.logger.error(f"Error validating audio result: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Failed to validate audio result: {str(e)}'
        }), 500

@test_management_bp.route('/test-email', methods=['POST'])
@jwt_required()
@require_superadmin
def test_email_service():
    """Test endpoint to verify email service is working"""
    try:
        data = request.get_json()
        test_email = data.get('email', 'test@example.com')
        
        # Test template rendering
        try:
            html_content = render_template('test_notification.html', 
                student_name='Test Student',
                test_name='Test Test',
                test_id='test123',
                test_type='Practice',
                module='LISTENING',
                level='BEGINNER',
                module_display_name='LISTENING',
                level_display_name='BEGINNER',
                question_count=5,
                is_online=False,
                start_dt='Not specified',
                end_dt='Not specified',
                duration='Not specified'
            )
            current_app.logger.info("Template rendering successful")
        except Exception as e:
            current_app.logger.error(f"Template rendering failed: {e}")
            return jsonify({'success': False, 'message': f'Template rendering failed: {e}'}), 500
        
        # Test email sending
        try:
            email_sent = send_email(
                to_email=test_email,
                to_name='Test Student',
                subject='Test Email from VERSANT System',
                html_content=html_content
            )
            
            if email_sent:
                return jsonify({
                    'success': True, 
                    'message': f'Test email sent successfully to {test_email}',
                    'template_rendered': True
                }), 200
            else:
                return jsonify({
                    'success': False, 
                    'message': 'Email service failed to send email',
                    'template_rendered': True
                }), 500
                
        except Exception as e:
            current_app.logger.error(f"Email sending failed: {e}")
            return jsonify({
                'success': False, 
                'message': f'Email sending failed: {e}',
                'template_rendered': True
            }), 500
            
    except Exception as e:
        current_app.logger.error(f"Test email endpoint error: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@test_management_bp.route('/fix-audio-urls', methods=['POST'])
@jwt_required()
@require_superadmin
def fix_corrupted_audio_urls():
    """Fix corrupted audio URLs in the database"""
    try:
        # Find all tests with corrupted local:// URLs
        corrupted_tests = mongo_db.tests.find({
            'questions.audio_url': {'$regex': '^local://'}
        })
        
        fixed_count = 0
        for test in corrupted_tests:
            questions_updated = False
            for question in test.get('questions', []):
                if question.get('audio_url', '').startswith('local://'):
                    # Extract the filename from the corrupted URL
                    corrupted_url = question['audio_url']
                    filename = corrupted_url.replace('local://local_audio/', '')
                    
                    # Generate the correct S3 key
                    correct_s3_key = f"audio/practice_tests/{filename}"
                    
                    # Update the question with the correct S3 key
                    mongo_db.tests.update_one(
                        {'_id': test['_id'], 'questions.question_id': question['question_id']},
                        {'$set': {'questions.$.audio_url': correct_s3_key}}
                    )
                    questions_updated = True
            
            if questions_updated:
                fixed_count += 1
        
        return jsonify({
            'success': True,
            'message': f'Fixed {fixed_count} tests with corrupted audio URLs',
            'fixed_count': fixed_count
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error fixing corrupted audio URLs: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

def fix_audio_urls_in_test(test):
    """Fix corrupted audio URLs in a test document"""
    try:
        if 'questions' in test:
            for question in test['questions']:
                if question.get('audio_url', '').startswith('local://'):
                    # Extract the filename from the corrupted URL
                    corrupted_url = question['audio_url']
                    filename = corrupted_url.replace('local://local_audio/', '')
                    
                    # Generate the correct S3 key
                    correct_s3_key = f"audio/practice_tests/{filename}"
                    
                    # Update the question with the correct S3 key
                    question['audio_url'] = correct_s3_key
                    current_app.logger.info(f"Fixed corrupted audio URL: {corrupted_url} -> {correct_s3_key}")
        
        return test
    except Exception as e:
        current_app.logger.error(f"Error fixing audio URLs in test: {e}")
        return test


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
import pandas as pd
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
from config.aws_config import s3_client, S3_BUCKET_NAME, get_s3_client_safe
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

def safe_isoformat(date_obj):
    """Safely convert a date object to ISO format string, handling various types."""
    if not date_obj:
        return None
    
    if hasattr(date_obj, 'isoformat'):
        # It's a datetime object
        return date_obj.isoformat()
    elif isinstance(date_obj, dict):
        # It's a MongoDB date dict, extract the date
        if '$date' in date_obj:
            try:
                from datetime import datetime
                date_str = date_obj['$date']
                # Handle different MongoDB date formats
                if 'T' in date_str:
                    # ISO format with T
                    date_obj_parsed = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                else:
                    # Just timestamp
                    date_obj_parsed = datetime.fromtimestamp(int(date_str) / 1000)
                return date_obj_parsed.isoformat()
            except (ValueError, KeyError, TypeError):
                return str(date_obj)
        else:
            return str(date_obj)
    else:
        # It's already a string or other type
        return str(date_obj)

# OneCompiler API Configuration
ONECOMPILER_API_KEY = 'f744734571mshb636ee6aecb15e3p16c0e7jsnd142c0e341e6'
ONECOMPILER_API_HOST = 'onecompiler-apis.p.rapidapi.com'

test_management_bp = Blueprint('test_management', __name__)

# Test route to verify blueprint is working
@test_management_bp.route('/test-blueprint', methods=['GET'])
def test_blueprint():
    """Test if blueprint is working"""
    return jsonify({'success': True, 'message': 'Blueprint is working'}), 200

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
        allowed_roles = ['superadmin', 'sub_superadmin', 'campus_admin', 'course_admin']
        if not user or user.get('role') not in allowed_roles:
            return jsonify({
                'success': False,
                'message': 'Access denied. Admin privileges required.'
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
                # Safely get question text from any available field
                question_text = (question.get('question_text') or
                               question.get('question') or
                               question.get('sentence') or
                               '')
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

        # Validate that data exists
        if not data:
            return jsonify({'success': False, 'message': 'No data provided in request'}), 400

        module_id = data.get('module_id')

        # Validate module_id is provided
        if not module_id:
            return jsonify({'success': False, 'message': 'Module ID is required'}), 400

        # Validate questions array exists and is not empty for audio tests
        if module_id in ['LISTENING', 'SPEAKING']:
            questions = data.get('questions', [])
            if not questions:
                return jsonify({'success': False, 'message': 'Questions array is required for audio tests'}), 400

            # Validate each question has required content
            for i, question in enumerate(questions):
                # Check if question has any text content
                question_text = (question.get('question_text') or
                               question.get('question') or
                               question.get('sentence') or
                               '').strip()

                if not question_text:
                    current_app.logger.error(f"Question {i+1} is missing required text content. Question data: {question}")
                    return jsonify({
                        'success': False,
                        'message': f'Question {i+1} is missing required text content. Please ensure each question has either a question_text, question, or sentence field.'
                    }), 400

                # Additional validation to ensure text is not just whitespace
                if not question_text or len(question_text.strip()) == 0:
                    current_app.logger.error(f"Question {i+1} has empty or whitespace-only text: '{question_text}'")
                    return jsonify({
                        'success': False,
                        'message': f'Question {i+1} has empty or invalid text content. Please provide valid text for the question.'
                    }), 400

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
        elif module_id in ['CRT_APTITUDE', 'CRT_REASONING']:
            # Redirect to MCQ test creation for CRT Aptitude and Reasoning
            from routes.test_management_mcq import create_mcq_test
            return create_mcq_test()
        elif module_id == 'CRT_TECHNICAL':
            # Redirect to technical test creation for CRT Technical only
            from routes.test_management_technical import create_technical_test
            return create_technical_test()
        else:
            return jsonify({'success': False, 'message': f'Unsupported module type: {module_id}'}), 400

    except Exception as e:
        current_app.logger.error(f"Error routing test creation: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@test_management_bp.route('/tests/<test_id>', methods=['GET'])
@jwt_required()
def get_single_test(test_id):
    """Route to appropriate test retrieval endpoint based on module type"""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)
        
        if not user:
            return jsonify({
                'success': False,
                'message': 'Access denied. Authentication required.'
            }), 401
        
        # Check if user has admin privileges
        if user.get('role') not in ['superadmin', 'sub_superadmin', 'campus_admin', 'course_admin']:
            return jsonify({
                'success': False,
                'message': 'Access denied. Admin privileges required.'
            }), 403
        
        current_app.logger.info(f"Fetching full details for test_id: {test_id}")
        current_app.logger.info(f"User role: {user.get('role')}, User campus_id: {user.get('campus_id')}")
        test = mongo_db.tests.find_one({'_id': ObjectId(test_id)})
        if not test:
            current_app.logger.warning(f"Test not found for id: {test_id}")
            return jsonify({'success': False, 'message': 'Test not found'}), 404
        
        current_app.logger.info(f"Test found - campus_ids: {test.get('campus_ids')}, campus_id: {test.get('campus_id')}")
        
        # Check if user has permission to view this test
        if user.get('role') == 'campus_admin':
            campus_id = user.get('campus_id')
            current_app.logger.info(f"Campus admin access check - User campus_id: {campus_id}")
            if campus_id:
                # Check both new format (campus_ids array) and old format (campus_id single)
                test_campus_ids = test.get('campus_ids', [])
                test_campus_id = test.get('campus_id')
                
                current_app.logger.info(f"Test campus data - campus_ids: {test_campus_ids}, campus_id: {test_campus_id}")
                
                # If test has campus_ids array, check if user's campus is in it
                if test_campus_ids and ObjectId(campus_id) not in test_campus_ids:
                    current_app.logger.warning(f"Access denied - User campus {campus_id} not in test campus_ids {test_campus_ids}")
                    return jsonify({
                        'success': False,
                        'message': 'This test does not belong to your campus.'
                    }), 403
                # If test has old format campus_id, check if it matches user's campus
                elif test_campus_id and ObjectId(campus_id) != ObjectId(test_campus_id):
                    current_app.logger.warning(f"Access denied - User campus {campus_id} != test campus_id {test_campus_id}")
                    return jsonify({
                        'success': False,
                        'message': 'This test does not belong to your campus.'
                    }), 403
                # If test has neither campus_ids nor campus_id, deny access
                elif not test_campus_ids and not test_campus_id:
                    current_app.logger.warning(f"Access denied - Test has no campus information")
                    return jsonify({
                        'success': False,
                        'message': 'This test does not belong to your campus.'
                    }), 403
                else:
                    current_app.logger.info(f"Access granted - Campus check passed")
            else:
                current_app.logger.warning(f"Access denied - User has no campus_id")
                return jsonify({
                    'success': False,
                    'message': 'No campus assigned to this admin.'
                }), 403
        elif user.get('role') == 'course_admin':
            course_id = user.get('course_id')
            if course_id and ObjectId(course_id) not in test.get('course_ids', []):
                return jsonify({
                    'success': False,
                    'message': 'Access denied. You can only view tests for your course.'
                }), 403

        module_id = test.get('module_id')
        current_app.logger.info(f"Test module_id: {module_id}, routing to appropriate handler")
        
        # Route to appropriate test retrieval based on module type
        if module_id in ['GRAMMAR', 'VOCABULARY', 'READING']:
            # Redirect to MCQ test retrieval
            current_app.logger.info(f"Routing to MCQ test handler for module: {module_id}")
            from routes.test_management_mcq import get_mcq_test
            return get_mcq_test(test_id)
        elif module_id in ['LISTENING', 'SPEAKING']:
            # Redirect to audio test retrieval
            current_app.logger.info(f"Routing to Audio test handler for module: {module_id}")
            from routes.test_management_audio import get_audio_test
            return get_audio_test(test_id)
        elif module_id == 'WRITING':
            # Redirect to writing test retrieval
            current_app.logger.info(f"Routing to Writing test handler for module: {module_id}")
            from routes.test_management_writing import get_writing_test
            return get_writing_test(test_id)
        elif module_id in ['CRT_APTITUDE', 'CRT_REASONING']:
            # Redirect to MCQ test retrieval for CRT Aptitude and Reasoning
            current_app.logger.info(f"Routing to MCQ test handler for CRT module: {module_id}")
            from routes.test_management_mcq import get_mcq_test
            return get_mcq_test(test_id)
        elif module_id == 'CRT_TECHNICAL' or test.get('level_id') == 'TECHNICAL':
            # Redirect to technical test retrieval for CRT Technical only
            current_app.logger.info(f"Routing to Technical test handler for module: {module_id}")
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
                        current_s3_client = get_s3_client_safe()
                        if current_s3_client is None:
                            current_app.logger.error("S3 client not available for presigned URL generation")
                            question['audio_presigned_url'] = None
                            continue
                        
                        url = current_s3_client.generate_presigned_url(
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
                topic['created_at'] = safe_isoformat(topic['created_at']) if topic['created_at'] else None
                
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
def get_all_tests():
    """Get all created tests with detailed information."""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)
        
        if not user:
            return jsonify({
                'success': False,
                'message': 'Access denied. Authentication required.'
            }), 401
        
        # Check if user has admin privileges
        if user.get('role') not in ['superadmin', 'sub_superadmin', 'campus_admin', 'course_admin']:
            return jsonify({
                'success': False,
                'message': 'Access denied. Admin privileges required.'
            }), 403
        
        # Build match stage based on user role
        match_stage = {}
        if user.get('role') == 'campus_admin':
            # Campus admin can only see tests for their campus
            campus_id = user.get('campus_id')
            if campus_id:
                # Check both new format (campus_ids array) and old format (campus_id single)
                match_stage['$or'] = [
                    {'campus_ids': ObjectId(campus_id)},
                    {'campus_id': ObjectId(campus_id)}
                ]
            else:
                return jsonify({
                    'success': False,
                    'message': 'No campus assigned to this admin.'
                }), 400
        elif user.get('role') == 'course_admin':
            # Course admin can only see tests for their course
            course_id = user.get('course_id')
            if course_id:
                match_stage['course_ids'] = ObjectId(course_id)
            else:
                return jsonify({
                    'success': False,
                    'message': 'No course assigned to this admin.'
                }), 400
        # Super admin can see all tests (no match stage needed)
        
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
            }
        ]
        
        # Add match stage if needed (for campus/course admins)
        if match_stage:
            pipeline.append({'$match': match_stage})
        
        pipeline.extend([
            {
                '$project': {
                    '_id': 1,
                    'name': 1,
                    'test_type': 1,
                    'status': 1,
                    'created_at': 1,
                    'endDateTime': 1,
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
        ])

        tests = list(mongo_db.tests.aggregate(pipeline))

        tests_data = []
        for test in tests:
            # Convert all ObjectIds recursively (including nested ones in questions and test_cases)
            test = convert_objectids(test)
            
            # Format dates
            test['created_at'] = safe_isoformat(test.get('created_at')) if test.get('created_at') else None
            test['endDateTime'] = safe_isoformat(test.get('endDateTime')) if test.get('endDateTime') else None
            
            # Format campus, batch, and course names properly
            test['campus'] = ', '.join(test.get('campus_names', [])) if test.get('campus_names') else 'N/A'
            test['batch'] = ', '.join(test.get('batches', [])) if test.get('batches') else 'N/A'
            test['course'] = ', '.join(test.get('courses', [])) if test.get('courses') else 'N/A'
            
            # Format level properly
            if test.get('level_id'):
                test['level'] = test['level_id'].replace('_', ' ').title()
            else:
                test['level'] = 'N/A'
            
            # Convert any remaining ObjectIds recursively (e.g., inside questions)
            tests_data.append(convert_objectids(test))

        return jsonify({'success': True, 'data': tests_data}), 200
    except Exception as e:
        current_app.logger.error(f"Error fetching all tests: {e}")
        return jsonify({'success': False, 'message': f'Failed to fetch tests: {e}'}), 500

@test_management_bp.route('/tests/<test_id>', methods=['DELETE'])
@jwt_required()
def delete_test(test_id):
    """Delete a test and its associated S3 audio files (if any)."""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)
        
        if not user:
            return jsonify({
                'success': False,
                'message': 'Access denied. Authentication required.'
            }), 401
        
        # Check if user has admin privileges
        if user.get('role') not in ['superadmin', 'sub_superadmin', 'campus_admin', 'course_admin']:
            return jsonify({
                'success': False,
                'message': 'Access denied. Admin privileges required.'
            }), 403
        
        test_to_delete = mongo_db.tests.find_one({'_id': ObjectId(test_id)})
        if not test_to_delete:
            return jsonify({'success': False, 'message': 'Test not found'}), 404
        
        # Check if user has permission to delete this test
        if user.get('role') == 'campus_admin':
            campus_id = user.get('campus_id')
            if campus_id and ObjectId(campus_id) not in test_to_delete.get('campus_ids', []):
                return jsonify({
                    'success': False,
                    'message': 'Access denied. You can only delete tests for your campus.'
                }), 403
        elif user.get('role') == 'course_admin':
            course_id = user.get('course_id')
            if course_id and ObjectId(course_id) not in test_to_delete.get('course_ids', []):
                return jsonify({
                    'success': False,
                    'message': 'Access denied. You can only delete tests for your course.'
                }), 403

        # Only delete S3 audio files when the test is actually deleted
        # This ensures audio files persist until test deletion
        module_id = test_to_delete.get('module_id')
        mcq_modules = ['GRAMMAR', 'VOCABULARY', 'READING']
        if module_id not in mcq_modules:
            questions = test_to_delete.get('questions', [])
            objects_to_delete = [{'Key': q['audio_url']} for q in questions if 'audio_url' in q and q['audio_url']]
            if objects_to_delete:
                current_s3_client = get_s3_client_safe()
                if current_s3_client:
                    try:
                        current_s3_client.delete_objects(
                            Bucket=S3_BUCKET_NAME,
                            Delete={'Objects': objects_to_delete}
                        )
                        current_app.logger.info(f"Deleted {len(objects_to_delete)} audio files for test {test_id}")
                    except Exception as e:
                        current_app.logger.error(f"Error deleting audio files for test {test_id}: {e}")
                        # Continue with test deletion even if audio deletion fails
                else:
                    current_app.logger.warning("S3 client not available for audio file deletion")

        # Delete the test from the database
        mongo_db.tests.delete_one({'_id': ObjectId(test_id)})

        return jsonify({'success': True, 'message': 'Test deleted successfully'}), 200
    except Exception as e:
        current_app.logger.error(f"Error deleting test {test_id}: {e}")
        return jsonify({'success': False, 'message': 'An error occurred while deleting the test.'}), 500


@test_management_bp.route('/tests/<test_id>/end-time', methods=['PUT'])
@jwt_required()
def update_test_end_time(test_id):
    """Update the endDateTime for an existing online test."""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)

        if not user:
            return jsonify({
                'success': False,
                'message': 'Access denied. Authentication required.'
            }), 401

        if user.get('role') not in ['superadmin', 'sub_superadmin', 'campus_admin', 'course_admin']:
            return jsonify({
                'success': False,
                'message': 'Access denied. Admin privileges required.'
            }), 403

        data = request.get_json() or {}
        endDateTime = data.get('endDateTime')

        if not endDateTime:
            return jsonify({
                'success': False,
                'message': 'endDateTime is required'
            }), 400

        try:
            new_end_dt = datetime.fromisoformat(endDateTime.replace('Z', '+00:00'))
        except Exception:
            return jsonify({
                'success': False,
                'message': 'Invalid endDateTime format'
            }), 400

        test_obj_id = ObjectId(test_id)
        test_doc = mongo_db.tests.find_one({'_id': test_obj_id})

        if not test_doc:
            return jsonify({
                'success': False,
                'message': 'Test not found'
            }), 404

        # Optional: ensure startDateTime exists and is before new endDateTime
        start_dt = test_doc.get('startDateTime')
        if start_dt and isinstance(start_dt, datetime):
            # Normalize for comparison (make both aware or both naive)
            temp_start = start_dt
            temp_new_end = new_end_dt
            
            if temp_start.tzinfo is None:
                temp_start = temp_start.replace(tzinfo=timezone.utc)
            if temp_new_end.tzinfo is None:
                temp_new_end = temp_new_end.replace(tzinfo=timezone.utc)
                
            if temp_start >= temp_new_end:
                return jsonify({
                    'success': False,
                    'message': 'End date must be after start date'
                }), 400

        mongo_db.tests.update_one(
            {'_id': test_obj_id},
            {'$set': {'endDateTime': new_end_dt}}
        )

        return jsonify({
            'success': True,
            'message': 'Test end date updated successfully'
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error updating test end time: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to update test end time: {e}'
        }), 500

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
                        # Get course name
                        course = mongo_db.courses.find_one({'_id': student.get('course_id')})
                        course_name = course.get('name', 'Unknown Course') if course else 'Unknown Course'
                        
                        student_list.append({
                            'id': str(student['_id']),
                            'name': user.get('name', ''),
                            'email': user.get('email', ''),
                            'roll_number': student.get('roll_number', ''),
                            'course_name': course_name,
                            'source': 'batch_course_instance'
                        })
        
        # Approach 2: If no students found, try direct batch query with course filter
        if not student_list and batch_ids and course_ids:
            current_app.logger.info("Trying direct batch query with course filter")
            query = {'batch_id': {'$in': [ObjectId(bid) for bid in batch_ids]}}
            query['course_id'] = {'$in': [ObjectId(cid) for cid in course_ids]}
            students = list(mongo_db.students.find(query))
            current_app.logger.info(f"Found {len(students)} students via direct batch+course query")
            
            for student in students:
                user = mongo_db.users.find_one({'_id': student['user_id']})
                if user:
                    # Get course name
                    course = mongo_db.courses.find_one({'_id': student.get('course_id')})
                    course_name = course.get('name', 'Unknown Course') if course else 'Unknown Course'
                    
                    student_list.append({
                        'id': str(student['_id']),
                        'name': user.get('name', ''),
                        'email': user.get('email', ''),
                        'roll_number': student.get('roll_number', ''),
                        'course_name': course_name,
                        'source': 'direct_batch_course'
                    })
        
        # Approach 3: If still no students, try campus-wide query with course filter
        if not student_list and course_ids:
            current_app.logger.info("Trying campus-wide query with course filter")
            # Get all batches for this campus
            campus_batches = list(mongo_db.batches.find({'campus_id': ObjectId(campus_id)}))
            if campus_batches:
                batch_ids_campus = [str(batch['_id']) for batch in campus_batches]
                query = {'batch_id': {'$in': [ObjectId(bid) for bid in batch_ids_campus]}}
                query['course_id'] = {'$in': [ObjectId(cid) for cid in course_ids]}
                students = list(mongo_db.students.find(query))
                current_app.logger.info(f"Found {len(students)} students via campus-wide+course query")
                
                for student in students:
                    user = mongo_db.users.find_one({'_id': student['user_id']})
                    if user:
                        # Get course name
                        course = mongo_db.courses.find_one({'_id': student.get('course_id')})
                        course_name = course.get('name', 'Unknown Course') if course else 'Unknown Course'
                        
                        student_list.append({
                            'id': str(student['_id']),
                            'name': user.get('name', ''),
                            'email': user.get('email', ''),
                            'roll_number': student.get('roll_number', ''),
                            'course_name': course_name,
                            'source': 'campus_wide_course'
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
    """Notify all students assigned to a test using batch processing for both SMS and email."""
    try:
        # Fetch test details
        test = mongo_db.tests.find_one({'_id': ObjectId(test_id)})
        if not test:
            return jsonify({'success': False, 'message': 'Test not found.'}), 404

        # Get batch_ids and course_ids from test (same approach as test creation)
        batch_ids = test.get('batch_ids', [])
        course_ids = test.get('course_ids', [])
        
        current_app.logger.info(f"Test {test_id} assigned to batches: {batch_ids}, courses: {course_ids}")
        
        if not batch_ids and not course_ids:
            return jsonify({'success': False, 'message': 'No batches or courses assigned to this test.'}), 400

        # Use the same student fetching approach as test creation
        try:
            from utils.test_student_selector import get_students_by_batch_course_combination
            
            # Get students for this test using the same method as test creation
            students = get_students_by_batch_course_combination(batch_ids, course_ids)
            
            current_app.logger.info(f"Found {len(students)} students for test {test_id}")
            
            if not students:
                return jsonify({'success': False, 'message': 'No students found for this test. Please ensure students are uploaded to the assigned batches and courses.'}), 404
                
        except Exception as e:
            current_app.logger.error(f"Error fetching students for test {test_id}: {e}")
            return jsonify({'success': False, 'message': f'Error fetching students: {e}'}), 500

        # Format start date for notification (same as test creation)
        start_date_str = test.get('startDateTime', 'Immediately') if test.get('test_type', '').lower() == 'online' else 'Immediately'
        
        # Create batch job for test notifications (same as test creation)
        try:
            from utils.batch_processor import create_test_notification_batch_job
            
            # Get the custom test_id from the test document
            test_doc = mongo_db.tests.find_one({'_id': ObjectId(test_id)})
            custom_test_id = test_doc.get('test_id', test_id) if test_doc else test_id
            
            batch_result = create_test_notification_batch_job(
                test_id=custom_test_id,  # Custom test_id for SMS
                object_id=test_id,  # MongoDB _id for emails
                test_name=test.get('name', 'Test'),
                start_date=start_date_str,
                students=students,
                batch_size=100,
                interval_minutes=3
            )
            
            current_app.logger.info(f"📧📱 Test notification batch created: {batch_result}")
        except Exception as e:
            current_app.logger.error(f"Error creating test notification batch: {e}")
            return jsonify({
                'success': False,
                'message': 'Failed to create notification batch. Notifications will be sent individually.'
            }), 500
        
        return jsonify({
            'success': True,
                'message': f'Test notifications queued for {len(students)} students. Processing in background.',
                'data': {
                    'test_id': test_id,
                    'test_name': test.get('name'),
                    'total_students': len(students),
                    'batch_id': batch_result.get('batch_id'),
                    'estimated_completion': batch_result.get('estimated_completion'),
                    'sub_batches': batch_result.get('sub_batches')
            }
        }), 200

    except Exception as e:
            current_app.logger.error(f"❌ Failed to create test notification batch: {e}")
            return jsonify({'success': False, 'message': f'Failed to queue notifications: {e}'}), 500
        
    except Exception as e:
        current_app.logger.error(f"Error in notify_students: {e}")
        import traceback
        current_app.logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({'success': False, 'message': 'An error occurred while sending notifications.'}), 500

@test_management_bp.route('/remind-students', methods=['POST'])
@jwt_required()
@require_superadmin
def remind_students():
    """Manually trigger test reminders via notification-service"""
    try:
        data = request.get_json() or {}
        test_id = data.get('test_id')  # Optional: specific test ID
        
        current_app.logger.info(f"📱 Manual test reminder triggered by admin")
        
        # Get notification service URL
        notification_service_url = os.getenv('NOTIFICATION_SERVICE_URL', 'http://localhost:3001')
        notification_service_url = notification_service_url.rstrip('/api').rstrip('/')
        
        reminder_url = f"{notification_service_url}/api/test-notifications/test-reminder"
        
        current_app.logger.info(f"📡 Calling notification service: {reminder_url}")
        
        # Call notification-service
        try:
            response = requests.post(
                reminder_url,
                json={'test_id': test_id} if test_id else {},
                timeout=60  # 60 seconds for processing
            )
            
            if response.status_code == 200:
                result = response.json()
                current_app.logger.info(f"✅ Test reminders sent: {result}")
                
                return jsonify({
                    'success': True,
                    'message': result.get('message', 'Test reminders sent successfully'),
                    'data': result.get('data', {})
                }), 200
            else:
                error_msg = response.json().get('message', 'Unknown error') if response.text else 'Service unavailable'
                current_app.logger.error(f"❌ Notification service error: {error_msg}")
                return jsonify({
                    'success': False,
                    'message': f'Notification service error: {error_msg}'
                }), 500
                
        except requests.exceptions.ConnectionError:
            current_app.logger.error(f"❌ Cannot connect to notification service at {notification_service_url}")
            return jsonify({
                'success': False,
                'message': 'Cannot connect to notification service. Please ensure it is running on port 3001.'
            }), 503
        except requests.exceptions.Timeout:
            current_app.logger.error(f"❌ Notification service timeout")
            return jsonify({
                'success': False,
                'message': 'Notification service timeout. Reminders may still be processing.'
            }), 504
        except Exception as e:
            current_app.logger.error(f"❌ Error calling notification service: {e}")
            return jsonify({
                'success': False,
                'message': f'Error calling notification service: {str(e)}'
            }), 500
            
    except Exception as e:
        current_app.logger.error(f"Error in remind_students: {e}")
        import traceback
        current_app.logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({'success': False, 'message': 'An error occurred while triggering reminders.'}), 500


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
        question_type_from_payload = data.get('question_type')  # Question type from payload
        
        if not module_id or not questions:
            return jsonify({'success': False, 'message': 'module_id and questions are required.'}), 400
        
        # For non-CRT modules, level_id is required
        if not module_id.startswith('CRT_') and not level_id:
            return jsonify({'success': False, 'message': 'level_id is required for non-CRT modules.'}), 400
        
        # Validate questions and check for duplicates
        valid_questions = []
        duplicate_questions = []
        invalid_questions = []
        
        # Get existing questions for duplicate checking
        query_filter = {'module_id': module_id}
        if topic_id:
            query_filter['topic_id'] = ObjectId(topic_id)
        elif level_id:
            query_filter['level_id'] = level_id
            
        existing_questions = list(mongo_db.question_bank.find(
            query_filter,
            {'question': 1, 'questionTitle': 1, '_id': 0}
        ))
        
        # Create sets for duplicate checking based on question type
        existing_question_texts = set()
        existing_question_titles = set()
        
        for q in existing_questions:
            if 'question' in q and q['question']:
                existing_question_texts.add(q['question'].strip().lower())
            if 'questionTitle' in q and q['questionTitle']:
                existing_question_titles.add(q['questionTitle'].strip().lower())
        
        # Track questions within the file to detect duplicates
        seen_questions_in_file = set()
        seen_titles_in_file = set()
        
        for i, q in enumerate(questions):
            # Basic validation based on module type
            is_valid = True
            validation_reason = ""
            
            if module_id == 'CRT_TECHNICAL' or level_id == 'CRT_TECHNICAL':
                # Get question type from question or payload, default to 'technical'
                question_type = q.get('questionType', question_type_from_payload or 'technical')
                if question_type == 'technical' or question_type == 'compiler':
                    # Compiler-integrated technical question
                    if not (q.get('question') and (q.get('testCases') or q.get('test_cases'))):
                        is_valid = False
                        validation_reason = "Missing required fields (question or testCases)"
                else:
                    # MCQ technical question
                    if not (q.get('question') and q.get('optionA') and q.get('optionB') and 
                           q.get('optionC') and q.get('optionD') and q.get('answer')):
                        is_valid = False
                        validation_reason = "Missing required fields (question, options, or answer)"
            else:
                # CRT_APTITUDE and CRT_REASONING - MCQ format
                if not (q.get('question') and q.get('optionA') and q.get('optionB') and 
                       q.get('optionC') and q.get('optionD') and q.get('answer')):
                    is_valid = False
                    validation_reason = "Missing required fields (question, options, or answer)"
            
            if not is_valid:
                invalid_questions.append({
                    'index': i + 1,
                    'question': q.get('question', q.get('questionTitle', '')),
                    'reason': validation_reason
                })
                continue
            
            # Check for duplicates within the file first
            question_text = q.get('question', '').strip().lower()
            question_title = q.get('questionTitle', '').strip().lower()
            
            if question_text in seen_questions_in_file or question_title in seen_titles_in_file:
                duplicate_questions.append({
                    'index': i + 1,
                    'question': q.get('question', q.get('questionTitle', '')),
                    'reason': 'Duplicate question within the same file'
                })
                continue
            
            # Check for duplicates against database
            if question_text in existing_question_texts or question_title in existing_question_titles:
                duplicate_questions.append({
                    'index': i + 1,
                    'question': q.get('question', q.get('questionTitle', '')),
                    'reason': 'Question already exists in database'
                })
                continue
            
            # Add to valid questions and mark as seen
            valid_questions.append(q)
            if question_text:
                seen_questions_in_file.add(question_text)
            if question_title:
                seen_titles_in_file.add(question_title)
        
        if not valid_questions:
            return jsonify({
                'success': False, 
                'message': 'No valid questions found in upload',
                'details': {
                    'total_questions': len(questions),
                    'valid_questions': 0,
                    'duplicate_questions': len(duplicate_questions),
                    'invalid_questions': len(invalid_questions),
                    'duplicates': duplicate_questions,
                    'invalid': invalid_questions
                }
            }), 400
        
        # Generate upload session ID
        upload_session_id = str(uuid.uuid4())
        
        # Store valid questions in question_bank collection
        inserted = []
        for q in valid_questions:
            # Determine question type first
            question_type = None
            if module_id == 'CRT_TECHNICAL' or level_id == 'CRT_TECHNICAL':
                question_type = q.get('questionType', question_type_from_payload or 'technical')
            elif module_id in ['LISTENING', 'SPEAKING']:
                question_type = 'speaking' if module_id == 'SPEAKING' else 'sentence'
            else:
                question_type = 'mcq'
            
            # Build document based on question type
            doc = {
                'module_id': module_id,
                'level_id': level_id,
                'question': q.get('question'),
                'instructions': q.get('instructions', ''),
                'question_type': question_type,
                'used_in_tests': [],
                'used_count': 0,
                'last_used': None,
                'created_at': datetime.utcnow(),
                'upload_session_id': upload_session_id
            }
            
            # Add topic_id if provided (for CRT modules)
            if topic_id:
                doc['topic_id'] = ObjectId(topic_id)
            
            # Handle different question types
            if question_type in ['technical', 'compiler']:
                # Compiler/Technical question - only add compiler fields
                doc['questionTitle'] = q.get('questionTitle', '')
                doc['problemStatement'] = q.get('problemStatement', '')
                doc['language'] = q.get('language', 'python')
                doc['testCases'] = q.get('testCases', q.get('test_cases', []))
                
                # Validate compiler question
                if not doc['testCases']:
                    current_app.logger.warning(f"Skipping compiler question without test cases: {q.get('question', '')}")
                    continue
                    
            elif question_type == 'mcq':
                # MCQ question - add MCQ fields
                doc['optionA'] = q.get('options', [])[0] if q.get('options') else q.get('optionA', '')
                doc['optionB'] = q.get('options', [])[1] if q.get('options') and len(q.get('options')) > 1 else q.get('optionB', '')
                doc['optionC'] = q.get('options', [])[2] if q.get('options') and len(q.get('options')) > 2 else q.get('optionC', '')
                doc['optionD'] = q.get('options', [])[3] if q.get('options') and len(q.get('options')) > 3 else q.get('optionD', '')
                doc['answer'] = q.get('answer', '')
                
                # Validate MCQ question
                if not (doc['optionA'] and doc['optionB'] and doc['optionC'] and doc['optionD'] and doc['answer']):
                    current_app.logger.warning(f"Skipping incomplete MCQ question: {q.get('question', '')}")
                    continue
                    
            elif question_type in ['sentence', 'speaking']:
                # Sentence/Speaking questions
                doc['sentence'] = q.get('question') or q.get('sentence', '')
                doc['audio_url'] = q.get('audio_url')
                doc['audio_config'] = q.get('audio_config')
                doc['transcript_validation'] = q.get('transcript_validation')
                doc['has_audio'] = q.get('has_audio', False)
            
            # Support sublevel/subcategory for grammar
            if 'subcategory' in q:
                doc['subcategory'] = q['subcategory']
                
            mongo_db.question_bank.insert_one(doc)
            inserted.append(doc['question'])
        
        current_app.logger.info(f"Successfully uploaded {len(inserted)} questions to module bank")
        
        # Prepare detailed response
        response_data = {
            'success': True,
            'message': f'Successfully uploaded {len(inserted)} questions to module bank',
            'count': len(inserted),
            'details': {
                'total_questions': len(questions),
                'valid_questions': len(valid_questions),
                'duplicate_questions': len(duplicate_questions),
                'invalid_questions': len(invalid_questions),
                'duplicates': duplicate_questions,
                'invalid': invalid_questions
            }
        }
        
        return jsonify(response_data), 201
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
        elif module_id == 'CRT_TECHNICAL':
            # For technical questions, include all fields
            projection = {
                'question': 1,
                'questionTitle': 1,
                'problemStatement': 1,
                'testCases': 1,
                'test_cases': 1,
                'language': 1,
                'instructions': 1,
                'question_type': 1,
                'optionA': 1,
                'optionB': 1,
                'optionC': 1,
                'optionD': 1,
                'answer': 1,
                'topic_id': 1,
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
    
    # Get all questions first, then implement smart random selection
    all_questions = list(mongo_db.question_bank.find(query, projection))
    
    if not all_questions:
        questions = []
    else:
        # Separate unused and used questions
        unused_questions = [q for q in all_questions if q.get('used_count', 0) == 0]
        used_questions = [q for q in all_questions if q.get('used_count', 0) > 0]
        
        # Sort used questions by usage (least used first)
        used_questions.sort(key=lambda x: (x.get('used_count', 0), x.get('last_used', 0)))
        
        # Select questions: prefer unused, then least used
        selected_questions = []
        
        # First, add unused questions (randomized)
        if unused_questions:
            import random
            random.shuffle(unused_questions)
            selected_questions.extend(unused_questions[:n])
        
        # If we need more questions, add from used questions (randomized from least used)
        if len(selected_questions) < n and used_questions:
            remaining_needed = n - len(selected_questions)
            # Take a larger pool of least used questions and randomize
            pool_size = min(len(used_questions), remaining_needed * 3)  # 3x pool for better randomization
            pool_questions = used_questions[:pool_size]
            random.shuffle(pool_questions)
            selected_questions.extend(pool_questions[:remaining_needed])
        
        # Final shuffle to randomize the order of selected questions
        random.shuffle(selected_questions)
        questions = selected_questions
    
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
            
            # Only filter by topic_id if it's provided and not empty
            if topic_id and str(topic_id).strip() and str(topic_id).strip() != '':
                # Check if topic_id is a valid ObjectId
                try:
                    topic_id_str = str(topic_id).strip()
                    # If it's a valid ObjectId, use it directly
                    if len(topic_id_str) == 24 and all(c in '0123456789abcdef' for c in topic_id_str.lower()):
                        query['topic_id'] = ObjectId(topic_id_str)
                        current_app.logger.info(f"Filtering questions by topic_id: {topic_id_str}")
                    else:
                        # If it's not a valid ObjectId, try to find the topic by name
                        # Remove any percentage or completion info
                        topic_name = topic_id_str.split('(')[0].strip()
                        topic = mongo_db.crt_topics.find_one({'topic_name': topic_name})
                        if topic:
                            query['topic_id'] = topic['_id']
                            current_app.logger.info(f"Found topic by name '{topic_name}': {topic['_id']}")
                        else:
                            current_app.logger.warning(f"Topic not found: {topic_id_str}")
                            # Don't add topic_id to query if not found
                except Exception as e:
                    current_app.logger.error(f"Error processing topic_id {topic_id}: {e}")
                    # Don't add topic_id to query if there's an error
            else:
                current_app.logger.info("No topic_id provided, fetching questions from all topics in module")
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
        
        # Get all questions first for proper randomization
        all_questions = list(mongo_db.question_bank.find(query))
        
        if not all_questions:
            questions = []
        else:
            # Separate unused and used questions for smart selection
            unused_questions = [q for q in all_questions if q.get('used_count', 0) == 0]
            used_questions = [q for q in all_questions if q.get('used_count', 0) > 0]
            
            # Sort used questions by usage (least used first)
            used_questions.sort(key=lambda x: (x.get('used_count', 0), x.get('last_used', 0)))
            
            # Select questions: prefer unused, then least used
            selected_questions = []
            import random
            
            # First, add unused questions (randomized)
            if unused_questions:
                random.shuffle(unused_questions)
                selected_questions.extend(unused_questions)
            
            # Always add used questions if they exist (even if all questions are used)
            # This ensures that even when topic is 100% used, questions are still returned (they can be reused)
            if used_questions:
                # Use all used questions for better randomization
                pool_questions = used_questions.copy()
                random.shuffle(pool_questions)
                # Only add if we don't already have all questions, or if all are used (unused_questions is empty)
                if len(selected_questions) < len(all_questions) or len(unused_questions) == 0:
                    selected_questions.extend(pool_questions)
            
            # Apply pagination to the randomized selection
            skip = (page - 1) * limit
            questions = selected_questions[skip:skip + limit]
            
            # If no questions on this page but we have questions in total, 
            # it means we're past the last page - return empty array but still success
            if len(questions) == 0 and len(selected_questions) > 0:
                current_app.logger.info(f"No questions on page {page}, but {len(selected_questions)} total questions exist")
        
        # If no questions found for CRT_TECHNICAL and level_id is set, try without level_id
        if module_id == 'CRT_TECHNICAL' and len(questions) == 0 and level_id:
            current_app.logger.info(f"No questions found with level_id {level_id}, trying without level_id")
            fallback_query = {'module_id': module_id}
            # Only filter by topic_id if it's provided and not empty
            if topic_id and str(topic_id).strip() and str(topic_id).strip() != '':
                try:
                    topic_id_str = str(topic_id).strip()
                    if len(topic_id_str) == 24 and all(c in '0123456789abcdef' for c in topic_id_str.lower()):
                        fallback_query['topic_id'] = ObjectId(topic_id_str)
                    else:
                        topic_name = topic_id_str.split('(')[0].strip()
                        topic = mongo_db.crt_topics.find_one({'topic_name': topic_name})
                        if topic:
                            fallback_query['topic_id'] = topic['_id']
                except Exception as e:
                    current_app.logger.error(f"Error processing topic_id {topic_id}: {e}")
            
            current_app.logger.info(f"Fallback query: {fallback_query}")
            total_count = mongo_db.question_bank.count_documents(fallback_query)
            
            # Get all questions first for proper randomization
            all_questions = list(mongo_db.question_bank.find(fallback_query))
            
            if not all_questions:
                questions = []
            else:
                # Separate unused and used questions for smart selection
                unused_questions = [q for q in all_questions if q.get('used_count', 0) == 0]
                used_questions = [q for q in all_questions if q.get('used_count', 0) > 0]
                
                # Sort used questions by usage (least used first)
                used_questions.sort(key=lambda x: (x.get('used_count', 0), x.get('last_used', 0)))
                
                # Select questions: prefer unused, then least used
                selected_questions = []
                import random
                
                # First, add unused questions (randomized)
                if unused_questions:
                    random.shuffle(unused_questions)
                    selected_questions.extend(unused_questions)
                
                # Always add used questions if they exist (even if all questions are used)
                # This ensures that even when topic is 100% used, questions are still returned (they can be reused)
                if used_questions:
                    # Use all used questions for better randomization
                    pool_questions = used_questions.copy()
                    random.shuffle(pool_questions)
                    # Only add if we don't already have all questions, or if all are used (unused_questions is empty)
                    if len(selected_questions) < len(all_questions) or len(unused_questions) == 0:
                        selected_questions.extend(pool_questions)
                
                # Apply pagination to the randomized selection
                skip = (page - 1) * limit
                questions = selected_questions[skip:skip + limit]
        
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
        
        # Even if no questions returned on this page, still return success if total_count > 0
        # This allows the frontend to know questions exist (even if all are used)
        response_data = {
            'success': True,
            'questions': questions,
            'total_count': total_count,
            'current_page': page,
            'total_pages': (total_count + limit - 1) // limit if total_count > 0 else 0,
            'has_more': (page * limit) < total_count
        }
        
        # Add a note if all questions are used
        if total_count > 0 and len(questions) == 0:
            # Check if all questions in the topic are used
            used_questions_count = mongo_db.question_bank.count_documents({
                **query,
                'used_count': {'$gt': 0}
            })
            if used_questions_count == total_count:
                response_data['all_used'] = True
                response_data['message'] = 'All questions in this topic have been used. Questions can still be reused for new tests.'
                current_app.logger.info(f"All {total_count} questions in topic are used, but can be reused")
        
        return jsonify(response_data), 200
        
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
            
            # Only filter by topic_id if it's provided and not empty
            if topic_id and str(topic_id).strip() and str(topic_id).strip() != '':
                try:
                    topic_id_str = str(topic_id).strip()
                    # Check if topic_id is a valid ObjectId
                    if len(topic_id_str) == 24 and all(c in '0123456789abcdef' for c in topic_id_str.lower()):
                        query['topic_id'] = ObjectId(topic_id_str)
                        current_app.logger.info(f"Filtering question count by topic_id: {topic_id_str}")
                    else:
                        # If it's not a valid ObjectId, try to find the topic by name
                        topic_name = topic_id_str.split('(')[0].strip()
                        topic = mongo_db.crt_topics.find_one({'topic_name': topic_name})
                        if topic:
                            query['topic_id'] = topic['_id']
                            current_app.logger.info(f"Found topic by name '{topic_name}': {topic['_id']}")
                        else:
                            current_app.logger.warning(f"Topic not found for count: {topic_id_str}")
                except Exception as e:
                    current_app.logger.error(f"Error processing topic_id {topic_id}: {e}")
            else:
                current_app.logger.info("No topic_id provided for count, counting all questions in module")
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

@test_management_bp.route('/', methods=['GET'])
def root_test():
    """Root test endpoint to verify blueprint is working"""
    return jsonify({'success': True, 'message': 'Test management blueprint root is working'}), 200

@test_management_bp.route('/test-endpoint', methods=['GET'])
def test_endpoint():
    """Test endpoint to verify route is working"""
    return jsonify({'success': True, 'message': 'Test management route is working'}), 200

@test_management_bp.route('/health', methods=['GET'])
def health_check():
    """Health check for test management routes"""
    return jsonify({
        'success': True, 
        'message': 'Test management routes are healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'available_endpoints': [
            '/',
            '/test-endpoint',
            '/submit-practice-test',
            '/submit-technical-test'
        ]
    }), 200

@test_management_bp.route('/submit-practice-test-test', methods=['POST'])
def submit_practice_test_test():
    """Test endpoint without JWT to verify route is accessible"""
    return jsonify({'success': True, 'message': 'Practice test endpoint is accessible'}), 200

@test_management_bp.route('/submit-practice-test-simple', methods=['POST'])
def submit_practice_test_simple():
    """Simple test endpoint to verify basic functionality"""
    try:
        current_app.logger.info("=== SIMPLE PRACTICE TEST ENDPOINT HIT ===")
        return jsonify({'success': True, 'message': 'Simple practice test endpoint working'}), 200
    except Exception as e:
        current_app.logger.error(f"Error in simple endpoint: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@test_management_bp.route('/submit-practice-test', methods=['POST'])
@jwt_required()
def submit_practice_test():
    """Submit practice test with student audio recordings or MCQ answers"""
    try:
        current_app.logger.info("=== PRACTICE TEST SUBMISSION ENDPOINT HIT ===")
        current_user_id = get_jwt_identity()
        current_app.logger.info(f"Practice test submission attempt by user {current_user_id}")
        
        data = request.form.to_dict()
        files = request.files
        
        current_app.logger.info(f"Received form data: {data}")
        current_app.logger.info(f"Received files: {list(files.keys()) if files else 'No files'}")
        
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
        
        # Use consistent shuffling based on test_id (same as online tests)
        import random
        if 'questions' in test and isinstance(test['questions'], list):
            # Use test_id as seed for consistent shuffling (same as online tests)
            test_id_str = str(test_id)
            random.seed(hash(test_id_str) % 1000000)
            
            # Shuffle questions (same as online tests)
            random.shuffle(test['questions'])
            
            # Process questions with shuffling (same as online tests)
            shuffled_questions = []
            
            for idx, q in enumerate(test['questions']):
                if q.get('question_type') == 'mcq':
                    # Build options dict from optionA...optionD
                    options = {}
                    answer_letter = q.get('answer')  # e.g. "C"

                    for opt_key in ['A', 'B', 'C', 'D']:
                        opt_field = f"option{opt_key}"
                        if q.get(opt_field) is not None:
                            options[opt_key] = q[opt_field]

                    # Shuffle options
                    items = list(options.items())
                    random.shuffle(items)

                    new_options = {}
                    answer_map = {}
                    for new_idx, (old_key, value) in enumerate(items):
                        new_key = chr(ord('A') + new_idx)
                        new_options[new_key] = value
                        answer_map[old_key] = new_key

                    # Store shuffled question data for validation
                    shuffled_q = q.copy()
                    shuffled_q['shuffled_options'] = new_options
                    shuffled_q['answer_mapping'] = answer_map
                    shuffled_q['shuffled_answer'] = answer_map.get(answer_letter)
                    shuffled_questions.append(shuffled_q)
                else:
                    # Non-MCQ questions
                    shuffled_q = q.copy()
                    shuffled_questions.append(shuffled_q)
            
            # Reset random seed
            random.seed()
            
            # Store shuffled questions for validation
            test['shuffled_questions'] = shuffled_questions
            current_app.logger.info(f"Applied consistent shuffling to {len(shuffled_questions)} questions for practice test validation")
        
        # Check if student has access to this test
        current_app.logger.info(f"Looking for student profile with user_id: {current_user_id}")
        
        # Debug: Check what's in the students collection
        all_students = list(mongo_db.students.find().limit(5))
        current_app.logger.info(f"Sample students in collection: {[{'user_id': str(s.get('user_id')), '_id': str(s.get('_id'))} for s in all_students]}")
        
        student = mongo_db.students.find_one({'user_id': ObjectId(current_user_id)})
        if not student:
            current_app.logger.warning(f"Student profile not found for user_id: {current_user_id}")
            # Try alternative lookup methods
            student = mongo_db.students.find_one({'_id': ObjectId(current_user_id)})
            if not student:
                current_app.logger.warning(f"Student profile not found with _id either: {current_user_id}")
                return jsonify({
                    'success': False,
                    'message': 'Student profile not found. Please contact your administrator.'
                }), 404
            else:
                current_app.logger.info(f"Found student profile using _id lookup")
        else:
            current_app.logger.info(f"Found student profile using user_id lookup")
        
        # Validate access based on campus, course, batch
        current_app.logger.info(f"Student data: campus_id={student.get('campus_id')}, course_id={student.get('course_id')}, batch_id={student.get('batch_id')}")
        current_app.logger.info(f"Test access requirements: campus_ids={test.get('campus_ids')}, course_ids={test.get('course_ids')}, batch_ids={test.get('batch_ids')}")
        
        has_access = False
        if test.get('campus_ids') and student.get('campus_id') in test['campus_ids']:
            has_access = True
            current_app.logger.info("Access granted via campus_id match")
        if test.get('course_ids') and student.get('course_id') in test['course_ids']:
            has_access = True
            current_app.logger.info("Access granted via course_id match")
        if test.get('batch_ids') and student.get('batch_id') in test['batch_ids']:
            has_access = True
            current_app.logger.info("Access granted via batch_id match")
        
        # For practice tests, be more lenient with access control
        if test.get('test_type') == 'practice':
            current_app.logger.info("Practice test detected - applying lenient access control")
            has_access = True
        
        if not has_access:
            current_app.logger.warning(f"Access denied for student {current_user_id} to test {test_id}")
            return jsonify({
                'success': False,
                'message': 'Access denied to this test. Please contact your administrator.'
            }), 403
        
        current_app.logger.info(f"Access granted for student {current_user_id} to test {test_id}")
        
        # Process questions and calculate results - using same logic as online tests
        # Get shuffled questions if available, otherwise use original questions
        shuffled_questions = test.get('shuffled_questions', [])
        if not shuffled_questions:
            # If no shuffled questions, use original questions but apply same validation logic
            shuffled_questions = test.get('questions', [])
            current_app.logger.info(f"No shuffled questions found, using original questions")
        
        current_app.logger.info(f"Processing {len(shuffled_questions)} questions for test {test_id}")
        current_app.logger.info(f"Using shuffled questions: {len(shuffled_questions) > 0}")
        
        # Use same validation approach as online tests
        current_app.logger.info(f"Processing questions with standardized matching logic")
        
        results = []
        total_score = 0
        correct_answers = 0
        total_marks = len(shuffled_questions)
        
        for i, question in enumerate(shuffled_questions):
            current_app.logger.info(f"Processing question {i}: type={question.get('question_type')}")
            current_app.logger.info(f"Question {i} data: {question}")
            
            if question.get('question_type') == 'mcq':
                # Handle MCQ question - use answer index format (answer_0, answer_1, etc.)
                answer_key = f'answer_{i}'
                current_app.logger.info(f"MCQ question {i}: looking for answer key '{answer_key}' in data")
                
                if answer_key in data:
                    student_answer_text = data[answer_key]
                    
                    # Use same logic as online tests - check for shuffled data first
                    if 'shuffled_answer' in question and 'shuffled_options' in question:
                        # Use shuffled answer mapping (same as online tests)
                        correct_answer_letter = question.get('shuffled_answer', '')
                        shuffled_options = question.get('shuffled_options', {})
                        correct_answer_text = shuffled_options.get(correct_answer_letter, '')
                        current_app.logger.info(f"Using shuffled answer mapping: {correct_answer_letter} -> {correct_answer_text}")
                    else:
                        # Fall back to original answer mapping (same as online tests)
                        correct_answer_letter = question.get('answer', '')  # A, B, C, or D
                        correct_answer_text = ''
                        
                        # Map answer letter to actual option text (same as online tests)
                        if correct_answer_letter == 'A':
                            correct_answer_text = question.get('optionA', '')
                        elif correct_answer_letter == 'B':
                            correct_answer_text = question.get('optionB', '')
                        elif correct_answer_letter == 'C':
                            correct_answer_text = question.get('optionC', '')
                        elif correct_answer_letter == 'D':
                            correct_answer_text = question.get('optionD', '')
                        current_app.logger.info(f"Using original answer mapping: {correct_answer_letter} -> {correct_answer_text}")
                    
                    # Check if student answer matches correct answer text (same as online tests)
                    is_correct = student_answer_text == correct_answer_text
                    score = 1 if is_correct else 0
                    
                    current_app.logger.info(f"MCQ question {i}: student_answer='{student_answer_text}', correct_answer_text='{correct_answer_text}', is_correct={is_correct}")
                    current_app.logger.info(f"Question {i} structure: correct_answer='{correct_answer_letter}', original_answer='{question.get('answer', '')}', options={question.get('optionA', '')[:20]}...")
                    
                    if is_correct:
                        correct_answers += 1
                    total_score += score
                    
                    # Store result in same format as online tests
                    result_data = {
                        'question_index': i,
                        'question_id': str(question.get('_id', i)),
                        'question': question['question'],
                        'question_type': 'mcq',
                        'student_answer': student_answer_text,
                        'correct_answer_letter': correct_answer_letter,
                        'correct_answer_text': correct_answer_text,
                        'is_correct': is_correct,
                        'score': score
                    }
                    
                    # Add options for display
                    if 'shuffled_options' in question:
                        result_data['options'] = question['shuffled_options']
                    else:
                        # Fallback to original options
                        result_data['options'] = {
                            'A': question.get('optionA', ''),
                            'B': question.get('optionB', ''),
                            'C': question.get('optionC', ''),
                            'D': question.get('optionD', '')
                        }
                    
                    results.append(result_data)
                else:
                    current_app.logger.warning(f"MCQ question {i}: answer key '{answer_key}' not found in data. Available keys: {list(data.keys())}")
                    # Add empty result for missing answer
                    empty_result = {
                        'question_index': i,
                        'question_id': str(question.get('_id', i)),
                        'question': question['question'],
                        'question_type': 'mcq',
                        'student_answer': '',
                        'correct_answer_letter': question.get('answer', ''),
                        'correct_answer_text': '',
                        'is_correct': False,
                        'score': 0
                    }
                    
                    # Add options for display
                    if 'shuffled_options' in question:
                        empty_result['options'] = question['shuffled_options']
                    else:
                        # Fallback to original options
                        empty_result['options'] = {
                            'A': question.get('optionA', ''),
                            'B': question.get('optionB', ''),
                            'C': question.get('optionC', ''),
                            'D': question.get('optionD', '')
                        }
                    
                    results.append(empty_result)
            elif question.get('question_type') in ['compiler', 'technical']:
                # Handle compiler/technical question
                answer_key = f'answer_{i}'
                current_app.logger.info(f"Compiler question {i}: looking for answer key '{answer_key}' in data")
                
                if answer_key in data:
                    import json
                    try:
                        # Parse the code submission
                        answer_data = json.loads(data[answer_key]) if isinstance(data[answer_key], str) else data[answer_key]
                        student_code = answer_data.get('code', '')
                        student_language = answer_data.get('language', question.get('language', 'python'))
                        
                        current_app.logger.info(f"Compiler question {i}: code length={len(student_code)}, language={student_language}")
                        
                        # Run code against test cases
                        from services.compiler_service import run_code_with_test_cases
                        
                        test_cases = question.get('test_cases', [])
                        test_results = run_code_with_test_cases(student_code, student_language, test_cases)
                        
                        # Calculate score based on passed test cases
                        passed_cases = sum(1 for tc in test_results['test_case_results'] if tc['passed'])
                        total_cases = len(test_results['test_case_results'])
                        score = (passed_cases / total_cases) if total_cases > 0 else 0
                        is_correct = passed_cases == total_cases
                        
                        if is_correct:
                            correct_answers += 1
                        total_score += score
                        
                        current_app.logger.info(f"Compiler question {i}: passed {passed_cases}/{total_cases} test cases, score={score}")
                        
                        # Store result
                        result_data = {
                            'question_index': i,
                            'question_id': str(question.get('_id', i)),
                            'question': question['question'],
                            'question_type': 'compiler',
                            'language': student_language,
                            'student_code': student_code,
                            'test_results': test_results['test_case_results'],
                            'passed_cases': passed_cases,
                            'total_cases': total_cases,
                            'is_correct': is_correct,
                            'score': score
                        }
                        
                        results.append(result_data)
                    except Exception as e:
                        current_app.logger.error(f"Error processing compiler question {i}: {e}")
                        # Add error result
                        results.append({
                            'question_index': i,
                            'question_id': str(question.get('_id', i)),
                            'question': question['question'],
                            'question_type': 'compiler',
                            'error': str(e),
                            'is_correct': False,
                            'score': 0
                        })
                else:
                    current_app.logger.warning(f"Compiler question {i}: answer key '{answer_key}' not found")
                    # Add empty result
                    results.append({
                        'question_index': i,
                        'question_id': str(question.get('_id', i)),
                        'question': question['question'],
                        'question_type': 'compiler',
                        'student_code': '',
                        'is_correct': False,
                        'score': 0
                    })
            else:
                current_app.logger.info(f"Non-MCQ/Compiler question {i}: type={question.get('question_type')}")
                # Handle audio question (Listening or Speaking)
                audio_key = f'question_{i}'
                current_app.logger.info(f"Looking for audio file with key: {audio_key}")
                current_app.logger.info(f"Available files: {list(files.keys())}")
                
                if audio_key not in files:
                    current_app.logger.error(f"Audio recording for question {i+1} not found. Expected key: {audio_key}")
                    return jsonify({
                        'success': False,
                        'message': f'Audio recording for question {i+1} is required. Expected key: {audio_key}'
                    }), 400
                
                audio_file = files[audio_key]
                current_app.logger.info(f"Found audio file for question {i}: {audio_file.filename}, size: {audio_file.content_length} bytes")
                
                # Save student audio to S3
                current_s3_client = get_s3_client_safe()
                if current_s3_client is None:
                    return jsonify({
                        'success': False,
                        'message': 'S3 client not available for audio upload. Please check AWS configuration.'
                    }), 500
                
                # Get file extension from the uploaded file or MIME type
                if '.' in audio_file.filename:
                    file_extension = audio_file.filename.split('.')[-1]
                elif audio_file.content_type and 'webm' in audio_file.content_type:
                    file_extension = 'webm'
                else:
                    file_extension = 'mp3'
                
                # Create unique audio key with question identifier
                question_identifier = question.get('question_id', f'q_{i}')
                student_audio_key = f"student_audio/{current_user_id}/{test_id}/{question_identifier}_{uuid.uuid4()}.{file_extension}"
                
                current_app.logger.info(f"Uploading audio for question {i}: {student_audio_key}")
                current_s3_client.upload_fileobj(audio_file, S3_BUCKET_NAME, student_audio_key)
                
                # Create full S3 URL for frontend access
                student_audio_url = f"https://{S3_BUCKET_NAME}.s3.amazonaws.com/{student_audio_key}"
                
                # Download for transcription
                temp_audio_path = f"temp_student_{question_identifier}_{uuid.uuid4()}.{file_extension}"
                current_s3_client.download_file(S3_BUCKET_NAME, student_audio_key, temp_audio_path)
                
                # Transcribe student audio
                try:
                    # Import the utility function to avoid naming conflict
                    from utils.audio_generator import transcribe_audio as transcribe_audio_util
                    
                    current_app.logger.info(f"Starting transcription for question {i}, file: {temp_audio_path}")
                    
                    # Check if file exists and has content
                    if not os.path.exists(temp_audio_path):
                        current_app.logger.error(f"Temporary audio file not found: {temp_audio_path}")
                        student_text = ""
                    elif os.path.getsize(temp_audio_path) == 0:
                        current_app.logger.error(f"Temporary audio file is empty: {temp_audio_path}")
                        student_text = ""
                    else:
                        current_app.logger.info(f"Audio file size: {os.path.getsize(temp_audio_path)} bytes")
                        student_text = transcribe_audio_util(temp_audio_path)
                        
                        if not student_text:
                            current_app.logger.warning(f"Transcription returned empty text for question {i}")
                            student_text = ""
                        else:
                            current_app.logger.info(f"Successfully transcribed question {i}: '{student_text[:100]}...'")
                            
                except Exception as e:
                    current_app.logger.error(f"Error transcribing audio for question {i}: {e}")
                    current_app.logger.error(f"Audio file path: {temp_audio_path}")
                    current_app.logger.error(f"File exists: {os.path.exists(temp_audio_path) if 'temp_audio_path' in locals() else 'N/A'}")
                    student_text = ""
                finally:
                    # Clean up temporary files
                    for temp_file in [temp_audio_path]:
                        if 'temp_file' in locals() and os.path.exists(temp_file):
                            try:
                                os.remove(temp_file)
                                current_app.logger.info(f"Cleaned up temporary file: {temp_file}")
                            except Exception as cleanup_error:
                                current_app.logger.error(f"Error cleaning up temporary file: {cleanup_error}")
                    
                    # Also clean up converted wav file if it exists
                    if 'transcription_path' in locals() and transcription_path != temp_audio_path and os.path.exists(transcription_path):
                        try:
                            os.remove(transcription_path)
                            current_app.logger.info(f"Cleaned up converted file: {transcription_path}")
                        except Exception as cleanup_error:
                            current_app.logger.error(f"Error cleaning up converted file: {cleanup_error}")
                
                # Get the original text to compare against
                original_text = question.get('question') or question.get('sentence', '')
                
                # Calculate similarity score
                try:
                    similarity_score = calculate_similarity_score(original_text, student_text)
                    # Convert percentage to decimal (0-1 scale)
                    similarity_score = similarity_score / 100.0
                except Exception as e:
                    current_app.logger.error(f"Error calculating similarity for question {i}: {e}")
                    similarity_score = 0.0
                
                # Determine if answer is correct based on module type
                is_correct = False
                score = 0
                
                if test.get('module_id') == 'LISTENING':
                    # For listening, check if similarity is above threshold
                    threshold = question.get('transcript_validation', {}).get('tolerance', 0.8)
                    is_correct = similarity_score >= threshold
                    score = similarity_score
                    current_app.logger.info(f"Listening question {i}: original='{original_text[:50]}...', student='{student_text[:50]}...', similarity={similarity_score:.3f}, threshold={threshold}, is_correct={is_correct}")
                elif test.get('module_id') == 'SPEAKING':
                    # For speaking, similar logic but with different threshold
                    threshold = question.get('transcript_validation', {}).get('tolerance', 0.7)
                    is_correct = similarity_score >= threshold
                    score = similarity_score
                    current_app.logger.info(f"Speaking question {i}: original='{original_text[:50]}...', student='{student_text[:50]}...', similarity={similarity_score:.3f}, threshold={threshold}, is_correct={is_correct}")
                
                if is_correct:
                    correct_answers += 1
                total_score += score
                
                results.append({
                    'question_index': i,
                    'question': question['question'],
                    'question_type': 'audio',
                    'student_audio_url': student_audio_url,
                    'student_text': student_text,
                    'original_text': original_text,
                    'similarity_score': similarity_score,
                    'is_correct': is_correct,
                    'score': score
                })
        
        # Calculate score and percentage - same logic as online tests
        total_questions = len(shuffled_questions)
        percentage = (total_score / total_questions) * 100 if total_questions > 0 else 0
        current_app.logger.info(f"Test results: total_score={total_score}, total_questions={total_questions}, percentage={percentage:.2f}%, correct_answers={correct_answers}")
        
        # Create attempt record first - same approach as online tests
        current_time = datetime.now(timezone.utc)
        
        # For grammar tests, set level_id based on subcategory
        level_id = test.get('level_id')
        if test.get('module_id') == 'GRAMMAR' and test.get('subcategory'):
            level_id = f'GRAMMAR_{test.get("subcategory")}'
        
        attempt_doc = {
            'test_id': test_id,
            'student_id': ObjectId(current_user_id),
            'test_type': 'practice',
            'module_id': test.get('module_id'),
            'subcategory': test.get('subcategory'),
            'level_id': level_id,
            'start_time': current_time,
            'end_time': current_time,
            'status': 'completed',
            'answers': {f'answer_{i}': data.get(f'answer_{i}', '') for i in range(total_questions)},
            'score': total_score,
            'total_questions': total_questions,
            'correct_answers': correct_answers,
            'percentage': percentage,
            'score_percentage': percentage,  # Add score_percentage for compatibility
            'average_score': percentage / 100.0,  # Add average_score for compatibility
            'detailed_results': results,
            'duration_seconds': 0,  # Practice tests don't track time
            'submitted_at': current_time
        }
        
        current_app.logger.info(f"Saving test attempt: {attempt_doc}")
        
        # Save to student_test_attempts collection
        mongo_db.student_test_attempts.insert_one(attempt_doc)
        current_app.logger.info("Test attempt saved to student_test_attempts collection")
        
        # Also save to test_results collection for compatibility with existing endpoints
        test_result_doc = {
            'test_id': test_id,
            'student_id': current_user_id,
            'test_name': test.get('name', f"Practice Test - {test.get('module_id', 'Unknown')}"),
            'test_type': 'practice',
            'module_id': test.get('module_id'),
            'subcategory': test.get('subcategory'),
            'level_id': test.get('level_id'),
            'score': total_score,
            'percentage': percentage,
            'correct_answers': correct_answers,
            'total_questions': total_questions,
            'results': results,
            'submitted_at': current_time,
            'time_taken': None,  # Practice tests don't track time
            'status': 'completed'
        }
        
        try:
            mongo_db.test_results.insert_one(test_result_doc)
            current_app.logger.info("Test result also saved to test_results collection")
        except Exception as e:
            current_app.logger.warning(f"Could not save to test_results collection: {e}")
        
        current_app.logger.info("Test result saved successfully")
        
        # Update student progress and check for level unlocks
        try:
            from utils.student_progress_manager import StudentProgressManager
            progress_manager = StudentProgressManager(mongo_db)
            
            # Get level_id from test
            level_id = test.get('level_id') or test.get('subcategory')
            if level_id:
                # Convert score to percentage if needed
                score_percentage = percentage if percentage <= 100 else (total_score / total_questions * 100)
                
                # Update progress and check for unlocks
                progress_updated = progress_manager.update_student_progress_on_test_completion(
                    student_id=student['_id'],
                    level_id=level_id,
                    score=score_percentage,
                    test_id=test_id
                )
                
                if progress_updated:
                    current_app.logger.info(f"Student progress updated for level {level_id} with score {score_percentage}")
                else:
                    current_app.logger.warning(f"Failed to update student progress for level {level_id}")
            else:
                current_app.logger.warning("No level_id found in test, skipping progress update")
                
        except Exception as progress_error:
            current_app.logger.error(f"Error updating student progress: {progress_error}")
            # Don't fail the test submission if progress update fails
        
        return jsonify({
            'success': True,
            'message': 'Test submitted successfully',
            'data': {
                'score': total_score,
                'total_questions': total_questions,
                'correct_answers': correct_answers,
                'percentage': percentage,
                'results': results,  # Include the detailed results array
                'test_type': 'practice',
                'module_id': test.get('module_id')
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
def transcribe_audio_endpoint():
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
            # Import the utility function to avoid naming conflict
            from utils.audio_generator import transcribe_audio as transcribe_audio_util
            
            # Transcribe the audio
            transcribed_text = transcribe_audio_util(temp_path)
            
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
    """
    Get all CRT topics with completion statistics
    
    Query parameters:
    - batch_ids: comma-separated list of batch IDs to filter usage by
    - course_ids: comma-separated list of course IDs to filter usage by
    """
    try:
        # Get filter parameters from query string
        batch_ids_filter = request.args.get('batch_ids', '').strip()
        course_ids_filter = request.args.get('course_ids', '').strip()
        
        filter_batch_ids = []
        if batch_ids_filter:
            try:
                filter_batch_ids = [ObjectId(bid.strip()) for bid in batch_ids_filter.split(',') if bid.strip()]
                current_app.logger.info(f"CRT Topics API - Filtering by {len(filter_batch_ids)} batch_ids")
            except Exception as e:
                current_app.logger.warning(f"Invalid batch_ids filter: {e}")
        
        filter_course_ids = []
        if course_ids_filter:
            try:
                filter_course_ids = [ObjectId(cid.strip()) for cid in course_ids_filter.split(',') if cid.strip()]
                current_app.logger.info(f"CRT Topics API - Filtering by {len(filter_course_ids)} course_ids")
            except Exception as e:
                current_app.logger.warning(f"Invalid course_ids filter: {e}")
        
        # Log filter status
        if filter_batch_ids or filter_course_ids:
            current_app.logger.info(f"CRT Topics API - Applying filters: batch_ids={len(filter_batch_ids)}, course_ids={len(filter_course_ids)}")
        else:
            current_app.logger.info("CRT Topics API - No filters provided, using global usage")
        
        topics = list(mongo_db.crt_topics.find({}).sort('created_at', -1))
        
        for topic in topics:
            topic_id = topic['_id']
            
            # Count total questions for this topic
            total_questions = mongo_db.question_bank.count_documents({
                'topic_id': topic_id,
                'module_id': {'$in': ['CRT_APTITUDE', 'CRT_REASONING', 'CRT_TECHNICAL']}
            })
            
            # Calculate used_questions based on filters
            if filter_batch_ids or filter_course_ids:
                # If filters are provided, calculate usage only for tests that match the filters
                # Get all questions in this topic
                topic_questions = list(mongo_db.question_bank.find({
                    'topic_id': topic_id,
                    'module_id': {'$in': ['CRT_APTITUDE', 'CRT_REASONING', 'CRT_TECHNICAL']}
                }))
                
                if not topic_questions:
                    used_questions = 0
                else:
                    question_ids = [q['_id'] for q in topic_questions]
                    question_ids_set = set(question_ids)
                    
                    # Get all test IDs that use these questions
                    test_ids_from_questions = set()
                    for question in topic_questions:
                        used_in_tests = question.get('used_in_tests', [])
                        for test_ref in used_in_tests:
                            if isinstance(test_ref, ObjectId):
                                test_ids_from_questions.add(test_ref)
                            elif isinstance(test_ref, str):
                                try:
                                    test_ids_from_questions.add(ObjectId(test_ref))
                                except Exception:
                                    pass
                    
                    # Fetch tests that use these questions
                    tests_using_topic = []
                    if test_ids_from_questions:
                        tests_using_topic = list(mongo_db.tests.find({'_id': {'$in': list(test_ids_from_questions)}}))
                    
                    # If no tests found via used_in_tests, fall back to checking all tests (less efficient but comprehensive)
                    if not tests_using_topic:
                        all_tests = list(mongo_db.tests.find({}))
                        tests_using_topic = all_tests
                    
                    # Filter tests by batch_ids and course_ids and collect used question IDs
                    # Track usage per batch+course combination (like topic-usage endpoint does)
                    filtered_used_question_ids = set()
                    
                    for test in tests_using_topic:
                        test_batches = test.get('batch_ids', [])
                        test_courses = test.get('course_ids', [])
                        
                        if not test_batches or not test_courses:
                            continue
                        
                        # Normalize test batch_ids and course_ids to ObjectIds for comparison
                        test_batch_obj_ids = []
                        for bid in test_batches:
                            if isinstance(bid, ObjectId):
                                test_batch_obj_ids.append(bid)
                            elif isinstance(bid, str):
                                try:
                                    test_batch_obj_ids.append(ObjectId(bid))
                                except Exception:
                                    pass
                        
                        test_course_obj_ids = []
                        for cid in test_courses:
                            if isinstance(cid, ObjectId):
                                test_course_obj_ids.append(cid)
                            elif isinstance(cid, str):
                                try:
                                    test_course_obj_ids.append(ObjectId(cid))
                                except Exception:
                                    pass
                        
                        # Get questions from this test that belong to our topic
                        test_questions = test.get('questions', [])
                        if not test_questions:
                            continue
                        
                        topic_questions_in_test = []
                        for tq in test_questions:
                            tq_id = tq.get('_id') if isinstance(tq, dict) else tq
                            if isinstance(tq_id, str):
                                try:
                                    tq_id = ObjectId(tq_id)
                                except Exception:
                                    continue
                            
                            if tq_id in question_ids_set:
                                topic_questions_in_test.append(tq_id)
                        
                        if not topic_questions_in_test:
                            continue
                        
                        # Track usage per batch+course combination
                        # Only count questions for batch+course combinations that match our filters
                        # This matches the logic from topic-usage endpoint
                        for batch_id in test_batch_obj_ids:
                            # Check if this batch matches our filter
                            # If filter_batch_ids is provided, batch must be in the filter
                            # If filter_batch_ids is empty, match all batches
                            if filter_batch_ids and batch_id not in filter_batch_ids:
                                continue  # Skip this batch if it doesn't match
                            
                            for course_id in test_course_obj_ids:
                                # Check if this course matches our filter
                                # If filter_course_ids is provided, course must be in the filter
                                # If filter_course_ids is empty, match all courses
                                if filter_course_ids and course_id not in filter_course_ids:
                                    continue  # Skip this course if it doesn't match
                                
                                # Both batch and course match (or filters are empty)
                                # Add all topic questions from this test for this specific batch+course combination
                                for tq_id in topic_questions_in_test:
                                    filtered_used_question_ids.add(tq_id)
                    
                    used_questions = len(filtered_used_question_ids)
                    current_app.logger.info(f"Topic {topic.get('topic_name', 'unknown')} - Filtered usage: {used_questions}/{total_questions} questions")
            else:
                # No filters - use global count
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
            topic['created_at'] = safe_isoformat(topic['created_at']) if topic['created_at'] else None
        
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
        topic_doc['created_at'] = safe_isoformat(topic_doc['created_at'])
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
        topic['created_at'] = safe_isoformat(topic['created_at']) if topic['created_at'] else None
        
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
    """Delete a CRT topic and cascade delete all associated questions"""
    try:
        # Check if topic exists
        existing_topic = mongo_db.crt_topics.find_one({'_id': ObjectId(topic_id)})
        if not existing_topic:
            return jsonify({
                'success': False,
                'message': 'Topic not found'
            }), 404
        
        # Count questions before deletion for response message
        question_count = mongo_db.question_bank.count_documents({
            'topic_id': ObjectId(topic_id)
        })
        
        # Cascade delete: Delete all questions associated with this topic first
        if question_count > 0:
            delete_result = mongo_db.question_bank.delete_many({
                'topic_id': ObjectId(topic_id)
            })
            current_app.logger.info(f"Deleted {delete_result.deleted_count} questions for topic {topic_id}")
        
        # Delete the topic
        result = mongo_db.crt_topics.delete_one({'_id': ObjectId(topic_id)})
        
        if result.deleted_count == 0:
            return jsonify({
                'success': False,
                'message': 'Failed to delete topic'
            }), 500
        
        # Return success message with details about deleted questions
        message = 'Topic deleted successfully'
        if question_count > 0:
            message = f'Topic and {question_count} associated question(s) deleted successfully'
        
        return jsonify({
            'success': True,
            'message': message,
            'deleted_questions_count': question_count
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
                question['created_at'] = safe_isoformat(question['created_at'])
        
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
        
        # Validate questions and check for duplicates
        valid_questions = []
        duplicate_questions = []
        invalid_questions = []
        
        # Get existing questions for duplicate checking within this topic
        existing_questions = list(mongo_db.question_bank.find(
            {'topic_id': ObjectId(topic_id)},
            {'question': 1, 'questionTitle': 1, '_id': 0}
        ))
        
        # Create sets for duplicate checking based on question type
        existing_question_texts = set()
        existing_question_titles = set()
        
        for q in existing_questions:
            if 'question' in q and q['question']:
                existing_question_texts.add(q['question'].strip().lower())
            if 'questionTitle' in q and q['questionTitle']:
                existing_question_titles.add(q['questionTitle'].strip().lower())
        
        # Track questions within the file to detect duplicates
        seen_questions_in_file = set()
        seen_titles_in_file = set()
        
        for i, question in enumerate(questions):
            # Basic validation based on topic's module type
            is_valid = True
            validation_reason = ""
            
            if topic['module_id'] == 'CRT_TECHNICAL':
                question_type = question.get('questionType', 'compiler_integrated')
                if question_type == 'compiler_integrated':
                    # Compiler-integrated technical question
                    if not (question.get('question') and question.get('testCases') and question.get('expectedOutput')):
                        is_valid = False
                        validation_reason = "Missing required fields (question, testCases, or expectedOutput)"
                else:
                    # MCQ technical question
                    if not (question.get('question') and question.get('optionA') and question.get('optionB') and 
                           question.get('optionC') and question.get('optionD') and question.get('answer')):
                        is_valid = False
                        validation_reason = "Missing required fields (question, options, or answer)"
            else:
                # CRT_APTITUDE and CRT_REASONING - MCQ format
                if not (question.get('question') and question.get('optionA') and question.get('optionB') and 
                       question.get('optionC') and question.get('optionD') and question.get('answer')):
                    is_valid = False
                    validation_reason = "Missing required fields (question, options, or answer)"
            
            if not is_valid:
                invalid_questions.append({
                    'index': i + 1,
                    'question': question.get('question', question.get('questionTitle', '')),
                    'reason': validation_reason
                })
                continue
            
            # Check for duplicates within the file first
            question_text = question.get('question', '').strip().lower()
            question_title = question.get('questionTitle', '').strip().lower()
            
            if question_text in seen_questions_in_file or question_title in seen_titles_in_file:
                duplicate_questions.append({
                    'index': i + 1,
                    'question': question.get('question', question.get('questionTitle', '')),
                    'reason': 'Duplicate question within the same file'
                })
                continue
            
            # Check for duplicates against database
            if question_text in existing_question_texts or question_title in existing_question_titles:
                duplicate_questions.append({
                    'index': i + 1,
                    'question': question.get('question', question.get('questionTitle', '')),
                    'reason': 'Question already exists in this topic'
                })
                continue
            
            # Add to valid questions and mark as seen
            valid_questions.append(question)
            if question_text:
                seen_questions_in_file.add(question_text)
            if question_title:
                seen_titles_in_file.add(question_title)
        
        if not valid_questions:
            return jsonify({
                'success': False, 
                'message': 'No valid questions found in upload',
                'details': {
                    'total_questions': len(questions),
                    'valid_questions': 0,
                    'duplicate_questions': len(duplicate_questions),
                    'invalid_questions': len(invalid_questions),
                    'duplicates': duplicate_questions,
                    'invalid': invalid_questions
                }
            }), 400
        
        # Process and insert valid questions
        processed_questions = []
        for question in valid_questions:
            # Add topic_id to each question
            question['topic_id'] = ObjectId(topic_id)
            question['created_at'] = datetime.utcnow()
            question['used_count'] = 0
            
            # Ensure module_id matches the topic's module
            if 'module_id' not in question or question['module_id'] != topic['module_id']:
                question['module_id'] = topic['module_id']
            
            # Handle question type based on module
            if topic['module_id'] == 'CRT_TECHNICAL':
                question_type = question.get('questionType', question.get('question_type', 'compiler_integrated'))
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
            else:
                # For CRT_APTITUDE and CRT_REASONING, always set question_type to 'mcq'
                question['question_type'] = question.get('question_type', 'mcq')
                # Ensure answer is uppercase
                if 'answer' in question and question['answer']:
                    question['answer'] = str(question['answer']).strip().upper()
            
            processed_questions.append(question)
        
        # Insert questions into question bank
        if processed_questions:
            result = mongo_db.question_bank.insert_many(processed_questions)
            
            # Prepare detailed response
            response_data = {
                'success': True,
                'message': f'Successfully added {len(result.inserted_ids)} questions to topic',
                'count': len(result.inserted_ids),
                'data': {
                    'inserted_count': len(result.inserted_ids),
                    'topic_id': topic_id,
                    'topic_name': topic['topic_name']
                },
                'details': {
                    'total_questions': len(questions),
                    'valid_questions': len(valid_questions),
                    'duplicate_questions': len(duplicate_questions),
                    'invalid_questions': len(invalid_questions),
                    'duplicates': duplicate_questions,
                    'invalid': invalid_questions
                }
            }
            
            return jsonify(response_data), 201
        else:
            return jsonify({
                'success': False,
                'message': 'No valid questions to add',
                'details': {
                    'total_questions': len(questions),
                    'valid_questions': 0,
                    'duplicate_questions': len(duplicate_questions),
                    'invalid_questions': len(invalid_questions),
                    'duplicates': duplicate_questions,
                    'invalid': invalid_questions
                }
            }), 400
        
    except Exception as e:
        current_app.logger.error(f"Error adding questions to topic: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Failed to add questions to topic: {str(e)}'
        }), 500


@test_management_bp.route('/question-usage/<question_id>', methods=['GET'])
@jwt_required()
@require_superadmin
def get_question_usage_details(question_id):
    """
    Get usage details for a specific question:
    - which tests used it
    - which courses and batches those tests were assigned to
    """
    try:
        try:
            question_obj_id = ObjectId(question_id)
        except Exception:
            return jsonify({
                'success': False,
                'message': 'Invalid question ID'
            }), 400

        question = mongo_db.question_bank.find_one({'_id': question_obj_id})
        if not question:
            return jsonify({
                'success': False,
                'message': 'Question not found'
            }), 404

        used_in_tests = question.get('used_in_tests', [])
        if not used_in_tests:
            # No usage yet, return basic info
            return jsonify({
                'success': True,
                'question_id': str(question['_id']),
                'question_text': question.get('question', ''),
                'total_uses': 0,
                'tests': [],
                'courses': [],
                'batches': []
            }), 200

        # Normalize test IDs (they may be stored as custom IDs or ObjectIds)
        test_ids = []
        for t_id in used_in_tests:
            if isinstance(t_id, ObjectId):
                test_ids.append(t_id)
            else:
                # Try to parse as ObjectId, otherwise keep as string for matching by custom id
                try:
                    test_ids.append(ObjectId(t_id))
                except Exception:
                    # Some flows use custom_test_id string; handle via separate query
                    pass

        # Fetch tests by ObjectId
        tests_by_object_id = []
        if test_ids:
            tests_by_object_id = list(mongo_db.tests.find({'_id': {'$in': test_ids}}))

        # Fetch tests by custom test_id string if needed
        string_test_ids = [t for t in used_in_tests if not isinstance(t, ObjectId)]
        tests_by_custom_id = []
        if string_test_ids:
            tests_by_custom_id = list(mongo_db.tests.find({'custom_test_id': {'$in': string_test_ids}}))

        all_tests = tests_by_object_id + tests_by_custom_id

        usage_tests = []
        course_ids = set()
        batch_ids = set()

        for test in all_tests:
            # Normalize IDs to string
            test_id_str = str(test.get('_id'))
            module_id = test.get('module_id')
            level_id = test.get('level_id')
            name = test.get('name') or test.get('test_name', '')

            campuses = test.get('campus_ids') or []
            batches = test.get('batch_ids') or []
            courses = test.get('course_ids') or []

            # Accumulate unique course and batch IDs
            for c in courses:
                course_ids.add(str(c))
            for b in batches:
                batch_ids.add(str(b))

            usage_tests.append({
                'test_id': test_id_str,
                'name': name,
                'module_id': module_id,
                'level_id': level_id,
                'campus_ids': [str(c) for c in campuses],
                'batch_ids': [str(b) for b in batches],
                'course_ids': [str(c) for c in courses],
                'created_at': safe_isoformat(test.get('created_at')) if test.get('created_at') else None,
                'endDateTime': safe_isoformat(test.get('endDateTime')) if test.get('endDateTime') else None,
            })

        return jsonify({
            'success': True,
            'question_id': str(question['_id']),
            'question_text': question.get('question', ''),
            'total_uses': len(usage_tests),
            'tests': usage_tests,
            'courses': list(course_ids),
            'batches': list(batch_ids),
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error getting question usage details: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Failed to get question usage details: {str(e)}'
        }), 500

@test_management_bp.route('/topic-usage/<topic_id>', methods=['GET'])
@jwt_required()
@require_superadmin
def get_topic_usage_details(topic_id):
    """
    Get usage details for a specific topic:
    - which tests used questions from this topic
    - which courses and batches those tests were assigned to
    - percentage of topic questions used by each batch/course combination
    
    Query parameters:
    - batch_ids: comma-separated list of batch IDs to filter by
    - course_ids: comma-separated list of course IDs to filter by
    """
    try:
        # Get filter parameters from query string
        batch_ids_filter = request.args.get('batch_ids', '').strip()
        course_ids_filter = request.args.get('course_ids', '').strip()
        
        filter_batch_ids = []
        if batch_ids_filter:
            try:
                filter_batch_ids = [ObjectId(bid.strip()) for bid in batch_ids_filter.split(',') if bid.strip()]
            except Exception as e:
                current_app.logger.warning(f"Invalid batch_ids filter: {e}")
        
        filter_course_ids = []
        if course_ids_filter:
            try:
                filter_course_ids = [ObjectId(cid.strip()) for cid in course_ids_filter.split(',') if cid.strip()]
            except Exception as e:
                current_app.logger.warning(f"Invalid course_ids filter: {e}")
        try:
            topic_obj_id = ObjectId(topic_id)
        except Exception:
            return jsonify({
                'success': False,
                'message': 'Invalid topic ID'
            }), 400

        topic = mongo_db.crt_topics.find_one({'_id': topic_obj_id})
        if not topic:
            return jsonify({
                'success': False,
                'message': 'Topic not found'
            }), 404

        # Get all questions in this topic
        topic_questions = list(mongo_db.question_bank.find({
            'topic_id': topic_obj_id,
            'module_id': {'$in': ['CRT_APTITUDE', 'CRT_REASONING', 'CRT_TECHNICAL']}
        }))
        
        total_questions_in_topic = len(topic_questions)
        
        if total_questions_in_topic == 0:
            return jsonify({
                'success': True,
                'topic_id': str(topic['_id']),
                'topic_name': topic.get('topic_name', ''),
                'total_questions': 0,
                'total_uses': 0,
                'batch_course_usage': [],
                'tests': [],
                'courses': [],
                'batches': []
            }), 200

        # Get all question IDs from this topic
        question_ids = [q['_id'] for q in topic_questions]
        question_ids_set = set(question_ids)
        
        # Find all tests that used questions from this topic
        # First, get all test IDs that use these questions from the question_bank's used_in_tests field
        # This is more efficient than checking all tests
        test_ids_from_questions = set()
        for question in topic_questions:
            used_in_tests = question.get('used_in_tests', [])
            for test_ref in used_in_tests:
                if isinstance(test_ref, ObjectId):
                    test_ids_from_questions.add(test_ref)
                elif isinstance(test_ref, str):
                    try:
                        test_ids_from_questions.add(ObjectId(test_ref))
                    except Exception:
                        # Try to find by custom_test_id if ObjectId conversion fails
                        pass
        
        # Fetch tests by ObjectId
        tests_by_object_id = []
        if test_ids_from_questions:
            tests_by_object_id = list(mongo_db.tests.find({'_id': {'$in': list(test_ids_from_questions)}}))
        
        # Also check tests by custom_test_id if any string IDs remain
        # For now, we'll use the tests we found and verify questions match
        all_tests = tests_by_object_id
        
        # If no tests found via used_in_tests, fall back to checking all tests (less efficient but comprehensive)
        if not all_tests:
            all_tests = list(mongo_db.tests.find({}))
        
        usage_tests = []
        batch_course_usage = {}  # {batch_id: {course_id: {used: count, total: total_questions_in_topic}}}
        course_ids = set()
        batch_ids = set()
        
        for test in all_tests:
            test_questions = test.get('questions', [])
            if not test_questions:
                continue
            
            # Check if any question in this test belongs to our topic
            topic_questions_in_test = []
            for tq in test_questions:
                tq_id = tq.get('_id') if isinstance(tq, dict) else tq
                if isinstance(tq_id, str):
                    try:
                        tq_id = ObjectId(tq_id)
                    except Exception:
                        continue
                
                if tq_id in question_ids_set:
                    topic_questions_in_test.append(tq_id)
            
            if not topic_questions_in_test:
                continue
            
            # This test uses questions from our topic
            test_id_str = str(test.get('_id'))
            module_id = test.get('module_id')
            level_id = test.get('level_id')
            name = test.get('name') or test.get('test_name', '')
            
            campuses = test.get('campus_ids') or []
            batches = test.get('batch_ids') or []
            courses = test.get('course_ids') or []
            
            # Track usage per batch-course combination
            for batch_id in batches:
                batch_id_str = str(batch_id)
                batch_ids.add(batch_id_str)
                
                for course_id in courses:
                    course_id_str = str(course_id)
                    course_ids.add(course_id_str)
                    
                    # Initialize batch-course entry if not exists
                    if batch_id_str not in batch_course_usage:
                        batch_course_usage[batch_id_str] = {}
                    if course_id_str not in batch_course_usage[batch_id_str]:
                        batch_course_usage[batch_id_str][course_id_str] = {
                            'used_questions': set(),
                            'total_questions': total_questions_in_topic
                        }
                    
                    # Add used question IDs to the set (to avoid duplicates)
                    batch_course_usage[batch_id_str][course_id_str]['used_questions'].update(
                        [str(qid) for qid in topic_questions_in_test]
                    )
            
            usage_tests.append({
                'test_id': test_id_str,
                'name': name,
                'module_id': module_id,
                'level_id': level_id,
                'campus_ids': [str(c) for c in campuses],
                'batch_ids': [str(b) for b in batches],
                'course_ids': [str(c) for c in courses],
                'topic_questions_used': len(topic_questions_in_test),
                'created_at': safe_isoformat(test.get('created_at')) if test.get('created_at') else None,
                'endDateTime': safe_isoformat(test.get('endDateTime')) if test.get('endDateTime') else None,
            })
        
        # Convert batch_course_usage to list format with percentages
        # Filter by batch_ids and course_ids if provided
        batch_course_usage_list = []
        for batch_id, courses_dict in batch_course_usage.items():
            # Filter by batch_ids if provided
            if filter_batch_ids:
                try:
                    batch_obj_id = ObjectId(batch_id)
                    if batch_obj_id not in filter_batch_ids:
                        continue
                except Exception:
                    continue
            
            # Get batch details
            try:
                batch = mongo_db.batches.find_one({'_id': ObjectId(batch_id)})
                batch_name = batch.get('name', 'Unknown Batch') if batch else 'Unknown Batch'
            except Exception:
                batch_name = 'Unknown Batch'
            
            for course_id, usage_data in courses_dict.items():
                # Filter by course_ids if provided
                if filter_course_ids:
                    try:
                        course_obj_id = ObjectId(course_id)
                        if course_obj_id not in filter_course_ids:
                            continue
                    except Exception:
                        continue
                
                # Get course details
                try:
                    course = mongo_db.courses.find_one({'_id': ObjectId(course_id)})
                    course_name = course.get('name', 'Unknown Course') if course else 'Unknown Course'
                except Exception:
                    course_name = 'Unknown Course'
                
                used_count = len(usage_data['used_questions'])
                total_count = usage_data['total_questions']
                percentage = (used_count / total_count * 100) if total_count > 0 else 0
                
                batch_course_usage_list.append({
                    'batch_id': batch_id,
                    'batch_name': batch_name,
                    'course_id': course_id,
                    'course_name': course_name,
                    'used_questions': used_count,
                    'total_questions': total_count,
                    'percentage': round(percentage, 2),
                    'is_fully_used': percentage >= 100
                })
        
        # Also filter usage_tests by batch_ids and course_ids if provided
        filtered_usage_tests = usage_tests
        if filter_batch_ids or filter_course_ids:
            filtered_usage_tests = []
            for test in usage_tests:
                test_batch_ids = [ObjectId(bid) for bid in test.get('batch_ids', []) if bid]
                test_course_ids = [ObjectId(cid) for cid in test.get('course_ids', []) if cid]
                
                # Check if test matches filters
                matches_batch = not filter_batch_ids or any(bid in filter_batch_ids for bid in test_batch_ids)
                matches_course = not filter_course_ids or any(cid in filter_course_ids for cid in test_course_ids)
                
                if matches_batch and matches_course:
                    filtered_usage_tests.append(test)
        
        # Sort by percentage descending
        batch_course_usage_list.sort(key=lambda x: x['percentage'], reverse=True)
        
        return jsonify({
            'success': True,
            'topic_id': str(topic['_id']),
            'topic_name': topic.get('topic_name', ''),
            'total_questions': total_questions_in_topic,
            'total_uses': len(filtered_usage_tests),
            'batch_course_usage': batch_course_usage_list,
            'tests': filtered_usage_tests,
            'courses': list(course_ids),
            'batches': list(batch_ids),
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error getting topic usage details: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Failed to get topic usage details: {str(e)}'
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
                file['uploaded_at'] = safe_isoformat(file['uploaded_at'])
        
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
        # Get module_id and topic_id from query parameters
        module_id = request.args.get('module_id')
        topic_id = request.args.get('topic_id')
        
        current_app.logger.info(f"Fetching questions for file_id: {file_id}, module_id: {module_id}, topic_id: {topic_id}")
        
        # Build query based on available parameters
        query = {}
        
        # First try to find by upload_session_id
        questions = list(mongo_db.question_bank.find({
            'upload_session_id': file_id
        }).sort('created_at', -1))
        
        # If no questions found by upload_session_id and we have module_id and topic_id, use those
        if not questions and module_id and topic_id:
            query = {
                'module_id': module_id,
                'topic_id': ObjectId(topic_id) if topic_id else None
            }
            # Remove None values from query
            query = {k: v for k, v in query.items() if v is not None}
            
            if query:
                questions = list(mongo_db.question_bank.find(query).sort('created_at', -1))
                current_app.logger.info(f"Found {len(questions)} questions by module_id and topic_id: {query}")
        
        # If still no questions and we only have module_id, try that
        if not questions and module_id and not topic_id:
            query = {'module_id': module_id}
            questions = list(mongo_db.question_bank.find(query).sort('created_at', -1))
            current_app.logger.info(f"Found {len(questions)} questions by module_id only: {query}")
        
        # Convert ObjectIds to strings
        for question in questions:
            question['_id'] = str(question['_id'])
            if question.get('topic_id'):
                question['topic_id'] = str(question['topic_id'])
            if question.get('created_at'):
                question['created_at'] = safe_isoformat(question['created_at'])
        
        current_app.logger.info(f"Returning {len(questions)} questions for file_id: {file_id}")
        
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
        
        # Check if this is a technical compiler-integrated format
        is_technical_compiler = (module_id == 'CRT_TECHNICAL' and question_type == 'compiler')
        
        # Read and parse the file
        questions = []
        
        if file.filename.endswith('.csv'):
            import csv
            import io
            content = file.read().decode('utf-8')
            csv_reader = csv.DictReader(io.StringIO(content))
            
            if is_technical_compiler:
                # Parse compiler-integrated format
                questions_dict = {}  # Group test cases by question title
                
                for row in csv_reader:
                    question_title = row.get('QuestionTitle', '').strip()
                    if not question_title:
                        continue
                    
                    # Create test case
                    test_case = {
                        'input': row.get('Input', ''),
                        'expected_output': row.get('ExpectedOutput', ''),
                        'points': int(row.get('Points', 5)),
                        'is_sample': row.get('IsSample', 'false').lower() == 'true'
                    }
                    
                    # Group by question title
                    if question_title not in questions_dict:
                        questions_dict[question_title] = {
                            'question': f"{question_title}: {row.get('ProblemStatement', '')}",
                            'question_type': 'technical',
                            'language': row.get('Language', 'python'),
                            'instructions': row.get('Instructions', ''),
                            'test_cases': []
                        }
                    
                    questions_dict[question_title]['test_cases'].append(test_case)
                
                # Convert dict to list
                questions = list(questions_dict.values())
            else:
                # Parse MCQ format
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
        elif file.filename.endswith(('.xlsx', '.xls')):
            # Handle Excel files
            import pandas as pd
            import io
            
            # Read Excel file with proper encoding handling
            try:
                # Try different encodings
                file.seek(0)  # Reset file pointer
                df = pd.read_excel(file, engine='openpyxl')
            except Exception as e:
                # If openpyxl fails, try xlrd for older Excel files
                file.seek(0)
                try:
                    df = pd.read_excel(file, engine='xlrd')
                except Exception as e2:
                    return jsonify({'success': False, 'message': f'Failed to read Excel file: {str(e2)}'}), 400
            
            # Convert DataFrame to list of dictionaries
            for _, row in df.iterrows():
                question = {
                    'question': str(row.get('Question', row.get('question', ''))),
                    'optionA': str(row.get('OptionA', row.get('A', ''))),
                    'optionB': str(row.get('OptionB', row.get('B', ''))),
                    'optionC': str(row.get('OptionC', row.get('C', ''))),
                    'optionD': str(row.get('OptionD', row.get('D', ''))),
                    'answer': str(row.get('Answer', row.get('answer', ''))),
                    'instructions': str(row.get('Instructions', row.get('instructions', '')))
                }
                questions.append(question)
        elif file.filename.endswith('.txt'):
            content = file.read().decode('utf-8')
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
        
        # Validate questions and check for duplicates within file only
        # For manual test paper uploads, we don't check against database duplicates
        valid_questions = []
        duplicate_questions = []
        invalid_questions = []
        
        # Track questions within the file to detect duplicates
        seen_questions_in_file = set()
        
        for i, q in enumerate(questions):
            # Basic validation - different for technical vs MCQ
            if is_technical_compiler:
                # Validate technical compiler questions
                if not q.get('question') or not q.get('test_cases'):
                    invalid_questions.append({
                        'index': i + 1,
                        'question': q.get('question', ''),
                        'reason': 'Missing required fields (question or test_cases)'
                    })
                    continue
                
                # Validate test cases
                if len(q.get('test_cases', [])) == 0:
                    invalid_questions.append({
                        'index': i + 1,
                        'question': q.get('question', ''),
                        'reason': 'No test cases defined'
                    })
                    continue
            else:
                # Validate MCQ questions
                if not (q.get('question') and q.get('optionA') and q.get('optionB') and 
                       q.get('optionC') and q.get('optionD') and q.get('answer')):
                    invalid_questions.append({
                        'index': i + 1,
                        'question': q.get('question', ''),
                        'reason': 'Missing required fields (question, options, or answer)'
                    })
                    continue
            
            # Check for duplicates within the file only
            question_text = q['question'].strip().lower()
            if question_text in seen_questions_in_file:
                duplicate_questions.append({
                    'index': i + 1,
                    'question': q['question'],
                    'reason': 'Duplicate question within the same file'
                })
                continue
            
            # Add to valid questions and mark as seen
            valid_questions.append(q)
            seen_questions_in_file.add(question_text)
        
        if not valid_questions:
            return jsonify({
                'success': False, 
                'message': 'No valid questions found in file',
                'details': {
                    'total_questions': len(questions),
                    'valid_questions': 0,
                    'duplicate_questions': len(duplicate_questions),
                    'invalid_questions': len(invalid_questions),
                    'duplicates': duplicate_questions,
                    'invalid': invalid_questions
                }
            }), 400
        
        # Check for existing questions in database and prepare questions for test creation
        # This allows the same questions to be used even if they exist in the question bank
        
        # Get existing questions for status checking
        existing_questions = list(mongo_db.question_bank.find(
            {'module_id': module_id, 'level_id': level_id, 'question_type': question_type},
            {'question': 1, '_id': 1, 'used_count': 1}
        ))
        existing_question_texts = {q['question'].strip().lower(): str(q['_id']) for q in existing_questions}
        existing_question_objects = {q['question'].strip().lower(): q['_id'] for q in existing_questions}
        
        # Prepare questions for test creation with status information
        formatted_questions = []
        new_questions_to_store = []
        
        # First, prepare new questions for storage
        for q in valid_questions:
            question_text_lower = q['question'].strip().lower()
            is_existing = question_text_lower in existing_question_texts
            
            # If it's a new question, prepare it for storage
            if not is_existing:
                new_question_doc = {
                    'module_id': module_id,
                    'level_id': level_id,
                    'question_type': question_type,
                    'question': q['question'],
                    'used_in_tests': [],
                    'used_count': 0,
                    'last_used': None,
                    'created_at': datetime.utcnow(),
                    'source': 'manual_upload'
                }
                
                # Add format-specific fields
                if is_technical_compiler:
                    # Compiler-integrated format
                    new_question_doc.update({
                        'language': q.get('language', 'python'),
                        'instructions': q.get('instructions', ''),
                        'test_cases': q.get('test_cases', [])
                    })
                else:
                    # MCQ format
                    new_question_doc.update({
                        'optionA': q['optionA'],
                        'optionB': q['optionB'],
                        'optionC': q['optionC'],
                        'optionD': q['optionD'],
                        'answer': q['answer'].upper(),
                        'instructions': q.get('instructions', '')
                    })
                
                new_questions_to_store.append(new_question_doc)
        
        # Store new questions in database and get their ObjectIds
        stored_question_ids = {}
        if new_questions_to_store:
            result = mongo_db.question_bank.insert_many(new_questions_to_store)
            # Map question text to ObjectId for new questions
            for i, question_doc in enumerate(new_questions_to_store):
                question_text_lower = question_doc['question'].strip().lower()
                stored_question_ids[question_text_lower] = result.inserted_ids[i]
        
        # Now create formatted questions with correct ObjectIds
        questions_to_update_usage = []  # Track questions that need usage count update
        
        for q in valid_questions:
            question_text_lower = q['question'].strip().lower()
            is_existing = question_text_lower in existing_question_texts
            
            # Get the correct ObjectId - either from existing questions or newly stored questions
            if is_existing:
                question_id = existing_question_objects.get(question_text_lower)
                questions_to_update_usage.append(question_id)  # Track for usage update
            else:
                question_id = stored_question_ids.get(question_text_lower)
            
            formatted_question = {
                '_id': question_id if question_id else ObjectId(),  # Use actual database ObjectId
                'question': q['question'],
                'question_type': question_type,
                'source': 'manual_upload',
                'status': 'existing' if is_existing else 'new',
                'existing_id': existing_question_texts.get(question_text_lower) if is_existing else None
            }
            
            # Add format-specific fields
            if is_technical_compiler:
                # Compiler-integrated format
                formatted_question.update({
                    'language': q.get('language', 'python'),
                    'instructions': q.get('instructions', ''),
                    'test_cases': q.get('test_cases', []),
                    'marks': sum(tc.get('points', 5) for tc in q.get('test_cases', []))  # Total marks from test cases
                })
            else:
                # MCQ format
                formatted_question.update({
                    'optionA': q['optionA'],
                    'optionB': q['optionB'],
                    'optionC': q['optionC'],
                    'optionD': q['optionD'],
                    'answer': q['answer'].upper(),
                    'marks': 1,
                    'instructions': q.get('instructions', '')
                })
            
            formatted_questions.append(formatted_question)
        
        # Update usage count for existing questions that are being used
        if questions_to_update_usage:
            mongo_db.question_bank.update_many(
                {'_id': {'$in': questions_to_update_usage}},
                {
                    '$inc': {'used_count': 1},
                    '$set': {'last_used': datetime.utcnow()}
                }
            )
        
        # Count questions by status
        new_count = sum(1 for q in formatted_questions if q['status'] == 'new')
        existing_count = sum(1 for q in formatted_questions if q['status'] == 'existing')
        
        # Convert ObjectIds to strings for JSON serialization
        serializable_questions = []
        for q in formatted_questions:
            serializable_q = q.copy()
            serializable_q['_id'] = str(serializable_q['_id'])
            serializable_questions.append(serializable_q)
        
        # Prepare detailed response
        response_data = {
            'success': True,
            'message': f'Successfully processed {len(formatted_questions)} questions for test creation ({new_count} new, {existing_count} existing)',
            'count': len(formatted_questions),
            'questions': serializable_questions,  # Return questions with string ObjectIds
            'status_summary': {
                'new_questions': new_count,
                'existing_questions': existing_count,
                'stored_to_db': len(new_questions_to_store)
            },
            'details': {
                'total_questions': len(questions),
                'valid_questions': len(valid_questions),
                'duplicate_questions': len(duplicate_questions),
                'invalid_questions': len(invalid_questions),
                'duplicates': duplicate_questions,
                'invalid': invalid_questions
            }
        }
        
        return jsonify(response_data), 201
        
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
            current_s3_client = get_s3_client_safe()
            if current_s3_client is None:
                return jsonify({
                    'success': False,
                    'message': 'S3 client not available for audio upload. Please check AWS configuration.'
                }), 500
            
            audio_filename = f"audio_{uuid.uuid4()}.{audio_file.filename.split('.')[-1]}"
            s3_key = f"audio/{module_id}/{level_id}/{audio_filename}"
            
            try:
                current_s3_client.upload_fileobj(audio_file, S3_BUCKET_NAME, s3_key)
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
        
        # Validate questions and check for duplicates
        valid_questions = []
        duplicate_questions = []
        invalid_questions = []
        
        # Get existing questions for duplicate checking
        if question_type == 'compiler':
            existing_questions = list(mongo_db.question_bank.find(
                {'module_id': module_id, 'level_id': level_id, 'question_type': 'compiler_integrated'},
                {'questionTitle': 1, '_id': 0}
            ))
            existing_question_titles = {q['questionTitle'].strip().lower() for q in existing_questions}
        else:
            existing_questions = list(mongo_db.question_bank.find(
                {'module_id': module_id, 'level_id': level_id, 'question_type': 'mcq'},
                {'question': 1, '_id': 0}
            ))
            existing_question_texts = {q['question'].strip().lower() for q in existing_questions}
        
        # Track questions within the file to detect duplicates
        seen_questions_in_file = set()
        
        for i, q in enumerate(questions):
            # Basic validation
            if question_type == 'compiler':
                if not (q['questionTitle'] and q['problemStatement'] and 
                       q['language'] and q['testCases']):
                    invalid_questions.append({
                        'index': i + 1,
                        'question': q.get('questionTitle', ''),
                        'reason': 'Missing required fields (title, statement, language, or test cases)'
                    })
                    continue
                
                # Check for duplicates within the file first
                question_title = q['questionTitle'].strip().lower()
                if question_title in seen_questions_in_file:
                    duplicate_questions.append({
                        'index': i + 1,
                        'question': q['questionTitle'],
                        'reason': 'Duplicate question within the same file'
                    })
                    continue
                
                # Check for duplicates against database
                if question_title in existing_question_titles:
                    duplicate_questions.append({
                        'index': i + 1,
                        'question': q['questionTitle'],
                        'reason': 'Question title already exists in database'
                    })
                    continue
                
                # Add to valid questions and mark as seen
                valid_questions.append(q)
                seen_questions_in_file.add(question_title)
            else:
                if not (q['question'] and q['optionA'] and q['optionB'] and 
                       q['optionC'] and q['optionD'] and q['answer']):
                    invalid_questions.append({
                        'index': i + 1,
                        'question': q.get('question', ''),
                        'reason': 'Missing required fields (question, options, or answer)'
                    })
                    continue
                
                # Check for duplicates within the file first
                question_text = q['question'].strip().lower()
                if question_text in seen_questions_in_file:
                    duplicate_questions.append({
                        'index': i + 1,
                        'question': q['question'],
                        'reason': 'Duplicate question within the same file'
                    })
                    continue
                
                # Check for duplicates against database
                if question_text in existing_question_texts:
                    duplicate_questions.append({
                        'index': i + 1,
                        'question': q['question'],
                        'reason': 'Question already exists in database'
                    })
                    continue
                
                # Add to valid questions and mark as seen
                valid_questions.append(q)
                seen_questions_in_file.add(question_text)
        
        if not valid_questions:
            return jsonify({
                'success': False, 
                'message': 'No valid questions found in file',
                'details': {
                    'total_questions': len(questions),
                    'valid_questions': 0,
                    'duplicate_questions': len(duplicate_questions),
                    'invalid_questions': len(invalid_questions),
                    'duplicates': duplicate_questions,
                    'invalid': invalid_questions
                }
            }), 400
        
        # Store valid questions in database
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
        
        # Prepare detailed response
        response_data = {
            'success': True,
            'message': f'Successfully uploaded {inserted_count} technical questions',
            'count': inserted_count,
            'details': {
                'total_questions': len(questions),
                'valid_questions': len(valid_questions),
                'duplicate_questions': len(duplicate_questions),
                'invalid_questions': len(invalid_questions),
                'duplicates': duplicate_questions,
                'invalid': invalid_questions
            }
        }
        
        return jsonify(response_data), 201
        
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
            if not user or user.get('role') not in ['superadmin', 'sub_superadmin', 'admin', 'campus_admin', 'course_admin']:
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
            'submitted_at': safe_isoformat(result.get('submitted_at')) if result.get('submitted_at') else '',
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

@test_management_bp.route('/submit-online-listening-test', methods=['POST'])
@jwt_required()
def submit_online_listening_test():
    """Submit online listening test with student audio recordings"""
    try:
        current_app.logger.info("=== ONLINE LISTENING TEST SUBMISSION ENDPOINT HIT ===")
        current_user_id = get_jwt_identity()
        current_app.logger.info(f"Online listening test submission attempt by user {current_user_id}")
        
        data = request.form.to_dict()
        files = request.files
        
        current_app.logger.info(f"Received form data: {data}")
        current_app.logger.info(f"Received files: {list(files.keys()) if files else 'No files'}")
        
        # Validate required fields
        if not data.get('test_id'):
            return jsonify({
                'success': False,
                'message': 'Test ID is required'
            }), 400
        
        # Use the test ID resolver to support both _id and test_id
        from utils.test_id_resolver import resolve_test_id
        
        test_result = resolve_test_id(data['test_id'])
        if not test_result:
            return jsonify({
                'success': False,
                'message': 'Test not found'
            }), 404
        
        test = test_result['test']
        current_app.logger.info(f"Online listening test resolved by {test_result['resolved_by']}: {test_result['object_id']} / {test_result['test_id']}")
        
        # Define both forms of test identifiers for consistent use
        try:
            test_object_id = test_result['object_id'] if isinstance(test_result['object_id'], ObjectId) else ObjectId(test_result['object_id'])
        except Exception:
            # Fallback: try to read _id from the fetched test
            test_object_id = test.get('_id') if isinstance(test.get('_id'), ObjectId) else ObjectId(str(test.get('_id')))
        test_custom_id = test_result.get('test_id') or test.get('test_id')
        
        # Check if this is a listening test
        if test.get('module_id') != 'LISTENING':
            return jsonify({
                'success': False,
                'message': 'This endpoint is only for listening tests'
            }), 400
        
        # Find student profile
        student = mongo_db.students.find_one({'user_id': ObjectId(current_user_id)})
        if not student:
            student = mongo_db.students.find_one({'_id': ObjectId(current_user_id)})
            if not student:
                return jsonify({
                    'success': False,
                    'message': 'Student profile not found. Please contact your administrator.'
                }), 404
        
        current_app.logger.info(f"Found student profile: {student.get('name')}")
        
        # Check for existing completed attempts to prevent duplicates
        existing_attempt = mongo_db.student_test_attempts.find_one({
            'test_id': test_object_id,
            'student_id': student['_id'],
            'status': 'completed'
        })
        
        if existing_attempt:
            current_app.logger.warning(f"Student {student.get('name')} already has a completed attempt for test {test_custom_id}")
            return jsonify({
                'success': False,
                'message': 'You have already completed this test. Duplicate submissions are not allowed.'
            }), 400
        
        # Process each question
        results = []
        total_score = 0
        total_marks = 0
        
        for i, question in enumerate(test.get('questions', [])):
            current_app.logger.info(f"Processing question {i+1}: {question.get('question_type')}")
            
            if question.get('question_type') == 'mcq':
                # Handle MCQ questions
                answer_key = f'question_{i}'
                student_answer = data.get(answer_key, '')
                correct_answer = question.get('correct_answer', '')
                
                current_app.logger.info(f"MCQ question {i}: student_answer='{student_answer}', correct_answer='{correct_answer}'")
                
                is_correct = student_answer.lower() == correct_answer.lower()
                score = 1 if is_correct else 0
                total_score += score
                total_marks += 1
                
                results.append({
                    'question_index': i,
                    'question_id': question.get('question_id'),
                    'question': question.get('question'),
                    'question_type': 'mcq',
                    'student_answer': student_answer,
                    'correct_answer': correct_answer,
                    'is_correct': is_correct,
                    'score': score
                })
                
            else:
                # Handle audio questions (Listening)
                audio_key = f'question_{i}'
                current_app.logger.info(f"Looking for audio file with key: {audio_key}")
                current_app.logger.info(f"Available files: {list(files.keys())}")
                
                if audio_key not in files:
                    current_app.logger.error(f"Audio recording for question {i+1} not found. Expected key: {audio_key}")
                    return jsonify({
                        'success': False,
                        'message': f'Audio recording for question {i+1} is required. Expected key: {audio_key}'
                    }), 400
                
                audio_file = files[audio_key]
                current_app.logger.info(f"Found audio file for question {i}: {audio_file.filename}, size: {audio_file.content_length} bytes")
                
                # Save student audio to S3
                current_s3_client = get_s3_client_safe()
                if current_s3_client is None:
                    return jsonify({
                        'success': False,
                        'message': 'S3 client not available for audio upload. Please check AWS configuration.'
                    }), 500
                
                # Get file extension from the uploaded file or MIME type
                if '.' in audio_file.filename:
                    file_extension = audio_file.filename.split('.')[-1]
                elif audio_file.content_type and 'webm' in audio_file.content_type:
                    file_extension = 'webm'
                else:
                    file_extension = 'mp3'
                
                # Create unique audio key with question identifier
                question_identifier = question.get('question_id', f'q_{i}')
                student_audio_key = f"student_audio/online_tests/{current_user_id}/{test_custom_id}/{question_identifier}_{uuid.uuid4()}.{file_extension}"
                
                current_app.logger.info(f"Uploading audio for question {i}: {student_audio_key}")
                current_s3_client.upload_fileobj(audio_file, S3_BUCKET_NAME, student_audio_key)
                
                # Create full S3 URL for frontend access
                student_audio_url = f"https://{S3_BUCKET_NAME}.s3.amazonaws.com/{student_audio_key}"
                
                # Download for transcription
                temp_audio_path = f"temp_student_{question_identifier}_{uuid.uuid4()}.{file_extension}"
                current_s3_client.download_file(S3_BUCKET_NAME, student_audio_key, temp_audio_path)
                
                # Transcribe student audio
                try:
                    from utils.audio_generator import transcribe_audio as transcribe_audio_util
                    
                    current_app.logger.info(f"Starting transcription for question {i}, file: {temp_audio_path}")
                    
                    if not os.path.exists(temp_audio_path):
                        current_app.logger.error(f"Temporary audio file not found: {temp_audio_path}")
                        student_text = ""
                    elif os.path.getsize(temp_audio_path) == 0:
                        current_app.logger.error(f"Temporary audio file is empty: {temp_audio_path}")
                        student_text = ""
                    else:
                        current_app.logger.info(f"Audio file size: {os.path.getsize(temp_audio_path)} bytes")
                        student_text = transcribe_audio_util(temp_audio_path)
                        
                        if not student_text:
                            current_app.logger.warning(f"Transcription returned empty text for question {i}")
                            student_text = ""
                        else:
                            current_app.logger.info(f"Successfully transcribed question {i}: '{student_text[:100]}...'")
                    
                except Exception as e:
                    current_app.logger.error(f"Error transcribing audio for question {i}: {e}")
                    student_text = ""
                finally:
                    # Clean up temporary file
                    if os.path.exists(temp_audio_path):
                        os.remove(temp_audio_path)
                        current_app.logger.info(f"Cleaned up temporary file: {temp_audio_path}")
                
                # Get correct answer for comparison - for listening tests, use the original sentence
                correct_answer = question.get('correct_answer', '') or question.get('question', '')
                
                # Calculate similarity score
                try:
                    from utils.audio_generator import calculate_similarity
                    current_app.logger.info(f"Calculating similarity for question {i}:")
                    current_app.logger.info(f"  Student text: '{student_text}'")
                    current_app.logger.info(f"  Correct answer: '{correct_answer}'")
                    
                    similarity_score = calculate_similarity(student_text, correct_answer)
                    is_correct = similarity_score >= 0.7  # 70% similarity threshold
                    score = 1 if is_correct else 0
                    
                    current_app.logger.info(f"  Similarity score: {similarity_score}%, is_correct: {is_correct}")
                except Exception as e:
                    current_app.logger.error(f"Error calculating similarity for question {i}: {e}")
                    similarity_score = 0.0
                    is_correct = False
                    score = 0
                
                total_score += score
                total_marks += 1
                
                results.append({
                    'question_index': i,
                    'question_id': question.get('question_id'),
                    'question': question.get('question'),
                    'question_type': 'audio',
                    'student_answer': student_text,
                    'correct_answer': correct_answer,
                    'is_correct': is_correct,
                    'score': score,
                    'similarity_score': similarity_score,
                    'student_audio_url': student_audio_url
                })
        
        # Calculate final score - for listening modules, use average of similarity scores
        if test.get('module_id') == 'LISTENING':
            # For listening modules, calculate average of all similarity scores
            similarity_scores = [result.get('similarity_score', 0) for result in results if 'similarity_score' in result]
            average_score = sum(similarity_scores) / len(similarity_scores) if similarity_scores else 0
            current_app.logger.info(f"Listening module - using average similarity score: {average_score}%")
        else:
            # For other modules, use traditional scoring
            average_score = (total_score / total_marks * 100) if total_marks > 0 else 0
        
        # Calculate correct_answers and total_marks for listening modules
        if test.get('module_id') == 'LISTENING':
            # For listening modules, count questions with >=70% similarity as correct
            correct_answers = sum(1 for result in results if result.get('similarity_score', 0) >= 70)
            total_marks = len(results)
            score = correct_answers  # Keep binary score for compatibility
        else:
            # For other modules, use traditional scoring
            correct_answers = total_score
            total_marks = total_marks
            score = total_score
        
        # Create result document for student_test_attempts
        current_time = datetime.now(timezone.utc)
        result_doc = {
            'test_id': test_object_id,
            'student_id': student['_id'],  # Use student document ID as primary identifier
            'user_id': ObjectId(current_user_id),  # Keep user_id for reference
            'test_type': 'online',
            'module_id': test.get('module_id'),
            'subcategory': test.get('subcategory'),
            'level_id': test.get('level_id'),
            'start_time': current_time,
            'end_time': current_time,
            'submitted_at': current_time,  # Add for compatibility with existing queries
            'duration_seconds': 0,  # Will be calculated by frontend
            'status': 'completed',
            'total_questions': len(test.get('questions', [])),
            'correct_answers': correct_answers,
            'total_marks': total_marks,
            'score': score,
            'percentage': average_score,
            'results': results,
            'answers': {f'question_{i}': result['student_answer'] for i, result in enumerate(results)},
            'detailed_results': results
        }
        
        current_app.logger.info(f"Saving online listening test result: {result_doc}")
        
        # Save to student_test_attempts collection
        mongo_db.student_test_attempts.insert_one(result_doc)
        current_app.logger.info("Online listening test result saved to student_test_attempts collection")
        
        return jsonify({
            'success': True,
            'message': 'Online listening test submitted successfully',
            'data': {
                'test_id': str(test_custom_id),
                'total_questions': len(test.get('questions', [])),
                'correct_answers': correct_answers,
                'total_marks': total_marks,
                'percentage': average_score,
                'results': results
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error submitting online listening test: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Failed to submit online listening test: {str(e)}'
        }), 500

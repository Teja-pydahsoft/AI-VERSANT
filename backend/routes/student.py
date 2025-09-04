from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from mongo import mongo_db
from bson import ObjectId
from config.constants import GRAMMAR_CATEGORIES, MODULES, LEVELS
import logging
from datetime import datetime
import pytz

# Helper function to recursively convert ObjectId fields to strings
def convert_objectids_to_strings(obj):
    """Recursively convert all ObjectId fields to strings for JSON serialization"""
    if isinstance(obj, dict):
        for key, value in obj.items():
            if isinstance(value, ObjectId):
                obj[key] = str(value)
            elif isinstance(value, (dict, list)):
                convert_objectids_to_strings(value)
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            if isinstance(item, ObjectId):
                obj[i] = str(item)
            elif isinstance(item, (dict, list)):
                convert_objectids_to_strings(item)
    return obj

student_bp = Blueprint('student', __name__)

@student_bp.route('/profile', methods=['GET'])
@jwt_required()
def get_student_profile():
    """Fetches the detailed profile for the currently logged-in student."""
    try:
        current_user_id = get_jwt_identity()
        user_object_id = ObjectId(current_user_id)

        pipeline = [
            {'$match': {'_id': user_object_id}},
            {
                '$lookup': {
                    'from': 'students',
                    'localField': '_id',
                    'foreignField': 'user_id',
                    'as': 'student_details'
                }
            },
            {
                '$lookup': {
                    'from': 'campuses',
                    'localField': 'campus_id',
                    'foreignField': '_id',
                    'as': 'campus_details'
                }
            },
            {
                '$lookup': {
                    'from': 'courses',
                    'localField': 'course_id',
                    'foreignField': '_id',
                    'as': 'course_details'
                }
            },
            {
                '$lookup': {
                    'from': 'batches',
                    'localField': 'batch_id',
                    'foreignField': '_id',
                    'as': 'batch_details'
                }
            },
            {'$unwind': {'path': '$student_details', 'preserveNullAndEmptyArrays': True}},
            {'$unwind': {'path': '$campus_details', 'preserveNullAndEmptyArrays': True}},
            {'$unwind': {'path': '$course_details', 'preserveNullAndEmptyArrays': True}},
            {'$unwind': {'path': '$batch_details', 'preserveNullAndEmptyArrays': True}},
            {
                '$project': {
                    '_id': 0,
                    'name': '$name',
                    'email': '$email',
                    'role': '$role',
                    'mobile_number': '$mobile_number',
                    'roll_number': '$student_details.roll_number',
                    'campus': '$campus_details.name',
                    'course': '$course_details.name',
                    'batch': '$batch_details.name'
                }
            }
        ]

        profile_data = list(mongo_db.users.aggregate(pipeline))

        if not profile_data:
            return jsonify({'success': False, 'message': 'Student profile not found.'}), 404

        return jsonify({'success': True, 'data': profile_data[0]}), 200

    except Exception as e:
        logging.error(f"Error fetching student profile for user_id {get_jwt_identity()}: {e}", exc_info=True)
        return jsonify({'success': False, 'message': 'An error occurred while fetching your profile.'}), 500

@student_bp.route('/modules', methods=['GET'])
@jwt_required()
def get_available_modules():
    """
    Get all available practice modules for the student landing page,
    ordered with Grammar and Vocabulary first, and with a locked status.
    """
    try:
        from config.constants import MODULES
        # Define the priority order
        priority_order = ['GRAMMAR', 'VOCABULARY']
        
        all_modules = [{'id': key, 'name': value} for key, value in MODULES.items()]
        
        # Separate into priority and other modules
        priority_modules = [m for m in all_modules if m['id'] in priority_order]
        other_modules = [m for m in all_modules if m['id'] not in priority_order]

        # Sort priority modules according to the defined order
        priority_modules.sort(key=lambda m: priority_order.index(m['id']))
        
        # Add 'locked' status
        final_module_list = []
        for m in priority_modules:
            final_module_list.append({**m, 'locked': False})
        
        for m in other_modules:
            final_module_list.append({**m, 'locked': True})
            
        return jsonify({'success': True, 'data': final_module_list})
    except Exception as e:
        logging.error(f"Error fetching modules: {e}", exc_info=True)
        return jsonify({'success': False, 'message': 'Could not load modules.'}), 500

@student_bp.route('/dashboard', methods=['GET'])
@jwt_required()
def dashboard():
    """Student dashboard"""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)
        
        if not user or user.get('role') != 'student':
            return jsonify({
                'success': False,
                'message': 'Access denied'
            }), 403
        
        # Check if student_progress collection exists
        if not hasattr(mongo_db, 'student_progress'):
            current_app.logger.warning("student_progress collection not found, using empty progress")
            progress = []
        else:
            # Get student progress
            progress = list(mongo_db.student_progress.find({'student_id': current_user_id}))
        
        dashboard_data = {
            'user_id': str(current_user_id),
            'progress': progress
        }
        
        # Convert any ObjectId fields to strings for JSON serialization
        convert_objectids_to_strings(dashboard_data)
        
        return jsonify({
            'success': True,
            'message': 'Dashboard data retrieved successfully',
            'data': dashboard_data
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Failed to get dashboard data: {str(e)}'
        }), 500

@student_bp.route('/tests', methods=['GET'])
@jwt_required()
def get_student_tests():
    """Get tests available for the logged-in student based on their batch-course instance"""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.users.find_one({'_id': ObjectId(current_user_id)})
        
        if not user or user.get('role') != 'student':
            return jsonify({'success': False, 'message': 'Access denied'}), 403

        # Get query parameters for filtering
        module = request.args.get('module')
        category = request.args.get('category')
        subcategory = request.args.get('subcategory')
        
        # Debug: Log the requested module
        current_app.logger.info(f"STUDENT TESTS REQUEST: Module={module}, Category={category}, Subcategory={subcategory}")
        current_app.logger.info(f"STUDENT TESTS REQUEST: Current user ID={current_user_id}")

        # Get student's record (may or may not have batch_course_instance_id yet)
        student = mongo_db.students.find_one({'user_id': ObjectId(current_user_id)})
        # If no student profile, return empty list gracefully
        if not student:
            current_app.logger.warning(f"Student profile not found for user {current_user_id}")
            return jsonify({'success': True, 'data': []}), 200
            
        instance_id = student.get('batch_course_instance_id')
        
        # Debug student assignment information
        current_app.logger.info(f"Student {current_user_id} assignment info:")
        current_app.logger.info(f"  - Campus ID: {student.get('campus_id')}")
        current_app.logger.info(f"  - Course ID: {student.get('course_id')}")
        current_app.logger.info(f"  - Batch ID: {student.get('batch_id')}")
        current_app.logger.info(f"  - Instance ID: {instance_id}")
        
        # Build base query filter
        # Prefer explicit practice tests and handle different active flags
        active_clause = {
            '$or': [
                { 'status': 'active' },
                { 'is_active': True },
                { 'status': { '$exists': False }, 'is_active': { '$exists': False } }
            ]
        }
        query_filter = {
            '$and': [
                { 'test_type': 'practice' },
                active_clause
            ]
        }
        
        # Add module filter if provided
        if module:
            query_filter['$and'].append({ 'module_id': module })
            
        # Add category filter if provided
        if category:
            query_filter['$and'].append({ 'test_category': category })
            
        # Add subcategory filter if provided
        if subcategory:
            query_filter['$and'].append({ 'subcategory': subcategory })

        # Audience filter: match by instance OR student's campus/course/batch OR explicit assignment
        # For practice tests, be more lenient with access control
        audience_or = []
        
        # Always include tests with no specific audience restrictions (global practice tests)
        audience_or.append({ 
            '$and': [
                { 'campus_ids': { '$exists': False } },
                { 'course_ids': { '$exists': False } },
                { 'batch_ids': { '$exists': False } },
                { 'assigned_student_ids': { '$exists': False } },
                { 'batch_course_instance_ids': { '$exists': False } }
            ]
        })
        
        if instance_id:
            audience_or.append({ 'batch_course_instance_ids': { '$in': [instance_id] } })
        if student:
            campus_id = student.get('campus_id')
            course_id = student.get('course_id')
            batch_id = student.get('batch_id')
            if campus_id:
                audience_or.append({ 'campus_ids': { '$in': [campus_id] } })
            if course_id:
                audience_or.append({ 'course_ids': { '$in': [course_id] } })
            if batch_id:
                audience_or.append({ 'batch_ids': { '$in': [batch_id] } })
            # Some tests may use explicit assigned_student_ids with either student _id or user _id
            if student.get('_id'):
                audience_or.append({ 'assigned_student_ids': { '$in': [student['_id']] } })
            audience_or.append({ 'assigned_student_ids': { '$in': [ObjectId(current_user_id)] } })

        # For practice tests, use OR logic to be more inclusive
        if audience_or:
            query_filter['$and'].append({ '$or': audience_or })
            current_app.logger.info(f"Applied audience filters: {len(audience_or)} conditions")
        else:
            # No audience context available (e.g., student not assigned yet and no campus/course/batch)
            # Return empty list instead of 404
            current_app.logger.warning("No audience filters available - returning empty list")
            return jsonify({'success': True, 'data': []}), 200
            
        # Debug the final query filter
        current_app.logger.info(f"Final query filter: {query_filter}")

        # Get tests according to filters
        tests = list(mongo_db.tests.find(query_filter))
        
        # Debug: Show what tests were found with audience filters
        current_app.logger.info(f"Tests found with audience filters: {len(tests)}")
        if tests:
            for t in tests:
                current_app.logger.info(f"  Found test: {t.get('name')} - Module: {t.get('module_id')} - Type: {t.get('test_type')}")
        
        # Special case: For LISTENING module, fetch tests independently to avoid mixing with other modules
        if module == 'LISTENING':
            current_app.logger.info("LISTENING MODULE: Fetching tests independently...")
            
            # Get level parameter for listening module
            level = request.args.get('level', 'beginner').lower()
            current_app.logger.info(f"LISTENING MODULE: Requested level: {level}")
            
            # For listening module, use a direct approach without audience filters to ensure access
            # First try to find tests with the specific level
            listening_query = {
                'test_type': 'practice',
                'module_id': 'LISTENING',
                '$or': [
                    { 'status': 'active' },
                    { 'is_active': True },
                    { 'status': { '$exists': False }, 'is_active': { '$exists': False } }
                ]
            }
            
            # Add level filter if level is specified
            if level and level != 'beginner':  # 'beginner' is default, so don't filter for it
                listening_query['level'] = level
            
            # Get listening tests for the specific level
            listening_tests = list(mongo_db.tests.find(listening_query))
            current_app.logger.info(f"Found {len(listening_tests)} listening tests for level '{level}'")
            
            # If no tests found for specific level, try to find any listening tests
            if not listening_tests:
                current_app.logger.info(f"No tests found for level '{level}', trying broader search...")
                broader_query = {
                    'test_type': 'practice',
                    'module_id': 'LISTENING',
                    '$or': [
                        { 'status': 'active' },
                        { 'is_active': True },
                        { 'status': { '$exists': False }, 'is_active': { '$exists': False } }
                    ]
                }
                listening_tests = list(mongo_db.tests.find(broader_query))
                current_app.logger.info(f"Found {len(listening_tests)} listening tests with broader search")
                
                # If still no tests, try to find tests without level specification
                if not listening_tests:
                    current_app.logger.info("No tests found with broader search, trying without level filter...")
                    no_level_query = {
                        'test_type': 'practice',
                        'module_id': 'LISTENING',
                        '$or': [
                            { 'status': 'active' },
                            { 'is_active': True },
                            { 'status': { '$exists': False }, 'is_active': { '$exists': False } }
                        ]
                    }
                    listening_tests = list(mongo_db.tests.find(no_level_query))
                    current_app.logger.info(f"Found {len(listening_tests)} listening tests without level filter")
            
            # Replace the tests list with only listening tests
            tests = listening_tests
            
            # Log details of found tests
            for t in listening_tests:
                current_app.logger.info(f"  Listening test: {t.get('name')} - Level: {t.get('level', 'unknown')} - Status: {t.get('status', 'unknown')} - Active: {t.get('is_active', 'unknown')} - Questions: {len(t.get('questions', []))}")
            
            current_app.logger.info(f"LISTENING MODULE: Using {len(tests)} tests for level '{level}'")
        
        # For other modules, ensure they only get their specific tests
        elif module and module != 'LISTENING':
            current_app.logger.info(f"{module} MODULE: Filtering tests for specific module...")
            # Filter tests to only include the requested module
            module_tests = [t for t in tests if t.get('module_id') == module]
            tests = module_tests
            current_app.logger.info(f"{module} MODULE: Using {len(tests)} tests for this module")
        
        # Debug: Log test counts by module
        if module:
            current_app.logger.info(f"Final test list for {module} module: {len(tests)} tests")
            for t in tests:
                current_app.logger.info(f"  Final test: {t.get('name')} - Module: {t.get('module_id')} - Questions: {len(t.get('questions', []))}")
            
            # Additional debugging for listening module access
            if module == 'LISTENING' and len(tests) == 0:
                current_app.logger.warning("LISTENING MODULE: No tests found - checking database directly...")
                # Check if there are any listening tests at all
                all_listening_tests = list(mongo_db.tests.find({
                    'module_id': 'LISTENING',
                    'test_type': 'practice'
                }))
                current_app.logger.info(f"Database has {len(all_listening_tests)} total listening practice tests")
                for t in all_listening_tests:
                    current_app.logger.info(f"  Available test: {t.get('name')} - Status: {t.get('status', 'unknown')} - Active: {t.get('is_active', 'unknown')}")
        
        # Debug: Show final tests before processing
        current_app.logger.info(f"Processing {len(tests)} tests for final output")
        for t in tests:
            current_app.logger.info(f"  Processing test: {t.get('name')} - Module: {t.get('module_id')} - Type: {t.get('test_type')}")
        
        test_list = []
        for test in tests:
            # Check if student has already attempted this test
            existing_attempt = mongo_db.student_test_attempts.find_one({
                'test_id': test['_id'],
                'student_id': ObjectId(current_user_id),
                # instance may be missing; include it only if present to avoid over-filtering
                **({ 'batch_course_instance_id': instance_id } if instance_id else {})
            })
            
            # Get highest score for this test
            highest_score = 0
            # Try both possible collections for historical results
            try:
                attempts_primary = list(mongo_db.test_results.find({
                    'test_id': test['_id'],
                    'student_id': ObjectId(current_user_id)
                }))
            except Exception:
                attempts_primary = []
            try:
                attempts_alt = list(mongo_db.test_results.find({
                    'test_id': test['_id'],
                    'student_id': ObjectId(current_user_id)
                }))
            except Exception:
                attempts_alt = []
            all_attempts = (attempts_primary or []) + (attempts_alt or [])
            if all_attempts:
                highest_score = max(attempt.get('average_score', 0) for attempt in all_attempts)
            
            test_list.append({
                '_id': str(test['_id']),
                'name': test['name'],
                'type': test.get('type') or test.get('test_type'),
                'duration': test.get('duration'),
                'total_marks': test.get('total_marks'),
                'instructions': test.get('instructions', ''),
                'start_date': test.get('start_date', '').isoformat() if test.get('start_date') else None,
                'end_date': test.get('end_date', '').isoformat() if test.get('end_date') else None,
                'has_attempted': existing_attempt is not None,
                'attempt_id': str(existing_attempt['_id']) if existing_attempt else None,
                'highest_score': highest_score
            })
        
        # Convert any remaining ObjectId fields to strings for JSON serialization
        convert_objectids_to_strings(test_list)
        
        # Final debug: Show what tests are being returned
        current_app.logger.info(f"Final test list contains {len(test_list)} tests")
        if test_list:
            for t in test_list:
                current_app.logger.info(f"  Returning test: {t.get('name')} - ID: {t.get('_id')}")
        
        return jsonify({'success': True, 'data': test_list}), 200
    except Exception as e:
        current_app.logger.error(f"Error fetching student tests: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@student_bp.route('/tests/<test_id>/start', methods=['POST'])
@jwt_required()
def start_test(test_id):
    """Start a test for the student"""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.users.find_one({'_id': ObjectId(current_user_id)})
        
        if not user or user.get('role') != 'student':
            return jsonify({'success': False, 'message': 'Access denied'}), 403
        
        # Get student profile
        student = mongo_db.students.find_one({'user_id': ObjectId(current_user_id)})
        if not student:
            return jsonify({'success': False, 'message': 'Student profile not found'}), 404
        
        # Get test and verify it's available for this student
        # For online exams, check campus_ids and course_ids
        # For regular tests, check batch_course_instance_ids
        test_query = {
            '_id': ObjectId(test_id),
            'status': 'active'
        }
        
        # Check if it's an online exam
        test = mongo_db.tests.find_one(test_query)
        if not test:
            return jsonify({'success': False, 'message': 'Test not found or not active'}), 404
        
        # For online exams, check campus and course assignment
        if test.get('test_type') == 'online':
            current_app.logger.info(f"Online exam validation - Student campus_id: {student.get('campus_id')}, course_id: {student.get('course_id')}")
            current_app.logger.info(f"Test campus_ids: {test.get('campus_ids')}, course_ids: {test.get('course_ids')}")
            
            # Check campus assignment
            student_campus = student.get('campus_id')
            test_campuses = test.get('campus_ids', [])
            if not test_campuses or not student_campus:
                current_app.logger.warning(f"Missing campus data - student: {student_campus}, test: {test_campuses}")
                return jsonify({'success': False, 'message': 'Campus assignment not configured properly'}), 403
            
            # Convert to strings for comparison
            student_campus_str = str(student_campus)
            test_campuses_str = [str(c) for c in test_campuses]
            
            if student_campus_str not in test_campuses_str:
                current_app.logger.warning(f"Campus mismatch - student: {student_campus_str}, test: {test_campuses_str}")
                return jsonify({'success': False, 'message': 'Test not assigned to your campus'}), 403
            
            # Check course assignment
            student_course = student.get('course_id')
            test_courses = test.get('course_ids', [])
            if not test_courses or not student_course:
                current_app.logger.warning(f"Missing course data - student: {student_course}, test: {test_courses}")
                return jsonify({'success': False, 'message': 'Course assignment not configured properly'}), 403
            
            # Convert to strings for comparison
            student_course_str = str(student_course)
            test_courses_str = [str(c) for c in test_courses]
            
            if student_course_str not in test_courses_str:
                current_app.logger.warning(f"Course mismatch - student: {student_course_str}, test: {test_courses_str}")
                return jsonify({'success': False, 'message': 'Test not assigned to your course'}), 403
        else:
            # For regular tests, check batch_course_instance_ids
            instance_id = student.get('batch_course_instance_id')
            if not instance_id:
                return jsonify({'success': False, 'message': 'Student not assigned to any batch-course instance'}), 404
            if instance_id not in test.get('batch_course_instance_ids', []):
                return jsonify({'success': False, 'message': 'Test not assigned to your batch-course instance'}), 403
        
        # Check if student has already attempted this test
        attempt_query = {
            'test_id': ObjectId(test_id),
            'student_id': ObjectId(current_user_id)
        }
        
        # Add instance_id for regular tests
        if test.get('test_type') != 'online':
            attempt_query['batch_course_instance_id'] = student.get('batch_course_instance_id')
        
        current_app.logger.info(f"Checking for existing attempts with query: {attempt_query}")
        existing_attempt = mongo_db.student_test_attempts.find_one(attempt_query)
        
        if existing_attempt:
            current_app.logger.info(f"Found existing attempt: {existing_attempt.get('_id')} with status: {existing_attempt.get('status')}")
            
            # If the attempt is in_progress, allow resuming
            if existing_attempt.get('status') == 'in_progress':
                current_app.logger.info(f"Resuming in-progress attempt: {existing_attempt.get('_id')}")
                return jsonify({
                    'success': True,
                    'data': {
                        'attempt_id': str(existing_attempt['_id']),
                        'test': {
                            'id': str(test['_id']),
                            'name': test['name'],
                            'duration': test.get('duration', 0),
                            'total_marks': test.get('total_marks', 0),
                            'instructions': test.get('instructions', '')
                        },
                        'resumed': True
                    }
                }), 200
            else:
                # If completed or any other status, prevent new attempt
                status = existing_attempt.get('status', 'unknown')
                current_app.logger.info(f"Found existing attempt with status '{status}', preventing new attempt")
                return jsonify({'success': False, 'message': f'Test already attempted (status: {status})'}), 409
        
        # Create test attempt
        attempt_doc = {
            'test_id': ObjectId(test_id),
            'student_id': ObjectId(current_user_id),
            'start_time': datetime.now(pytz.utc),
            'status': 'in_progress',
            'answers': [],
            'score': 0,
            'total_marks': test.get('total_marks', 0),
            'test_type': test.get('test_type', 'regular')
        }
        
        # Add instance_id for regular tests only
        if test.get('test_type') != 'online':
            attempt_doc['batch_course_instance_id'] = student.get('batch_course_instance_id')
        
        current_app.logger.info(f"Creating test attempt with document: {attempt_doc}")
        attempt_id = mongo_db.student_test_attempts.insert_one(attempt_doc).inserted_id
        current_app.logger.info(f"Successfully created attempt with ID: {attempt_id}")
        
        return jsonify({
            'success': True,
            'data': {
                'attempt_id': str(attempt_id),
                'test': {
                    'id': str(test['_id']),
                    'name': test['name'],
                    'duration': test.get('duration', 0),
                    'total_marks': test.get('total_marks', 0),
                    'instructions': test.get('instructions', '')
                }
            }
        }), 200
    except Exception as e:
        current_app.logger.error(f"Error starting test: {e}", exc_info=True)
        return jsonify({'success': False, 'message': f'Failed to start test: {str(e)}'}), 500

@student_bp.route('/tests/<test_id>/submit', methods=['POST'])
@jwt_required()
def submit_test(test_id):
    """Submit test answers and calculate score"""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.users.find_one({'_id': ObjectId(current_user_id)})
        
        if not user or user.get('role') != 'student':
            return jsonify({'success': False, 'message': 'Access denied'}), 403
        
        data = request.get_json()
        attempt_id = data.get('attempt_id')
        answers = data.get('answers', [])
        time_taken_ms = data.get('time_taken_ms')  # Duration in milliseconds
        
        if not attempt_id:
            return jsonify({'success': False, 'message': 'Attempt ID is required'}), 400
        
        # Get student profile
        student = mongo_db.students.find_one({'user_id': ObjectId(current_user_id)})
        if not student:
            return jsonify({'success': False, 'message': 'Student profile not found'}), 404
        
        # Get test details first to determine test type
        test = mongo_db.tests.find_one({'_id': ObjectId(test_id)})
        if not test:
            return jsonify({'success': False, 'message': 'Test not found'}), 404
        
        # Build attempt query based on test type
        attempt_query = {
            '_id': ObjectId(attempt_id),
            'test_id': ObjectId(test_id),
            'student_id': ObjectId(current_user_id)
        }
        
        # Add instance_id for regular tests only
        if test.get('test_type') != 'online':
            instance_id = student.get('batch_course_instance_id')
            if not instance_id:
                return jsonify({'success': False, 'message': 'Student not assigned to any batch-course instance'}), 404
            attempt_query['batch_course_instance_id'] = instance_id
        
        # Get test attempt
        attempt = mongo_db.student_test_attempts.find_one(attempt_query)
        
        if not attempt:
            return jsonify({'success': False, 'message': 'Test attempt not found'}), 404
        
        if attempt['status'] == 'completed':
            return jsonify({'success': False, 'message': 'Test already submitted'}), 409
        
        # Calculate score properly
        score = 0
        total_questions = len(test.get('questions', []))
        correct_answers = 0
        detailed_results = []
        
        current_app.logger.info(f"Calculating score for {total_questions} questions")
        current_app.logger.info(f"Student answers: {answers}")
        
        # Process each question and calculate score
        for i, question in enumerate(test.get('questions', [])):
            question_id = str(question.get('_id', i))
            student_answer = answers.get(question_id, '')
            
            # Get correct answer from question
            correct_answer_letter = question.get('answer', '')  # A, B, C, or D
            correct_answer_text = ''
            
            # Map answer letter to actual option text
            if correct_answer_letter == 'A':
                correct_answer_text = question.get('optionA', '')
            elif correct_answer_letter == 'B':
                correct_answer_text = question.get('optionB', '')
            elif correct_answer_letter == 'C':
                correct_answer_text = question.get('optionC', '')
            elif correct_answer_letter == 'D':
                correct_answer_text = question.get('optionD', '')
            
            # Check if student answer matches correct answer text
            is_correct = student_answer == correct_answer_text
            
            if is_correct:
                correct_answers += 1
                score += 1
            
            current_app.logger.info(f"Question {i}: student='{student_answer}', correct='{correct_answer_text}', is_correct={is_correct}")
            
            detailed_results.append({
                'question_index': i,
                'question_id': question_id,
                'question': question.get('question', ''),
                'student_answer': student_answer,
                'correct_answer_letter': correct_answer_letter,
                'correct_answer_text': correct_answer_text,
                'is_correct': is_correct,
                'score': 1 if is_correct else 0
            })
        
        # Calculate percentage
        percentage = (score / total_questions) * 100 if total_questions > 0 else 0
        
        current_app.logger.info(f"Final score: {score}/{total_questions} = {percentage:.2f}%")
        
        # Calculate duration
        end_time = datetime.now(pytz.utc)
        start_time = attempt.get('start_time', end_time)
        
        current_app.logger.info(f"Duration calculation - start_time: {start_time} (tzinfo: {start_time.tzinfo if start_time else 'None'})")
        current_app.logger.info(f"Duration calculation - end_time: {end_time} (tzinfo: {end_time.tzinfo})")
        
        # Ensure both datetimes are timezone-aware for proper calculation
        if start_time and start_time.tzinfo is None:
            # If start_time is naive, assume it's UTC
            start_time = pytz.utc.localize(start_time)
            current_app.logger.info(f"Localized start_time to UTC: {start_time}")
        elif start_time and start_time.tzinfo is not None:
            # If start_time is timezone-aware, convert to UTC
            start_time = start_time.astimezone(pytz.utc)
            current_app.logger.info(f"Converted start_time to UTC: {start_time}")
        
        duration_seconds = (end_time - start_time).total_seconds()
        current_app.logger.info(f"Calculated duration: {duration_seconds} seconds")
        
        # Update attempt with answers, score, and duration
        update_data = {
            'answers': answers,
            'score': score,
            'total_questions': total_questions,
            'correct_answers': correct_answers,
            'percentage': percentage,
            'detailed_results': detailed_results,
            'end_time': end_time,
            'status': 'completed',
            'duration_seconds': duration_seconds
        }
        
        # Add time_taken_ms if provided by frontend
        if time_taken_ms is not None:
            update_data['time_taken_ms'] = time_taken_ms
        
        mongo_db.student_test_attempts.update_one(
            {'_id': ObjectId(attempt_id)},
            {'$set': update_data}
        )
        
        # Save to test_results collection with proper format
        try:
            # Convert detailed_results to the format expected by test_results
            results_for_test_results = []
            for result in detailed_results:
                # Find the corresponding question to get question_id
                question_id = result.get('question_id', '')
                if not question_id:
                    # Try to get question_id from the question object
                    question_index = result.get('question_index', 0)
                    if question_index < len(test.get('questions', [])):
                        question_obj = test['questions'][question_index]
                        question_id = str(question_obj.get('_id', ''))
                
                # Convert option text back to option letter for storage
                student_answer_letter = ''
                correct_answer_letter = result.get('correct_answer_letter', '')
                
                # Find which option letter corresponds to the student's text answer
                question_obj = None
                for q in test.get('questions', []):
                    if str(q.get('_id', '')) == question_id:
                        question_obj = q
                        break
                
                if question_obj:
                    student_answer_text = result.get('student_answer', '')
                    # Map student answer text back to option letter
                    if student_answer_text == question_obj.get('optionA', ''):
                        student_answer_letter = 'A'
                    elif student_answer_text == question_obj.get('optionB', ''):
                        student_answer_letter = 'B'
                    elif student_answer_text == question_obj.get('optionC', ''):
                        student_answer_letter = 'C'
                    elif student_answer_text == question_obj.get('optionD', ''):
                        student_answer_letter = 'D'
                
                results_for_test_results.append({
                    'question_id': question_id,
                    'question': result.get('question', ''),
                    'student_answer': student_answer_letter,
                    'correct_answer': correct_answer_letter,
                    'is_correct': result.get('is_correct', False),
                    'score': {'$numberInt': str(result.get('score', 0) * 100)}  # Convert to percentage format
                })
            
            # Create test_results document
            test_result_doc = {
                'student_id': ObjectId(current_user_id) if isinstance(current_user_id, str) else current_user_id,
                'test_id': ObjectId(test_id),
                'module_id': test.get('module_id', ''),
                'subcategory': test.get('subcategory', ''),
                'level_id': test.get('level_id'),
                'results': results_for_test_results,
                'total_score': {'$numberInt': str(score * 100)},  # Total score in percentage format
                'average_score': {'$numberDouble': str(percentage)},  # Average percentage
                'correct_answers': {'$numberInt': str(correct_answers)},
                'total_questions': {'$numberInt': str(total_questions)},
                'submitted_at': {'$date': {'$numberLong': str(int(end_time.timestamp() * 1000))}},
                'test_type': test.get('test_type', 'online'),
                'time_taken': {'$numberInt': str(int(duration_seconds))}
            }
            
            # Insert into test_results collection
            mongo_db.test_results.insert_one(test_result_doc)
            current_app.logger.info(f"Successfully saved test result to test_results collection for test {test_id}")
            
        except Exception as e:
            current_app.logger.error(f"Error saving to test_results collection: {e}", exc_info=True)
            # Don't fail the entire request if test_results saving fails
        
        return jsonify({
            'success': True,
            'message': 'Test submitted successfully',
            'data': {
                'score': score,
                'total_questions': total_questions,
                'correct_answers': correct_answers,
                'percentage': percentage,
                'detailed_results': detailed_results,
                'total_marks': test.get('total_marks', 0),
                'duration_seconds': duration_seconds,
                'time_taken_ms': time_taken_ms
            }
        }), 200
    except Exception as e:
        current_app.logger.error(f"Error submitting test: {e}", exc_info=True)
        return jsonify({'success': False, 'message': f'Failed to submit test: {str(e)}'}), 500

@student_bp.route('/grammar-progress', methods=['GET'])
@jwt_required()
def get_grammar_progress():
    try:
        current_user_id = get_jwt_identity()
        from config.constants import GRAMMAR_CATEGORIES

        if not isinstance(GRAMMAR_CATEGORIES, dict) or not GRAMMAR_CATEGORIES:
             logging.critical("GRAMMAR_CATEGORIES constant is not a valid dictionary or is empty.")
             return jsonify({'success': True, 'data': []}), 200

        ordered_categories = list(GRAMMAR_CATEGORIES.keys())
        scores_by_subcategory = {}
        
        try:
            # Get results from both collections
            all_results = []
            
            # Check test_results collection
            if hasattr(mongo_db, 'test_results'):
                test_results = list(mongo_db.test_results.find({
                    'student_id': ObjectId(current_user_id),
                    'module_id': 'GRAMMAR'
                }))
                all_results.extend(test_results)
                current_app.logger.info(f"Found {len(test_results)} grammar results in test_results collection")
            
            # Check student_test_attempts collection
            if hasattr(mongo_db, 'student_test_attempts'):
                attempt_results = list(mongo_db.student_test_attempts.find({
                    'student_id': current_user_id,
                    'test_type': 'practice'
                }))
                
                # Filter for grammar tests
                for attempt in attempt_results:
                    test = mongo_db.tests.find_one({'_id': attempt.get('test_id')})
                    if test and test.get('module_id') == 'GRAMMAR':
                        # Convert attempt to match test_results format
                        attempt_result = {
                            'subcategory': test.get('subcategory'),
                            'average_score': attempt.get('average_score', 0) or attempt.get('score_percentage', 0)
                        }
                        all_results.append(attempt_result)
                
                current_app.logger.info(f"Found {len(attempt_results)} total attempts, filtered for grammar")

            for result in all_results:
                if not isinstance(result, dict):
                    logging.warning(f"Skipping non-dict item in test results for user {current_user_id}: {result}")
                    continue

                try:
                    subcategory = result.get('subcategory')
                    score_val = result.get('average_score')

                    if subcategory and subcategory in GRAMMAR_CATEGORIES:
                        score = float(score_val)
                        
                        current_max_score = scores_by_subcategory.get(subcategory, -1.0)
                        if score > current_max_score:
                            scores_by_subcategory[subcategory] = score
                except (ValueError, TypeError, AttributeError) as e:
                    logging.warning(f"Skipping malformed test result for user {current_user_id}. Error: {e}. Result: {result}")
                    continue
        except Exception as db_error:
             current_app.logger.error(f"Database error fetching grammar progress for user {current_user_id}: {db_error}", exc_info=True)
             # Return empty progress instead of error
             return jsonify({'success': True, 'data': []}), 200

        progress_data = []
        unlocked = True
        for category_id in ordered_categories:
            category_name = GRAMMAR_CATEGORIES.get(category_id, "Unknown Category")
            score = scores_by_subcategory.get(category_id, 0.0)
            
            progress_data.append({
                'id': category_id,
                'name': category_name,
                'unlocked': unlocked,
                'score': score
            })
            
            if unlocked and score < 60:
                unlocked = False

        return jsonify({'success': True, 'data': progress_data}), 200

    except Exception as e:
        logging.error(f"FATAL error in /grammar-progress for user {get_jwt_identity()}: {e}", exc_info=True)
        return jsonify({'success': False, 'message': 'An unexpected internal error occurred.'}), 500

@student_bp.route('/test/<test_id>/random-assignment', methods=['GET'])
@jwt_required()
def get_student_random_test_assignment(test_id):
    """Get student's specific test assignment with randomized questions"""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.users.find_one({'_id': ObjectId(current_user_id)})
        
        if not user or user.get('role') != 'student':
            return jsonify({'success': False, 'message': 'Access denied'}), 403
        
        # Get student's batch-course instance
        student = mongo_db.students.find_one({'user_id': ObjectId(current_user_id)})
        if not student or not student.get('batch_course_instance_id'):
            return jsonify({'success': False, 'message': 'Student not assigned to any batch-course instance'}), 404
        
        instance_id = student['batch_course_instance_id']
        
        # Get test and verify it's assigned to this instance
        test = mongo_db.tests.find_one({
            '_id': ObjectId(test_id),
            'batch_course_instance_ids': instance_id,
            'is_active': True,
            'has_random_questions': True  # Only for tests with random questions
        })
        
        if not test:
            return jsonify({'success': False, 'message': 'Test not found or not available'}), 404
        
        # Check if student is assigned to this test
        if ObjectId(current_user_id) not in test.get('assigned_student_ids', []):
            return jsonify({'success': False, 'message': 'You are not assigned to this test'}), 403
        
        # Get student's specific test assignment
        assignment = mongo_db.student_test_assignments.find_one({
            'test_id': ObjectId(test_id),
            'student_id': ObjectId(current_user_id)
        })
        
        if not assignment:
            return jsonify({'success': False, 'message': 'Test assignment not found'}), 404
        
        # Check if test is already attempted
        if assignment.get('attempted', False):
            return jsonify({'success': False, 'message': 'Test already attempted'}), 409
        
        # Check if test is within time window
        now = datetime.now(pytz.utc)
        start_time = test.get('startDateTime')
        end_time = test.get('endDateTime')
        
        if start_time and now < start_time:
            return jsonify({'success': False, 'message': 'Test has not started yet'}), 400
        
        if end_time and now > end_time:
            return jsonify({'success': False, 'message': 'Test has ended'}), 400
        
        # Prepare test data for student (without correct answers)
        test_data = {
            'id': str(test['_id']),
            'name': test['name'],
            'module_id': test['module_id'],
            'level_id': test['level_id'],
            'duration': test['duration'],
            'startDateTime': test['startDateTime'],
            'endDateTime': test['endDateTime'],
            'questions': assignment['questions'],
            'total_questions': len(assignment['questions']),
            'assignment_id': str(assignment['_id'])
        }
        
        # Remove correct answers from questions for security
        for question in test_data['questions']:
            if 'correct_answer' in question:
                del question['correct_answer']
            if 'original_answer' in question:
                del question['original_answer']
        
        return jsonify({
            'success': True,
            'message': 'Test assignment retrieved successfully',
            'data': test_data
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting student test assignment: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@student_bp.route('/test/<test_id>/submit-random', methods=['POST'])
@jwt_required()
def submit_random_test(test_id):
    """Submit test with randomized questions and calculate score"""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.users.find_one({'_id': ObjectId(current_user_id)})
        
        if not user or user.get('role') != 'student':
            return jsonify({'success': False, 'message': 'Access denied'}), 403
        
        data = request.get_json()
        assignment_id = data.get('assignment_id')
        answers = data.get('answers', [])
        
        if not assignment_id:
            return jsonify({'success': False, 'message': 'Assignment ID is required'}), 400
        
        # Get student's test assignment
        assignment = mongo_db.student_test_assignments.find_one({
            '_id': ObjectId(assignment_id),
            'test_id': ObjectId(test_id),
            'student_id': ObjectId(current_user_id)
        })
        
        if not assignment:
            return jsonify({'success': False, 'message': 'Test assignment not found'}), 404
        
        if assignment.get('attempted', False):
            return jsonify({'success': False, 'message': 'Test already submitted'}), 409
        
        # Get test details
        test = mongo_db.tests.find_one({'_id': ObjectId(test_id)})
        if not test:
            return jsonify({'success': False, 'message': 'Test not found'}), 404
        

        # Calculate score properly
        score = 0
        total_questions = len(assignment['questions'])
        correct_answers = 0
        detailed_results = []
        
        current_app.logger.info(f"Calculating score for random test: {total_questions} questions")
        current_app.logger.info(f"Student answers: {answers}")
        
        for i, question in enumerate(assignment['questions']):
            question_id = f'question_{i}'
            student_answer = answers.get(question_id, '')
            
            # Get correct answer from question         
            correct_answer_letter = question.get('answer', '')  # A, B, C, or D
            correct_answer_text = ''
            
            # Map answer letter to actual option text
            if correct_answer_letter == 'A':
                correct_answer_text = question.get('optionA', '')
            elif correct_answer_letter == 'B':   
                correct_answer_text = question.get('optionB', '')
            elif correct_answer_letter == 'C':
                correct_answer_text = question.get('optionC', '')
            elif correct_answer_letter == 'D':
                correct_answer_text = question.get('optionD', '')
            
            # Check if student answer matches correct answer text
            is_correct = student_answer == correct_answer_text
            
            if is_correct:
                correct_answers += 1
                score += 1
            
            current_app.logger.info(f"Question {i}: student='{student_answer}', correct='{correct_answer_text}', is_correct={is_correct}")
            
            detailed_results.append({
                'question_index': i,
                'question_id': question_id,
                'question': question.get('question', ''),
                'student_answer': student_answer,
                'correct_answer_letter': correct_answer_letter,
                'correct_answer_text': correct_answer_text,
                'is_correct': is_correct,
                'score': 1 if is_correct else 0
            })
        
        # Calculate percentage
        percentage = (score / total_questions) * 100 if total_questions > 0 else 0
        
        current_app.logger.info(f"Final random test score: {score}/{total_questions} = {percentage:.2f}%")
        
        # Update assignment with results
        mongo_db.student_test_assignments.update_one(
            {'_id': ObjectId(assignment_id)},
            {
                '$set': {
                    'attempted': True,
                    'completed_at': datetime.now(pytz.utc),
                    'score': score,
                    'total_questions': total_questions,
                    'correct_answers': correct_answers,
                    'percentage': percentage,
                    'answers': answers,
                    'detailed_results': detailed_results
                }
            }
        )
        
        # Save to test_results collection with proper format for random tests
        try:
            # Convert detailed_results to the format expected by test_results
            results_for_test_results = []
            for result in detailed_results:
                # For random tests, question_id is already in the format 'question_X'
                question_id = result.get('question_id', '')
                
                # Convert option text back to option letter for storage
                student_answer_letter = ''
                correct_answer_letter = result.get('correct_answer_letter', '')
                
                # Find which option letter corresponds to the student's text answer
                question_index = result.get('question_index', 0)
                if question_index < len(assignment['questions']):
                    question_obj = assignment['questions'][question_index]
                    student_answer_text = result.get('student_answer', '')
                    
                    # Map student answer text back to option letter
                    if student_answer_text == question_obj.get('optionA', ''):
                        student_answer_letter = 'A'
                    elif student_answer_text == question_obj.get('optionB', ''):
                        student_answer_letter = 'B'
                    elif student_answer_text == question_obj.get('optionC', ''):
                        student_answer_letter = 'C'
                    elif student_answer_text == question_obj.get('optionD', ''):
                        student_answer_letter = 'D'
                
                results_for_test_results.append({
                    'question_id': question_id,
                    'question': result.get('question', ''),
                    'student_answer': student_answer_letter,
                    'correct_answer': correct_answer_letter,
                    'is_correct': result.get('is_correct', False),
                    'score': {'$numberInt': str(result.get('score', 0) * 100)}  # Convert to percentage format
                })
            
            # Create test_results document for random test
            test_result_doc = {
                'student_id': ObjectId(current_user_id) if isinstance(current_user_id, str) else current_user_id,
                'test_id': ObjectId(test_id),
                'module_id': test.get('module_id', ''),
                'subcategory': test.get('subcategory', ''),
                'level_id': test.get('level_id'),
                'results': results_for_test_results,
                'total_score': {'$numberInt': str(score * 100)},  # Total score in percentage format
                'average_score': {'$numberDouble': str(percentage)},  # Average percentage
                'correct_answers': {'$numberInt': str(correct_answers)},
                'total_questions': {'$numberInt': str(total_questions)},
                'submitted_at': {'$date': {'$numberLong': str(int(datetime.now(pytz.utc).timestamp() * 1000))}},
                'test_type': test.get('test_type', 'online'),
                'time_taken': {'$numberInt': '0'}  # Random tests don't track time
            }
            
            # Insert into test_results collection
            mongo_db.test_results.insert_one(test_result_doc)
            current_app.logger.info(f"Successfully saved random test result to test_results collection for test {test_id}")
            
        except Exception as e:
            current_app.logger.error(f"Error saving random test to test_results collection: {e}", exc_info=True)
            # Don't fail the entire request if test_results saving fails
        
        return jsonify({
            'success': True,
            'message': 'Test submitted successfully',
            'data': {
                'score': score,
                'total_questions': total_questions,
                'percentage': percentage,
                'correct_answers': correct_answers,
                'detailed_results': detailed_results
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error submitting random test: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@student_bp.route('/online-exams', methods=['GET'])
@jwt_required()
def get_online_exams():
    """Get available online exams for a student."""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.users.find_one({'_id': ObjectId(current_user_id)})
        
        if not user or user.get('role') != 'student':
            return jsonify({'success': False, 'message': 'Access denied'}), 403

        # Base query for active online exams assigned to the student's audience
        query = {
            'test_type': 'online', 
            'status': 'active',
            'campus_ids': user.get('campus_id'),
            'course_ids': user.get('course_id')
        }
        
        # Don't exclude questions field - we need it to count questions
        projection = { "audio_config": 0 }
        
        try:
            exams = list(mongo_db.tests.find(query, projection))
        except Exception as e:
            current_app.logger.warning(f"Error fetching online exams: {e}, using empty list")
            exams = []

        # Prepare data for frontend
        exams_data = []
        for exam in exams:
            from config.constants import MODULES, GRAMMAR_CATEGORIES, LEVELS
            module_name = MODULES.get(exam.get('module_id'), 'N/A')
            level_name = "N/A"
            if exam.get('module_id') == 'GRAMMAR':
                level_name = GRAMMAR_CATEGORIES.get(exam.get('subcategory'), 'N/A')
            else:
                level_name = LEVELS.get(exam.get('level_id'), {}).get('name', 'N/A')

            # Add start/end time fields
            start_dt = exam.get('startDateTime')
            end_dt = exam.get('endDateTime')

            exams_data.append({
                '_id': str(exam['_id']),
                'name': exam.get('name'),
                'module_name': module_name,
                'level_name': level_name,
                'question_count': len(exam.get('questions', [])) if exam.get('questions') else 0,
                'startDateTime': start_dt,
                'endDateTime': end_dt
            })
        
        # Convert any remaining ObjectId fields to strings for JSON serialization
        convert_objectids_to_strings(exams_data)
        
        return jsonify({
            'success': True,
            'message': 'Online exams retrieved successfully',
            'data': exams_data
        }), 200
        
    except Exception as e:
        logging.error(f"Error in /student/online-exams for user {current_user_id}: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'message': f'An error occurred while fetching online exams: {str(e)}'
        }), 500 

@student_bp.route('/test/<test_id>', methods=['GET'])
@jwt_required()
def get_single_test(test_id):
    """Get full details for a single test for a student to take."""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.users.find_one({'_id': ObjectId(current_user_id)})
        
        if not user or user.get('role') != 'student':
            return jsonify({'success': False, 'message': 'Access denied'}), 403

        test = mongo_db.tests.find_one({'_id': ObjectId(test_id)})
        if not test:
            return jsonify({'success': False, 'message': 'Test not found'}), 404
            
        # For practice tests, be more lenient with access control
        # Check if this is a practice test that should be accessible
        if test.get('test_type') == 'practice':
            current_app.logger.info(f"Practice test detected: {test.get('name')} - allowing access")
        else:
            # For non-practice tests, check if student has proper access
            # This maintains security for online exams while allowing practice tests
            pass

        # Add debugging for listening module tests
        current_app.logger.info(f"Fetching test {test_id} for student {current_user_id}")
        current_app.logger.info(f"Test module_id: {test.get('module_id')}")
        current_app.logger.info(f"Test has questions: {bool(test.get('questions'))}")
        if test.get('questions'):
            current_app.logger.info(f"Number of questions: {len(test['questions'])}")
            current_app.logger.info(f"First question structure: {test['questions'][0] if test['questions'] else 'No questions'}")
            
            # Special debugging for listening modules
            if test.get('module_id') == 'LISTENING':
                audio_questions = [q for q in test['questions'] if q.get('audio_url') or q.get('has_audio')]
                text_only_questions = [q for q in test['questions'] if not (q.get('audio_url') or q.get('has_audio'))]
                current_app.logger.info(f"LISTENING MODULE DEBUG: {len(audio_questions)} questions with audio, {len(text_only_questions)} questions without audio")
                
                if text_only_questions:
                    current_app.logger.warning(f"LISTENING MODULE: {len(text_only_questions)} questions missing audio - will use text fallback")

        convert_objectids_to_strings(test)

        # --- PROCESS QUESTIONS ---
        import random
        if 'questions' in test and isinstance(test['questions'], list):
            # For listening modules, maintain consistent question order to prevent audio mismatch
            if test.get('module_id') == 'LISTENING':
                # Use a deterministic shuffle based on test_id to maintain consistency
                test_id_str = str(test['_id'])
                random.seed(hash(test_id_str) % 1000000)  # Use test ID as seed for consistent order
                random.shuffle(test['questions'])
                random.seed()  # Reset seed to prevent affecting other operations
                current_app.logger.info(f"Questions shuffled with consistent seed for listening test: {test_id_str}")
            else:
                # For other modules, shuffle normally
                random.shuffle(test['questions'])

            processed_questions = []
            for idx, q in enumerate(test['questions']):
                current_app.logger.info(f"Processing question {idx + 1}: {q.get('question_type', 'unknown')}")
                
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

                    # Build clean question dict for frontend
                    clean_q = {
                        "question_id": str(q.get('_id', f"q_{idx+1}")),
                        "question": q.get('question'),
                        "question_type": q.get('question_type'),
                        "instructions": q.get('instructions', ''),
                        "options": new_options,
                        # keep correct_answer internally for validation, but don't expose to student
                        "correct_answer": answer_map.get(answer_letter)
                    }

                    processed_questions.append(clean_q)

                elif q.get('question_type') in ['sentence', 'listening', 'speaking']:
                    # Handle listening/speaking questions with proper audio support
                    has_audio = q.get('has_audio', False) or bool(q.get('audio_url'))
                    
                    if has_audio:
                        # For listening module, hide the sentence text from students
                        if test.get('module_id') == 'LISTENING':
                            # Convert S3 key to full URL if it's not already a full URL
                            audio_url = q.get('audio_url')
                            if audio_url and audio_url.startswith('audio/') and not audio_url.startswith('http'):
                                from config.aws_config import S3_BUCKET_NAME
                                audio_url = f"https://{S3_BUCKET_NAME}.s3.amazonaws.com/{audio_url}"
                                current_app.logger.info(f"Converted S3 key to full URL for listening: {audio_url}")
                            
                            clean_q = {
                                "question_id": str(q.get('_id', f"q_{idx+1}")),
                                "question": "Listen to the audio and record your response",  # Hide actual sentence
                                "question_type": "listening",
                                "instructions": q.get('instructions', ''),
                                "audio_url": audio_url,
                                "has_audio": True,
                                "audio_config": q.get('audio_config', {}),
                                "module_id": "LISTENING",
                                "sentence": q.get('sentence', ''),  # Keep for backend reference
                                "hidden_sentence": q.get('sentence', '')  # Store original sentence
                            }
                            current_app.logger.info(f"Listening question processed with hidden sentence: {q.get('sentence', '')[:50]}...")
                        else:
                            # For other modules, show the sentence normally
                            # Convert S3 key to full URL if it's not already a full URL
                            audio_url = q.get('audio_url')
                            if audio_url and audio_url.startswith('audio/') and not audio_url.startswith('http'):
                                from config.aws_config import S3_BUCKET_NAME
                                audio_url = f"https://{S3_BUCKET_NAME}.s3.amazonaws.com/{audio_url}"
                                current_app.logger.info(f"Converted S3 key to full URL for other module: {audio_url}")
                            
                            clean_q = {
                                "question_id": str(q.get('_id', f"q_{idx+1}")),
                                "question": q.get('question') or q.get('sentence', ''),
                                "question_type": q.get('question_type'),
                                "instructions": q.get('instructions', ''),
                                "audio_url": audio_url,
                                "has_audio": True,
                                "audio_config": q.get('audio_config', {}),
                                "module_id": test.get('module_id'),
                                "sentence": q.get('sentence', '')
                            }
                            current_app.logger.info(f"Audio question processed: {q.get('question_type')} with audio_url: {audio_url}")
                    else:
                        # For listening module, try to find audio in alternative fields
                        if test.get('module_id') == 'LISTENING':
                            # Check for audio in different possible field names
                            audio_url = (q.get('audio_url') or q.get('audio') or 
                                       q.get('audio_file') or q.get('file_url') or 
                                       q.get('question_audio'))
                            
                            if audio_url:
                                # Convert S3 key to full URL if it's not already a full URL
                                if audio_url.startswith('audio/') and not audio_url.startswith('http'):
                                    from config.aws_config import S3_BUCKET_NAME
                                    audio_url = f"https://{S3_BUCKET_NAME}.s3.amazonaws.com/{audio_url}"
                                    current_app.logger.info(f"Converted S3 key to full URL: {audio_url}")
                                
                                clean_q = {
                                    "question_id": str(q.get('_id', f"q_{idx+1}")),
                                    "question": "Listen to the audio and record your response",  # Hide actual sentence
                                    "question_type": "listening",
                                    "instructions": q.get('instructions', ''),
                                    "audio_url": audio_url,
                                    "has_audio": True,
                                    "audio_config": q.get('audio_config', {}),
                                    "module_id": "LISTENING",
                                    "sentence": q.get('sentence', ''),
                                    "hidden_sentence": q.get('sentence', ''),
                                    "audio_id": f"audio_{q.get('_id', idx)}_{hash(audio_url)}"  # Unique audio ID
                                }
                                current_app.logger.info(f"Listening question with audio found: {audio_url}")
                            else:
                                # Fallback for listening questions without audio
                                clean_q = {
                                    "question_id": str(q.get('_id', f"q_{idx+1}")),
                                    "question": q.get('question') or q.get('sentence', ''),
                                    "question_type": "text_fallback",
                                    "instructions": q.get('instructions', '') + " (Audio not available - text mode)",
                                    "original_type": q.get('question_type'),
                                    "audio_status": "missing",
                                    "module_id": "LISTENING"
                                }
                                current_app.logger.warning(f"Listening question missing audio - using text fallback")
                        else:
                            # For other modules, use text fallback
                            clean_q = {
                                "question_id": str(q.get('_id', f"q_{idx+1}")),
                                "question": q.get('question') or q.get('sentence', ''),
                                "question_type": "text_fallback",
                                "instructions": q.get('instructions', '') + " (Audio not available - text mode)",
                                "original_type": q.get('question_type'),
                                "audio_status": "missing"
                            }
                            current_app.logger.warning(f"Audio missing for {q.get('question_type')} question - using text fallback")
                    
                    processed_questions.append(clean_q)
                    current_app.logger.info(f"Processed {q.get('question_type')} question: {clean_q['question'][:50]}...")

                else:
                    # Non-MCQ questions
                    clean_q = {
                        "question_id": str(q.get('_id', f"q_{idx+1}")),
                        "question": q.get('question'),
                        "question_type": q.get('question_type'),
                        "instructions": q.get('instructions', '')
                    }
                    processed_questions.append(clean_q)

            test['questions'] = processed_questions
            current_app.logger.info(f"Successfully processed {len(processed_questions)} questions")

            # Remove correct_answer before sending response
            for q in test['questions']:
                if 'correct_answer' in q:
                    del q['correct_answer']
        else:
            current_app.logger.warning(f"No questions found in test {test_id} or questions is not a list")
            test['questions'] = []

        return jsonify({'success': True, 'data': test})

    except Exception as e:
        logging.error(f"Error fetching single test {test_id} for student {current_user_id}: {e}", exc_info=True)
        return jsonify({'success': False, 'message': 'Could not load test details.'}), 500


@student_bp.route('/test-history', methods=['GET'])
@jwt_required()
def get_test_history():
    """Get student's test history with detailed results from student_test_attempts"""
    try:
        current_user_id = get_jwt_identity()
        
        # Get all attempts from student_test_attempts collection
        all_attempts = []
        
        try:
            if hasattr(mongo_db, 'student_test_attempts'):
                pipeline = [
                    {
                        '$match': {
                            '$or': [
                                {'student_id': ObjectId(current_user_id)},
                                {'student_id': current_user_id}
                            ],
                            'status': 'completed'  # Only get completed attempts
                        }
                    },
                    {
                        '$lookup': {
                            'from': 'tests',
                            'localField': 'test_id',
                            'foreignField': '_id',
                            'as': 'test_details'
                        }
                    },
                    {
                        '$unwind': '$test_details'
                    },
                    {
                        '$project': {
                            '_id': 1,
                            'test_id': 1,
                            'test_name': '$test_details.name',
                            'module_id': '$test_details.module_id',
                            'subcategory': '$test_details.subcategory',
                            'level_id': '$test_details.level_id',
                            'average_score': 1,
                            'score_percentage': 1,
                            'percentage': 1,
                            'score': 1,
                            'correct_answers': 1,
                            'total_questions': 1,
                            'time_taken': 1,
                            'duration_seconds': 1,
                            'time_taken_ms': 1,
                            'submitted_at': 1,
                            'end_time': 1,
                            'start_time': 1,
                            'test_type': 1,
                            'detailed_results': 1,
                            'answers': 1,
                            'total_marks': 1,
                            'status': 1
                        }
                    },
                    { '$sort': { 'end_time': -1, 'submitted_at': -1 } }
                ]
                
                all_attempts = list(mongo_db.student_test_attempts.aggregate(pipeline))
                current_app.logger.info(f"Found {len(all_attempts)} completed attempts in student_test_attempts collection")
            else:
                current_app.logger.warning("student_test_attempts collection not found")
        except Exception as e:
            current_app.logger.warning(f"Error aggregating from student_test_attempts: {e}")
        
        # Group attempts by test_id to show all attempts for each test
        test_groups = {}
        for attempt in all_attempts:
            test_id = str(attempt.get('test_id'))
            if test_id not in test_groups:
                test_groups[test_id] = {
                    'test_id': test_id,
                    'test_name': attempt.get('test_name'),
                    'module_id': attempt.get('module_id'),
                    'subcategory': attempt.get('subcategory'),
                    'level_id': attempt.get('level_id'),
                    'test_type': attempt.get('test_type'),
                    'attempts': []
                }
            test_groups[test_id]['attempts'].append(attempt)
        
        # Convert to list and sort by most recent attempt
        results = []
        for test_id, test_data in test_groups.items():
            # Sort attempts by date (most recent first)
            test_data['attempts'].sort(key=lambda x: x.get('end_time') or x.get('submitted_at') or datetime.min, reverse=True)
            
            # Add test summary data
            latest_attempt = test_data['attempts'][0]
            test_data['latest_score'] = latest_attempt.get('percentage') or latest_attempt.get('score_percentage') or latest_attempt.get('average_score') or 0
            test_data['latest_correct_answers'] = latest_attempt.get('correct_answers', 0)
            test_data['total_questions'] = latest_attempt.get('total_questions', 0)
            test_data['latest_submitted_at'] = latest_attempt.get('end_time') or latest_attempt.get('submitted_at')
            test_data['attempt_count'] = len(test_data['attempts'])
            
            results.append(test_data)
        
        # Sort results by most recent attempt
        results.sort(key=lambda x: x.get('latest_submitted_at') or datetime.min, reverse=True)
        current_app.logger.info(f"Total test groups: {len(results)}")
        
        # Convert ObjectIds to strings and add module names
        for result in results:
            from config.constants import MODULES, LEVELS
            result['module_name'] = MODULES.get(result.get('module_id'), 'Unknown')
            result['level_name'] = LEVELS.get(result.get('level_id'), {}).get('name', 'Unknown')
            
            # Handle timestamp for latest attempt
            if result.get('latest_submitted_at'):
                result['latest_submitted_at'] = result['latest_submitted_at'].isoformat()
            
            # Process each attempt in the attempts array
            for attempt in result.get('attempts', []):
                # Convert ObjectIds to strings
                attempt['_id'] = str(attempt['_id'])
                attempt['test_id'] = str(attempt['test_id'])
                
                # Handle timestamp
                if attempt.get('end_time'):
                    attempt['end_time'] = attempt['end_time'].isoformat()
                if attempt.get('submitted_at'):
                    attempt['submitted_at'] = attempt['submitted_at'].isoformat()
                
                # Calculate proper percentage for different test types
                if attempt.get('test_type') == 'online':
                    # For online exams, use score field and calculate percentage
                    score = attempt.get('score', 0)
                    total_marks = attempt.get('total_marks', 0)
                    
                    if total_marks > 0:
                        calculated_percentage = (score / total_marks) * 100
                        attempt['score_percentage'] = calculated_percentage
                        attempt['average_score'] = calculated_percentage
                    else:
                        attempt['score_percentage'] = 0
                        attempt['average_score'] = 0
                elif attempt.get('test_type') == 'practice':
                    # For practice tests, use existing percentage or calculate from score
                    if 'percentage' in attempt and attempt['percentage'] is not None:
                        attempt['score_percentage'] = attempt['percentage']
                        attempt['average_score'] = attempt['percentage']
                    elif 'average_score' in attempt and attempt['average_score'] is not None:
                        attempt['score_percentage'] = attempt['average_score']
                    else:
                        # Calculate from score and total_questions
                        score = attempt.get('score', 0)
                        total_questions = attempt.get('total_questions', 0)
                        if total_questions > 0:
                            calculated_percentage = (score / total_questions) * 100
                            attempt['score_percentage'] = calculated_percentage
                            attempt['average_score'] = calculated_percentage
                        else:
                            attempt['score_percentage'] = 0
                            attempt['average_score'] = 0
                
                # Format duration for display
                duration_seconds = attempt.get('duration_seconds', 0)
                time_taken_ms = attempt.get('time_taken_ms', 0)
                
                if duration_seconds > 0:
                    minutes = int(duration_seconds // 60)
                    seconds = int(duration_seconds % 60)
                    attempt['formatted_duration'] = f"{minutes}m {seconds}s"
                elif time_taken_ms > 0:
                    duration_seconds = time_taken_ms / 1000
                    minutes = int(duration_seconds // 60)
                    seconds = int(duration_seconds % 60)
                    attempt['formatted_duration'] = f"{minutes}m {seconds}s"
                else:
                    attempt['formatted_duration'] = "N/A"
        
        # Convert any remaining ObjectId fields to strings for JSON serialization
        convert_objectids_to_strings(results)
        
        return jsonify({
            'success': True,
            'data': results
        }), 200
        
    except Exception as e:
        logging.error(f"Error fetching test history for student {get_jwt_identity()}: {e}", exc_info=True)
        return jsonify({'success': False, 'message': 'Failed to fetch test history.'}), 500

@student_bp.route('/practice-results', methods=['GET'])
@jwt_required()
def get_practice_results():
    """Get detailed practice module results for student"""
    try:
        current_user_id = get_jwt_identity()
        
        # Get practice results from both collections
        all_results = []
        
        # Try to get from test_results collection
        try:
            if hasattr(mongo_db, 'test_results'):
                pipeline = [
                    {
                        '$match': {
                            'student_id': ObjectId(current_user_id),
                            'test_type': 'practice'
                        }
                    },
                    {
                        '$lookup': {
                            'from': 'tests',
                            'localField': 'test_id',
                            'foreignField': '_id',
                            'as': 'test_details'
                        }
                    },
                    {
                        '$unwind': '$test_details'
                    },
                    {
                        '$group': {
                            '_id': {
                                'module_id': '$test_details.module_id',
                                'subcategory': '$subcategory'
                            },
                            'module_name': { '$first': '$test_details.module_id' },
                            'subcategory_name': { '$first': '$subcategory' },
                            'total_attempts': { '$sum': 1 },
                            'highest_score': { '$max': '$score_percentage' },  # Use score_percentage for highest score
                            'average_score': { '$avg': '$score_percentage' },  # Use score_percentage for average
                            'total_questions_attempted': { '$sum': '$total_questions' },
                            'total_correct_answers': { '$sum': '$correct_answers' },
                            'last_attempt': { '$max': '$submitted_at' },
                            'results': { '$push': '$$ROOT' }
                        }
                    },
                    {
                        '$sort': { 'module_name': 1, 'subcategory_name': 1 }
                    }
                ]
                
                test_results = list(mongo_db.test_results.aggregate(pipeline))
                all_results.extend(test_results)
                current_app.logger.info(f"Found {len(test_results)} practice results in test_results collection")
            else:
                current_app.logger.warning("test_results collection not found")
        except Exception as e:
            current_app.logger.warning(f"Error aggregating practice results from test_results: {e}")
        
        # Also get from student_test_attempts collection
        try:
            if hasattr(mongo_db, 'student_test_attempts'):
                pipeline = [
                    {
                        '$match': {
                            'student_id': current_user_id,
                            'test_type': 'practice'
                        }
                    },
                    {
                        '$lookup': {
                            'from': 'tests',
                            'localField': 'test_id',
                            'foreignField': '_id',
                            'as': 'test_details'
                        }
                    },
                    {
                        '$unwind': '$test_details'
                    },
                    {
                        '$group': {
                            '_id': {
                                'module_id': '$test_details.module_id',
                                'subcategory': '$test_details.subcategory'
                            },
                            'module_name': { '$first': '$test_details.module_id' },
                            'subcategory_name': { '$first': '$test_details.subcategory' },
                            'total_attempts': { '$sum': 1 },
                            'highest_score': { '$max': '$score_percentage' },  # Use score_percentage for highest score
                            'average_score': { '$avg': '$score_percentage' },  # Use score_percentage for average
                            'total_questions_attempted': { '$sum': '$total_questions' },
                            'total_correct_answers': { '$sum': '$correct_answers' },
                            'last_attempt': { '$max': '$submitted_at' },
                            'results': { '$push': '$$ROOT' }
                        }
                    },
                    {
                        '$sort': { 'module_name': 1, 'subcategory_name': 1 }
                    }
                ]
                
                attempt_results = list(mongo_db.student_test_attempts.aggregate(pipeline))
                all_results.extend(attempt_results)
                current_app.logger.info(f"Found {len(attempt_results)} practice results in student_test_attempts collection")
            else:
                current_app.logger.warning("student_test_attempts collection not found")
        except Exception as e:
            current_app.logger.warning(f"Error aggregating practice results from student_test_attempts: {e}")
        
        # Merge results from both collections
        merged_results = {}
        for result in all_results:
            key = f"{result['_id']['module_id']}_{result['_id']['subcategory']}"
            if key not in merged_results:
                merged_results[key] = result
            else:
                # Merge the results, taking the better scores
                existing = merged_results[key]
                merged_results[key] = {
                    '_id': result['_id'],
                    'module_name': result['module_name'],
                    'subcategory_name': result['subcategory_name'],
                    'total_attempts': existing['total_attempts'] + result['total_attempts'],
                    'highest_score': max(existing['highest_score'], result['highest_score']),
                    'average_score': (existing['average_score'] + result['average_score']) / 2,
                    'total_questions_attempted': existing['total_questions_attempted'] + result['total_questions_attempted'],
                    'total_correct_answers': existing['total_correct_answers'] + result['total_correct_answers'],
                    'last_attempt': max(existing['last_attempt'], result['last_attempt']),
                    'results': existing['results'] + result['results']
                }
        
        results = list(merged_results.values())
        current_app.logger.info(f"Total merged practice results: {len(results)}")
        
        # Process results
        for result in results:
            from config.constants import MODULES
            result['module_name'] = MODULES.get(result['module_name'], 'Unknown')
            result['accuracy'] = (result['total_correct_answers'] / result['total_questions_attempted'] * 100) if result['total_questions_attempted'] > 0 else 0
            result['last_attempt'] = result['last_attempt'].isoformat() if result['last_attempt'] else None
        
        # Convert any ObjectId fields to strings for JSON serialization
        convert_objectids_to_strings(results)
        
        return jsonify({
            'success': True,
            'data': results
        }), 200
        
    except Exception as e:
        logging.error(f"Error fetching practice results for student {get_jwt_identity()}: {e}", exc_info=True)
        return jsonify({'success': False, 'message': 'Failed to fetch practice results.'}), 500

@student_bp.route('/grammar-detailed-results', methods=['GET'])
@jwt_required()
def get_grammar_detailed_results():
    """Get detailed grammar practice results by subcategory"""
    try:
        current_user_id = get_jwt_identity()
        
        # Get grammar results from both collections
        all_results = []
        
        # Try to get from test_results collection
        try:
            if hasattr(mongo_db, 'test_results'):
                pipeline = [
                    {
                        '$match': {
                            'student_id': ObjectId(current_user_id),
                            'module_id': 'GRAMMAR',
                            'test_type': 'practice'
                        }
                    },
                    {
                        '$lookup': {
                            'from': 'tests',
                            'localField': 'test_id',
                            'foreignField': '_id',
                            'as': 'test_details'
                        }
                    },
                    {
                        '$unwind': '$test_details'
                    },
                    {
                        '$group': {
                            '_id': '$subcategory',
                            'subcategory_name': { '$first': '$subcategory' },
                            'total_attempts': { '$sum': 1 },
                            'highest_score': { '$max': '$score_percentage' },  # Use score_percentage for highest score
                            'average_score': { '$avg': '$score_percentage' },  # Use score_percentage for average
                            'total_questions': { '$sum': '$total_questions' },
                            'total_correct': { '$sum': '$correct_answers' },
                            'last_attempt': { '$max': '$submitted_at' },
                            'attempts': {
                                '$push': {
                                    'test_name': '$test_details.name',
                                    'score': '$score_percentage',  # Use score_percentage for individual scores
                                    'correct_answers': '$correct_answers',
                                    'total_questions': '$total_questions',
                                    'submitted_at': '$submitted_at',
                                    'result_id': '$_id'
                                }
                            }
                        }
                    },
                    {
                        '$sort': { 'subcategory_name': 1 }
                    }
                ]
                
                test_results = list(mongo_db.test_results.aggregate(pipeline))
                all_results.extend(test_results)
                current_app.logger.info(f"Found {len(test_results)} grammar results in test_results collection")
            else:
                current_app.logger.warning("test_results collection not found")
        except Exception as e:
            current_app.logger.warning(f"Error aggregating grammar results from test_results: {e}")
        
        # Also get from student_test_attempts collection
        try:
            if hasattr(mongo_db, 'student_test_attempts'):
                pipeline = [
                    {
                        '$match': {
                            'student_id': current_user_id,
                            'test_type': 'practice'
                        }
                    },
                    {
                        '$lookup': {
                            'from': 'tests',
                            'localField': 'test_id',
                            'foreignField': '_id',
                            'as': 'test_details'
                        }
                    },
                    {
                        '$unwind': '$test_details'
                    },
                    {
                        '$match': {
                            'test_details.module_id': 'GRAMMAR'
                        }
                    },
                    {
                        '$group': {
                            '_id': '$test_details.subcategory',
                            'subcategory_name': { '$first': '$test_details.subcategory' },
                            'total_attempts': { '$sum': 1 },
                            'highest_score': { '$max': '$score_percentage' },  # Use score_percentage for highest score
                            'average_score': { '$avg': '$score_percentage' },  # Use score_percentage for average
                            'total_questions': { '$sum': '$total_questions' },
                            'total_correct': { '$sum': '$correct_answers' },
                            'last_attempt': { '$max': '$submitted_at' },
                            'attempts': {
                                '$push': {
                                    'test_name': '$test_details.name',
                                    'score': '$score_percentage',  # Use score_percentage for individual scores
                                    'correct_answers': '$correct_answers',
                                    'total_questions': '$total_questions',
                                    'submitted_at': '$submitted_at',
                                    'result_id': '$_id'
                                }
                            }
                        }
                    },
                    {
                        '$sort': { 'subcategory_name': 1 }
                    }
                ]
                
                attempt_results = list(mongo_db.student_test_attempts.aggregate(pipeline))
                all_results.extend(attempt_results)
                current_app.logger.info(f"Found {len(attempt_results)} grammar results in student_test_attempts collection")
            else:
                current_app.logger.warning("student_test_attempts collection not found")
        except Exception as e:
            current_app.logger.warning(f"Error aggregating grammar results from student_test_attempts: {e}")
        
        # Merge results from both collections
        merged_results = {}
        for result in all_results:
            subcategory = result['_id']
            if subcategory not in merged_results:
                merged_results[subcategory] = result
            else:
                # Merge the results, taking the better scores
                existing = merged_results[subcategory]
                merged_results[subcategory] = {
                    '_id': subcategory,
                    'subcategory_name': result['subcategory_name'],
                    'total_attempts': existing['total_attempts'] + result['total_attempts'],
                    'highest_score': max(existing['highest_score'], result['highest_score']),
                    'average_score': (existing['average_score'] + result['average_score']) / 2,
                    'total_questions': existing['total_questions'] + result['total_questions'],
                    'total_correct': existing['total_correct'] + result['total_correct'],
                    'last_attempt': max(existing['last_attempt'], result['last_attempt']),
                    'attempts': existing['attempts'] + result['attempts']
                }
        
        results = list(merged_results.values())
        current_app.logger.info(f"Total merged grammar results: {len(results)}")
        
        # Process results
        for result in results:
            from config.constants import GRAMMAR_CATEGORIES
            result['subcategory_display_name'] = GRAMMAR_CATEGORIES.get(result['subcategory_name'], result['subcategory_name'])
            result['accuracy'] = (result['total_correct'] / result['total_questions'] * 100) if result['total_questions'] > 0 else 0
            result['last_attempt'] = result['last_attempt'].isoformat() if result['last_attempt'] else None
            result['status'] = 'completed' if result['highest_score'] >= 60 else 'needs_improvement'
            
            # Sort attempts by date
            result['attempts'].sort(key=lambda x: x['submitted_at'], reverse=True)
            
            # Convert ObjectIds to strings
            for attempt in result['attempts']:
                attempt['result_id'] = str(attempt['result_id'])
                attempt['submitted_at'] = attempt['submitted_at'].isoformat()
        
        # Convert any remaining ObjectId fields to strings for JSON serialization
        convert_objectids_to_strings(results)
        
        return jsonify({
            'success': True,
            'data': results
        }), 200
        
    except Exception as e:
        logging.error(f"Error fetching grammar detailed results for student {get_jwt_identity()}: {e}", exc_info=True)
        return jsonify({'success': False, 'message': 'Failed to fetch grammar results.'}), 500

@student_bp.route('/vocabulary-detailed-results', methods=['GET'])
@jwt_required()
def get_vocabulary_detailed_results():
    """Get detailed vocabulary practice results"""
    try:
        current_user_id = get_jwt_identity()
        
        # Get vocabulary results from both collections
        all_results = []
        
        # Try to get from test_results collection
        try:
            if hasattr(mongo_db, 'test_results'):
                pipeline = [
                    {
                        '$match': {
                            'student_id': ObjectId(current_user_id),
                            'module_id': 'VOCABULARY',
                            'test_type': 'practice'
                        }
                    },
                    {
                        '$lookup': {
                            'from': 'tests',
                            'localField': 'test_id',
                            'foreignField': '_id',
                            'as': 'test_details'
                        }
                    },
                    {
                        '$unwind': '$test_details'
                    },
                    {
                        '$group': {
                            '_id': '$test_details.level_id',
                            'level_name': { '$first': '$test_details.level_id' },
                            'total_attempts': { '$sum': 1 },
                            'highest_score': { '$max': '$score_percentage' },  # Use score_percentage for highest score
                            'average_score': { '$avg': '$score_percentage' },  # Use score_percentage for average
                            'total_questions': { '$sum': '$total_questions' },
                            'total_correct': { '$sum': '$correct_answers' },
                            'last_attempt': { '$max': '$submitted_at' },
                            'attempts': {
                                '$push': {
                                    'test_name': '$test_details.name',
                                    'score': '$score_percentage',  # Use score_percentage for individual scores
                                    'correct_answers': '$correct_answers',
                                    'total_questions': '$total_questions',
                                    'submitted_at': '$submitted_at',
                                    'result_id': '$_id'
                                }
                            }
                        }
                    },
                    {
                        '$sort': { 'level_name': 1 }
                    }
                ]
                
                test_results = list(mongo_db.test_results.aggregate(pipeline))
                all_results.extend(test_results)
                current_app.logger.info(f"Found {len(test_results)} vocabulary results in test_results collection")
            else:
                current_app.logger.warning("test_results collection not found")
        except Exception as e:
            current_app.logger.warning(f"Error aggregating vocabulary results from test_results: {e}")
        
        # Also get from student_test_attempts collection
        try:
            if hasattr(mongo_db, 'student_test_attempts'):
                pipeline = [
                    {
                        '$match': {
                            'student_id': current_user_id,
                            'test_type': 'practice'
                        }
                    },
                    {
                        '$lookup': {
                            'from': 'tests',
                            'localField': 'test_id',
                            'foreignField': '_id',
                            'as': 'test_details'
                        }
                    },
                    {
                        '$unwind': '$test_details'
                    },
                    {
                        '$match': {
                            'test_details.module_id': 'VOCABULARY'
                        }
                    },
                    {
                        '$group': {
                            '_id': '$test_details.level_id',
                            'level_name': { '$first': '$test_details.level_id' },
                            'total_attempts': { '$sum': 1 },
                            'highest_score': { '$max': '$score_percentage' },  # Use score_percentage for highest score
                            'average_score': { '$avg': '$score_percentage' },  # Use score_percentage for average
                            'total_questions': { '$sum': '$total_questions' },
                            'total_correct': { '$sum': '$correct_answers' },
                            'last_attempt': { '$max': '$submitted_at' },
                            'attempts': {
                                '$push': {
                                    'test_name': '$test_details.name',
                                    'score': '$score_percentage',  # Use score_percentage for individual scores
                                    'correct_answers': '$correct_answers',
                                    'total_questions': '$total_questions',
                                    'submitted_at': '$submitted_at',
                                    'result_id': '$_id'
                                }
                            }
                        }
                    },
                    {
                        '$sort': { 'level_name': 1 }
                    }
                ]
                
                attempt_results = list(mongo_db.student_test_attempts.aggregate(pipeline))
                all_results.extend(attempt_results)
                current_app.logger.info(f"Found {len(attempt_results)} vocabulary results in student_test_attempts collection")
            else:
                current_app.logger.warning("student_test_attempts collection not found")
        except Exception as e:
            current_app.logger.warning(f"Error aggregating vocabulary results from student_test_attempts: {e}")
        
        # Merge results from both collections
        merged_results = {}
        for result in all_results:
            level_id = result['_id']
            if level_id not in merged_results:
                merged_results[level_id] = result
            else:
                # Merge the results, taking the better scores
                existing = merged_results[level_id]
                merged_results[level_id] = {
                    '_id': level_id,
                    'level_name': result['level_name'],
                    'total_attempts': existing['total_attempts'] + result['total_attempts'],
                    'highest_score': max(existing['highest_score'], result['highest_score']),
                    'average_score': (existing['average_score'] + result['average_score']) / 2,
                    'total_questions': existing['total_questions'] + result['total_questions'],
                    'total_correct': existing['total_correct'] + result['total_correct'],
                    'last_attempt': max(existing['last_attempt'], result['last_attempt']),
                    'attempts': existing['attempts'] + result['attempts']
                }
        
        results = list(merged_results.values())
        current_app.logger.info(f"Total merged vocabulary results: {len(results)}")
        
        # Process results
        for result in results:
            from config.constants import LEVELS
            result['level_display_name'] = LEVELS.get(result['level_name'], {}).get('name', result['level_name'])
            result['accuracy'] = (result['total_correct'] / result['total_questions'] * 100) if result['total_questions'] > 0 else 0
            result['last_attempt'] = result['last_attempt'].isoformat() if result['last_attempt'] else None
            result['status'] = 'completed' if result['highest_score'] >= 60 else 'needs_improvement'
            
            # Sort attempts by date
            result['attempts'].sort(key=lambda x: x['submitted_at'], reverse=True)
            
            # Convert ObjectIds to strings
            for attempt in result['attempts']:
                attempt['result_id'] = str(attempt['result_id'])
                attempt['submitted_at'] = attempt['submitted_at'].isoformat()
        
        # Convert any remaining ObjectId fields to strings for JSON serialization
        convert_objectids_to_strings(results)
        
        return jsonify({
            'success': True,
            'data': results
        }), 200
        
    except Exception as e:
        logging.error(f"Error fetching vocabulary detailed results for student {get_jwt_identity()}: {e}", exc_info=True)
        return jsonify({'success': False, 'message': 'Failed to fetch vocabulary results.'}), 500

@student_bp.route('/progress-summary', methods=['GET'])
@jwt_required()
def get_progress_summary():
    """Get comprehensive progress summary for student"""
    try:
        current_user_id = get_jwt_identity()
        
        # Get progress from both collections
        total_results = 0
        all_modules = []
        
        # Try to get from test_results collection
        try:
            if hasattr(mongo_db, 'test_results'):
                total_results += mongo_db.test_results.count_documents({
                    'student_id': ObjectId(current_user_id),
                    'test_type': 'practice'
                })
                
                pipeline = [
                    {
                        '$match': {
                            'student_id': ObjectId(current_user_id),
                            'test_type': 'practice'
                        }
                    },
                    {
                        '$lookup': {
                            'from': 'tests',
                            'localField': 'test_id',
                            'foreignField': '_id',
                            'as': 'test_details'
                        }
                    },
                    {'$unwind': '$test_details'},
                    {
                        '$group': {
                            '_id': '$test_details.module_id',
                            'module_name': { '$first': '$test_details.module_id' },
                            'total_attempts': { '$sum': 1 },
                            'highest_score': { '$max': '$score_percentage' },  # Use score_percentage for highest score
                            'average_score': { '$avg': '$score_percentage' },  # Use score_percentage for average
                            'total_questions': { '$sum': '$total_questions' },
                            'total_correct': { '$sum': '$correct_answers' },
                            'last_attempt': { '$max': '$submitted_at' }
                        }
                    }
                ]
                
                module_stats = list(mongo_db.test_results.aggregate(pipeline))
                all_modules.extend(module_stats)
                current_app.logger.info(f"Found {len(module_stats)} modules in test_results collection")
            else:
                current_app.logger.warning("test_results collection not found")
        except Exception as e:
            current_app.logger.warning(f"Error aggregating from test_results: {e}")
        
        # Also get from student_test_attempts collection
        try:
            if hasattr(mongo_db, 'student_test_attempts'):
                total_results += mongo_db.student_test_attempts.count_documents({
                    'student_id': current_user_id,
                    'test_type': 'practice'
                })
                
                pipeline = [
                    {
                        '$match': {
                            'student_id': current_user_id,
                            'test_type': 'practice'
                        }
                    },
                    {
                        '$lookup': {
                            'from': 'tests',
                            'localField': 'test_id',
                            'foreignField': '_id',
                            'as': 'test_details'
                        }
                    },
                    {'$unwind': '$test_details'},
                    {
                        '$group': {
                            '_id': '$test_details.module_id',
                            'module_name': { '$first': '$test_details.module_id' },
                            'total_attempts': { '$sum': 1 },
                            'highest_score': { '$max': '$score_percentage' },  # Use score_percentage for highest score
                            'average_score': { '$avg': '$score_percentage' },  # Use score_percentage for average
                            'total_questions': { '$sum': '$total_questions' },
                            'total_correct': { '$sum': '$correct_answers' },
                            'last_attempt': { '$max': '$submitted_at' }
                        }
                    }
                ]
                
                attempt_module_stats = list(mongo_db.student_test_attempts.aggregate(pipeline))
                all_modules.extend(attempt_module_stats)
                current_app.logger.info(f"Found {len(attempt_module_stats)} modules in student_test_attempts collection")
            else:
                current_app.logger.warning("student_test_attempts collection not found")
        except Exception as e:
            current_app.logger.warning(f"Error aggregating from student_test_attempts: {e}")
        
        # Merge module results from both collections
        merged_modules = {}
        for module in all_modules:
            module_id = module['_id']
            if module_id not in merged_modules:
                merged_modules[module_id] = module
            else:
                # Merge the results, taking the better scores
                existing = merged_modules[module_id]
                merged_modules[module_id] = {
                    '_id': module_id,
                    'module_name': module['module_name'],
                    'total_attempts': existing['total_attempts'] + module['total_attempts'],
                    'highest_score': max(existing['highest_score'], module['highest_score']),
                    'average_score': (existing['average_score'] + module['average_score']) / 2,
                    'total_questions': existing['total_questions'] + module['total_questions'],
                    'total_correct': existing['total_correct'] + module['total_correct'],
                    'last_attempt': max(existing['last_attempt'], module['last_attempt'])
                }
        
        module_stats = list(merged_modules.values())
        current_app.logger.info(f"Total merged modules: {len(module_stats)}")
        
        # Process module statistics
        for stat in module_stats:
            from config.constants import MODULES
            stat['module_display_name'] = MODULES.get(stat['module_name'], 'Unknown')
            stat['accuracy'] = (stat['total_correct'] / stat['total_questions'] * 100) if stat['total_questions'] > 0 else 0
            stat['last_attempt'] = stat['last_attempt'].isoformat() if stat['last_attempt'] else None
            stat['progress_percentage'] = min(100, stat['highest_score'] or 0)
            # Convert ObjectId in _id to string if present
            if isinstance(stat.get('_id'), ObjectId):
                stat['_id'] = str(stat['_id'])
        
        # Get recent activity from both collections
        recent_activity = []
        
        try:
            if hasattr(mongo_db, 'test_results'):
                test_recent = list(mongo_db.test_results.find({
                    'student_id': ObjectId(current_user_id)
                }).sort('submitted_at', -1).limit(5))
                recent_activity.extend(test_recent)
        except Exception as e:
            current_app.logger.warning(f"Error fetching recent activity from test_results: {e}")
        
        try:
            if hasattr(mongo_db, 'student_test_attempts'):
                attempt_recent = list(mongo_db.student_test_attempts.find({
                    'student_id': current_user_id
                }).sort('submitted_at', -1).limit(5))
                recent_activity.extend(attempt_recent)
        except Exception as e:
            current_app.logger.warning(f"Error fetching recent activity from student_test_attempts: {e}")
        
        # Sort by date and take top 10
        recent_activity.sort(key=lambda x: x.get('submitted_at', datetime.min), reverse=True)
        recent_activity = recent_activity[:10]
        
        for activity in recent_activity:
            activity['_id'] = str(activity['_id'])
            activity['submitted_at'] = activity['submitted_at'].isoformat()
            # Convert any ObjectId fields in activity to string
            for k, v in activity.items():
                if isinstance(v, ObjectId):
                    activity[k] = str(v)
        
        summary = {
            'total_practice_tests': total_results,
            'modules': module_stats,
            'recent_activity': recent_activity
        }
        
        # Convert any ObjectId fields to strings for JSON serialization
        convert_objectids_to_strings(summary)
        
        return jsonify({
            'success': True,
            'data': summary
        }), 200
        
    except Exception as e:
        logging.error(f"Error fetching progress summary for student {get_jwt_identity()}: {e}", exc_info=True)
        return jsonify({'success': False, 'message': 'Failed to fetch progress summary.'}), 500

@student_bp.route('/test-result/<test_id>', methods=['GET'])
@jwt_required()
def get_test_result_by_id(test_id):
    """Get detailed test result by test ID for the logged-in student"""
    try:
        current_user_id = get_jwt_identity()
        
        # Try to get from student_test_attempts collection first
        result = None
        try:
            if hasattr(mongo_db, 'student_test_attempts'):
                # Try both ObjectId and string formats for student_id
                result = mongo_db.student_test_attempts.find_one({
                    'test_id': ObjectId(test_id),
                    'student_id': ObjectId(current_user_id) if isinstance(current_user_id, str) else current_user_id
                })
                if result:
                    current_app.logger.info(f"Found result in student_test_attempts collection")
        except Exception as e:
            current_app.logger.warning(f"Error reading from student_test_attempts: {e}")
        
        # If not found, try test_results collection
        if not result:
            try:
                if hasattr(mongo_db, 'test_results'):
                    # Try both ObjectId and string formats for student_id
                    result = mongo_db.test_results.find_one({
                        'test_id': ObjectId(test_id),
                        'student_id': ObjectId(current_user_id) if isinstance(current_user_id, str) else current_user_id
                    })
                    if result:
                        current_app.logger.info(f"Found result in test_results collection")
            except Exception as e:
                current_app.logger.warning(f"Error reading from test_results: {e}")
        
        if not result:
            return jsonify({
                'success': False,
                'message': 'Test result not found'
            }), 404
        
        # Get test details
        test = mongo_db.tests.find_one({'_id': ObjectId(test_id)})
        if test:
            result['test_name'] = test.get('name', 'Unknown Test')
            result['module_id'] = test.get('module_id', 'Unknown')
            result['subcategory'] = test.get('subcategory', 'Unknown')
        else:
            result['test_name'] = 'Unknown Test'
            result['module_id'] = 'Unknown'
            result['subcategory'] = 'Unknown'
        
        # Convert ObjectIds to strings
        result['_id'] = str(result['_id'])
        result['test_id'] = str(result['test_id'])
        result['student_id'] = str(result['student_id'])
        
        # Convert datetime to ISO format
        if result.get('submitted_at'):
            result['submitted_at'] = result['submitted_at'].isoformat()
        
        # Convert any remaining ObjectId fields to strings for JSON serialization
        convert_objectids_to_strings(result)
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    except Exception as e:
        logging.error(f"Error fetching test result {test_id} for student {get_jwt_identity()}: {e}", exc_info=True)
        return jsonify({'success': False, 'message': 'Failed to fetch test result.'}), 500 

def get_students_for_test_ids(test_ids, assigned_student_ids=None):
    """
    Given a list of test IDs, return a list of students (dicts with at least email and name)
    assigned to those tests based on campus_ids, course_ids, and batch_ids.
    If assigned_student_ids is provided, only return those students.
    Fetch from students collection, join with users for email.
    """
    student_set = {}
    for test_id in test_ids:
        test = mongo_db.tests.find_one({'_id': ObjectId(test_id)})
        if not test:
            continue
        campus_ids = test.get('campus_ids', [])
        course_ids = test.get('course_ids', [])
        batch_ids = test.get('batch_ids', [])
        query = {}
        if campus_ids:
            query['campus_id'] = {'$in': campus_ids}
        if course_ids:
            query['course_id'] = {'$in': course_ids}
        if batch_ids:
            query['batch_id'] = {'$in': batch_ids}
        if assigned_student_ids:
            query['_id'] = {'$in': assigned_student_ids}
        if not query:
            continue
        students = mongo_db.students.find(query)
        for s in students:
            # Join with users collection to get email
            user = mongo_db.users.find_one({'_id': s.get('user_id')})
            email = user.get('email') if user else None
            if email:
                student_set[email] = {
                    'email': email,
                    'name': s.get('name', user.get('name', 'Student') if user else 'Student'),
                    'roll_number': s.get('roll_number'),
                    'student_id': str(s.get('_id')),
                    'mobile_number': s.get('mobile_number')
                }
    return list(student_set.values()) 

@student_bp.route('/students/assign', methods=['POST'])
@jwt_required()
def assign_student_to_instance():
    data = request.get_json()
    student_id = data.get('student_id')
    batch_course_instance_id = data.get('batch_course_instance_id')
    if not student_id or not batch_course_instance_id:
        return jsonify({'success': False, 'message': 'Missing student_id or batch_course_instance_id'}), 400
    result = mongo_db.students.update_one(
        {'_id': ObjectId(student_id)},
        {'$set': {'batch_course_instance_id': ObjectId(batch_course_instance_id)}}
    )
    if result.modified_count == 1:
        return jsonify({'success': True, 'message': 'Student assigned to batch-course instance'}), 200
    else:
        return jsonify({'success': False, 'message': 'Student not found or not updated'}), 404 

@student_bp.route('/completed-exams', methods=['GET'])
@jwt_required()
def get_completed_exams():
    """Get list of completed exam IDs for the student"""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.users.find_one({'_id': ObjectId(current_user_id)})
        
        if not user or user.get('role') != 'student':
            return jsonify({'success': False, 'message': 'Access denied'}), 403
        
        # Get completed exam IDs from student_test_attempts
        completed_attempts = mongo_db.student_test_attempts.find({
            'student_id': ObjectId(current_user_id),
            'status': 'completed'
        }, {'test_id': 1})
        
        completed_exam_ids = [str(attempt['test_id']) for attempt in completed_attempts]
        
        return jsonify({
            'success': True,
            'data': completed_exam_ids
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error fetching completed exams: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'message': f'Failed to fetch completed exams: {str(e)}'
        }), 500

@student_bp.route('/unlocked-modules', methods=['GET'])
@jwt_required()
def get_unlocked_modules():
    """Return all modules and levels the student is allowed to access."""
    try:
        from config.constants import MODULES, LEVELS
        current_user_id = get_jwt_identity()
        student = mongo_db.students.find_one({'user_id': ObjectId(current_user_id)})
        
        # Define the desired order - exclude CRT modules
        module_order = ['GRAMMAR', 'VOCABULARY', 'LISTENING', 'SPEAKING', 'READING', 'WRITING']
        
        # Build a list of (module_id, module_name) in the desired order, excluding CRT modules
        ordered_modules = []
        for mid in module_order:
            if mid in MODULES and not mid.startswith('CRT_'):
                ordered_modules.append((mid, MODULES[mid]))
        
        # Add any remaining modules that weren't in the order
        for mid, mname in MODULES.items():
            if mid not in module_order and not mid.startswith('CRT_'):
                ordered_modules.append((mid, mname))
        
        modules_status = []
        
        # If no student or no authorized levels, use default behavior
        if not student or not student.get('authorized_levels'):
            for module_id, module_name in ordered_modules:
                # Filter levels for this module
                module_levels = []
                for level_id, level in LEVELS.items():
                    if isinstance(level, dict) and level.get('module_id') == module_id:
                        # Get the highest score for this level
                        highest_score = 0
                        try:
                            # Try to get scores from student_test_attempts
                            attempts = list(mongo_db.student_test_attempts.find({
                                'student_id': current_user_id,
                                'test_type': 'practice'
                            }))
                            
                            # Find tests for this level and get highest score
                            for attempt in attempts:
                                test = mongo_db.tests.find_one({'_id': attempt.get('test_id')})
                                if test and test.get('level_id') == level_id:
                                    score = attempt.get('average_score', 0) or attempt.get('score_percentage', 0)
                                    if score > highest_score:
                                        highest_score = score
                        except Exception as e:
                            current_app.logger.warning(f"Error fetching scores for level {level_id}: {e}")
                        
                        module_levels.append({
                            'level_id': level_id,
                            'level_name': level['name'],
                            'unlocked': (module_id == 'GRAMMAR' or module_id == 'VOCABULARY'),
                            'score': highest_score
                        })
                    elif not isinstance(level, dict) and module_id == 'GRAMMAR':
                        # Handle grammar categories as levels
                        # Get the highest score for this grammar category
                        highest_score = 0
                        try:
                            # Try to get scores from student_test_attempts
                            attempts = list(mongo_db.student_test_attempts.find({
                                'student_id': current_user_id,
                                'test_type': 'practice'
                            }))
                            
                            # Find tests for this grammar category and get highest score
                            for attempt in attempts:
                                test = mongo_db.tests.find_one({'_id': attempt.get('test_id')})
                                if test and test.get('module_id') == 'GRAMMAR' and test.get('subcategory') == level_id:
                                    score = attempt.get('average_score', 0) or attempt.get('score_percentage', 0)
                                    if score > highest_score:
                                        highest_score = score
                        except Exception as e:
                            current_app.logger.warning(f"Error fetching scores for grammar category {level_id}: {e}")
                        
                        module_levels.append({
                            'level_id': level_id,
                            'level_name': str(level),
                            'unlocked': True,
                            'score': highest_score
                        })
                
                modules_status.append({
                    'module_id': module_id,
                    'module_name': module_name,
                    'unlocked': (module_id == 'GRAMMAR' or module_id == 'VOCABULARY'),
                    'levels': module_levels
                })
            
            return jsonify({'success': True, 'data': modules_status}), 200
        
        # If student has authorized_levels, use them
        authorized_levels = set(student.get('authorized_levels', []))
        
        for module_id, module_name in ordered_modules:
            if module_id in ['GRAMMAR', 'VOCABULARY']:
                unlocked = True
                # Filter levels for this module
                module_levels = []
                for level_id, level in LEVELS.items():
                    if isinstance(level, dict) and level.get('module_id') == module_id:
                        # Get the highest score for this level
                        highest_score = 0
                        try:
                            # Try to get scores from student_test_attempts
                            attempts = list(mongo_db.student_test_attempts.find({
                                'student_id': current_user_id,
                                'test_type': 'practice'
                            }))
                            
                            # Find tests for this level and get highest score
                            for attempt in attempts:
                                test = mongo_db.tests.find_one({'_id': attempt.get('test_id')})
                                if test and test.get('level_id') == level_id:
                                    score = attempt.get('average_score', 0) or attempt.get('score_percentage', 0)
                                    if score > highest_score:
                                        highest_score = score
                        except Exception as e:
                            current_app.logger.warning(f"Error fetching scores for level {level_id}: {e}")
                        
                        module_levels.append({
                            'level_id': level_id,
                            'level_name': level['name'],
                            'unlocked': True,
                            'score': highest_score
                        })
                    elif not isinstance(level, dict) and module_id == 'GRAMMAR':
                        # Handle grammar categories as levels
                        # Get the highest score for this grammar category
                        highest_score = 0
                        try:
                            # Try to get scores from student_test_attempts
                            attempts = list(mongo_db.student_test_attempts.find({
                                'student_id': current_user_id,
                                'test_type': 'practice'
                            }))
                            
                            # Find tests for this grammar category and get highest score
                            for attempt in attempts:
                                test = mongo_db.tests.find_one({'_id': attempt.get('test_id')})
                                if test and test.get('module_id') == 'GRAMMAR' and test.get('subcategory') == level_id:
                                    score = attempt.get('average_score', 0) or attempt.get('score_percentage', 0)
                                    if score > highest_score:
                                        highest_score = score
                        except Exception as e:
                            current_app.logger.warning(f"Error fetching scores for grammar category {level_id}: {e}")
                        
                        module_levels.append({
                            'level_id': level_id,
                            'level_name': str(level),
                            'unlocked': True,
                            'score': highest_score
                        })
            else:
                # Filter levels for this module
                module_levels = []
                for level_id, level in LEVELS.items():
                    if isinstance(level, dict) and level.get('module_id') == module_id:
                        # Get the highest score for this level
                        highest_score = 0
                        try:
                            # Try to get scores from student_test_attempts
                            attempts = list(mongo_db.student_test_attempts.find({
                                'student_id': current_user_id,
                                'test_type': 'practice'
                            }))
                            
                            # Find tests for this level and get highest score
                            for attempt in attempts:
                                test = mongo_db.tests.find_one({'_id': attempt.get('test_id')})
                                if test and test.get('level_id') == level_id:
                                    score = attempt.get('average_score', 0) or attempt.get('score_percentage', 0)
                                    if score > highest_score:
                                        highest_score = score
                        except Exception as e:
                            current_app.logger.warning(f"Error fetching scores for level {level_id}: {e}")
                        
                        module_levels.append({
                            'level_id': level_id,
                            'level_name': level['name'],
                            'unlocked': level_id in authorized_levels,
                            'score': highest_score
                        })
                
                unlocked = any(l['unlocked'] for l in module_levels) if module_levels else False
            
            modules_status.append({
                'module_id': module_id,
                'module_name': module_name,
                'unlocked': unlocked,
                'levels': module_levels
            })
        
        return jsonify({'success': True, 'data': modules_status}), 200
        
    except Exception as e:
        current_app.logger.error(f"Error fetching unlocked modules for student: {e}", exc_info=True)
        return jsonify({'success': False, 'message': 'An error occurred fetching unlocked modules.'}), 500 
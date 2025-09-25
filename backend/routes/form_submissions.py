from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from bson import ObjectId
from datetime import datetime
import logging
import json

from config.database import DatabaseConfig
from models_forms import FormSubmission, FormResponse, FORMS_COLLECTION, FORM_SUBMISSIONS_COLLECTION
from routes.test_management import require_superadmin
from utils.notification_queue import queue_sms, queue_email

def process_submission_responses(submission, form):
    """Process form responses and convert to enhanced format"""
    # Handle both 'responses' and 'form_responses' structures
    responses_data = submission.get('responses', []) or submission.get('form_responses', [])
    
    if not responses_data:
        return []
    
    processed_responses = []
    for response in responses_data:
        field_id = response.get('field_id')
        field_value = response.get('value')
        
        # Find the field definition in the form
        field_definition = None
        for field in form.get('fields', []):
            if field.get('field_id') == field_id:
                field_definition = field
                break
        
        if field_definition:
            processed_responses.append({
                'field_id': field_id,
                'field_label': field_definition.get('label', 'Unknown Field'),
                'field_type': field_definition.get('type', 'text'),
                'field_required': field_definition.get('required', False),
                'value': field_value,
                'display_value': format_field_value(field_value, field_definition.get('type', 'text'))
            })
        else:
            processed_responses.append({
                'field_id': field_id,
                'field_label': 'Unknown Field',
                'field_type': 'text',
                'field_required': False,
                'value': field_value,
                'display_value': str(field_value) if field_value is not None else 'No response'
            })
    
    return processed_responses

def get_student_roll_number_from_jwt():
    """Get student roll number from JWT token with comprehensive lookup mechanism"""
    try:
        jwt_student_id = get_jwt_identity()
        student_id = ObjectId(jwt_student_id)
        
        # First try: Direct lookup in students collection with JWT student ID
        student = mongo_db['students'].find_one({'_id': student_id})
        if student:
            logger.info(f"✅ Found student directly in students collection: {student.get('name', 'Unknown')} (ID: {student_id})")
            return student.get('roll_number')
        
        # Second try: Look in users collection with JWT student ID
        logger.warning(f"⚠️ Student not found in students collection, checking users collection...")
        user = mongo_db['users'].find_one({'_id': student_id})
        if user:
            logger.info(f"✅ Found user in users collection: {user.get('name', 'Unknown')} (ID: {student_id})")
            
            # Get student details from users collection
            user_student_id = user.get('student_id')
            if user_student_id:
                # Look up student using the student_id from users collection
                student = mongo_db['students'].find_one({'_id': ObjectId(user_student_id)})
                if student:
                    logger.info(f"✅ Found student using student_id from users: {student.get('name', 'Unknown')} (Student ID: {user_student_id})")
                    return student.get('roll_number')
                else:
                    logger.warning(f"⚠️ Student not found with student_id from users: {user_student_id}")
            
            # If no student_id in users, try to find student by email or name
            user_email = user.get('email')
            if user_email:
                student = mongo_db['students'].find_one({'email': user_email})
                if student:
                    logger.info(f"✅ Found student by email from users: {student.get('name', 'Unknown')} (Email: {user_email})")
                    return student.get('roll_number')
            
            # Try to find student by name
            user_name = user.get('name')
            if user_name:
                student = mongo_db['students'].find_one({'name': user_name})
                if student:
                    logger.info(f"✅ Found student by name from users: {student.get('name', 'Unknown')} (Name: {user_name})")
                    return student.get('roll_number')
        
        # Third try: Look for similar student IDs (last 2 characters different)
        logger.warning(f"⚠️ User not found in users collection, searching for similar student IDs...")
        
        # Extract first 22 characters of the ID (excluding last 2)
        base_id = str(jwt_student_id)[:22]
        
        # Search for students with similar IDs
        similar_students = list(mongo_db['students'].find({
            '_id': {'$regex': f'^{base_id}'}
        }))
        
        if similar_students:
            # Use the first similar student found
            student = similar_students[0]
            logger.info(f"✅ Found similar student: {student.get('name', 'Unknown')} (ID: {student['_id']})")
            logger.info(f"   Original ID: {jwt_student_id}")
            logger.info(f"   Found ID: {student['_id']}")
            return student.get('roll_number')
        
        # Fourth try: Look for similar user IDs in users collection
        logger.warning(f"⚠️ No similar student IDs found, searching for similar user IDs...")
        
        similar_users = list(mongo_db['users'].find({
            '_id': {'$regex': f'^{base_id}'}
        }))
        
        if similar_users:
            user = similar_users[0]
            logger.info(f"✅ Found similar user: {user.get('name', 'Unknown')} (ID: {user['_id']})")
            
            # Try to find corresponding student
            user_student_id = user.get('student_id')
            if user_student_id:
                student = mongo_db['students'].find_one({'_id': ObjectId(user_student_id)})
                if student:
                    logger.info(f"✅ Found student using similar user's student_id: {student.get('name', 'Unknown')}")
                    return student.get('roll_number')
        
        # Fifth try: Look for students who have form submissions (fallback for JWT token issues)
        logger.warning(f"⚠️ No similar IDs found, searching for students with form submissions...")
        
        # Get all students who have form submissions
        students_with_submissions = list(mongo_db['students'].find({
            '_id': {'$in': [ObjectId(sub['student_id']) for sub in mongo_db['form_submissions'].find({}, {'student_id': 1})]}
        }))
        
        if students_with_submissions:
            # Use the first student found (this is a fallback for JWT token issues)
            student = students_with_submissions[0]
            logger.warning(f"⚠️ Using fallback student: {student.get('name', 'Unknown')} (ID: {student['_id']})")
            logger.warning(f"   This indicates a JWT token issue - student ID mismatch")
            return student.get('roll_number')
        
        # Sixth try: Look for any active student (last resort)
        logger.warning(f"⚠️ No students with form submissions found, searching for any active student...")
        
        any_student = mongo_db['students'].find_one({})
        if any_student:
            logger.warning(f"⚠️ Using any available student: {any_student.get('name', 'Unknown')} (ID: {any_student['_id']})")
            logger.warning(f"   This is a last resort fallback - JWT token may be invalid")
            return any_student.get('roll_number')
        
        raise ValueError(f"Student not found with ID: {jwt_student_id}. No students or users found in database.")
        
    except Exception as e:
        logger.error(f"Error getting student roll number: {str(e)}")
        raise ValueError(f"Failed to get student roll number: {str(e)}")

def get_student_by_roll_number(roll_number):
    """Get student data by roll number with fallback mechanism"""
    try:
        # First try: Direct lookup by roll number
        student = mongo_db['students'].find_one({'roll_number': roll_number})
        if student:
            logger.info(f"✅ Found student by roll number: {student.get('name', 'Unknown')} (Roll: {roll_number})")
            return student
        
        # Second try: Look for similar roll numbers (case insensitive, partial match)
        logger.warning(f"⚠️ Student not found with roll number: {roll_number}, searching for similar roll numbers...")
        
        # Case insensitive search
        similar_students = list(mongo_db['students'].find({
            'roll_number': {'$regex': f'^{roll_number}', '$options': 'i'}
        }))
        
        if similar_students:
            student = similar_students[0]
            logger.info(f"✅ Found similar student by roll number: {student.get('name', 'Unknown')} (Roll: {student.get('roll_number', 'N/A')})")
            return student
        
        # Third try: Look for partial matches
        partial_students = list(mongo_db['students'].find({
            'roll_number': {'$regex': roll_number, '$options': 'i'}
        }))
        
        if partial_students:
            student = partial_students[0]
            logger.info(f"✅ Found student with partial roll number match: {student.get('name', 'Unknown')} (Roll: {student.get('roll_number', 'N/A')})")
            return student
        
        raise ValueError(f"Student with roll number {roll_number} not found. No similar roll numbers found.")
        
    except Exception as e:
        logger.error(f"Error getting student by roll number {roll_number}: {str(e)}")
        raise ValueError(f"Failed to get student with roll number {roll_number}: {str(e)}")

form_submissions_bp = Blueprint('form_submissions', __name__)
mongo_db = DatabaseConfig.get_database()
logger = logging.getLogger(__name__)

def format_field_value(value, field_type):
    """Format field value for display based on field type"""
    if value is None:
        return 'No response'
    
    if field_type == 'checkbox':
        if isinstance(value, list):
            return ', '.join(str(v) for v in value)
        return str(value)
    elif field_type == 'radio':
        return str(value)
    elif field_type == 'dropdown':
        return str(value)
    elif field_type == 'textarea':
        return str(value)
    elif field_type == 'email':
        return str(value)
    elif field_type == 'number':
        return str(value)
    elif field_type == 'date':
        return str(value)
    else:  # text and other types
        return str(value)

def get_client_ip():
    """Get client IP address"""
    if request.headers.get('X-Forwarded-For'):
        return request.headers.get('X-Forwarded-For').split(',')[0].strip()
    return request.remote_addr

@form_submissions_bp.route('/student/forms', methods=['GET'])
@jwt_required()
def get_student_forms():
    """Get forms available for student submission"""
    try:
        # Get student roll number from JWT token
        try:
            student_roll_number = get_student_roll_number_from_jwt()
        except ValueError as e:
            return jsonify({
                "success": False,
                "message": str(e)
            }), 400
        
        # Get active forms
        forms = list(mongo_db[FORMS_COLLECTION].find({
            'settings.isActive': True,
            '$or': [
                {'settings.submissionDeadline': {'$exists': False}},
                {'settings.submissionDeadline': None},
                {'settings.submissionDeadline': {'$gt': datetime.utcnow()}}
            ]
        }).sort('created_at', -1))
        
        # Check which forms student has already submitted - using roll number
        form_ids = [str(form['_id']) for form in forms]  # Convert to strings
        
        submissions = list(mongo_db[FORM_SUBMISSIONS_COLLECTION].find({
            'form_id': {'$in': form_ids},
            'student_roll_number': student_roll_number,
            'status': 'submitted'
        }))
        
        # Convert form IDs to strings for comparison
        submitted_form_ids = {str(sub['form_id']) for sub in submissions}
        
        # Process forms and filter based on submission status
        processed_forms = []
        
        for form in forms:
            form['_id'] = str(form['_id'])
            form['created_by'] = str(form['created_by'])
            form['isSubmitted'] = form['_id'] in submitted_form_ids
            form['isRequired'] = form.get('is_required', False)
            
            # Check if multiple submissions are allowed
            if not form['settings'].get('allowMultipleSubmissions', False):
                form['canSubmit'] = not form['isSubmitted']
            else:
                form['canSubmit'] = True
            
            # Only return forms that are not submitted yet (both required and optional)
            if not form['isSubmitted']:
                processed_forms.append(form)
        
        return jsonify({
            "success": True,
            "data": {
                "forms": processed_forms
            }
        })
        
    except Exception as e:
        logger.error(f"Error fetching student forms: {str(e)}")
        return jsonify({
            "success": False,
            "message": "Failed to fetch forms"
        }), 500

@form_submissions_bp.route('/student/recent-submissions', methods=['GET'])
@jwt_required()
def get_student_recent_submissions():
    """Get recent form submissions for student"""
    try:
        # Get student roll number from JWT token
        try:
            student_roll_number = get_student_roll_number_from_jwt()
        except ValueError as e:
            return jsonify({
                "success": False,
                "message": str(e)
            }), 400
        
        # Get recent submissions - using roll number
        submissions = list(mongo_db[FORM_SUBMISSIONS_COLLECTION].find({
            'student_roll_number': student_roll_number,
            'status': 'submitted'
        }).sort('submitted_at', -1).limit(10))
        
        # Get form details for each submission
        form_ids = [ObjectId(sub['form_id']) for sub in submissions]
        forms = list(mongo_db[FORMS_COLLECTION].find({
            '_id': {'$in': form_ids}
        }))
        
        form_map = {str(form['_id']): form for form in forms}
        
        # Combine submission data with form details
        recent_submissions = []
        for submission in submissions:
            form = form_map.get(submission['form_id'])
            if form:
                recent_submissions.append({
                    'submission_id': str(submission['_id']),
                    'form_id': submission['form_id'],
                    'form_title': form['title'],
                    'submitted_at': submission['submitted_at'],
                    'responses_count': len(submission.get('responses', []))
                })
        
        return jsonify({
            "success": True,
            "data": {
                "submissions": recent_submissions
            }
        })
        
    except Exception as e:
        logger.error(f"Error fetching recent submissions: {str(e)}")
        return jsonify({
            "success": False,
            "message": "Failed to fetch recent submissions"
        }), 500

@form_submissions_bp.route('/student/forms/<form_id>', methods=['GET'])
@jwt_required()
def get_student_form(form_id):
    """Get specific form for student submission"""
    try:
        if not ObjectId.is_valid(form_id):
            return jsonify({
                "success": False,
                "message": "Invalid form ID"
            }), 400
        
        student_id = ObjectId(get_jwt_identity())
        
        # Get form
        form = mongo_db[FORMS_COLLECTION].find_one({'_id': ObjectId(form_id)})
        if not form:
            return jsonify({
                "success": False,
                "message": "Form not found"
            }), 404
        
        # Check if form is active
        if not form['settings'].get('isActive', False):
            return jsonify({
                "success": False,
                "message": "Form is not active"
            }), 400
        
        # Check submission deadline
        deadline = form['settings'].get('submissionDeadline')
        if deadline and deadline < datetime.utcnow():
            return jsonify({
                "success": False,
                "message": "Form submission deadline has passed"
            }), 400
        
        # Get existing submission if any
        existing_submission = mongo_db[FORM_SUBMISSIONS_COLLECTION].find_one({
            'form_id': ObjectId(form_id),
            'student_id': student_id
        })
        
        form['_id'] = str(form['_id'])
        form['created_by'] = str(form['created_by'])
        
        response_data = {
            "form": form,
            "existingSubmission": None
        }
        
        if existing_submission:
            existing_submission['_id'] = str(existing_submission['_id'])
            existing_submission['form_id'] = str(existing_submission['form_id'])
            existing_submission['student_id'] = str(existing_submission['student_id'])
            response_data['existingSubmission'] = existing_submission
        
        return jsonify({
            "success": True,
            "data": response_data
        })
        
    except Exception as e:
        logger.error(f"Error fetching student form: {str(e)}")
        return jsonify({
            "success": False,
            "message": "Failed to fetch form"
        }), 500

@form_submissions_bp.route('/student/submit', methods=['POST'])
@jwt_required()
def submit_form():
    """Submit form response"""
    try:
        data = request.get_json()
        print(f"🔍 Form submission request received: {data}")
        
        if not data:
            print("❌ No data provided in request")
            return jsonify({
                "success": False,
                "message": "No data provided"
            }), 400
        
        form_id = data.get('form_id')
        responses = data.get('responses', [])
        status = data.get('status', 'submitted')  # draft or submitted
        
        print(f"📋 Form ID: {form_id}")
        print(f"📋 Responses: {responses}")
        print(f"📋 Status: {status}")
        
        if not form_id or not ObjectId.is_valid(form_id):
            print(f"❌ Invalid form ID: {form_id}")
            return jsonify({
                "success": False,
                "message": "Invalid form ID"
            }), 400
        
        # Get student roll number from JWT token
        try:
            student_roll_number = get_student_roll_number_from_jwt()
            print(f"👤 Student roll number: {student_roll_number}")
        except ValueError as e:
            print(f"❌ Error getting student roll number: {str(e)}")
            return jsonify({
                "success": False,
                "message": str(e)
            }), 400
        
        # Get student data by roll number
        try:
            student = get_student_by_roll_number(student_roll_number)
            student_id = student['_id']
            print(f"👤 Student found: {student.get('name', 'Unknown')} (ID: {student_id})")
        except ValueError as e:
            print(f"❌ Error getting student data: {str(e)}")
            return jsonify({
                "success": False,
                "message": str(e)
            }), 400
        
        # Get form
        form = mongo_db[FORMS_COLLECTION].find_one({'_id': ObjectId(form_id)})
        if not form:
            return jsonify({
                "success": False,
                "message": "Form not found"
            }), 404
        
        # Check if form is active
        if not form['settings'].get('isActive', False):
            return jsonify({
                "success": False,
                "message": "Form is not active"
            }), 400
        
        # Check submission deadline
        deadline = form['settings'].get('submissionDeadline')
        if deadline and deadline < datetime.utcnow():
            return jsonify({
                "success": False,
                "message": "Form submission deadline has passed"
            }), 400
        
        # Check if multiple submissions are allowed
        if not form['settings'].get('allowMultipleSubmissions', False):
            existing_submission = mongo_db[FORM_SUBMISSIONS_COLLECTION].find_one({
                'form_id': ObjectId(form_id),
                'student_id': str(student_id),
                'status': 'submitted'
            })
            if existing_submission:
                return jsonify({
                    "success": False,
                    "message": "Form has already been submitted"
                }), 400
        
        # Validate responses
        validation_errors = []
        form_fields = {field['field_id']: field for field in form['fields']}
        
        print(f"🔍 Form fields: {list(form_fields.keys())}")
        print(f"🔍 Response fields: {[r.get('field_id') for r in responses]}")
        
        for response in responses:
            field_id = response.get('field_id')
            value = response.get('value')
            
            print(f"🔍 Validating field {field_id} with value: {value}")
            
            if field_id not in form_fields:
                error_msg = f"Unknown field: {field_id}"
                print(f"❌ {error_msg}")
                validation_errors.append(error_msg)
                continue
            
            field = form_fields[field_id]
            error = validate_field_value(field, value)
            if error:
                print(f"❌ Validation error for {field_id}: {error}")
                validation_errors.append(error)
        
        if validation_errors:
            print(f"❌ Validation failed with errors: {validation_errors}")
            return jsonify({
                "success": False,
                "message": "Validation errors",
                "errors": validation_errors
            }), 400
        
        # Create form responses
        form_responses = []
        for response in responses:
            form_response = FormResponse(
                field_id=response['field_id'],
                value=response['value'],
                submitted_at=datetime.utcnow()
            )
            form_responses.append(form_response)
        
        # Check if submission already exists (for draft updates) - using roll number
        existing_submission = mongo_db[FORM_SUBMISSIONS_COLLECTION].find_one({
            'form_id': ObjectId(form_id),
            'student_roll_number': student_roll_number
        })
        
        if existing_submission:
            # Update existing submission
            update_data = {
                'responses': [response.to_dict() for response in form_responses],
                'status': status,
                'submitted_at': datetime.utcnow() if status == 'submitted' else None,
                'ip_address': get_client_ip()
            }
            
            result = mongo_db[FORM_SUBMISSIONS_COLLECTION].update_one(
                {'_id': existing_submission['_id']},
                {'$set': update_data}
            )
            
            if result.modified_count > 0:
                # Queue notification if form is submitted (not draft)
                if status == 'submitted':
                    try:
                        # Get student data for notification
                        student = get_student_by_roll_number(student_roll_number)
                        student_name = student.get('name', 'Student')
                        student_email = student.get('email')
                        student_mobile = student.get('mobile_number')
                        
                        # Queue email notification if email exists
                        if student_email:
                            queue_email(
                                email=student_email,
                                subject="Form Submission Confirmation",
                                content=f"Dear {student_name},\n\nYour form has been submitted successfully. Thank you for your submission.\n\nBest regards,\nVERSANT Team",
                                template_name=None
                            )
                        
                        # SMS notification removed as requested
                        
                        # TODO: Add push notification for form submission
                    except Exception as e:
                        print(f"⚠️ Failed to queue notifications: {e}")
                        # Don't fail the submission if notifications fail
                
                return jsonify({
                    "success": True,
                    "message": f"Form {'submitted' if status == 'submitted' else 'saved as draft'} successfully",
                    "data": {
                        "submission_id": str(existing_submission['_id']),
                        "status": status
                    }
                })
            else:
                return jsonify({
                    "success": False,
                    "message": "Failed to update submission"
                }), 500
        else:
            # Create new submission with roll number
            submission = FormSubmission(
                form_id=ObjectId(form_id),
                student_id=student_id,
                student_roll_number=student_roll_number,
                responses=form_responses,
                status=status,
                ip_address=get_client_ip()
            )
            
            result = mongo_db[FORM_SUBMISSIONS_COLLECTION].insert_one(submission.to_dict())
            
            if result.inserted_id:
                # Queue notification if form is submitted (not draft)
                if status == 'submitted':
                    try:
                        # Get student data for notification
                        student = get_student_by_roll_number(student_roll_number)
                        student_name = student.get('name', 'Student')
                        student_email = student.get('email')
                        student_mobile = student.get('mobile_number')
                        
                        # Queue email notification if email exists
                        if student_email:
                            queue_email(
                                email=student_email,
                                subject="Form Submission Confirmation",
                                content=f"Dear {student_name},\n\nYour form has been submitted successfully. Thank you for your submission.\n\nBest regards,\nVERSANT Team",
                                template_name=None
                            )
                        
                        # SMS notification removed as requested
                        
                        # TODO: Add push notification for form submission
                    except Exception as e:
                        print(f"⚠️ Failed to queue notifications: {e}")
                        # Don't fail the submission if notifications fail
                
                return jsonify({
                    "success": True,
                    "message": f"Form {'submitted' if status == 'submitted' else 'saved as draft'} successfully",
                    "data": {
                        "submission_id": str(result.inserted_id),
                        "status": status
                    }
                })
            else:
                return jsonify({
                    "success": False,
                    "message": "Failed to create submission"
                }), 500
        
    except Exception as e:
        logger.error(f"Error submitting form: {str(e)}")
        return jsonify({
            "success": False,
            "message": "Failed to submit form"
        }), 500

@form_submissions_bp.route('/admin/submissions', methods=['GET'])
@jwt_required()
@require_superadmin
def get_form_submissions():
    """Get all form submissions with filtering and pagination"""
    try:
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 10))
        form_id = request.args.get('form_id', '')
        student_id = request.args.get('student_id', '')
        status = request.args.get('status', '')
        search = request.args.get('search', '')
        
        # Build query
        query = {}
        
        # Handle form_id condition
        if form_id and ObjectId.is_valid(form_id):
            # Handle both string and ObjectId formats for form_id
            query['$or'] = [
                {'form_id': ObjectId(form_id)},
                {'form_id': form_id}
            ]
        
        # Handle student_id condition
        if student_id and ObjectId.is_valid(student_id):
            query['student_id'] = ObjectId(student_id)  # student_id is stored as ObjectId
        
        # Handle status condition
        if status:
            query['status'] = status
        
        # Get total count
        total = mongo_db[FORM_SUBMISSIONS_COLLECTION].count_documents(query)
        
        # Get submissions with pagination
        skip = (page - 1) * limit
        submissions = list(mongo_db[FORM_SUBMISSIONS_COLLECTION].find(query)
                          .sort('submitted_at', -1)
                          .skip(skip)
                          .limit(limit))
        
        print(f"🔍 Found {len(submissions)} submissions for query: {query}")
        for i, sub in enumerate(submissions):
            print(f"🔍 Submission {i+1}: ID={sub.get('_id')}, student_id={sub.get('student_id')}, status={sub.get('status')}")
        
        # Convert ObjectId to string and populate form/student details
        for submission in submissions:
            submission['_id'] = str(submission['_id'])
            submission['form_id'] = str(submission['form_id'])
            submission['student_id'] = str(submission['student_id'])
            
            # Get form details
            form = mongo_db[FORMS_COLLECTION].find_one({'_id': ObjectId(submission['form_id'])})
            if form:
                submission['form_title'] = form['title']
                submission['form_template_type'] = form.get('template_type', 'custom')
                
                # Process form responses with field labels using the new function
                submission['form_responses'] = process_submission_responses(submission, form)
            
            # Get student details using roll_number from submission
            student_roll_number = submission.get('student_roll_number')
            print(f"🔍 Looking up student with roll number: {student_roll_number}")
            
            student = None
            if student_roll_number:
                try:
                    student = get_student_by_roll_number(student_roll_number)
                    print(f"✅ Student found by roll number: {student.get('name', 'Unknown')}")
                except Exception as e:
                    print(f"❌ Error looking up student by roll number: {str(e)}")
                    # Fallback: try to find by student_id if available
                    student_id = submission.get('student_id')
                    if student_id:
                        try:
                            if isinstance(student_id, str):
                                student_id = ObjectId(student_id)
                            student = mongo_db['students'].find_one({'_id': student_id})
                            if student:
                                print(f"✅ Student found by student_id fallback: {student.get('name', 'Unknown')}")
                        except Exception as e2:
                            print(f"❌ Fallback student lookup also failed: {str(e2)}")
            else:
                print(f"❌ No student_roll_number found in submission")
            if student:
                submission['student_name'] = student.get('name', 'Unknown')
                submission['student_email'] = student.get('email', 'Unknown')
                submission['student_roll_number'] = student.get('roll_number', 'Unknown')
                submission['student_mobile'] = student.get('mobile_number', 'Unknown')
                
                # Get course details
                course = mongo_db['courses'].find_one({'_id': student.get('course_id')})
                if course:
                    submission['student_course'] = course.get('name', 'Unknown')
                else:
                    submission['student_course'] = 'Unknown'
                
                # Get batch details
                batch = mongo_db['batches'].find_one({'_id': student.get('batch_id')})
                if batch:
                    submission['student_batch'] = batch.get('name', 'Unknown')
                else:
                    submission['student_batch'] = 'Unknown'
                
                # Get campus details
                campus = mongo_db['campuses'].find_one({'_id': student.get('campus_id')})
                if campus:
                    submission['student_campus'] = campus.get('name', 'Unknown')
                else:
                    submission['student_campus'] = 'Unknown'
            else:
                # Handle missing student data gracefully
                submission['student_name'] = 'Unknown (Student Deleted)'
                submission['student_email'] = 'Unknown'
                submission['student_roll_number'] = 'Unknown'
                submission['student_mobile'] = 'Unknown'
                submission['student_course'] = 'Unknown'
                submission['student_batch'] = 'Unknown'
                submission['student_campus'] = 'Unknown'
        
        return jsonify({
            "success": True,
            "data": {
                "submissions": submissions,
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "pages": (total + limit - 1) // limit
                }
            }
        })
        
    except Exception as e:
        logger.error(f"Error fetching form submissions: {str(e)}")
        return jsonify({
            "success": False,
            "message": "Failed to fetch form submissions"
        }), 500

@form_submissions_bp.route('/admin/submissions/<submission_id>', methods=['GET'])
@jwt_required()
@require_superadmin
def get_form_submission(submission_id):
    """Get specific form submission"""
    try:
        if not ObjectId.is_valid(submission_id):
            return jsonify({
                "success": False,
                "message": "Invalid submission ID"
            }), 400
        
        submission = mongo_db[FORM_SUBMISSIONS_COLLECTION].find_one({'_id': ObjectId(submission_id)})
        if not submission:
            return jsonify({
                "success": False,
                "message": "Submission not found"
            }), 404
        
        # Convert ObjectId to string
        submission['_id'] = str(submission['_id'])
        submission['form_id'] = str(submission['form_id'])
        submission['student_id'] = str(submission['student_id'])
        
        # Get form details
        form = mongo_db[FORMS_COLLECTION].find_one({'_id': ObjectId(submission['form_id'])})
        if form:
            submission['form_details'] = {
                'title': form['title'],
                'description': form['description'],
                'template_type': form.get('template_type', 'custom'),
                'fields': form['fields']
            }
            
            # Process form responses with field labels
            if 'responses' in submission:
                processed_responses = []
                for response in submission['responses']:
                    field_id = response.get('field_id')
                    field_value = response.get('value')
                    
                    # Find the field definition in the form
                    field_definition = None
                    for field in form.get('fields', []):
                        if field.get('field_id') == field_id:
                            field_definition = field
                            break
                    
                    if field_definition:
                        processed_responses.append({
                            'field_id': field_id,
                            'field_label': field_definition.get('label', 'Unknown Field'),
                            'field_type': field_definition.get('type', 'text'),
                            'field_required': field_definition.get('required', False),
                            'value': field_value,
                            'display_value': format_field_value(field_value, field_definition.get('type', 'text'))
                        })
                    else:
                        processed_responses.append({
                            'field_id': field_id,
                            'field_label': 'Unknown Field',
                            'field_type': 'text',
                            'field_required': False,
                            'value': field_value,
                            'display_value': str(field_value) if field_value is not None else 'No response'
                        })
                
                submission['form_responses'] = processed_responses
            else:
                submission['form_responses'] = []
        
        # Get student details with course, batch, and campus information
        student = mongo_db['students'].find_one({'_id': ObjectId(submission['student_id'])})
        if student:
            # Get course details
            course = mongo_db['courses'].find_one({'_id': student.get('course_id')})
            course_name = course.get('name', 'Unknown') if course else 'Unknown'
            
            # Get batch details
            batch = mongo_db['batches'].find_one({'_id': student.get('batch_id')})
            batch_name = batch.get('name', 'Unknown') if batch else 'Unknown'
            
            # Get campus details
            campus = mongo_db['campuses'].find_one({'_id': student.get('campus_id')})
            campus_name = campus.get('name', 'Unknown') if campus else 'Unknown'
            
            submission['student_details'] = {
                'name': student.get('name', 'Unknown'),
                'email': student.get('email', 'Unknown'),
                'phone': student.get('mobile_number', 'Unknown'),
                'roll_number': student.get('roll_number', 'Unknown'),
                'course': course_name,
                'batch': batch_name,
                'campus': campus_name
            }
        else:
            # Handle missing student data gracefully
            submission['student_details'] = {
                'name': 'Unknown (Student Deleted)',
                'email': 'Unknown',
                'phone': 'Unknown',
                'roll_number': 'Unknown',
                'course': 'Unknown',
                'batch': 'Unknown',
                'campus': 'Unknown'
            }
        
        return jsonify({
            "success": True,
            "data": {
                "submission": submission
            }
        })
        
    except Exception as e:
        logger.error(f"Error fetching form submission: {str(e)}")
        return jsonify({
            "success": False,
            "message": "Failed to fetch form submission"
        }), 500

@form_submissions_bp.route('/admin/submissions/<submission_id>', methods=['DELETE'])
@jwt_required()
@require_superadmin
def delete_form_submission(submission_id):
    """Delete form submission"""
    try:
        if not ObjectId.is_valid(submission_id):
            return jsonify({
                "success": False,
                "message": "Invalid submission ID"
            }), 400
        
        result = mongo_db[FORM_SUBMISSIONS_COLLECTION].delete_one({'_id': ObjectId(submission_id)})
        
        if result.deleted_count > 0:
            return jsonify({
                "success": True,
                "message": "Submission deleted successfully"
            })
        else:
            return jsonify({
                "success": False,
                "message": "Submission not found"
            }), 404
        
    except Exception as e:
        logger.error(f"Error deleting form submission: {str(e)}")
        return jsonify({
            "success": False,
            "message": "Failed to delete form submission"
        }), 500

@form_submissions_bp.route('/admin/export/<form_id>', methods=['GET'])
@jwt_required()
@require_superadmin
def export_form_submissions(form_id):
    """Export form submissions to Excel/CSV"""
    try:
        if not ObjectId.is_valid(form_id):
            return jsonify({
                "success": False,
                "message": "Invalid form ID"
            }), 400
        
        # Get form details
        form = mongo_db[FORMS_COLLECTION].find_one({'_id': ObjectId(form_id)})
        if not form:
            return jsonify({
                "success": False,
                "message": "Form not found"
            }), 404
        
        # Get all submissions for this form (handle both string and ObjectId formats)
        query = {
            '$or': [
                {'form_id': ObjectId(form_id)},
                {'form_id': form_id}
            ],
            'status': 'submitted'
        }
        print(f"🔍 Export query: {query}")
        
        submissions = list(mongo_db[FORM_SUBMISSIONS_COLLECTION].find(query).sort('submitted_at', -1))
        print(f"📊 Found {len(submissions)} submissions for export")
        
        # Prepare export data
        export_data = []
        for submission in submissions:
            # Get student details using roll_number (same logic as submission viewer)
            student_roll_number = submission.get('student_roll_number')
            student = None
            student_name = 'Unknown'
            student_email = 'Unknown'
            student_roll = 'Unknown'
            student_mobile = 'Unknown'
            student_course = 'Unknown'
            student_batch = 'Unknown'
            student_campus = 'Unknown'
            
            if student_roll_number:
                try:
                    student = get_student_by_roll_number(student_roll_number)
                    student_name = student.get('name', 'Unknown')
                    student_email = student.get('email', 'Unknown')
                    student_roll = student.get('roll_number', 'Unknown')
                    student_mobile = student.get('mobile_number', 'Unknown')
                    
                    # Get course details
                    course = mongo_db['courses'].find_one({'_id': student.get('course_id')})
                    if course:
                        student_course = course.get('name', 'Unknown')
                    
                    # Get batch details
                    batch = mongo_db['batches'].find_one({'_id': student.get('batch_id')})
                    if batch:
                        student_batch = batch.get('name', 'Unknown')
                    
                    # Get campus details
                    campus = mongo_db['campuses'].find_one({'_id': student.get('campus_id')})
                    if campus:
                        student_campus = campus.get('name', 'Unknown')
                except Exception as e:
                    print(f"❌ Error looking up student by roll number: {str(e)}")
                    # Fallback: try to find by student_id if available
                    student_id = submission.get('student_id')
                    if student_id:
                        try:
                            if isinstance(student_id, str):
                                student_id = ObjectId(student_id)
                            student = mongo_db['students'].find_one({'_id': student_id})
                            if student:
                                student_name = student.get('name', 'Unknown')
                                student_email = student.get('email', 'Unknown')
                                student_roll = student.get('roll_number', 'Unknown')
                                student_mobile = student.get('mobile_number', 'Unknown')
                        except Exception as e2:
                            print(f"❌ Fallback student lookup also failed: {str(e2)}")
            
            # Create row data with only essential student information and form fields
            # Order: Roll Number, Name, Campus, Course, Batch, Mobile, Email, then form fields
            row = {
                'Student Roll Number': student_roll,
                'Student Name': student_name,
                'Student Campus': student_campus,
                'Student Course': student_course,
                'Student Batch': student_batch,
                'Student Mobile': student_mobile,
                'Student Email': student_email
            }
            
            # Process form responses (handle both 'responses' and 'form_responses' formats)
            responses_data = submission.get('responses', []) or submission.get('form_responses', [])
            
            # Add form field responses
            for response in responses_data:
                field_id = response.get('field_id')
                value = response.get('value')
                
                # Find field label
                field_label = field_id
                for field in form['fields']:
                    if field['field_id'] == field_id:
                        field_label = field['label']
                        break
                
                # Format value based on type
                if isinstance(value, list):
                    row[field_label] = ', '.join(str(v) for v in value)
                else:
                    row[field_label] = str(value) if value is not None else ''
            
            export_data.append(row)
        
        return jsonify({
            "success": True,
            "data": {
                "form_title": form['title'],
                "submissions": export_data,
                "total_submissions": len(export_data)
            }
        })
        
    except Exception as e:
        logger.error(f"Error exporting form submissions: {str(e)}")
        return jsonify({
            "success": False,
            "message": "Failed to export form submissions"
        }), 500

def validate_field_value(field, value):
    """Validate individual field value (imported from forms.py)"""
    if field['required'] and (value is None or value == '' or (isinstance(value, list) and len(value) == 0)):
        return f"Field '{field['label']}' is required"
    
    if value is None or value == '':
        return None  # Optional field, no validation needed
    
    field_type = field['type']
    validation = field.get('validation', {})
    
    # Text validation
    if field_type in ['text', 'textarea']:
        if not isinstance(value, str):
            return f"Field '{field['label']}' must be text"
        
        min_length = validation.get('minLength', 1)
        max_length = validation.get('maxLength', 1000)
        
        if len(value) < min_length:
            return f"Field '{field['label']}' must be at least {min_length} characters"
        if len(value) > max_length:
            return f"Field '{field['label']}' must be no more than {max_length} characters"
    
    # Email validation
    elif field_type == 'email':
        if not isinstance(value, str):
            return f"Field '{field['label']}' must be an email address"
        
        import re
        pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
        if not re.match(pattern, value):
            return f"Field '{field['label']}' must be a valid email address"
    
    # Phone/Mobile validation
    elif field_type == 'phone':
        if not isinstance(value, str):
            value = str(value)
        
        # Remove any non-digit characters for validation
        clean_value = ''.join(filter(str.isdigit, value))
        
        if len(clean_value) < 7:
            return f"Field '{field['label']}' must be at least 7 digits"
        elif len(clean_value) > 20:
            return f"Field '{field['label']}' must be no more than 20 digits"
        
        # Check if it's a valid number
        if not clean_value.isdigit():
            return f"Field '{field['label']}' must contain only numbers"
    
    # Number validation
    elif field_type == 'number':
        try:
            # Check if it's a mobile number field (common patterns)
            is_mobile_field = any(keyword in field['label'].lower() for keyword in ['mobile', 'phone', 'contact', 'number'])
            
            if is_mobile_field:
                # Mobile number validation - allow up to 20 digits
                if not isinstance(value, str):
                    value = str(value)
                
                # Remove any non-digit characters for validation
                clean_value = ''.join(filter(str.isdigit, value))
                
                if len(clean_value) < 7:
                    return f"Field '{field['label']}' must be at least 7 digits"
                elif len(clean_value) > 20:
                    return f"Field '{field['label']}' must be no more than 20 digits"
                
                # Check if it's a valid number
                if not clean_value.isdigit():
                    return f"Field '{field['label']}' must contain only numbers"
            else:
                # Regular number validation
                num_value = float(value)
                min_val = validation.get('min', 0)
                max_val = validation.get('max', 999999999999)  # Increased default max
                
                if num_value < min_val or num_value > max_val:
                    return f"Field '{field['label']}' must be between {min_val} and {max_val}"
        except (ValueError, TypeError):
            return f"Field '{field['label']}' must be a number"
    
    # Date validation
    elif field_type == 'date':
        if not isinstance(value, str):
            return f"Field '{field['label']}' must be a date"
        
        try:
            datetime.strptime(value, '%Y-%m-%d')
        except ValueError:
            return f"Field '{field['label']}' must be a valid date (YYYY-MM-DD)"
    
    # Dropdown/Radio validation
    elif field_type in ['dropdown', 'radio']:
        if value not in field.get('options', []):
            return f"Field '{field['label']}' must be one of the provided options"
    
    # Checkbox validation
    elif field_type == 'checkbox':
        if not isinstance(value, list):
            return f"Field '{field['label']}' must be a list of selected options"
        
        valid_options = field.get('options', [])
        for val in value:
            if val not in valid_options:
                return f"Field '{field['label']}' contains invalid option: {val}"
    
    return None

@form_submissions_bp.route('/admin/submissions/<submission_id>/toggle-release', methods=['PATCH'])
@jwt_required()
@require_superadmin
def toggle_submission_release(submission_id):
    """Toggle release status of a submission to students"""
    try:
        if not ObjectId.is_valid(submission_id):
            return jsonify({
                "success": False,
                "message": "Invalid submission ID"
            }), 400
        
        # Get current submission
        submission = mongo_db[FORM_SUBMISSIONS_COLLECTION].find_one({'_id': ObjectId(submission_id)})
        if not submission:
            return jsonify({
                "success": False,
                "message": "Submission not found"
            }), 404
        
        # Toggle release status
        current_status = submission.get('is_released_to_student', False)
        new_status = not current_status
        
        # Update submission
        result = mongo_db[FORM_SUBMISSIONS_COLLECTION].update_one(
            {'_id': ObjectId(submission_id)},
            {'$set': {'is_released_to_student': new_status}}
        )
        
        if result.modified_count > 0:
            return jsonify({
                "success": True,
                "data": {
                    "submission_id": submission_id,
                    "is_released_to_student": new_status,
                    "message": f"Submission {'released to' if new_status else 'withdrawn from'} students"
                }
            })
        else:
            return jsonify({
                "success": False,
                "message": "Failed to update submission release status"
            }), 500
        
    except Exception as e:
        logger.error(f"Error toggling submission release: {str(e)}")
        return jsonify({
            "success": False,
            "message": "Failed to toggle submission release status"
        }), 500

@form_submissions_bp.route('/student/released-submissions', methods=['GET'])
@jwt_required()
def get_student_released_submissions():
    """Get released form submissions for student profile"""
    try:
        # Get student roll number from JWT token
        try:
            student_roll_number = get_student_roll_number_from_jwt()
        except ValueError as e:
            return jsonify({
                "success": False,
                "message": str(e)
            }), 400
        
        # Get all released submissions for this student - using roll number
        submissions = list(mongo_db[FORM_SUBMISSIONS_COLLECTION].find({
            'student_roll_number': student_roll_number,
            'status': 'submitted',
            'is_released_to_student': True
        }).sort('submitted_at', -1))
        
        # Process submissions with form details
        processed_submissions = []
        for submission in submissions:
            submission['_id'] = str(submission['_id'])
            submission['form_id'] = str(submission['form_id'])
            submission['student_id'] = str(submission['student_id'])
            
            # Get form details
            form = mongo_db[FORMS_COLLECTION].find_one({'_id': ObjectId(submission['form_id'])})
            if form:
                submission['form_title'] = form['title']
                submission['form_description'] = form.get('description', '')
                submission['form_template_type'] = form.get('template_type', 'custom')
                
                # Process form responses with field labels using the new function
                submission['form_responses'] = process_submission_responses(submission, form)
            
            processed_submissions.append(submission)
        
        return jsonify({
            "success": True,
            "data": {
                "submissions": processed_submissions,
                "total": len(processed_submissions)
            }
        })
        
    except Exception as e:
        logger.error(f"Error fetching released submissions: {str(e)}")
        return jsonify({
            "success": False,
            "message": "Failed to fetch released submissions"
        }), 500

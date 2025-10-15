from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from bson import ObjectId
from datetime import datetime, timedelta
import logging
from collections import defaultdict

from config.database import DatabaseConfig
from routes.test_management import require_superadmin

form_analytics_bp = Blueprint('form_analytics', __name__)
mongo_db = DatabaseConfig.get_database()
logger = logging.getLogger(__name__)

@form_analytics_bp.route('/overview', methods=['GET'])
@jwt_required()
@require_superadmin
def get_analytics_overview():
    """Get overall form analytics"""
    try:
        # Get total forms
        total_forms = mongo_db['forms'].count_documents({})
        active_forms = mongo_db['forms'].count_documents({'settings.isActive': True})
        
        # Get total submissions
        total_submissions = mongo_db['form_submissions'].count_documents({})
        submitted_count = mongo_db['form_submissions'].count_documents({'status': 'submitted'})
        draft_count = mongo_db['form_submissions'].count_documents({'status': 'draft'})
        
        # Get unique students who submitted forms (using roll_number for accurate counting)
        unique_students = len(mongo_db['form_submissions'].distinct('student_roll_number', {'status': 'submitted'}))
        
        # Get submissions in last 30 days
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        recent_submissions = mongo_db['form_submissions'].count_documents({
            'submitted_at': {'$gte': thirty_days_ago},
            'status': 'submitted'
        })
        
        # Get most popular forms
        pipeline = [
            {'$match': {'status': 'submitted'}},
            {'$group': {'_id': '$form_id', 'count': {'$sum': 1}}},
            {'$sort': {'count': -1}},
            {'$limit': 5}
        ]
        
        popular_forms = list(mongo_db['form_submissions'].aggregate(pipeline))
        
        # Get form details for popular forms
        for form_stat in popular_forms:
            form = mongo_db['forms'].find_one({'_id': form_stat['_id']})
            if form:
                form_stat['title'] = form['title']
                form_stat['template_type'] = form.get('template_type', 'custom')
            else:
                form_stat['title'] = 'Unknown Form'
                form_stat['template_type'] = 'unknown'
        
        return jsonify({
            "success": True,
            "data": {
                "overview": {
                    "total_forms": total_forms,
                    "active_forms": active_forms,
                    "total_submissions": total_submissions,
                    "submitted_count": submitted_count,
                    "draft_count": draft_count,
                    "unique_students": unique_students,
                    "recent_submissions": recent_submissions
                },
                "popular_forms": popular_forms
            }
        })
        
    except Exception as e:
        logger.error(f"Error fetching analytics overview: {str(e)}")
        return jsonify({
            "success": False,
            "message": "Failed to fetch analytics overview"
        }), 500

@form_analytics_bp.route('/forms/<form_id>/stats', methods=['GET'])
@jwt_required()
@require_superadmin
def get_form_stats(form_id):
    """Get detailed statistics for a specific form"""
    try:
        if not ObjectId.is_valid(form_id):
            return jsonify({
                "success": False,
                "message": "Invalid form ID"
            }), 400
        
        # Get form details
        form = mongo_db['forms'].find_one({'_id': ObjectId(form_id)})
        if not form:
            return jsonify({
                "success": False,
                "message": "Form not found"
            }), 404
        
        # Get submission statistics (handle both string and ObjectId formats for form_id)
        form_query = {
            '$or': [
                {'form_id': ObjectId(form_id)},
                {'form_id': form_id}
            ]
        }
        total_submissions = mongo_db['form_submissions'].count_documents(form_query)
        submitted_count = mongo_db['form_submissions'].count_documents({
            '$or': [
                {'form_id': ObjectId(form_id)},
                {'form_id': form_id}
            ],
            'status': 'submitted'
        })
        draft_count = mongo_db['form_submissions'].count_documents({
            '$or': [
                {'form_id': ObjectId(form_id)},
                {'form_id': form_id}
            ],
            'status': 'draft'
        })
        
        # Get unique students who submitted this form (using roll_number for accurate counting)
        unique_students = len(mongo_db['form_submissions'].distinct('student_roll_number', {
            '$or': [
                {'form_id': ObjectId(form_id)},
                {'form_id': form_id}
            ],
            'status': 'submitted'
        }))
        
        # Get submission timeline (last 30 days)
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        start_date_range = today - timedelta(days=29)
        timeline_data = []
        
        logger.info(f"📊 Generating timeline for form {form_id}")
        logger.info(f"📊 Timeline range start: {start_date_range}")
        
        # First, let's check what submissions exist for this form
        all_submissions = list(mongo_db['form_submissions'].find({
            '$or': [
                {'form_id': ObjectId(form_id)},
                {'form_id': form_id}
            ],
            'status': 'submitted'
        }))
        
        logger.info(f"📊 Found {len(all_submissions)} total submissions for form {form_id}")
        for sub in all_submissions[:3]:  # Log first 3 submissions
            logger.info(f"📊 Submission: {sub.get('_id')}, submitted_at: {sub.get('submitted_at')}, created_at: {sub.get('created_at')}")
        
        for i in range(30): # Loop for 30 days
            date = start_date_range + timedelta(days=i)
            start_of_day = date.replace(hour=0, minute=0, second=0, microsecond=0)
            end_of_day = start_of_day + timedelta(days=1)
            
            # Try different date fields and approaches
            count_with_submitted_at = mongo_db['form_submissions'].count_documents({
                '$or': [
                    {'form_id': ObjectId(form_id)},
                    {'form_id': form_id}
                ],
                'status': 'submitted',
                'submitted_at': {'$gte': start_of_day, '$lt': end_of_day}
            })
            
            count_with_created_at = mongo_db['form_submissions'].count_documents({
                '$or': [
                    {'form_id': ObjectId(form_id)},
                    {'form_id': form_id}
                ],
                'status': 'submitted',
                'created_at': {'$gte': start_of_day, '$lt': end_of_day}
            })
            
            # Use whichever field has data; do NOT default to first day (to avoid fake spikes)
            if count_with_submitted_at > 0:
                count = count_with_submitted_at
            elif count_with_created_at > 0:
                count = count_with_created_at
            else:
                count = 0
            
            if i < 3:  # Log first 3 days for debugging
                logger.info(f"📊 Day {i}: submitted_at count: {count_with_submitted_at}, created_at count: {count_with_created_at}, final count: {count}")
            
            timeline_entry = {
                'date': start_of_day.strftime('%Y-%m-%d'),
                'count': count
            }
            timeline_data.append(timeline_entry)
            
            if i < 5:  # Log first 5 entries for debugging
                logger.info(f"📊 Timeline day {i}: {timeline_entry}")
        
        logger.info(f"📊 Total timeline entries: {len(timeline_data)}")
        logger.info(f"📊 Timeline sample: {timeline_data[:3]}")
        
        # If we still have no data, let's try a different approach - get all submissions and group by date
        if all(entry['count'] == 0 for entry in timeline_data) and len(all_submissions) > 0:
            logger.info("📊 No timeline data found with date filtering, trying alternative approach")
            
            # Reset timeline data
            timeline_data = []
            
            # Helper: normalize various date formats to datetime
            def to_datetime(dt_val):
                try:
                    if dt_val is None:
                        return None
                    # Already datetime
                    if hasattr(dt_val, 'year'):
                        return dt_val
                    # Mongo $date dict
                    if isinstance(dt_val, dict) and '$date' in dt_val:
                        from datetime import datetime
                        date_str = dt_val['$date']
                        if isinstance(date_str, str):
                            # ISO with Z
                            return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                        # millis timestamp
                        return datetime.fromtimestamp(int(date_str) / 1000)
                    # ISO string
                    if isinstance(dt_val, str):
                        from datetime import datetime
                        # Try common formats
                        try:
                            return datetime.fromisoformat(dt_val.replace('Z', '+00:00'))
                        except Exception:
                            pass
                    return None
                except Exception:
                    return None
            
            for i in range(30): # Loop for 30 days
                date = start_date_range + timedelta(days=i)
                start_of_day = date.replace(hour=0, minute=0, second=0, microsecond=0)
                end_of_day = start_of_day + timedelta(days=1)
                
                # Count submissions that fall within this day
                count = 0
                for submission in all_submissions:
                    sub_date_raw = submission.get('submitted_at') or submission.get('created_at')
                    sub_date = to_datetime(sub_date_raw)
                    if sub_date and start_of_day <= sub_date < end_of_day:
                        count += 1
                
                timeline_entry = {
                    'date': start_of_day.strftime('%Y-%m-%d'),
                    'count': count
                }
                timeline_data.append(timeline_entry)
                
                if i < 5:  # Log first 5 entries for debugging
                    logger.info(f"📊 Alternative timeline day {i}: {timeline_entry}")
            
            logger.info(f"📊 Alternative timeline total entries: {len(timeline_data)}")
            logger.info(f"📊 Alternative timeline sample: {timeline_data[:3]}")
        
        # Get field response statistics
        field_stats = []
        for field in form['fields']:
            field_id = field['field_id']
            field_type = field['type']
            
            # Get responses for this field (handle both 'responses' and 'form_responses' formats)
            pipeline = [
                {'$match': {
                    '$or': [
                        {'form_id': ObjectId(form_id)},
                        {'form_id': form_id}
                    ],
                    'status': 'submitted'
                }},
                {'$unwind': {'path': '$responses', 'preserveNullAndEmptyArrays': True}},
                {'$unwind': {'path': '$form_responses', 'preserveNullAndEmptyArrays': True}},
                {'$match': {
                    '$or': [
                        {'responses.field_id': field_id},
                        {'form_responses.field_id': field_id}
                    ]
                }},
                {'$project': {
                    'value': {
                        '$cond': {
                            'if': {'$ne': ['$responses.field_id', None]},
                            'then': '$responses.value',
                            'else': '$form_responses.value'
                        }
                    }
                }},
                {'$match': {'value': {'$ne': None}}},
                {'$group': {'_id': '$value', 'count': {'$sum': 1}}},
                {'$sort': {'count': -1}}
            ]
            
            field_responses = list(mongo_db['form_submissions'].aggregate(pipeline))
            
            # Calculate statistics based on field type
            if field_type in ['dropdown', 'radio']:
                # For choice fields, show option distribution
                total_responses = sum(response['count'] for response in field_responses)
                option_distribution = []
                
                for option in field.get('options', []):
                    count = next((r['count'] for r in field_responses if r['_id'] == option), 0)
                    percentage = (count / total_responses * 100) if total_responses > 0 else 0
                    option_distribution.append({
                        'option': option,
                        'count': count,
                        'percentage': round(percentage, 2)
                    })
                
                field_stats.append({
                    'field_id': field_id,
                    'field_label': field['label'],
                    'field_type': field_type,
                    'total_responses': total_responses,
                    'option_distribution': option_distribution
                })
            
            elif field_type == 'checkbox':
                # For checkbox fields, show selected options
                total_responses = sum(response['count'] for response in field_responses)
                option_distribution = []
                
                for option in field.get('options', []):
                    count = sum(r['count'] for r in field_responses if option in r['_id'])
                    percentage = (count / total_responses * 100) if total_responses > 0 else 0
                    option_distribution.append({
                        'option': option,
                        'count': count,
                        'percentage': round(percentage, 2)
                    })
                
                field_stats.append({
                    'field_id': field_id,
                    'field_label': field['label'],
                    'field_type': field_type,
                    'total_responses': total_responses,
                    'option_distribution': option_distribution
                })
            
            else:
                # For text fields, show basic statistics
                total_responses = sum(response['count'] for response in field_responses)
                field_stats.append({
                    'field_id': field_id,
                    'field_label': field['label'],
                    'field_type': field_type,
                    'total_responses': total_responses
                })
        
        return jsonify({
            "success": True,
            "data": {
                "form_title": form['title'],
                "form_description": form['description'],
                "template_type": form.get('template_type', 'custom'),
                "statistics": {
                    "total_submissions": total_submissions,
                    "submitted_count": submitted_count,
                    "draft_count": draft_count,
                    "unique_students": unique_students,
                    "completion_rate": round((submitted_count / unique_students * 100), 2) if unique_students > 0 else 0
                },
                "timeline": timeline_data,
                "field_stats": field_stats
            }
        })
        
    except Exception as e:
        logger.error(f"Error fetching form stats: {str(e)}")
        return jsonify({
            "success": False,
            "message": "Failed to fetch form statistics"
        }), 500

@form_analytics_bp.route('/students/<student_roll_number>/submissions', methods=['GET'])
@jwt_required()
@require_superadmin
def get_student_submissions(student_roll_number):
    """Get all form submissions by a specific student using roll number"""
    try:
        # Get student details by roll number
        student = mongo_db['students'].find_one({'roll_number': student_roll_number})
        if not student:
            return jsonify({
                "success": False,
                "message": "Student not found"
            }), 404
        
        # Get all submissions by this student using roll number
        submissions = list(mongo_db['form_submissions'].find({
            'student_roll_number': student_roll_number
        }).sort('submitted_at', -1))
        
        # Add form details to each submission
        for submission in submissions:
            submission['_id'] = str(submission['_id'])
            submission['form_id'] = str(submission['form_id'])
            submission['student_id'] = str(submission['student_id'])
            
            # Get form details
            form = mongo_db['forms'].find_one({'_id': ObjectId(submission['form_id'])})
            if form:
                submission['form_title'] = form['title']
                submission['form_template_type'] = form.get('template_type', 'custom')
        
        # Get course, batch, and campus details
        course = mongo_db['courses'].find_one({'_id': student.get('course_id')})
        course_name = course.get('name', 'Unknown') if course else 'Unknown'
        
        batch = mongo_db['batches'].find_one({'_id': student.get('batch_id')})
        batch_name = batch.get('name', 'Unknown') if batch else 'Unknown'
        
        campus = mongo_db['campuses'].find_one({'_id': student.get('campus_id')})
        campus_name = campus.get('name', 'Unknown') if campus else 'Unknown'
        
        return jsonify({
            "success": True,
            "data": {
                "student": {
                    "name": student.get('name', 'Unknown'),
                    "email": student.get('email', 'Unknown'),
                    "phone": student.get('mobile_number', 'Unknown'),
                    "roll_number": student.get('roll_number', 'Unknown'),
                    "course": course_name,
                    "batch": batch_name,
                    "campus": campus_name
                },
                "submissions": submissions,
                "total_submissions": len(submissions)
            }
        })
        
    except Exception as e:
        logger.error(f"Error fetching student submissions: {str(e)}")
        return jsonify({
            "success": False,
            "message": "Failed to fetch student submissions"
        }), 500

@form_analytics_bp.route('/completion-rates', methods=['GET'])
@jwt_required()
@require_superadmin
def get_completion_rates():
    """Get completion rates for all forms"""
    try:
        # Get all active forms
        forms = list(mongo_db['forms'].find({'settings.isActive': True}))
        
        completion_rates = []
        
        for form in forms:
            form_id = form['_id']
            form_title = form['title']
            
            # Get total submissions for this form (form_id is stored as ObjectId)
            total_submissions = mongo_db['form_submissions'].count_documents({
                'form_id': ObjectId(form_id),
                'status': 'submitted'
            })
            
            # Get unique students who submitted this form
            unique_students = len(mongo_db['form_submissions'].distinct('student_id', {
                'form_id': ObjectId(form_id),
                'status': 'submitted'
            }))
            
            # Get total number of students (approximate - using total student count)
            total_students = mongo_db['students'].count_documents({})
            
            # Calculate completion rate
            completion_rate = (unique_students / total_students * 100) if total_students > 0 else 0
            
            completion_rates.append({
                'form_id': str(form_id),
                'form_title': form_title,
                'template_type': form.get('template_type', 'custom'),
                'total_submissions': total_submissions,
                'unique_students': unique_students,
                'total_students': total_students,
                'completion_rate': round(completion_rate, 2)
            })
        
        # Sort by completion rate descending
        completion_rates.sort(key=lambda x: x['completion_rate'], reverse=True)
        
        return jsonify({
            "success": True,
            "data": {
                "completion_rates": completion_rates
            }
        })
        
    except Exception as e:
        logger.error(f"Error fetching completion rates: {str(e)}")
        return jsonify({
            "success": False,
            "message": "Failed to fetch completion rates"
        }), 500

@form_analytics_bp.route('/export/analytics/<form_id>', methods=['GET'])
@jwt_required()
@require_superadmin
def export_analytics(form_id):
    """Export analytics data"""
    try:

        # Get date range from query parameters
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        # Build date filter
        date_filter = {}
        if start_date:
            try:
                start_dt = datetime.fromisoformat(start_date)
                date_filter['$gte'] = start_dt
            except ValueError:
                return jsonify({
                    "success": False,
                    "message": "Invalid start_date format. Use YYYY-MM-DD"
                }), 400
        
        if end_date:
            try:
                end_dt = datetime.fromisoformat(end_date)
                date_filter['$lt'] = end_dt
            except ValueError:
                return jsonify({
                    "success": False,
                    "message": "Invalid end_date format. Use YYYY-MM-DD"
                }), 400
        
        # Get submissions in date range
        query = {
            '$or': [
                {'form_id': ObjectId(form_id)},
                {'form_id': form_id}
            ],
            'status': 'submitted'
        }
        if date_filter:
            query['submitted_at'] = date_filter
        
        submissions = list(mongo_db['form_submissions'].find(query).sort('submitted_at', -1))
        
        if not submissions:
            return jsonify({
                "success": True,
                "data": { "submissions": [] }
            })

        # Prepare export data
        export_data = []
        all_field_labels = set(['Submission Date', 'Student Name', 'Student Email', 'Student Roll Number', 'Student Mobile Number', 'Campus', 'Course', 'Batch', 'Form Title'])

        # Pre-fetch all forms to create a form map for efficiency
        form_ids = list(set(ObjectId(sub['form_id']) for sub in submissions if ObjectId.is_valid(str(sub.get('form_id')))))
        forms_cursor = mongo_db['forms'].find({'_id': {'$in': form_ids}})
        forms_map = {str(form['_id']): form for form in forms_cursor}


        # First pass: collect all unique field labels from all submissions
        for submission in submissions:
            form_id_str = str(submission.get('form_id'))
            form = forms_map.get(form_id_str)
            if not form:
                continue

            field_map = {field['field_id']: field['label'] for field in form.get('fields', [])}
            responses = submission.get('responses', []) or submission.get('form_responses', [])
            for response in responses:
                field_label = field_map.get(response.get('field_id'))
                if field_label:
                    all_field_labels.add(field_label)

        # Define a consistent header order
        # Desired order: Student details, then form fields alphabetically
        student_headers = ['Student Roll Number', 'Student Name', 'Student Mobile Number', 'Student Email', 'Campus', 'Course', 'Batch', 'Submission Date', 'Form Title']
        form_field_headers = sorted([h for h in all_field_labels if h not in student_headers])
        ordered_headers = student_headers + form_field_headers

        for submission in submissions:
            # Get form details
            form_id_str = str(submission.get('form_id'))
            form = forms_map.get(form_id_str)
            form_title = form.get('title', 'Unknown Form') if form else 'Unknown Form'
            field_map = {field['field_id']: field['label'] for field in form.get('fields', [])} if form else {}

            # Get student details
            student_doc = None
            student_id_val = submission.get('student_id')
            if student_id_val:
                try:
                    student_doc = mongo_db['students'].find_one({'_id': ObjectId(student_id_val)})
                except Exception:
                    pass
            if not student_doc:
                roll_no = submission.get('student_roll_number')
                if roll_no:
                    student_doc = mongo_db['students'].find_one({'roll_number': roll_no})

            student_name = (student_doc or {}).get('name', 'Unknown')
            student_email = (student_doc or {}).get('email', 'Unknown')
            student_roll_number = (student_doc or {}).get('roll_number', 'Unknown')
            student_mobile_number = (student_doc or {}).get('mobile_number', 'Unknown')

            campus_name = 'Unknown'
            course_name = 'Unknown'
            batch_name = 'Unknown'

            if student_doc:
                campus = mongo_db['campuses'].find_one({'_id': student_doc.get('campus_id')}) if student_doc.get('campus_id') else None
                course = mongo_db['courses'].find_one({'_id': student_doc.get('course_id')}) if student_doc.get('course_id') else None
                batch = mongo_db['batches'].find_one({'_id': student_doc.get('batch_id')}) if student_doc.get('batch_id') else None
                campus_name = campus.get('name', 'Unknown') if campus else 'Unknown'
                course_name = course.get('name', 'Unknown') if course else 'Unknown'
                batch_name = batch.get('name', 'Unknown') if batch else 'Unknown'

            # Create row data
            row = {
                'Form Title': form_title,
                'Submission Date': submission.get('submitted_at').strftime('%Y-%m-%d %H:%M:%S') if submission.get('submitted_at') else 'N/A',
                'Student Name': student_name,
                'Student Email': student_email,
                'Student Roll Number': student_roll_number,
                'Student Mobile Number': student_mobile_number,
                'Campus': campus_name,
                'Course': course_name,
                'Batch': batch_name
            }

            # Add form field responses
            responses = submission.get('responses', []) or submission.get('form_responses', [])
            for response in responses:
                field_label = field_map.get(response.get('field_id'), response.get('field_id'))
                value = response.get('value')
                # Format value
                if isinstance(value, list):
                    row[field_label] = ', '.join(str(v) for v in value if v is not None)
                else:
                    row[field_label] = str(value) if value is not None else ''
            
            export_data.append(row)
        
        # Final step: ensure all rows have all headers
        final_export_data = []
        for row in export_data:
            new_row = {header: row.get(header, '') for header in ordered_headers}
            final_export_data.append(new_row)

        return jsonify({
            "success": True,
            "data": {
                "submissions": final_export_data,
                "total_submissions": len(final_export_data),
                "date_range": {
                    "start_date": start_date,
                    "end_date": end_date
                }
            }
        })
        
    except Exception as e:
        logger.error(f"Error exporting analytics: {str(e)}")
        return jsonify({
            "success": False,
            "message": "Failed to export analytics data"
        }), 500

@form_analytics_bp.route('/fields/<form_id>/<field_id>/responses', methods=['GET'])
@jwt_required()
@require_superadmin
def get_field_responses(form_id, field_id):
    """Get detailed responses for a specific field"""
    try:
        if not ObjectId.is_valid(form_id):
            return jsonify({
                "success": False,
                "message": "Invalid form ID"
            }), 400
        
        # Get form to verify it exists
        form = mongo_db['forms'].find_one({'_id': ObjectId(form_id)})
        if not form:
            return jsonify({
                "success": False,
                "message": "Form not found"
            }), 404
        
        # Find the field in the form
        field = None
        for f in form['fields']:
            if f['field_id'] == field_id:
                field = f
                break
        
        if not field:
            return jsonify({
                "success": False,
                "message": "Field not found"
            }), 404
        
        # Get all submissions for this form
        submissions = list(mongo_db['form_submissions'].find({
            '$or': [
                {'form_id': ObjectId(form_id)},
                {'form_id': form_id}
            ],
            'status': 'submitted'
        }).sort('submitted_at', -1))
        
        # Helper to resolve student details robustly
        def resolve_student_details(submission_doc):
            """Return a dict with student details using multiple lookup strategies."""
            student_doc = None

            # 1) Try by student_id (could be ObjectId or string)
            student_id_val = submission_doc.get('student_id')
            if student_id_val:
                try:
                    # If it's already an ObjectId or valid string
                    sid = student_id_val if isinstance(student_id_val, ObjectId) else ObjectId(str(student_id_val))
                    student_doc = mongo_db['students'].find_one({'_id': sid})
                except Exception:
                    # Ignore invalid ObjectId
                    student_doc = mongo_db['students'].find_one({'_id': student_id_val})

            # 2) Try by roll number
            if not student_doc:
                roll_no = submission_doc.get('student_roll_number')
                if roll_no:
                    student_doc = mongo_db['students'].find_one({'roll_number': roll_no})

            # 3) Try by email / mobile on the submission (common in some schemas)
            if not student_doc:
                sub_email = submission_doc.get('student_email') or submission_doc.get('email')
                sub_mobile = submission_doc.get('student_mobile') or submission_doc.get('mobile_number') or submission_doc.get('phone')
                if sub_email:
                    student_doc = mongo_db['students'].find_one({'email': sub_email})
                if not student_doc and sub_mobile:
                    student_doc = mongo_db['students'].find_one({'mobile_number': sub_mobile})

            # 4) Fallback: try users collection mapping if present
            if not student_doc and student_id_val:
                try:
                    uid = student_id_val if isinstance(student_id_val, ObjectId) else ObjectId(str(student_id_val))
                    user_doc = mongo_db['users'].find_one({'_id': uid})
                except Exception:
                    user_doc = mongo_db['users'].find_one({'_id': student_id_val})
                if user_doc:
                    # Attempt to map via email or mobile to students
                    email = user_doc.get('email')
                    mobile = user_doc.get('mobile_number') or user_doc.get('phone')
                    if email:
                        student_doc = mongo_db['students'].find_one({'email': email}) or student_doc
                    if not student_doc and mobile:
                        student_doc = mongo_db['students'].find_one({'mobile_number': mobile})

            # Prepare enriched fields
            name = (student_doc or {}).get('name') or submission_doc.get('student_name') or 'Unknown'
            roll_number = (student_doc or {}).get('roll_number', 'Unknown')
            email = (student_doc or {}).get('email') or submission_doc.get('student_email')
            course_name = 'Unknown'
            batch_name = 'Unknown'
            campus_name = 'Unknown'

            if student_doc:
                course = mongo_db['courses'].find_one({'_id': student_doc.get('course_id')}) if student_doc.get('course_id') else None
                batch = mongo_db['batches'].find_one({'_id': student_doc.get('batch_id')}) if student_doc.get('batch_id') else None
                campus = mongo_db['campuses'].find_one({'_id': student_doc.get('campus_id')}) if student_doc.get('campus_id') else None
                course_name = course.get('name', 'Unknown') if course else 'Unknown'
                batch_name = batch.get('name', 'Unknown') if batch else 'Unknown'
                campus_name = campus.get('name', 'Unknown') if campus else 'Unknown'

            return {
                'name': name,
                'roll_number': roll_number,
                'email': email,
                'course': course_name,
                'batch': batch_name,
                'campus': campus_name
            }

        # Extract responses for this specific field
        field_responses = []
        for submission in submissions:
            # Get student details robustly
            student_details = resolve_student_details(submission)
            
            # Find the response for this field
            responses_list = submission.get('responses', []) or submission.get('form_responses', [])
            for response in responses_list:
                if response.get('field_id') == field_id:
                    field_responses.append({
                        'value': response.get('value', ''),
                        'student': {
                            'id': str(submission.get('student_id')) if submission.get('student_id') is not None else None,
                            'name': student_details.get('name', 'Unknown'),
                            'roll_number': student_details.get('roll_number', 'Unknown'),
                            'email': student_details.get('email'),
                            'course': student_details.get('course', 'Unknown'),
                            'batch': student_details.get('batch', 'Unknown'),
                            'campus': student_details.get('campus', 'Unknown')
                        },
                        'submitted_at': response.get('submitted_at') or submission.get('submitted_at'),
                        'submission_id': str(submission['_id'])
                    })
                    break
        
        logger.info(f"📊 Found {len(field_responses)} responses for field {field_id} in form {form_id}")
        
        return jsonify({
            "success": True,
            "data": {
                "field_id": field_id,
                "field_label": field['label'],
                "field_type": field['type'],
                "total_responses": len(field_responses),
                "responses": field_responses
            }
        })
        
    except Exception as e:
        logger.error(f"Error fetching field responses: {str(e)}")
        return jsonify({
            "success": False,
            "message": "Failed to fetch field responses"
        }), 500

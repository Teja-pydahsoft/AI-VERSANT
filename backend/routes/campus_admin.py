from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from bson import ObjectId
from mongo import mongo_db
from config.shared import bcrypt
from routes.access_control import require_permission

campus_admin_bp = Blueprint('campus_admin', __name__)

@campus_admin_bp.route('/dashboard', methods=['GET'])
@jwt_required()
@require_permission(module='dashboard')
def dashboard():
    """Campus admin dashboard"""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)
        
        if not user or user.get('role') != 'campus_admin':
            return jsonify({
                'success': False,
                'message': 'Access denied'
            }), 403
        
        campus_id = user.get('campus_id')
        if not campus_id:
            return jsonify({
                'success': False,
                'message': 'Campus not assigned'
            }), 400
        
        # Get campus statistics
        total_students = mongo_db.students.count_documents({'campus_id': campus_id})
        total_courses = mongo_db.courses.count_documents({'campus_id': campus_id})
        total_tests = mongo_db.tests.count_documents({'campus_id': campus_id})
        
        dashboard_data = {
            'campus_id': str(campus_id),
            'statistics': {
                'total_students': total_students,
                'total_tests': total_tests,
                'total_results': total_tests  # Assuming each test has results
            }
        }
        
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


@campus_admin_bp.route('/students', methods=['GET'])
@jwt_required()
@require_permission(module='student_management')
def get_campus_students():
    """Get all students in the campus admin's campus"""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)
        
        if not user or user.get('role') != 'campus_admin':
            return jsonify({'success': False, 'message': 'Access denied'}), 403
        
        campus_id = user.get('campus_id')
        if not campus_id:
            return jsonify({'success': False, 'message': 'Campus not assigned'}), 400

        # Get pagination parameters
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 20))
        search = request.args.get('search', '').strip()
        
        # Calculate skip value
        skip = (page - 1) * limit

        # Build match stage with search
        match_stage = {'campus_id': ObjectId(campus_id)}
        if search:
            match_stage['$or'] = [
                {'name': {'$regex': search, '$options': 'i'}},
                {'email': {'$regex': search, '$options': 'i'}},
                {'roll_number': {'$regex': search, '$options': 'i'}}
            ]

        # Get total count for pagination
        total_count = mongo_db.students.count_documents(match_stage)
        
        # Get students in this campus with pagination
        students = list(mongo_db.students.find(match_stage).skip(skip).limit(limit).sort('name', 1))
        student_list = []
        
        for student in students:
            # Get course info
            course = mongo_db.courses.find_one({'_id': student.get('course_id')})
            course_info = {
                'id': str(course['_id']),
                'name': course.get('name')
            } if course else None
            
            student_list.append({
                'id': str(student['_id']),
                'name': student.get('name'),
                'email': student.get('email'),
                'roll_number': student.get('roll_number'),
                'course': course_info,
                'created_at': student.get('created_at')
            })
        
        return jsonify({
            'success': True, 
            'data': student_list,
            'pagination': {
                'page': page,
                'limit': limit,
                'total': total_count,
                'pages': (total_count + limit - 1) // limit,
                'has_more': (page * limit) < total_count
            }
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Failed to get students: {str(e)}'
        }), 500

@campus_admin_bp.route('/reports/student-progress', methods=['GET'])
@jwt_required()
@require_permission(module='analytics')
def get_student_progress():
    """Get student progress data for the campus admin's campus"""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)
        
        if not user or user.get('role') not in ['campus_admin', 'course_admin']:
            return jsonify({'success': False, 'message': 'Access denied'}), 403
        
        campus_id = user.get('campus_id')
        if not campus_id:
            return jsonify({'success': False, 'message': 'Campus not assigned'}), 400
        
        # Get all students in this campus
        students = list(mongo_db.students.find({'campus_id': ObjectId(campus_id)}))
        student_ids = [student['_id'] for student in students]
        
        # Get progress data
        progress_data = list(mongo_db.student_progress.find({
            'student_id': {'$in': student_ids}
        }))
        
        return jsonify({
            'success': True,
            'message': 'Progress data retrieved successfully',
            'data': progress_data
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Failed to get progress data: {str(e)}'
        }), 500

@campus_admin_bp.route('/batches', methods=['GET'])
@jwt_required()
@require_permission(module='batch_management')
def get_batches():
    """List all batches for the campus admin's campus or course admin's course"""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)
        
        if not user or user.get('role') not in ['campus_admin', 'course_admin']:
            return jsonify({'success': False, 'message': 'Access denied'}), 403
        
        batch_list = []
        
        if user.get('role') == 'campus_admin':
            # Campus admin: get batches for their campus
            campus_id = user.get('campus_id')
            if not campus_id:
                return jsonify({'success': False, 'message': 'Campus not assigned'}), 400
            
            batches = list(mongo_db.batches.find({'campus_ids': ObjectId(campus_id)}))
            
            for batch in batches:
                course_objs = list(mongo_db.courses.find({'_id': {'$in': batch.get('course_ids', [])}}))
                student_count = mongo_db.students.count_documents({'batch_id': batch['_id']})
                batch_list.append({
                    'id': str(batch['_id']),
                    'name': batch['name'],
                    'courses': [{'id': str(c['_id']), 'name': c['name']} for c in course_objs],
                    'student_count': student_count
                })
        
        elif user.get('role') == 'course_admin':
            # Course admin: get batches for their course
            course_id = user.get('course_id')
            if not course_id:
                return jsonify({'success': False, 'message': 'Course not assigned'}), 400
            
            batches = list(mongo_db.batches.find({'course_ids': ObjectId(course_id)}))
            
            for batch in batches:
                # Get campus info for this batch
                campus_objs = list(mongo_db.campuses.find({'_id': {'$in': batch.get('campus_ids', [])}}))
                # Count only students for this specific course in this batch
                student_count = mongo_db.students.count_documents({
                    'batch_id': batch['_id'],
                    'course_id': ObjectId(course_id)
                })
                batch_list.append({
                    'id': str(batch['_id']),
                    'name': batch['name'],
                    'campuses': [{'id': str(c['_id']), 'name': c['name']} for c in campus_objs],
                    'student_count': student_count
                })
        
        return jsonify({'success': True, 'data': batch_list}), 200
        
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@campus_admin_bp.route('/batches', methods=['POST'])
@jwt_required()
@require_permission(module='batch_management', action='create_batch')
def create_batch():
    """Create a new batch for the campus admin's campus"""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)
        
        if not user or user.get('role') not in ['campus_admin', 'course_admin']:
            return jsonify({'success': False, 'message': 'Access denied. Campus or Course Admin required.'}), 403
        
        campus_id = user.get('campus_id')
        data = request.get_json()
        name = data.get('name')
        course_ids = [ObjectId(cid) for cid in data.get('course_ids', [])]
        
        if not name or not course_ids:
            return jsonify({'success': False, 'message': 'Name and courses are required'}), 400
        
        if mongo_db.batches.find_one({'name': name, 'campus_ids': ObjectId(campus_id)}):
            return jsonify({'success': False, 'message': 'Batch name already exists'}), 409
        
        batch_id = mongo_db.batches.insert_one({
            'name': name,
            'campus_ids': [ObjectId(campus_id)],
            'course_ids': course_ids
        }).inserted_id
        
        return jsonify({'success': True, 'data': {'id': str(batch_id)}}), 201
        
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@campus_admin_bp.route('/batches/<batch_id>', methods=['PUT'])
@jwt_required()
def edit_batch(batch_id):
    """Edit a batch (only if it belongs to the campus admin's campus)"""
    current_user_id = get_jwt_identity()
    user = mongo_db.find_user_by_id(current_user_id)
    if not user or user.get('role') != 'campus_admin':
        return jsonify({'success': False, 'message': 'Access denied'}), 403
    campus_id = user.get('campus_id')
    batch = mongo_db.batches.find_one({'_id': ObjectId(batch_id), 'campus_ids': ObjectId(campus_id)})
    if not batch:
        return jsonify({'success': False, 'message': 'Batch not found or not in your campus'}), 404
    data = request.get_json()
    name = data.get('name')
    if not name:
        return jsonify({'success': False, 'message': 'Batch name is required'}), 400
    mongo_db.batches.update_one({'_id': ObjectId(batch_id)}, {'$set': {'name': name}})
    return jsonify({'success': True, 'message': 'Batch updated successfully'}), 200

@campus_admin_bp.route('/batches/<batch_id>', methods=['DELETE'])
@jwt_required()
def delete_batch(batch_id):
    """Delete a batch (only if it belongs to the campus admin's campus)"""
    current_user_id = get_jwt_identity()
    user = mongo_db.find_user_by_id(current_user_id)
    if not user or user.get('role') not in ['campus_admin', 'course_admin']:
        return jsonify({'success': False, 'message': 'Access denied. Campus or Course Admin required.'}), 403
    campus_id = user.get('campus_id')
    batch = mongo_db.batches.find_one({'_id': ObjectId(batch_id), 'campus_ids': ObjectId(campus_id)})
    if not batch:
        return jsonify({'success': False, 'message': 'Batch not found or not in your campus'}), 404
    mongo_db.batches.delete_one({'_id': ObjectId(batch_id)})
    return jsonify({'success': True, 'message': 'Batch deleted successfully'}), 200

@campus_admin_bp.route('/courses', methods=['GET'])
@jwt_required()
@require_permission(module='course_management')
def get_courses():
    """List all courses for the campus admin's campus or course admin's course"""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)
        
        if not user or user.get('role') not in ['campus_admin', 'course_admin']:
            return jsonify({'success': False, 'message': 'Access denied'}), 403
        
        course_list = []
        
        if user.get('role') == 'campus_admin':
            # Campus admin: get courses for their campus
            campus_id = user.get('campus_id')
            if not campus_id:
                return jsonify({'success': False, 'message': 'Campus not assigned'}), 400
            
            courses = list(mongo_db.courses.find({'campus_id': ObjectId(campus_id)}))
            
            for course in courses:
                course_list.append({
                    'id': str(course['_id']),
                    'name': course.get('name')
                })
        
        elif user.get('role') == 'course_admin':
            # Course admin: get only their assigned course
            course_id = user.get('course_id')
            if not course_id:
                return jsonify({'success': False, 'message': 'Course not assigned'}), 400
            
            course = mongo_db.courses.find_one({'_id': ObjectId(course_id)})
            if course:
                # Get campus info for this course
                campus = mongo_db.campuses.find_one({'_id': course.get('campus_id')})
                course_list.append({
                    'id': str(course['_id']),
                    'name': course.get('name'),
                    'campus_id': str(course.get('campus_id')),
                    'campus_name': campus.get('name') if campus else 'Unknown Campus'
                })
        
        return jsonify({'success': True, 'data': course_list}), 200
        
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@campus_admin_bp.route('/courses', methods=['POST'])
@jwt_required()
@require_permission(module='course_management', action='create_course')
def create_course():
    """Create a new course for the campus admin's campus"""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)
        
        if not user or user.get('role') not in ['campus_admin', 'course_admin']:
            return jsonify({'success': False, 'message': 'Access denied. Campus or Course Admin required.'}), 403
        
        campus_id = user.get('campus_id')
        data = request.get_json()
        course_name = data.get('course_name')
        
        if not course_name:
            return jsonify({'success': False, 'message': 'Course name is required'}), 400
        
        course = {
            'name': course_name,
            'campus_id': ObjectId(campus_id),
            'created_at': datetime.now(pytz.utc)
        }
        course_id = mongo_db.courses.insert_one(course).inserted_id
        
        return jsonify({'success': True, 'data': {'id': str(course_id)}}), 201
        
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@campus_admin_bp.route('/courses/<course_id>', methods=['PUT'])
@jwt_required()
def edit_course(course_id):
    """Edit a course (only if it belongs to the campus admin's campus)"""
    current_user_id = get_jwt_identity()
    user = mongo_db.find_user_by_id(current_user_id)
    if not user or user.get('role') not in ['campus_admin', 'course_admin']:
        return jsonify({'success': False, 'message': 'Access denied. Campus or Course Admin required.'}), 403
    campus_id = user.get('campus_id')
    course = mongo_db.courses.find_one({'_id': ObjectId(course_id), 'campus_id': ObjectId(campus_id)})
    if not course:
        return jsonify({'success': False, 'message': 'Course not found or not in your campus'}), 404
    data = request.get_json()
    if 'name' in data:
        mongo_db.courses.update_one({'_id': ObjectId(course_id)}, {'$set': {'name': data['name']}})
    if 'admin_email' in data and 'admin_name' in data:
        update_data = {'name': data['admin_name'], 'email': data['admin_email'], 'username': data['admin_name']}
        if 'admin_password' in data and data['admin_password']:
            password_hash = bcrypt.generate_password_hash(data['admin_password']).decode('utf-8')
            update_data['password_hash'] = password_hash
        if course and 'admin_id' in course:
            mongo_db.users.update_one({'_id': course['admin_id']}, {'$set': update_data})
    return jsonify({'success': True, 'message': 'Course updated'}), 200

@campus_admin_bp.route('/courses/<course_id>', methods=['DELETE'])
@jwt_required()
def delete_course(course_id):
    """Delete a course (only if it belongs to the campus admin's campus)"""
    current_user_id = get_jwt_identity()
    user = mongo_db.find_user_by_id(current_user_id)
    if not user or user.get('role') not in ['campus_admin', 'course_admin']:
        return jsonify({'success': False, 'message': 'Access denied. Campus or Course Admin required.'}), 403
    campus_id = user.get('campus_id')
    course = mongo_db.courses.find_one({'_id': ObjectId(course_id), 'campus_id': ObjectId(campus_id)})
    if not course:
        return jsonify({'success': False, 'message': 'Course not found or not in your campus'}), 404
    mongo_db.courses.delete_one({'_id': ObjectId(course_id)})
    return jsonify({'success': True, 'message': 'Course deleted'}), 200 
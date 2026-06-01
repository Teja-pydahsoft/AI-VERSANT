from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from mongo import mongo_db
from routes.access_control import require_permission
from services.org_data_source import use_rds, resolve_user_college_id, resolve_user_course_id, org_meta
from services.rds_org_service import rds_org

course_admin_bp = Blueprint('course_admin', __name__)

@course_admin_bp.route('/dashboard', methods=['GET'])
@jwt_required()
@require_permission(module='dashboard')
def dashboard():
    """Course admin dashboard"""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)
        
        if not user or user.get('role') != 'course_admin':
            return jsonify({
                'success': False,
                'message': 'Access denied'
            }), 403
        
        course_id = user.get('course_id')
        if not course_id:
            return jsonify({
                'success': False,
                'message': 'Course not assigned'
            }), 400
        
        course_num = resolve_user_course_id(user)
        college_id = resolve_user_college_id(user)
        if use_rds() and course_num is not None:
            total_students = rds_org.count_students_for_course(course_num, college_id=college_id)
        else:
            total_students = mongo_db.students.count_documents({'course_id': course_id})
        total_tests = mongo_db.tests.count_documents({'course_id': course_id})
        
        dashboard_data = {
            'course_id': str(course_id),
            'statistics': {
                'total_students': total_students,
                'total_tests': total_tests,
                'total_results': total_tests  # Assuming each test has results
            }
        }
        
        return jsonify({
            'success': True,
            'message': 'Dashboard data retrieved successfully',
            'data': dashboard_data,
            **org_meta(),
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Failed to get dashboard data: {str(e)}'
        }), 500

@course_admin_bp.route('/students', methods=['GET'])
@jwt_required()
@require_permission(module='student_management')
def get_course_students():
    """Get all students in the course admin's course"""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)
        
        if not user or user.get('role') != 'course_admin':
            return jsonify({'success': False, 'message': 'Access denied'}), 403
        
        course_id = user.get('course_id')
        if not course_id:
            return jsonify({'success': False, 'message': 'Course not assigned'}), 400

        course_num = resolve_user_course_id(user)
        college_id = resolve_user_college_id(user)
        if use_rds() and course_num is not None:
            rows, _ = rds_org.list_students(page=1, limit=5000, course_id_num=course_num, college_id=college_id)
            student_list = [
                {
                    'id': s['student_id'],
                    'name': s['name'],
                    'email': s['email'],
                    'roll_number': s['roll_number'],
                    'created_at': s.get('created_at'),
                }
                for s in rows
            ]
            return jsonify({'success': True, 'data': student_list, **org_meta()}), 200
        
        students = list(mongo_db.students.find({'course_id': course_id}))
        student_list = []
        
        for student in students:
            student_list.append({
                'id': str(student['_id']),
                'name': student.get('name'),
                'email': student.get('email'),
                'roll_number': student.get('roll_number'),
                'created_at': student.get('created_at')
            })
        
        return jsonify({'success': True, 'data': student_list}), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Failed to get students: {str(e)}'
        }), 500

@course_admin_bp.route('/progress', methods=['GET'])
@jwt_required()
@require_permission(module='analytics')
def get_student_progress():
    """Get student progress data for the course admin's course"""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)
        
        if not user or user.get('role') != 'course_admin':
            return jsonify({'success': False, 'message': 'Access denied'}), 403
        
        course_id = user.get('course_id')
        if not course_id:
            return jsonify({'success': False, 'message': 'Course not assigned'}), 400
        
        # Get all students in this course
        students = list(mongo_db.students.find({'course_id': course_id}))
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

@course_admin_bp.route('/batches', methods=['GET'])
@jwt_required()
@require_permission(module='batch_management')
def get_batches():
    """List all batches for the course admin's course"""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)
        
        if not user or user.get('role') != 'course_admin':
            return jsonify({'success': False, 'message': 'Access denied'}), 403
        
        course_id = user.get('course_id')
        if not course_id:
            return jsonify({'success': False, 'message': 'Course not assigned'}), 400

        course_num = resolve_user_course_id(user)
        if use_rds() and course_num is not None:
            batch_list = [
                {
                    'id': b['id'],
                    'name': b['name'],
                    'student_count': b.get('student_count', 0),
                }
                for b in rds_org.list_batches(course_id_num=course_num)
            ]
            return jsonify({'success': True, 'data': batch_list, **org_meta()}), 200
        
        batches = list(mongo_db.batches.find({'course_ids': course_id}))
        batch_list = []
        
        for batch in batches:
            student_count = mongo_db.students.count_documents({'batch_id': batch['_id']})
            batch_list.append({
                'id': str(batch['_id']),
                'name': batch['name'],
                'student_count': student_count
            })
        
        return jsonify({'success': True, 'data': batch_list}), 200
        
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500 
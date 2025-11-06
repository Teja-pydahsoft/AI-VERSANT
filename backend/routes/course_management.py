from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from mongo import mongo_db
from bson import ObjectId
import pytz
from datetime import datetime
from config.constants import ROLES
from config.shared import bcrypt
from routes.access_control import require_permission
from utils.email_service import send_email, render_template

course_management_bp = Blueprint('course_management', __name__)

@course_management_bp.route('/', methods=['GET'])
@jwt_required()
@require_permission(module='course_management')
def get_courses():
    """Get all courses"""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)
        
        # Super admin and sub_superadmin can see all courses
        if user.get('role') in ['superadmin', 'sub_superadmin']:
            courses = list(mongo_db.courses.find())
        else:
            # Campus and course admins can only see courses in their campus
            campus_id = user.get('campus_id')
            if not campus_id:
                return jsonify({'success': False, 'message': 'No campus assigned'}), 400
            courses = list(mongo_db.courses.find({'campus_id': ObjectId(campus_id)}))
        
        course_list = []
        for course in courses:
            campus = mongo_db.campuses.find_one({'_id': course.get('campus_id')})
            
            campus_info = {
                'id': str(campus['_id']),
                'name': campus.get('name')
            } if campus else None
            
            course_list.append({
                'id': str(course['_id']),
                'name': course.get('name'),
                'campus': campus_info,
                'created_at': course.get('created_at')
            })
        
        return jsonify({'success': True, 'data': course_list}), 200
        
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@course_management_bp.route('/courses', methods=['GET'])
@jwt_required()
def get_courses_filtered():
    """Get courses filtered by campus_id query parameter"""
    try:
        campus_id = request.args.get('campus_id')
        if not campus_id:
            return jsonify({'success': False, 'message': 'campus_id parameter is required'}), 400
        
        # Fetch courses for the specific campus
        courses = list(mongo_db.courses.find({'campus_id': ObjectId(campus_id)}))
        course_list = [
            {
                'id': str(course['_id']),
                'name': course.get('name'),
                'campus_id': str(course.get('campus_id'))
            }
            for course in courses
        ]
        return jsonify({'success': True, 'data': course_list}), 200
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@course_management_bp.route('/batch/<batch_id>/courses', methods=['GET'])
@jwt_required()
def get_courses_by_batch(batch_id):
    try:
        # Get the batch to find its course_ids
        batch = mongo_db.batches.find_one({'_id': ObjectId(batch_id)})
        if not batch:
            return jsonify({'success': False, 'message': 'Batch not found'}), 404
        
        # Get courses for the batch
        courses = list(mongo_db.courses.find({'_id': {'$in': batch.get('course_ids', [])}}))
        course_list = [
            {
                'id': str(course['_id']),
                'name': course.get('name')
            }
            for course in courses
        ]
        return jsonify({'success': True, 'data': course_list}), 200
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@course_management_bp.route('/<campus_id>', methods=['GET'])
@jwt_required()
def get_courses_by_campus(campus_id):
    try:
        courses = list(mongo_db.courses.find({'campus_id': ObjectId(campus_id)}))
        course_list = [
            {
                'id': str(course['_id']),
                'name': course.get('name')
            }
            for course in courses
        ]
        return jsonify({'success': True, 'data': course_list}), 200
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@course_management_bp.route('/<campus_id>', methods=['POST'])
@jwt_required()
@require_permission(module='course_management', action='create_course')
def create_course(campus_id):
    """Create a new course - SUPER ADMIN AND CAMPUS ADMIN ONLY"""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)
        
        # Check if user has permission to create courses
        if not user or user.get('role') not in ['superadmin', 'sub_superadmin', 'super_admin', 'campus_admin']:
            return jsonify({
                'success': False,
                'message': 'Access denied. Admin privileges required.'
            }), 403
        
        # Campus admin can only create courses in their own campus
        if user.get('role') == 'campus_admin':
            if str(user.get('campus_id')) != campus_id:
                return jsonify({
                    'success': False,
                    'message': 'Access denied. You can only create courses in your own campus.'
                }), 403
        
        data = request.get_json()
        course_name = data.get('course_name')

        if not course_name:
            return jsonify({'success': False, 'message': 'Course name is required'}), 400

        # Create course without admin
        course = {
            'name': course_name,
            'campus_id': ObjectId(campus_id),
            'created_at': datetime.now(pytz.utc)
        }
        course_id = mongo_db.courses.insert_one(course).inserted_id

        return jsonify({
            'success': True,
            'message': 'Course created successfully',
            'data': {
                'course_id': str(course_id)
            }
        }), 201
        
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@course_management_bp.route('/<course_id>', methods=['PUT'])
@jwt_required()
def update_course(course_id):
    try:
        data = request.get_json()
        
        # Update course name
        if 'name' in data:
            mongo_db.courses.update_one({'_id': ObjectId(course_id)}, {'$set': {'name': data['name']}})

        return jsonify({'success': True, 'message': 'Course updated'}), 200
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@course_management_bp.route('/<course_id>', methods=['DELETE'])
@jwt_required()
def delete_course(course_id):
    try:
        result = mongo_db.delete_course(course_id)
        if result.deleted_count == 0:
            return jsonify({'success': False, 'message': 'No course deleted'}), 404
        return jsonify({'success': True, 'message': 'Course deleted'}), 200
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@course_management_bp.route('/<course_id>/batches', methods=['GET'])
@jwt_required()
def get_course_batches(course_id):
    """Get all batches for a specific course."""
    try:
        batches = mongo_db.get_batches_by_course(course_id)
        return jsonify({'success': True, 'data': batches}), 200
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500 
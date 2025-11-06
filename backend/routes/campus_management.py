from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from bson import ObjectId
import pytz
from datetime import datetime
from mongo import mongo_db
from config.constants import ROLES
from config.shared import bcrypt
from routes.access_control import require_permission

campus_management_bp = Blueprint('campus_management', __name__)

@campus_management_bp.route('/', methods=['GET'])
@jwt_required()
@require_permission(module='campus_management')
def get_campuses():
    """Get all campuses"""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)
        
        # Super admin and sub_superadmin can see all campuses
        if user.get('role') in ['superadmin', 'sub_superadmin']:
            campuses = list(mongo_db.campuses.find())
        else:
            # Other admins can only see their assigned campus
            campus_id = user.get('campus_id')
            if not campus_id:
                return jsonify({'success': False, 'message': 'No campus assigned'}), 400
            campuses = list(mongo_db.campuses.find({'_id': ObjectId(campus_id)}))
        
        campus_list = []
        for campus in campuses:
            campus_list.append({
                'id': str(campus['_id']),
                'name': campus.get('name'),
                'created_at': campus.get('created_at')
            })
        
        return jsonify({'success': True, 'data': campus_list}), 200
        
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@campus_management_bp.route('/campuses', methods=['GET'])
@jwt_required()
def get_campuses_simple():
    """Get all campuses (simple format for batch creation)"""
    try:
        campuses = list(mongo_db.campuses.find())
        campus_list = [
            {
                'id': str(campus['_id']),
                'name': campus.get('name')
            }
            for campus in campuses
        ]
        return jsonify({'success': True, 'data': campus_list}), 200
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@campus_management_bp.route('/', methods=['POST'])
@jwt_required()
@require_permission(module='campus_management', action='create_campus')
def create_campus():
    """Create a new campus - SUPER ADMIN ONLY"""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)
        
        # Only super admin and sub_superadmin can create campuses
        if not user or user.get('role') not in ['superadmin', 'sub_superadmin']:
            return jsonify({
                'success': False,
                'message': 'Access denied. Admin privileges required.'
            }), 403
        
        data = request.get_json()
        campus_name = data.get('campus_name')
        
        if not campus_name:
            return jsonify({'success': False, 'message': 'Campus name is required'}), 400

        # Create campus without admin
        campus = {
            'name': campus_name,
            'created_at': datetime.now(pytz.utc)
        }
        campus_id = mongo_db.campuses.insert_one(campus).inserted_id
        
        return jsonify({
            'success': True,
            'message': 'Campus created successfully',
            'data': {
                'campus_id': str(campus_id)
            }
        }), 201
        
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@campus_management_bp.route('/<campus_id>', methods=['PUT'])
@jwt_required()
def update_campus(campus_id):
    """Update a campus name"""
    try:
        data = request.get_json()
        
        # Update campus name
        if 'name' in data:
            mongo_db.campuses.update_one({'_id': ObjectId(campus_id)}, {'$set': {'name': data['name']}})

        return jsonify({'success': True, 'message': 'Campus updated successfully'}), 200
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@campus_management_bp.route('/<campus_id>/details', methods=['GET'])
@jwt_required()
def get_campus_details(campus_id):
    """Get details for a campus including course and student counts."""
    try:
        campus_object_id = ObjectId(campus_id)
        
        # Count courses associated with the campus
        course_count = mongo_db.courses.count_documents({'campus_id': campus_object_id})
        
        # Count students associated with the campus
        student_count = mongo_db.users.count_documents({'campus_id': campus_object_id, 'role': ROLES['STUDENT']})
        
        return jsonify({
            'success': True,
            'data': {
                'course_count': course_count,
                'student_count': student_count
            }
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'message': f'An error occurred: {str(e)}'}), 500

@campus_management_bp.route('/<campus_id>', methods=['DELETE'])
@jwt_required()
def delete_campus(campus_id):
    """Delete a campus and all associated data"""
    try:
        result = mongo_db.delete_campus(campus_id)
        if not result.get('success'):
            return jsonify({'success': False, 'message': result.get('message', 'Failed to delete campus')}), 404
        
        if result.get('deleted_count', 0) == 0:
            return jsonify({'success': False, 'message': 'Campus not found or already deleted'}), 404

        return jsonify({'success': True, 'message': 'Campus and all associated data deleted successfully'}), 200
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@campus_management_bp.route('/<campus_id>/courses', methods=['GET'])
@jwt_required()
def get_campus_courses(campus_id):
    """Get all courses for a specific campus."""
    try:
        courses = mongo_db.get_courses_by_campus(campus_id)
        return jsonify({'success': True, 'data': courses}), 200
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500 
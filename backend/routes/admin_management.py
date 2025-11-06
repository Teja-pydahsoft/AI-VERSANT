from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from bson import ObjectId
from mongo import mongo_db
from config.shared import bcrypt
from config.constants import ROLES
from datetime import datetime
import pytz
from utils.email_service import send_email, render_template
from routes.access_control import require_permission

admin_management_bp = Blueprint('admin_management', __name__)

@admin_management_bp.route('/create', methods=['POST'])
@jwt_required()
@require_permission(module='admin_permissions')
def create_admin():
    """Create a new admin user - SUPER ADMIN ONLY"""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)
        
        # Only super admin and sub_superadmin can create admins
        if not user or user.get('role') not in ['superadmin', 'sub_superadmin']:
            return jsonify({
                'success': False,
                'message': 'Access denied. Admin privileges required.'
            }), 403
        
        data = request.get_json()
        admin_name = data.get('name')
        admin_email = data.get('email')
        admin_password = data.get('password')
        admin_role = data.get('role')
        campus_id = data.get('campus_id')
        course_id = data.get('course_id')
        
        # Validate required fields
        if not all([admin_name, admin_email, admin_password, admin_role]):
            return jsonify({
                'success': False,
                'message': 'All fields are required'
            }), 400
        
        # Validate role
        if admin_role not in ['campus_admin', 'course_admin']:
            return jsonify({
                'success': False,
                'message': 'Invalid admin role'
            }), 400
        
        # Note: Email duplicates are now allowed at database level
        # We can log a warning but don't prevent admin creation
        if mongo_db.users.find_one({'email': admin_email}):
            current_app.logger.warning(f"⚠️ Admin email {admin_email} already exists for another user, but allowing duplicate")
        
        # Validate campus/course assignments
        if admin_role == 'campus_admin':
            if not campus_id:
                return jsonify({
                    'success': False,
                    'message': 'Campus ID is required for campus admin'
                }), 400
            
            # Verify campus exists
            campus = mongo_db.campuses.find_one({'_id': ObjectId(campus_id)})
            if not campus:
                return jsonify({
                    'success': False,
                    'message': 'Campus not found'
                }), 404
        
        elif admin_role == 'course_admin':
            if not course_id:
                return jsonify({
                    'success': False,
                    'message': 'Course ID is required for course admin'
                }), 400
            
            # Verify course exists
            course = mongo_db.courses.find_one({'_id': ObjectId(course_id)})
            if not course:
                return jsonify({
                    'success': False,
                    'message': 'Course not found'
                }), 404
        
        # Hash password
        password_hash = bcrypt.generate_password_hash(admin_password).decode('utf-8')
        
        # Create admin user
        admin_user = {
            'name': admin_name,
            'email': admin_email,
            'username': admin_name,
            'password_hash': password_hash,
            'role': admin_role,
            'is_active': True,
            'created_at': datetime.now(pytz.utc)
        }
        
        # Add campus/course assignments
        if admin_role == 'campus_admin':
            admin_user['campus_id'] = ObjectId(campus_id)
        elif admin_role == 'course_admin':
            admin_user['course_id'] = ObjectId(course_id)
            # Get campus_id from course
            course = mongo_db.courses.find_one({'_id': ObjectId(course_id)})
            if course and 'campus_id' in course:
                admin_user['campus_id'] = course['campus_id']
        
        # Insert admin user
        user_id = mongo_db.users.insert_one(admin_user).inserted_id
        
        # Send welcome email with credentials
        try:
            # Get campus/course information for the email
            campus_name = "N/A"
            course_name = "N/A"
            
            if admin_role == 'campus_admin' and campus_id:
                campus = mongo_db.campuses.find_one({'_id': ObjectId(campus_id)})
                if campus:
                    campus_name = campus.get('name', 'Unknown Campus')
            elif admin_role == 'course_admin' and course_id:
                course = mongo_db.courses.find_one({'_id': ObjectId(course_id)})
                if course:
                    course_name = course.get('name', 'Unknown Course')
                    # Also get campus name for course admin
                    if course.get('campus_id'):
                        campus = mongo_db.campuses.find_one({'_id': course['campus_id']})
                        if campus:
                            campus_name = campus.get('name', 'Unknown Campus')
            
            # Console logging for verification
            print(f"📧 Sending admin credentials email:")
            print(f"   Admin: {admin_name} ({admin_email})")
            print(f"   Role: {admin_role}")
            print(f"   Username: {admin_name}")
            print(f"   Password: {admin_password}")
            print(f"   Campus: {campus_name}")
            print(f"   Course: {course_name}")
            
            template_name = 'campus_admin_credentials.html' if admin_role == 'campus_admin' else 'course_admin_credentials.html'
            html_content = render_template(
                template_name,
                params={
                    'name': admin_name,
                    'username': admin_name,
                    'email': admin_email,
                    'password': admin_password,
                    'login_url': "https://crt.pydahsoft.in/login",
                    'campus_name': campus_name,
                    'course_name': course_name
                }
            )
            
            send_email(
                to_email=admin_email,
                to_name=admin_name,
                subject=f"Welcome to Study Edge - Your {admin_role.replace('_', ' ').title()} Credentials",
                html_content=html_content
            )
            
            print(f"✅ Admin credentials email sent successfully to {admin_email}")
            
        except Exception as e:
            print(f"❌ Failed to send welcome email to {admin_email}: {e}")
            # Don't fail the admin creation if email fails
        
        return jsonify({
            'success': True,
            'message': f'{admin_role.replace("_", " ").title()} created successfully',
            'data': {
                'admin_id': str(user_id),
                'admin_name': admin_name,
                'admin_email': admin_email,
                'admin_role': admin_role
            }
        }), 201
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Failed to create admin: {str(e)}'
        }), 500

@admin_management_bp.route('/list', methods=['GET'])
@jwt_required()
@require_permission(module='admin_permissions')
def list_admins():
    """Get list of all admins - SUPER ADMIN ONLY"""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)
        
        # Only super admin and sub_superadmin can access admin list
        if not user or user.get('role') not in ['superadmin', 'sub_superadmin']:
            return jsonify({
                'success': False,
                'message': 'Access denied. Admin privileges required.'
            }), 403
        
        # Get all admins
        admins = list(mongo_db.users.find({
            'role': {'$in': ['campus_admin', 'course_admin']}
        }))
        
        admin_list = []
        for admin in admins:
            admin_data = {
                'id': str(admin['_id']),
                'name': admin.get('name'),
                'email': admin.get('email'),
                'role': admin.get('role'),
                'is_active': admin.get('is_active', True),
                'created_at': admin.get('created_at')
            }
            
            # Add campus/course information
            if admin.get('campus_id'):
                campus = mongo_db.campuses.find_one({'_id': admin['campus_id']})
                if campus:
                    admin_data['campus_name'] = campus.get('name')
            
            if admin.get('course_id'):
                course = mongo_db.courses.find_one({'_id': admin['course_id']})
                if course:
                    admin_data['course_name'] = course.get('name')
            
            admin_list.append(admin_data)
        
        return jsonify({
            'success': True,
            'data': admin_list
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Failed to get admin list: {str(e)}'
        }), 500

@admin_management_bp.route('/<admin_id>', methods=['DELETE'])
@jwt_required()
@require_permission(module='admin_permissions')
def delete_admin(admin_id):
    """Delete an admin user - SUPER ADMIN ONLY"""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)
        
        # Only super admin and sub_superadmin can delete admins
        if not user or user.get('role') not in ['superadmin', 'sub_superadmin']:
            return jsonify({
                'success': False,
                'message': 'Access denied. Admin privileges required.'
            }), 403
        
        # Validate admin_id format
        try:
            admin_object_id = ObjectId(admin_id)
        except Exception:
            return jsonify({
                'success': False,
                'message': 'Invalid admin ID format'
            }), 400
        
        # Check if admin exists
        admin = mongo_db.users.find_one({'_id': admin_object_id})
        if not admin:
            return jsonify({
                'success': False,
                'message': 'Admin not found'
            }), 404
        
        # Prevent deletion of super admin
        if admin.get('role') == 'superadmin':
            return jsonify({
                'success': False,
                'message': 'Cannot delete super admin account'
            }), 403
        
        # Log the deletion for audit purposes
        admin_name = admin.get('name', 'Unknown')
        admin_email = admin.get('email', 'Unknown')
        admin_role = admin.get('role', 'Unknown')
        
        print(f"🗑️ Deleting admin: {admin_name} ({admin_email}) - Role: {admin_role}")
        
        # Delete admin
        result = mongo_db.users.delete_one({'_id': admin_object_id})
        
        if result.deleted_count == 0:
            return jsonify({
                'success': False,
                'message': 'Failed to delete admin'
            }), 500
        
        print(f"✅ Admin deleted successfully: {admin_name}")
        
        return jsonify({
            'success': True,
            'message': f'Admin {admin_name} deleted successfully'
        }), 200
        
    except Exception as e:
        print(f"❌ Error deleting admin: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to delete admin: {str(e)}'
        }), 500 
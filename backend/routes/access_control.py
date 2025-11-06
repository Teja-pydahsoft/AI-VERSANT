from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from bson import ObjectId
from mongo import mongo_db
from config.constants import ROLES, MODULES
from datetime import datetime
import pytz
import functools

access_control_bp = Blueprint('access_control', __name__)

# Define available modules and features for admin access control
ADMIN_MODULES = {
    'dashboard': 'Dashboard',
    'campus_management': 'Campus Management',
    'course_management': 'Course Management',
    'batch_management': 'Batch Management',
    'student_management': 'Student Management',
    'test_management': 'Test Management',
    'question_bank_upload': 'Question Bank Upload',
    'crt_upload': 'CRT Upload',
    'results_management': 'Results Management',
    'analytics': 'Analytics',
    'reports': 'Reports',
    'admin_permissions': 'Admin Permissions',
    'sub_superadmin_management': 'Sub Superadmin Management'
}

# Default permissions for each admin role
DEFAULT_PERMISSIONS = {
    'super_admin': {
        'modules': list(ADMIN_MODULES.keys()),  # All modules including sub_superadmin_management
        'can_create_campus': True,
        'can_create_course': True,
        'can_create_batch': True,
        'can_manage_users': True,
        'can_manage_tests': True,
        'can_upload_tests': True,
        'can_upload_questions': True,
        'can_view_all_data': True,
        'can_manage_sub_superadmins': True
    },
    'campus_admin': {
        'modules': ['dashboard', 'course_management', 'batch_management', 'student_management', 'test_management', 'question_bank_upload', 'crt_upload', 'results_management', 'analytics', 'reports'],
        'can_create_campus': False,
        'can_create_course': True,
        'can_create_batch': True,
        'can_manage_users': True,
        'can_manage_tests': True,
        'can_upload_tests': False,  # Requires super admin permission
        'can_upload_questions': False,  # Requires super admin permission
        'can_view_all_data': False
    },
    'course_admin': {
        'modules': ['dashboard', 'course_management', 'batch_management', 'student_management', 'test_management', 'question_bank_upload', 'crt_upload', 'results_management', 'analytics', 'reports'],
        'can_create_campus': False,
        'can_create_course': False,
        'can_create_batch': True,
        'can_manage_users': True,
        'can_manage_tests': True,
        'can_upload_tests': False,  # Requires super admin permission
        'can_upload_questions': False,  # Requires super admin permission
        'can_view_all_data': False
    }
}

def require_permission(module=None, action=None):
    """Decorator to check if user has permission for a specific module/action"""
    def decorator(f):
        @functools.wraps(f)
        def decorated_function(*args, **kwargs):
            current_user_id = get_jwt_identity()
            user = mongo_db.find_user_by_id(current_user_id)

            if not user:
                return jsonify({
                    'success': False,
                    'message': 'User not found'
                }), 404

            # Debug logging
            print(f"Access control check - User role: {user.get('role')}")
            print(f"Module required: {module}")
            print(f"Action required: {action}")

            # Super admin and sub_superadmin have all permissions at backend level
            user_role = user.get('role', '').lower()

            if user_role == 'superadmin':
                print("Super admin access granted")
                return f(*args, **kwargs)
            
            if user_role == 'sub_superadmin':
                print("Sub-superadmin access granted (backend allows all, frontend controls UI)")
                return f(*args, **kwargs)

            # Check permissions for other admin roles
            permissions = user.get('permissions', DEFAULT_PERMISSIONS.get(user.get('role'), {}))

            has_permission = True

            # Check module permission
            if module and module not in permissions.get('modules', []):
                has_permission = False

            # Check specific action permission
            if action and has_permission:
                action_key = f'can_{action}'
                if action_key in permissions:
                    has_permission = permissions[action_key]

            if not has_permission:
                return jsonify({
                    'success': False,
                    'message': f'Access denied. You do not have permission to access {module or "this resource"}.'
                }), 403

            return f(*args, **kwargs)
        return decorated_function
    return decorator

@access_control_bp.route('/modules', methods=['GET'])
@jwt_required()
def get_available_modules():
    """Get all available modules for access control"""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)
        
        if not user or user.get('role') != 'superadmin':
            return jsonify({
                'success': False,
                'message': 'Access denied. Super admin privileges required.'
            }), 403
        
        return jsonify({
            'success': True,
            'data': ADMIN_MODULES
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Failed to get modules: {str(e)}'
        }), 500

@access_control_bp.route('/permissions/<admin_id>', methods=['GET'])
@jwt_required()
def get_admin_permissions(admin_id):
    """Get permissions for a specific admin"""
    try:
        current_user_id = get_jwt_identity()
        current_user = mongo_db.find_user_by_id(current_user_id)
        
        # Check if user is superadmin or has sub superadmin management permission
        if current_user.get('role') != 'superadmin':
            from models import SubSuperadmin
            if not SubSuperadmin.has_permission(current_user_id, 'sub_superadmin_management', 'write'):
                return jsonify({
                    'success': False,
                    'message': 'Access denied. Super admin privileges required.'
                }), 403
        
        admin = mongo_db.users.find_one({'_id': ObjectId(admin_id)})
        if not admin:
            return jsonify({
                'success': False,
                'message': 'Admin not found'
            }), 404
        
        # Get current permissions or use defaults
        permissions = admin.get('permissions', DEFAULT_PERMISSIONS.get(admin.get('role'), {}))
        
        return jsonify({
            'success': True,
            'data': {
                'admin_id': str(admin['_id']),
                'admin_name': admin.get('name'),
                'admin_email': admin.get('email'),
                'admin_role': admin.get('role'),
                'permissions': permissions,
                'available_modules': ADMIN_MODULES
            }
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Failed to get permissions: {str(e)}'
        }), 500

@access_control_bp.route('/permissions/<admin_id>', methods=['PUT'])
@jwt_required()
def update_admin_permissions(admin_id):
    """Update permissions for a specific admin"""
    try:
        current_user_id = get_jwt_identity()
        current_user = mongo_db.find_user_by_id(current_user_id)
        
        # Check if user is superadmin or has sub superadmin management permission
        if current_user.get('role') != 'superadmin':
            try:
                # Import here to avoid circular imports
                import sys
                import os
                current_dir = os.path.dirname(os.path.abspath(__file__))
                parent_dir = os.path.dirname(current_dir)
                sys.path.append(parent_dir)

                from models import SubSuperadmin
                if not SubSuperadmin.has_permission(current_user_id, 'sub_superadmin_management', 'write'):
                    return jsonify({
                        'success': False,
                        'message': 'Access denied. Super admin privileges required.'
                    }), 403
            except (ImportError, Exception) as e:
                print(f"Warning: Could not check sub superadmin permissions: {e}")
                return jsonify({
                    'success': False,
                    'message': 'Access denied. Super admin privileges required.'
                }), 403
        
        admin = mongo_db.users.find_one({'_id': ObjectId(admin_id)})
        if not admin:
            return jsonify({
                'success': False,
                'message': 'Admin not found'
            }), 404
        
        data = request.get_json()
        new_permissions = data.get('permissions', {})
        
        # Validate permissions
        if 'modules' in new_permissions:
            for module in new_permissions['modules']:
                if module not in ADMIN_MODULES:
                    return jsonify({
                        'success': False,
                        'message': f'Invalid module: {module}'
                    }), 400
        
        # Update admin permissions
        mongo_db.users.update_one(
            {'_id': ObjectId(admin_id)},
            {'$set': {'permissions': new_permissions, 'permissions_updated_at': datetime.now(pytz.utc)}}
        )
        
        return jsonify({
            'success': True,
            'message': 'Permissions updated successfully'
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Failed to update permissions: {str(e)}'
        }), 500

@access_control_bp.route('/admins', methods=['GET'])
@jwt_required()
def get_all_admins_with_permissions():
    """Get all admins with their permissions"""
    try:
        current_user_id = get_jwt_identity()
        current_user = mongo_db.find_user_by_id(current_user_id)
        
        # Check if user is superadmin or has sub superadmin management permission
        if current_user.get('role') != 'superadmin':
            from models import SubSuperadmin
            if not SubSuperadmin.has_permission(current_user_id, 'sub_superadmin_management', 'write'):
                return jsonify({
                    'success': False,
                    'message': 'Access denied. Super admin privileges required.'
                }), 403
        
        # Get all admins
        admins = list(mongo_db.users.find({
            'role': {'$in': ['campus_admin', 'course_admin']}
        }))
        
        admin_list = []
        for admin in admins:
            permissions = admin.get('permissions', DEFAULT_PERMISSIONS.get(admin.get('role'), {}))
            admin_list.append({
                'id': str(admin['_id']),
                'name': admin.get('name'),
                'email': admin.get('email'),
                'role': admin.get('role'),
                'campus_id': str(admin.get('campus_id', '')),
                'course_id': str(admin.get('course_id', '')),
                'permissions': permissions,
                'created_at': admin.get('created_at'),
                'permissions_updated_at': admin.get('permissions_updated_at')
            })
        
        return jsonify({
            'success': True,
            'data': admin_list
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Failed to get admins: {str(e)}'
        }), 500

@access_control_bp.route('/check-permission', methods=['POST'])
@jwt_required()
def check_permission():
    """Check if current user has permission for a specific module/action"""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)
        
        if not user:
            return jsonify({
                'success': False,
                'message': 'User not found'
            }), 404
        
        data = request.get_json()
        module = data.get('module')
        action = data.get('action')
        
        if not module:
            return jsonify({
                'success': False,
                'message': 'Module is required'
            }), 400
        
        # Super admin has all permissions
        if user.get('role') == 'superadmin':
            return jsonify({
                'success': True,
                'data': {'has_permission': True}
            }), 200

        # Check if user is a sub superadmin and has the required permission
        from models import SubSuperadmin
        sub_superadmin_permissions = SubSuperadmin.get_user_permissions(current_user_id)

        if sub_superadmin_permissions:
            has_permission = SubSuperadmin.has_permission(current_user_id, module, action or 'read')
            return jsonify({
                'success': True,
                'data': {'has_permission': has_permission}
            }), 200

        # Check permissions for other admin roles
        permissions = user.get('permissions', DEFAULT_PERMISSIONS.get(user.get('role'), {}))

        has_permission = False
        if module in permissions.get('modules', []):
            has_permission = True

        # Check specific action permissions
        if action:
            action_key = f'can_{action}'
            if action_key in permissions:
                has_permission = has_permission and permissions[action_key]

        return jsonify({
            'success': True,
            'data': {'has_permission': has_permission}
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Failed to check permission: {str(e)}'
        }), 500

@access_control_bp.route('/reset-permissions/<admin_id>', methods=['POST'])
@jwt_required()
def reset_admin_permissions(admin_id):
    """Reset admin permissions to default for their role"""
    try:
        current_user_id = get_jwt_identity()
        current_user = mongo_db.find_user_by_id(current_user_id)
        
        # Check if user is superadmin or has sub superadmin management permission
        if current_user.get('role') != 'superadmin':
            from models import SubSuperadmin
            if not SubSuperadmin.has_permission(current_user_id, 'sub_superadmin_management', 'write'):
                return jsonify({
                    'success': False,
                    'message': 'Access denied. Super admin privileges required.'
                }), 403
        
        admin = mongo_db.users.find_one({'_id': ObjectId(admin_id)})
        if not admin:
            return jsonify({
                'success': False,
                'message': 'Admin not found'
            }), 404
        
        admin_role = admin.get('role')
        default_permissions = DEFAULT_PERMISSIONS.get(admin_role, {})
        
        # Reset to default permissions
        mongo_db.users.update_one(
            {'_id': ObjectId(admin_id)},
            {'$set': {'permissions': default_permissions, 'permissions_updated_at': datetime.now(pytz.utc)}}
        )
        
        return jsonify({
            'success': True,
            'message': 'Permissions reset to default successfully'
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Failed to reset permissions: {str(e)}'
        }), 500

@access_control_bp.route('/debug-user', methods=['GET'])
@jwt_required()
def debug_user():
    """Debug endpoint to check current user's role and permissions"""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)
        
        if not user:
            return jsonify({
                'success': False,
                'message': 'User not found'
            }), 404
        
        return jsonify({
            'success': True,
            'data': {
                'user_id': str(current_user_id),
                'role': user.get('role'),
                'username': user.get('username'),
                'permissions': user.get('permissions', {}),
                'role_lower': user.get('role', '').lower(),
                'is_super_admin': user.get('role') == 'superadmin'
            }
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Debug error: {str(e)}'
        }), 500 
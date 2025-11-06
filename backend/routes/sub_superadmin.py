"""
Sub Superadmin Management Routes - REDESIGNED
Complete user creation with sub-roles system
"""

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from bson import ObjectId
from datetime import datetime
from mongo import mongo_db
from models import SubSuperadmin, SubRole
from routes.access_control import require_permission

sub_superadmin_bp = Blueprint('sub_superadmin', __name__)

# ============================================================================
# SUB-ROLE MANAGEMENT ENDPOINTS
# ============================================================================

@sub_superadmin_bp.route('/sub-roles', methods=['GET'])
@jwt_required()
@require_permission('sub_superadmin_management')
def get_sub_roles():
    """Get all sub-roles"""
    try:
        roles = SubRole.get_all_sub_roles()
        
        return jsonify({
            'success': True,
            'data': {
                'roles': roles,
                'total': len(roles)
            }
        }), 200
    
    except Exception as e:
        current_app.logger.error(f"Error getting sub-roles: {e}")
        return jsonify({
            'success': False,
            'message': f'Error getting sub-roles: {str(e)}'
        }), 500

@sub_superadmin_bp.route('/sub-roles', methods=['POST'])
@jwt_required()
@require_permission('sub_superadmin_management')
def create_sub_role():
    """Create a new sub-role with permissions"""
    try:
        current_user_id = get_jwt_identity()
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'message': 'Request data is required'
            }), 400
        
        required_fields = ['name', 'permissions']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'success': False,
                    'message': f'{field} is required'
                }), 400
        
        name = data['name']
        description = data.get('description', '')
        permissions = data['permissions']
        
        # Validate permissions structure
        if not isinstance(permissions, dict):
            return jsonify({
                'success': False,
                'message': 'Permissions must be a dictionary'
            }), 400
        
        # Create sub-role
        role_id = SubRole.create_sub_role(
            name=name,
            description=description,
            permissions=permissions,
            created_by=current_user_id
        )
        
        current_app.logger.info(f"Sub-role created: {name} ({role_id}) by {current_user_id}")
        
        return jsonify({
            'success': True,
            'message': 'Sub-role created successfully',
            'data': {
                'role_id': role_id,
                'name': name,
                'description': description
            }
        }), 201
    
    except Exception as e:
        current_app.logger.error(f"Error creating sub-role: {e}")
        return jsonify({
            'success': False,
            'message': f'Error creating sub-role: {str(e)}'
        }), 500

@sub_superadmin_bp.route('/sub-roles/<role_id>', methods=['GET'])
@jwt_required()
@require_permission('sub_superadmin_management')
def get_sub_role(role_id):
    """Get specific sub-role details"""
    try:
        role = SubRole.get_sub_role(role_id)
        
        if not role:
            return jsonify({
                'success': False,
                'message': 'Sub-role not found'
            }), 404
        
        return jsonify({
            'success': True,
            'data': role
        }), 200
    
    except Exception as e:
        current_app.logger.error(f"Error getting sub-role: {e}")
        return jsonify({
            'success': False,
            'message': f'Error getting sub-role: {str(e)}'
        }), 500

@sub_superadmin_bp.route('/sub-roles/<role_id>', methods=['PUT'])
@jwt_required()
@require_permission('sub_superadmin_management')
def update_sub_role(role_id):
    """Update sub-role"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'message': 'Request data is required'
            }), 400
        
        name = data.get('name')
        description = data.get('description')
        permissions = data.get('permissions')
        
        result = SubRole.update_sub_role(
            role_id=role_id,
            name=name,
            description=description,
            permissions=permissions
        )
        
        if result:
            current_app.logger.info(f"Sub-role updated: {role_id}")
            return jsonify({
                'success': True,
                'message': 'Sub-role updated successfully'
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': 'Sub-role not found or update failed'
            }), 404
    
    except Exception as e:
        current_app.logger.error(f"Error updating sub-role: {e}")
        return jsonify({
            'success': False,
            'message': f'Error updating sub-role: {str(e)}'
        }), 500

@sub_superadmin_bp.route('/sub-roles/<role_id>', methods=['DELETE'])
@jwt_required()
@require_permission('sub_superadmin_management')
def delete_sub_role(role_id):
    """Delete sub-role"""
    try:
        # Check if any sub-superadmins are using this role
        users_with_role = mongo_db.db.users.count_documents({
            'role': 'sub_superadmin',
            'sub_role_id': role_id,
            'is_active': True
        })
        
        if users_with_role > 0:
            return jsonify({
                'success': False,
                'message': f'Cannot delete role. {users_with_role} sub-superadmin(s) are using this role.'
            }), 400
        
        result = SubRole.delete_sub_role(role_id)
        
        if result:
            current_app.logger.info(f"Sub-role deleted: {role_id}")
            return jsonify({
                'success': True,
                'message': 'Sub-role deleted successfully'
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': 'Sub-role not found'
            }), 404
    
    except Exception as e:
        current_app.logger.error(f"Error deleting sub-role: {e}")
        return jsonify({
            'success': False,
            'message': f'Error deleting sub-role: {str(e)}'
        }), 500

# ============================================================================
# SUB-SUPERADMIN USER MANAGEMENT ENDPOINTS
# ============================================================================

@sub_superadmin_bp.route('/create', methods=['POST'])
@jwt_required()
@require_permission('sub_superadmin_management')
def create_sub_superadmin():
    """Create a new sub-superadmin user with complete profile and custom permissions"""
    try:
        current_user_id = get_jwt_identity()
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'message': 'Request data is required'
            }), 400
        
        required_fields = ['name', 'email', 'phone', 'username', 'password', 'role_name', 'permissions']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'success': False,
                    'message': f'{field} is required'
                }), 400
        
        name = data['name']
        email = data['email']
        phone = data['phone']
        username = data['username']
        password = data['password']
        role_name = data['role_name']  # Can be custom or from template
        permissions = data['permissions']  # Always provided
        
        # Validate permissions structure
        if not isinstance(permissions, dict):
            return jsonify({
                'success': False,
                'message': 'Permissions must be a dictionary'
            }), 400
        
        # Check if username already exists
        existing_user = mongo_db.db.users.find_one({'username': username})
        if existing_user:
            return jsonify({
                'success': False,
                'message': 'Username already exists'
            }), 400
        
        # Check if email already exists
        existing_email = mongo_db.db.users.find_one({'email': email})
        if existing_email:
            return jsonify({
                'success': False,
                'message': 'Email already exists'
            }), 400
        
        # Create sub-superadmin user with custom role and permissions
        user_id = SubSuperadmin.create_sub_superadmin_user_with_permissions(
            name=name,
            email=email,
            phone=phone,
            username=username,
            password=password,
            role_name=role_name,
            permissions=permissions,
            created_by=current_user_id
        )
        
        current_app.logger.info(f"Sub-superadmin created: {name} ({user_id}) with role '{role_name}' by {current_user_id}")
        
        return jsonify({
            'success': True,
            'message': 'Sub-superadmin created successfully',
            'data': {
                'user_id': user_id,
                'name': name,
                'username': username,
                'email': email,
                'phone': phone,
                'role_name': role_name
            }
        }), 201
    
    except Exception as e:
        current_app.logger.error(f"Error creating sub-superadmin: {e}")
        return jsonify({
            'success': False,
            'message': f'Error creating sub-superadmin: {str(e)}'
        }), 500

@sub_superadmin_bp.route('/list', methods=['GET'])
@jwt_required()
@require_permission('sub_superadmin_management')
def list_sub_superadmins():
    """Get all sub-superadmins"""
    try:
        sub_superadmins = SubSuperadmin.get_all_sub_superadmins()
        
        return jsonify({
            'success': True,
            'data': {
                'sub_superadmins': sub_superadmins,
                'total': len(sub_superadmins)
            }
        }), 200
    
    except Exception as e:
        current_app.logger.error(f"Error listing sub-superadmins: {e}")
        return jsonify({
            'success': False,
            'message': f'Error listing sub-superadmins: {str(e)}'
        }), 500

@sub_superadmin_bp.route('/templates', methods=['GET'])
@jwt_required()
@require_permission('sub_superadmin_management')
def get_permission_templates():
    """Get permission templates for sub-superadmin creation"""
    try:
        templates = [
            {
                'id': 'full_access',
                'name': 'Full Access',
                'description': 'Complete access to all modules',
                'permissions': {
                    'campus_management': 'write',
                    'course_management': 'write',
                    'batch_management': 'write',
                    'student_management': 'write',
                    'test_management': 'write',
                    'question_bank_upload': 'write',
                    'crt_upload': 'write',
                    'results_management': 'write',
                    'analytics': 'write',
                    'admin_permissions': 'write',
                    'sub_superadmin_management': 'write',
                    'notification_settings': 'write',
                    'global_settings': 'write',
                    'form_management': 'write',
                }
            },
            {
                'id': 'read_only',
                'name': 'Read Only',
                'description': 'View-only access to all modules',
                'permissions': {
                    'campus_management': 'read',
                    'course_management': 'read',
                    'batch_management': 'read',
                    'student_management': 'read',
                    'test_management': 'read',
                    'question_bank_upload': 'read',
                    'crt_upload': 'read',
                    'results_management': 'read',
                    'analytics': 'read',
                    'admin_permissions': 'read',
                    'sub_superadmin_management': 'none',
                    'notification_settings': 'read',
                    'global_settings': 'read',
                    'form_management': 'read',
                }
            },
            {
                'id': 'academic_manager',
                'name': 'Academic Manager',
                'description': 'Manage courses, batches, students, and tests',
                'permissions': {
                    'campus_management': 'read',
                    'course_management': 'write',
                    'batch_management': 'write',
                    'student_management': 'write',
                    'test_management': 'write',
                    'question_bank_upload': 'write',
                    'crt_upload': 'write',
                    'results_management': 'write',
                    'analytics': 'read',
                    'admin_permissions': 'none',
                    'sub_superadmin_management': 'none',
                    'notification_settings': 'none',
                    'global_settings': 'none',
                    'form_management': 'read',
                }
            },
            {
                'id': 'content_manager',
                'name': 'Content Manager',
                'description': 'Manage test content and question banks',
                'permissions': {
                    'campus_management': 'none',
                    'course_management': 'read',
                    'batch_management': 'read',
                    'student_management': 'read',
                    'test_management': 'write',
                    'question_bank_upload': 'write',
                    'crt_upload': 'write',
                    'results_management': 'read',
                    'analytics': 'read',
                    'admin_permissions': 'none',
                    'sub_superadmin_management': 'none',
                    'notification_settings': 'none',
                    'global_settings': 'none',
                    'form_management': 'write',
                }
            },
            {
                'id': 'custom',
                'name': 'Custom',
                'description': 'Create custom permissions',
                'permissions': {}
            }
        ]
        
        return jsonify({
            'success': True,
            'data': {
                'templates': templates,
                'total': len(templates)
            }
        }), 200
    
    except Exception as e:
        current_app.logger.error(f"Error getting permission templates: {e}")
        return jsonify({
            'success': False,
            'message': f'Error getting templates: {str(e)}'
        }), 500

@sub_superadmin_bp.route('/<user_id>', methods=['GET'])
@jwt_required()
@require_permission('sub_superadmin_management')
def get_sub_superadmin(user_id):
    """Get specific sub-superadmin details"""
    try:
        # Validate ObjectId
        try:
            ObjectId(user_id)
        except Exception:
            return jsonify({
                'success': False,
                'message': 'Invalid user ID format'
            }), 400
        
        sub_superadmin = SubSuperadmin.get_sub_superadmin(user_id)
        
        if not sub_superadmin:
            return jsonify({
                'success': False,
                'message': 'Sub-superadmin not found'
            }), 404
        
        # Convert ObjectId to string
        sub_superadmin['_id'] = str(sub_superadmin['_id'])
        
        # Get sub-role details
        if 'sub_role_id' in sub_superadmin:
            sub_role = SubRole.get_sub_role(sub_superadmin['sub_role_id'])
            if sub_role:
                sub_superadmin['sub_role'] = sub_role
        
        return jsonify({
            'success': True,
            'data': sub_superadmin
        }), 200
    
    except Exception as e:
        current_app.logger.error(f"Error getting sub-superadmin: {e}")
        return jsonify({
            'success': False,
            'message': f'Error getting sub-superadmin: {str(e)}'
        }), 500

@sub_superadmin_bp.route('/<user_id>', methods=['PUT'])
@jwt_required()
@require_permission('sub_superadmin_management')
def update_sub_superadmin(user_id):
    """Update sub-superadmin user profile"""
    try:
        # Validate ObjectId
        try:
            ObjectId(user_id)
        except Exception:
            return jsonify({
                'success': False,
                'message': 'Invalid user ID format'
            }), 400
        
        current_user_id = get_jwt_identity()
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'message': 'Request data is required'
            }), 400
        
        # Verify user exists and is a sub-superadmin
        user = mongo_db.db.users.find_one({'_id': ObjectId(user_id)})
        if not user:
            return jsonify({
                'success': False,
                'message': 'User not found'
            }), 404
        
        if user.get('role') != 'sub_superadmin':
            return jsonify({
                'success': False,
                'message': 'User is not a sub-superadmin'
            }), 400
        
        # Prepare update data
        update_data = {}
        
        # Update basic fields if provided
        if 'name' in data:
            update_data['name'] = data['name']
        if 'email' in data:
            # Check if email is already used by another user
            existing_email = mongo_db.db.users.find_one({
                'email': data['email'],
                '_id': {'$ne': ObjectId(user_id)}
            })
            if existing_email:
                return jsonify({
                    'success': False,
                    'message': 'Email already exists'
                }), 400
            update_data['email'] = data['email']
        if 'phone' in data:
            update_data['phone'] = data['phone']
        if 'username' in data:
            # Check if username is already used by another user
            existing_username = mongo_db.db.users.find_one({
                'username': data['username'],
                '_id': {'$ne': ObjectId(user_id)}
            })
            if existing_username:
                return jsonify({
                    'success': False,
                    'message': 'Username already exists'
                }), 400
            update_data['username'] = data['username']
        
        # Update password if provided
        if 'password' in data and data['password']:
            from flask_bcrypt import Bcrypt
            bcrypt = Bcrypt()
            update_data['password_hash'] = bcrypt.generate_password_hash(data['password']).decode('utf-8')
        
        # Update role_name if provided
        if 'role_name' in data:
            update_data['role_name'] = data['role_name']
        
        # Add updated timestamp
        update_data['updated_at'] = datetime.utcnow()
        
        # Perform update
        result = mongo_db.db.users.update_one(
            {'_id': ObjectId(user_id)},
            {'$set': update_data}
        )
        
        if result.modified_count > 0 or result.matched_count > 0:
            current_app.logger.info(f"Sub-superadmin updated: {user_id} by {current_user_id}")
            return jsonify({
                'success': True,
                'message': 'Sub-superadmin updated successfully'
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': 'No changes made'
            }), 400
    
    except Exception as e:
        current_app.logger.error(f"Error updating sub-superadmin: {e}")
        return jsonify({
            'success': False,
            'message': f'Error updating sub-superadmin: {str(e)}'
        }), 500

@sub_superadmin_bp.route('/<user_id>/sub-role', methods=['PUT'])
@jwt_required()
@require_permission('sub_superadmin_management')
def update_sub_superadmin_role(user_id):
    """Update sub-role for a sub-superadmin"""
    try:
        data = request.get_json()
        
        if not data or 'sub_role_id' not in data:
            return jsonify({
                'success': False,
                'message': 'sub_role_id is required'
            }), 400
        
        sub_role_id = data['sub_role_id']
        
        # Validate sub-role exists
        sub_role = SubRole.get_sub_role(sub_role_id)
        if not sub_role:
            return jsonify({
                'success': False,
                'message': 'Invalid sub-role selected'
            }), 400
        
        # Update sub-role
        result = SubSuperadmin.update_sub_role(user_id, sub_role_id)
        
        if result:
            current_app.logger.info(f"Sub-role updated for user: {user_id}")
            return jsonify({
                'success': True,
                'message': 'Sub-role updated successfully'
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': 'Sub-superadmin not found or update failed'
            }), 404
    
    except Exception as e:
        current_app.logger.error(f"Error updating sub-superadmin role: {e}")
        return jsonify({
            'success': False,
            'message': f'Error updating sub-role: {str(e)}'
        }), 500

@sub_superadmin_bp.route('/<user_id>', methods=['DELETE'])
@jwt_required()
@require_permission('sub_superadmin_management')
def deactivate_sub_superadmin(user_id):
    """Deactivate a sub-superadmin"""
    try:
        result = SubSuperadmin.deactivate_sub_superadmin(user_id)
        
        if result:
            current_app.logger.info(f"Sub-superadmin deactivated: {user_id}")
            return jsonify({
                'success': True,
                'message': 'Sub-superadmin deactivated successfully'
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': 'Sub-superadmin not found'
            }), 404
    
    except Exception as e:
        current_app.logger.error(f"Error deactivating sub-superadmin: {e}")
        return jsonify({
            'success': False,
            'message': f'Error deactivating sub-superadmin: {str(e)}'
        }), 500

# ============================================================================
# PERMISSION CHECKING ENDPOINTS
# ============================================================================

@sub_superadmin_bp.route('/permissions/<user_id>', methods=['GET'])
@jwt_required()
def get_user_permissions(user_id):
    """Get permissions for a specific user"""
    try:
        current_user_id = get_jwt_identity()
        
        # Users can check their own permissions
        if str(current_user_id) != str(user_id):
            # Check if current user has permission to view other users' permissions
            if not SubSuperadmin.has_permission(current_user_id, 'user_management', 'read'):
                return jsonify({
                    'success': False,
                    'message': 'Permission denied'
                }), 403
        
        permissions = SubSuperadmin.get_user_permissions(user_id)
        
        return jsonify({
            'success': True,
            'permissions': permissions,
            'is_sub_superadmin': len(permissions) > 0
        }), 200
    
    except Exception as e:
        current_app.logger.error(f"Error getting user permissions: {e}")
        return jsonify({
            'success': False,
            'message': f'Error getting permissions: {str(e)}'
        }), 500

@sub_superadmin_bp.route('/permissions/<user_id>', methods=['PUT'])
@jwt_required()
@require_permission('sub_superadmin_management')
def update_user_permissions(user_id):
    """Update permissions for a specific sub-superadmin user"""
    try:
        # Validate ObjectId
        try:
            ObjectId(user_id)
        except Exception:
            return jsonify({
                'success': False,
                'message': 'Invalid user ID format'
            }), 400
        
        current_user_id = get_jwt_identity()
        data = request.get_json()
        
        if not data or 'permissions' not in data:
            return jsonify({
                'success': False,
                'message': 'Permissions data is required'
            }), 400
        
        permissions = data['permissions']
        
        # Validate permissions structure
        if not isinstance(permissions, dict):
            return jsonify({
                'success': False,
                'message': 'Permissions must be a dictionary'
            }), 400
        
        # Verify user exists and is a sub-superadmin
        user = mongo_db.db.users.find_one({'_id': ObjectId(user_id)})
        if not user:
            return jsonify({
                'success': False,
                'message': 'User not found'
            }), 404
        
        if user.get('role') != 'sub_superadmin':
            return jsonify({
                'success': False,
                'message': 'User is not a sub-superadmin'
            }), 400
        
        # Update permissions in users collection
        result = mongo_db.db.users.update_one(
            {'_id': ObjectId(user_id)},
            {
                '$set': {
                    'permissions': permissions,
                    'updated_at': datetime.utcnow()
                }
            }
        )
        
        if result.modified_count > 0 or result.matched_count > 0:
            current_app.logger.info(f"Permissions updated for user {user_id} by {current_user_id}")
            return jsonify({
                'success': True,
                'message': 'Permissions updated successfully'
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to update permissions'
            }), 500
    
    except Exception as e:
        current_app.logger.error(f"Error updating user permissions: {e}")
        return jsonify({
            'success': False,
            'message': f'Error updating permissions: {str(e)}'
        }), 500

@sub_superadmin_bp.route('/check-permission', methods=['POST'])
@jwt_required()
def check_permission():
    """Check if current user has permission for a specific page"""
    try:
        current_user_id = get_jwt_identity()
        data = request.get_json()
        
        if not data or 'page' not in data:
            return jsonify({
                'success': False,
                'message': 'Page is required'
            }), 400
        
        page = data['page']
        required_access = data.get('access', 'read')
        
        has_permission = SubSuperadmin.has_permission(current_user_id, page, required_access)
        
        return jsonify({
            'success': True,
            'has_permission': has_permission,
            'page': page,
            'required_access': required_access
        }), 200
    
    except Exception as e:
        current_app.logger.error(f"Error checking permission: {e}")
        return jsonify({
            'success': False,
            'message': f'Error checking permission: {str(e)}'
        }), 500

# ============================================================================
# UTILITY ENDPOINTS
# ============================================================================

@sub_superadmin_bp.route('/available-modules', methods=['GET'])
@jwt_required()
@require_permission('sub_superadmin_management')
def get_available_modules():
    """Get list of modules available for permission assignment (excluding dashboard)"""
    try:
        modules = [
            {'id': 'campus_management', 'name': 'Campus Management'},
            {'id': 'course_management', 'name': 'Course Management'},
            {'id': 'batch_management', 'name': 'Batch Management'},
            {'id': 'student_management', 'name': 'Student Management'},
            {'id': 'test_management', 'name': 'Test Management'},
            {'id': 'question_bank_upload', 'name': 'Question Bank Upload'},
            {'id': 'crt_upload', 'name': 'CRT Upload'},
            {'id': 'results_management', 'name': 'Results Management'},
            {'id': 'analytics', 'name': 'Analytics'},
            {'id': 'admin_permissions', 'name': 'Admin Permissions'},
            {'id': 'sub_superadmin_management', 'name': 'Sub Superadmin Management'},
            {'id': 'notification_settings', 'name': 'Notification Settings'},
            {'id': 'global_settings', 'name': 'Global Settings'},
            {'id': 'form_management', 'name': 'Form Management'},
        ]
        
        return jsonify({
            'success': True,
            'data': {
                'modules': modules,
                'total': len(modules),
                'note': 'Dashboard is available to all users by default'
            }
        }), 200
    
    except Exception as e:
        current_app.logger.error(f"Error getting available modules: {e}")
        return jsonify({
            'success': False,
            'message': f'Error getting modules: {str(e)}'
        }), 500

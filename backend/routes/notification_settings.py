"""
Notification Settings Management - Backend routes using local MongoDB model
"""
import os
import functools
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity, exceptions as jwt_exceptions
from datetime import datetime
from mongo import mongo_db
from models import NotificationSettings

notification_settings_bp = Blueprint('notification_settings', __name__)

def require_superadmin(f):
    @functools.wraps(f)
    def decorated_function(*args, **kwargs):
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)
        allowed_roles = ['superadmin', 'sub_superadmin']
        if not user or user.get('role') not in allowed_roles:
            return jsonify({
                'success': False,
                'message': 'Access denied. Super admin privileges required.'
            }), 403
        return f(*args, **kwargs)
    return decorated_function

# Error handlers
@notification_settings_bp.errorhandler(jwt_exceptions.NoAuthorizationError)
def handle_no_auth_error(e):
    print(f"❌ JWT Error: No authorization header")
    return jsonify({'success': False, 'message': 'Missing authorization header'}), 401

@notification_settings_bp.errorhandler(jwt_exceptions.InvalidHeaderError)
def handle_invalid_header_error(e):
    print(f"❌ JWT Error: Invalid header - {str(e)}")
    return jsonify({'success': False, 'message': f'Invalid authorization header: {str(e)}'}), 422

@notification_settings_bp.errorhandler(jwt_exceptions.JWTDecodeError)
def handle_decode_error(e):
    print(f"❌ JWT Error: Decode error - {str(e)}")
    return jsonify({'success': False, 'message': f'Invalid token: {str(e)}'}), 422

@notification_settings_bp.errorhandler(Exception)
def handle_general_error(e):
    print(f"❌ General Error: {str(e)}")
    import traceback
    traceback.print_exc()
    return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 500

@notification_settings_bp.before_request
def log_request():
    """Log all requests to this blueprint"""
    print(f"🔧 Notification Settings request: {request.method} {request.path}")
    print(f"🔧 Headers: {dict(request.headers)}")

@notification_settings_bp.route('/', methods=['GET'])
@jwt_required()
@require_superadmin
def get_notification_settings():
    """Get notification settings from local database"""
    try:
        print("🔧 Getting notification settings from local database")

        # Initialize the model
        settings_model = NotificationSettings(mongo_db)

        # Get or create settings
        settings = settings_model.find_or_create()

        if not settings:
            return jsonify({
                'success': False,
                'message': 'Failed to retrieve notification settings'
            }), 500

        print(f"✅ Settings retrieved: {settings}")

        return jsonify({
            'success': True,
            'message': 'Notification settings retrieved successfully',
            'data': {
                'pushEnabled': settings.get('pushEnabled', True),
                'smsEnabled': settings.get('smsEnabled', True),
                'mailEnabled': settings.get('mailEnabled', True),
                'createdAt': settings.get('created_at'),
                'updatedAt': settings.get('updated_at')
            }
        }), 200

    except Exception as e:
        print(f"❌ Error in get notification settings: {e}")
        import traceback
        traceback.print_exc()
        current_app.logger.error(f"Error in get notification settings: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to get notification settings: {str(e)}'
        }), 500

@notification_settings_bp.route('/', methods=['PUT'])
@jwt_required()
@require_superadmin
def update_notification_settings():
    """Update notification settings in local database"""
    try:
        print("🔧 Updating notification settings in local database")

        data = request.get_json()
        print(f"🔧 Request data: {data}")

        if not data:
            return jsonify({
                'success': False,
                'message': 'No data provided'
            }), 400

        # Validate required fields
        allowed_fields = ['pushEnabled', 'smsEnabled', 'mailEnabled']
        for field in allowed_fields:
            if field in data and not isinstance(data[field], bool):
                return jsonify({
                    'success': False,
                    'message': f'{field} must be a boolean'
                }), 400

        # Initialize the model
        settings_model = NotificationSettings(mongo_db)

        # Update settings
        updated_settings = settings_model.update_settings(
            push_enabled=data.get('pushEnabled'),
            sms_enabled=data.get('smsEnabled'),
            mail_enabled=data.get('mailEnabled')
        )

        if not updated_settings:
            return jsonify({
                'success': False,
                'message': 'Failed to update notification settings'
            }), 500

        print(f"✅ Settings updated: {updated_settings}")

        return jsonify({
            'success': True,
            'message': 'Notification settings updated successfully',
            'data': {
                'pushEnabled': updated_settings.get('pushEnabled', True),
                'smsEnabled': updated_settings.get('smsEnabled', True),
                'mailEnabled': updated_settings.get('mailEnabled', True),
                'updatedAt': updated_settings.get('updated_at')
            }
        }), 200

    except Exception as e:
        print(f"❌ Error in update notification settings: {e}")
        import traceback
        traceback.print_exc()
        current_app.logger.error(f"Error in update notification settings: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to update notification settings: {str(e)}'
        }), 500

@notification_settings_bp.route('/health', methods=['GET'])
def notification_settings_health():
    """Health check for notification settings service"""
    try:
        # Test database connection and model
        settings_model = NotificationSettings(mongo_db)

        # Try to access the collection
        settings = settings_model.find_one()

        return jsonify({
            'success': True,
            'message': 'Notification settings service is healthy',
            'database_status': 'connected',
            'settings_exist': settings is not None,
            'timestamp': datetime.utcnow().isoformat()
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Notification settings service health check failed: {str(e)}',
            'database_status': 'disconnected',
            'timestamp': datetime.utcnow().isoformat()
        }), 503
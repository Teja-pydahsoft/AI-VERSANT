from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from models_notification_preferences import NotificationPreferences
from routes.access_control import require_permission
from datetime import datetime
import logging

notification_preferences_bp = Blueprint('notification_preferences', __name__)

@notification_preferences_bp.route('/preferences', methods=['GET'])
@jwt_required()
def get_user_preferences():
    """Get current user's notification preferences"""
    try:
        user_id = get_jwt_identity()
        preferences = NotificationPreferences.get_user_preferences(user_id)
        
        if not preferences:
            # Create default preferences if none exist
            NotificationPreferences.create_default_preferences(user_id)
            preferences = NotificationPreferences.get_user_preferences(user_id)
        
        # Remove internal fields for response
        preferences.pop('_id', None)
        preferences['user_id'] = str(preferences['user_id'])
        
        return jsonify({
            'success': True,
            'data': preferences
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting notification preferences: {e}")
        return jsonify({
            'success': False,
            'message': f'Error getting preferences: {str(e)}'
        }), 500

@notification_preferences_bp.route('/preferences', methods=['PUT'])
@jwt_required()
def update_user_preferences():
    """Update current user's notification preferences"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'message': 'No data provided'
            }), 400
        
        # Validate the data structure
        allowed_keys = [
            'push_notifications', 'email_notifications', 'sms_notifications',
            'notification_types', 'quiet_hours'
        ]
        
        updates = {}
        for key in allowed_keys:
            if key in data:
                updates[key] = data[key]
        
        if not updates:
            return jsonify({
                'success': False,
                'message': 'No valid preferences provided'
            }), 400
        
        success = NotificationPreferences.update_user_preferences(user_id, updates)
        
        if success:
            return jsonify({
                'success': True,
                'message': 'Notification preferences updated successfully'
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to update preferences'
            }), 500
            
    except Exception as e:
        current_app.logger.error(f"Error updating notification preferences: {e}")
        return jsonify({
            'success': False,
            'message': f'Error updating preferences: {str(e)}'
        }), 500

@notification_preferences_bp.route('/onesignal/subscribe', methods=['POST'])
@jwt_required()
def subscribe_to_onesignal():
    """Subscribe user to OneSignal push notifications"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        
        player_id = data.get('player_id')
        onesignal_user_id = data.get('onesignal_user_id')
        
        print(f"🔔 OneSignal Subscribe - User: {user_id}")
        print(f"🔔 OneSignal Subscribe - Player ID: {player_id}")
        print(f"🔔 OneSignal Subscribe - OneSignal User ID: {onesignal_user_id}")
        
        success = NotificationPreferences.update_onesignal_subscription(
            user_id, True, player_id, onesignal_user_id
        )
        
        if success:
            return jsonify({
                'success': True,
                'message': 'Successfully subscribed to push notifications'
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to subscribe to push notifications'
            }), 500
            
    except Exception as e:
        current_app.logger.error(f"Error subscribing to OneSignal: {e}")
        return jsonify({
            'success': False,
            'message': f'Error subscribing: {str(e)}'
        }), 500

@notification_preferences_bp.route('/onesignal/unsubscribe', methods=['POST'])
@jwt_required()
def unsubscribe_from_onesignal():
    """Unsubscribe user from OneSignal push notifications"""
    try:
        user_id = get_jwt_identity()
        
        success = NotificationPreferences.update_onesignal_subscription(user_id, False)
        
        if success:
            return jsonify({
                'success': True,
                'message': 'Successfully unsubscribed from push notifications'
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to unsubscribe from push notifications'
            }), 500
            
    except Exception as e:
        current_app.logger.error(f"Error unsubscribing from OneSignal: {e}")
        return jsonify({
            'success': False,
            'message': f'Error unsubscribing: {str(e)}'
        }), 500

@notification_preferences_bp.route('/stats', methods=['GET'])
@jwt_required()
@require_permission('admin_permissions')
def get_notification_stats():
    """Get notification subscription statistics (Admin only)"""
    try:
        stats = NotificationPreferences.get_notification_stats()
        
        return jsonify({
            'success': True,
            'data': stats
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting notification stats: {e}")
        return jsonify({
            'success': False,
            'message': f'Error getting stats: {str(e)}'
        }), 500

@notification_preferences_bp.route('/subscribed-users', methods=['GET'])
@jwt_required()
@require_permission('admin_permissions')
def get_subscribed_users():
    """Get all users subscribed to push notifications (Admin only)"""
    try:
        notification_type = request.args.get('type')
        users = NotificationPreferences.get_subscribed_users(notification_type)
        
        # Clean up the response
        for user in users:
            user['_id'] = str(user['_id'])
            if 'notification_preferences' in user:
                user['notification_preferences']['user_id'] = str(user['notification_preferences']['user_id'])
        
        return jsonify({
            'success': True,
            'data': users,
            'count': len(users)
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting subscribed users: {e}")
        return jsonify({
            'success': False,
            'message': f'Error getting subscribed users: {str(e)}'
        }), 500

@notification_preferences_bp.route('/users-by-role/<role>', methods=['GET'])
@jwt_required()
@require_permission('admin_permissions')
def get_users_by_role(role):
    """Get users by role who are subscribed to notifications (Admin only)"""
    try:
        notification_type = request.args.get('type')
        users = NotificationPreferences.get_users_by_role(role, notification_type)
        
        # Clean up the response
        for user in users:
            user['_id'] = str(user['_id'])
            if 'notification_preferences' in user:
                user['notification_preferences']['user_id'] = str(user['notification_preferences']['user_id'])
        
        return jsonify({
            'success': True,
            'data': users,
            'count': len(users)
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting users by role: {e}")
        return jsonify({
            'success': False,
            'message': f'Error getting users by role: {str(e)}'
        }), 500

@notification_preferences_bp.route('/test-subscription', methods=['POST'])
@jwt_required()
def test_user_subscription():
    """Test if current user can receive push notifications"""
    try:
        user_id = get_jwt_identity()
        preferences = NotificationPreferences.get_user_preferences(user_id)
        
        if not preferences:
            return jsonify({
                'success': False,
                'message': 'No notification preferences found',
                'can_receive_push': False
            }), 200
        
        can_receive = (
            preferences.get('push_notifications', {}).get('enabled', False) and
            preferences.get('push_notifications', {}).get('onesignal_subscribed', False)
        )
        
        return jsonify({
            'success': True,
            'can_receive_push': can_receive,
            'subscription_status': {
                'push_enabled': preferences.get('push_notifications', {}).get('enabled', False),
                'onesignal_subscribed': preferences.get('push_notifications', {}).get('onesignal_subscribed', False),
                'has_player_id': bool(preferences.get('push_notifications', {}).get('onesignal_player_id')),
                'last_subscribed': preferences.get('push_notifications', {}).get('last_subscribed'),
                'last_unsubscribed': preferences.get('push_notifications', {}).get('last_unsubscribed')
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error testing user subscription: {e}")
        return jsonify({
            'success': False,
            'message': f'Error testing subscription: {str(e)}'
        }), 500

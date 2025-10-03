"""
OneSignal Push Notifications Routes
Handles all OneSignal push notification related endpoints
"""

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from bson import ObjectId
import os
import requests
import json
from datetime import datetime
from mongo import mongo_db
from routes.access_control import require_permission

onesignal_notifications_bp = Blueprint('onesignal_notifications', __name__)

# OneSignal configuration
ONESIGNAL_APP_ID = os.getenv('ONESIGNAL_APP_ID', 'ee224f6c-70c4-4414-900b-c283db5ea114')
ONESIGNAL_REST_API_KEY = os.getenv('ONESIGNAL_REST_API_KEY', 'os_v2_app_5yre63dqyrcbjealykb5wxvbcte5xjdzhcwe444yjrysgtey5iieocwzdwaygyaoquueruzocxu5mojtpdxkzvrivtaw7vekg24ut7a')
ONESIGNAL_API_URL = 'https://onesignal.com/api/v1/notifications'

def get_onesignal_headers():
    """Get OneSignal API headers"""
    return {
        'Content-Type': 'application/json',
        'Authorization': f'Basic {ONESIGNAL_REST_API_KEY}'
    }

@onesignal_notifications_bp.route('/test', methods=['POST'])
@jwt_required()
@require_permission('test_management')
def send_test_notification():
    """Send test notification to current user"""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)
        
        if not user:
            return jsonify({
                'success': False,
                'message': 'User not found'
            }), 404

        # Get user's OneSignal player ID (if stored)
        player_id = user.get('onesignal_player_id')
        
        if not player_id:
            return jsonify({
                'success': False,
                'message': 'User not subscribed to OneSignal notifications'
            }), 400

        # Send test notification
        notification_data = {
            'app_id': ONESIGNAL_APP_ID,
            'include_player_ids': [player_id],
            'headings': {'en': 'VERSANT Test Notification'},
            'contents': {'en': 'This is a test notification from VERSANT system'},
            'data': {
                'type': 'test',
                'timestamp': datetime.now().isoformat(),
                'user_id': str(current_user_id)
            },
            'web_buttons': [
                {
                    'id': 'view',
                    'text': 'View',
                    'icon': 'https://via.placeholder.com/72x72/4F46E5/FFFFFF?text=V',
                    'url': '/student/dashboard'
                }
            ]
        }

        response = requests.post(
            ONESIGNAL_API_URL,
            headers=get_onesignal_headers(),
            json=notification_data
        )

        if response.status_code == 200:
            result = response.json()
            return jsonify({
                'success': True,
                'message': 'Test notification sent successfully',
                'data': {
                    'notification_id': result.get('id'),
                    'recipients': result.get('recipients', 0)
                }
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': f'Failed to send notification: {response.text}'
            }), response.status_code

    except Exception as e:
        current_app.logger.error(f"Error sending OneSignal test notification: {e}")
        return jsonify({
            'success': False,
            'message': f'Error sending test notification: {str(e)}'
        }), 500

@onesignal_notifications_bp.route('/broadcast', methods=['POST'])
@jwt_required()
@require_permission('test_management')
def send_broadcast_notification():
    """Send notification to all subscribed users"""
    try:
        data = request.get_json()
        
        if not data or not data.get('title') or not data.get('body'):
            return jsonify({
                'success': False,
                'message': 'Title and body are required'
            }), 400

        # Send broadcast notification
        notification_data = {
            'app_id': ONESIGNAL_APP_ID,
            'included_segments': ['All'],  # Send to all users
            'headings': {'en': data['title']},
            'contents': {'en': data['body']},
            'data': {
                'type': 'broadcast',
                'timestamp': datetime.now().isoformat(),
                'url': data.get('url', '/'),
                **data.get('data', {})
            },
            'web_buttons': [
                {
                    'id': 'view',
                    'text': 'View',
                    'icon': 'https://via.placeholder.com/72x72/4F46E5/FFFFFF?text=V',
                    'url': data.get('url', '/')
                }
            ]
        }

        # Add icon if provided
        if data.get('icon'):
            notification_data['chrome_web_icon'] = data['icon']

        response = requests.post(
            ONESIGNAL_API_URL,
            headers=get_onesignal_headers(),
            json=notification_data
        )

        if response.status_code == 200:
            result = response.json()
            return jsonify({
                'success': True,
                'message': 'Broadcast notification sent successfully',
                'data': {
                    'notification_id': result.get('id'),
                    'recipients': result.get('recipients', 0)
                }
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': f'Failed to send broadcast: {response.text}'
            }), response.status_code

    except Exception as e:
        current_app.logger.error(f"Error sending OneSignal broadcast: {e}")
        return jsonify({
            'success': False,
            'message': f'Error sending broadcast: {str(e)}'
        }), 500

@onesignal_notifications_bp.route('/send-to-user', methods=['POST'])
@jwt_required()
@require_permission('test_management')
def send_to_user():
    """Send notification to specific user"""
    try:
        data = request.get_json()
        
        if not data or not data.get('user_id') or not data.get('title') or not data.get('body'):
            return jsonify({
                'success': False,
                'message': 'User ID, title and body are required'
            }), 400

        # Find user and get their OneSignal player ID
        user = mongo_db.find_user_by_id(ObjectId(data['user_id']))
        
        if not user:
            return jsonify({
                'success': False,
                'message': 'User not found'
            }), 404

        player_id = user.get('onesignal_player_id')
        
        if not player_id:
            return jsonify({
                'success': False,
                'message': 'User not subscribed to OneSignal notifications'
            }), 400

        # Send notification to specific user
        notification_data = {
            'app_id': ONESIGNAL_APP_ID,
            'include_player_ids': [player_id],
            'headings': {'en': data['title']},
            'contents': {'en': data['body']},
            'data': {
                'type': 'user_specific',
                'timestamp': datetime.now().isoformat(),
                'user_id': data['user_id'],
                'url': data.get('url', '/'),
                **data.get('data', {})
            },
            'web_buttons': [
                {
                    'id': 'view',
                    'text': 'View',
                    'icon': 'https://via.placeholder.com/72x72/4F46E5/FFFFFF?text=V',
                    'url': data.get('url', '/')
                }
            ]
        }

        # Add icon if provided
        if data.get('icon'):
            notification_data['chrome_web_icon'] = data['icon']

        response = requests.post(
            ONESIGNAL_API_URL,
            headers=get_onesignal_headers(),
            json=notification_data
        )

        if response.status_code == 200:
            result = response.json()
            return jsonify({
                'success': True,
                'message': 'Notification sent to user successfully',
                'data': {
                    'notification_id': result.get('id'),
                    'recipients': result.get('recipients', 0)
                }
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': f'Failed to send notification: {response.text}'
            }), response.status_code

    except Exception as e:
        current_app.logger.error(f"Error sending OneSignal user notification: {e}")
        return jsonify({
            'success': False,
            'message': f'Error sending user notification: {str(e)}'
        }), 500

@onesignal_notifications_bp.route('/send-to-role', methods=['POST'])
@jwt_required()
@require_permission('test_management')
def send_to_role():
    """Send notification to users with specific role"""
    try:
        data = request.get_json()
        
        if not data or not data.get('role') or not data.get('title') or not data.get('body'):
            return jsonify({
                'success': False,
                'message': 'Role, title and body are required'
            }), 400

        # Get all users with the specified role
        users = mongo_db.db.users.find({'role': data['role']})
        player_ids = []
        
        for user in users:
            if user.get('onesignal_player_id'):
                player_ids.append(user['onesignal_player_id'])

        if not player_ids:
            return jsonify({
                'success': False,
                'message': f'No users with role {data["role"]} are subscribed to OneSignal notifications'
            }), 400

        # Send notification to role users
        notification_data = {
            'app_id': ONESIGNAL_APP_ID,
            'include_player_ids': player_ids,
            'headings': {'en': data['title']},
            'contents': {'en': data['body']},
            'data': {
                'type': 'role_specific',
                'timestamp': datetime.now().isoformat(),
                'role': data['role'],
                'url': data.get('url', '/'),
                **data.get('data', {})
            },
            'web_buttons': [
                {
                    'id': 'view',
                    'text': 'View',
                    'icon': 'https://via.placeholder.com/72x72/4F46E5/FFFFFF?text=V',
                    'url': data.get('url', '/')
                }
            ]
        }

        # Add icon if provided
        if data.get('icon'):
            notification_data['chrome_web_icon'] = data['icon']

        response = requests.post(
            ONESIGNAL_API_URL,
            headers=get_onesignal_headers(),
            json=notification_data
        )

        if response.status_code == 200:
            result = response.json()
            return jsonify({
                'success': True,
                'message': f'Notification sent to {data["role"]} users successfully',
                'data': {
                    'notification_id': result.get('id'),
                    'recipients': result.get('recipients', 0),
                    'role': data['role']
                }
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': f'Failed to send role notification: {response.text}'
            }), response.status_code

    except Exception as e:
        current_app.logger.error(f"Error sending OneSignal role notification: {e}")
        return jsonify({
            'success': False,
            'message': f'Error sending role notification: {str(e)}'
        }), 500

@onesignal_notifications_bp.route('/subscribe', methods=['POST'])
@jwt_required()
def subscribe_user():
    """Subscribe user to OneSignal notifications"""
    try:
        data = request.get_json()
        current_user_id = get_jwt_identity()
        
        if not data or not data.get('player_id'):
            return jsonify({
                'success': False,
                'message': 'Player ID is required'
            }), 400

        # Update user with OneSignal player ID
        result = mongo_db.db.users.update_one(
            {'_id': ObjectId(current_user_id)},
            {
                '$set': {
                    'onesignal_player_id': data['player_id'],
                    'onesignal_subscribed_at': datetime.now(),
                    'updated_at': datetime.now()
                }
            }
        )

        if result.modified_count > 0:
            return jsonify({
                'success': True,
                'message': 'Successfully subscribed to OneSignal notifications'
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to update subscription'
            }), 500

    except Exception as e:
        current_app.logger.error(f"Error subscribing user to OneSignal: {e}")
        return jsonify({
            'success': False,
            'message': f'Error subscribing: {str(e)}'
        }), 500

@onesignal_notifications_bp.route('/unsubscribe', methods=['POST'])
@jwt_required()
def unsubscribe_user():
    """Unsubscribe user from OneSignal notifications"""
    try:
        current_user_id = get_jwt_identity()
        
        # Remove OneSignal player ID from user
        result = mongo_db.db.users.update_one(
            {'_id': ObjectId(current_user_id)},
            {
                '$unset': {
                    'onesignal_player_id': '',
                    'onesignal_subscribed_at': ''
                },
                '$set': {
                    'updated_at': datetime.now()
                }
            }
        )

        if result.modified_count > 0:
            return jsonify({
                'success': True,
                'message': 'Successfully unsubscribed from OneSignal notifications'
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to update subscription'
            }), 500

    except Exception as e:
        current_app.logger.error(f"Error unsubscribing user from OneSignal: {e}")
        return jsonify({
            'success': False,
            'message': f'Error unsubscribing: {str(e)}'
        }), 500

@onesignal_notifications_bp.route('/stats', methods=['GET'])
@jwt_required()
@require_permission('test_management')
def get_notification_stats():
    """Get OneSignal notification statistics"""
    try:
        # Get total subscribed users
        total_subscribed = mongo_db.db.users.count_documents({
            'onesignal_player_id': {'$exists': True, '$ne': None}
        })

        # Get subscription counts by role
        role_stats = list(mongo_db.db.users.aggregate([
            {
                '$match': {
                    'onesignal_player_id': {'$exists': True, '$ne': None}
                }
            },
            {
                '$group': {
                    '_id': '$role',
                    'count': {'$sum': 1}
                }
            }
        ]))

        # Get recent subscriptions (last 7 days)
        seven_days_ago = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        recent_subscriptions = mongo_db.db.users.count_documents({
            'onesignal_subscribed_at': {'$gte': seven_days_ago}
        })

        return jsonify({
            'success': True,
            'data': {
                'total_subscribed': total_subscribed,
                'role_breakdown': role_stats,
                'recent_subscriptions': recent_subscriptions,
                'app_id': ONESIGNAL_APP_ID,
                'last_updated': datetime.now().isoformat()
            }
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error getting OneSignal stats: {e}")
        return jsonify({
            'success': False,
            'message': f'Error getting stats: {str(e)}'
        }), 500

@onesignal_notifications_bp.route('/config', methods=['GET'])
def get_onesignal_config():
    """Get OneSignal configuration for frontend"""
    try:
        return jsonify({
            'success': True,
            'data': {
                'app_id': ONESIGNAL_APP_ID,
                'api_configured': bool(ONESIGNAL_REST_API_KEY),
                'api_url': ONESIGNAL_API_URL
            }
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error getting OneSignal config: {e}")
        return jsonify({
            'success': False,
            'message': f'Error getting config: {str(e)}'
        }), 500

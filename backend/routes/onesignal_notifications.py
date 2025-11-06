"""
OneSignal Push Notifications Routes
Hand        # Get user's notification preferences
        preferences = NotificationPreferences.get_user_preferences(current_user_id)
        if not preferences:
            return jsonify({
                'success': False,
                'message': 'No notification preferences found'
            }), 404

        # Check OneSignal subscription
        onesignal_data = preferences.get('push_notifications', {}).get('providers', {}).get('onesignal', {})
        if not onesignal_data.get('subscribed') or not onesignal_data.get('is_active'):
            return jsonify({
                'success': False,
                'message': 'You are not subscribed to push notifications'
            }), 400

        player_id = onesignal_data.get('player_id')
        if not player_id:
            return jsonify({
                'success': False,
                'message': 'No OneSignal player ID found'
            }), 400OneSignal push notification related endpoints
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
from services.oneSignalService import oneSignalService
from models_push_subscriptions import PushSubscription

onesignal_notifications_bp = Blueprint('onesignal_notifications', __name__)

@onesignal_notifications_bp.route('/verify', methods=['POST'])
@jwt_required()
def verify_subscription():
    """Verify OneSignal subscription status"""
    try:
        current_user_id = get_jwt_identity()
        data = request.get_json()
        player_id = data.get('player_id')

        if not player_id:
            return jsonify({
                'success': False,
                'message': 'player_id is required'
            }), 400

        # Check if subscription exists and matches
        subscription = PushSubscription.get_onesignal_subscription(current_user_id)
        if not subscription:
            return jsonify({'success': False, 'verified': False}), 200

        is_valid = (
            subscription.get('is_active', False) and
            subscription.get('player_id') == player_id
        )

        return jsonify({
            'success': True,
            'verified': is_valid
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error verifying OneSignal subscription: {e}")
        return jsonify({
            'success': False,
            'message': f'Error verifying subscription: {str(e)}'
        }), 500

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

        # Get user's OneSignal subscription from push_subscriptions collection
        subscription = PushSubscription.get_onesignal_subscription(current_user_id)
        
        if not subscription or not subscription.get('player_id'):
            return jsonify({
                'success': False,
                'message': 'User not subscribed to OneSignal notifications'
            }), 400
        
        player_id = subscription.get('player_id')

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
        
        if not data or not data.get('title') or not data.get('message'):
            return jsonify({
                'success': False,
                'message': 'Title and message are required'
            }), 400

        # Prepare notification data for OneSignal service
        notification_data = {
            'title': data['title'],
            'message': data['message'],
            'type': 'broadcast',
            'url': data.get('url', '/'),
            'image': data.get('image'),
            'icon': data.get('icon', 'https://crt.pydahsoft.in/logo.png'),
            'priority': data.get('priority', 8),
            'data': data.get('data', {})
        }

        # Send broadcast notification using OneSignal service
        success = oneSignalService.send_broadcast_notification(notification_data)

        if success:
            return jsonify({
                'success': True,
                'message': 'Broadcast push notification sent successfully to all subscribed users',
                'data': {
                    'title': data['title'],
                    'message': data['message'],
                    'timestamp': datetime.now().isoformat()
                }
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to send broadcast notification'
            }), 500

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

        # Store OneSignal subscription in push_subscriptions collection
        result = PushSubscription.create_onesignal_subscription(
            user_id=current_user_id,
            player_id=data['player_id'],
            platform=data.get('platform'),
            browser=data.get('browser'),
            tags=data.get('tags', []),
            device_info=data.get('deviceInfo') or {}
        )

        if result:
            current_app.logger.info(f"✅ OneSignal subscription created for user {current_user_id}")
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
        
        # Deactivate OneSignal subscription
        result = PushSubscription.deactivate_onesignal_subscription(current_user_id)

        if result:
            current_app.logger.info(f"✅ OneSignal subscription deactivated for user {current_user_id}")
            return jsonify({
                'success': True,
                'message': 'Successfully unsubscribed from OneSignal notifications'
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': 'No active OneSignal subscription found'
            }), 404

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

@onesignal_notifications_bp.route('/test-broadcast', methods=['POST'])
@jwt_required()
def test_broadcast_notification():
    """Test endpoint for super admin to send push notification to all subscribed users"""
    try:
        print("🔔 Test broadcast endpoint called")
        data = request.get_json()
        print(f"🔔 Request data: {data}")
        
        # Default test message if none provided
        title = data.get('title', 'VERSANT Test Notification') if data else 'VERSANT Test Notification'
        message = data.get('message', 'This is a test push notification from VERSANT system. If you receive this, push notifications are working correctly!') if data else 'This is a test push notification from VERSANT system. If you receive this, push notifications are working correctly!'
        
        print(f"🔔 Notification data - Title: {title}, Message: {message}")

        # Prepare test notification data
        notification_data = {
            'title': title,
            'message': message,
            'type': 'test',
            'url': '/student/dashboard',
            'icon': 'https://crt.pydahsoft.in/logo.png',
            'priority': 10,  # High priority for test notifications
            'data': {
                'test_id': 'superadmin_test',
                'timestamp': datetime.now().isoformat(),
                'sender': 'Super Admin'
            }
        }

        # Send test broadcast notification via BOTH OneSignal and VAPID
        print("🔔 Sending via OneSignal...")
        onesignal_success = oneSignalService.send_broadcast_notification(notification_data)
        print(f"🔔 OneSignal result: {onesignal_success}")
        
        print("🔔 Sending via VAPID...")
        vapid_result = vapid_service.send_broadcast_notification(
            title=title,
            body=message,
            data={
                'type': 'test',
                'url': '/student/dashboard',
                'timestamp': datetime.now().isoformat()
            }
        )
        print(f"🔔 VAPID result: {vapid_result}")
        
        # Calculate total recipients
        onesignal_count = 0
        vapid_count = vapid_result.get('sent', 0)
        
        # Get OneSignal count from push_subscriptions
        onesignal_subs = PushSubscription.get_all_onesignal_player_ids()
        onesignal_count = len(onesignal_subs) if onesignal_subs else 0
        
        total_recipients = onesignal_count + vapid_count
        
        # Determine overall success
        overall_success = onesignal_success or vapid_result.get('success', False)
        
        if overall_success:
            return jsonify({
                'success': True,
                'message': 'Test push notification sent successfully',
                'details': {
                    'total_recipients': total_recipients,
                    'onesignal_status': f'Sent to {onesignal_count} subscribers' if onesignal_success else 'Failed',
                    'vapid_status': f'Sent to {vapid_count} subscribers' if vapid_result.get('success') else 'No VAPID subscribers',
                    'onesignal_count': onesignal_count,
                    'vapid_count': vapid_count
                },
                'data': {
                    'title': title,
                    'message': message,
                    'type': 'test',
                    'timestamp': datetime.now().isoformat(),
                    'sent_by': 'Super Admin'
                }
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to send test push notification',
                'details': {
                    'onesignal_status': 'Failed' if not onesignal_success else 'Success',
                    'vapid_status': vapid_result.get('error', 'Failed')
                }
            }), 500

    except Exception as e:
        current_app.logger.error(f"Error sending test OneSignal broadcast: {e}")
        return jsonify({
            'success': False,
            'message': f'Error sending test notification: {str(e)}'
        }), 500

@onesignal_notifications_bp.route('/subscription-status', methods=['GET'])
@jwt_required()
def get_onesignal_subscription_status():
    """Get OneSignal subscription status for current user"""
    try:
        current_user_id = get_jwt_identity()

        # Check OneSignal subscription in push_subscriptions collection
        subscription = PushSubscription.get_onesignal_subscription(current_user_id)

        if subscription and subscription.get('is_active'):
            return jsonify({
                'success': True,
                'is_subscribed': True,
                'player_id': subscription.get('player_id'),
                'subscription_details': {
                    'created_at': subscription.get('created_at'),
                    'last_seen': subscription.get('last_seen_at'),
                    'platform': subscription.get('platform'),
                    'browser': subscription.get('browser')
                }
            }), 200
        else:
            return jsonify({
                'success': True,
                'is_subscribed': False,
                'message': 'No active OneSignal subscription found'
            }), 200

    except Exception as e:
        current_app.logger.error(f"Error getting OneSignal subscription status: {e}")
        return jsonify({
            'success': False,
            'message': f'Error getting subscription status: {str(e)}'
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

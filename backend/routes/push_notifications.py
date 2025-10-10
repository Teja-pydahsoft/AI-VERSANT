"""
Push Notifications Routes
Handles all push notification related endpoints
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

push_notifications_bp = Blueprint('push_notifications', __name__)

# Notification service configuration
NOTIFICATION_SERVICE_URL = os.getenv('NOTIFICATION_SERVICE_URL', 'http://localhost:3001/api')
NOTIFICATION_API_KEY = os.getenv('NOTIFICATION_API_KEY', 'default-api-key')

def get_notification_client():
    """Get notification service client"""
    try:
        from integration.flask_notification_client import VERSANTNotificationClient
        return VERSANTNotificationClient(NOTIFICATION_SERVICE_URL)
    except ImportError:
        current_app.logger.error("Notification client not available")
        return None

@push_notifications_bp.route('/vapid-key', methods=['GET'])
def get_vapid_key():
    """Get VAPID public key for frontend"""
    try:
        # Get VAPID public key from environment
        vapid_public_key = os.getenv('VAPID_PUBLIC_KEY')
        
        if not vapid_public_key:
            return jsonify({
                'success': False,
                'message': 'VAPID public key not configured in environment variables'
            }), 500
        
        return jsonify({
            'success': True,
            'public_key': vapid_public_key
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting VAPID key: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to get VAPID key: {str(e)}'
        }), 500

@push_notifications_bp.route('/subscribe', methods=['POST'])
@jwt_required()
def subscribe_user():
    """Subscribe user to push notifications"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        
        if not data or 'subscription' not in data:
            return jsonify({
                'success': False,
                'message': 'Subscription data is required'
            }), 400
        
        subscription = data['subscription']

        # Normalize subscription shape and store endpoint/keys at top-level
        subscription_endpoint = None
        subscription_keys = {}

        if isinstance(subscription, dict):
            # New standard PushSubscription JSON
            subscription_endpoint = subscription.get('endpoint')
            subscription_keys = subscription.get('keys') or {}
        else:
            # Fallback: try attribute access (in case a class instance was sent)
            try:
                subscription_endpoint = getattr(subscription, 'endpoint', None)
                subscription_keys = getattr(subscription, 'keys', {}) or {}
            except Exception:
                subscription_endpoint = None

        if not subscription_endpoint:
            return jsonify({
                'success': False,
                'message': 'Subscription endpoint is required'
            }), 400

        # Build the doc to store (top-level endpoint + keys)
        user_subscription = {
            'user_id': user_id,
            'endpoint': subscription_endpoint,
            'keys': subscription_keys,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow(),
            'is_active': True
        }

        # Update or insert subscription by endpoint (ensure uniqueness)
        mongo_db.push_subscriptions.update_one(
            {'endpoint': subscription_endpoint},
            {'$set': user_subscription},
            upsert=True
        )
        
        # Register with notification service
        client = get_notification_client()
        if client:
            try:
                # Get user email for notification service
                user = mongo_db.users.find_one({'_id': ObjectId(user_id)})
                user_email = user.get('email', '') if user else ''
                
                result = client.register_user_subscription(
                    user_id=user_id,
                    user_email=user_email,
                    subscription=subscription
                )
                
                if result.get('success'):
                    current_app.logger.info(f"User {user_id} subscribed to push notifications")
                else:
                    current_app.logger.warning(f"Failed to register with notification service: {result.get('message')}")
                    
            except Exception as e:
                current_app.logger.warning(f"Notification service registration failed: {e}")
        
        return jsonify({
            'success': True,
            'message': 'Successfully subscribed to push notifications'
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error subscribing user: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to subscribe: {str(e)}'
        }), 500

@push_notifications_bp.route('/subscription-status', methods=['GET'])
@jwt_required()
def get_subscription_status():
    """Check if user is subscribed to push notifications"""
    try:
        user_id = get_jwt_identity()
        
        # Check VAPID subscriptions
        vapid_subscription = mongo_db.push_subscriptions.find_one({
            'user_id': user_id,
            'is_active': True,
            'provider': 'vapid'
        })
        
        # Check OneSignal subscriptions
        onesignal_subscription = mongo_db.push_subscriptions.find_one({
            'user_id': user_id,
            'is_active': True,
            'provider': 'onesignal'
        })
        
        # Also check for subscriptions without provider field (legacy)
        legacy_subscription = mongo_db.push_subscriptions.find_one({
            'user_id': user_id,
            'is_active': True,
            'provider': {'$exists': False}
        })
        
        is_subscribed = bool(vapid_subscription or onesignal_subscription or legacy_subscription)
        
        return jsonify({
            'success': True,
            'is_subscribed': is_subscribed,
            'subscriptions': {
                'vapid': bool(vapid_subscription),
                'onesignal': bool(onesignal_subscription),
                'legacy': bool(legacy_subscription)
            },
            'details': {
                'vapid_endpoint': vapid_subscription.get('endpoint') if vapid_subscription else None,
                'onesignal_player_id': onesignal_subscription.get('player_id') if onesignal_subscription else None,
                'total_devices': mongo_db.push_subscriptions.count_documents({
                    'user_id': user_id,
                    'is_active': True
                })
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error checking subscription status: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to check subscription status: {str(e)}'
        }), 500

@push_notifications_bp.route('/heartbeat', methods=['POST'])
@jwt_required()
def subscription_heartbeat():
    """Receive heartbeat from device to verify subscription is still active"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        
        if not data or 'device_id' not in data or 'endpoint' not in data:
            return jsonify({
                'success': False,
                'message': 'device_id and endpoint are required'
            }), 400
        
        device_id = data['device_id']
        endpoint = data['endpoint']
        device_info = data.get('device_info', {})
        timestamp = data.get('timestamp')
        
        # Update subscription with heartbeat info
        update_data = {
            'last_heartbeat': datetime.utcnow(),
            'device_id': device_id,
            'device_info': device_info,
            'is_active': True,
            'updated_at': datetime.utcnow()
        }
        
        # Update by endpoint
        result = mongo_db.push_subscriptions.update_one(
            {
                'user_id': user_id,
                'endpoint': endpoint
            },
            {'$set': update_data}
        )
        
        if result.matched_count == 0:
            current_app.logger.warning(f"Heartbeat received but no subscription found for user {user_id}, endpoint {endpoint[:50]}...")
            return jsonify({
                'success': False,
                'message': 'Subscription not found',
                'action': 'resubscribe'
            }), 404
        
        current_app.logger.info(f"Heartbeat received from user {user_id}, device {device_id}")
        
        return jsonify({
            'success': True,
            'message': 'Heartbeat received',
            'last_verified': datetime.utcnow().isoformat()
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error processing heartbeat: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to process heartbeat: {str(e)}'
        }), 500

@push_notifications_bp.route('/unsubscribe', methods=['POST'])
@jwt_required()
def unsubscribe_user():
    """Unsubscribe user from push notifications"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        
        endpoint = data.get('endpoint') if data else None

        # Update subscription status in database
        update_data = {
            'is_active': False,
            'updated_at': datetime.utcnow()
        }

        if endpoint:
            # Unsubscribe specific endpoint. Support both top-level and nested shapes.
            query = {
                'user_id': user_id,
                'is_active': True,
                '$or': [
                    {'endpoint': endpoint},
                    {'subscription.endpoint': endpoint}
                ]
            }
            mongo_db.push_subscriptions.update_one(query, {'$set': update_data})
        else:
            # Unsubscribe all subscriptions for user
            mongo_db.push_subscriptions.update_many({'user_id': user_id}, {'$set': update_data})
        
        # Unregister from notification service
        client = get_notification_client()
        if client:
            try:
                result = client.unregister_user_subscription(user_id)
                if result.get('success'):
                    current_app.logger.info(f"User {user_id} unsubscribed from push notifications")
            except Exception as e:
                current_app.logger.warning(f"Notification service unregistration failed: {e}")
        
        return jsonify({
            'success': True,
            'message': 'Successfully unsubscribed from push notifications'
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error unsubscribing user: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to unsubscribe: {str(e)}'
        }), 500

@push_notifications_bp.route('/send-to-user', methods=['POST'])
@jwt_required()
@require_permission('send_notifications')
def send_to_user():
    """Send push notification to specific user (admin only)"""
    try:
        data = request.get_json()
        
        if not data or 'user_id' not in data or 'title' not in data or 'body' not in data:
            return jsonify({
                'success': False,
                'message': 'user_id, title, and body are required'
            }), 400
        
        user_id = data['user_id']
        title = data['title']
        body = data['body']
        notification_data = data.get('data', {})
        icon = data.get('icon')
        url = data.get('url')
        
        # Get user's subscription
        subscription_doc = mongo_db.push_subscriptions.find_one({
            'user_id': user_id,
            'is_active': True
        })
        
        if not subscription_doc:
            return jsonify({
                'success': False,
                'message': 'User is not subscribed to push notifications'
            }), 404
        
        # Send via notification service
        client = get_notification_client()
        if not client:
            return jsonify({
                'success': False,
                'message': 'Notification service not available'
            }), 500
        
        result = client.send_push_to_user(
            user_id=user_id,
            title=title,
            body=body,
            data=notification_data
        )
        
        if result.get('success'):
            return jsonify({
                'success': True,
                'message': 'Push notification sent successfully',
                'task_id': result.get('task_id')
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': result.get('message', 'Failed to send notification')
            }), 500
        
    except Exception as e:
        current_app.logger.error(f"Error sending notification to user: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to send notification: {str(e)}'
        }), 500

@push_notifications_bp.route('/send-to-role', methods=['POST'])
@jwt_required()
@require_permission('send_notifications')
def send_to_role():
    """Send push notification to users with specific role (admin only)"""
    try:
        data = request.get_json()
        
        if not data or 'role' not in data or 'title' not in data or 'body' not in data:
            return jsonify({
                'success': False,
                'message': 'role, title, and body are required'
            }), 400
        
        role = data['role']
        title = data['title']
        body = data['body']
        notification_data = data.get('data', {})
        
        # Get users with the specified role
        users = list(mongo_db.users.find({'role': role}, {'_id': 1}))
        user_ids = [str(user['_id']) for user in users]
        
        if not user_ids:
            return jsonify({
                'success': False,
                'message': f'No users found with role: {role}'
            }), 404
        
        # Send via notification service
        client = get_notification_client()
        if not client:
            return jsonify({
                'success': False,
                'message': 'Notification service not available'
            }), 500
        
        result = client.send_bulk_push_notification(
            user_ids=user_ids,
            title=title,
            body=body,
            data=notification_data
        )
        
        if result.get('success'):
            return jsonify({
                'success': True,
                'message': f'Push notifications sent to {len(user_ids)} {role} users',
                'task_id': result.get('task_id'),
                'recipient_count': len(user_ids)
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': result.get('message', 'Failed to send notifications')
            }), 500
        
    except Exception as e:
        current_app.logger.error(f"Error sending notification to role: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to send notifications: {str(e)}'
        }), 500

@push_notifications_bp.route('/broadcast', methods=['POST'])
@jwt_required()
@require_permission('send_notifications')
def broadcast_notification():
    """Send broadcast push notification to all users (superadmin only)"""
    try:
        data = request.get_json()
        
        if not data or 'title' not in data or 'body' not in data:
            return jsonify({
                'success': False,
                'message': 'title and body are required'
            }), 400
        
        title = data['title']
        body = data['body']
        notification_data = data.get('data', {})
        
        # Get all subscribed users
        subscriptions = list(mongo_db.push_subscriptions.find({'is_active': True}))
        user_ids = [sub['user_id'] for sub in subscriptions]
        
        if not user_ids:
            return jsonify({
                'success': False,
                'message': 'No active subscriptions found'
            }), 404
        
        # Send via notification service
        client = get_notification_client()
        if not client:
            return jsonify({
                'success': False,
                'message': 'Notification service not available'
            }), 500
        
        result = client.send_bulk_push_notification(
            user_ids=user_ids,
            title=title,
            body=body,
            data=notification_data
        )
        
        if result.get('success'):
            return jsonify({
                'success': True,
                'message': f'Broadcast notification sent to {len(user_ids)} users',
                'task_id': result.get('task_id'),
                'recipient_count': len(user_ids)
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': result.get('message', 'Failed to send broadcast')
            }), 500
        
    except Exception as e:
        current_app.logger.error(f"Error sending broadcast notification: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to send broadcast: {str(e)}'
        }), 500

@push_notifications_bp.route('/test', methods=['POST'])
@jwt_required()
def send_test_notification():
    """Send test push notification to current user"""
    try:
        user_id = get_jwt_identity()
        
        # Get user's subscription
        subscription_doc = mongo_db.push_subscriptions.find_one({
            'user_id': user_id,
            'is_active': True
        })
        
        if not subscription_doc:
            return jsonify({
                'success': False,
                'message': 'You are not subscribed to push notifications'
            }), 400
        
        # Send test notification
        client = get_notification_client()
        if not client:
            return jsonify({
                'success': False,
                'message': 'Notification service not available'
            }), 500
        
        result = client.send_push_to_user(
            user_id=user_id,
            title='VERSANT Test Notification',
            body='This is a test notification from VERSANT!',
            data={'type': 'test', 'timestamp': datetime.utcnow().isoformat()}
        )
        
        if result.get('success'):
            return jsonify({
                'success': True,
                'message': 'Test notification sent successfully'
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': result.get('message', 'Failed to send test notification')
            }), 500
        
    except Exception as e:
        current_app.logger.error(f"Error sending test notification: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to send test notification: {str(e)}'
        }), 500

@push_notifications_bp.route('/stats', methods=['GET'])
@jwt_required()
@require_permission('view_analytics')
def get_notification_stats():
    """Get push notification statistics (admin only)"""
    try:
        # Get subscription stats
        total_subscriptions = mongo_db.push_subscriptions.count_documents({})
        active_subscriptions = mongo_db.push_subscriptions.count_documents({'is_active': True})
        
        # Get stats from notification service
        client = get_notification_client()
        service_stats = {}
        
        if client:
            try:
                health_result = client.check_service_health()
                if health_result.get('success'):
                    service_stats = health_result.get('data', {})
            except Exception as e:
                current_app.logger.warning(f"Failed to get service stats: {e}")
        
        return jsonify({
            'success': True,
            'data': {
                'subscriptions': {
                    'total': total_subscriptions,
                    'active': active_subscriptions,
                    'inactive': total_subscriptions - active_subscriptions
                },
                'service': service_stats
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting notification stats: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to get stats: {str(e)}'
        }), 500

@push_notifications_bp.route('/health', methods=['GET'])
def health_check():
    """Health check for push notification service"""
    try:
        # Check if VAPID keys are configured
        vapid_public_key = os.getenv('VAPID_PUBLIC_KEY')
        vapid_private_key = os.getenv('VAPID_PRIVATE_KEY_FILE')
        
        if not vapid_public_key or not vapid_private_key:
            return jsonify({
                'success': False,
                'message': 'VAPID keys not configured',
                'vapid_configured': False
            }), 500
        
        # Check notification service
        client = get_notification_client()
        if not client:
            return jsonify({
                'success': False,
                'message': 'Notification client not available'
            }), 500
        
        result = client.check_service_health()
        
        if result.get('status') == 'healthy':
            return jsonify({
                'success': True,
                'message': 'Push notification service is healthy',
                'vapid_configured': True,
                'service_status': result.get('status'),
                'data': result
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': 'Push notification service is unhealthy',
                'vapid_configured': True,
                'service_status': result.get('status'),
                'error': result.get('message')
            }), 500
        
    except Exception as e:
        current_app.logger.error(f"Push notification health check failed: {e}")
        return jsonify({
            'success': False,
            'message': f'Health check failed: {str(e)}'
        }), 500

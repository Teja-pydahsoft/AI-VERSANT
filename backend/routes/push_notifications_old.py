#!/usr/bin/env python3
"""
Push Notification Routes
Handles push notification subscription and sending
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime
from utils.push_notification_service import (
    subscribe_user_to_push,
    unsubscribe_user_from_push,
    send_push_to_user,
    send_push_to_all,
    get_push_stats,
    get_vapid_public_key
)
import logging

# Configure logging
logger = logging.getLogger(__name__)

push_notifications_bp = Blueprint('push_notifications', __name__)

@push_notifications_bp.route('/vapid-key', methods=['GET'])
def get_vapid_key():
    """Get VAPID public key for frontend"""
    try:
        public_key = get_vapid_public_key()
        if not public_key:
            return jsonify({
                'success': False,
                'message': 'VAPID keys not configured'
            }), 500
        
        return jsonify({
            'success': True,
            'public_key': public_key
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Error getting VAPID key: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to get VAPID key: {str(e)}'
        }), 500

@push_notifications_bp.route('/subscribe', methods=['POST'])
@jwt_required()
def subscribe():
    """Subscribe user to push notifications"""
    try:
        current_user_id = get_jwt_identity()
        data = request.get_json()
        
        if not data or not data.get('subscription'):
            return jsonify({
                'success': False,
                'message': 'Subscription data is required'
            }), 400
        
        result = subscribe_user_to_push(current_user_id, data['subscription'])
        
        if result['success']:
            return jsonify({
                'success': True,
                'message': result['message'],
                'total_subscriptions': result['total_subscriptions']
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': result['error']
            }), 400
            
    except Exception as e:
        logger.error(f"❌ Error subscribing user: {e}")
        return jsonify({
            'success': False,
            'message': f'Subscription failed: {str(e)}'
        }), 500

@push_notifications_bp.route('/unsubscribe', methods=['POST'])
@jwt_required()
def unsubscribe():
    """Unsubscribe user from push notifications"""
    try:
        current_user_id = get_jwt_identity()
        data = request.get_json()
        
        logger.info(f"🔍 Unsubscribe request from user: {current_user_id}")
        logger.info(f"🔍 Request data: {data}")
        
        endpoint = data.get('endpoint') if data else None
        result = unsubscribe_user_from_push(current_user_id, endpoint)
        
        logger.info(f"🔍 Unsubscribe result: {result}")
        
        if result['success']:
            return jsonify({
                'success': True,
                'message': result['message']
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': result['error']
            }), 400
            
    except Exception as e:
        logger.error(f"❌ Error unsubscribing user: {e}")
        return jsonify({
            'success': False,
            'message': f'Unsubscription failed: {str(e)}'
        }), 500

@push_notifications_bp.route('/send-to-user', methods=['POST'])
@jwt_required()
def send_to_user():
    """Send push notification to specific user (admin only)"""
    try:
        current_user_id = get_jwt_identity()
        data = request.get_json()
        
        # Check if user has admin privileges
        from utils.connection_manager import get_mongo_database
        mongo_db = get_mongo_database()
        user = mongo_db.users.find_one({'_id': current_user_id})
        
        if not user or user.get('role') not in ['superadmin', 'campus_admin', 'course_admin']:
            return jsonify({
                'success': False,
                'message': 'Insufficient permissions'
            }), 403
        
        if not data or not data.get('user_id') or not data.get('title') or not data.get('body'):
            return jsonify({
                'success': False,
                'message': 'user_id, title, and body are required'
            }), 400
        
        task_id = send_push_to_user(
            user_id=data['user_id'],
            title=data['title'],
            body=data['body'],
            data=data.get('data', {}),
            icon=data.get('icon'),
            url=data.get('url')
        )
        
        if task_id:
            return jsonify({
                'success': True,
                'message': 'Push notification queued successfully',
                'task_id': task_id
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to queue push notification'
            }), 500
            
    except Exception as e:
        logger.error(f"❌ Error sending push to user: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to send push notification: {str(e)}'
        }), 500

@push_notifications_bp.route('/send-to-role', methods=['POST'])
@jwt_required()
def send_to_role():
    """Send push notification to users with specific role (admin only)"""
    try:
        current_user_id = get_jwt_identity()
        data = request.get_json()
        
        # Check if user has admin privileges
        from utils.connection_manager import get_mongo_database
        mongo_db = get_mongo_database()
        user = mongo_db.users.find_one({'_id': current_user_id})
        
        if not user or user.get('role') not in ['superadmin', 'campus_admin', 'course_admin']:
            return jsonify({
                'success': False,
                'message': 'Insufficient permissions'
            }), 403
        
        if not data or not data.get('role') or not data.get('title') or not data.get('body'):
            return jsonify({
                'success': False,
                'message': 'role, title, and body are required'
            }), 400
        
        task_id = send_push_to_role(
            role=data['role'],
            title=data['title'],
            body=data['body'],
            data=data.get('data', {}),
            icon=data.get('icon'),
            url=data.get('url')
        )
        
        if task_id:
            return jsonify({
                'success': True,
                'message': f'Push notification queued for {data["role"]} users',
                'task_id': task_id
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to queue push notification'
            }), 500
            
    except Exception as e:
        logger.error(f"❌ Error sending push to role: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to send push notification: {str(e)}'
        }), 500

@push_notifications_bp.route('/broadcast', methods=['POST'])
@jwt_required()
def broadcast():
    """Send push notification to all users (superadmin only)"""
    try:
        current_user_id = get_jwt_identity()
        data = request.get_json()
        
        # Check if user has superadmin privileges
        from utils.connection_manager import get_mongo_database
        mongo_db = get_mongo_database()
        user = mongo_db.users.find_one({'_id': current_user_id})
        
        if not user or user.get('role') != 'superadmin':
            return jsonify({
                'success': False,
                'message': 'Superadmin privileges required'
            }), 403
        
        if not data or not data.get('title') or not data.get('body'):
            return jsonify({
                'success': False,
                'message': 'title and body are required'
            }), 400
        
        task_id = send_push_to_all(
            title=data['title'],
            body=data['body'],
            data=data.get('data', {}),
            icon=data.get('icon'),
            url=data.get('url')
        )
        
        if task_id:
            return jsonify({
                'success': True,
                'message': 'Broadcast push notification queued successfully',
                'task_id': task_id
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to queue broadcast push notification'
            }), 500
            
    except Exception as e:
        logger.error(f"❌ Error broadcasting push: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to broadcast push notification: {str(e)}'
        }), 500

@push_notifications_bp.route('/stats', methods=['GET'])
@jwt_required()
def get_stats():
    """Get push notification statistics (admin only)"""
    try:
        current_user_id = get_jwt_identity()
        
        # Check if user has admin privileges
        from utils.connection_manager import get_mongo_database
        mongo_db = get_mongo_database()
        user = mongo_db.users.find_one({'_id': current_user_id})
        
        if not user or user.get('role') not in ['superadmin', 'campus_admin', 'course_admin']:
            return jsonify({
                'success': False,
                'message': 'Insufficient permissions'
            }), 403
        
        stats = get_push_stats()
        
        return jsonify({
            'success': True,
            'data': stats
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Error getting push stats: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to get statistics: {str(e)}'
        }), 500

@push_notifications_bp.route('/test', methods=['POST'])
@jwt_required()
def test_notification():
    """Send test push notification to current user"""
    try:
        current_user_id = get_jwt_identity()
        
        task_id = send_push_to_user(
            user_id=current_user_id,
            title="Test Notification",
            body="This is a test push notification from VERSANT!",
            data={'type': 'test', 'timestamp': str(datetime.utcnow())},
            icon='/icon-192x192.png',
            url='/'
        )
        
        if task_id:
            return jsonify({
                'success': True,
                'message': 'Test push notification queued successfully',
                'task_id': task_id
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to queue test push notification'
            }), 500
            
    except Exception as e:
        logger.error(f"❌ Error sending test push: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to send test push notification: {str(e)}'
        }), 500


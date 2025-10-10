"""
Web Push Notifications Routes
Handles web push subscription and notification endpoints
"""
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from services.webPushService import webPushService
from datetime import datetime
import os

web_push_bp = Blueprint('web_push', __name__)

@web_push_bp.route('/vapid-public-key', methods=['GET'])
def get_vapid_public_key():
    """Get VAPID public key for frontend"""
    try:
        public_key = os.getenv('VAPID_PUBLIC_KEY')
        if not public_key:
            return jsonify({
                'success': False,
                'message': 'VAPID public key not configured'
            }), 500
            
        return jsonify({
            'success': True,
            'publicKey': public_key
        }), 200
    except Exception as e:
        current_app.logger.error(f"Error getting VAPID public key: {e}")
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@web_push_bp.route('/subscribe', methods=['POST'])
@jwt_required()
async def subscribe():
    """Subscribe to push notifications"""
    try:
        user_id = get_jwt_identity()
        subscription_data = request.get_json()

        if not subscription_data:
            return jsonify({
                'success': False,
                'message': 'Subscription data is required'
            }), 400

        result = await webPushService.save_subscription(user_id, subscription_data)
        
        if result['success']:
            return jsonify({
                'success': True,
                'message': 'Successfully subscribed to push notifications',
                'subscription_id': result.get('subscription_id')
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': result['error']
            }), 400

    except Exception as e:
        current_app.logger.error(f"Error subscribing to push notifications: {e}")
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@web_push_bp.route('/send', methods=['POST'])
@jwt_required()
async def send_notification():
    """Send push notification to a user"""
    try:
        data = request.get_json()
        required_fields = ['userId', 'title', 'body']
        
        if not all(field in data for field in required_fields):
            return jsonify({
                'success': False,
                'message': f'Missing required fields: {", ".join(required_fields)}'
            }), 400

        result = await webPushService.send_notification(
            user_id=data['userId'],
            title=data['title'],
            body=data['body'],
            data=data.get('data')
        )

        if result['success']:
            return jsonify({
                'success': True,
                'message': 'Push notification sent successfully'
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': result['error']
            }), 400

    except Exception as e:
        current_app.logger.error(f"Error sending push notification: {e}")
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@web_push_bp.route('/test', methods=['POST'])
@jwt_required()
async def test_notification():
    """Send test notification to current user"""
    try:
        user_id = get_jwt_identity()
        
        result = await webPushService.send_notification(
            user_id=user_id,
            title='Test Notification',
            body='This is a test push notification',
            data={
                'type': 'test',
                'timestamp': datetime.utcnow().isoformat()
            }
        )

        if result['success']:
            return jsonify({
                'success': True,
                'message': 'Test notification sent successfully'
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': result['error']
            }), 400

    except Exception as e:
        current_app.logger.error(f"Error sending test notification: {e}")
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500
"""
VAPID Push Notifications Routes
Handles VAPID subscription management
"""

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
import os
from bson import ObjectId
from datetime import datetime
from models_push_subscriptions import PushSubscription

vapid_bp = Blueprint('vapid', __name__)

@vapid_bp.route('/public-key', methods=['GET'])
def get_public_key():
    """Get VAPID public key for subscription"""
    try:
        vapid_public_key = os.getenv('VAPID_PUBLIC_KEY')
        if not vapid_public_key:
            return jsonify({
                'success': False,
                'message': 'VAPID public key not configured'
            }), 500
            
        return jsonify({
            'success': True,
            'publicKey': vapid_public_key
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting VAPID public key: {e}")
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@vapid_bp.route('/subscribe', methods=['POST'])
@jwt_required()
def subscribe():
    """Store VAPID subscription details"""
    try:
        current_user_id = get_jwt_identity()
        data = request.get_json()
        
        subscription = data.get('subscription')
        if not subscription:
            return jsonify({
                'success': False,
                'message': 'Subscription data is required'
            }), 400

        # Verify subscription format
        required_fields = ['endpoint', 'keys']
        required_keys = ['p256dh', 'auth']
        
        if not all(field in subscription for field in required_fields):
            return jsonify({
                'success': False,
                'message': 'Invalid subscription format'
            }), 400
            
        if not all(key in subscription['keys'] for key in required_keys):
            return jsonify({
                'success': False,
                'message': 'Invalid subscription keys'
            }), 400

        # Store VAPID subscription in push_subscriptions collection
        user_agent = data.get('browser') or request.headers.get('User-Agent')
        
        result = PushSubscription.create_vapid_subscription(
            current_user_id, 
            subscription,
            user_agent=user_agent
        )

        if result:
            current_app.logger.info(f"✅ VAPID subscription created for user {current_user_id}")
            return jsonify({
                'success': True,
                'message': 'VAPID subscription updated successfully'
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to update VAPID subscription'
            }), 500

    except Exception as e:
        current_app.logger.error(f"Error updating VAPID subscription: {e}")
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@vapid_bp.route('/unsubscribe', methods=['POST'])
@jwt_required()
def unsubscribe():
    """Remove VAPID subscription"""
    try:
        current_user_id = get_jwt_identity()
        
        # Deactivate VAPID subscription
        result = PushSubscription.deactivate_subscription(current_user_id, 'vapid')
        
        if result:
            current_app.logger.info(f"✅ VAPID subscription deactivated for user {current_user_id}")
            return jsonify({
                'success': True,
                'message': 'VAPID subscription removed successfully'
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': 'No active VAPID subscription found'
            }), 404
        
    except Exception as e:
        current_app.logger.error(f"Error removing VAPID subscription: {e}")
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500
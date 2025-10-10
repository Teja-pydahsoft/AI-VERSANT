"""
Test broadcast notifications using both OneSignal and VAPID
"""
import os
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, exceptions as jwt_exceptions
from datetime import datetime
from mongo import mongo_db
from services.oneSignalService import oneSignalService
from services.vapid_push_service import vapid_service
from models_push_subscriptions import PushSubscription

test_notifications_bp = Blueprint('test_notifications', __name__)

# Error handlers
@test_notifications_bp.errorhandler(jwt_exceptions.NoAuthorizationError)
def handle_no_auth_error(e):
    print(f"❌ JWT Error: No authorization header")
    return jsonify({'success': False, 'message': 'Missing authorization header'}), 401

@test_notifications_bp.errorhandler(jwt_exceptions.InvalidHeaderError)
def handle_invalid_header_error(e):
    print(f"❌ JWT Error: Invalid header - {str(e)}")
    return jsonify({'success': False, 'message': f'Invalid authorization header: {str(e)}'}), 422

@test_notifications_bp.errorhandler(jwt_exceptions.JWTDecodeError)
def handle_decode_error(e):
    print(f"❌ JWT Error: Decode error - {str(e)}")
    return jsonify({'success': False, 'message': f'Invalid token: {str(e)}'}), 422

@test_notifications_bp.errorhandler(Exception)
def handle_general_error(e):
    print(f"❌ General Error: {str(e)}")
    import traceback
    traceback.print_exc()
    return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 500

@test_notifications_bp.before_request
def log_request():
    """Log all requests to this blueprint"""
    print(f"🔔 Blueprint request: {request.method} {request.path}")
    print(f"🔔 Headers: {dict(request.headers)}")

@test_notifications_bp.route('/health', methods=['GET'])
def health_check():
    """Simple health check to verify blueprint is working"""
    return jsonify({'status': 'ok', 'blueprint': 'test_notifications'}), 200

@test_notifications_bp.route('/test-broadcast', methods=['POST'])
@jwt_required()
def test_broadcast_notification():
    """Send test push notification to all subscribed users via notification-service"""
    try:
        print("🔔 Test broadcast endpoint called")
        data = request.get_json()
        print(f"🔔 Request data: {data}")
        
        # Default test message
        title = data.get('title', 'VERSANT Test Notification')
        message = data.get('message', 'This is a test push notification from VERSANT system')
        
        print(f"🔔 Title: {title}, Message: {message}")
        
        # Get notification service URL
        notification_service_url = os.getenv('NOTIFICATION_SERVICE_URL', 'http://localhost:3001')
        
        # Remove trailing /api if present (to avoid double /api)
        notification_service_url = notification_service_url.rstrip('/api').rstrip('/')
        
        # Construct full URL
        broadcast_url = f"{notification_service_url}/api/test-notifications/broadcast"
        
        # Send broadcast via notification-service
        print(f"📡 Sending broadcast to: {broadcast_url}")
        
        try:
            import requests
            response = requests.post(
                broadcast_url,
                json={
                    'title': title,
                    'message': message,
                    'data': {
                        'type': 'test',
                        'timestamp': datetime.now().isoformat(),
                        'sender': 'Super Admin',
                        'url': '/student/dashboard'
                    }
                },
                timeout=30
            )
            
            print(f"📡 Notification service response: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                print(f"✅ Broadcast result: {result}")
                
                return jsonify({
                    'success': result.get('success', False),
                    'message': result.get('message', 'Broadcast sent'),
                    'details': {
                        'total_sent': result.get('data', {}).get('total_sent', 0),
                        'total_failed': result.get('data', {}).get('total_failed', 0),
                        'onesignal_status': f"Sent: {result.get('data', {}).get('results', {}).get('onesignal', {}).get('sent', 0)}",
                        'vapid_status': f"Sent: {result.get('data', {}).get('results', {}).get('vapid', {}).get('sent', 0)}",
                        'total_recipients': result.get('data', {}).get('total_sent', 0)
                    }
                }), 200
            else:
                error_msg = response.json().get('message', 'Unknown error') if response.text else 'Service unavailable'
                print(f"❌ Notification service error: {error_msg}")
                return jsonify({
                    'success': False,
                    'message': f'Notification service error: {error_msg}'
                }), 500
                
        except requests.exceptions.ConnectionError:
            print(f"❌ Cannot connect to notification service at {notification_service_url}")
            return jsonify({
                'success': False,
                'message': f'Cannot connect to notification service. Please ensure it is running on port 3001.'
            }), 503
        except requests.exceptions.Timeout:
            print(f"❌ Notification service timeout")
            return jsonify({
                'success': False,
                'message': 'Notification service timeout'
            }), 504
        except Exception as e:
            print(f"❌ Error calling notification service: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({
                'success': False,
                'message': f'Error calling notification service: {str(e)}'
            }), 500

    except Exception as e:
        print(f"❌ Error in test broadcast: {e}")
        import traceback
        traceback.print_exc()
        current_app.logger.error(f"Error in test broadcast: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to send test notifications: {str(e)}'
        }), 500
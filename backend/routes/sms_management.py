from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from bson import ObjectId
from datetime import datetime
import logging

from mongo import mongo_db
from utils.sms_service import (
    send_student_credentials_sms, 
    send_test_scheduled_sms, 
    send_test_reminder_sms,
    check_sms_balance,
    check_sms_configuration
)
from utils.test_reminder_system import (
    send_test_scheduled_notifications,
    send_test_reminder_notifications,
    process_all_reminders
)
from test_reminder_scheduler import (
    schedule_test_reminders,
    schedule_immediate_reminders,
    cancel_test_reminders,
    start_reminder_system
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

sms_bp = Blueprint('sms_management', __name__)

@sms_bp.route('/send-student-credentials', methods=['POST'])
@jwt_required()
def send_student_credentials():
    """Send credentials SMS to a student"""
    try:
        data = request.get_json()
        student_id = data.get('student_id')
        username = data.get('username')
        password = data.get('password')
        login_url = data.get('login_url', 'https://crt.pydahsoft.in')
        
        if not all([student_id, username, password]):
            return jsonify({
                'success': False,
                'message': 'student_id, username, and password are required'
            }), 400
        
        # Get student details
        student = mongo_db.students.find_one({'_id': ObjectId(student_id)})
        if not student:
            return jsonify({
                'success': False,
                'message': 'Student not found'
            }), 404
        
        if not student.get('mobile'):
            return jsonify({
                'success': False,
                'message': 'Student mobile number not found'
            }), 400
        
        # Send SMS
        result = send_student_credentials_sms(
            phone_number=student['mobile'],
            username=username,
            password=password,
            login_url=login_url
        )
        
        if result.get('success'):
            return jsonify({
                'success': True,
                'message': 'Credentials SMS sent successfully',
                'data': result
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to send credentials SMS',
                'error': result.get('error')
            }), 500
            
    except Exception as e:
        logger.error(f"Error sending student credentials SMS: {e}")
        return jsonify({
            'success': False,
            'message': 'Internal server error',
            'error': str(e)
        }), 500

@sms_bp.route('/send-test-scheduled', methods=['POST'])
@jwt_required()
def send_test_scheduled():
    """Send test scheduled SMS to all assigned students"""
    try:
        data = request.get_json()
        test_id = data.get('test_id')
        
        if not test_id:
            return jsonify({
                'success': False,
                'message': 'test_id is required'
            }), 400
        
        # Send test scheduled notifications
        result = send_test_scheduled_notifications(test_id)
        
        if result.get('success'):
            return jsonify({
                'success': True,
                'message': 'Test scheduled SMS sent successfully',
                'data': result
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to send test scheduled SMS',
                'error': result.get('error')
            }), 500
            
    except Exception as e:
        logger.error(f"Error sending test scheduled SMS: {e}")
        return jsonify({
            'success': False,
            'message': 'Internal server error',
            'error': str(e)
        }), 500

@sms_bp.route('/send-test-reminders', methods=['POST'])
@jwt_required()
async def send_test_reminders():
    """Send test reminder SMS to unattempted students"""
    try:
        data = request.get_json()
        test_id = data.get('test_id')
        
        if not test_id:
            return jsonify({
                'success': False,
                'message': 'test_id is required'
            }), 400
        
        # Send test reminder notifications
        result = await send_test_reminder_notifications(test_id)
        
        if result.get('success'):
            return jsonify({
                'success': True,
                'message': 'Test reminder SMS sent successfully',
                'data': result
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to send test reminder SMS',
                'error': result.get('error')
            }), 500
            
    except Exception as e:
        logger.error(f"Error sending test reminder SMS: {e}")
        return jsonify({
            'success': False,
            'message': 'Internal server error',
            'error': str(e)
        }), 500

@sms_bp.route('/schedule-test-reminders', methods=['POST'])
@jwt_required()
def schedule_test_reminders_endpoint():
    """Schedule automated reminders for a test"""
    try:
        data = request.get_json()
        test_id = data.get('test_id')
        start_time = data.get('start_time')
        end_time = data.get('end_time')
        
        if not all([test_id, start_time, end_time]):
            return jsonify({
                'success': False,
                'message': 'test_id, start_time, and end_time are required'
            }), 400
        
        # Parse datetime strings
        try:
            start_dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
            end_dt = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
        except ValueError as e:
            return jsonify({
                'success': False,
                'message': 'Invalid datetime format. Use ISO format.'
            }), 400
        
        # Schedule reminders
        success = schedule_test_reminders(test_id, start_dt, end_dt)
        
        if success:
            return jsonify({
                'success': True,
                'message': 'Test reminders scheduled successfully'
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to schedule test reminders'
            }), 500
            
    except Exception as e:
        logger.error(f"Error scheduling test reminders: {e}")
        return jsonify({
            'success': False,
            'message': 'Internal server error',
            'error': str(e)
        }), 500

@sms_bp.route('/cancel-test-reminders', methods=['POST'])
@jwt_required()
def cancel_test_reminders_endpoint():
    """Cancel scheduled reminders for a test"""
    try:
        data = request.get_json()
        test_id = data.get('test_id')
        
        if not test_id:
            return jsonify({
                'success': False,
                'message': 'test_id is required'
            }), 400
        
        # Cancel reminders
        success = cancel_test_reminders(test_id)
        
        if success:
            return jsonify({
                'success': True,
                'message': 'Test reminders cancelled successfully'
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to cancel test reminders'
            }), 500
            
    except Exception as e:
        logger.error(f"Error cancelling test reminders: {e}")
        return jsonify({
            'success': False,
            'message': 'Internal server error',
            'error': str(e)
        }), 500

@sms_bp.route('/process-all-reminders', methods=['POST'])
@jwt_required()
def process_all_reminders_endpoint():
    """Process all pending reminders"""
    try:
        result = process_all_reminders()
        
        if result.get('success'):
            return jsonify({
                'success': True,
                'message': 'All reminders processed successfully',
                'data': result
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to process reminders',
                'error': result.get('error')
            }), 500
            
    except Exception as e:
        logger.error(f"Error processing all reminders: {e}")
        return jsonify({
            'success': False,
            'message': 'Internal server error',
            'error': str(e)
        }), 500

@sms_bp.route('/sms-balance', methods=['GET'])
@jwt_required()
def get_sms_balance():
    """Get SMS balance"""
    try:
        result = check_sms_balance()
        
        if result.get('success'):
            return jsonify({
                'success': True,
                'data': result
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to get SMS balance',
                'error': result.get('error')
            }), 500
            
    except Exception as e:
        logger.error(f"Error getting SMS balance: {e}")
        return jsonify({
            'success': False,
            'message': 'Internal server error',
            'error': str(e)
        }), 500

@sms_bp.route('/sms-configuration', methods=['GET'])
@jwt_required()
def get_sms_configuration():
    """Get SMS configuration status"""
    try:
        result = check_sms_configuration()
        
        return jsonify({
            'success': True,
            'data': result
        })
        
    except Exception as e:
        logger.error(f"Error getting SMS configuration: {e}")
        return jsonify({
            'success': False,
            'message': 'Internal server error',
            'error': str(e)
        }), 500

@sms_bp.route('/start-reminder-system', methods=['POST'])
@jwt_required()
def start_reminder_system_endpoint():
    """Start the automated reminder system"""
    try:
        success = start_reminder_system()
        
        if success:
            return jsonify({
                'success': True,
                'message': 'Reminder system started successfully'
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to start reminder system'
            }), 500
            
    except Exception as e:
        logger.error(f"Error starting reminder system: {e}")
        return jsonify({
            'success': False,
            'message': 'Internal server error',
            'error': str(e)
        }), 500

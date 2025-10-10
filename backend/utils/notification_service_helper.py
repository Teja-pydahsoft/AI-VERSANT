"""
Notification Service Helper
Helper functions to send notifications via the notification service
"""

import os
import logging
import requests

logger = logging.getLogger(__name__)

# Notification service URL
NOTIFICATION_SERVICE_URL = os.getenv('NOTIFICATION_SERVICE_URL', 'http://localhost:3001')


def send_student_credentials_to_notification_service(students_data):
    """
    Send student credentials to notification service (fire-and-forget)
    
    Args:
        students_data: List of student dictionaries with keys:
            - email
            - name
            - username
            - password
            - mobile_number
    
    Returns:
        bool: True if requests were sent (even if they timeout)
    """
    try:
        notification_service_url = NOTIFICATION_SERVICE_URL.rstrip('/api').rstrip('/')
        
        logger.info(f"📧📱 Sending {len(students_data)} student credentials to notification service")
        
        # Send each student's credentials (fire-and-forget)
        for student_data in students_data:
            try:
                email_url = f"{notification_service_url}/api/email/send-credentials"
                sms_url = f"{notification_service_url}/api/sms/send-credentials"
                
                # Send email (fire-and-forget)
                try:
                    requests.post(
                        email_url,
                        json={
                            'email': student_data.get('email'),
                            'name': student_data.get('name'),
                            'username': student_data.get('username'),
                            'password': student_data.get('password'),
                            'loginUrl': 'https://crt.pydahsoft.in/login'
                        },
                        timeout=1  # Fire-and-forget
                    )
                except:
                    pass  # Ignore errors - fire and forget
                
                # Send SMS (fire-and-forget)
                try:
                    requests.post(
                        sms_url,
                        json={
                            'phone': student_data.get('mobile_number'),
                            'username': student_data.get('username'),
                            'password': student_data.get('password')
                        },
                        timeout=1  # Fire-and-forget
                    )
                except:
                    pass  # Ignore errors - fire and forget
                    
            except Exception as e:
                logger.debug(f"Error sending credentials for student: {e}")
                pass  # Ignore errors - fire and forget
        
        logger.info(f"✅ Student credentials queued in notification service")
        return True
            
    except Exception as e:
        logger.warning(f"⚠️ Failed to queue student credentials in notification service: {e}")
        return False


def send_test_created_notification(test_id):
    """
    Send test created notification to notification service (fire-and-forget)
    
    Args:
        test_id: MongoDB ObjectId of the test (as string)
    
    Returns:
        bool: True if request was sent (even if it times out)
    """
    try:
        notification_service_url = NOTIFICATION_SERVICE_URL.rstrip('/api').rstrip('/')
        email_sms_notification_url = f"{notification_service_url}/api/notifications/test-created"
        
        logger.info(f"📧📱 Sending email & SMS notifications for test: {test_id}")
        
        # Fire-and-forget: don't wait for response
        requests.post(
            email_sms_notification_url,
            json={'test_id': test_id},
            timeout=1  # Very short timeout - fire and forget
        )
        
        logger.info(f"✅ Email & SMS notifications queued for test: {test_id}")
        return True
            
    except requests.exceptions.Timeout:
        logger.debug(f"📧 Email & SMS notification request sent (timeout expected): {test_id}")
        return True
    except Exception as e:
        logger.warning(f"⚠️ Failed to queue email & SMS notifications: {e}")
        return False


def send_push_notification(test_id):
    """
    Send push notification to notification service (fire-and-forget)
    
    Args:
        test_id: MongoDB ObjectId of the test (as string)
    
    Returns:
        bool: True if request was sent (even if it times out)
    """
    try:
        notification_service_url = NOTIFICATION_SERVICE_URL.rstrip('/api').rstrip('/')
        push_notification_url = f"{notification_service_url}/api/test-notifications/test-created"
        
        logger.info(f"📱 Sending push notifications for test: {test_id}")
        
        # Fire-and-forget: don't wait for response
        requests.post(
            push_notification_url,
            json={'test_id': test_id},
            timeout=1  # Very short timeout - fire and forget
        )
        
        logger.info(f"✅ Push notifications queued for test: {test_id}")
        return True
            
    except requests.exceptions.Timeout:
        logger.debug(f"📱 Push notification request sent (timeout expected): {test_id}")
        return True
    except Exception as e:
        logger.warning(f"⚠️ Failed to queue push notifications: {e}")
        return False

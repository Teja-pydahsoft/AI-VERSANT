"""
Notification Service Client
Sends email and SMS notifications to the notification service (fire-and-forget)
"""

import os
import logging
import requests
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

# Notification service URL
NOTIFICATION_SERVICE_URL = os.getenv('NOTIFICATION_SERVICE_URL', 'http://localhost:3001/api')

# Timeout for fire-and-forget requests (very short)
REQUEST_TIMEOUT = 1  # 1 second - don't wait for response


def send_email_credentials(email: str, name: str, username: str, password: str, login_url: str = 'https://crt.pydahsoft.in/login') -> bool:
    """
    Send student credentials email via notification service
    Fire-and-forget: doesn't wait for response
    """
    try:
        url = f"{NOTIFICATION_SERVICE_URL}/email/send-credentials"
        payload = {
            'email': email,
            'name': name,
            'username': username,
            'password': password,
            'loginUrl': login_url
        }
        
        logger.info(f"📧 Sending credentials email to notification service for: {email}")
        
        # Fire and forget - don't wait for response
        requests.post(url, json=payload, timeout=REQUEST_TIMEOUT)
        return True
        
    except requests.exceptions.Timeout:
        # Timeout is expected for fire-and-forget
        logger.debug(f"📧 Email request sent (timeout expected): {email}")
        return True
    except Exception as e:
        logger.error(f"❌ Failed to send email request to notification service: {e}")
        return False


def send_email_test_notification(email: str, name: str, test_name: str, test_type: str, login_url: str = 'https://crt.pydahsoft.in/login') -> bool:
    """
    Send test notification email via notification service
    Fire-and-forget: doesn't wait for response
    """
    try:
        url = f"{NOTIFICATION_SERVICE_URL}/email/send-test-notification"
        payload = {
            'email': email,
            'name': name,
            'testName': test_name,
            'testType': test_type,
            'loginUrl': login_url
        }
        
        logger.info(f"📧 Sending test notification email to notification service for: {email}")
        
        # Fire and forget - don't wait for response
        requests.post(url, json=payload, timeout=REQUEST_TIMEOUT)
        return True
        
    except requests.exceptions.Timeout:
        # Timeout is expected for fire-and-forget
        logger.debug(f"📧 Email request sent (timeout expected): {email}")
        return True
    except Exception as e:
        logger.error(f"❌ Failed to send email request to notification service: {e}")
        return False


def send_email_test_reminder(email: str, name: str, test_name: str, test_id: str, login_url: str = 'https://crt.pydahsoft.in/student/exam') -> bool:
    """
    Send test reminder email via notification service
    Fire-and-forget: doesn't wait for response
    """
    try:
        url = f"{NOTIFICATION_SERVICE_URL}/email/send-test-reminder"
        payload = {
            'email': email,
            'name': name,
            'testName': test_name,
            'testId': test_id,
            'loginUrl': login_url
        }
        
        logger.info(f"📧 Sending test reminder email to notification service for: {email}")
        
        # Fire and forget - don't wait for response
        requests.post(url, json=payload, timeout=REQUEST_TIMEOUT)
        return True
        
    except requests.exceptions.Timeout:
        # Timeout is expected for fire-and-forget
        logger.debug(f"📧 Email request sent (timeout expected): {email}")
        return True
    except Exception as e:
        logger.error(f"❌ Failed to send email request to notification service: {e}")
        return False


def send_batch_emails(emails: List[Dict], notification_type: str, data: Dict) -> bool:
    """
    Send batch emails via notification service
    Fire-and-forget: doesn't wait for response
    
    Args:
        emails: List of email data [{'email': '...', 'name': '...', ...}]
        notification_type: 'credentials', 'test_notification', or 'test_reminder'
        data: Additional data needed for the notification type
    """
    try:
        url = f"{NOTIFICATION_SERVICE_URL}/email/send-batch"
        payload = {
            'emails': emails,
            'type': notification_type,
            'data': data
        }
        
        logger.info(f"📧 Sending batch of {len(emails)} emails to notification service")
        
        # Fire and forget - don't wait for response
        requests.post(url, json=payload, timeout=REQUEST_TIMEOUT)
        return True
        
    except requests.exceptions.Timeout:
        # Timeout is expected for fire-and-forget
        logger.debug(f"📧 Batch email request sent (timeout expected): {len(emails)} emails")
        return True
    except Exception as e:
        logger.error(f"❌ Failed to send batch email request to notification service: {e}")
        return False


def send_sms_credentials(phone: str, username: str, password: str) -> bool:
    """
    Send student credentials SMS via notification service
    Fire-and-forget: doesn't wait for response
    """
    try:
        url = f"{NOTIFICATION_SERVICE_URL}/sms/send-credentials"
        payload = {
            'phone': phone,
            'username': username,
            'password': password
        }
        
        logger.info(f"📱 Sending credentials SMS to notification service for: {phone}")
        
        # Fire and forget - don't wait for response
        requests.post(url, json=payload, timeout=REQUEST_TIMEOUT)
        return True
        
    except requests.exceptions.Timeout:
        # Timeout is expected for fire-and-forget
        logger.debug(f"📱 SMS request sent (timeout expected): {phone}")
        return True
    except Exception as e:
        logger.error(f"❌ Failed to send SMS request to notification service: {e}")
        return False


def send_sms_test_scheduled(phone: str, test_name: str, start_time: str, test_id: str) -> bool:
    """
    Send test scheduled SMS via notification service
    Fire-and-forget: doesn't wait for response
    """
    try:
        url = f"{NOTIFICATION_SERVICE_URL}/sms/send-test-scheduled"
        payload = {
            'phone': phone,
            'testName': test_name,
            'startTime': start_time,
            'testId': test_id
        }
        
        logger.info(f"📱 Sending test scheduled SMS to notification service for: {phone}")
        
        # Fire and forget - don't wait for response
        requests.post(url, json=payload, timeout=REQUEST_TIMEOUT)
        return True
        
    except requests.exceptions.Timeout:
        # Timeout is expected for fire-and-forget
        logger.debug(f"📱 SMS request sent (timeout expected): {phone}")
        return True
    except Exception as e:
        logger.error(f"❌ Failed to send SMS request to notification service: {e}")
        return False


def send_sms_test_reminder(phone: str, test_name: str, test_id: str) -> bool:
    """
    Send test reminder SMS via notification service
    Fire-and-forget: doesn't wait for response
    """
    try:
        url = f"{NOTIFICATION_SERVICE_URL}/sms/send-test-reminder"
        payload = {
            'phone': phone,
            'testName': test_name,
            'testId': test_id
        }
        
        logger.info(f"📱 Sending test reminder SMS to notification service for: {phone}")
        
        # Fire and forget - don't wait for response
        requests.post(url, json=payload, timeout=REQUEST_TIMEOUT)
        return True
        
    except requests.exceptions.Timeout:
        # Timeout is expected for fire-and-forget
        logger.debug(f"📱 SMS request sent (timeout expected): {phone}")
        return True
    except Exception as e:
        logger.error(f"❌ Failed to send SMS request to notification service: {e}")
        return False


def send_batch_sms(messages: List[Dict], notification_type: str, data: Dict) -> bool:
    """
    Send batch SMS via notification service
    Fire-and-forget: doesn't wait for response
    
    Args:
        messages: List of SMS data [{'phone': '...', ...}]
        notification_type: 'credentials', 'test_scheduled', 'test_reminder', or 'result'
        data: Additional data needed for the notification type
    """
    try:
        url = f"{NOTIFICATION_SERVICE_URL}/sms/send-batch"
        payload = {
            'messages': messages,
            'type': notification_type,
            'data': data
        }
        
        logger.info(f"📱 Sending batch of {len(messages)} SMS to notification service")
        
        # Fire and forget - don't wait for response
        requests.post(url, json=payload, timeout=REQUEST_TIMEOUT)
        return True
        
    except requests.exceptions.Timeout:
        # Timeout is expected for fire-and-forget
        logger.debug(f"📱 Batch SMS request sent (timeout expected): {len(messages)} messages")
        return True
    except Exception as e:
        logger.error(f"❌ Failed to send batch SMS request to notification service: {e}")
        return False


def send_combined_notification(
    email: str,
    phone: str,
    name: str,
    notification_type: str,
    **kwargs
) -> Dict[str, bool]:
    """
    Send both email and SMS notification
    Fire-and-forget: doesn't wait for responses
    
    Args:
        email: Email address
        phone: Phone number
        name: Student/user name
        notification_type: 'credentials', 'test_notification', or 'test_reminder'
        **kwargs: Additional parameters based on notification type
    
    Returns:
        Dict with email_sent and sms_sent status
    """
    email_sent = False
    sms_sent = False
    
    if notification_type == 'credentials':
        username = kwargs.get('username')
        password = kwargs.get('password')
        login_url = kwargs.get('login_url', 'https://crt.pydahsoft.in/login')
        
        email_sent = send_email_credentials(email, name, username, password, login_url)
        sms_sent = send_sms_credentials(phone, username, password)
        
    elif notification_type == 'test_notification':
        test_name = kwargs.get('test_name')
        test_type = kwargs.get('test_type')
        start_time = kwargs.get('start_time')
        test_id = kwargs.get('test_id')
        login_url = kwargs.get('login_url', 'https://crt.pydahsoft.in/login')
        
        email_sent = send_email_test_notification(email, name, test_name, test_type, login_url)
        sms_sent = send_sms_test_scheduled(phone, test_name, start_time, test_id)
        
    elif notification_type == 'test_reminder':
        test_name = kwargs.get('test_name')
        test_id = kwargs.get('test_id')
        login_url = kwargs.get('login_url', 'https://crt.pydahsoft.in/student/exam')
        
        email_sent = send_email_test_reminder(email, name, test_name, test_id, login_url)
        sms_sent = send_sms_test_reminder(phone, test_name, test_id)
    
    return {
        'email_sent': email_sent,
        'sms_sent': sms_sent
    }

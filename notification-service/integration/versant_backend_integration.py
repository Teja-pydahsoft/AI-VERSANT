#!/usr/bin/env python3
"""
VERSANT Backend Integration for Notification Service
This file shows how to integrate the notification service with your existing Flask backend
"""

import requests
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime

logger = logging.getLogger(__name__)

class NotificationServiceClient:
    """Client for communicating with the notification service"""
    
    def __init__(self, base_url: str = "http://localhost:3001", api_key: str = "default-api-key"):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'X-API-Key': api_key
        })
    
    def send_notification(self, notification_type: str, recipient: str, content: str, 
                         template: str = None, priority: int = 3, metadata: Dict = None) -> Dict:
        """Send a single notification"""
        try:
            payload = {
                'type': notification_type,
                'recipient': recipient,
                'content': content,
                'template': template,
                'priority': priority,
                'metadata': metadata or {}
            }
            
            response = self.session.post(
                f"{self.base_url}/api/notifications/send",
                json=payload,
                timeout=10
            )
            
            if response.status_code == 200:
                logger.info(f"✅ Notification sent: {notification_type} to {recipient}")
                return response.json()
            else:
                logger.error(f"❌ Notification failed: {response.status_code} - {response.text}")
                return {'success': False, 'error': response.text}
                
        except Exception as e:
            logger.error(f"❌ Notification service error: {e}")
            return {'success': False, 'error': str(e)}
    
    def send_batch_notifications(self, notifications: List[Dict], priority: int = 3) -> Dict:
        """Send multiple notifications in batch"""
        try:
            payload = {
                'notifications': notifications,
                'priority': priority
            }
            
            response = self.session.post(
                f"{self.base_url}/api/notifications/batch",
                json=payload,
                timeout=30
            )
            
            if response.status_code == 200:
                logger.info(f"✅ Batch notifications sent: {len(notifications)} notifications")
                return response.json()
            else:
                logger.error(f"❌ Batch notifications failed: {response.status_code} - {response.text}")
                return {'success': False, 'error': response.text}
                
        except Exception as e:
            logger.error(f"❌ Batch notification service error: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_notification_status(self, notification_id: str) -> Dict:
        """Get status of a specific notification"""
        try:
            response = self.session.get(
                f"{self.base_url}/api/notifications/status/{notification_id}",
                timeout=5
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                return {'success': False, 'error': response.text}
                
        except Exception as e:
            logger.error(f"❌ Error getting notification status: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_notification_stats(self, notification_type: str = None, 
                             start_date: str = None, end_date: str = None) -> Dict:
        """Get notification statistics"""
        try:
            params = {}
            if notification_type:
                params['type'] = notification_type
            if start_date:
                params['startDate'] = start_date
            if end_date:
                params['endDate'] = end_date
            
            response = self.session.get(
                f"{self.base_url}/api/notifications/stats",
                params=params,
                timeout=5
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                return {'success': False, 'error': response.text}
                
        except Exception as e:
            logger.error(f"❌ Error getting notification stats: {e}")
            return {'success': False, 'error': str(e)}

# Global notification service client instance
notification_client = NotificationServiceClient()

# Convenience functions for easy integration
def send_email_notification(email: str, subject: str, content: str, 
                           template: str = None, metadata: Dict = None) -> Dict:
    """Send email notification via notification service"""
    return notification_client.send_notification(
        notification_type='email',
        recipient=email,
        content=content,
        template=template,
        metadata={**(metadata or {}), 'subject': subject}
    )

def send_sms_notification(phone: str, message: str, template: str = None, 
                         metadata: Dict = None) -> Dict:
    """Send SMS notification via notification service"""
    return notification_client.send_notification(
        notification_type='sms',
        recipient=phone,
        content=message,
        template=template,
        metadata=metadata
    )

def send_push_notification(subscription: str, title: str, body: str, 
                          template: str = None, metadata: Dict = None) -> Dict:
    """Send push notification via notification service"""
    return notification_client.send_notification(
        notification_type='push',
        recipient=subscription,
        content=body,
        template=template,
        metadata={**(metadata or {}), 'title': title}
    )

def send_student_credentials_notifications(students: List[Dict]) -> Dict:
    """Send student credentials notifications in batch"""
    notifications = []
    
    for student in students:
        # Email notification
        if student.get('email'):
            email_content = f"""
            <h2>Welcome to VERSANT!</h2>
            <p>Dear {student.get('name', 'Student')},</p>
            <p>Your account has been created successfully. Here are your login credentials:</p>
            <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #3498db;">
                <p><strong>Username:</strong> {student.get('username')}</p>
                <p><strong>Password:</strong> {student.get('password')}</p>
                <p><strong>Email:</strong> {student.get('email')}</p>
            </div>
            <p>Please log in to your account using the link below:</p>
            <a href="https://crt.pydahsoft.in/login" style="background-color: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">
                Login to VERSANT
            </a>
            """
            
            notifications.append({
                'type': 'email',
                'recipient': student['email'],
                'content': email_content,
                'template': 'student_credentials',
                'metadata': {
                    'subject': 'Welcome to VERSANT - Your Student Credentials',
                    'student_name': student.get('name'),
                    'username': student.get('username'),
                    'password': student.get('password')
                }
            })
        
        # SMS notification
        if student.get('mobile_number'):
            sms_content = f"Welcome to VERSANT! Username: {student.get('username')} Password: {student.get('password')} Login: https://crt.pydahsoft.in/login"
            
            notifications.append({
                'type': 'sms',
                'recipient': student['mobile_number'],
                'content': sms_content,
                'template': 'student_credentials_sms',
                'metadata': {
                    'student_name': student.get('name'),
                    'username': student.get('username'),
                    'password': student.get('password')
                }
            })
    
    return notification_client.send_batch_notifications(notifications)

def send_form_submission_notification(student_email: str, student_name: str) -> Dict:
    """Send form submission confirmation notification"""
    email_content = f"""
    <h2>Form Submission Confirmation</h2>
    <p>Dear {student_name},</p>
    <p>Your form has been submitted successfully. Thank you for your submission.</p>
    <p>Best regards,<br>VERSANT Team</p>
    """
    
    return send_email_notification(
        email=student_email,
        subject="Form Submission Confirmation",
        content=email_content,
        metadata={'student_name': student_name}
    )

def send_test_notification(student_email: str, student_name: str, test_name: str, 
                          test_type: str, test_id: str) -> Dict:
    """Send test notification to student"""
    email_content = f"""
    <h2>New Test Assignment</h2>
    <p>Dear {student_name},</p>
    <p>A new test has been assigned to you:</p>
    <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #3498db;">
        <p><strong>Test Name:</strong> {test_name}</p>
        <p><strong>Test Type:</strong> {test_type}</p>
    </div>
    <p>Please log in to your account to attempt the test:</p>
    <a href="https://crt.pydahsoft.in/student/exam/{test_id}" style="background-color: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">
        Attempt Test Now
    </a>
    """
    
    return send_email_notification(
        email=student_email,
        subject=f"New Test Assigned: {test_name}",
        content=email_content,
        metadata={
            'student_name': student_name,
            'test_name': test_name,
            'test_type': test_type,
            'test_id': test_id
        }
    )

# Example usage in your existing routes:
"""
# In your batch_management.py route:
from notification_service_integration import send_student_credentials_notifications

# After successful student upload:
if result.inserted_id:
    # Send notifications via notification service
    notification_result = send_student_credentials_notifications(students_data)
    if notification_result.get('success'):
        print(f"✅ Notifications queued: {notification_result['data']['queued']} notifications")
    else:
        print(f"⚠️ Notification service error: {notification_result.get('error')}")

# In your form_submissions.py route:
from notification_service_integration import send_form_submission_notification

# After successful form submission:
if status == 'submitted':
    notification_result = send_form_submission_notification(student_email, student_name)
    if notification_result.get('success'):
        print("✅ Form submission notification sent")
    else:
        print(f"⚠️ Notification error: {notification_result.get('error')}")
"""

"""
VERSANT Flask Backend Integration Client
This module provides easy integration with the VERSANT Notification Service
"""

import requests
import json
import logging
from typing import Dict, List, Optional, Union

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class VERSANTNotificationClient:
    """
    Client for integrating with VERSANT Notification Service
    """
    
    def __init__(self, notification_service_url: str = "http://localhost:3001/api"):
        """
        Initialize the notification client
        
        Args:
            notification_service_url: Base URL of the notification service
        """
        self.base_url = notification_service_url.rstrip('/')
        self.session = requests.Session()
        
        # Set default headers
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'VERSANT-Flask-Backend/1.0'
        })
    
    def register_user_subscription(self, user_id: str, user_email: str, 
                                 subscription: Dict, device_info: Optional[Dict] = None) -> Dict:
        """
        Register a user's push notification subscription
        
        Args:
            user_id: Unique user identifier
            user_email: User's email address
            subscription: Browser subscription object with endpoint and keys
            device_info: Optional device information
            
        Returns:
            Dict with success status and subscription details
        """
        try:
            payload = {
                'userId': user_id,
                'userEmail': user_email,
                'subscription': subscription,
                'deviceInfo': device_info or {}
            }
            
            response = self.session.post(
                f"{self.base_url}/subscriptions/register",
                json=payload,
                timeout=10
            )
            
            response.raise_for_status()
            result = response.json()
            
            logger.info(f"✅ User subscription registered: {user_id}")
            return result
            
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Failed to register subscription for {user_id}: {e}")
            return {
                'success': False,
                'error': str(e),
                'message': 'Failed to register subscription'
            }
    
    def send_push_to_user(self, user_id: str, title: str, body: str, 
                         data: Optional[Dict] = None) -> Dict:
        """
        Send push notification to a specific user
        
        Args:
            user_id: Target user ID
            title: Notification title
            body: Notification body
            data: Optional additional data
            
        Returns:
            Dict with success status and delivery details
        """
        try:
            payload = {
                'userId': user_id,
                'title': title,
                'body': body,
                'data': data or {}
            }
            
            response = self.session.post(
                f"{self.base_url}/subscriptions/send-to-user",
                json=payload,
                timeout=10
            )
            
            response.raise_for_status()
            result = response.json()
            
            logger.info(f"🔔 Push sent to user {user_id}: {result.get('message', '')}")
            return result
            
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Failed to send push to {user_id}: {e}")
            return {
                'success': False,
                'error': str(e),
                'message': 'Failed to send push notification'
            }
    
    def send_push_to_users(self, user_ids: List[str], title: str, body: str, 
                          data: Optional[Dict] = None) -> Dict:
        """
        Send push notification to multiple users
        
        Args:
            user_ids: List of target user IDs
            title: Notification title
            body: Notification body
            data: Optional additional data
            
        Returns:
            Dict with success status and delivery details
        """
        try:
            payload = {
                'userIds': user_ids,
                'title': title,
                'body': body,
                'data': data or {}
            }
            
            response = self.session.post(
                f"{self.base_url}/subscriptions/send-to-users",
                json=payload,
                timeout=30  # Longer timeout for batch operations
            )
            
            response.raise_for_status()
            result = response.json()
            
            logger.info(f"🔔 Batch push sent to {len(user_ids)} users: {result.get('message', '')}")
            return result
            
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Failed to send batch push: {e}")
            return {
                'success': False,
                'error': str(e),
                'message': 'Failed to send batch push notifications'
            }
    
    def send_email(self, to_email: str, subject: str, content: str, 
                  metadata: Optional[Dict] = None) -> Dict:
        """
        Send email notification
        
        Args:
            to_email: Recipient email
            subject: Email subject
            content: Email content (HTML)
            metadata: Optional metadata
            
        Returns:
            Dict with success status
        """
        try:
            payload = {
                'type': 'email',
                'recipient': to_email,
                'content': content,
                'metadata': {
                    'subject': subject,
                    **(metadata or {})
                }
            }
            
            response = self.session.post(
                f"{self.base_url}/notifications/send",
                json=payload,
                timeout=10
            )
            
            response.raise_for_status()
            result = response.json()
            
            logger.info(f"📧 Email sent to {to_email}")
            return result
            
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Failed to send email to {to_email}: {e}")
            return {
                'success': False,
                'error': str(e),
                'message': 'Failed to send email'
            }
    
    def send_sms(self, to_phone: str, message: str, 
                metadata: Optional[Dict] = None) -> Dict:
        """
        Send SMS notification
        
        Args:
            to_phone: Recipient phone number
            message: SMS message
            metadata: Optional metadata
            
        Returns:
            Dict with success status
        """
        try:
            payload = {
                'type': 'sms',
                'recipient': to_phone,
                'content': message,
                'metadata': metadata or {}
            }
            
            response = self.session.post(
                f"{self.base_url}/notifications/send",
                json=payload,
                timeout=10
            )
            
            response.raise_for_status()
            result = response.json()
            
            logger.info(f"📱 SMS sent to {to_phone}")
            return result
            
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Failed to send SMS to {to_phone}: {e}")
            return {
                'success': False,
                'error': str(e),
                'message': 'Failed to send SMS'
            }
    
    def get_user_subscriptions(self, user_id: str) -> Dict:
        """
        Get user's active subscriptions
        
        Args:
            user_id: User ID
            
        Returns:
            Dict with subscription details
        """
        try:
            response = self.session.get(
                f"{self.base_url}/subscriptions/user/{user_id}",
                timeout=10
            )
            
            response.raise_for_status()
            result = response.json()
            
            logger.info(f"📊 Retrieved subscriptions for user {user_id}")
            return result
            
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Failed to get subscriptions for {user_id}: {e}")
            return {
                'success': False,
                'error': str(e),
                'message': 'Failed to get user subscriptions'
            }
    
    def check_service_health(self) -> Dict:
        """
        Check notification service health
        
        Returns:
            Dict with service status
        """
        try:
            response = self.session.get(
                f"{self.base_url}/health",
                timeout=5
            )
            
            response.raise_for_status()
            result = response.json()
            
            logger.info(f"🏥 Service health check: {result.get('status', 'unknown')}")
            return result
            
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Service health check failed: {e}")
            return {
                'success': False,
                'error': str(e),
                'message': 'Service health check failed'
            }

# Convenience functions for easy integration
def send_notification_to_user(user_id: str, title: str, body: str, 
                            notification_type: str = 'push', **kwargs) -> Dict:
    """
    Convenience function to send notification to user
    
    Args:
        user_id: Target user ID
        title: Notification title
        body: Notification body
        notification_type: 'push', 'email', or 'sms'
        **kwargs: Additional parameters based on type
        
    Returns:
        Dict with success status
    """
    client = VERSANTNotificationClient()
    
    if notification_type == 'push':
        return client.send_push_to_user(user_id, title, body, kwargs.get('data'))
    elif notification_type == 'email':
        return client.send_email(kwargs.get('email', ''), title, body, kwargs.get('metadata'))
    elif notification_type == 'sms':
        return client.send_sms(kwargs.get('phone', ''), body, kwargs.get('metadata'))
    else:
        return {
            'success': False,
            'error': f'Unknown notification type: {notification_type}'
        }

def send_bulk_notification(user_ids: List[str], title: str, body: str, 
                         notification_type: str = 'push', **kwargs) -> Dict:
    """
    Convenience function to send bulk notifications
    
    Args:
        user_ids: List of target user IDs
        title: Notification title
        body: Notification body
        notification_type: 'push', 'email', or 'sms'
        **kwargs: Additional parameters
        
    Returns:
        Dict with success status
    """
    client = VERSANTNotificationClient()
    
    if notification_type == 'push':
        return client.send_push_to_users(user_ids, title, body, kwargs.get('data'))
    else:
        # For email/SMS, send individually
        results = []
        for user_id in user_ids:
            result = send_notification_to_user(user_id, title, body, notification_type, **kwargs)
            results.append(result)
        
        successful = sum(1 for r in results if r.get('success', False))
        return {
            'success': successful > 0,
            'message': f'Sent {successful}/{len(user_ids)} notifications',
            'results': results
        }

# Example usage
if __name__ == "__main__":
    # Example usage
    client = VERSANTNotificationClient()
    
    # Check service health
    health = client.check_service_health()
    print(f"Service Health: {health}")
    
    # Example: Send push notification
    result = client.send_push_to_user(
        user_id="user123",
        title="Welcome to VERSANT!",
        body="Your account has been created successfully.",
        data={"action": "welcome", "userId": "user123"}
    )
    print(f"Push Result: {result}")

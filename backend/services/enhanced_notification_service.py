import os
import logging
from datetime import datetime
from typing import List, Dict, Optional, Union
from models_notification_preferences import NotificationPreferences
from services.oneSignalService import oneSignalService
from integration.flask_notification_client import VERSANTNotificationClient

logger = logging.getLogger(__name__)

class EnhancedNotificationService:
    """Enhanced notification service that respects user preferences and sends notifications via multiple channels"""
    
    def __init__(self):
        self.onesignal_service = oneSignalService
        self.email_sms_client = VERSANTNotificationClient()
        
    def should_send_notification(self, user_id: str, notification_type: str) -> Dict:
        """Check if a user should receive a notification based on their preferences"""
        from mongo import mongo_db
        from bson import ObjectId
        
        preferences = NotificationPreferences.get_user_preferences(user_id)
        
        if not preferences:
            # Create default preferences if none exist
            NotificationPreferences.create_default_preferences(user_id)
            preferences = NotificationPreferences.get_user_preferences(user_id)
        
        # Get user information
        user_obj_id = ObjectId(user_id) if isinstance(user_id, str) else user_id
        user_info = mongo_db.db.users.find_one({'_id': user_obj_id})
        
        # Check if user has disabled all notifications
        push_enabled = preferences.get('push_notifications', {}).get('enabled', True)
        email_enabled = preferences.get('email_notifications', {}).get('enabled', True)
        sms_enabled = preferences.get('sms_notifications', {}).get('enabled', True)
        
        # Check specific notification type preference
        notification_types = preferences.get('notification_types', {})
        type_enabled = notification_types.get(notification_type, True)
        
        # Check OneSignal subscription status
        onesignal_subscribed = preferences.get('push_notifications', {}).get('onesignal_subscribed', False)
        
        # Check quiet hours
        quiet_hours = preferences.get('quiet_hours', {})
        in_quiet_hours = self._is_in_quiet_hours(quiet_hours)
        
        return {
            'should_send_push': push_enabled and type_enabled and onesignal_subscribed and not in_quiet_hours,
            'should_send_email': email_enabled and type_enabled and not in_quiet_hours,
            'should_send_sms': sms_enabled and type_enabled and not in_quiet_hours,
            'onesignal_player_id': preferences.get('push_notifications', {}).get('onesignal_player_id'),
            'onesignal_user_id': preferences.get('push_notifications', {}).get('onesignal_user_id'),
            'email': user_info.get('email', '') if user_info else '',
            'phone': user_info.get('mobile_number', '') if user_info else '',
            'preferences': preferences
        }
    
    def _is_in_quiet_hours(self, quiet_hours: Dict) -> bool:
        """Check if current time is within quiet hours"""
        if not quiet_hours.get('enabled', False):
            return False
        
        try:
            from datetime import datetime
            import pytz
            
            now = datetime.now()
            if quiet_hours.get('timezone'):
                timezone = pytz.timezone(quiet_hours['timezone'])
                now = now.astimezone(timezone)
            
            current_time = now.strftime('%H:%M')
            start_time = quiet_hours.get('start_time', '22:00')
            end_time = quiet_hours.get('end_time', '08:00')
            
            # Handle overnight quiet hours (e.g., 22:00 to 08:00)
            if start_time > end_time:
                return current_time >= start_time or current_time <= end_time
            else:
                return start_time <= current_time <= end_time
                
        except Exception as e:
            logger.error(f"Error checking quiet hours: {e}")
            return False
    
    def send_notification_to_user(self, user_id: str, notification_data: Dict) -> Dict:
        """Send notification to a specific user based on their preferences"""
        try:
            notification_type = notification_data.get('type', 'system')
            user_prefs = self.should_send_notification(user_id, notification_type)
            
            results = {
                'user_id': user_id,
                'push_sent': False,
                'email_sent': False,
                'sms_sent': False,
                'errors': []
            }
            
            # Send push notification if enabled and user is subscribed
            if user_prefs['should_send_push'] and user_prefs['onesignal_player_id']:
                try:
                    push_data = {
                        'title': notification_data.get('title', 'VERSANT Notification'),
                        'message': notification_data.get('message', ''),
                        'url': notification_data.get('url', '/'),
                        'icon': notification_data.get('icon', 'https://crt.pydahsoft.in/logo.png'),
                        'data': notification_data.get('data', {}),
                        'type': notification_type
                    }
                    
                    push_success = self.onesignal_service.send_notification(
                        user_prefs['onesignal_player_id'],
                        push_data
                    )
                    results['push_sent'] = push_success
                    
                    if not push_success:
                        results['errors'].append('Push notification failed')
                        
                except Exception as e:
                    logger.error(f"Error sending push notification to user {user_id}: {e}")
                    results['errors'].append(f'Push notification error: {str(e)}')
            
            # Send email if enabled
            if user_prefs['should_send_email'] and user_prefs['email']:
                try:
                    email_data = {
                        'to_email': user_prefs['email'],
                        'subject': notification_data.get('title', 'VERSANT Notification'),
                        'body': notification_data.get('message', ''),
                        'html_body': notification_data.get('html_body', ''),
                        'template': notification_data.get('email_template'),
                        'template_data': notification_data.get('email_template_data', {})
                    }
                    
                    email_success = self.email_sms_client.send_email(
                        email_data['to_email'],
                        email_data['subject'],
                        email_data['body'],
                        email_data.get('html_body'),
                        email_data.get('template'),
                        email_data.get('template_data')
                    )
                    results['email_sent'] = email_success
                    
                    if not email_success:
                        results['errors'].append('Email notification failed')
                        
                except Exception as e:
                    logger.error(f"Error sending email to user {user_id}: {e}")
                    results['errors'].append(f'Email notification error: {str(e)}')
            
            # Send SMS if enabled
            if user_prefs['should_send_sms'] and user_prefs['phone']:
                try:
                    sms_data = {
                        'to_phone': user_prefs['phone'],
                        'message': notification_data.get('sms_message', notification_data.get('message', ''))
                    }
                    
                    sms_success = self.email_sms_client.send_sms(
                        sms_data['to_phone'],
                        sms_data['message']
                    )
                    results['sms_sent'] = sms_success
                    
                    if not sms_success:
                        results['errors'].append('SMS notification failed')
                        
                except Exception as e:
                    logger.error(f"Error sending SMS to user {user_id}: {e}")
                    results['errors'].append(f'SMS notification error: {str(e)}')
            
            return results
            
        except Exception as e:
            logger.error(f"Error sending notification to user {user_id}: {e}")
            return {
                'user_id': user_id,
                'push_sent': False,
                'email_sent': False,
                'sms_sent': False,
                'errors': [f'General error: {str(e)}']
            }
    
    def send_notification_to_users(self, user_ids: List[str], notification_data: Dict) -> List[Dict]:
        """Send notification to multiple users"""
        results = []
        
        for user_id in user_ids:
            result = self.send_notification_to_user(user_id, notification_data)
            results.append(result)
        
        return results
    
    def send_notification_by_role(self, role: str, notification_data: Dict, notification_type: str = None) -> Dict:
        """Send notification to all users with a specific role who are subscribed"""
        try:
            # Get users by role who are subscribed to the notification type
            users = NotificationPreferences.get_users_by_role(role, notification_type)
            
            if not users:
                return {
                    'success': False,
                    'message': f'No subscribed users found for role: {role}',
                    'total_users': 0,
                    'notifications_sent': 0
                }
            
            user_ids = [str(user['_id']) for user in users]
            results = self.send_notification_to_users(user_ids, notification_data)
            
            # Count successful notifications
            push_sent = sum(1 for r in results if r['push_sent'])
            email_sent = sum(1 for r in results if r['email_sent'])
            sms_sent = sum(1 for r in results if r['sms_sent'])
            
            return {
                'success': True,
                'message': f'Notifications sent to {len(users)} users',
                'total_users': len(users),
                'notifications_sent': {
                    'push': push_sent,
                    'email': email_sent,
                    'sms': sms_sent
                },
                'results': results
            }
            
        except Exception as e:
            logger.error(f"Error sending notification by role {role}: {e}")
            return {
                'success': False,
                'message': f'Error sending notifications: {str(e)}',
                'total_users': 0,
                'notifications_sent': 0
            }
    
    def send_broadcast_notification(self, notification_data: Dict, notification_type: str = None) -> Dict:
        """Send notification to all subscribed users"""
        try:
            # Get all subscribed users
            users = NotificationPreferences.get_subscribed_users(notification_type)
            
            if not users:
                return {
                    'success': False,
                    'message': 'No subscribed users found',
                    'total_users': 0,
                    'notifications_sent': 0
                }
            
            user_ids = [str(user['_id']) for user in users]
            results = self.send_notification_to_users(user_ids, notification_data)
            
            # Count successful notifications
            push_sent = sum(1 for r in results if r['push_sent'])
            email_sent = sum(1 for r in results if r['email_sent'])
            sms_sent = sum(1 for r in results if r['sms_sent'])
            
            return {
                'success': True,
                'message': f'Broadcast notification sent to {len(users)} users',
                'total_users': len(users),
                'notifications_sent': {
                    'push': push_sent,
                    'email': email_sent,
                    'sms': sms_sent
                },
                'results': results
            }
            
        except Exception as e:
            logger.error(f"Error sending broadcast notification: {e}")
            return {
                'success': False,
                'message': f'Error sending broadcast: {str(e)}',
                'total_users': 0,
                'notifications_sent': 0
            }
    
    def get_notification_stats(self) -> Dict:
        """Get comprehensive notification statistics"""
        try:
            stats = NotificationPreferences.get_notification_stats()
            
            # Add additional stats
            total_subscribed_users = NotificationPreferences.get_subscribed_users()
            stats['subscribed_user_details'] = {
                'total': len(total_subscribed_users),
                'by_role': {}
            }
            
            # Count by role
            role_counts = {}
            for user in total_subscribed_users:
                role = user.get('role', 'unknown')
                role_counts[role] = role_counts.get(role, 0) + 1
            
            stats['subscribed_user_details']['by_role'] = role_counts
            
            return stats
            
        except Exception as e:
            logger.error(f"Error getting notification stats: {e}")
            return {
                'error': str(e),
                'total_users': 0,
                'push_subscribed': 0,
                'email_enabled': 0,
                'sms_enabled': 0
            }

# Create a global instance
enhancedNotificationService = EnhancedNotificationService()

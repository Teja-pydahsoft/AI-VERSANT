"""
Test Notification Service
Handles all test-related notifications including OneSignal push notifications
"""

from datetime import datetime
from typing import Dict, List, Optional
from bson import ObjectId
from flask import current_app
import json
import requests
import os
from mongo import mongo_db
from models_notification_preferences import NotificationPreferences

class TestNotificationService:
    def __init__(self):
        self.onesignal_app_id = os.getenv('ONESIGNAL_APP_ID')
        self.onesignal_api_key = os.getenv('ONESIGNAL_REST_API_KEY')
        self.onesignal_api_url = 'https://onesignal.com/api/v1/notifications'

    def _get_onesignal_headers(self):
        """Get OneSignal API headers"""
        return {
            'Content-Type': 'application/json',
            'Authorization': f'Basic {self.onesignal_api_key}'
        }

    def send_test_created_notification(self, test_data: Dict, student_ids: List[str]) -> Dict:
        """Send notification when a test is created/scheduled"""
        try:
            # Get subscribed users
            subscribed_users = self._get_subscribed_users(student_ids)
            if not subscribed_users:
                return {'success': False, 'message': 'No subscribed users found'}

            # Prepare notification data
            notification = {
                'app_id': self.onesignal_app_id,
                'include_player_ids': [user['player_id'] for user in subscribed_users],
                'headings': {'en': 'New Test Available'},
                'contents': {'en': f"A new test '{test_data['name']}' has been scheduled for you."},
                'data': {
                    'type': 'test_created',
                    'test_id': str(test_data['_id']),
                    'test_name': test_data['name'],
                    'timestamp': datetime.now().isoformat()
                },
                'url': f"/student/exam/{test_data['_id']}",
                'web_buttons': [{
                    'id': 'take_test',
                    'text': 'Take Test',
                    'url': f"/student/exam/{test_data['_id']}"
                }]
            }

            # Send through OneSignal
            response = requests.post(
                self.onesignal_api_url,
                headers=self._get_onesignal_headers(),
                json=notification
            )

            if response.status_code == 200:
                return {
                    'success': True,
                    'message': 'Test creation notifications sent successfully',
                    'recipients': len(subscribed_users)
                }
            else:
                return {
                    'success': False,
                    'message': 'Failed to send OneSignal notifications',
                    'error': response.text
                }

        except Exception as e:
            current_app.logger.error(f"Error sending test creation notifications: {e}")
            return {'success': False, 'error': str(e)}

    def send_test_reminder(self, test_data: Dict, student_ids: List[str]) -> Dict:
        """Send test reminder notifications"""
        try:
            current_app.logger.info(f"Sending test reminder notifications to {len(student_ids)} students")
            
            # Get subscribed users
            subscribed_users = self._get_subscribed_users(student_ids)
            current_app.logger.info(f"Found {len(subscribed_users)} subscribed users")
            
            if not subscribed_users:
                current_app.logger.warning("No subscribed users found for test reminder")
                return {'success': False, 'message': 'No subscribed users found'}

            # Prepare notification data
            notification = {
                'app_id': self.onesignal_app_id,
                'include_player_ids': [user['player_id'] for user in subscribed_users],
                'headings': {'en': 'Test Reminder'},
                'contents': {'en': f"Don't forget to attempt '{test_data['name']}' test."},
                'data': {
                    'type': 'test_reminder',
                    'test_id': str(test_data['_id']),
                    'test_name': test_data['name'],
                    'timestamp': datetime.now().isoformat()
                },
                'url': f"/student/exam/{test_data['_id']}",
                'web_buttons': [{
                    'id': 'take_test',
                    'text': 'Take Test Now',
                    'url': f"/student/exam/{test_data['_id']}"
                }]
            }

            # Send through OneSignal
            response = requests.post(
                self.onesignal_api_url,
                headers=self._get_onesignal_headers(),
                json=notification
            )

            if response.status_code == 200:
                return {
                    'success': True,
                    'message': 'Test reminder notifications sent successfully',
                    'recipients': len(subscribed_users)
                }
            else:
                return {
                    'success': False,
                    'message': 'Failed to send OneSignal notifications',
                    'error': response.text
                }

        except Exception as e:
            current_app.logger.error(f"Error sending test reminder notifications: {e}")
            return {'success': False, 'error': str(e)}

    def _get_subscribed_users(self, user_ids: List[str]) -> List[Dict]:
        """Get subscribed users with their OneSignal player IDs"""
        try:
            # Convert string IDs to ObjectId
            object_ids = [ObjectId(uid) for uid in user_ids]
            
            # Query notification preferences
            preferences = mongo_db.db.notification_preferences.find({
                'user_id': {'$in': object_ids},
                'push_notifications.enabled': True,
                'push_notifications.providers.onesignal.subscribed': True,
                'push_notifications.providers.onesignal.is_active': True
            })

            # Extract user details and player IDs
            users = []
            for pref in preferences:
                player_id = pref.get('push_notifications', {}).get('providers', {}).get('onesignal', {}).get('player_id')
                if player_id:
                    users.append({
                        'user_id': str(pref['user_id']),
                        'player_id': player_id
                    })

            return users

        except Exception as e:
            current_app.logger.error(f"Error getting subscribed users: {e}")
            return []

# Global instance
test_notification_service = TestNotificationService()
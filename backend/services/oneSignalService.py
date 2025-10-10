import os
import requests
import logging
from typing import List, Dict, Optional, Union
from models_push_subscriptions import PushSubscription

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class OneSignalService:
    def __init__(self):
        self.app_id = os.getenv('ONESIGNAL_APP_ID')
        self.rest_api_key = os.getenv('ONESIGNAL_REST_API_KEY')
        self.base_url = 'https://api.onesignal.com'
        
    def is_configured(self) -> bool:
        """Check if OneSignal is properly configured"""
        return bool(self.app_id and self.rest_api_key)
    
    def _get_headers(self) -> Dict[str, str]:
        """Get headers for OneSignal API requests"""
        return {
            'Content-Type': 'application/json',
            'Authorization': f'Basic {self.rest_api_key}'
        }
    
    def send_notification_to_user(self, user_id: str, notification_data: Dict) -> bool:
        """Send notification to specific user via OneSignal"""
        try:
            if not self.is_configured():
                logger.warning("OneSignal not configured")
                return False

            payload = {
                "app_id": self.app_id,
                "include_external_user_ids": [str(user_id)],
                "headings": {"en": notification_data.get('title', 'New Notification')},
                "contents": {"en": notification_data.get('message', '')},
                "url": notification_data.get('url', '/'),
                "data": {
                    "type": notification_data.get('type', 'general'),
                    "id": notification_data.get('id'),
                    "relatedId": notification_data.get('relatedId'),
                    **notification_data.get('data', {})
                },
                # Web push specific parameters
                "chrome_web_image": notification_data.get('image'),
                "chrome_web_icon": notification_data.get('icon', 'https://crt.pydahsoft.in/logo.png'),
                # Priority and TTL
                "priority": notification_data.get('priority', 10),
                "ttl": notification_data.get('ttl', 86400),  # 24 hours
                # Collapse and topic
                "collapse_id": notification_data.get('collapseId'),
                "web_push_topic": notification_data.get('topic'),
                # Platform targeting - ensure web push is enabled
                "isAnyWeb": True,
                # Additional required parameters
                "channel_for_external_user_ids": "push",
                # Enable frequency capping
                "enable_frequency_cap": True
            }

            response = requests.post(
                f'{self.base_url}/notifications',
                json=payload,
                headers=self._get_headers()
            )

            if response.status_code == 200:
                logger.info(f"OneSignal notification sent successfully to user {user_id}")
                return True
            else:
                logger.error(f"OneSignal API error: {response.status_code} - {response.text}")
                return False

        except Exception as error:
            logger.error(f"Error sending OneSignal notification: {str(error)}")
            return False

    def send_notification_to_users(self, user_ids: List[str], notification_data: Dict) -> bool:
        """Send notification to multiple users via OneSignal"""
        try:
            if not self.is_configured():
                logger.warning("OneSignal not configured")
                return False

            if not user_ids or len(user_ids) == 0:
                logger.warning("No user IDs provided")
                return False

            payload = {
                "app_id": self.app_id,
                "include_external_user_ids": [str(user_id) for user_id in user_ids],
                "headings": {"en": notification_data.get('title', 'New Notification')},
                "contents": {"en": notification_data.get('message', '')},
                "url": notification_data.get('url', '/'),
                "data": {
                    "type": notification_data.get('type', 'general'),
                    "id": notification_data.get('id'),
                    "relatedId": notification_data.get('relatedId'),
                    **notification_data.get('data', {})
                },
                # Web push specific parameters
                "chrome_web_image": notification_data.get('image'),
                "chrome_web_icon": notification_data.get('icon', 'https://crt.pydahsoft.in/logo.png'),
                # Priority and TTL
                "priority": notification_data.get('priority', 10),
                "ttl": notification_data.get('ttl', 86400),
                # Collapse and topic
                "collapse_id": notification_data.get('collapseId'),
                "web_push_topic": notification_data.get('topic'),
                # Platform targeting - ensure web push is enabled
                "isAnyWeb": True,
                # Additional required parameters
                "channel_for_external_user_ids": "push",
                # Enable frequency capping
                "enable_frequency_cap": True
            }

            logger.info(f"OneSignal bulk payload: {payload}")

            response = requests.post(
                f'{self.base_url}/notifications',
                json=payload,
                headers=self._get_headers()
            )

            if response.status_code == 200:
                logger.info(f"OneSignal bulk notification sent successfully to {len(user_ids)} users")
                return True
            else:
                logger.error(f"OneSignal API error: {response.status_code} - {response.text}")
                return False

        except Exception as error:
            logger.error(f"Error sending OneSignal bulk notification: {str(error)}")
            return False

    def send_notification_to_segment(self, segment: str, notification_data: Dict) -> bool:
        """Send notification to segment via OneSignal"""
        try:
            if not self.is_configured():
                logger.warning("OneSignal not configured")
                return False

            logger.info(f"Sending OneSignal segment notification to: {segment}")

            payload = {
                "app_id": self.app_id,
                "included_segments": [segment],
                "headings": {"en": notification_data.get('title', 'New Notification')},
                "contents": {"en": notification_data.get('message', '')},
                "url": notification_data.get('url', '/'),
                "data": {
                    "type": notification_data.get('type', 'general'),
                    "id": notification_data.get('id'),
                    "relatedId": notification_data.get('relatedId'),
                    **notification_data.get('data', {})
                },
                # Web push specific parameters
                "chrome_web_image": notification_data.get('image'),
                "chrome_web_icon": notification_data.get('icon', 'https://crt.pydahsoft.in/logo.png'),
                # Priority and TTL
                "priority": notification_data.get('priority', 10),
                "ttl": notification_data.get('ttl', 86400),
                # Collapse and topic
                "collapse_id": notification_data.get('collapseId'),
                "web_push_topic": notification_data.get('topic'),
                # Platform targeting - ensure web push is enabled
                "isAnyWeb": True,
                # Enable frequency capping
                "enable_frequency_cap": True
            }

            logger.info(f"OneSignal segment payload: {payload}")

            response = requests.post(
                f'{self.base_url}/notifications',
                json=payload,
                headers=self._get_headers()
            )

            if response.status_code == 200:
                logger.info(f"OneSignal segment notification sent successfully to {segment}")
                return True
            else:
                logger.error(f"OneSignal API error: {response.status_code} - {response.text}")
                return False

        except Exception as error:
            logger.error(f"Error sending OneSignal segment notification: {str(error)}")
            return False

    def send_broadcast_notification(self, notification_data: Dict) -> bool:
        """Send notification to all subscribed users using push_subscriptions collection"""
        try:
            if not self.is_configured():
                logger.warning("OneSignal not configured")
                return False

            # Get all active OneSignal player IDs from push_subscriptions collection
            player_ids = PushSubscription.get_all_onesignal_player_ids()
            
            if not player_ids or len(player_ids) == 0:
                logger.warning("No active OneSignal subscriptions found")
                return False
            
            logger.info(f"📢 Broadcasting to {len(player_ids)} OneSignal subscribers")

            payload = {
                "app_id": self.app_id,
                "include_player_ids": player_ids,  # Use actual player IDs instead of segments
                "headings": {"en": notification_data.get('title', 'New Notification')},
                "contents": {"en": notification_data.get('message', '')},
                "url": notification_data.get('url', '/'),
                "data": {
                    "type": notification_data.get('type', 'general'),
                    "id": notification_data.get('id'),
                    "relatedId": notification_data.get('relatedId'),
                    **notification_data.get('data', {})
                },
                # Web push specific parameters
                "chrome_web_image": notification_data.get('image'),
                "chrome_web_icon": notification_data.get('icon', 'https://crt.pydahsoft.in/logo.png'),
                # Priority and TTL
                "priority": notification_data.get('priority', 10),
                "ttl": notification_data.get('ttl', 86400),
                # Collapse and topic
                "collapse_id": notification_data.get('collapseId'),
                "web_push_topic": notification_data.get('topic'),
                # Platform targeting - ensure web push is enabled
                "isAnyWeb": True,
                # Enable frequency capping
                "enable_frequency_cap": True
            }

            logger.info(f"OneSignal broadcast payload: {payload}")

            response = requests.post(
                f'{self.base_url}/notifications',
                json=payload,
                headers=self._get_headers()
            )

            if response.status_code == 200:
                logger.info("OneSignal broadcast notification sent successfully")
                return True
            else:
                logger.error(f"OneSignal API error: {response.status_code} - {response.text}")
                return False

        except Exception as error:
            logger.error(f"Error sending OneSignal broadcast notification: {str(error)}")
            return False

    def get_notification_payload(self, notification_type: str, data: Dict) -> Dict:
        """Get notification payload based on type"""
        base_payload = {
            "title": data.get('title', 'New Notification'),
            "message": data.get('message', ''),
            "type": notification_type,
            "id": data.get('id'),
            "relatedId": data.get('relatedId')
        }

        if notification_type == 'test':
            return {
                **base_payload,
                "title": data.get('title', 'Test Notification'),
                "url": data.get('url', '/'),
                "priority": 5
            }
        elif notification_type == 'announcement':
            return {
                **base_payload,
                "title": data.get('title', 'New Announcement'),
                "url": f"/announcements/{data.get('relatedId', '')}",
                "collapseId": f"announcement-{data.get('relatedId', '')}",
                "priority": 8
            }
        elif notification_type == 'test_result':
            return {
                **base_payload,
                "title": data.get('title', 'Test Result Available'),
                "url": f"/test-results/{data.get('relatedId', '')}",
                "collapseId": f"test-result-{data.get('relatedId', '')}",
                "priority": 9
            }
        elif notification_type == 'system':
            return {
                **base_payload,
                "title": data.get('title', 'System Notification'),
                "url": data.get('url', '/'),
                "priority": 7
            }
        else:
            return {
                **base_payload,
                "url": data.get('url', '/'),
                "priority": 8
            }

    def test_connection(self) -> Dict:
        """Test OneSignal connection"""
        try:
            if not self.is_configured():
                return {"success": False, "message": "OneSignal not configured"}

            response = requests.get(
                f'{self.base_url}/apps/{self.app_id}',
                headers=self._get_headers()
            )

            if response.status_code == 200:
                return {
                    "success": True,
                    "message": "OneSignal connection successful",
                    "app": response.json()
                }
            else:
                return {
                    "success": False,
                    "message": "OneSignal connection failed",
                    "error": response.text
                }

        except Exception as error:
            return {
                "success": False,
                "message": "OneSignal connection failed",
                "error": str(error)
            }

# Create global instance
oneSignalService = OneSignalService()

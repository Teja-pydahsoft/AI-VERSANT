"""
Web Push Notification Service
Handles web push notifications using VAPID keys
"""
import os
import json
from datetime import datetime
from typing import Dict, Optional
from pywebpush import webpush, WebPushException
from mongo import mongo_db
import logging

logger = logging.getLogger(__name__)

class WebPushService:
    def __init__(self):
        self.vapid_public_key = os.getenv('VAPID_PUBLIC_KEY')
        self.vapid_private_key = os.getenv('VAPID_PRIVATE_KEY')
        self.vapid_claims = {
            "sub": f"mailto:{os.getenv('VAPID_EMAIL', 'admin@versant.com')}"
        }
        
        if not all([self.vapid_public_key, self.vapid_private_key]):
            raise Exception("VAPID keys not configured")

    async def save_subscription(self, user_id: str, subscription_data: Dict) -> Dict:
        """Save push subscription for a user"""
        try:
            if not subscription_data.get('endpoint'):
                return {'success': False, 'error': 'Subscription endpoint is required'}

            # Extract p256dh and auth keys
            keys = subscription_data.get('keys', {})
            if not all([keys.get('p256dh'), keys.get('auth')]):
                return {'success': False, 'error': 'P256DH and Auth keys are required'}

            # Store subscription with proper web push format
            subscription_doc = {
                'user_id': user_id,
                'endpoint': subscription_data['endpoint'],
                'p256dh': keys['p256dh'],
                'auth': keys['auth'],
                'created_at': datetime.utcnow(),
                'updated_at': datetime.utcnow(),
                'is_active': True
            }

            # Update or insert subscription
            result = mongo_db.push_subscriptions.update_one(
                {'endpoint': subscription_data['endpoint']},
                {'$set': subscription_doc},
                upsert=True
            )

            return {
                'success': True,
                'subscription_id': str(result.upserted_id) if result.upserted_id else None
            }

        except Exception as e:
            logger.error(f"Error saving push subscription: {e}")
            return {'success': False, 'error': str(e)}

    async def send_notification(self, user_id: str, title: str, body: str, data: Optional[Dict] = None) -> Dict:
        """Send push notification to a specific user"""
        try:
            # Get user's push subscription
            subscription = mongo_db.push_subscriptions.find_one({
                'user_id': user_id,
                'is_active': True
            })

            if not subscription:
                return {'success': False, 'error': 'User has no active push subscription'}

            # Prepare subscription info for pywebpush
            subscription_info = {
                'endpoint': subscription['endpoint'],
                'keys': {
                    'p256dh': subscription['p256dh'],
                    'auth': subscription['auth']
                }
            }

            # Prepare notification payload
            payload = {
                'title': title,
                'body': body,
                'data': data or {},
                'timestamp': datetime.utcnow().isoformat()
            }

            # Send push notification
            response = webpush(
                subscription_info=subscription_info,
                data=json.dumps(payload),
                vapid_private_key=self.vapid_private_key,
                vapid_claims=self.vapid_claims
            )

            return {
                'success': True,
                'message': 'Push notification sent successfully'
            }

        except WebPushException as e:
            if e.response and e.response.status_code == 410:
                # Subscription has expired or is invalid
                mongo_db.push_subscriptions.update_one(
                    {'_id': subscription['_id']},
                    {'$set': {'is_active': False}}
                )
                return {'success': False, 'error': 'Push subscription has expired'}
            else:
                logger.error(f"WebPush error: {e}")
                return {'success': False, 'error': str(e)}
        except Exception as e:
            logger.error(f"Error sending push notification: {e}")
            return {'success': False, 'error': str(e)}

# Create singleton instance
webPushService = WebPushService()
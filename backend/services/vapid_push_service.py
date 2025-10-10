"""
VAPID Push Notifications Service
Handles all VAPID web push notifications via notification-service
"""

import os
from typing import Dict, List, Optional
from datetime import datetime
import json
import logging
import requests
from models_push_subscriptions import PushSubscription

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class VapidPushService:
    def __init__(self):
        self.notification_service_url = os.getenv('NOTIFICATION_SERVICE_URL', 'http://localhost:3001')
        self.vapid_public_key = os.getenv('VAPID_PUBLIC_KEY')
        logger.info(f"✅ VAPID service initialized (using notification-service at {self.notification_service_url})")

    def get_public_key(self) -> str:
        """Get VAPID public key for subscription"""
        return self.vapid_public_key

    def send_notification_to_user(self, user_id: str, title: str, body: str, data: Dict = None) -> Dict:
        """Send push notification to a specific user via notification-service"""
        try:
            # Get user's VAPID subscriptions from push_subscriptions collection
            subscriptions = PushSubscription.get_vapid_subscriptions(user_id)
            if not subscriptions or len(subscriptions) == 0:
                return {'success': False, 'error': 'No VAPID subscription found'}

            # Use the first active subscription
            subscription_info = subscriptions[0].get('subscription')
            if not subscription_info:
                return {'success': False, 'error': 'Invalid VAPID subscription'}
            
            # Send via notification-service
            try:
                response = requests.post(
                    f"{self.notification_service_url}/api/push/send",
                    json={
                        'user_id': user_id,
                        'subscription': subscription_info,
                        'title': title,
                        'body': body,
                        'data': data or {},
                        'provider': 'vapid'
                    },
                    timeout=10
                )
                
                if response.status_code == 200:
                    logger.info(f"✅ VAPID notification sent to user {user_id}")
                    return {'success': True}
                else:
                    logger.error(f"❌ Notification service error: {response.status_code}")
                    return {'success': False, 'error': f'Service returned {response.status_code}'}
                    
            except requests.exceptions.RequestException as e:
                logger.error(f"❌ Failed to reach notification service: {e}")
                return {'success': False, 'error': str(e)}

        except Exception as e:
            logger.error(f"Error sending VAPID notification: {e}")
            return {'success': False, 'error': str(e)}

    def send_broadcast_notification(self, title: str, body: str, data: Dict = None) -> Dict:
        """Send notification to all VAPID subscribers via notification-service"""
        try:
            # Get all VAPID subscriptions from push_subscriptions collection
            from mongo import mongo_db
            subscriptions = list(mongo_db.db.push_subscriptions.find({
                'provider': 'vapid',
                'is_active': True
            }))
            
            if not subscriptions or len(subscriptions) == 0:
                logger.warning("No active VAPID subscriptions found")
                return {'success': False, 'sent': 0, 'error': 'No VAPID subscribers'}
            
            logger.info(f"📢 Broadcasting VAPID notification to {len(subscriptions)} subscribers")
            
            success_count = 0
            failed_count = 0
            
            for sub in subscriptions:
                try:
                    subscription_info = sub.get('subscription')
                    user_id = sub.get('user_id')
                    
                    if not subscription_info:
                        failed_count += 1
                        continue
                    
                    # Send via notification-service
                    response = requests.post(
                        f"{self.notification_service_url}/api/push/send",
                        json={
                            'user_id': user_id,
                            'subscription': subscription_info,
                            'title': title,
                            'body': body,
                            'data': data or {},
                            'provider': 'vapid'
                        },
                        timeout=10
                    )
                    
                    if response.status_code == 200:
                        success_count += 1
                        logger.info(f"✅ VAPID notification sent to user {user_id}")
                    else:
                        failed_count += 1
                        logger.warning(f"Failed to send to user {user_id}: {response.status_code}")
                    
                except requests.exceptions.RequestException as e:
                    failed_count += 1
                    logger.error(f"Error sending to user {sub.get('user_id')}: {str(e)}")
                except Exception as e:
                    failed_count += 1
                    logger.error(f"Error sending to user {sub.get('user_id')}: {str(e)}")
            
            logger.info(f"✅ VAPID broadcast complete: {success_count} sent, {failed_count} failed")
            
            return {
                'success': success_count > 0,
                'sent': success_count,
                'failed': failed_count,
                'total': len(subscriptions)
            }
            
        except Exception as e:
            logger.error(f"Error broadcasting VAPID notification: {e}")
            return {'success': False, 'sent': 0, 'error': str(e)}

    async def send_test_notification(self, test_data: Dict, student_ids: List[str]) -> Dict:
        """Send test notification to multiple students"""
        try:
            results = []
            success_count = 0

            for student_id in student_ids:
                result = await self.send_notification(
                    user_id=student_id,
                    title=f"New Test: {test_data['name']}",
                    body="A new test has been assigned to you.",
                    data={
                        'type': 'test',
                        'test_id': str(test_data['_id']),
                        'url': f"/student/exam/{test_data['_id']}"
                    }
                )
                
                if result['success']:
                    success_count += 1
                results.append({
                    'student_id': student_id,
                    'success': result['success'],
                    'error': result.get('error')
                })

            return {
                'success': True,
                'total_sent': len(student_ids),
                'successful': success_count,
                'results': results
            }

        except Exception as e:
            current_app.logger.error(f"Error sending VAPID test notifications: {e}")
            return {
                'success': False,
                'error': str(e)
            }

    async def send_test_reminder(self, test_data: Dict, student_ids: List[str]) -> Dict:
        """Send test reminder notifications"""
        try:
            results = []
            success_count = 0

            for student_id in student_ids:
                result = await self.send_notification(
                    user_id=student_id,
                    title=f"Test Reminder: {test_data['name']}",
                    body="Don't forget to attempt your assigned test.",
                    data={
                        'type': 'test_reminder',
                        'test_id': str(test_data['_id']),
                        'url': f"/student/exam/{test_data['_id']}"
                    }
                )
                
                if result['success']:
                    success_count += 1
                results.append({
                    'student_id': student_id,
                    'success': result['success'],
                    'error': result.get('error')
                })

            return {
                'success': True,
                'total_sent': len(student_ids),
                'successful': success_count,
                'results': results
            }

        except Exception as e:
            current_app.logger.error(f"Error sending VAPID test reminders: {e}")
            return {
                'success': False,
                'error': str(e)
            }

# Global instance
vapid_service = VapidPushService()
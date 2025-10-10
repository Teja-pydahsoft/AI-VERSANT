"""
Unified Push Notification Service
Handles both OneSignal and VAPID push notifications
"""

from typing import Dict, List
from flask import current_app
from services.test_notification_service import test_notification_service
from services.vapid_push_service import vapid_service

class UnifiedPushService:
    async def send_test_notification(self, test_data: Dict, student_ids: List[str]) -> Dict:
        """Send test notification through both OneSignal and VAPID"""
        try:
            # Send via OneSignal
            onesignal_result = test_notification_service.send_test_created_notification(
                test_data, 
                student_ids
            )
            
            # Send via VAPID
            vapid_result = await vapid_service.send_test_notification(
                test_data,
                student_ids
            )
            
            return {
                'success': True,
                'onesignal': {
                    'success': onesignal_result.get('success', False),
                    'recipients': onesignal_result.get('recipients', 0)
                },
                'vapid': {
                    'success': vapid_result.get('success', False),
                    'successful': vapid_result.get('successful', 0),
                    'total': vapid_result.get('total_sent', 0)
                }
            }
            
        except Exception as e:
            current_app.logger.error(f"Error sending unified test notification: {e}")
            return {'success': False, 'error': str(e)}

    async def send_test_reminder(self, test_data: Dict, student_ids: List[str]) -> Dict:
        """Send test reminder through both OneSignal and VAPID"""
        try:
            # Send via OneSignal
            onesignal_result = test_notification_service.send_test_reminder(
                test_data, 
                student_ids
            )
            
            # Send via VAPID
            vapid_result = await vapid_service.send_test_reminder(
                test_data,
                student_ids
            )
            
            return {
                'success': True,
                'onesignal': {
                    'success': onesignal_result.get('success', False),
                    'recipients': onesignal_result.get('recipients', 0)
                },
                'vapid': {
                    'success': vapid_result.get('success', False),
                    'successful': vapid_result.get('successful', 0),
                    'total': vapid_result.get('total_sent', 0)
                }
            }
            
        except Exception as e:
            current_app.logger.error(f"Error sending unified test reminder: {e}")
            return {'success': False, 'error': str(e)}

# Global instance
unified_push_service = UnifiedPushService()
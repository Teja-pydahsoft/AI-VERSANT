#!/usr/bin/env python3
"""
Push Notification Service using VAPID keys
Integrates with existing notification queue system
"""

import os
import json
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime
from pywebpush import webpush, WebPushException
from utils.async_processor import submit_background_task
from utils.smart_worker_manager import run_background_task_with_tracking
from utils.connection_manager import get_mongo_database

# Configure logging
logger = logging.getLogger(__name__)

class PushNotificationService:
    """Push notification service using VAPID keys"""
    
    def __init__(self):
        self.mongo_db = get_mongo_database()
        self.vapid_private_key = os.getenv('VAPID_PRIVATE_KEY')
        self.vapid_public_key = os.getenv('VAPID_PUBLIC_KEY')
        self.vapid_email = os.getenv('VAPID_EMAIL', 'team@pydahsoft.in')
        
        # Load VAPID keys from file if not in environment
        if not self.vapid_private_key or not self.vapid_public_key:
            self._load_vapid_keys_from_file()
        
        # Convert private key to the format expected by pywebpush
        self._prepare_vapid_keys()
        
        self.stats = {
            'total_sent': 0,
            'total_failed': 0,
            'total_subscriptions': 0,
            'active_subscriptions': 0
        }
        
        logger.info("🔔 Push Notification Service initialized")
    
    def _load_vapid_keys_from_file(self):
        """Load VAPID keys from vapid_keys.json file"""
        try:
            with open('vapid_keys.json', 'r') as f:
                keys_data = json.load(f)
                # Use the original PEM key for pywebpush
                self.vapid_private_key = keys_data.get('private_key')
                self.vapid_public_key = keys_data.get('public_key')
                self.vapid_email = keys_data.get('email', 'team@pydahsoft.in')
                logger.info("✅ VAPID keys loaded from file")
                logger.info(f"🔍 Private key starts with: {repr(self.vapid_private_key[:50])}")
        except Exception as e:
            logger.error(f"❌ Failed to load VAPID keys from file: {e}")
    
    def _prepare_vapid_keys(self):
        """Prepare VAPID keys for pywebpush"""
        try:
            if self.vapid_private_key and self.vapid_public_key:
                # Write PEM key to temporary file for pywebpush
                self._vapid_private_key_file = 'vapid_private_key.pem'
                with open(self._vapid_private_key_file, 'w') as f:
                    f.write(self.vapid_private_key)
                
                logger.info("✅ Created PEM file for pywebpush")
                logger.info(f"🔍 Private key starts with: {repr(self.vapid_private_key[:50])}")
                has_newlines = '\n' in self.vapid_private_key
                logger.info(f"🔍 Private key contains newlines: {has_newlines}")
                logger.info("✅ VAPID keys prepared for pywebpush")
            else:
                logger.warning("⚠️ VAPID keys not available")
        except Exception as e:
            logger.error(f"❌ Failed to prepare VAPID keys: {e}")
    
    def subscribe_user(self, user_id: str, subscription_data: Dict) -> Dict:
        """Subscribe a user to push notifications"""
        try:
            # Validate subscription data
            if not subscription_data.get('endpoint'):
                return {'success': False, 'error': 'Subscription endpoint is required'}
            
            # Check if subscription already exists
            existing_sub = self.mongo_db.push_subscriptions.find_one({
                'endpoint': subscription_data['endpoint']
            })
            
            if existing_sub:
                # Update existing subscription
                self.mongo_db.push_subscriptions.update_one(
                    {'endpoint': subscription_data['endpoint']},
                    {
                        '$set': {
                            'keys': subscription_data.get('keys', {}),
                            'user_id': user_id,
                            'is_active': True,
                            'last_used': datetime.utcnow(),
                            'updated_at': datetime.utcnow()
                        }
                    }
                )
                logger.info(f"✅ Updated existing push subscription for user {user_id}")
            else:
                # Create new subscription
                subscription_doc = {
                    'user_id': user_id,
                    'endpoint': subscription_data['endpoint'],
                    'keys': subscription_data.get('keys', {}),
                    'is_active': True,
                    'created_at': datetime.utcnow(),
                    'updated_at': datetime.utcnow(),
                    'last_used': datetime.utcnow()
                }
                
                self.mongo_db.push_subscriptions.insert_one(subscription_doc)
                logger.info(f"✅ Created new push subscription for user {user_id}")
            
            # Update stats
            self._update_stats()
            
            return {
                'success': True,
                'message': 'Successfully subscribed to push notifications',
                'total_subscriptions': self.stats['total_subscriptions']
            }
            
        except Exception as e:
            logger.error(f"❌ Failed to subscribe user {user_id}: {e}")
            return {'success': False, 'error': str(e)}
    
    def unsubscribe_user(self, user_id: str, endpoint: str = None) -> Dict:
        """Unsubscribe a user from push notifications"""
        try:
            query = {'user_id': user_id, 'is_active': True}
            if endpoint:
                query['endpoint'] = endpoint
            
            logger.info(f"🔍 Unsubscribing user {user_id} with query: {query}")
            
            result = self.mongo_db.push_subscriptions.update_many(
                query,
                {
                    '$set': {
                        'is_active': False,
                        'updated_at': datetime.utcnow()
                    }
                }
            )
            
            logger.info(f"🔍 Update result: modified_count={result.modified_count}")
            
            if result.modified_count > 0:
                logger.info(f"✅ Unsubscribed {result.modified_count} push subscriptions for user {user_id}")
                self._update_stats()
                return {
                    'success': True,
                    'message': f'Successfully unsubscribed {result.modified_count} subscriptions'
                }
            else:
                logger.info(f"ℹ️ No active subscriptions found for user {user_id} - already unsubscribed")
                return {
                    'success': True,
                    'message': 'You are already unsubscribed from push notifications'
                }
                
        except Exception as e:
            logger.error(f"❌ Failed to unsubscribe user {user_id}: {e}")
            return {'success': False, 'error': str(e)}
    
    def send_notification_to_user(self, user_id: str, title: str, body: str, 
                                 data: Dict = None, icon: str = None, url: str = None) -> str:
        """Send push notification to a specific user"""
        try:
            task_id = run_background_task_with_tracking(
                self._process_user_notification,
                task_type='push_notification',
                description=f'Push notification to user {user_id}',
                estimated_duration=5,
                user_id=user_id,
                title=title,
                body=body,
                data=data or {},
                icon=icon,
                url=url
            )
            
            logger.info(f"📱 Push notification queued for user {user_id} (Task ID: {task_id})")
            return task_id
            
        except Exception as e:
            logger.error(f"❌ Failed to queue push notification for user {user_id}: {e}")
            return None
    
    def send_notification_to_all(self, title: str, body: str, data: Dict = None, 
                                icon: str = None, url: str = None) -> str:
        """Send push notification to all subscribed users"""
        try:
            task_id = run_background_task_with_tracking(
                self._process_broadcast_notification,
                task_type='push_broadcast',
                description=f'Broadcast push notification: {title}',
                estimated_duration=30,
                title=title,
                body=body,
                data=data or {},
                icon=icon,
                url=url
            )
            
            logger.info(f"📢 Broadcast push notification queued (Task ID: {task_id})")
            return task_id
            
        except Exception as e:
            logger.error(f"❌ Failed to queue broadcast push notification: {e}")
            return None
    
    def send_notification_to_role(self, role: str, title: str, body: str, 
                                 data: Dict = None, icon: str = None, url: str = None) -> str:
        """Send push notification to users with specific role"""
        try:
            task_id = run_background_task_with_tracking(
                self._process_role_notification,
                task_type='push_role_notification',
                description=f'Push notification to {role} users: {title}',
                estimated_duration=20,
                role=role,
                title=title,
                body=body,
                data=data or {},
                icon=icon,
                url=url
            )
            
            logger.info(f"📱 Push notification queued for {role} users (Task ID: {task_id})")
            return task_id
            
        except Exception as e:
            logger.error(f"❌ Failed to queue push notification for {role} users: {e}")
            return None
    
    def _process_user_notification(self, user_id: str, title: str, body: str, 
                                  data: Dict, icon: str, url: str):
        """Process push notification for a specific user"""
        try:
            # Get user's active subscriptions
            subscriptions = list(self.mongo_db.push_subscriptions.find({
                'user_id': user_id,
                'is_active': True
            }))
            
            if not subscriptions:
                logger.warning(f"⚠️ No active subscriptions found for user {user_id}")
                return
            
            # Send to all user's subscriptions
            success_count = 0
            for subscription in subscriptions:
                if self._send_push_notification(subscription, title, body, data, icon, url):
                    success_count += 1
                    # Update last used timestamp
                    self.mongo_db.push_subscriptions.update_one(
                        {'_id': subscription['_id']},
                        {'$set': {'last_used': datetime.utcnow()}}
                    )
            
            self.stats['total_sent'] += success_count
            self.stats['total_failed'] += len(subscriptions) - success_count
            
            logger.info(f"✅ Push notification sent to {success_count}/{len(subscriptions)} subscriptions for user {user_id}")
            
        except Exception as e:
            logger.error(f"❌ Error processing push notification for user {user_id}: {e}")
            self.stats['total_failed'] += 1
    
    def _process_broadcast_notification(self, title: str, body: str, data: Dict, 
                                       icon: str, url: str):
        """Process broadcast push notification"""
        try:
            # Get all active subscriptions
            subscriptions = list(self.mongo_db.push_subscriptions.find({
                'is_active': True
            }))
            
            if not subscriptions:
                logger.warning("⚠️ No active subscriptions found for broadcast")
                return
            
            success_count = 0
            for subscription in subscriptions:
                if self._send_push_notification(subscription, title, body, data, icon, url):
                    success_count += 1
                    # Update last used timestamp
                    self.mongo_db.push_subscriptions.update_one(
                        {'_id': subscription['_id']},
                        {'$set': {'last_used': datetime.utcnow()}}
                    )
            
            self.stats['total_sent'] += success_count
            self.stats['total_failed'] += len(subscriptions) - success_count
            
            logger.info(f"✅ Broadcast push notification sent to {success_count}/{len(subscriptions)} subscriptions")
            
        except Exception as e:
            logger.error(f"❌ Error processing broadcast push notification: {e}")
            self.stats['total_failed'] += 1
    
    def _process_role_notification(self, role: str, title: str, body: str, 
                                  data: Dict, icon: str, url: str):
        """Process push notification for users with specific role"""
        try:
            # Get users with specific role
            users = list(self.mongo_db.users.find({'role': role}, {'_id': 1}))
            user_ids = [str(user['_id']) for user in users]
            
            if not user_ids:
                logger.warning(f"⚠️ No users found with role {role}")
                return
            
            # Get subscriptions for these users
            subscriptions = list(self.mongo_db.push_subscriptions.find({
                'user_id': {'$in': user_ids},
                'is_active': True
            }))
            
            if not subscriptions:
                logger.warning(f"⚠️ No active subscriptions found for {role} users")
                return
            
            success_count = 0
            for subscription in subscriptions:
                if self._send_push_notification(subscription, title, body, data, icon, url):
                    success_count += 1
                    # Update last used timestamp
                    self.mongo_db.push_subscriptions.update_one(
                        {'_id': subscription['_id']},
                        {'$set': {'last_used': datetime.utcnow()}}
                    )
            
            self.stats['total_sent'] += success_count
            self.stats['total_failed'] += len(subscriptions) - success_count
            
            logger.info(f"✅ Push notification sent to {success_count}/{len(subscriptions)} {role} users")
            
        except Exception as e:
            logger.error(f"❌ Error processing push notification for {role} users: {e}")
            self.stats['total_failed'] += 1
    
    def _send_push_notification(self, subscription: Dict, title: str, body: str, 
                               data: Dict, icon: str, url: str) -> bool:
        """Send push notification to a single subscription"""
        try:
            if not hasattr(self, '_vapid_private_key_file') or not self._vapid_private_key_file:
                logger.error("❌ VAPID private key not configured")
                return False
            
            # Prepare subscription info for pywebpush
            # Handle both old and new subscription formats
            if 'subscription' in subscription:
                # New format with nested subscription
                subscription_info = {
                    'endpoint': subscription['subscription']['endpoint'],
                    'keys': subscription['subscription']['keys']
                }
            else:
                # Old format with keys at top level
                subscription_info = {
                    'endpoint': subscription['endpoint'],
                    'keys': subscription['keys']
                }
            
            # Prepare notification payload
            payload = {
                'title': title,
                'body': body,
                'icon': icon or '/icon-192x192.png',
                'badge': '/icon-72x72.png',
                'url': url or '/',
                'data': data,
                'tag': f"notification-{datetime.utcnow().timestamp()}",
                'timestamp': datetime.utcnow().isoformat()
            }
            
            # Send push notification
            webpush(
                subscription_info=subscription_info,
                data=json.dumps(payload),
                vapid_private_key=self._vapid_private_key_file,
                vapid_claims={
                    "sub": f"mailto:{self.vapid_email}"
                }
            )
            
            logger.debug(f"✅ Push notification sent to {subscription_info['endpoint'][:50]}...")
            return True
            
        except WebPushException as e:
            if e.response and e.response.status_code == 410:
                # Subscription is no longer valid, mark as inactive
                self.mongo_db.push_subscriptions.update_one(
                    {'_id': subscription['_id']},
                    {'$set': {'is_active': False, 'updated_at': datetime.utcnow()}}
                )
                logger.warning(f"⚠️ Subscription marked as inactive (410 Gone): {subscription['endpoint'][:50]}...")
            else:
                logger.error(f"❌ WebPush error for {subscription['endpoint'][:50]}...: {e}")
            return False
            
        except Exception as e:
            logger.error(f"❌ Error sending push notification: {e}")
            return False
    
    def _update_stats(self):
        """Update service statistics"""
        try:
            self.stats['total_subscriptions'] = self.mongo_db.push_subscriptions.count_documents({})
            self.stats['active_subscriptions'] = self.mongo_db.push_subscriptions.count_documents({'is_active': True})
        except Exception as e:
            logger.error(f"❌ Error updating stats: {e}")
    
    def get_stats(self) -> Dict:
        """Get push notification service statistics"""
        self._update_stats()
        return {
            'push_notification_stats': self.stats.copy(),
            'timestamp': datetime.utcnow().isoformat(),
            'status': 'active'
        }
    
    def get_public_key(self) -> str:
        """Get VAPID public key for frontend"""
        return self.vapid_public_key or ""

# Global push notification service instance
push_notification_service = PushNotificationService()

# Convenience functions for easy import
def subscribe_user_to_push(user_id: str, subscription_data: Dict) -> Dict:
    """Subscribe user to push notifications"""
    return push_notification_service.subscribe_user(user_id, subscription_data)

def unsubscribe_user_from_push(user_id: str, endpoint: str = None) -> Dict:
    """Unsubscribe user from push notifications"""
    return push_notification_service.unsubscribe_user(user_id, endpoint)

def send_push_to_user(user_id: str, title: str, body: str, **kwargs) -> str:
    """Send push notification to specific user"""
    return push_notification_service.send_notification_to_user(user_id, title, body, **kwargs)

def send_push_to_all(title: str, body: str, **kwargs) -> str:
    """Send push notification to all users"""
    return push_notification_service.send_notification_to_all(title, body, **kwargs)

def send_push_to_role(role: str, title: str, body: str, **kwargs) -> str:
    """Send push notification to users with specific role"""
    return push_notification_service.send_notification_to_role(role, title, body, **kwargs)

def get_push_stats() -> Dict:
    """Get push notification statistics"""
    return push_notification_service.get_stats()

def get_vapid_public_key() -> str:
    """Get VAPID public key"""
    return push_notification_service.get_public_key()


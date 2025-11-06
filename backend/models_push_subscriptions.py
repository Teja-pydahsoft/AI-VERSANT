"""
Push Subscriptions Model
Stores push notification subscriptions for OneSignal ONLY
"""

from datetime import datetime
from bson import ObjectId
from mongo import mongo_db

class PushSubscription:
    """Model for managing OneSignal push notification subscriptions"""
    
    @staticmethod
    def create_onesignal_subscription(user_id, player_id, platform=None, browser=None, tags=None, device_info=None):
        """Create or update OneSignal subscription"""
        now = datetime.utcnow()
        
        subscription_data = {
            'user_id': user_id if isinstance(user_id, str) else str(user_id),
            'provider': 'onesignal',
            'player_id': player_id,
            'tags': tags or [],
            'platform': platform,
            'browser': browser,
            'device_info': device_info or {},
            'is_active': True,
            'last_seen_at': now,
            'last_subscribed': now,
            'last_heartbeat': now,
            'created_at': now,
            'updated_at': now
        }
        
        # Upsert: update if exists, create if not
        result = mongo_db.db.push_subscriptions.update_one(
            {
                'user_id': subscription_data['user_id'],
                'provider': 'onesignal',
                'player_id': player_id  # Ensure uniqueness per device
            },
            {'$set': subscription_data},
            upsert=True
        )
        
        return result.modified_count > 0 or result.upserted_id is not None
    
    @staticmethod
    def get_user_subscriptions(user_id):
        """Get all subscriptions for a user"""
        user_id_str = user_id if isinstance(user_id, str) else str(user_id)
        subscriptions = list(mongo_db.db.push_subscriptions.find({
            'user_id': user_id_str,
            'is_active': True
        }))
        return subscriptions
    
    @staticmethod
    def get_onesignal_subscription(user_id):
        """Get OneSignal subscription for a user"""
        user_id_str = user_id if isinstance(user_id, str) else str(user_id)
        return mongo_db.db.push_subscriptions.find_one({
            'user_id': user_id_str,
            'provider': 'onesignal',
            'is_active': True
        })
    
    @staticmethod
    def deactivate_onesignal_subscription(user_id):
        """Deactivate OneSignal subscription for a user"""
        user_id_str = user_id if isinstance(user_id, str) else str(user_id)
        now = datetime.utcnow()
        
        result = mongo_db.db.push_subscriptions.update_many(
            {
                'user_id': user_id_str,
                'provider': 'onesignal'
            },
            {
                '$set': {
                    'is_active': False,
                    'last_unsubscribed': now,
                    'updated_at': now
                }
            }
        )
        return result.modified_count > 0
    
    @staticmethod
    def delete_onesignal_subscription(user_id):
        """Delete OneSignal subscription for a user"""
        user_id_str = user_id if isinstance(user_id, str) else str(user_id)
        result = mongo_db.db.push_subscriptions.delete_many({
            'user_id': user_id_str,
            'provider': 'onesignal'
        })
        return result.deleted_count > 0
    
    @staticmethod
    def get_all_onesignal_player_ids():
        """Get all active OneSignal player IDs"""
        subscriptions = mongo_db.db.push_subscriptions.find({
            'provider': 'onesignal',
            'is_active': True,
            'player_id': {'$ne': None}
        })
        return [sub['player_id'] for sub in subscriptions]
    
    @staticmethod
    def get_player_ids_by_role(role):
        """Get OneSignal player IDs for users with specific role"""
        # Get user IDs with the role
        users = mongo_db.db.users.find({'role': role}, {'_id': 1})
        user_ids = [str(user['_id']) for user in users]
        
        # Get subscriptions for these users
        subscriptions = mongo_db.db.push_subscriptions.find({
            'user_id': {'$in': user_ids},
            'provider': 'onesignal',
            'is_active': True,
            'player_id': {'$ne': None}
        })
        return [sub['player_id'] for sub in subscriptions]
    
    @staticmethod
    def get_subscription_stats():
        """Get OneSignal subscription statistics"""
        total_onesignal = mongo_db.db.push_subscriptions.count_documents({
            'provider': 'onesignal',
            'is_active': True
        })
        
        total_users = mongo_db.db.users.count_documents({})
        
        return {
            'total_subscriptions': total_onesignal,
            'onesignal_subscriptions': total_onesignal,
            'total_users': total_users,
            'subscription_rate': round((total_onesignal / total_users * 100), 2) if total_users > 0 else 0
        }

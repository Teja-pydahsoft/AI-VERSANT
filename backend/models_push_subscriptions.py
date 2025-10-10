"""
Push Subscriptions Model
Stores push notification subscriptions for OneSignal and VAPID
"""

from datetime import datetime
from bson import ObjectId
from mongo import mongo_db

class PushSubscription:
    """Model for managing push notification subscriptions"""
    
    @staticmethod
    def create_onesignal_subscription(user_id, player_id, platform=None, browser=None, tags=None):
        """Create or update OneSignal subscription"""
        now = datetime.utcnow()
        
        subscription_data = {
            'user_id': user_id if isinstance(user_id, str) else str(user_id),
            'provider': 'onesignal',
            'player_id': player_id,
            'tags': tags or [],
            'platform': platform,
            'browser': browser,
            'is_active': True,
            'last_seen_at': now,
            'last_subscribed': now,
            'created_at': now,
            'updated_at': now
        }
        
        # Upsert: update if exists, create if not
        result = mongo_db.db.push_subscriptions.update_one(
            {
                'user_id': subscription_data['user_id'],
                'provider': 'onesignal'
            },
            {'$set': subscription_data},
            upsert=True
        )
        
        return result.modified_count > 0 or result.upserted_id is not None
    
    @staticmethod
    def create_vapid_subscription(user_id, subscription, user_agent=None):
        """Create or update VAPID subscription"""
        now = datetime.utcnow()
        
        subscription_data = {
            'user_id': user_id if isinstance(user_id, str) else str(user_id),
            'provider': 'vapid',
            'endpoint': subscription.get('endpoint'),
            'keys': subscription.get('keys', {}),
            'subscription': subscription,
            'user_agent': user_agent,
            'is_active': True,
            'active': True,
            'timestamp': now,
            'last_seen_at': now,
            'created_at': now,
            'updated_at': now
        }
        
        # Upsert: update if exists, create if not
        result = mongo_db.db.push_subscriptions.update_one(
            {
                'user_id': subscription_data['user_id'],
                'provider': 'vapid',
                'endpoint': subscription.get('endpoint')
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
    def get_vapid_subscriptions(user_id):
        """Get all VAPID subscriptions for a user"""
        user_id_str = user_id if isinstance(user_id, str) else str(user_id)
        return list(mongo_db.db.push_subscriptions.find({
            'user_id': user_id_str,
            'provider': 'vapid',
            'is_active': True
        }))
    
    @staticmethod
    def deactivate_subscription(user_id, provider):
        """Deactivate a subscription"""
        user_id_str = user_id if isinstance(user_id, str) else str(user_id)
        now = datetime.utcnow()
        
        result = mongo_db.db.push_subscriptions.update_many(
            {
                'user_id': user_id_str,
                'provider': provider
            },
            {
                '$set': {
                    'is_active': False,
                    'active': False,
                    'last_unsubscribed': now,
                    'updated_at': now
                }
            }
        )
        return result.modified_count > 0
    
    @staticmethod
    def delete_subscription(user_id, provider):
        """Delete a subscription"""
        user_id_str = user_id if isinstance(user_id, str) else str(user_id)
        result = mongo_db.db.push_subscriptions.delete_many({
            'user_id': user_id_str,
            'provider': provider
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
        """Get subscription statistics"""
        total_onesignal = mongo_db.db.push_subscriptions.count_documents({
            'provider': 'onesignal',
            'is_active': True
        })
        
        total_vapid = mongo_db.db.push_subscriptions.count_documents({
            'provider': 'vapid',
            'is_active': True
        })
        
        total_users = mongo_db.db.users.count_documents({})
        
        return {
            'total_subscriptions': total_onesignal + total_vapid,
            'onesignal_subscriptions': total_onesignal,
            'vapid_subscriptions': total_vapid,
            'total_users': total_users,
            'subscription_rate': round(((total_onesignal + total_vapid) / total_users * 100), 2) if total_users > 0 else 0
        }

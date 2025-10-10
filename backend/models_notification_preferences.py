from datetime import datetime
from bson import ObjectId
from mongo import mongo_db

class NotificationPreferences:
    """Model for managing user notification preferences"""
    
    @staticmethod
    def create_default_preferences(user_id):
        """Create default notification preferences for a new user"""
        default_prefs = {
            'user_id': ObjectId(user_id) if isinstance(user_id, str) else user_id,
            'push_notifications': {
                'enabled': True,
                'providers': {
                    'onesignal': {
                        'subscribed': False,
                        'player_id': None,
                        'user_id': None,
                        'tags': [],
                        'platform': None,
                        'browser': None,
                        'last_seen_at': None,
                        'last_subscribed': None,
                        'last_unsubscribed': None,
                        'is_active': False
                    },
                    'vapid': {
                        'enabled': False,  # For future use
                        'subscription': None,  # For future use
                        'endpoint': None,  # For future use
                        'last_seen_at': None  # For future use
                    }
                },
                'last_subscribed': None,
                'last_unsubscribed': None
            },
            'email_notifications': {
                'enabled': True,
                'test_results': True,
                'test_reminders': True,
                'announcements': True,
                'system_updates': True
            },
            'sms_notifications': {
                'enabled': True,
                'test_results': True,
                'test_reminders': True,
                'urgent_announcements': True
            },
            'notification_types': {
                'test_completed': True,
                'test_scheduled': True,
                'test_reminder': True,
                'results_released': True,
                'batch_created': True,
                'batch_updated': True,
                'course_created': True,
                'course_updated': True,
                'campus_announcement': True,
                'system_maintenance': True,
                'profile_updated': True,
                'password_changed': True
            },
            'quiet_hours': {
                'enabled': False,
                'start_time': '22:00',
                'end_time': '08:00',
                'timezone': 'UTC'
            },
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        
        result = mongo_db.db.notification_preferences.insert_one(default_prefs)
        return str(result.inserted_id)

    @staticmethod
    def get_user_preferences(user_id):
        """Get notification preferences for a user"""
        user_id_obj = ObjectId(user_id) if isinstance(user_id, str) else user_id
        preferences = mongo_db.db.notification_preferences.find_one({'user_id': user_id_obj})
        return preferences

    @staticmethod
    def update_user_preferences(user_id, updates):
        """Update notification preferences for a user"""
        user_id_obj = ObjectId(user_id) if isinstance(user_id, str) else user_id
        updates['updated_at'] = datetime.utcnow()
        
        result = mongo_db.db.notification_preferences.update_one(
            {'user_id': user_id_obj},
            {'$set': updates},
            upsert=True
        )
        return result.modified_count > 0 or result.upserted_id is not None

    @staticmethod
    def update_onesignal_subscription(user_id, subscribed, player_id=None, onesignal_user_id=None, subscription_details=None):
        """Update OneSignal subscription status for a user"""
        user_id_obj = ObjectId(user_id) if isinstance(user_id, str) else user_id
        now = datetime.utcnow()
        
        update_data = {
            'push_notifications.enabled': True,  # Enable push notifications
            'push_notifications.onesignal_subscribed': subscribed,
            'push_notifications.last_subscribed': now if subscribed else None,
            'push_notifications.last_unsubscribed': now if not subscribed else None,
            'push_notifications.updated_at': now
        }
        
        if player_id:
            update_data['push_notifications.onesignal_player_id'] = player_id
            # Store player_id in user document for quick lookup
            mongo_db.db.users.update_one(
                {'_id': user_id_obj},
                {'$set': {
                    'onesignal_player_id': player_id,
                    'onesignal_subscribed_at': now
                }}
            )
            
        if onesignal_user_id:
            update_data['push_notifications.onesignal_user_id'] = onesignal_user_id
            
        # Store subscription details if provided
        if subscription_details:
            update_data['push_notifications.subscription'] = subscription_details
        
        # Update or create notification preferences
        result = mongo_db.db.notification_preferences.update_one(
            {'user_id': user_id_obj},
            {
                '$set': update_data,
                '$setOnInsert': {
                    'notification_types': {
                        'test_completed': True,
                        'test_scheduled': True,
                        'test_reminder': True,
                        'test_results': True,
                        'system_updates': True,
                        'announcements': True
                    }
                }
            },
            upsert=True
        )
        
        return result.modified_count > 0 or result.upserted_id is not None

    @staticmethod
    def update_onesignal_subscription(user_id, subscribed=True, player_id=None, user_data=None):
        """Update OneSignal subscription details"""
        now = datetime.now()
        update = {
            '$set': {
                'push_notifications.providers.onesignal.subscribed': subscribed,
                'push_notifications.providers.onesignal.is_active': subscribed,
                'push_notifications.providers.onesignal.last_seen_at': now,
            }
        }
        
        if subscribed:
            update['$set'].update({
                'push_notifications.providers.onesignal.player_id': player_id,
                'push_notifications.providers.onesignal.last_subscribed': now,
            })
            
            # Add additional user data if provided
            if user_data:
                if 'platform' in user_data:
                    update['$set']['push_notifications.providers.onesignal.platform'] = user_data['platform']
                if 'browser' in user_data:
                    update['$set']['push_notifications.providers.onesignal.browser'] = user_data['browser']
                if 'tags' in user_data:
                    update['$set']['push_notifications.providers.onesignal.tags'] = user_data['tags']
        else:
            update['$set']['push_notifications.providers.onesignal.last_unsubscribed'] = now
        
        result = mongo_db.db.notification_preferences.update_one(
            {'user_id': ObjectId(user_id)},
            update
        )
        return result.modified_count > 0

    @staticmethod
    def get_subscribed_users(notification_type=None):
        """Get all users who are subscribed to push notifications"""
        query = {
            'push_notifications.enabled': True,
            'push_notifications.providers.onesignal.subscribed': True,
            'push_notifications.providers.onesignal.is_active': True
        }
        
        if notification_type:
            query[f'notification_types.{notification_type}'] = True
        
        users = list(mongo_db.db.notification_preferences.find(query))
        
        # Get user details for subscribed users
        user_ids = [pref['user_id'] for pref in users]
        user_details = list(mongo_db.db.users.find(
            {'_id': {'$in': user_ids}},
            {'_id': 1, 'name': 1, 'email': 1, 'role': 1, 'campus_id': 1, 'course_id': 1}
        ))
        
        # Merge preferences with user details
        user_prefs_map = {pref['user_id']: pref for pref in users}
        result = []
        
        for user in user_details:
            user_pref = user_prefs_map.get(user['_id'])
            if user_pref:
                user['notification_preferences'] = user_pref
                user['onesignal_player_id'] = user_pref['push_notifications'].get('onesignal_player_id')
                user['onesignal_user_id'] = user_pref['push_notifications'].get('onesignal_user_id')
                result.append(user)
        
        return result

    @staticmethod
    def get_users_by_role(role, notification_type=None):
        """Get users by role who are subscribed to notifications"""
        query = {
            'role': role,
            'push_notifications.enabled': True,
            'push_notifications.onesignal_subscribed': True
        }
        
        if notification_type:
            query[f'notification_types.{notification_type}'] = True
        
        # First get user IDs from notification preferences
        pref_query = {'push_notifications.enabled': True, 'push_notifications.onesignal_subscribed': True}
        if notification_type:
            pref_query[f'notification_types.{notification_type}'] = True
            
        pref_users = list(mongo_db.db.notification_preferences.find(pref_query, {'user_id': 1}))
        user_ids = [pref['user_id'] for pref in pref_users]
        
        # Then get users with the specified role
        users = list(mongo_db.db.users.find(
            {'_id': {'$in': user_ids}, 'role': role},
            {'_id': 1, 'name': 1, 'email': 1, 'role': 1, 'campus_id': 1, 'course_id': 1}
        ))
        
        # Merge with preferences
        user_prefs_map = {pref['user_id']: pref for pref in pref_users}
        result = []
        
        for user in users:
            user_pref = user_prefs_map.get(user['_id'])
            if user_pref:
                user['notification_preferences'] = user_pref
                user['onesignal_player_id'] = user_pref['push_notifications'].get('onesignal_player_id')
                user['onesignal_user_id'] = user_pref['push_notifications'].get('onesignal_user_id')
                result.append(user)
        
        return result

    @staticmethod
    def update_vapid_subscription(user_id, subscription, platform='web', browser=None):
        """Update VAPID subscription details"""
        now = datetime.now()
        update = {
            '$set': {
                'push_notifications.providers.vapid.enabled': True,
                'push_notifications.providers.vapid.subscription': subscription,
                'push_notifications.providers.vapid.endpoint': subscription.get('endpoint'),
                'push_notifications.providers.vapid.last_seen_at': now,
                'push_notifications.providers.vapid.platform': platform,
                'push_notifications.providers.vapid.browser': browser,
                'updated_at': now
            }
        }
        
        result = mongo_db.db.notification_preferences.update_one(
            {'user_id': ObjectId(user_id)},
            update,
            upsert=True
        )
        return result.modified_count > 0 or result.upserted_id is not None

    @staticmethod
    def disable_vapid_subscription(user_id):
        """Disable VAPID subscription for a user"""
        now = datetime.now()
        update = {
            '$set': {
                'push_notifications.providers.vapid.enabled': False,
                'push_notifications.providers.vapid.subscription': None,
                'push_notifications.providers.vapid.endpoint': None,
                'push_notifications.providers.vapid.last_unsubscribed': now,
                'updated_at': now
            }
        }
        
        result = mongo_db.db.notification_preferences.update_one(
            {'user_id': ObjectId(user_id)},
            update
        )
        return result.modified_count > 0

    @staticmethod
    def delete_user_preferences(user_id):
        """Delete notification preferences for a user"""
        user_id_obj = ObjectId(user_id) if isinstance(user_id, str) else user_id
        result = mongo_db.db.notification_preferences.delete_one({'user_id': user_id_obj})
        return result.deleted_count > 0

    @staticmethod
    def get_notification_stats():
        """Get notification subscription statistics"""
        total_users = mongo_db.db.users.count_documents({})
        
        push_subscribed = mongo_db.db.notification_preferences.count_documents({
            'push_notifications.enabled': True,
            'push_notifications.onesignal_subscribed': True
        })
        
        email_enabled = mongo_db.db.notification_preferences.count_documents({
            'email_notifications.enabled': True
        })
        
        sms_enabled = mongo_db.db.notification_preferences.count_documents({
            'sms_notifications.enabled': True
        })
        
        return {
            'total_users': total_users,
            'push_subscribed': push_subscribed,
            'email_enabled': email_enabled,
            'sms_enabled': sms_enabled,
            'push_subscription_rate': round((push_subscribed / total_users * 100), 2) if total_users > 0 else 0
        }

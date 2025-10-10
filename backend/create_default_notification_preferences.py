#!/usr/bin/env python3
"""
Script to create default notification preferences for all existing users
Run this script to ensure all users have notification preferences set up
"""

import os
import sys
from datetime import datetime

# Add the backend directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from mongo import mongo_db
from models_notification_preferences import NotificationPreferences

def create_default_preferences_for_all_users():
    """Create default notification preferences for all users who don't have them"""
    try:
        print("🔔 Starting to create default notification preferences for all users...")
        
        # Get all users from the database
        users = mongo_db.db.users.find({}, {'_id': 1, 'email': 1, 'name': 1})
        users_list = list(users)
        
        print(f"📊 Found {len(users_list)} users in the database")
        
        # Get all users who already have notification preferences
        existing_prefs = mongo_db.db.notification_preferences.find({}, {'user_id': 1})
        existing_user_ids = {str(pref['user_id']) for pref in existing_prefs}
        
        print(f"📊 Found {len(existing_user_ids)} users who already have notification preferences")
        
        # Create default preferences for users who don't have them
        users_to_update = []
        for user in users_list:
            user_id_str = str(user['_id'])
            if user_id_str not in existing_user_ids:
                users_to_update.append(user)
        
        print(f"📊 {len(users_to_update)} users need default notification preferences")
        
        if not users_to_update:
            print("✅ All users already have notification preferences!")
            return
        
        # Create default preferences for each user
        created_count = 0
        for user in users_to_update:
            try:
                user_id = user['_id']
                NotificationPreferences.create_default_preferences(user_id)
                created_count += 1
                print(f"✅ Created default preferences for user: {user.get('name', 'Unknown')} ({user.get('email', 'No email')})")
            except Exception as e:
                print(f"❌ Failed to create preferences for user {user.get('name', 'Unknown')}: {e}")
        
        print(f"\n🎉 Successfully created default notification preferences for {created_count} users!")
        
        # Verify the results
        total_prefs = mongo_db.db.notification_preferences.count_documents({})
        print(f"📊 Total notification preference records: {total_prefs}")
        
    except Exception as e:
        print(f"❌ Error creating default notification preferences: {e}")
        raise

def verify_notification_preferences():
    """Verify that notification preferences are properly set up"""
    try:
        print("\n🔍 Verifying notification preferences...")
        
        # Get all users
        users = mongo_db.db.users.find({}, {'_id': 1, 'email': 1, 'name': 1})
        users_list = list(users)
        
        # Get all notification preferences
        prefs = mongo_db.db.notification_preferences.find({}, {'user_id': 1})
        prefs_list = list(prefs)
        
        user_ids_with_prefs = {str(pref['user_id']) for pref in prefs_list}
        
        missing_prefs = []
        for user in users_list:
            user_id_str = str(user['_id'])
            if user_id_str not in user_ids_with_prefs:
                missing_prefs.append(user)
        
        if missing_prefs:
            print(f"❌ {len(missing_prefs)} users still missing notification preferences:")
            for user in missing_prefs:
                print(f"   - {user.get('name', 'Unknown')} ({user.get('email', 'No email')})")
        else:
            print("✅ All users have notification preferences!")
        
        # Show sample preferences
        if prefs_list:
            sample_pref = prefs_list[0]
            print(f"\n📋 Sample notification preferences structure:")
            print(f"   - User ID: {sample_pref.get('user_id')}")
            print(f"   - Push notifications enabled: {sample_pref.get('push_notifications', {}).get('enabled', False)}")
            print(f"   - Email notifications enabled: {sample_pref.get('email_notifications', {}).get('enabled', False)}")
            print(f"   - SMS notifications enabled: {sample_pref.get('sms_notifications', {}).get('enabled', False)}")
            print(f"   - Created at: {sample_pref.get('created_at')}")
        
    except Exception as e:
        print(f"❌ Error verifying notification preferences: {e}")

if __name__ == "__main__":
    print("🚀 VERSANT Notification Preferences Setup")
    print("=" * 50)
    
    try:
        # Create default preferences for all users
        create_default_preferences_for_all_users()
        
        # Verify the setup
        verify_notification_preferences()
        
        print("\n🎉 Notification preferences setup completed successfully!")
        
    except Exception as e:
        print(f"\n❌ Setup failed: {e}")
        sys.exit(1)

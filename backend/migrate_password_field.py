"""
Migration script to rename 'password' field to 'password_hash' for sub-superadmin users
"""
from mongo import mongo_db
from datetime import datetime

def migrate_password_field():
    """Migrate password field to password_hash for all sub-superadmin users"""
    
    print("🔄 Starting password field migration...")
    
    # Find all sub-superadmin users with 'password' field (not 'password_hash')
    users_to_migrate = mongo_db.db.users.find({
        'role': 'sub_superadmin',
        'password': {'$exists': True}
    })
    
    migrated_count = 0
    
    for user in users_to_migrate:
        try:
            # Get the password value
            password_value = user.get('password')
            
            if password_value:
                # Update: rename 'password' to 'password_hash' and remove old 'password' field
                result = mongo_db.db.users.update_one(
                    {'_id': user['_id']},
                    {
                        '$set': {
                            'password_hash': password_value,
                            'updated_at': datetime.utcnow()
                        },
                        '$unset': {
                            'password': ''  # Remove old password field
                        }
                    }
                )
                
                if result.modified_count > 0:
                    migrated_count += 1
                    print(f"✅ Migrated user: {user.get('username')} ({user.get('name')})")
                else:
                    print(f"⚠️ No changes for user: {user.get('username')}")
        
        except Exception as e:
            print(f"❌ Error migrating user {user.get('username')}: {e}")
    
    print(f"\n🎉 Migration complete! Migrated {migrated_count} users.")
    
    # Verify migration
    remaining = mongo_db.db.users.count_documents({
        'role': 'sub_superadmin',
        'password': {'$exists': True}
    })
    
    if remaining == 0:
        print("✅ All sub-superadmin users have been migrated successfully!")
    else:
        print(f"⚠️ Warning: {remaining} users still have 'password' field")

if __name__ == '__main__':
    print("=" * 60)
    print("Password Field Migration Script")
    print("=" * 60)
    print()
    
    migrate_password_field()
    
    print()
    print("=" * 60)
    print("Migration script finished")
    print("=" * 60)

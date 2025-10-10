"""
Migration script: normalize push_subscriptions documents to top-level endpoint and keys.
Run: python backend/scripts/normalize_push_subscriptions.py
"""
from datetime import datetime
import os
from utils.connection_manager import get_mongo_database


def main():
    db = get_mongo_database()
    col = db.push_subscriptions

    # Find documents that still have nested 'subscription' field
    docs = list(col.find({'subscription': {'$exists': True}}))
    print(f"Found {len(docs)} documents with nested 'subscription' field")

    for doc in docs:
        try:
            subscription = doc.get('subscription', {})
            endpoint = subscription.get('endpoint')
            keys = subscription.get('keys', {})

            if not endpoint:
                print(f"Skipping doc {doc.get('_id')} - no endpoint")
                continue

            update = {
                'endpoint': endpoint,
                'keys': keys,
                'updated_at': datetime.utcnow(),
                'is_active': doc.get('is_active', True)
            }

            col.update_one({'_id': doc['_id']}, {'$set': update, '$unset': {'subscription': ''}})
            print(f"Normalized subscription {_id} -> endpoint stored")
        except Exception as e:
            print(f"Failed to normalize doc {doc.get('_id')}: {e}")

    print('Migration complete')


if __name__ == '__main__':
    main()

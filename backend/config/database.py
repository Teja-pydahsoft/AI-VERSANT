import os
import logging
from dotenv import load_dotenv
from urllib.parse import urlparse

load_dotenv()

# PyMongo logs many ERROR lines from background pool threads during TLS failures; suppress unless debugging.
if os.getenv('MONGODB_DEBUG_LOGS', '').lower() not in ('1', 'true', 'yes'):
    for _name in (
        'pymongo',
        'pymongo.client',
        'pymongo.connection',
        'pymongo.serverSelection',
        'pymongo.topology',
        'pymongo.pool',
        'pymongo.mongo_client',
    ):
        logging.getLogger(_name).setLevel(logging.CRITICAL)


class DatabaseConfig:
    """MongoDB access: delegates to the shared connection manager (same TLS/options as database_simple)."""

    MONGODB_URI = os.getenv(
        'MONGODB_URI',
        'mongodb+srv://teja:teja0000@versant.ia46v3i.mongodb.net/suma_madam?retryWrites=true&w=majority&appName=Versant&connectTimeoutMS=30000&socketTimeoutMS=30000&serverSelectionTimeoutMS=30000',
    )

    @staticmethod
    def get_database_name():
        """Extract database name from MongoDB URI"""
        if not DatabaseConfig.MONGODB_URI:
            return 'suma_madam'

        try:
            parsed_uri = urlparse(DatabaseConfig.MONGODB_URI)
            db_name = parsed_uri.path.strip('/').split('?')[0]
            return db_name if db_name else 'suma_madam'
        except Exception:
            return 'suma_madam'

    @staticmethod
    def get_client():
        """Shared MongoClient (certifi, pooling) — do not construct a second client here."""
        from utils.connection_manager import get_mongo_client

        return get_mongo_client()

    @staticmethod
    def get_database():
        """Shared Database handle used by forms, analytics, global settings, etc."""
        from utils.connection_manager import get_mongo_database

        return get_mongo_database()

    @staticmethod
    def get_collection(collection_name):
        """Get specific collection"""
        db = DatabaseConfig.get_database()
        return db[collection_name]


class _SharedMongoDatabase:
    """So scripts can `from config.database import mongo_db` and hit the same pool as the app."""

    def __getattr__(self, name):
        from utils.connection_manager import get_mongo_database

        return getattr(get_mongo_database(), name)

    def __getitem__(self, name):
        from utils.connection_manager import get_mongo_database

        return get_mongo_database()[name]


mongo_db = _SharedMongoDatabase()


def init_db():
    """Initialize database connection and create indexes"""
    try:
        client = DatabaseConfig.get_client()
        db = DatabaseConfig.get_database()

        client.admin.command('ping')
        print('✅ MongoDB connection successful')

        users_collection = db['users']
        users_collection.create_index([('email', 1)])
        users_collection.create_index([('username', 1)], unique=True)

        test_results_collection = db['test_results']
        test_results_collection.create_index([('test_id', 1)])
        test_results_collection.create_index([('student_id', 1)])
        test_results_collection.create_index([('module_id', 1)])
        test_results_collection.create_index([('submitted_at', -1)])

        student_test_attempts_collection = db['student_test_attempts']
        student_test_attempts_collection.create_index([('test_id', 1)])
        student_test_attempts_collection.create_index([('student_id', 1)])
        student_test_attempts_collection.create_index([('module_id', 1)])
        student_test_attempts_collection.create_index([('submitted_at', -1)])

        print('✅ Database indexes created successfully')

    except Exception as e:
        print(f'❌ Database initialization error: {e}')
        raise e

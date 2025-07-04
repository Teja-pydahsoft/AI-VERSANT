import os
from pymongo import MongoClient
from dotenv import load_dotenv
from urllib.parse import urlparse

load_dotenv()

class DatabaseConfig:
    # Updated MongoDB URI with connection options to fix timeout issues
    MONGODB_URI = os.getenv('MONGODB_URI', 'mongodb+srv://teja:teja0000@versant.ia46v3i.mongodb.net/versant_final?retryWrites=true&w=majority&appName=Versant&connectTimeoutMS=30000&socketTimeoutMS=30000&serverSelectionTimeoutMS=30000')
    
    @staticmethod
    def get_database_name():
        """Extract database name from MongoDB URI"""
        if not DatabaseConfig.MONGODB_URI:
            return 'versant_final'  # fallback default
        
        try:
            # Parse the URI to extract database name
            parsed_uri = urlparse(DatabaseConfig.MONGODB_URI)
            # The path will be like '/database_name?params'
            db_name = parsed_uri.path.strip('/').split('?')[0]
            return db_name if db_name else 'versant_final'
        except Exception:
            return 'versant_final'  # fallback default
    
    @staticmethod
    def get_client():
        """Get MongoDB client instance with optimized connection settings for cloud deployment"""
        try:
            client_options = {
                'connectTimeoutMS': 30000,
                'socketTimeoutMS': 30000,
                'serverSelectionTimeoutMS': 30000,
                'maxPoolSize': 10,
                'minPoolSize': 1,
                'maxIdleTimeMS': 30000,
                'waitQueueTimeoutMS': 30000,
                'retryWrites': True,
                'w': 'majority',
                'appName': 'Versant',
                'directConnection': False,
                'retryReads': True,
                # SSL/TLS configuration for cloud deployment
                'tls': True,
                'tlsAllowInvalidCertificates': False,
                'tlsAllowInvalidHostnames': False,
                'tlsInsecure': False,
                # Additional connection options for better stability
                'heartbeatFrequencyMS': 10000,
                'maxConnecting': 2,
                'compressors': ['zlib'],
                'zlibCompressionLevel': 6
            }
            
            # Parse the URI and add SSL parameters if not present
            uri = DatabaseConfig.MONGODB_URI
            
            # Add SSL parameters to the connection string if not already present
            if 'ssl=true' not in uri.lower() and 'tls=true' not in uri.lower():
                if '?' in uri:
                    uri += '&ssl=true&tls=true'
                else:
                    uri += '?ssl=true&tls=true'
            
            return MongoClient(uri, **client_options)
        except Exception as e:
            print(f"❌ Error creating MongoDB client: {e}")
            raise e
    
    @staticmethod
    def get_database():
        """Get database instance"""
        client = DatabaseConfig.get_client()
        db_name = DatabaseConfig.get_database_name()
        print(f"📊 Using database: {db_name}")
        return client[db_name]
    
    @staticmethod
    def get_collection(collection_name):
        """Get specific collection"""
        db = DatabaseConfig.get_database()
        return db[collection_name]

def init_db():
    """Initialize database connection and create indexes"""
    try:
        client = DatabaseConfig.get_client()
        db_name = DatabaseConfig.get_database_name()
        db = client[db_name]
        
        # Test connection
        client.admin.command('ping')
        print("✅ MongoDB connection successful")
        
        # Create indexes for better performance
        users_collection = db['users']
        users_collection.create_index([("email", 1)], unique=True)
        users_collection.create_index([("username", 1)], unique=True)
        
        tests_collection = db['tests']
        tests_collection.create_index([("test_id", 1)], unique=True)
        tests_collection.create_index([("module", 1), ("difficulty", 1)])
        
        results_collection = db['test_results']
        results_collection.create_index([("user_id", 1), ("test_id", 1)])
        results_collection.create_index([("submitted_at", -1)])
        
        print("✅ Database indexes created successfully")
        
    except Exception as e:
        print(f"❌ Database initialization error: {e}")
        raise e 
import os
from pymongo import MongoClient
from dotenv import load_dotenv
from urllib.parse import urlparse

load_dotenv()

class DatabaseConfig:
    # MongoDB URI from environment variable
    MONGODB_URI = os.getenv('MONGODB_URI')
    
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
        """Get MongoDB client instance with minimal, reliable settings"""
        try:
            if not DatabaseConfig.MONGODB_URI:
                raise ValueError("MONGODB_URI environment variable is not set")
            
            # Simple, reliable client options
            client_options = {
                'connectTimeoutMS': 30000,
                'socketTimeoutMS': 30000,
                'serverSelectionTimeoutMS': 30000,
                'maxPoolSize': 10,
                'retryWrites': True,
                'w': 'majority',
                'appName': 'Versant'
            }
            
            # Ensure required parameters are in the connection string
            uri = DatabaseConfig.MONGODB_URI
            
            # Add required parameters for cloud deployment
            required_params = [
                'retryWrites=true',
                'w=majority'
            ]
            
            # Add parameters if not present
            for param in required_params:
                if param not in uri:
                    if '?' in uri:
                        uri += f'&{param}'
                    else:
                        uri += f'?{param}'
            
            print(f"🔗 Connecting to MongoDB...")
            
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
        print("🔄 Initializing MongoDB connection...")
        
        client = DatabaseConfig.get_client()
        db_name = DatabaseConfig.get_database_name()
        db = client[db_name]
        
        # Test connection
        client.admin.command('ping')
        print("✅ MongoDB connection successful")
        
        # Create indexes for better performance
        print("🔄 Creating database indexes...")
        
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
"""
Performance optimization configuration
"""
import os
from functools import wraps
import time
import logging
from flask import g, request
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure
import threading

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ConnectionPool:
    """Thread-safe connection pool for MongoDB"""
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if not self._initialized:
            self._client = None
            self._db = None
            self._initialized = True
    
    def get_client(self):
        """Get MongoDB client with optimized settings"""
        if self._client is None:
            from config.database_simple import DatabaseConfig
            self._client = DatabaseConfig.get_client()
        return self._client
    
    def get_db(self):
        """Get database instance"""
        if self._db is None:
            from config.database_simple import DatabaseConfig
            self._db = DatabaseConfig.get_database()
        return self._db

# Global connection pool instance
connection_pool = ConnectionPool()

def performance_monitor(f):
    """Decorator to monitor route performance"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        start_time = time.time()
        try:
            result = f(*args, **kwargs)
            execution_time = time.time() - start_time
            
            # Log slow requests
            if execution_time > 1.0:  # More than 1 second
                logger.warning(f"Slow request: {request.endpoint} took {execution_time:.2f}s")
            
            return result
        except Exception as e:
            execution_time = time.time() - start_time
            logger.error(f"Request failed: {request.endpoint} after {execution_time:.2f}s - {str(e)}")
            raise
    return decorated_function

def database_health_check():
    """Check database connection health"""
    try:
        client = connection_pool.get_client()
        client.admin.command('ping')
        return True
    except ConnectionFailure:
        return False

def get_connection_stats():
    """Get connection pool statistics"""
    try:
        client = connection_pool.get_client()
        server_info = client.server_info()
        return {
            'connected': True,
            'server_version': server_info.get('version', 'unknown'),
            'max_pool_size': client.options.pool_options.max_pool_size,
            'min_pool_size': client.options.pool_options.min_pool_size
        }
    except Exception as e:
        return {
            'connected': False,
            'error': str(e)
        }

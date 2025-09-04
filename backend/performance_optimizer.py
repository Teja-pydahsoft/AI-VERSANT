#!/usr/bin/env python3
"""
Performance optimization utilities for VERSANT Backend
Includes caching, connection pooling, and response optimization
"""

import functools
import time
import threading
from typing import Any, Dict, Optional
import redis
from flask import g, request, jsonify
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global cache for simple in-memory caching
_memory_cache = {}
_cache_lock = threading.Lock()

class PerformanceOptimizer:
    """Performance optimization utilities"""
    
    def __init__(self):
        self.redis_client = None
        self._init_redis()
    
    def _init_redis(self):
        """Initialize Redis connection for caching"""
        try:
            # Try to connect to Redis if available
            self.redis_client = redis.Redis(
                host=os.getenv('REDIS_URL', 'localhost'),
                port=int(os.getenv('REDIS_PORT', 6379)),
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5
            )
            self.redis_client.ping()
            logger.info("✅ Redis connection established for caching")
        except Exception as e:
            logger.warning(f"⚠️ Redis not available, using memory cache: {e}")
            self.redis_client = None
    
    def cache_result(self, key: str, value: Any, ttl: int = 300):
        """Cache a result with TTL"""
        try:
            if self.redis_client:
                self.redis_client.setex(key, ttl, str(value))
            else:
                with _cache_lock:
                    _memory_cache[key] = {
                        'value': value,
                        'expires': time.time() + ttl
                    }
        except Exception as e:
            logger.warning(f"Cache set failed: {e}")
    
    def get_cached_result(self, key: str) -> Optional[Any]:
        """Get cached result"""
        try:
            if self.redis_client:
                return self.redis_client.get(key)
            else:
                with _cache_lock:
                    if key in _memory_cache:
                        cache_data = _memory_cache[key]
                        if time.time() < cache_data['expires']:
                            return cache_data['value']
                        else:
                            del _memory_cache[key]
            return None
        except Exception as e:
            logger.warning(f"Cache get failed: {e}")
            return None
    
    def clear_cache(self, pattern: str = "*"):
        """Clear cache entries matching pattern"""
        try:
            if self.redis_client:
                keys = self.redis_client.keys(pattern)
                if keys:
                    self.redis_client.delete(*keys)
            else:
                with _cache_lock:
                    if pattern == "*":
                        _memory_cache.clear()
                    else:
                        keys_to_delete = [k for k in _memory_cache.keys() if pattern in k]
                        for key in keys_to_delete:
                            del _memory_cache[key]
        except Exception as e:
            logger.warning(f"Cache clear failed: {e}")

# Global optimizer instance
optimizer = PerformanceOptimizer()

def cached_response(ttl: int = 300, key_prefix: str = ""):
    """Decorator to cache API responses"""
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            # Generate cache key
            cache_key = f"{key_prefix}:{func.__name__}:{hash(str(args) + str(kwargs))}"
            
            # Try to get cached result
            cached_result = optimizer.get_cached_result(cache_key)
            if cached_result is not None:
                logger.info(f"🎯 Cache hit for {func.__name__}")
                return cached_result
            
            # Execute function and cache result
            result = func(*args, **kwargs)
            optimizer.cache_result(cache_key, result, ttl)
            logger.info(f"💾 Cached result for {func.__name__}")
            
            return result
        return wrapper
    return decorator

def performance_monitor(func):
    """Decorator to monitor function performance"""
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.time()
        try:
            result = func(*args, **kwargs)
            execution_time = time.time() - start_time
            
            # Log slow operations
            if execution_time > 1.0:
                logger.warning(f"🐌 Slow operation: {func.__name__} took {execution_time:.2f}s")
            elif execution_time > 0.5:
                logger.info(f"⏱️ Operation: {func.__name__} took {execution_time:.2f}s")
            
            return result
        except Exception as e:
            execution_time = time.time() - start_time
            logger.error(f"❌ Error in {func.__name__} after {execution_time:.2f}s: {e}")
            raise
    return wrapper

def optimize_response(func):
    """Decorator to optimize API responses"""
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        # Add performance headers
        response = func(*args, **kwargs)
        
        if hasattr(response, 'headers'):
            response.headers['X-Response-Time'] = str(time.time())
            response.headers['X-Cache-Status'] = 'MISS'  # Will be updated by cache decorator
        
        return response
    return wrapper

# Database connection optimization
def optimize_db_connections():
    """Optimize database connections for better performance"""
    try:
        from mongo import get_mongo_db
        db = get_mongo_db()
        
        # Ensure proper indexing
        collections_to_index = [
            'users', 'tests', 'test_results', 'students', 
            'batches', 'courses', 'practice_results'
        ]
        
        for collection_name in collections_to_index:
            collection = getattr(db, collection_name, None)
            if collection:
                # Create common indexes
                try:
                    collection.create_index("created_at")
                    collection.create_index("updated_at")
                    if collection_name == 'users':
                        collection.create_index("email", unique=True)
                    elif collection_name == 'test_results':
                        collection.create_index("student_id")
                        collection.create_index("test_id")
                except Exception as e:
                    logger.warning(f"Index creation failed for {collection_name}: {e}")
        
        logger.info("✅ Database connections optimized")
    except Exception as e:
        logger.error(f"❌ Database optimization failed: {e}")

# Memory optimization
def optimize_memory():
    """Optimize memory usage"""
    try:
        import gc
        gc.collect()  # Force garbage collection
        logger.info("✅ Memory optimized")
    except Exception as e:
        logger.error(f"❌ Memory optimization failed: {e}")

# Initialize optimizations
def init_performance_optimizations():
    """Initialize all performance optimizations"""
    logger.info("🚀 Initializing performance optimizations...")
    optimize_db_connections()
    optimize_memory()
    logger.info("✅ Performance optimizations initialized")

if __name__ == "__main__":
    init_performance_optimizations()

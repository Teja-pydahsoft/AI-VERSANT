#!/usr/bin/env python3
"""
Async Processing System for VERSANT Backend
Enables parallel execution of endpoints and database operations
"""

import asyncio
import concurrent.futures
import threading
import time
from typing import Any, Callable, Dict, List, Optional, Union
from functools import wraps
import logging
from flask import request, g, jsonify
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure
import queue
import weakref

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AsyncProcessor:
    """Async processing system for parallel execution"""
    
    def __init__(self, max_workers: int = 10):
        self.max_workers = max_workers
        self.thread_pool = concurrent.futures.ThreadPoolExecutor(max_workers=max_workers)
        self.task_queue = queue.Queue()
        self.background_queue = queue.Queue()  # Separate queue for background tasks
        self.running_tasks = {}
        self.background_tasks = {}  # Track background tasks
        self.task_counter = 0
        self._lock = threading.Lock()
        
        # Start background task processor
        self._start_background_processor()
        self._start_background_task_processor()
    
    def _start_background_processor(self):
        """Start background thread to process queued tasks"""
        def processor():
            while True:
                try:
                    task_id, func, args, kwargs, future = self.task_queue.get(timeout=1)
                    try:
                        result = func(*args, **kwargs)
                        future.set_result(result)
                    except Exception as e:
                        future.set_exception(e)
                    finally:
                        with self._lock:
                            if task_id in self.running_tasks:
                                del self.running_tasks[task_id]
                except queue.Empty:
                    continue
                except Exception as e:
                    logger.error(f"Background processor error: {e}")
        
        processor_thread = threading.Thread(target=processor, daemon=True)
        processor_thread.start()
    
    def _start_background_task_processor(self):
        """Start background thread to process background tasks (emails, SMS, etc.)"""
        def processor():
            while True:
                try:
                    task_id, func, args, kwargs = self.background_queue.get(timeout=1)
                    try:
                        result = func(*args, **kwargs)
                        logger.info(f"Background task {task_id} completed successfully")
                    except Exception as e:
                        logger.error(f"Background task {task_id} failed: {e}")
                    finally:
                        with self._lock:
                            if task_id in self.background_tasks:
                                del self.background_tasks[task_id]
                except queue.Empty:
                    continue
                except Exception as e:
                    logger.error(f"Error in background task processor: {e}")
        
        processor_thread = threading.Thread(target=processor, daemon=True)
        processor_thread.start()
    
    def submit_task(self, func: Callable, *args, **kwargs) -> str:
        """Submit a task for async execution"""
        with self._lock:
            self.task_counter += 1
            task_id = f"task_{self.task_counter}_{int(time.time())}"
        
        future = concurrent.futures.Future()
        self.task_queue.put((task_id, func, args, kwargs, future))
        
        with self._lock:
            self.running_tasks[task_id] = future
        
        return task_id
    
    def get_task_result(self, task_id: str, timeout: Optional[float] = None) -> Any:
        """Get result of a submitted task"""
        with self._lock:
            if task_id not in self.running_tasks:
                raise ValueError(f"Task {task_id} not found")
            future = self.running_tasks[task_id]
        
        return future.result(timeout=timeout)
    
    def submit_immediate(self, func: Callable, *args, **kwargs) -> concurrent.futures.Future:
        """Submit task for immediate execution in thread pool"""
        return self.thread_pool.submit(func, *args, **kwargs)
    
    def submit_background_task(self, func: Callable, *args, **kwargs) -> str:
        """Submit a background task (emails, SMS, file processing) that doesn't need immediate response"""
        with self._lock:
            self.task_counter += 1
            task_id = f"bg_task_{self.task_counter}_{int(time.time())}"
            self.background_tasks[task_id] = {
                'func': func.__name__,
                'submitted_at': time.time(),
                'status': 'queued'
            }
        
        self.background_queue.put((task_id, func, args, kwargs))
        logger.info(f"Background task {task_id} queued: {func.__name__}")
        return task_id

# Global async processor instance - optimized for 200-500 concurrent users
async_processor = AsyncProcessor(max_workers=100)  # Increased workers for high concurrency

def async_route(timeout: float = 30.0):
    """Decorator to make routes async and non-blocking with proper Flask context"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            try:
                # Get current Flask app context
                from flask import current_app
                app = current_app._get_current_object()
                
                def run_with_context():
                    """Run function with Flask application context"""
                    with app.app_context():
                        return func(*args, **kwargs)
                
                # Submit task to async processor with context
                future = async_processor.submit_immediate(run_with_context)
                
                # Wait for result with timeout
                result = future.result(timeout=timeout)
                return result
                
            except concurrent.futures.TimeoutError:
                logger.error(f"Route {func.__name__} timed out after {timeout}s")
                return jsonify({
                    'success': False,
                    'message': 'Request timeout - please try again'
                }), 408
            except Exception as e:
                logger.error(f"Async route error in {func.__name__}: {e}")
                return jsonify({
                    'success': False,
                    'message': f'Internal server error: {str(e)}'
                }), 500
        
        return wrapper
    return decorator

def parallel_execute(functions: List[Callable], timeout: float = 30.0) -> List[Any]:
    """Execute multiple functions in parallel"""
    futures = []
    
    for func in functions:
        future = async_processor.submit_immediate(func)
        futures.append(future)
    
    results = []
    for future in concurrent.futures.as_completed(futures, timeout=timeout):
        try:
            result = future.result()
            results.append(result)
        except Exception as e:
            logger.error(f"Parallel execution error: {e}")
            results.append(None)
    
    return results

class DatabaseConnectionPool:
    """Advanced connection pool for MongoDB"""
    
    def __init__(self, max_connections: int = 200):  # Increased for 200-500 concurrent users
        self.max_connections = max_connections
        self.connections = queue.Queue(maxsize=max_connections)
        self.connection_count = 0
        self._lock = threading.Lock()
        self._initialize_connections()
    
    def _initialize_connections(self):
        """Initialize connection pool"""
        try:
            from config.database_simple import DatabaseConfig
            # Create initial connections
            # One warm client avoids ten parallel TLS handshakes and log spam; pool grows on demand.
            for _ in range(min(1, self.max_connections)):
                client = DatabaseConfig.get_client()
                self.connections.put(client)
                self.connection_count += 1
            logger.info(f"✅ Database connection pool initialized with {self.connection_count} connection(s)")
        except Exception as e:
            logger.error(f"❌ Failed to initialize connection pool: {e}")
    
    def get_connection(self):
        """Get a database connection from pool"""
        try:
            # Try to get existing connection
            if not self.connections.empty():
                return self.connections.get_nowait()
            
            # Create new connection if under limit
            with self._lock:
                if self.connection_count < self.max_connections:
                    from config.database_simple import DatabaseConfig
                    client = DatabaseConfig.get_client()
                    self.connection_count += 1
                    return client
            
            # Wait for available connection
            return self.connections.get(timeout=5)
            
        except queue.Empty:
            logger.warning("No database connections available, creating temporary connection")
            from config.database_simple import DatabaseConfig
            return DatabaseConfig.get_client()
        except Exception as e:
            logger.error(f"Error getting database connection: {e}")
            from config.database_simple import DatabaseConfig
            return DatabaseConfig.get_client()
    
    def return_connection(self, connection):
        """Return connection to pool"""
        try:
            if self.connections.qsize() < self.max_connections:
                self.connections.put_nowait(connection)
        except queue.Full:
            # Pool is full, close connection
            try:
                connection.close()
                with self._lock:
                    self.connection_count -= 1
            except:
                pass

# Global connection pool
db_pool = DatabaseConnectionPool(max_connections=50)

def with_db_connection(func):
    """Decorator to provide database connection from pool"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        connection = None
        try:
            connection = db_pool.get_connection()
            # Add connection to kwargs
            kwargs['db_connection'] = connection
            return func(*args, **kwargs)
        finally:
            if connection:
                db_pool.return_connection(connection)
    
    return wrapper

class ResponseCache:
    """In-memory response cache with TTL"""
    
    def __init__(self, max_size: int = 10000, default_ttl: int = 300):  # Increased cache size for high concurrency
        self.cache = {}
        self.max_size = max_size
        self.default_ttl = default_ttl
        self._lock = threading.Lock()
        self._access_times = {}
    
    def get(self, key: str) -> Optional[Any]:
        """Get cached value"""
        with self._lock:
            if key in self.cache:
                value, expires = self.cache[key]
                if time.time() < expires:
                    self._access_times[key] = time.time()
                    return value
                else:
                    del self.cache[key]
                    if key in self._access_times:
                        del self._access_times[key]
            return None
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set cached value"""
        if ttl is None:
            ttl = self.default_ttl
        
        with self._lock:
            # Remove oldest entries if cache is full
            while len(self.cache) >= self.max_size:
                if not self._access_times:
                    break
                oldest_key = min(self._access_times.keys(), key=lambda k: self._access_times[k])
                if oldest_key in self.cache:
                    del self.cache[oldest_key]
                del self._access_times[oldest_key]
            
            expires = time.time() + ttl
            self.cache[key] = (value, expires)
            self._access_times[key] = time.time()
    
    def clear(self, pattern: str = None) -> None:
        """Clear cache entries"""
        with self._lock:
            if pattern is None:
                self.cache.clear()
                self._access_times.clear()
            else:
                keys_to_remove = [k for k in self.cache.keys() if pattern in k]
                for key in keys_to_remove:
                    if key in self.cache:
                        del self.cache[key]
                    if key in self._access_times:
                        del self._access_times[key]

# Global response cache
response_cache = ResponseCache(max_size=2000, default_ttl=300)

def cached_response(ttl: int = 300, key_func: Optional[Callable] = None):
    """Decorator to cache route responses"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Generate cache key
            if key_func:
                cache_key = key_func(*args, **kwargs)
            else:
                cache_key = f"{func.__name__}:{hash(str(args) + str(kwargs))}"
            
            # Try to get cached response
            cached_result = response_cache.get(cache_key)
            if cached_result is not None:
                logger.info(f"🎯 Cache hit for {func.__name__}")
                return cached_result
            
            # Execute function and cache result
            result = func(*args, **kwargs)
            response_cache.set(cache_key, result, ttl)
            logger.info(f"💾 Cached response for {func.__name__}")
            
            return result
        
        return wrapper
    return decorator

def performance_monitor(threshold: float = 1.0):
    """Decorator to monitor performance and log slow operations"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.time()
            try:
                result = func(*args, **kwargs)
                execution_time = time.time() - start_time
                
                if execution_time > threshold:
                    logger.warning(f"🐌 Slow operation: {func.__name__} took {execution_time:.2f}s")
                elif execution_time > 0.5:
                    logger.info(f"⏱️ Operation: {func.__name__} took {execution_time:.2f}s")
                
                return result
            except Exception as e:
                execution_time = time.time() - start_time
                logger.error(f"❌ Error in {func.__name__} after {execution_time:.2f}s: {e}")
                raise
        
        return wrapper
    return decorator

def cached_async_result(ttl: int = 300):
    """Decorator to cache async function results with TTL"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Create cache key from function name and arguments
            cache_key = f"{func.__name__}:{hash(str(args) + str(kwargs))}"
            
            # Check cache first
            cached_result = response_cache.get(cache_key)
            if cached_result is not None:
                logger.debug(f"🎯 Cache hit for {func.__name__}")
                return cached_result
            
            # Execute function and cache result
            try:
                result = func(*args, **kwargs)
                response_cache.set(cache_key, result, ttl)
                logger.debug(f"💾 Cached result for {func.__name__}")
                return result
            except Exception as e:
                logger.error(f"❌ Error in cached function {func.__name__}: {e}")
                raise
        
        return wrapper
    return decorator

# Background task utilities
def submit_background_task(func: Callable, *args, **kwargs) -> str:
    """Submit a background task for processing (emails, SMS, file processing)"""
    return async_processor.submit_background_task(func, *args, **kwargs)

def get_background_task_status(task_id: str) -> dict:
    """Get status of a background task"""
    with async_processor._lock:
        return async_processor.background_tasks.get(task_id, {'status': 'not_found'})

def get_all_background_tasks() -> dict:
    """Get all background tasks status"""
    with async_processor._lock:
        return dict(async_processor.background_tasks)

# Initialize async system
def init_async_system():
    """Initialize the async processing system"""
    logger.info("🚀 Initializing async processing system...")
    logger.info(f"   Max workers: {async_processor.max_workers}")
    logger.info(f"   DB pool size: {db_pool.max_connections}")
    logger.info(f"   Cache size: {response_cache.max_size}")
    logger.info("✅ Async processing system initialized")

if __name__ == "__main__":
    init_async_system()

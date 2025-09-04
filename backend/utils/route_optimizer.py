"""
Route optimization utilities for high-performance endpoints
"""
from functools import wraps
from flask import jsonify, request, g
import time
import logging
from pymongo.errors import PyMongoError
from bson.errors import InvalidId
import traceback

logger = logging.getLogger(__name__)

def optimized_route(f):
    """Decorator for optimized route handling with proper error management"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        start_time = time.time()
        request_id = f"{int(time.time() * 1000)}-{id(request)}"
        
        try:
            # Add request tracking
            g.request_id = request_id
            g.start_time = start_time
            
            # Execute the route
            result = f(*args, **kwargs)
            
            # Log performance
            execution_time = time.time() - start_time
            if execution_time > 0.5:  # Log slow requests
                logger.warning(f"Slow request {request_id}: {request.endpoint} took {execution_time:.2f}s")
            
            return result
            
        except InvalidId as e:
            logger.error(f"Invalid ID error in {request_id}: {str(e)}")
            return jsonify({
                'success': False,
                'message': 'Invalid ID format',
                'error': 'INVALID_ID'
            }), 400
            
        except PyMongoError as e:
            logger.error(f"MongoDB error in {request_id}: {str(e)}")
            return jsonify({
                'success': False,
                'message': 'Database error occurred',
                'error': 'DATABASE_ERROR'
            }), 500
            
        except Exception as e:
            execution_time = time.time() - start_time
            logger.error(f"Unexpected error in {request_id} after {execution_time:.2f}s: {str(e)}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            
            return jsonify({
                'success': False,
                'message': 'Internal server error',
                'error': 'INTERNAL_ERROR',
                'request_id': request_id
            }), 500
    
    return decorated_function

def paginate_results(query, page=1, per_page=20, max_per_page=100):
    """Paginate MongoDB query results efficiently"""
    # Validate pagination parameters
    page = max(1, int(page))
    per_page = min(max(1, int(per_page)), max_per_page)
    
    # Calculate skip value
    skip = (page - 1) * per_page
    
    # Execute query with pagination
    try:
        # Get total count (this can be expensive, consider caching)
        total = query.count()
        
        # Get paginated results
        results = list(query.skip(skip).limit(per_page))
        
        # Calculate pagination info
        total_pages = (total + per_page - 1) // per_page
        has_next = page < total_pages
        has_prev = page > 1
        
        return {
            'data': results,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': total,
                'total_pages': total_pages,
                'has_next': has_next,
                'has_prev': has_prev
            }
        }
    except Exception as e:
        logger.error(f"Pagination error: {str(e)}")
        raise

def batch_process(items, batch_size=100):
    """Process items in batches to avoid memory issues"""
    for i in range(0, len(items), batch_size):
        yield items[i:i + batch_size]

def validate_request_data(required_fields=None, optional_fields=None):
    """Validate request data with proper error handling"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            try:
                data = request.get_json()
                if not data:
                    return jsonify({
                        'success': False,
                        'message': 'Request body must be JSON',
                        'error': 'INVALID_JSON'
                    }), 400
                
                # Check required fields
                if required_fields:
                    missing_fields = [field for field in required_fields if field not in data]
                    if missing_fields:
                        return jsonify({
                            'success': False,
                            'message': f'Missing required fields: {", ".join(missing_fields)}',
                            'error': 'MISSING_FIELDS'
                        }), 400
                
                # Add validated data to request context
                g.validated_data = data
                return f(*args, **kwargs)
                
            except Exception as e:
                logger.error(f"Request validation error: {str(e)}")
                return jsonify({
                    'success': False,
                    'message': 'Invalid request data',
                    'error': 'VALIDATION_ERROR'
                }), 400
        
        return decorated_function
    return decorator

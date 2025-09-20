"""
Analytics Middleware
Automatically tracks all requests for comprehensive analytics
"""

import time
from flask import request, g

def init_analytics_middleware(app):
    """Initialize analytics middleware for the Flask app"""
    
    @app.before_request
    def before_request():
        """Track request start time"""
        g.start_time = time.time()
    
    @app.after_request
    def after_request(response):
        """Track request completion and metrics"""
        try:
            # Calculate response time
            response_time = time.time() - g.start_time if hasattr(g, 'start_time') else 0
            
            # Get request details
            endpoint = request.endpoint or request.path
            method = request.method
            response_code = response.status_code
            
            # Estimate bytes (this is approximate)
            bytes_sent = len(response.get_data()) if response.get_data() else 0
            bytes_received = request.content_length or 0
            
            # Get error message if any
            error_msg = None
            if response_code >= 400:
                try:
                    response_data = response.get_json()
                    if response_data and 'error' in response_data:
                        error_msg = response_data['error']
                    else:
                        error_msg = f"HTTP {response_code}"
                except:
                    error_msg = f"HTTP {response_code}"
            
            # Real analytics tracking is handled by real_analytics_middleware
            # No need to track here to avoid double counting
            
        except Exception as e:
            # Don't let analytics errors break the request
            print(f"Analytics tracking error: {e}")
        
        return response

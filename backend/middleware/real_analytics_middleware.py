"""
Real Analytics Middleware
Tracks actual server requests and performance
"""

from flask import g, request, current_app
import time
import sys

def init_real_analytics_middleware(app):
    """Initialize real analytics middleware"""
    from utils.real_analytics import real_analytics
    
    @app.before_request
    def before_request():
        g.start_time = time.time()
        g.request_size = 0
    
    @app.after_request
    def after_request(response):
        try:
            # Calculate response time
            response_time = time.time() - g.start_time
            
            # Get request size
            request_size = g.get('request_size', 0)
            
            # Get response size
            response_size = len(response.get_data())
            
            # Extract endpoint (remove query params)
            endpoint = request.endpoint or request.path
            if '?' in endpoint:
                endpoint = endpoint.split('?')[0]
            
            # Get error message if any
            error_msg = None
            if response.status_code >= 400:
                try:
                    response_data = response.get_json()
                    if response_data and 'error' in response_data:
                        error_msg = response_data['error']
                except:
                    error_msg = f"HTTP {response.status_code}"
            
            # Track the request
            real_analytics.track_request(
                endpoint=endpoint,
                method=request.method,
                response_code=response.status_code,
                response_time=response_time,
                bytes_sent=response_size,
                error_msg=error_msg
            )
            
        except Exception as e:
            # Don't let analytics break the main app
            print(f"Analytics tracking error: {e}")
        
        return response

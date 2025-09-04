#!/usr/bin/env python3
"""
Production WSGI application entry point
This is the main file that deployment platforms will use
"""
import os
from main import app

# Set production environment
os.environ.setdefault('FLASK_ENV', 'production')

# Export the Flask application for WSGI servers
application = app

# For platforms that expect 'app' instead of 'application'
app = application

if __name__ == '__main__':
    # This is only for local testing
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)

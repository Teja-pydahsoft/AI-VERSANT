#!/usr/bin/env python3
"""
WSGI entry point for production deployment
This file is used by Gunicorn and other WSGI servers
"""


"""from main import app, socketio
    socketio.run(app)"""


from main import app

# Export the Flask app for WSGI servers
application = app

# For compatibility with different deployment platforms
if __name__ == '__main__':
    # This won't be used in production, but good for testing
    app.run(host='0.0.0.0', port=5000)
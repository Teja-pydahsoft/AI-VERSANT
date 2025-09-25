from flask_socketio import SocketIO
import os
 
# This instance will be initialized with the Flask app in main_with_socketio.py
# Enhanced SocketIO CORS configuration to match Flask CORS settings
allow_all_origins = os.getenv('ALLOW_ALL_CORS', 'true').lower() == 'true'  # Match Flask CORS default

if allow_all_origins:
    # Allow all origins for development/testing (matches Flask CORS)
    socketio = SocketIO(
        cors_allowed_origins="*",
        logger=False,
        engineio_logger=False,
        always_connect=True,
        ping_timeout=60,
        ping_interval=25
    )
else:
    # Use specific origins for production (matches Flask CORS)
    default_origins = 'http://localhost:3000,http://localhost:5173,https://crt.pydahsoft.in,https://versant-frontend.vercel.app,https://crt.pydahsoft.in,https://52.66.128.80,https://another-versant.vercel.app'
    cors_origins = os.getenv('CORS_ORIGINS', default_origins)
    origins_list = [origin.strip() for origin in cors_origins.split(',')]
    socketio = SocketIO(
        cors_allowed_origins=origins_list,
        logger=False,
        engineio_logger=False,
        always_connect=True,
        ping_timeout=60,
        ping_interval=25
    ) 
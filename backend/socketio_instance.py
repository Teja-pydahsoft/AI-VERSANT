from flask_socketio import SocketIO
import os
 
# This instance will be initialized with the Flask app in main_with_socketio.py
# Enhanced SocketIO CORS configuration
allow_all_origins = os.getenv('ALLOW_ALL_CORS', 'false').lower() == 'true'

if allow_all_origins:
    socketio = SocketIO(cors_allowed_origins="*")
else:
    # Use specific origins for production
    default_origins = 'http://localhost:3000,http://localhost:5173,https://pydah-studyedge.vercel.app,https://versant-frontend.vercel.app,https://crt.pydahsoft.in,https://ai-versant.onrender.com'
    cors_origins = os.getenv('CORS_ORIGINS', default_origins)
    socketio = SocketIO(cors_allowed_origins=cors_origins.split(',')) 
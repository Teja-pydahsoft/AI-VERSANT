#!/usr/bin/env python3
"""
Windows-optimized startup script for development and testing
"""
import os
import sys
from dotenv import load_dotenv

load_dotenv()

def start_development_server():
    """Start development server optimized for Windows"""
    from main import create_app
    
    app, socketio = create_app()
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_DEBUG', 'True').lower() == 'true'
    
    print(f"🪟 Starting VERSANT Backend in DEVELOPMENT mode (Windows)")
    print(f"   Port: {port}")
    print(f"   Debug: {debug}")
    print(f"   SocketIO: Enabled")
    
    try:
        # Use SocketIO for real-time features
        socketio.run(
            app, 
            host='0.0.0.0', 
            port=port, 
            debug=debug,
            use_reloader=debug,
            log_output=True
        )
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
        sys.exit(0)
    except Exception as e:
        print(f"❌ Failed to start server: {e}")
        sys.exit(1)

def start_simple_server():
    """Start simple Flask server without SocketIO (fallback)"""
    from main import create_app
    
    app, socketio = create_app()
    port = int(os.getenv('PORT', 5000))
    
    print(f"🪟 Starting VERSANT Backend in SIMPLE mode (Windows)")
    print(f"   Port: {port}")
    print(f"   SocketIO: Disabled (fallback mode)")
    
    try:
        # Use regular Flask run without SocketIO
        app.run(
            host='0.0.0.0', 
            port=port, 
            debug=False,
            threaded=True  # Enable threading for better performance
        )
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
        sys.exit(0)
    except Exception as e:
        print(f"❌ Failed to start server: {e}")
        sys.exit(1)

def check_windows_dependencies():
    """Check Windows-specific dependencies"""
    required_packages = [
        'flask',
        'pymongo',
        'flask_socketio'
    ]
    
    missing_packages = []
    for package in required_packages:
        try:
            __import__(package)
        except ImportError:
            missing_packages.append(package)
    
    if missing_packages:
        print(f"❌ Missing required packages: {', '.join(missing_packages)}")
        print("Please install them with: pip install -r requirements.txt")
        return False
    
    print("✅ All required dependencies are available")
    return True

def check_environment():
    """Check environment configuration"""
    required_env_vars = [
        'MONGODB_URI',
        'JWT_SECRET_KEY'
    ]
    
    missing_vars = []
    for var in required_env_vars:
        if not os.getenv(var):
            missing_vars.append(var)
    
    if missing_vars:
        print(f"❌ Missing required environment variables: {', '.join(missing_vars)}")
        return False
    
    print("✅ Environment configuration is valid")
    return True

if __name__ == '__main__':
    print("🪟 Windows VERSANT Backend Startup")
    print("=" * 50)
    
    # Check dependencies
    if not check_windows_dependencies():
        sys.exit(1)
    
    # Check environment
    if not check_environment():
        sys.exit(1)
    
    # Choose startup mode
    mode = os.getenv('STARTUP_MODE', 'development').lower()
    
    if mode == 'simple':
        print("\n🚀 Starting in SIMPLE mode...")
        start_simple_server()
    else:
        print("\n🚀 Starting in DEVELOPMENT mode...")
        try:
            start_development_server()
        except Exception as e:
            print(f"⚠️ Development mode failed: {e}")
            print("🔄 Falling back to simple mode...")
            start_simple_server()

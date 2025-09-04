#!/usr/bin/env python3
"""
Simple production runner that works with standard deployment commands
"""
import os
import sys
import subprocess
import platform

def run_production():
    """Run the application in production mode"""
    
    # Set production environment
    os.environ.setdefault('FLASK_ENV', 'production')
    os.environ.setdefault('ENVIRONMENT', 'production')
    
    # Get port from environment
    port = os.environ.get('PORT', '5000')
    
    # Detect OS and choose best configuration
    is_unix = platform.system().lower() in ['linux', 'darwin', 'freebsd', 'openbsd']
    
    if is_unix:
        print("🐧 Unix/Linux detected - using optimized configuration")
        # Use Unix-optimized configuration
        cmd = [
            'gunicorn',
            '--config', 'gunicorn_unix_config.py',
            '--bind', f'0.0.0.0:{port}',
            'application:application'
        ]
    else:
        print("🪟 Windows detected - using standard configuration")
        # Use standard configuration
        cmd = [
            'gunicorn',
            '--config', 'gunicorn_config.py',
            '--bind', f'0.0.0.0:{port}',
            'application:application'
        ]
    
    print(f"🚀 Starting production server on port {port}")
    print(f"🔧 Command: {' '.join(cmd)}")
    
    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to start server: {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
        sys.exit(0)

if __name__ == '__main__':
    run_production()

 
#!/usr/bin/env python3
"""
Production startup script optimized for high concurrency
"""
import os
import sys
import multiprocessing
from dotenv import load_dotenv

load_dotenv()

def get_optimal_workers():
    """Calculate optimal number of workers based on system resources"""
    cpu_count = multiprocessing.cpu_count()
    
    # For I/O intensive applications (like this one with MongoDB and file uploads)
    # Use more workers than CPU cores
    workers = min(cpu_count * 4, 16)  # Cap at 16 workers
    
    # Adjust based on available memory (rough estimate)
    try:
        import psutil
        available_memory_gb = psutil.virtual_memory().available / (1024**3)
        if available_memory_gb < 4:
            workers = min(workers, 4)
        elif available_memory_gb < 8:
            workers = min(workers, 8)
    except ImportError:
        # psutil not available, use conservative estimate
        workers = min(workers, 8)
    
    return max(2, workers)  # At least 2 workers

def start_production_server():
    """Start production server with optimized settings"""
    import platform
    
    # Get configuration
    port = int(os.getenv('PORT', '5000'))
    workers = get_optimal_workers()
    
    # Detect operating system and choose appropriate server
    is_windows = platform.system().lower() == 'windows'
    
    print(f"🚀 Starting VERSANT Backend in PRODUCTION mode")
    print(f"   Port: {port}")
    print(f"   CPU Cores: {multiprocessing.cpu_count()}")
    print(f"   OS: {platform.system()}")
    
    if is_windows:
        # Use Waitress on Windows (pure Python, no C extensions)
        print("🪟 Windows detected - using Waitress server")
        start_waitress_server(port, workers)
    else:
        # Use Gunicorn on Unix/Linux
        print("🐧 Unix/Linux detected - using Gunicorn server")
        start_gunicorn_server(port, workers)

def start_waitress_server(port, workers):
    """Start server using Waitress (Windows compatible)"""
    try:
        from waitress import serve
        from main import app
        
        print(f"   Server: Waitress")
        print(f"   Threads: {workers * 4}")  # Waitress uses threads, not processes
        
        # Configure Waitress for production
        serve(
            app,
            host='0.0.0.0',
            port=port,
            threads=workers * 4,  # More threads for I/O intensive workload
            connection_limit=1000,
            cleanup_interval=30,
            send_bytes=18000,
            channel_timeout=120,
            log_socket_errors=True
        )
    except ImportError:
        print("❌ Waitress not installed. Installing...")
        import subprocess
        subprocess.run([sys.executable, '-m', 'pip', 'install', 'waitress'], check=True)
        print("✅ Waitress installed. Restarting...")
        start_waitress_server(port, workers)
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
        sys.exit(0)
    except Exception as e:
        print(f"❌ Failed to start Waitress server: {e}")
        print("💡 Try running with: python main.py (development mode)")
        sys.exit(1)

def start_gunicorn_server(port, workers):
    """Start server using Gunicorn (Unix/Linux) - Optimized for production"""
    import subprocess
    
    # Optimize worker class based on system resources
    worker_class = os.getenv('WORKER_CLASS', 'gevent')  # Changed from eventlet to gevent for better Unix performance
    
    print(f"   Workers: {workers}")
    print(f"   Worker Class: {worker_class}")
    print(f"   Unix Optimizations: ENABLED")
    
    # Build optimized gunicorn command for Unix
    cmd = [
        'gunicorn',
        '--bind', f'0.0.0.0:{port}',
        '--workers', str(workers),
        '--worker-class', worker_class,
        '--timeout', '120',
        '--keepalive', '5',
        '--graceful-timeout', '30',
        '--max-requests', '1000',  # Increased for Unix
        '--max-requests-jitter', '100',
        '--preload',  # Load app before forking workers
        '--access-logfile', '-',
        '--error-logfile', '-',
        '--log-level', 'info',
        '--access-log-format', '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s',
        '--capture-output',
        '--worker-tmp-dir', '/dev/shm',  # Use shared memory for better performance
        '--worker-connections', '2000',  # Increased for Unix
        '--max-requests-jitter', '100',
        '--worker-tmp-dir', '/dev/shm',
        'wsgi:app'
    ]
    
    # Add worker-specific optimizations
    if worker_class == 'gevent':
        cmd.extend([
            '--worker-connections', '2000',  # Gevent can handle more connections
            '--worker-tmp-dir', '/dev/shm',
        ])
    elif worker_class == 'eventlet':
        cmd.extend([
            '--worker-connections', '1500',
            '--worker-tmp-dir', '/dev/shm',
        ])
    elif worker_class == 'uvicorn.workers.UvicornWorker':
        # For async workers, use different settings
        cmd.extend([
            '--worker-connections', '1000',
        ])
    
    print(f"🔧 Unix-Optimized Command: {' '.join(cmd)}")
    
    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to start Gunicorn server: {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
        sys.exit(0)

def check_dependencies():
    """Check if all required dependencies are available"""
    required_packages = [
        'flask',
        'pymongo',
        'gunicorn',
        'eventlet',
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
        sys.exit(1)
    
    print("✅ All required dependencies are available")

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
        sys.exit(1)
    
    print("✅ Environment configuration is valid")

if __name__ == '__main__':
    print("🔍 Pre-flight checks...")
    check_dependencies()
    check_environment()
    
    print("\n🚀 Starting production server...")
    start_production_server()

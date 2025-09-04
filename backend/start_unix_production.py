#!/usr/bin/env python3
"""
Unix/Linux optimized production startup script
"""
import os
import sys
import multiprocessing
import subprocess
import platform
from dotenv import load_dotenv

load_dotenv()

def get_unix_optimal_workers():
    """Calculate optimal number of workers for Unix systems"""
    cpu_count = multiprocessing.cpu_count()
    
    # Unix systems can handle more workers efficiently
    # Formula: (2 x CPU cores) + 1, but cap at 32 for memory efficiency
    workers = min((cpu_count * 2) + 1, 32)
    
    # Adjust based on available memory (rough estimate)
    try:
        import psutil
        available_memory_gb = psutil.virtual_memory().available / (1024**3)
        
        if available_memory_gb < 2:
            workers = min(workers, 4)
        elif available_memory_gb < 4:
            workers = min(workers, 8)
        elif available_memory_gb < 8:
            workers = min(workers, 16)
        elif available_memory_gb < 16:
            workers = min(workers, 24)
        # For 16GB+ memory, use up to 32 workers
    except ImportError:
        # psutil not available, use conservative estimate
        workers = min(workers, 16)
    
    return max(4, workers)  # At least 4 workers on Unix

def start_unix_production_server():
    """Start production server optimized for Unix/Linux"""
    # Get configuration
    port = int(os.getenv('PORT', '5000'))
    workers = get_unix_optimal_workers()
    worker_class = os.getenv('WORKER_CLASS', 'gevent')
    
    print(f"🐧 Starting VERSANT Backend on Unix/Linux")
    print(f"   Port: {port}")
    print(f"   Workers: {workers}")
    print(f"   Worker Class: {worker_class}")
    print(f"   CPU Cores: {multiprocessing.cpu_count()}")
    print(f"   OS: {platform.system()} {platform.release()}")
    
    # Choose the best worker class for Unix
    if worker_class == 'auto':
        # Auto-detect best worker class
        if os.getenv('USE_ASYNC', 'false').lower() == 'true':
            worker_class = 'uvicorn.workers.UvicornWorker'
        else:
            worker_class = 'gevent'  # Best for I/O intensive apps
    
    # Build optimized gunicorn command for Unix
    cmd = [
        'gunicorn',
        '--config', 'gunicorn_unix_config.py',  # Use Unix-specific config
        '--bind', f'0.0.0.0:{port}',
        '--workers', str(workers),
        '--worker-class', worker_class,
        '--worker-connections', '2000',
        '--worker-tmp-dir', '/dev/shm',
        '--max-requests', '1000',
        '--max-requests-jitter', '100',
        '--timeout', '120',
        '--keepalive', '5',
        '--graceful-timeout', '30',
        '--preload',
        '--access-logfile', '-',
        '--error-logfile', '-',
        '--log-level', 'info',
        '--access-log-format', '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s',
        '--capture-output',
        '--reuse-port',  # Unix-specific optimization
        'wsgi:app'
    ]
    
    # Add worker-specific optimizations
    if worker_class == 'gevent':
        cmd.extend([
            '--worker-connections', '2000',
        ])
    elif worker_class == 'eventlet':
        cmd.extend([
            '--worker-connections', '1500',
        ])
    elif worker_class == 'uvicorn.workers.UvicornWorker':
        cmd.extend([
            '--worker-connections', '1000',
        ])
    
    print(f"🔧 Unix-Optimized Command:")
    print(f"   {' '.join(cmd)}")
    
    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to start Unix server: {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
        sys.exit(0)

def check_unix_dependencies():
    """Check Unix-specific dependencies"""
    required_packages = [
        'flask',
        'pymongo',
        'gunicorn',
        'gevent',  # Unix-optimized worker
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
    
    print("✅ All Unix dependencies are available")
    return True

def check_unix_environment():
    """Check Unix environment configuration"""
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
    
    print("✅ Unix environment configuration is valid")
    return True

def check_unix_optimizations():
    """Check if Unix optimizations are available"""
    optimizations = []
    
    # Check for shared memory
    if os.path.exists('/dev/shm'):
        optimizations.append("✅ Shared memory (/dev/shm) available")
    else:
        optimizations.append("⚠️ Shared memory not available")
    
    # Check for sendfile support
    try:
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.close()
        optimizations.append("✅ Socket reuse available")
    except:
        optimizations.append("⚠️ Socket reuse not available")
    
    # Check CPU cores
    cpu_count = multiprocessing.cpu_count()
    optimizations.append(f"✅ CPU cores: {cpu_count}")
    
    # Check memory
    try:
        import psutil
        memory_gb = psutil.virtual_memory().total / (1024**3)
        optimizations.append(f"✅ Total memory: {memory_gb:.1f} GB")
    except:
        optimizations.append("⚠️ Memory info not available")
    
    print("🔧 Unix System Optimizations:")
    for opt in optimizations:
        print(f"   {opt}")
    
    return True

if __name__ == '__main__':
    print("🐧 Unix/Linux VERSANT Backend Startup")
    print("=" * 50)
    
    # Verify we're on Unix
    if platform.system().lower() not in ['linux', 'darwin', 'freebsd', 'openbsd']:
        print("⚠️ Warning: This script is optimized for Unix/Linux systems")
        print(f"   Current OS: {platform.system()}")
        print("   Consider using start_production.py for Windows")
    
    # Check dependencies
    if not check_unix_dependencies():
        sys.exit(1)
    
    # Check environment
    if not check_unix_environment():
        sys.exit(1)
    
    # Check optimizations
    check_unix_optimizations()
    
    print("\n🚀 Starting Unix-optimized production server...")
    start_unix_production_server()

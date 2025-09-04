#!/usr/bin/env python3
"""
Test Unix optimizations and worker classes
"""
import os
import sys
import platform
import multiprocessing
import subprocess
import time
import requests

def test_unix_environment():
    """Test if we're running in a Unix-like environment"""
    print("🐧 Unix Environment Test")
    print("=" * 40)
    
    system = platform.system().lower()
    print(f"OS: {platform.system()} {platform.release()}")
    print(f"Architecture: {platform.machine()}")
    print(f"Python: {sys.version}")
    print(f"CPU Cores: {multiprocessing.cpu_count()}")
    
    # Check if it's Unix-like
    unix_like = system in ['linux', 'darwin', 'freebsd', 'openbsd', 'netbsd']
    print(f"Unix-like: {'✅ Yes' if unix_like else '❌ No'}")
    
    return unix_like

def test_unix_optimizations():
    """Test Unix-specific optimizations"""
    print("\n🔧 Unix Optimizations Test")
    print("=" * 40)
    
    optimizations = []
    
    # Check shared memory
    if os.path.exists('/dev/shm'):
        optimizations.append("✅ Shared memory (/dev/shm) available")
        try:
            # Test write access
            test_file = '/dev/shm/versant_test'
            with open(test_file, 'w') as f:
                f.write('test')
            os.remove(test_file)
            optimizations.append("✅ Shared memory write access OK")
        except Exception as e:
            optimizations.append(f"⚠️ Shared memory write access failed: {e}")
    else:
        optimizations.append("❌ Shared memory not available")
    
    # Check socket reuse
    try:
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.close()
        optimizations.append("✅ Socket reuse available")
    except Exception as e:
        optimizations.append(f"❌ Socket reuse failed: {e}")
    
    # Check file descriptors limit
    try:
        import resource
        soft, hard = resource.getrlimit(resource.RLIMIT_NOFILE)
        optimizations.append(f"✅ File descriptors: {soft}/{hard}")
        if soft < 1024:
            optimizations.append("⚠️ Consider increasing file descriptor limit")
    except Exception as e:
        optimizations.append(f"❌ File descriptor check failed: {e}")
    
    # Check memory
    try:
        import psutil
        memory = psutil.virtual_memory()
        optimizations.append(f"✅ Total memory: {memory.total / (1024**3):.1f} GB")
        optimizations.append(f"✅ Available memory: {memory.available / (1024**3):.1f} GB")
    except ImportError:
        optimizations.append("⚠️ psutil not available for memory check")
    
    for opt in optimizations:
        print(f"   {opt}")
    
    return len([opt for opt in optimizations if opt.startswith("✅")])

def test_worker_classes():
    """Test available worker classes"""
    print("\n👥 Worker Classes Test")
    print("=" * 40)
    
    worker_classes = [
        ('gevent', 'gunicorn[gevent]'),
        ('eventlet', 'gunicorn[eventlet]'),
        ('uvicorn.workers.UvicornWorker', 'uvicorn[standard]'),
        ('sync', 'gunicorn')
    ]
    
    available_workers = []
    
    for worker_class, package in worker_classes:
        try:
            if worker_class == 'gevent':
                import gevent
                available_workers.append((worker_class, "✅ Available"))
            elif worker_class == 'eventlet':
                import eventlet
                available_workers.append((worker_class, "✅ Available"))
            elif worker_class == 'uvicorn.workers.UvicornWorker':
                import uvicorn
                available_workers.append((worker_class, "✅ Available"))
            elif worker_class == 'sync':
                import gunicorn
                available_workers.append((worker_class, "✅ Available"))
        except ImportError:
            available_workers.append((worker_class, f"❌ Not installed ({package})"))
    
    for worker_class, status in available_workers:
        print(f"   {worker_class:<30} {status}")
    
    return len([w for w in available_workers if w[1].startswith("✅")])

def test_server_startup():
    """Test if we can start the Unix-optimized server"""
    print("\n🚀 Server Startup Test")
    print("=" * 40)
    
    # Check if we can import the startup script
    try:
        import start_unix_production
        print("✅ Unix startup script importable")
    except ImportError as e:
        print(f"❌ Unix startup script import failed: {e}")
        return False
    
    # Check if we can import the config
    try:
        import gunicorn_unix_config
        print("✅ Unix Gunicorn config importable")
    except ImportError as e:
        print(f"❌ Unix Gunicorn config import failed: {e}")
        return False
    
    print("✅ All Unix components ready for startup")
    return True

def test_performance_script():
    """Test if performance testing script works"""
    print("\n📊 Performance Testing Test")
    print("=" * 40)
    
    try:
        import test_unix_performance
        print("✅ Unix performance test script importable")
    except ImportError as e:
        print(f"❌ Unix performance test script import failed: {e}")
        return False
    
    print("✅ Performance testing ready")
    return True

def main():
    """Main test function"""
    print("🐧 VERSANT Backend Unix Optimization Test")
    print("=" * 60)
    
    # Run all tests
    unix_env = test_unix_environment()
    optimizations_count = test_unix_optimizations()
    workers_count = test_worker_classes()
    startup_ok = test_server_startup()
    performance_ok = test_performance_script()
    
    # Summary
    print("\n📋 Test Summary")
    print("=" * 40)
    print(f"Unix Environment: {'✅ Ready' if unix_env else '⚠️ Not Unix-like'}")
    print(f"Optimizations: {optimizations_count} available")
    print(f"Worker Classes: {workers_count} available")
    print(f"Server Startup: {'✅ Ready' if startup_ok else '❌ Issues'}")
    print(f"Performance Testing: {'✅ Ready' if performance_ok else '❌ Issues'}")
    
    # Recommendations
    print("\n💡 Recommendations")
    print("=" * 40)
    
    if unix_env and optimizations_count >= 3 and workers_count >= 2:
        print("✅ Excellent! Your system is ready for Unix-optimized deployment")
        print("🚀 You can use: python start_unix_production.py")
        print("📊 You can test with: python test_unix_performance.py")
    elif unix_env:
        print("⚠️ Good Unix environment, but some optimizations missing")
        print("💡 Install missing packages: pip install -r requirements.txt")
    else:
        print("⚠️ Not a Unix-like system")
        print("💡 Use: python start_production.py (Windows-optimized)")
    
    if workers_count < 2:
        print("💡 Install more worker classes: pip install gunicorn[gevent,eventlet] uvicorn[standard]")
    
    print(f"\n🎯 Your system is {'ready' if unix_env and startup_ok else 'not ready'} for Unix-optimized production deployment")

if __name__ == "__main__":
    main()

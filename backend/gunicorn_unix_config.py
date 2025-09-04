#!/usr/bin/env python3
"""
Unix/Linux optimized Gunicorn configuration for production deployment
"""
import os
import multiprocessing

# Server socket - optimized for Unix
bind = f"0.0.0.0:{os.getenv('PORT', '5000')}"
backlog = 4096  # Increased for Unix

# Worker processes - optimized for Unix systems
workers = min(multiprocessing.cpu_count() * 4, 32)  # More workers for Unix
worker_class = "gevent"  # Best performance on Unix
worker_connections = 2000  # Higher connection limit for Unix
max_requests = 1000  # Higher request limit for Unix
max_requests_jitter = 100

# Timeout settings - optimized for Unix
timeout = 120
keepalive = 5
graceful_timeout = 30

# Unix-specific optimizations
worker_tmp_dir = "/dev/shm"  # Use shared memory for better performance
preload_app = True  # Load application before forking workers
sendfile = True  # Enable sendfile for static files
reuse_port = True  # Enable port reuse for better performance

# Logging - optimized for Unix
accesslog = "-"
errorlog = "-"
loglevel = "info"
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s'

# Process naming
proc_name = "versant-backend-unix"

# Server mechanics - Unix optimized
daemon = False
pidfile = "/tmp/versant-backend.pid"
user = None
group = None

# SSL (if needed)
# keyfile = None
# certfile = None

# Unix-specific server hooks
def on_starting(server):
    print("🐧 Starting VERSANT Backend on Unix/Linux...")
    print(f"   Workers: {workers}")
    print(f"   Worker Class: {worker_class}")
    print(f"   Worker Connections: {worker_connections}")
    print(f"   Shared Memory: {worker_tmp_dir}")

def on_reload(server):
    print("🔄 Reloading VERSANT Backend on Unix...")

def worker_int(worker):
    print(f"⚠️ Worker {worker.pid} received INT or QUIT signal")

def pre_fork(server, worker):
    print(f"🔄 Forking worker {worker.pid}")

def post_fork(server, worker):
    print(f"✅ Worker {worker.pid} spawned")

def post_worker_init(worker):
    print(f"🔧 Worker {worker.pid} initialized")

def worker_abort(worker):
    print(f"❌ Worker {worker.pid} aborted")

def on_exit(server):
    print("🛑 VERSANT Backend shutting down on Unix...")

# Unix-specific environment variables
raw_env = [
    'PYTHONPATH=/app',
    'PYTHONUNBUFFERED=1',
    'PYTHONDONTWRITEBYTECODE=1',
]

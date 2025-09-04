#!/usr/bin/env python3
"""
Cloud-optimized Gunicorn configuration for platforms like Render, Heroku, etc.
"""
import os
import multiprocessing

# Server socket - Use PORT environment variable for cloud platforms
port = os.getenv('PORT', '5000')
bind = f"0.0.0.0:{port}"
backlog = 2048

# Ensure we're using the correct port
print(f"🌐 Binding to port: {port}")

# Worker processes - optimized for cloud platforms
# Cloud platforms typically have limited resources
workers = min(multiprocessing.cpu_count() * 2, 8)  # Conservative for cloud
worker_class = "gevent"  # Best for I/O intensive apps
worker_connections = 1000  # Conservative for cloud
max_requests = 500  # Lower to prevent memory leaks
max_requests_jitter = 50

# Timeout settings - optimized for cloud
timeout = 60  # Shorter timeout for cloud
keepalive = 2
graceful_timeout = 30

# Cloud-specific optimizations
preload_app = True  # Load app before forking
sendfile = False  # Disable sendfile for cloud
reuse_port = False  # Disable for cloud platforms

# Logging
accesslog = "-"
errorlog = "-"
loglevel = "info"
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s'

# Process naming
proc_name = "versant-backend-cloud"

# Server mechanics
daemon = False
pidfile = None
user = None
group = None

# Cloud-specific server hooks
def on_starting(server):
    print("☁️ Starting VERSANT Backend on Cloud Platform...")
    print(f"   Port: {port}")
    print(f"   Workers: {workers}")
    print(f"   Worker Class: {worker_class}")
    print(f"   Worker Connections: {worker_connections}")
    print(f"   Bind Address: {bind}")

def on_reload(server):
    print("🔄 Reloading VERSANT Backend on Cloud...")

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
    print("🛑 VERSANT Backend shutting down on Cloud...")

# Cloud environment variables
raw_env = [
    'PYTHONUNBUFFERED=1',
    'PYTHONDONTWRITEBYTECODE=1',
]

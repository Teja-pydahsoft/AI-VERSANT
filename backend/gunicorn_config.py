#!/usr/bin/env python3
"""
Gunicorn configuration for production deployment with SocketIO support
"""

import os
import multiprocessing

# Server socket
bind = f"0.0.0.0:{os.getenv('PORT', '5000')}"
backlog = 2048

# Worker processes - optimized for high concurrency
workers = min(multiprocessing.cpu_count() * 4, 16)  # Cap at 16 workers
worker_class = "eventlet"
max_requests = 500  # Reduced to prevent memory leaks
max_requests_jitter = 50
worker_connections = 1000  # Eventlet specific

# Timeout - increased for complex operations
timeout = 120
keepalive = 5
graceful_timeout = 30

# Logging
accesslog = "-"
errorlog = "-"
loglevel = "info"
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s"'

# Process naming
proc_name = "versant-backend"

# Server mechanics
daemon = False
pidfile = None
user = None
group = None
tmp_upload_dir = None

# SSL (if needed)
# keyfile = None
# certfile = None

# Server hooks
def on_starting(server):
    print("🚀 Starting VERSANT Backend with Gunicorn...")

def on_reload(server):
    print("🔄 Reloading VERSANT Backend...")

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
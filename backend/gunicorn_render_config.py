#!/usr/bin/env python3
"""
Render.com specific Gunicorn configuration
"""
import os
import multiprocessing

# Server socket - Render.com specific
port = os.getenv('PORT', '5000')
bind = f"0.0.0.0:{port}"

# Worker processes - optimized for Render.com
workers = min(multiprocessing.cpu_count() * 2, 4)  # Conservative for Render
worker_class = "gevent"
worker_connections = 1000
max_requests = 500
max_requests_jitter = 50

# Timeout settings
timeout = 60
keepalive = 2
graceful_timeout = 30

# Render.com specific optimizations
preload_app = True
sendfile = False
reuse_port = False

# Logging
accesslog = "-"
errorlog = "-"
loglevel = "info"
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s'

# Process naming
proc_name = "versant-backend-render"

# Server mechanics
daemon = False
pidfile = None
user = None
group = None

# Render.com server hooks
def on_starting(server):
    print("🚀 Starting VERSANT Backend on Render.com...")
    print(f"   Port: {port}")
    print(f"   Bind: {bind}")
    print(f"   Workers: {workers}")
    print(f"   Worker Class: {worker_class}")

def on_reload(server):
    print("🔄 Reloading VERSANT Backend on Render.com...")

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
    print("🛑 VERSANT Backend shutting down on Render.com...")

# Environment variables
raw_env = [
    'PYTHONUNBUFFERED=1',
    'PYTHONDONTWRITEBYTECODE=1',
]

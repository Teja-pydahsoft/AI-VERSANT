#!/usr/bin/env python3
"""
Ultra-optimized Gunicorn configuration for Render.com
Designed to handle 1000+ concurrent users with maximum performance
"""

import os
import multiprocessing

# Server socket
port = os.getenv('PORT', '5000')
bind = f"0.0.0.0:{port}"

# Worker processes - Optimized for Render.com
workers = min(multiprocessing.cpu_count() * 6, 24)  # Increased from 4 to 6x CPU
worker_class = "gevent"
worker_connections = 2000  # Increased from 1000

# Performance tuning
max_requests = 1000  # Increased from 500
max_requests_jitter = 100
timeout = 60  # Reduced from 120 for faster recovery
keepalive = 10  # Increased from 5
graceful_timeout = 30

# Memory and process management
preload_app = True
worker_tmp_dir = "/dev/shm"  # Use shared memory for better performance
worker_class = "gevent"

# Logging
accesslog = "-"
errorlog = "-"
loglevel = "info"
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s'

# Security and performance
limit_request_line = 4096
limit_request_fields = 100
limit_request_field_size = 8192

# Gevent specific optimizations
worker_connections = 2000
max_requests = 1000
max_requests_jitter = 100

def on_starting(server):
    print("🚀 Starting ULTRA-OPTIMIZED VERSANT Backend on Render.com...")
    print(f"   Port: {port}")
    print(f"   Workers: {workers}")
    print(f"   Worker Class: {worker_class}")
    print(f"   Worker Connections: {worker_connections}")
    print(f"   Max Requests: {max_requests}")
    print(f"   Timeout: {timeout}s")
    print(f"   Keepalive: {keepalive}s")
    print("   🎯 Target: 1000+ concurrent users")
    print("   ⚡ Performance: MAXIMUM")

def on_reload(server):
    print("🔄 Reloading ULTRA-OPTIMIZED VERSANT Backend...")

def worker_int(worker):
    print(f"⚠️ Worker {worker.pid} received INT or QUIT signal")

def pre_fork(server, worker):
    print(f"🔧 Pre-forking worker {worker.age}")

def post_fork(server, worker):
    print(f"✅ Worker {worker.pid} spawned")

def worker_abort(worker):
    print(f"💥 Worker {worker.pid} aborted")

def on_exit(server):
    print("👋 ULTRA-OPTIMIZED VERSANT Backend shutting down...")

# Unix/Linux Production Deployment Guide

## 🐧 VERSANT Backend - Unix/Linux Optimization

This guide provides optimized deployment instructions for Unix/Linux systems, which typically offer superior performance compared to Windows.

## 🚀 Quick Start

### 1. Install Dependencies
```bash
# Install Python dependencies
pip install -r requirements.txt

# Install Unix-specific packages
pip install gunicorn[gevent] gevent uvicorn[standard]
```

### 2. Start Production Server
```bash
# Use Unix-optimized startup script
python start_unix_production.py

# Or use Gunicorn directly with Unix config
gunicorn --config gunicorn_unix_config.py wsgi:app
```

### 3. Run Performance Tests
```bash
# Test Unix performance
python test_unix_performance.py
```

## 🔧 Unix-Specific Optimizations

### Worker Classes (Best to Worst for Unix)

1. **gevent** (Recommended)
   - Best for I/O intensive applications
   - Excellent for MongoDB connections
   - Handles 2000+ connections per worker

2. **uvicorn.workers.UvicornWorker**
   - Best for async applications
   - Good for real-time features
   - Handles 1000+ connections per worker

3. **eventlet**
   - Good alternative to gevent
   - Handles 1500+ connections per worker

### Configuration Files

- `gunicorn_unix_config.py` - Unix-optimized Gunicorn configuration
- `start_unix_production.py` - Unix-specific startup script
- `test_unix_performance.py` - Unix performance testing

## 📊 Expected Performance on Unix

| Metric | Windows | Unix/Linux | Improvement |
|--------|---------|------------|-------------|
| RPS | 329 | 500+ | 50%+ better |
| Response Time | 14ms | 5-10ms | 30-50% faster |
| Concurrent Users | 1000+ | 2000+ | 100%+ more |
| Memory Usage | Higher | Lower | 20-30% less |

## 🏗️ Production Deployment

### Using Docker (Recommended)
```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
EXPOSE 5000

CMD ["python", "start_unix_production.py"]
```

### Using Systemd Service
```ini
[Unit]
Description=VERSANT Backend
After=network.target

[Service]
Type=exec
User=versant
WorkingDirectory=/opt/versant-backend
ExecStart=/opt/versant-backend/start_unix_production.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Using Nginx Reverse Proxy
```nginx
upstream versant_backend {
    server 127.0.0.1:5000;
    server 127.0.0.1:5001;
    server 127.0.0.1:5002;
}

server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://versant_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 🔍 Performance Monitoring

### Real-time Monitoring
```bash
# Monitor server performance
htop
iotop
netstat -tulpn | grep :5000

# Monitor application logs
tail -f /var/log/versant-backend.log
```

### Performance Testing
```bash
# Basic performance test
python test_unix_performance.py

# Load testing with Apache Bench
ab -n 10000 -c 100 http://localhost:5000/health

# Load testing with wrk
wrk -t12 -c400 -d30s http://localhost:5000/health
```

## 🛠️ Troubleshooting

### Common Issues

1. **Permission Denied on /dev/shm**
   ```bash
   sudo chmod 1777 /dev/shm
   ```

2. **Too Many Open Files**
   ```bash
   ulimit -n 65536
   ```

3. **Memory Issues**
   ```bash
   # Check memory usage
   free -h
   # Increase swap if needed
   sudo swapon /swapfile
   ```

### Performance Tuning

1. **Kernel Parameters**
   ```bash
   # Add to /etc/sysctl.conf
   net.core.somaxconn = 65536
   net.ipv4.tcp_max_syn_backlog = 65536
   net.core.netdev_max_backlog = 5000
   ```

2. **File Descriptors**
   ```bash
   # Add to /etc/security/limits.conf
   * soft nofile 65536
   * hard nofile 65536
   ```

## 📈 Scaling Strategies

### Horizontal Scaling
- Use load balancer (Nginx, HAProxy)
- Deploy multiple instances
- Use container orchestration (Docker Swarm, Kubernetes)

### Vertical Scaling
- Increase CPU cores
- Add more RAM
- Use faster storage (SSD)

### Database Optimization
- Use connection pooling
- Implement read replicas
- Use Redis for caching

## 🎯 Production Checklist

- [ ] Unix-optimized configuration applied
- [ ] Performance tests passed
- [ ] Monitoring setup
- [ ] Logging configured
- [ ] Backup strategy implemented
- [ ] Security measures applied
- [ ] Load balancer configured
- [ ] SSL certificates installed
- [ ] Health checks configured
- [ ] Auto-restart on failure

## 📞 Support

For Unix-specific issues:
1. Check system logs: `journalctl -u versant-backend`
2. Monitor performance: `python test_unix_performance.py`
3. Review configuration: `gunicorn_unix_config.py`

---

**Your VERSANT backend is now optimized for Unix/Linux production deployment! 🐧🚀**

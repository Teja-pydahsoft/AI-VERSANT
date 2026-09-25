#!/bin/bash

# Study Edge Backend - AWS EC2 Deployment Script
# Optimized for free tier with performance improvements

set -e

echo "🚀 Study Edge Backend - AWS EC2 Deployment"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/home/ec2-user/study-edge-backend"
SERVICE_NAME="study-edge-backend"
PYTHON_VERSION="3.9"

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as ec2-user
if [ "$USER" != "ec2-user" ]; then
    print_error "This script must be run as ec2-user"
    exit 1
fi

# Update system packages
print_status "Updating system packages..."
sudo yum update -y

# Install required system packages
print_status "Installing system dependencies..."
sudo yum install -y python3 python3-pip python3-devel gcc git nginx

# Create application directory
print_status "Setting up application directory..."
mkdir -p $APP_DIR
cd $APP_DIR

# Create virtual environment
print_status "Creating Python virtual environment..."
python3 -m venv venv
source venv/bin/activate

# Upgrade pip
print_status "Upgrading pip..."
pip install --upgrade pip

# Install Python dependencies
print_status "Installing Python dependencies..."
pip install -r requirements.txt

# Install Gunicorn if not already installed
print_status "Installing Gunicorn..."
pip install gunicorn

# Set up environment variables
print_status "Setting up environment variables..."
cat > .env << EOF
FLASK_ENV=production
PORT=8000
MONGODB_URI=your_mongodb_uri_here
JWT_SECRET_KEY=your_jwt_secret_key_here
CORS_ORIGINS=http://localhost:3000,https://your-frontend-domain.com
EOF

print_warning "Please update the .env file with your actual configuration values!"

# Set up systemd service
print_status "Setting up systemd service..."
sudo cp study-edge-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable $SERVICE_NAME

# Configure Nginx (optional, for reverse proxy)
print_status "Setting up Nginx configuration..."
sudo tee /etc/nginx/conf.d/study-edge.conf > /dev/null << EOF
server {
    listen 80;
    server_name _;

    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # Performance optimizations
        proxy_buffering on;
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
        
        # Timeouts for large audio uploads
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
EOF

# Start services
print_status "Starting services..."
sudo systemctl start $SERVICE_NAME
sudo systemctl start nginx
sudo systemctl enable nginx

# Check service status
print_status "Checking service status..."
if sudo systemctl is-active --quiet $SERVICE_NAME; then
    print_status "✅ Study Edge Backend service is running!"
else
    print_error "❌ Failed to start Study Edge Backend service"
    sudo systemctl status $SERVICE_NAME
    exit 1
fi

# Show service logs
print_status "Recent service logs:"
sudo journalctl -u $SERVICE_NAME --lines=20 --no-pager

# Performance monitoring
print_status "Setting up performance monitoring..."
cat > monitor_performance.sh << 'EOF'
#!/bin/bash
echo "📊 Study Edge Backend Performance Monitor"
echo "========================================"
echo "Service Status: $(systemctl is-active study-edge-backend)"
echo "Memory Usage: $(ps aux | grep gunicorn | grep -v grep | awk '{sum+=$6} END {print sum/1024 " MB"}')"
echo "CPU Usage: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)%"
echo "Active Connections: $(netstat -an | grep :8000 | grep ESTABLISHED | wc -l)"
echo "Process Count: $(ps aux | grep gunicorn | grep -v grep | wc -l)"
EOF

chmod +x monitor_performance.sh

# Final instructions
echo ""
echo "🎉 Deployment completed successfully!"
echo "=================================="
echo ""
echo "📋 Next Steps:"
echo "1. Update your .env file with actual configuration values"
echo "2. Restart the service: sudo systemctl restart $SERVICE_NAME"
echo "3. Check logs: sudo journalctl -u $SERVICE_NAME -f"
echo "4. Monitor performance: ./monitor_performance.sh"
echo ""
echo "🔧 Service Management:"
echo "   Start:   sudo systemctl start $SERVICE_NAME"
echo "   Stop:    sudo systemctl stop $SERVICE_NAME"
echo "   Restart: sudo systemctl restart $SERVICE_NAME"
echo "   Status:  sudo systemctl status $SERVICE_NAME"
echo ""
echo "📊 Performance Monitoring:"
echo "   Monitor: ./monitor_performance.sh"
echo "   Logs:    sudo journalctl -u $SERVICE_NAME -f"
echo ""
echo "🌐 Your backend should now be accessible at:"
echo "   http://your-ec2-ip:8000"
echo "   http://your-domain.com (if Nginx is configured)"
echo ""
print_status "Deployment completed! 🚀"

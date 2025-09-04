#!/usr/bin/env python3
"""
Test port configuration for deployment
"""
import os

def test_port_config():
    """Test port configuration"""
    print("🔍 Testing Port Configuration")
    print("=" * 40)
    
    # Check environment variables
    port = os.getenv('PORT', '5000')
    print(f"PORT environment variable: {port}")
    
    # Test different port scenarios
    test_ports = ['5000', '8000', '10000', '3000']
    
    for test_port in test_ports:
        os.environ['PORT'] = test_port
        from gunicorn_render_config import port as config_port, bind
        print(f"Test PORT={test_port} -> Config port={config_port}, bind={bind}")
    
    # Reset to default
    if 'PORT' in os.environ:
        del os.environ['PORT']
    
    print(f"\n✅ Port configuration test completed")
    print(f"Default port: {os.getenv('PORT', '5000')}")

if __name__ == "__main__":
    test_port_config()

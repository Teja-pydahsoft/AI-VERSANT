#!/usr/bin/env python3
"""
Test script to verify CORS configuration
"""

import requests
import json

def test_cors_configuration():
    """Test CORS configuration for the backend"""
    
    # Test URLs
    base_url = "https://ai-versant.onrender.com"
    test_urls = [
        f"{base_url}/",
        f"{base_url}/health",
        f"{base_url}/auth/login"
    ]
    
    print("🔍 Testing CORS Configuration")
    print("=" * 50)
    
    for url in test_urls:
        print(f"\n📡 Testing: {url}")
        
        try:
            # Test OPTIONS request (CORS preflight)
            print("  Testing OPTIONS request...")
            options_response = requests.options(url, timeout=10)
            print(f"    Status: {options_response.status_code}")
            print(f"    CORS Headers:")
            for header, value in options_response.headers.items():
                if 'access-control' in header.lower():
                    print(f"      {header}: {value}")
            
            # Test GET request
            print("  Testing GET request...")
            get_response = requests.get(url, timeout=10)
            print(f"    Status: {get_response.status_code}")
            
            if get_response.status_code == 200:
                try:
                    data = get_response.json()
                    print(f"    Response: {json.dumps(data, indent=2)[:200]}...")
                except:
                    print(f"    Response: {get_response.text[:200]}...")
            
        except requests.exceptions.RequestException as e:
            print(f"    ❌ Error: {e}")
        
        print("-" * 30)
    
    print("\n✅ CORS Test Complete")

if __name__ == "__main__":
    test_cors_configuration() 
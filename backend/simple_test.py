#!/usr/bin/env python3
"""
Simple test to isolate performance issues
"""
import time
import requests

def test_simple_endpoint():
    """Test the simplest possible endpoint"""
    url = "http://localhost:5000/health"
    
    print("🧪 Testing simple endpoint...")
    
    # Test single request
    start_time = time.time()
    try:
        response = requests.get(url, timeout=5)
        end_time = time.time()
        
        print(f"✅ Single request successful:")
        print(f"   Status: {response.status_code}")
        print(f"   Response time: {end_time - start_time:.3f}s")
        print(f"   Response size: {len(response.content)} bytes")
        
        return end_time - start_time
    except Exception as e:
        print(f"❌ Request failed: {e}")
        return None

def test_multiple_requests():
    """Test multiple sequential requests"""
    url = "http://localhost:5000/health"
    
    print("\n🧪 Testing multiple sequential requests...")
    
    response_times = []
    for i in range(5):
        start_time = time.time()
        try:
            response = requests.get(url, timeout=5)
            end_time = time.time()
            response_time = end_time - start_time
            response_times.append(response_time)
            print(f"   Request {i+1}: {response_time:.3f}s (Status: {response.status_code})")
        except Exception as e:
            print(f"   Request {i+1}: FAILED - {e}")
    
    if response_times:
        avg_time = sum(response_times) / len(response_times)
        print(f"\n📊 Average response time: {avg_time:.3f}s")
        return avg_time
    return None

if __name__ == "__main__":
    print("🔍 Simple Performance Test")
    print("=" * 40)
    
    # Test single request
    single_time = test_simple_endpoint()
    
    # Test multiple requests
    avg_time = test_multiple_requests()
    
    # Analysis
    print(f"\n🎯 Analysis:")
    if single_time and single_time > 1.0:
        print(f"❌ Single request is slow ({single_time:.3f}s) - likely database connection issue")
    elif single_time and single_time < 0.1:
        print(f"✅ Single request is fast ({single_time:.3f}s)")
    else:
        print(f"⚠️ Single request is moderate ({single_time:.3f}s)")
    
    if avg_time and avg_time > 1.0:
        print(f"❌ Multiple requests are slow ({avg_time:.3f}s avg) - server not optimized")
    elif avg_time and avg_time < 0.1:
        print(f"✅ Multiple requests are fast ({avg_time:.3f}s avg)")
    else:
        print(f"⚠️ Multiple requests are moderate ({avg_time:.3f}s avg)")

#!/usr/bin/env python3
"""
Test the minimal server performance
"""
import requests
import time

def test_minimal_server():
    """Test the minimal server performance"""
    url = "http://localhost:5001/health"
    
    print("🧪 Testing minimal server performance...")
    
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
    url = "http://localhost:5001/health"
    
    print("\n🧪 Testing multiple sequential requests...")
    
    response_times = []
    for i in range(10):
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
        min_time = min(response_times)
        max_time = max(response_times)
        print(f"\n📊 Performance Stats:")
        print(f"   Average: {avg_time:.3f}s")
        print(f"   Min: {min_time:.3f}s")
        print(f"   Max: {max_time:.3f}s")
        return avg_time
    return None

if __name__ == "__main__":
    print("🔍 Minimal Server Performance Test")
    print("=" * 40)
    
    # Test single request
    single_time = test_minimal_server()
    
    # Test multiple requests
    avg_time = test_multiple_requests()
    
    # Analysis
    print(f"\n🎯 Analysis:")
    if single_time and single_time < 0.1:
        print(f"✅ Minimal server is FAST ({single_time:.3f}s) - baseline established")
    elif single_time and single_time < 0.5:
        print(f"✅ Minimal server is GOOD ({single_time:.3f}s) - baseline established")
    else:
        print(f"⚠️ Minimal server is SLOW ({single_time:.3f}s) - system issue")
    
    if avg_time and avg_time < 0.1:
        print(f"✅ Multiple requests are FAST ({avg_time:.3f}s avg)")
    elif avg_time and avg_time < 0.5:
        print(f"✅ Multiple requests are GOOD ({avg_time:.3f}s avg)")
    else:
        print(f"⚠️ Multiple requests are SLOW ({avg_time:.3f}s avg)")
    
    print(f"\n💡 This establishes the baseline performance for a simple Flask app.")
    print(f"   If your main app is much slower, the issue is in the application code.")

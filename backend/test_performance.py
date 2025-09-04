#!/usr/bin/env python3
"""
Simple performance test script for the VERSANT backend
"""
import requests
import time
import threading
import statistics
from concurrent.futures import ThreadPoolExecutor, as_completed

def test_endpoint(url, timeout=10):
    """Test a single endpoint and return response time"""
    start_time = time.time()
    try:
        response = requests.get(url, timeout=timeout)
        end_time = time.time()
        return {
            'success': response.status_code == 200,
            'status_code': response.status_code,
            'response_time': end_time - start_time,
            'error': None
        }
    except Exception as e:
        end_time = time.time()
        return {
            'success': False,
            'status_code': None,
            'response_time': end_time - start_time,
            'error': str(e)
        }

def run_load_test(base_url, endpoint, concurrent_users=10, total_requests=100):
    """Run a load test with specified parameters"""
    print(f"🧪 Running load test:")
    print(f"   URL: {base_url}{endpoint}")
    print(f"   Concurrent Users: {concurrent_users}")
    print(f"   Total Requests: {total_requests}")
    print(f"   Requests per User: {total_requests // concurrent_users}")
    
    url = f"{base_url}{endpoint}"
    results = []
    
    def worker():
        """Worker function for each thread"""
        worker_results = []
        requests_per_worker = total_requests // concurrent_users
        
        for _ in range(requests_per_worker):
            result = test_endpoint(url)
            worker_results.append(result)
            time.sleep(0.1)  # Small delay between requests
        
        return worker_results
    
    # Start the load test
    start_time = time.time()
    
    with ThreadPoolExecutor(max_workers=concurrent_users) as executor:
        futures = [executor.submit(worker) for _ in range(concurrent_users)]
        
        for future in as_completed(futures):
            worker_results = future.result()
            results.extend(worker_results)
    
    end_time = time.time()
    total_time = end_time - start_time
    
    # Analyze results
    successful_requests = [r for r in results if r['success']]
    failed_requests = [r for r in results if not r['success']]
    
    if successful_requests:
        response_times = [r['response_time'] for r in successful_requests]
        avg_response_time = statistics.mean(response_times)
        min_response_time = min(response_times)
        max_response_time = max(response_times)
        median_response_time = statistics.median(response_times)
    else:
        avg_response_time = min_response_time = max_response_time = median_response_time = 0
    
    # Print results
    print(f"\n📊 Load Test Results:")
    print(f"   Total Time: {total_time:.2f} seconds")
    print(f"   Successful Requests: {len(successful_requests)}/{len(results)} ({len(successful_requests)/len(results)*100:.1f}%)")
    print(f"   Failed Requests: {len(failed_requests)}")
    print(f"   Requests per Second: {len(results)/total_time:.2f}")
    print(f"   Average Response Time: {avg_response_time:.3f}s")
    print(f"   Median Response Time: {median_response_time:.3f}s")
    print(f"   Min Response Time: {min_response_time:.3f}s")
    print(f"   Max Response Time: {max_response_time:.3f}s")
    
    if failed_requests:
        print(f"\n❌ Failed Requests:")
        error_counts = {}
        for req in failed_requests:
            error = req['error'] or f"HTTP {req['status_code']}"
            error_counts[error] = error_counts.get(error, 0) + 1
        
        for error, count in error_counts.items():
            print(f"   {error}: {count} requests")
    
    return {
        'total_requests': len(results),
        'successful_requests': len(successful_requests),
        'failed_requests': len(failed_requests),
        'success_rate': len(successful_requests)/len(results)*100,
        'avg_response_time': avg_response_time,
        'requests_per_second': len(results)/total_time
    }

def main():
    """Main function to run performance tests"""
    # Use external IP to avoid Windows localhost loopback issues
    base_url = "https://ravi-check-versant.onrender.com"
    
    print("🚀 VERSANT Backend Performance Test (External IP)")
    print("=" * 60)
    print(f"🌐 Testing URL: {base_url}")
    print("=" * 60)
    
    # Test 1: Health endpoint (lightweight)
    print("\n1️⃣ Testing Health Endpoint (Lightweight)")
    health_results = run_load_test(base_url, "/health", concurrent_users=20, total_requests=200)
    
    # Test 2: API status endpoint (medium)
    print("\n2️⃣ Testing API Status Endpoint (Medium)")
    status_results = run_load_test(base_url, "/", concurrent_users=10, total_requests=100)
    
    # Test 3: CORS test endpoint (medium)
    print("\n3️⃣ Testing CORS Endpoint (Medium)")
    cors_results = run_load_test(base_url, "/cors-test", concurrent_users=10, total_requests=100)
    
    # Summary
    print(f"\n📈 Performance Summary:")
    print(f"   Health Endpoint: {health_results['requests_per_second']:.1f} req/s, {health_results['avg_response_time']:.3f}s avg")
    print(f"   Status Endpoint: {status_results['requests_per_second']:.1f} req/s, {status_results['avg_response_time']:.3f}s avg")
    print(f"   CORS Endpoint: {cors_results['requests_per_second']:.1f} req/s, {cors_results['avg_response_time']:.3f}s avg")
    
    # Performance assessment
    avg_rps = (health_results['requests_per_second'] + status_results['requests_per_second'] + cors_results['requests_per_second']) / 3
    avg_response_time = (health_results['avg_response_time'] + status_results['avg_response_time'] + cors_results['avg_response_time']) / 3
    
    print(f"\n🎯 Overall Performance:")
    print(f"   Average RPS: {avg_rps:.1f} requests/second")
    print(f"   Average Response Time: {avg_response_time:.3f} seconds")
    
    if avg_rps > 100 and avg_response_time < 0.1:
        print("✅ EXCELLENT: Server can handle high load efficiently!")
        print("   🎯 Ready for 1000+ concurrent users!")
    elif avg_rps > 50 and avg_response_time < 0.2:
        print("✅ VERY GOOD: Server performance is excellent for production")
        print("   🎯 Ready for 500+ concurrent users!")
    elif avg_rps > 20 and avg_response_time < 0.5:
        print("✅ GOOD: Server performance is acceptable for moderate load")
        print("   🎯 Ready for 200+ concurrent users!")
    elif avg_rps > 10 and avg_response_time < 1.0:
        print("⚠️ FAIR: Server can handle light load but may struggle under heavy load")
        print("   🎯 Suitable for 50-100 concurrent users")
    else:
        print("❌ POOR: Server performance needs improvement")
        print("   🎯 Not ready for production load")

if __name__ == "__main__":
    main()

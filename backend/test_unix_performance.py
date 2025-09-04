#!/usr/bin/env python3
"""
Unix/Linux optimized performance test script
"""
import requests
import time
import threading
import statistics
from concurrent.futures import ThreadPoolExecutor, as_completed
import multiprocessing
import platform

def test_endpoint_performance(url, timeout=10):
    """Test a single endpoint and return detailed performance metrics"""
    start_time = time.time()
    try:
        response = requests.get(url, timeout=timeout)
        end_time = time.time()
        return {
            'success': response.status_code == 200,
            'status_code': response.status_code,
            'response_time': end_time - start_time,
            'content_length': len(response.content),
            'headers': dict(response.headers),
            'error': None
        }
    except Exception as e:
        end_time = time.time()
        return {
            'success': False,
            'status_code': None,
            'response_time': end_time - start_time,
            'content_length': 0,
            'headers': {},
            'error': str(e)
        }

def run_unix_load_test(base_url, endpoint, concurrent_users=50, total_requests=1000):
    """Run a high-performance load test optimized for Unix systems"""
    print(f"🧪 Unix Load Test: {endpoint}")
    print(f"   URL: {base_url}{endpoint}")
    print(f"   Concurrent Users: {concurrent_users}")
    print(f"   Total Requests: {total_requests}")
    print(f"   Requests per User: {total_requests // concurrent_users}")
    
    url = f"{base_url}{endpoint}"
    results = []
    
    def worker():
        """Worker function optimized for Unix threading"""
        worker_results = []
        requests_per_worker = total_requests // concurrent_users
        
        for _ in range(requests_per_worker):
            result = test_endpoint_performance(url)
            worker_results.append(result)
            # No sleep for Unix - let it run at full speed
        
        return worker_results
    
    # Start the load test
    start_time = time.time()
    
    # Use ThreadPoolExecutor optimized for Unix
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
        p95_response_time = sorted(response_times)[int(len(response_times) * 0.95)]
        p99_response_time = sorted(response_times)[int(len(response_times) * 0.99)]
    else:
        avg_response_time = min_response_time = max_response_time = median_response_time = p95_response_time = p99_response_time = 0
    
    # Calculate throughput
    requests_per_second = len(results) / total_time
    successful_rps = len(successful_requests) / total_time
    
    # Print detailed results
    print(f"\n📊 Unix Load Test Results:")
    print(f"   Total Time: {total_time:.2f} seconds")
    print(f"   Successful Requests: {len(successful_requests)}/{len(results)} ({len(successful_requests)/len(results)*100:.1f}%)")
    print(f"   Failed Requests: {len(failed_requests)}")
    print(f"   Total RPS: {requests_per_second:.2f}")
    print(f"   Successful RPS: {successful_rps:.2f}")
    print(f"   Average Response Time: {avg_response_time:.3f}s")
    print(f"   Median Response Time: {median_response_time:.3f}s")
    print(f"   Min Response Time: {min_response_time:.3f}s")
    print(f"   Max Response Time: {max_response_time:.3f}s")
    print(f"   95th Percentile: {p95_response_time:.3f}s")
    print(f"   99th Percentile: {p99_response_time:.3f}s")
    
    if failed_requests:
        print(f"\n❌ Failed Requests Analysis:")
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
        'median_response_time': median_response_time,
        'p95_response_time': p95_response_time,
        'p99_response_time': p99_response_time,
        'requests_per_second': requests_per_second,
        'successful_rps': successful_rps,
        'total_time': total_time
    }

def test_unix_scalability(base_url):
    """Test scalability with increasing load"""
    print(f"\n🚀 Unix Scalability Test")
    print("=" * 50)
    
    # Test different load levels
    test_scenarios = [
        {'users': 10, 'requests': 100, 'name': 'Light Load'},
        {'users': 25, 'requests': 250, 'name': 'Medium Load'},
        {'users': 50, 'requests': 500, 'name': 'Heavy Load'},
        {'users': 100, 'requests': 1000, 'name': 'Very Heavy Load'},
        {'users': 200, 'requests': 2000, 'name': 'Extreme Load'},
    ]
    
    scalability_results = []
    
    for scenario in test_scenarios:
        print(f"\n📋 {scenario['name']} Test")
        result = run_unix_load_test(
            base_url, 
            "/health", 
            scenario['users'], 
            scenario['requests']
        )
        result['scenario'] = scenario['name']
        result['concurrent_users'] = scenario['users']
        scalability_results.append(result)
    
    # Analyze scalability
    print(f"\n📈 Unix Scalability Analysis:")
    print(f"{'Scenario':<15} {'Users':<6} {'RPS':<8} {'Avg RT':<8} {'P95 RT':<8} {'Success':<8}")
    print("-" * 70)
    
    for result in scalability_results:
        print(f"{result['scenario']:<15} {result['concurrent_users']:<6} "
              f"{result['successful_rps']:<8.1f} {result['avg_response_time']:<8.3f} "
              f"{result['p95_response_time']:<8.3f} {result['success_rate']:<8.1f}%")
    
    # Determine scalability limits
    max_sustainable_load = None
    for result in scalability_results:
        if result['success_rate'] < 95 or result['avg_response_time'] > 1.0:
            max_sustainable_load = result['scenario']
            break
    
    if max_sustainable_load:
        print(f"\n⚠️ Scalability Limit: {max_sustainable_load}")
    else:
        print(f"\n✅ Excellent Scalability: Handles all tested loads")
    
    return scalability_results

def main():
    """Main function for Unix performance testing"""
    # Use external IP to avoid localhost issues
    base_url = "http://192.168.3.189:5000"
    
    print("🐧 Unix/Linux VERSANT Backend Performance Test")
    print("=" * 60)
    print(f"🌐 Testing URL: {base_url}")
    print(f"🖥️ OS: {platform.system()} {platform.release()}")
    print(f"💻 CPU Cores: {multiprocessing.cpu_count()}")
    print("=" * 60)
    
    # Test 1: Basic performance
    print("\n1️⃣ Basic Performance Test")
    basic_results = []
    
    endpoints = [
        {'endpoint': '/health', 'users': 50, 'requests': 500, 'name': 'Health Check'},
        {'endpoint': '/', 'users': 25, 'requests': 250, 'name': 'API Status'},
        {'endpoint': '/cors-test', 'users': 25, 'requests': 250, 'name': 'CORS Test'}
    ]
    
    for test in endpoints:
        print(f"\n📋 {test['name']} Test")
        result = run_unix_load_test(
            base_url, 
            test['endpoint'], 
            test['users'], 
            test['requests']
        )
        result['endpoint'] = test['endpoint']
        result['test_name'] = test['name']
        basic_results.append(result)
    
    # Test 2: Scalability test
    scalability_results = test_unix_scalability(base_url)
    
    # Overall analysis
    if basic_results:
        avg_rps = statistics.mean([r['successful_rps'] for r in basic_results])
        avg_response_time = statistics.mean([r['avg_response_time'] for r in basic_results])
        avg_success_rate = statistics.mean([r['success_rate'] for r in basic_results])
        
        print(f"\n🎯 Overall Unix Performance:")
        print(f"   Average RPS: {avg_rps:.1f} requests/second")
        print(f"   Average Response Time: {avg_response_time:.3f} seconds")
        print(f"   Success Rate: {avg_success_rate:.1f}%")
        
        # Unix-specific performance assessment
        if avg_rps > 500 and avg_response_time < 0.05:
            performance_rating = "EXCEPTIONAL"
            user_capacity = "5000+ concurrent users"
        elif avg_rps > 300 and avg_response_time < 0.1:
            performance_rating = "EXCELLENT"
            user_capacity = "2000+ concurrent users"
        elif avg_rps > 200 and avg_response_time < 0.2:
            performance_rating = "VERY GOOD"
            user_capacity = "1000+ concurrent users"
        elif avg_rps > 100 and avg_response_time < 0.5:
            performance_rating = "GOOD"
            user_capacity = "500+ concurrent users"
        else:
            performance_rating = "NEEDS OPTIMIZATION"
            user_capacity = "Limited concurrent users"
        
        print(f"   Performance Rating: {performance_rating}")
        print(f"   User Capacity: {user_capacity}")
        
        # Unix-specific recommendations
        print(f"\n🐧 Unix-Specific Recommendations:")
        if avg_rps > 300:
            print("   ✅ Excellent Unix performance - ready for production")
            print("   ✅ Consider using gevent workers for even better performance")
            print("   ✅ Can handle high concurrent loads efficiently")
        elif avg_rps > 200:
            print("   ✅ Good Unix performance - suitable for production")
            print("   💡 Consider optimizing database queries for better performance")
        else:
            print("   ⚠️ Unix performance needs optimization")
            print("   💡 Check database connection pooling")
            print("   💡 Consider using async workers (uvicorn)")

if __name__ == "__main__":
    main()

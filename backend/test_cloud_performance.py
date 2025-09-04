#!/usr/bin/env python3
"""
Cloud performance test script for production deployments
"""
import requests
import time
import threading
import statistics
from concurrent.futures import ThreadPoolExecutor, as_completed

def test_cloud_endpoint(url, timeout=30):
    """Test a single endpoint with cloud-appropriate timeout"""
    start_time = time.time()
    try:
        response = requests.get(url, timeout=timeout)
        end_time = time.time()
        return {
            'success': response.status_code == 200,
            'status_code': response.status_code,
            'response_time': end_time - start_time,
            'content_length': len(response.content),
            'error': None
        }
    except Exception as e:
        end_time = time.time()
        return {
            'success': False,
            'status_code': None,
            'response_time': end_time - start_time,
            'content_length': 0,
            'error': str(e)
        }

def run_cloud_load_test(base_url, endpoint, concurrent_users=10, total_requests=100):
    """Run a cloud-appropriate load test"""
    print(f"☁️ Cloud Load Test: {endpoint}")
    print(f"   URL: {base_url}{endpoint}")
    print(f"   Concurrent Users: {concurrent_users}")
    print(f"   Total Requests: {total_requests}")
    
    url = f"{base_url}{endpoint}"
    results = []
    
    def worker():
        """Worker function for cloud testing"""
        worker_results = []
        requests_per_worker = total_requests // concurrent_users
        
        for _ in range(requests_per_worker):
            result = test_cloud_endpoint(url)
            worker_results.append(result)
            time.sleep(0.1)  # Small delay for cloud platforms
        
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
        p95_response_time = sorted(response_times)[int(len(response_times) * 0.95)]
    else:
        avg_response_time = min_response_time = max_response_time = median_response_time = p95_response_time = 0
    
    # Calculate throughput
    requests_per_second = len(results) / total_time
    successful_rps = len(successful_requests) / total_time
    
    # Print results
    print(f"\n📊 Cloud Load Test Results:")
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
        'requests_per_second': requests_per_second,
        'successful_rps': successful_rps,
        'total_time': total_time
    }

def test_cloud_scalability(base_url):
    """Test cloud scalability with increasing load"""
    print(f"\n☁️ Cloud Scalability Test")
    print("=" * 50)
    
    # Test different load levels appropriate for cloud
    test_scenarios = [
        {'users': 5, 'requests': 50, 'name': 'Light Load'},
        {'users': 10, 'requests': 100, 'name': 'Medium Load'},
        {'users': 20, 'requests': 200, 'name': 'Heavy Load'},
        {'users': 30, 'requests': 300, 'name': 'Very Heavy Load'},
    ]
    
    scalability_results = []
    
    for scenario in test_scenarios:
        print(f"\n📋 {scenario['name']} Test")
        result = run_cloud_load_test(
            base_url, 
            "/health", 
            scenario['users'], 
            scenario['requests']
        )
        result['scenario'] = scenario['name']
        result['concurrent_users'] = scenario['users']
        scalability_results.append(result)
    
    # Analyze scalability
    print(f"\n📈 Cloud Scalability Analysis:")
    print(f"{'Scenario':<15} {'Users':<6} {'RPS':<8} {'Avg RT':<8} {'P95 RT':<8} {'Success':<8}")
    print("-" * 70)
    
    for result in scalability_results:
        print(f"{result['scenario']:<15} {result['concurrent_users']:<6} "
              f"{result['successful_rps']:<8.1f} {result['avg_response_time']:<8.3f} "
              f"{result['p95_response_time']:<8.3f} {result['success_rate']:<8.1f}%")
    
    # Determine scalability limits
    max_sustainable_load = None
    for result in scalability_results:
        if result['success_rate'] < 95 or result['avg_response_time'] > 2.0:
            max_sustainable_load = result['scenario']
            break
    
    if max_sustainable_load:
        print(f"\n⚠️ Cloud Scalability Limit: {max_sustainable_load}")
    else:
        print(f"\n✅ Excellent Cloud Scalability: Handles all tested loads")
    
    return scalability_results

def main():
    """Main function for cloud performance testing"""
    # Your Render.com URL
    base_url = "https://ravi-check-versant.onrender.com"
    
    print("☁️ VERSANT Backend Cloud Performance Test")
    print("=" * 60)
    print(f"🌐 Testing URL: {base_url}")
    print("=" * 60)
    
    # Test 1: Basic performance
    print("\n1️⃣ Basic Cloud Performance Test")
    basic_results = []
    
    endpoints = [
        {'endpoint': '/health', 'users': 20, 'requests': 200, 'name': 'Health Check'},
        {'endpoint': '/', 'users': 10, 'requests': 100, 'name': 'API Status'},
        {'endpoint': '/cors-test', 'users': 10, 'requests': 100, 'name': 'CORS Test'}
    ]
    
    for test in endpoints:
        print(f"\n📋 {test['name']} Test")
        result = run_cloud_load_test(
            base_url, 
            test['endpoint'], 
            test['users'], 
            test['requests']
        )
        result['endpoint'] = test['endpoint']
        result['test_name'] = test['name']
        basic_results.append(result)
    
    # Test 2: Scalability test
    scalability_results = test_cloud_scalability(base_url)
    
    # Overall analysis
    if basic_results:
        avg_rps = statistics.mean([r['successful_rps'] for r in basic_results])
        avg_response_time = statistics.mean([r['avg_response_time'] for r in basic_results])
        avg_success_rate = statistics.mean([r['success_rate'] for r in basic_results])
        
        print(f"\n🎯 Overall Cloud Performance:")
        print(f"   Average RPS: {avg_rps:.1f} requests/second")
        print(f"   Average Response Time: {avg_response_time:.3f} seconds")
        print(f"   Success Rate: {avg_success_rate:.1f}%")
        
        # Cloud-specific performance assessment
        if avg_rps > 50 and avg_response_time < 0.3:
            performance_rating = "EXCELLENT"
            user_capacity = "500+ concurrent users"
        elif avg_rps > 30 and avg_response_time < 0.5:
            performance_rating = "VERY GOOD"
            user_capacity = "300+ concurrent users"
        elif avg_rps > 20 and avg_response_time < 0.7:
            performance_rating = "GOOD"
            user_capacity = "200+ concurrent users"
        elif avg_rps > 10 and avg_response_time < 1.0:
            performance_rating = "FAIR"
            user_capacity = "100+ concurrent users"
        else:
            performance_rating = "NEEDS OPTIMIZATION"
            user_capacity = "Limited concurrent users"
        
        print(f"   Performance Rating: {performance_rating}")
        print(f"   User Capacity: {user_capacity}")
        
        # Cloud-specific recommendations
        print(f"\n☁️ Cloud-Specific Recommendations:")
        if avg_rps > 30:
            print("   ✅ Excellent cloud performance - ready for production")
            print("   ✅ Consider upgrading to a higher tier for better performance")
        elif avg_rps > 20:
            print("   ✅ Good cloud performance - suitable for production")
            print("   💡 Consider optimizing database queries for better performance")
        else:
            print("   ⚠️ Cloud performance needs optimization")
            print("   💡 Check cloud platform resource limits")
            print("   💡 Consider upgrading to a higher tier")

if __name__ == "__main__":
    main()

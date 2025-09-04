#!/usr/bin/env python3
"""
Comprehensive performance test for both production and main applications
"""
import requests
import time
import threading
import statistics
from concurrent.futures import ThreadPoolExecutor, as_completed
import subprocess
import os
import signal
import sys

class ServerTester:
    def __init__(self, base_url, server_name):
        self.base_url = base_url
        self.server_name = server_name
        self.results = []
    
    def test_endpoint(self, endpoint, timeout=10):
        """Test a single endpoint and return response time"""
        start_time = time.time()
        try:
            response = requests.get(f"{self.base_url}{endpoint}", timeout=timeout)
            end_time = time.time()
            return {
                'success': response.status_code == 200,
                'status_code': response.status_code,
                'response_time': end_time - start_time,
                'error': None,
                'endpoint': endpoint
            }
        except Exception as e:
            end_time = time.time()
            return {
                'success': False,
                'status_code': None,
                'response_time': end_time - start_time,
                'error': str(e),
                'endpoint': endpoint
            }
    
    def run_load_test(self, endpoint, concurrent_users=10, total_requests=100):
        """Run a load test with specified parameters"""
        print(f"🧪 Testing {self.server_name} - {endpoint}")
        print(f"   URL: {self.base_url}{endpoint}")
        print(f"   Concurrent Users: {concurrent_users}")
        print(f"   Total Requests: {total_requests}")
        
        url = f"{self.base_url}{endpoint}"
        results = []
        
        def worker():
            """Worker function for each thread"""
            worker_results = []
            requests_per_worker = total_requests // concurrent_users
            
            for _ in range(requests_per_worker):
                result = self.test_endpoint(endpoint)
                worker_results.append(result)
                time.sleep(0.01)  # Small delay between requests
            
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
            'requests_per_second': len(results)/total_time,
            'endpoint': endpoint
        }

def test_server_availability(base_url, server_name):
    """Test if server is available and responding"""
    print(f"🔍 Checking {server_name} availability...")
    
    try:
        response = requests.get(f"{base_url}/health", timeout=5)
        if response.status_code == 200:
            print(f"✅ {server_name} is running and responding")
            return True
        else:
            print(f"❌ {server_name} returned status code: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ {server_name} is not available: {e}")
        return False

def run_comprehensive_test():
    """Run comprehensive performance test"""
    print("🚀 VERSANT Backend Comprehensive Performance Test")
    print("=" * 70)
    
    # Test configurations
    test_configs = [
        {
            'url': 'http://192.168.3.189:5000',
            'name': 'Production Server (Waitress)',
            'port': 5000
        },
        {
            'url': 'http://192.168.3.189:8000', 
            'name': 'Main Application (SocketIO)',
            'port': 8000
        }
    ]
    
    all_results = {}
    
    for config in test_configs:
        print(f"\n{'='*70}")
        print(f"🧪 Testing: {config['name']}")
        print(f"🌐 URL: {config['url']}")
        print(f"{'='*70}")
        
        # Check if server is available
        if not test_server_availability(config['url'], config['name']):
            print(f"⏭️ Skipping {config['name']} - not available")
            continue
        
        # Create tester instance
        tester = ServerTester(config['url'], config['name'])
        
        # Test endpoints
        endpoints_to_test = [
            {'endpoint': '/health', 'users': 20, 'requests': 200, 'name': 'Health Check'},
            {'endpoint': '/', 'users': 10, 'requests': 100, 'name': 'API Status'},
            {'endpoint': '/cors-test', 'users': 10, 'requests': 100, 'name': 'CORS Test'}
        ]
        
        server_results = []
        
        for test in endpoints_to_test:
            print(f"\n📋 {test['name']} Test")
            result = tester.run_load_test(
                test['endpoint'], 
                test['users'], 
                test['requests']
            )
            result['test_name'] = test['name']
            server_results.append(result)
        
        # Calculate overall performance for this server
        if server_results:
            avg_rps = statistics.mean([r['requests_per_second'] for r in server_results])
            avg_response_time = statistics.mean([r['avg_response_time'] for r in server_results])
            total_success_rate = statistics.mean([r['success_rate'] for r in server_results])
            
            print(f"\n📈 {config['name']} Overall Performance:")
            print(f"   Average RPS: {avg_rps:.1f} requests/second")
            print(f"   Average Response Time: {avg_response_time:.3f} seconds")
            print(f"   Success Rate: {total_success_rate:.1f}%")
            
            # Performance assessment
            if avg_rps > 100 and avg_response_time < 0.1:
                performance_rating = "EXCELLENT"
                user_capacity = "1000+ concurrent users"
            elif avg_rps > 50 and avg_response_time < 0.2:
                performance_rating = "VERY GOOD"
                user_capacity = "500+ concurrent users"
            elif avg_rps > 20 and avg_response_time < 0.5:
                performance_rating = "GOOD"
                user_capacity = "200+ concurrent users"
            elif avg_rps > 10 and avg_response_time < 1.0:
                performance_rating = "FAIR"
                user_capacity = "50-100 concurrent users"
            else:
                performance_rating = "POOR"
                user_capacity = "Not ready for production"
            
            print(f"   Performance Rating: {performance_rating}")
            print(f"   User Capacity: {user_capacity}")
            
            all_results[config['name']] = {
                'avg_rps': avg_rps,
                'avg_response_time': avg_response_time,
                'success_rate': total_success_rate,
                'performance_rating': performance_rating,
                'user_capacity': user_capacity,
                'detailed_results': server_results
            }
    
    # Final comparison
    print(f"\n{'='*70}")
    print("🏆 FINAL COMPARISON")
    print(f"{'='*70}")
    
    if len(all_results) > 1:
        print("\n📊 Performance Comparison:")
        for server_name, results in all_results.items():
            print(f"\n{server_name}:")
            print(f"   RPS: {results['avg_rps']:.1f}")
            print(f"   Response Time: {results['avg_response_time']:.3f}s")
            print(f"   Success Rate: {results['success_rate']:.1f}%")
            print(f"   Rating: {results['performance_rating']}")
            print(f"   Capacity: {results['user_capacity']}")
        
        # Determine winner
        best_server = max(all_results.items(), key=lambda x: x[1]['avg_rps'])
        print(f"\n🥇 Best Performing Server: {best_server[0]}")
        print(f"   Performance: {best_server[1]['performance_rating']}")
        print(f"   Capacity: {best_server[1]['user_capacity']}")
    
    elif len(all_results) == 1:
        server_name, results = list(all_results.items())[0]
        print(f"\n📊 Single Server Results:")
        print(f"   Server: {server_name}")
        print(f"   Performance: {results['performance_rating']}")
        print(f"   Capacity: {results['user_capacity']}")
    
    else:
        print("\n❌ No servers were available for testing")
    
    print(f"\n{'='*70}")
    print("🎯 RECOMMENDATIONS")
    print(f"{'='*70}")
    
    if all_results:
        best_performance = max([r['avg_rps'] for r in all_results.values()])
        if best_performance > 50:
            print("✅ Your backend is ready for production deployment!")
            print("✅ Can handle high concurrent user loads")
            print("✅ Performance optimizations are working effectively")
        elif best_performance > 20:
            print("✅ Your backend has good performance for moderate loads")
            print("⚠️ Consider additional optimizations for high loads")
        else:
            print("⚠️ Your backend needs performance improvements")
            print("⚠️ Not ready for high concurrent user loads")
    else:
        print("❌ No servers available for testing")
        print("💡 Make sure to start your servers before running tests")

if __name__ == "__main__":
    run_comprehensive_test()

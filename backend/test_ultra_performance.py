#!/usr/bin/env python3
"""
Ultra Performance Test for VERSANT Backend
Tests the application under extreme load to verify 1000+ user capacity
"""

import asyncio
import aiohttp
import time
import statistics
from concurrent.futures import ThreadPoolExecutor
import json

class UltraPerformanceTester:
    def __init__(self, base_url):
        self.base_url = base_url.rstrip('/')
        self.results = []
    
    async def make_request(self, session, endpoint, method="GET", data=None):
        """Make a single HTTP request"""
        url = f"{self.base_url}{endpoint}"
        start_time = time.time()
        
        try:
            if method == "GET":
                async with session.get(url, timeout=30) as response:
                    response_time = time.time() - start_time
                    return {
                        'success': response.status == 200,
                        'response_time': response_time,
                        'status_code': response.status,
                        'endpoint': endpoint
                    }
            elif method == "POST":
                async with session.post(url, json=data, timeout=30) as response:
                    response_time = time.time() - start_time
                    return {
                        'success': response.status == 200,
                        'response_time': response_time,
                        'status_code': response.status,
                        'endpoint': endpoint
                    }
        except Exception as e:
            response_time = time.time() - start_time
            return {
                'success': False,
                'response_time': response_time,
                'status_code': 0,
                'endpoint': endpoint,
                'error': str(e)
            }
    
    async def run_load_test(self, endpoint, concurrent_users, requests_per_user, method="GET", data=None):
        """Run a load test for a specific endpoint"""
        print(f"🧪 Testing {endpoint} with {concurrent_users} users, {requests_per_user} requests each")
        
        connector = aiohttp.TCPConnector(
            limit=concurrent_users * 2,
            limit_per_host=concurrent_users * 2,
            ttl_dns_cache=300,
            use_dns_cache=True,
        )
        
        timeout = aiohttp.ClientTimeout(total=60)
        
        async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
            tasks = []
            
            for user in range(concurrent_users):
                for request in range(requests_per_user):
                    task = self.make_request(session, endpoint, method, data)
                    tasks.append(task)
            
            start_time = time.time()
            results = await asyncio.gather(*tasks, return_exceptions=True)
            total_time = time.time() - start_time
            
            # Process results
            successful_requests = [r for r in results if isinstance(r, dict) and r.get('success', False)]
            failed_requests = [r for r in results if isinstance(r, dict) and not r.get('success', False)]
            
            if successful_requests:
                response_times = [r['response_time'] for r in successful_requests]
                rps = len(successful_requests) / total_time
                
                return {
                    'endpoint': endpoint,
                    'concurrent_users': concurrent_users,
                    'total_requests': len(results),
                    'successful_requests': len(successful_requests),
                    'failed_requests': len(failed_requests),
                    'success_rate': (len(successful_requests) / len(results)) * 100,
                    'total_time': total_time,
                    'rps': rps,
                    'avg_response_time': statistics.mean(response_times),
                    'median_response_time': statistics.median(response_times),
                    'min_response_time': min(response_times),
                    'max_response_time': max(response_times),
                    'p95_response_time': self._calculate_percentile(response_times, 95),
                    'p99_response_time': self._calculate_percentile(response_times, 99)
                }
            else:
                return {
                    'endpoint': endpoint,
                    'concurrent_users': concurrent_users,
                    'total_requests': len(results),
                    'successful_requests': 0,
                    'failed_requests': len(results),
                    'success_rate': 0,
                    'total_time': total_time,
                    'rps': 0,
                    'avg_response_time': 0,
                    'median_response_time': 0,
                    'min_response_time': 0,
                    'max_response_time': 0,
                    'p95_response_time': 0,
                    'p99_response_time': 0
                }
    
    def _calculate_percentile(self, data, percentile):
        """Calculate percentile of data"""
        if not data:
            return 0
        sorted_data = sorted(data)
        index = int((percentile / 100) * len(sorted_data))
        return sorted_data[min(index, len(sorted_data) - 1)]
    
    async def run_comprehensive_test(self):
        """Run comprehensive performance tests"""
        print("🚀 VERSANT Backend ULTRA Performance Test")
        print("=" * 60)
        print(f"🌐 Testing URL: {self.base_url}")
        print("=" * 60)
        
        # Test scenarios
        test_scenarios = [
            # Light load
            {'endpoint': '/health', 'users': 10, 'requests': 5, 'name': 'Light Load'},
            {'endpoint': '/', 'users': 10, 'requests': 5, 'name': 'API Status Light'},
            
            # Medium load
            {'endpoint': '/health', 'users': 25, 'requests': 10, 'name': 'Medium Load'},
            {'endpoint': '/', 'users': 25, 'requests': 10, 'name': 'API Status Medium'},
            
            # Heavy load
            {'endpoint': '/health', 'users': 50, 'requests': 15, 'name': 'Heavy Load'},
            {'endpoint': '/', 'users': 50, 'requests': 15, 'name': 'API Status Heavy'},
            
            # Very heavy load
            {'endpoint': '/health', 'users': 100, 'requests': 20, 'name': 'Very Heavy Load'},
            {'endpoint': '/', 'users': 100, 'requests': 20, 'name': 'API Status Very Heavy'},
            
            # Extreme load
            {'endpoint': '/health', 'users': 200, 'requests': 25, 'name': 'Extreme Load'},
            {'endpoint': '/', 'users': 200, 'requests': 25, 'name': 'API Status Extreme'},
        ]
        
        all_results = []
        
        for scenario in test_scenarios:
            print(f"\n📊 {scenario['name']} Test")
            print("-" * 40)
            
            result = await self.run_load_test(
                scenario['endpoint'],
                scenario['users'],
                scenario['requests']
            )
            
            all_results.append(result)
            
            # Print results
            print(f"📈 Results for {scenario['endpoint']}:")
            print(f"   Users: {result['concurrent_users']}")
            print(f"   Total Requests: {result['total_requests']}")
            print(f"   Successful: {result['successful_requests']}")
            print(f"   Failed: {result['failed_requests']}")
            print(f"   Success Rate: {result['success_rate']:.1f}%")
            print(f"   RPS: {result['rps']:.1f}")
            print(f"   Avg Response Time: {result['avg_response_time']:.3f}s")
            print(f"   P95 Response Time: {result['p95_response_time']:.3f}s")
            print(f"   P99 Response Time: {result['p99_response_time']:.3f}s")
            
            # Performance assessment
            if result['success_rate'] >= 99 and result['avg_response_time'] < 0.5:
                print("   ✅ EXCELLENT Performance")
            elif result['success_rate'] >= 95 and result['avg_response_time'] < 1.0:
                print("   ✅ GOOD Performance")
            elif result['success_rate'] >= 90 and result['avg_response_time'] < 2.0:
                print("   ⚠️ ACCEPTABLE Performance")
            else:
                print("   ❌ POOR Performance")
        
        # Overall analysis
        print("\n" + "=" * 60)
        print("📊 ULTRA PERFORMANCE ANALYSIS")
        print("=" * 60)
        
        total_requests = sum(r['total_requests'] for r in all_results)
        total_successful = sum(r['successful_requests'] for r in all_results)
        overall_success_rate = (total_successful / total_requests) * 100 if total_requests > 0 else 0
        
        avg_rps = statistics.mean([r['rps'] for r in all_results if r['rps'] > 0])
        avg_response_time = statistics.mean([r['avg_response_time'] for r in all_results if r['avg_response_time'] > 0])
        
        print(f"🎯 Overall Performance:")
        print(f"   Total Requests: {total_requests}")
        print(f"   Success Rate: {overall_success_rate:.1f}%")
        print(f"   Average RPS: {avg_rps:.1f}")
        print(f"   Average Response Time: {avg_response_time:.3f}s")
        
        # Capacity assessment
        if overall_success_rate >= 99 and avg_response_time < 0.5:
            print("   🚀 EXCELLENT: Ready for 1000+ concurrent users!")
        elif overall_success_rate >= 95 and avg_response_time < 1.0:
            print("   ✅ GOOD: Ready for 500+ concurrent users")
        elif overall_success_rate >= 90 and avg_response_time < 2.0:
            print("   ⚠️ ACCEPTABLE: Ready for 200+ concurrent users")
        else:
            print("   ❌ NEEDS OPTIMIZATION: Limited to <200 concurrent users")
        
        # Recommendations
        print("\n💡 OPTIMIZATION RECOMMENDATIONS:")
        if avg_response_time > 1.0:
            print("   🔧 Optimize database queries and add caching")
        if overall_success_rate < 95:
            print("   🔧 Increase worker processes and connection limits")
        if avg_rps < 50:
            print("   🔧 Consider using Redis for session storage")
        if avg_response_time < 0.5 and overall_success_rate >= 99:
            print("   🎉 Performance is already excellent!")
        
        return all_results

async def main():
    """Main function to run the ultra performance test"""
    # Test your Render.com URL
    base_url = "https://ravi-check-versant.onrender.com"
    
    tester = UltraPerformanceTester(base_url)
    results = await tester.run_comprehensive_test()
    
    # Save results to file
    with open('ultra_performance_results.json', 'w') as f:
        json.dump(results, f, indent=2)
    
    print(f"\n📄 Results saved to: ultra_performance_results.json")

if __name__ == "__main__":
    asyncio.run(main())

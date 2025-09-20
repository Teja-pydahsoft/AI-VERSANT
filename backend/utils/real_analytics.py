"""
Real Analytics System
Tracks actual server hits, requests, and performance metrics
"""

import time
import json
import threading
from datetime import datetime, timedelta
from collections import defaultdict, deque
import psutil
import os

class RealAnalytics:
    def __init__(self):
        self.data = {
            'requests': deque(maxlen=10000),  # Store last 10k requests
            'hourly_stats': defaultdict(lambda: {'requests': 0, 'errors': 0, 'bytes_sent': 0}),
            'endpoint_stats': defaultdict(lambda: {'count': 0, 'total_time': 0, 'errors': 0}),
            'response_codes': defaultdict(int),
            'errors': deque(maxlen=1000),  # Store last 1k errors
            'system_stats': {
                'cpu_percent': 0,
                'memory_percent': 0,
                'memory_used': 0,
                'memory_total': 0
            }
        }
        self.lock = threading.Lock()
        self.start_time = time.time()
        
        # Start background system monitoring
        self._start_system_monitoring()
    
    def track_request(self, endpoint, method, response_code, response_time, bytes_sent=0, error_msg=None):
        """Track a real server request"""
        with self.lock:
            timestamp = time.time()
            current_hour = datetime.now().strftime('%Y-%m-%d %H:00')
            
            # Store request details
            request_data = {
                'timestamp': timestamp,
                'endpoint': endpoint,
                'method': method,
                'response_code': response_code,
                'response_time': response_time,
                'bytes_sent': bytes_sent,
                'error_msg': error_msg
            }
            
            self.data['requests'].append(request_data)
            
            # Update hourly stats
            self.data['hourly_stats'][current_hour]['requests'] += 1
            self.data['hourly_stats'][current_hour]['bytes_sent'] += bytes_sent
            
            # Update endpoint stats
            self.data['endpoint_stats'][endpoint]['count'] += 1
            self.data['endpoint_stats'][endpoint]['total_time'] += response_time
            
            # Update response codes
            self.data['response_codes'][response_code] += 1
            
            # Track errors
            if response_code >= 400 or error_msg:
                self.data['hourly_stats'][current_hour]['errors'] += 1
                self.data['endpoint_stats'][endpoint]['errors'] += 1
                
                if error_msg:
                    error_data = {
                        'timestamp': timestamp,
                        'endpoint': endpoint,
                        'method': method,
                        'error_msg': error_msg,
                        'response_code': response_code
                    }
                    self.data['errors'].append(error_data)
    
    def get_analytics_data(self, hours_back=1):
        """Get real analytics data for the specified time period"""
        with self.lock:
            now = time.time()
            cutoff_time = now - (hours_back * 3600)
            
            # Filter requests within time period
            recent_requests = [
                req for req in self.data['requests'] 
                if req['timestamp'] >= cutoff_time
            ]
            
            # Calculate stats
            total_requests = len(recent_requests)
            total_errors = sum(1 for req in recent_requests if req['response_code'] >= 400)
            total_bytes = sum(req['bytes_sent'] for req in recent_requests)
            
            # Get hourly breakdown
            hourly_hits = self._get_hourly_breakdown(hours_back)
            
            # Get top endpoints
            top_endpoints = self._get_top_endpoints(recent_requests)
            
            # Get slowest endpoints
            slowest_endpoints = self._get_slowest_endpoints(recent_requests)
            
            # Get response codes
            response_codes = dict(self.data['response_codes'])
            
            # Get recent errors
            recent_errors = [
                err for err in self.data['errors'] 
                if err['timestamp'] >= cutoff_time
            ]
            
            return {
                'total_requests': total_requests,
                'total_errors': total_errors,
                'error_rate': (total_errors / total_requests * 100) if total_requests > 0 else 0,
                'total_bytes_sent': total_bytes,
                'hourly_hits': hourly_hits,
                'top_endpoints': top_endpoints,
                'slowest_endpoints': slowest_endpoints,
                'response_codes': response_codes,
                'recent_errors': recent_errors[-10:],  # Last 10 errors
                'system_stats': self.data['system_stats'],
                'time_period': f'{hours_back} hour{"s" if hours_back != 1 else ""}',
                'uptime_seconds': now - self.start_time
            }
    
    def _get_hourly_breakdown(self, hours_back):
        """Get hourly breakdown of requests"""
        hourly_data = []
        now = datetime.now()
        
        for i in range(hours_back):
            hour_time = now - timedelta(hours=i)
            hour_key = hour_time.strftime('%Y-%m-%d %H:00')
            hour_display = hour_time.strftime('%H:%M')
            
            stats = self.data['hourly_stats'][hour_key]
            requests = stats['requests']
            errors = stats['errors']
            success_rate = ((requests - errors) / requests * 100) if requests > 0 else 100
            
            hourly_data.append({
                'time': hour_display,
                'hour_key': hour_key,
                'requests': requests,
                'errors': errors,
                'success_rate': round(success_rate, 1),
                'bytes_sent': stats['bytes_sent']
            })
        
        return list(reversed(hourly_data))  # Most recent first
    
    def _get_top_endpoints(self, recent_requests):
        """Get top endpoints by request count"""
        endpoint_counts = defaultdict(int)
        for req in recent_requests:
            endpoint_counts[req['endpoint']] += 1
        
        return [
            {'endpoint': endpoint, 'count': count}
            for endpoint, count in sorted(endpoint_counts.items(), key=lambda x: x[1], reverse=True)[:10]
        ]
    
    def _get_slowest_endpoints(self, recent_requests):
        """Get slowest endpoints by average response time"""
        endpoint_times = defaultdict(list)
        for req in recent_requests:
            endpoint_times[req['endpoint']].append(req['response_time'])
        
        slowest = []
        for endpoint, times in endpoint_times.items():
            if times:
                avg_time = sum(times) / len(times)
                slowest.append({
                    'endpoint': endpoint,
                    'avg_response_time': round(avg_time, 3),
                    'request_count': len(times)
                })
        
        return sorted(slowest, key=lambda x: x['avg_response_time'], reverse=True)[:10]
    
    def _start_system_monitoring(self):
        """Start background system monitoring"""
        def monitor_system():
            while True:
                try:
                    # Get system stats
                    cpu_percent = psutil.cpu_percent(interval=1)
                    memory = psutil.virtual_memory()
                    
                    with self.lock:
                        self.data['system_stats'] = {
                            'cpu_percent': round(cpu_percent, 1),
                            'memory_percent': round(memory.percent, 1),
                            'memory_used': memory.used,
                            'memory_total': memory.total
                        }
                    
                    time.sleep(30)  # Update every 30 seconds
                except Exception as e:
                    print(f"System monitoring error: {e}")
                    time.sleep(60)  # Wait longer on error
        
        # Start monitoring in background thread
        monitor_thread = threading.Thread(target=monitor_system, daemon=True)
        monitor_thread.start()
    
    def get_time_patterns(self, hours_back=1):
        """Get detailed time patterns for trends analysis"""
        with self.lock:
            hourly_hits = self._get_hourly_breakdown(hours_back)
            
            # Calculate trends
            if len(hourly_hits) >= 2:
                recent_avg = sum(h['requests'] for h in hourly_hits[-3:]) / min(3, len(hourly_hits))
                older_avg = sum(h['requests'] for h in hourly_hits[:-3]) / max(1, len(hourly_hits) - 3)
                
                if recent_avg > older_avg:
                    trend = 'increasing'
                    percentage = round(((recent_avg - older_avg) / older_avg) * 100, 1)
                else:
                    trend = 'decreasing'
                    percentage = round(((older_avg - recent_avg) / older_avg) * 100, 1)
            else:
                trend = 'stable'
                percentage = 0
                recent_avg = hourly_hits[0]['requests'] if hourly_hits else 0
                older_avg = recent_avg
            
            # Get busiest hours
            busiest_hours = sorted(hourly_hits, key=lambda x: x['requests'], reverse=True)[:3]
            
            return {
                'hourly_hits': hourly_hits,
                'busiest_hours': busiest_hours,
                'hit_trends': {
                    'trend': trend,
                    'percentage': percentage,
                    'recent_avg': round(recent_avg, 1),
                    'older_avg': round(older_avg, 1)
                },
                'minute_by_minute': self._get_minute_breakdown() if hours_back == 1 else []
            }
    
    def _get_minute_breakdown(self):
        """Get minute-by-minute breakdown for the last hour"""
        now = time.time()
        minute_data = []
        
        for i in range(60):  # Last 60 minutes
            minute_time = now - (i * 60)
            minute_display = datetime.fromtimestamp(minute_time).strftime('%H:%M')
            
            # Count requests in this minute
            requests = sum(1 for req in self.data['requests'] 
                          if minute_time <= req['timestamp'] < minute_time + 60)
            errors = sum(1 for req in self.data['requests'] 
                        if minute_time <= req['timestamp'] < minute_time + 60 and req['response_code'] >= 400)
            
            minute_data.append({
                'time': minute_display,
                'requests': requests,
                'errors': errors
            })
        
        return list(reversed(minute_data))  # Most recent first

# Global analytics instance
real_analytics = RealAnalytics()

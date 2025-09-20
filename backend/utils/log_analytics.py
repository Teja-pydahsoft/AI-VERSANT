#!/usr/bin/env python3
"""
Log-Based Analytics System
Extracts server metrics from existing logs without impacting performance
"""

import re
import json
import time
import logging
import threading
from datetime import datetime, timedelta
from collections import defaultdict, deque
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass
import os
import glob

# Configure logging
logger = logging.getLogger(__name__)

@dataclass
class RequestMetrics:
    """Data class for request metrics"""
    endpoint: str
    method: str
    status_code: int
    response_time: float
    timestamp: datetime
    ip_address: str = None
    user_agent: str = None
    error_message: str = None

class LogAnalyticsEngine:
    """Main analytics engine for processing logs"""
    
    def __init__(self, log_directory: str = "logs", max_entries: int = 10000):
        self.log_directory = log_directory
        self.max_entries = max_entries
        self.metrics_buffer = deque(maxlen=max_entries)
        self.running = False
        self.monitor_thread = None
        
        # Analytics data storage
        self.endpoint_stats = defaultdict(lambda: {
            'total_requests': 0,
            'total_response_time': 0.0,
            'status_codes': defaultdict(int),
            'last_hit': None,
            'avg_response_time': 0.0,
            'error_count': 0
        })
        
        self.time_series_data = defaultdict(list)  # timestamp -> metrics
        self.error_patterns = defaultdict(int)
        self.peak_usage_times = []
        
        # Performance tracking
        self.performance_stats = {
            'total_requests_processed': 0,
            'analytics_processing_time': 0.0,
            'last_analysis_time': None,
            'log_files_processed': 0
        }
        
        # Regex patterns for log parsing
        self.log_patterns = {
            'flask_access': re.compile(
                r'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}) - INFO - (\d+\.\d+\.\d+\.\d+) - - '
                r'\[(\d{2}/\w{3}/\d{4} \d{2}:\d{2}:\d{2})\] "(\w+) ([^"]+) HTTP/\d\.\d" (\d+) (\d+)'
            ),
            'custom_log': re.compile(
                r'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}) - (\w+) - (.+)'
            ),
            'error_log': re.compile(
                r'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}) - ERROR - (.+)'
            )
        }
    
    def start_monitoring(self):
        """Start the log monitoring thread"""
        if self.running:
            return
        
        self.running = True
        self.monitor_thread = threading.Thread(target=self._monitor_logs, daemon=True)
        self.monitor_thread.start()
        logger.info("📊 Log analytics monitoring started")
    
    def stop_monitoring(self):
        """Stop the log monitoring thread"""
        self.running = False
        if self.monitor_thread:
            self.monitor_thread.join(timeout=5)
        logger.info("📊 Log analytics monitoring stopped")
    
    def _monitor_logs(self):
        """Background thread to monitor and process logs"""
        last_processed_time = time.time()
        
        while self.running:
            try:
                current_time = time.time()
                
                # Process logs every 30 seconds
                if current_time - last_processed_time >= 30:
                    self._process_log_files()
                    last_processed_time = current_time
                
                time.sleep(10)  # Check every 10 seconds
                
            except Exception as e:
                logger.error(f"❌ Error in log monitoring: {e}")
                time.sleep(30)
    
    def _process_log_files(self):
        """Process all log files in the directory"""
        try:
            # Find all log files
            log_files = self._find_log_files()
            
            for log_file in log_files:
                self._parse_log_file(log_file)
            
            # Update analytics after processing
            self._update_analytics()
            
            self.performance_stats['log_files_processed'] = len(log_files)
            self.performance_stats['last_analysis_time'] = datetime.now()
            
        except Exception as e:
            logger.error(f"❌ Error processing log files: {e}")
    
    def _find_log_files(self) -> List[str]:
        """Find all log files in the directory"""
        log_files = []
        
        # Common log file patterns
        patterns = [
            "*.log",
            "app*.log",
            "access*.log",
            "error*.log",
            "flask*.log"
        ]
        
        for pattern in patterns:
            log_files.extend(glob.glob(os.path.join(self.log_directory, pattern)))
        
        # Also check current directory
        for pattern in patterns:
            log_files.extend(glob.glob(pattern))
        
        return list(set(log_files))  # Remove duplicates
    
    def _parse_log_file(self, log_file: str):
        """Parse a single log file"""
        try:
            if not os.path.exists(log_file):
                return
            
            # Get file modification time to avoid reprocessing
            file_mtime = os.path.getmtime(log_file)
            
            with open(log_file, 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
                
                for line in lines:
                    self._parse_log_line(line.strip())
                    
        except Exception as e:
            logger.error(f"❌ Error parsing log file {log_file}: {e}")
    
    def _parse_log_line(self, line: str):
        """Parse a single log line and extract metrics"""
        try:
            # Try Flask access log pattern
            match = self.log_patterns['flask_access'].match(line)
            if match:
                self._process_flask_access_log(match, line)
                return
            
            # Try custom log pattern
            match = self.log_patterns['custom_log'].match(line)
            if match:
                self._process_custom_log(match, line)
                return
            
            # Try error log pattern
            match = self.log_patterns['error_log'].match(line)
            if match:
                self._process_error_log(match, line)
                return
                
        except Exception as e:
            logger.debug(f"Could not parse log line: {line[:100]}... Error: {e}")
    
    def _process_flask_access_log(self, match, line: str):
        """Process Flask access log entry"""
        try:
            timestamp_str, ip, http_timestamp, method, endpoint, status_code, response_size = match.groups()
            
            # Parse timestamp
            timestamp = datetime.strptime(timestamp_str, '%Y-%m-%d %H:%M:%S,%f')
            
            # Extract response time from line if available
            response_time = self._extract_response_time(line)
            
            # Create metrics
            metrics = RequestMetrics(
                endpoint=endpoint,
                method=method,
                status_code=int(status_code),
                response_time=response_time,
                timestamp=timestamp,
                ip_address=ip
            )
            
            self.metrics_buffer.append(metrics)
            self.performance_stats['total_requests_processed'] += 1
            
        except Exception as e:
            logger.debug(f"Error processing Flask access log: {e}")
    
    def _process_custom_log(self, match, line: str):
        """Process custom application log entry"""
        try:
            timestamp_str, level, message = match.groups()
            timestamp = datetime.strptime(timestamp_str, '%Y-%m-%d %H:%M:%S,%f')
            
            # Look for request-related patterns in custom logs
            if 'request' in message.lower() or 'endpoint' in message.lower():
                # Extract endpoint and method if available
                endpoint = self._extract_endpoint_from_message(message)
                if endpoint:
                    metrics = RequestMetrics(
                        endpoint=endpoint,
                        method='UNKNOWN',
                        status_code=200,
                        response_time=0.0,
                        timestamp=timestamp
                    )
                    self.metrics_buffer.append(metrics)
            
        except Exception as e:
            logger.debug(f"Error processing custom log: {e}")
    
    def _process_error_log(self, match, line: str):
        """Process error log entry"""
        try:
            timestamp_str, error_message = match.groups()
            timestamp = datetime.strptime(timestamp_str, '%Y-%m-%d %H:%M:%S,%f')
            
            # Track error patterns
            self.error_patterns[error_message] += 1
            
            # Try to extract endpoint from error message
            endpoint = self._extract_endpoint_from_message(error_message)
            if endpoint:
                metrics = RequestMetrics(
                    endpoint=endpoint,
                    method='UNKNOWN',
                    status_code=500,
                    response_time=0.0,
                    timestamp=timestamp,
                    error_message=error_message
                )
                self.metrics_buffer.append(metrics)
            
        except Exception as e:
            logger.debug(f"Error processing error log: {e}")
    
    def _extract_response_time(self, line: str) -> float:
        """Extract response time from log line"""
        # Look for response time patterns
        patterns = [
            r'(\d+\.\d+)ms',
            r'(\d+\.\d+)s',
            r'time=(\d+\.\d+)',
            r'duration=(\d+\.\d+)'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, line)
            if match:
                return float(match.group(1))
        
        return 0.0
    
    def _extract_endpoint_from_message(self, message: str) -> Optional[str]:
        """Extract endpoint from log message"""
        # Common endpoint patterns
        patterns = [
            r'endpoint[:\s]+([^\s]+)',
            r'route[:\s]+([^\s]+)',
            r'path[:\s]+([^\s]+)',
            r'/([a-zA-Z0-9\-_/]+)',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, message, re.IGNORECASE)
            if match:
                return match.group(1)
        
        return None
    
    def _update_analytics(self):
        """Update analytics data from metrics buffer"""
        try:
            start_time = time.time()
            
            # Process recent metrics (last 1 hour)
            cutoff_time = datetime.now() - timedelta(hours=1)
            recent_metrics = [m for m in self.metrics_buffer if m.timestamp >= cutoff_time]
            
            # Update endpoint statistics
            for metrics in recent_metrics:
                endpoint = metrics.endpoint
                stats = self.endpoint_stats[endpoint]
                
                stats['total_requests'] += 1
                stats['total_response_time'] += metrics.response_time
                stats['status_codes'][metrics.status_code] += 1
                stats['last_hit'] = metrics.timestamp
                
                if metrics.status_code >= 400:
                    stats['error_count'] += 1
                
                # Update average response time
                if stats['total_requests'] > 0:
                    stats['avg_response_time'] = stats['total_response_time'] / stats['total_requests']
            
            # Update time series data
            self._update_time_series_data(recent_metrics)
            
            # Update peak usage times
            self._update_peak_usage_times(recent_metrics)
            
            processing_time = time.time() - start_time
            self.performance_stats['analytics_processing_time'] = processing_time
            
        except Exception as e:
            logger.error(f"❌ Error updating analytics: {e}")
    
    def _update_time_series_data(self, metrics: List[RequestMetrics]):
        """Update time series data for charts"""
        # Group metrics by minute
        minute_groups = defaultdict(list)
        
        for metric in metrics:
            minute_key = metric.timestamp.replace(second=0, microsecond=0)
            minute_groups[minute_key].append(metric)
        
        # Update time series data
        for minute, minute_metrics in minute_groups.items():
            self.time_series_data[minute] = {
                'total_requests': len(minute_metrics),
                'avg_response_time': sum(m.response_time for m in minute_metrics) / len(minute_metrics),
                'error_count': sum(1 for m in minute_metrics if m.status_code >= 400),
                'endpoints': list(set(m.endpoint for m in minute_metrics))
            }
    
    def _update_peak_usage_times(self, metrics: List[RequestMetrics]):
        """Update peak usage times"""
        # Group by hour
        hour_groups = defaultdict(int)
        
        for metric in metrics:
            hour_key = metric.timestamp.hour
            hour_groups[hour_key] += 1
        
        # Find peak hours
        if hour_groups:
            max_requests = max(hour_groups.values())
            peak_hours = [hour for hour, count in hour_groups.items() if count >= max_requests * 0.8]
            self.peak_usage_times = peak_hours
    
    def get_analytics_summary(self) -> Dict[str, Any]:
        """Get comprehensive analytics summary"""
        try:
            current_time = datetime.now()
            last_hour = current_time - timedelta(hours=1)
            last_24h = current_time - timedelta(hours=24)
            
            # Filter recent metrics
            recent_metrics = [m for m in self.metrics_buffer if m.timestamp >= last_hour]
            daily_metrics = [m for m in self.metrics_buffer if m.timestamp >= last_24h]
            
            # Calculate totals
            total_requests_1h = len(recent_metrics)
            total_requests_24h = len(daily_metrics)
            
            # Calculate averages
            avg_response_time_1h = sum(m.response_time for m in recent_metrics) / max(len(recent_metrics), 1)
            avg_response_time_24h = sum(m.response_time for m in daily_metrics) / max(len(daily_metrics), 1)
            
            # Error rates
            error_count_1h = sum(1 for m in recent_metrics if m.status_code >= 400)
            error_count_24h = sum(1 for m in daily_metrics if m.status_code >= 400)
            error_rate_1h = (error_count_1h / max(total_requests_1h, 1)) * 100
            error_rate_24h = (error_count_24h / max(total_requests_24h, 1)) * 100
            
            # Top endpoints
            endpoint_counts = defaultdict(int)
            for metric in recent_metrics:
                endpoint_counts[metric.endpoint] += 1
            
            top_endpoints = sorted(endpoint_counts.items(), key=lambda x: x[1], reverse=True)[:10]
            
            # Status code distribution
            status_codes = defaultdict(int)
            for metric in recent_metrics:
                status_codes[metric.status_code] += 1
            
            return {
                'summary': {
                    'total_requests_1h': total_requests_1h,
                    'total_requests_24h': total_requests_24h,
                    'avg_response_time_1h': round(avg_response_time_1h, 3),
                    'avg_response_time_24h': round(avg_response_time_24h, 3),
                    'error_rate_1h': round(error_rate_1h, 2),
                    'error_rate_24h': round(error_rate_24h, 2),
                    'requests_per_minute': round(total_requests_1h / 60, 2),
                    'peak_usage_hours': self.peak_usage_times
                },
                'top_endpoints': [
                    {'endpoint': endpoint, 'requests': count} 
                    for endpoint, count in top_endpoints
                ],
                'status_codes': dict(status_codes),
                'endpoint_details': dict(self.endpoint_stats),
                'time_series_data': dict(self.time_series_data),
                'error_patterns': dict(self.error_patterns),
                'performance_stats': self.performance_stats,
                'last_updated': current_time.isoformat()
            }
            
        except Exception as e:
            logger.error(f"❌ Error generating analytics summary: {e}")
            return {'error': str(e)}
    
    def get_endpoint_analytics(self, endpoint: str) -> Dict[str, Any]:
        """Get detailed analytics for a specific endpoint"""
        try:
            if endpoint not in self.endpoint_stats:
                return {'error': 'Endpoint not found'}
            
            stats = self.endpoint_stats[endpoint]
            recent_metrics = [m for m in self.metrics_buffer if m.endpoint == endpoint]
            
            # Calculate additional metrics
            response_times = [m.response_time for m in recent_metrics if m.response_time > 0]
            avg_response_time = sum(response_times) / max(len(response_times), 1)
            
            # Error analysis
            errors = [m for m in recent_metrics if m.status_code >= 400]
            error_rate = (len(errors) / max(len(recent_metrics), 1)) * 100
            
            return {
                'endpoint': endpoint,
                'total_requests': stats['total_requests'],
                'avg_response_time': round(avg_response_time, 3),
                'error_rate': round(error_rate, 2),
                'status_codes': dict(stats['status_codes']),
                'last_hit': stats['last_hit'].isoformat() if stats['last_hit'] else None,
                'recent_errors': [
                    {
                        'timestamp': m.timestamp.isoformat(),
                        'status_code': m.status_code,
                        'error_message': m.error_message
                    } for m in errors[-10:]  # Last 10 errors
                ]
            }
            
        except Exception as e:
            logger.error(f"❌ Error getting endpoint analytics: {e}")
            return {'error': str(e)}

# Global analytics engine instance
analytics_engine = LogAnalyticsEngine()

def start_log_analytics():
    """Start the log analytics system"""
    analytics_engine.start_monitoring()

def stop_log_analytics():
    """Stop the log analytics system"""
    analytics_engine.stop_monitoring()

def get_server_analytics() -> Dict[str, Any]:
    """Get server analytics data"""
    return analytics_engine.get_analytics_summary()

def get_endpoint_analytics(endpoint: str) -> Dict[str, Any]:
    """Get analytics for specific endpoint"""
    return analytics_engine.get_endpoint_analytics(endpoint)

"""
Real Analytics Routes
Provides real server analytics data
"""

from flask import Blueprint, jsonify, request
from utils.real_analytics import real_analytics
import logging

# Create blueprint
real_analytics_bp = Blueprint('real_analytics', __name__)

@real_analytics_bp.route('/analytics/overview', methods=['GET'])
def get_overview():
    """Get real analytics overview"""
    try:
        time_period = request.args.get('period', '1hour')
        hours = 1 if time_period == '1hour' else 5 if time_period == '5hours' else 24
        
        data = real_analytics.get_analytics_data(hours)
        
        return jsonify({
            'success': True,
            'data': data,
            'timestamp': data.get('uptime_seconds', 0)
        })
    
    except Exception as e:
        logging.error(f"Real analytics overview error: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'data': {
                'total_requests': 0,
                'total_errors': 0,
                'error_rate': 0,
                'hourly_hits': [],
                'top_endpoints': [],
                'slowest_endpoints': [],
                'response_codes': {},
                'recent_errors': [],
                'system_stats': {
                    'cpu_percent': 0,
                    'memory_percent': 0,
                    'memory_used': 0,
                    'memory_total': 0
                }
            }
        }), 500

@real_analytics_bp.route('/analytics/time-patterns', methods=['GET'])
def get_time_patterns():
    """Get real time patterns"""
    try:
        time_period = request.args.get('period', '1hour')
        hours = 1 if time_period == '1hour' else 5 if time_period == '5hours' else 24
        
        data = real_analytics.get_time_patterns(hours)
        
        return jsonify({
            'success': True,
            'data': data,
            'time_period': time_period
        })
    
    except Exception as e:
        logging.error(f"Real time patterns error: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'data': {
                'hourly_hits': [],
                'busiest_hours': [],
                'hit_trends': {
                    'trend': 'stable',
                    'percentage': 0,
                    'recent_avg': 0,
                    'older_avg': 0
                },
                'minute_by_minute': []
            }
        }), 500

@real_analytics_bp.route('/analytics/requests', methods=['GET'])
def get_requests():
    """Get real request statistics"""
    try:
        time_period = request.args.get('period', '1hour')
        hours = 1 if time_period == '1hour' else 5 if time_period == '5hours' else 24
        
        data = real_analytics.get_analytics_data(hours)
        
        return jsonify({
            'success': True,
            'data': {
                'total_requests': data['total_requests'],
                'total_errors': data['total_errors'],
                'error_rate': data['error_rate'],
                'total_bytes_sent': data['total_bytes_sent'],
                'uptime_seconds': data['uptime_seconds']
            }
        })
    
    except Exception as e:
        logging.error(f"Real requests error: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'data': {
                'total_requests': 0,
                'total_errors': 0,
                'error_rate': 0,
                'total_bytes_sent': 0,
                'uptime_seconds': 0
            }
        }), 500

@real_analytics_bp.route('/analytics/endpoints', methods=['GET'])
def get_endpoints():
    """Get real endpoint statistics"""
    try:
        time_period = request.args.get('period', '1hour')
        hours = 1 if time_period == '1hour' else 5 if time_period == '5hours' else 24
        
        data = real_analytics.get_analytics_data(hours)
        
        return jsonify({
            'success': True,
            'data': {
                'top_endpoints': data['top_endpoints'],
                'slowest_endpoints': data['slowest_endpoints'],
                'response_codes': data['response_codes']
            }
        })
    
    except Exception as e:
        logging.error(f"Real endpoints error: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'data': {
                'top_endpoints': [],
                'slowest_endpoints': [],
                'response_codes': {}
            }
        }), 500

@real_analytics_bp.route('/analytics/system', methods=['GET'])
def get_system():
    """Get real system statistics"""
    try:
        data = real_analytics.get_analytics_data(1)
        
        return jsonify({
            'success': True,
            'data': data['system_stats']
        })
    
    except Exception as e:
        logging.error(f"Real system error: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'data': {
                'cpu_percent': 0,
                'memory_percent': 0,
                'memory_used': 0,
                'memory_total': 0
            }
        }), 500

@real_analytics_bp.route('/analytics/errors', methods=['GET'])
def get_errors():
    """Get real error statistics"""
    try:
        time_period = request.args.get('period', '1hour')
        hours = 1 if time_period == '1hour' else 5 if time_period == '5hours' else 24
        
        data = real_analytics.get_analytics_data(hours)
        
        return jsonify({
            'success': True,
            'data': {
                'total_errors': data['total_errors'],
                'error_rate': data['error_rate'],
                'recent_errors': data['recent_errors']
            }
        })
    
    except Exception as e:
        logging.error(f"Real errors error: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'data': {
                'total_errors': 0,
                'error_rate': 0,
                'recent_errors': []
            }
        }), 500

@real_analytics_bp.route('/analytics/refresh', methods=['POST'])
def refresh_data():
    """Refresh analytics data"""
    try:
        time_period = request.args.get('period', '1hour')
        hours = 1 if time_period == '1hour' else 5 if time_period == '5hours' else 24
        
        data = real_analytics.get_analytics_data(hours)
        time_patterns = real_analytics.get_time_patterns(hours)
        
        return jsonify({
            'success': True,
            'data': {
                **data,
                'time_patterns': time_patterns
            },
            'timestamp': data.get('uptime_seconds', 0)
        })
    
    except Exception as e:
        logging.error(f"Real refresh error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

#!/usr/bin/env python3
"""
Minimal Flask app to test performance without any database connections
"""
from flask import Flask, jsonify
import time

app = Flask(__name__)

@app.route('/health')
def health():
    """Minimal health endpoint"""
    return jsonify({
        'success': True,
        'status': 'healthy',
        'timestamp': '2024-01-01T00:00:00Z'
    }), 200

@app.route('/')
def root():
    """Minimal root endpoint"""
    return jsonify({
        'success': True,
        'message': 'Minimal test server is running'
    }), 200

if __name__ == '__main__':
    print("🚀 Starting minimal test server...")
    app.run(host='0.0.0.0', port=5001, debug=False, threaded=True)

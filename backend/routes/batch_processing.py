#!/usr/bin/env python3
"""
Batch Processing API Routes
Manages efficient batch processing of student notifications
"""

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from bson import ObjectId
from mongo import mongo_db
from utils.batch_processor import (
    create_credentials_batch_job, 
    create_test_notification_batch_job,
    get_batch_status, 
    get_all_batches_status,
    start_batch_processor,
    stop_batch_processor
)
from utils.hosting_worker_manager import get_worker_health
from utils.test_student_selector import get_students_by_batch_course_combination, validate_test_assignment
from routes.access_control import require_permission

# Create blueprint
batch_processing_bp = Blueprint('batch_processing', __name__)

@batch_processing_bp.route('/start-processor', methods=['POST'])
@jwt_required()
@require_permission(module='batch_management')
def start_processor():
    """Start the batch processor"""
    try:
        start_batch_processor()
        return jsonify({
            'success': True,
            'message': 'Batch processor started successfully'
        }), 200
    except Exception as e:
        current_app.logger.error(f"Error starting batch processor: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to start batch processor: {str(e)}'
        }), 500

@batch_processing_bp.route('/stop-processor', methods=['POST'])
@jwt_required()
@require_permission(module='batch_management')
def stop_processor():
    """Stop the batch processor"""
    try:
        stop_batch_processor()
        return jsonify({
            'success': True,
            'message': 'Batch processor stopped successfully'
        }), 200
    except Exception as e:
        current_app.logger.error(f"Error stopping batch processor: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to stop batch processor: {str(e)}'
        }), 500

@batch_processing_bp.route('/credentials/process', methods=['POST'])
@jwt_required()
@require_permission(module='batch_management')
def process_credentials_batch():
    """Process student credentials in batches"""
    try:
        data = request.get_json()
        students = data.get('students', [])
        batch_size = data.get('batch_size', 100)
        interval_minutes = data.get('interval_minutes', 3)
        
        if not students:
            return jsonify({
                'success': False,
                'message': 'No students provided'
            }), 400
        
        # Create batch job
        result = create_credentials_batch_job(
            students=students,
            batch_size=batch_size,
            interval_minutes=interval_minutes
        )
        
        return jsonify(result), 200
        
    except Exception as e:
        current_app.logger.error(f"Error processing credentials batch: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to process credentials batch: {str(e)}'
        }), 500

@batch_processing_bp.route('/test-notification/process', methods=['POST'])
@jwt_required()
@require_permission(module='test_management')
def process_test_notification_batch():
    """Process test notification batch"""
    try:
        data = request.get_json()
        test_id = data.get('test_id')
        test_name = data.get('test_name')
        start_date = data.get('start_date')
        batch_ids = data.get('batch_ids', [])
        course_ids = data.get('course_ids', [])
        batch_size = data.get('batch_size', 100)
        interval_minutes = data.get('interval_minutes', 3)
        
        if not all([test_id, test_name, batch_ids]):
            return jsonify({
                'success': False,
                'message': 'test_id, test_name, and batch_ids are required'
            }), 400
        
        # Get students for this test
        students = get_students_by_batch_course_combination(batch_ids, course_ids)
        
        if not students:
            return jsonify({
                'success': False,
                'message': 'No students found for the specified batches and courses'
            }), 400
        
        # Create batch job
        result = create_test_notification_batch_job(
            test_id=test_id,
            test_name=test_name,
            start_date=start_date or 'Immediately',
            students=students,
            batch_size=batch_size,
            interval_minutes=interval_minutes
        )
        
        return jsonify(result), 200
        
    except Exception as e:
        current_app.logger.error(f"Error processing test notification batch: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to process test notification batch: {str(e)}'
        }), 500

@batch_processing_bp.route('/test-notification/validate', methods=['POST'])
@jwt_required()
@require_permission(module='test_management')
def validate_test_notification():
    """Validate test notification assignment"""
    try:
        data = request.get_json()
        batch_ids = data.get('batch_ids', [])
        course_ids = data.get('course_ids', [])
        
        if not batch_ids:
            return jsonify({
                'success': False,
                'message': 'batch_ids are required'
            }), 400
        
        # Validate assignment
        result = validate_test_assignment('validation', batch_ids, course_ids)
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error validating test notification: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to validate test notification: {str(e)}'
        }), 500

@batch_processing_bp.route('/batch/<batch_id>/status', methods=['GET'])
@jwt_required()
@require_permission(module='batch_management')
def get_status(batch_id):
    """Get status of a specific batch job"""
    try:
        status = get_batch_status(batch_id)
        if not status:
            return jsonify({
                'success': False,
                'message': 'Batch job not found'
            }), 404
        
        return jsonify({
            'success': True,
            'data': status
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting batch status: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to get batch status: {str(e)}'
        }), 500

@batch_processing_bp.route('/batches/status', methods=['GET'])
@jwt_required()
@require_permission(module='batch_management')
def get_all_status():
    """Get status of all batch jobs"""
    try:
        status = get_all_batches_status()
        return jsonify({
            'success': True,
            'data': status
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting all batch status: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to get batch status: {str(e)}'
        }), 500

@batch_processing_bp.route('/students/for-batch', methods=['POST'])
@jwt_required()
@require_permission(module='batch_management')
def get_students_for_batch():
    """Get students for a specific batch and course combination"""
    try:
        data = request.get_json()
        batch_ids = data.get('batch_ids', [])
        course_ids = data.get('course_ids', [])
        
        if not batch_ids:
            return jsonify({
                'success': False,
                'message': 'batch_ids are required'
            }), 400
        
        # Get students
        students = get_students_by_batch_course_combination(batch_ids, course_ids)
        
        return jsonify({
            'success': True,
            'data': {
                'students': students,
                'total_count': len(students),
                'email_count': len([s for s in students if s.get('email')]),
                'mobile_count': len([s for s in students if s.get('mobile_number')])
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting students for batch: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to get students for batch: {str(e)}'
        }), 500

@batch_processing_bp.route('/worker/health', methods=['GET'])
@jwt_required()
@require_permission(module='batch_management')
def get_worker_health_status():
    """Get worker health status for debugging hosting issues"""
    try:
        health = get_worker_health()
        return jsonify({
            'success': True,
            'data': health
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting worker health: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to get worker health: {str(e)}'
        }), 500

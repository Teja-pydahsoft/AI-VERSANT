from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from bson import ObjectId
from datetime import datetime
import pytz
from mongo import mongo_db
from routes.test_management import require_superadmin

results_management_bp = Blueprint('results_management', __name__)

@results_management_bp.route('/migrate-existing-tests', methods=['POST'])
@jwt_required()
@require_superadmin
def migrate_existing_tests():
    """Migrate existing online tests to have release fields"""
    try:
        current_user_id = get_jwt_identity()
        
        # Find all online tests that don't have release fields
        online_tests = mongo_db.tests.find({
            'test_type': 'online',
            '$or': [
                {'is_released': {'$exists': False}},
                {'released_at': {'$exists': False}},
                {'released_by': {'$exists': False}}
            ]
        })
        
        updated_count = 0
        for test in online_tests:
            # Update the test with default release fields
            update_result = mongo_db.tests.update_one(
                {'_id': test['_id']},
                {
                    '$set': {
                        'is_released': False,  # Existing tests are not released by default
                        'released_at': None,
                        'released_by': None,
                        'migrated_at': datetime.now(pytz.utc),
                        'migrated_by': ObjectId(current_user_id)
                    }
                }
            )
            
            if update_result.modified_count > 0:
                updated_count += 1
        
        # Get admin user details for logging
        admin_user = mongo_db.users.find_one({'_id': ObjectId(current_user_id)})
        admin_name = admin_user.get('name', 'Unknown Admin') if admin_user else 'Unknown Admin'
        
        current_app.logger.info(f"Migration completed by {admin_name}: {updated_count} online tests updated")
        
        return jsonify({
            'success': True,
            'message': f'Migration completed successfully. {updated_count} online tests updated with release fields.',
            'data': {
                'updated_tests': updated_count,
                'migrated_by': admin_name,
                'migrated_at': datetime.now(pytz.utc).isoformat()
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error migrating existing tests: {e}", exc_info=True)
        return jsonify({'success': False, 'message': str(e)}), 500

@results_management_bp.route('/release/<test_id>', methods=['POST'])
@jwt_required()
def release_test_results(test_id):
    """Release test results for students to view"""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)
        allowed_roles = ['superadmin', 'campus_admin']
        if not user or user.get('role') not in allowed_roles:
            return jsonify({
                'success': False,
                'message': 'Access denied. Admin privileges required.'
            }), 403
        
        # Find the test
        test = mongo_db.tests.find_one({'_id': ObjectId(test_id)})
        if not test:
            return jsonify({'success': False, 'message': 'Test not found'}), 404
        
        # Check if it's an online test
        if test.get('test_type') != 'online':
            return jsonify({'success': False, 'message': 'Only online test results can be released'}), 400
        
        # Check if already released
        if test.get('is_released', False):
            return jsonify({'success': False, 'message': 'Test results are already released'}), 400
        
        # Update test with release information
        update_result = mongo_db.tests.update_one(
            {'_id': ObjectId(test_id)},
            {
                '$set': {
                    'is_released': True,
                    'released_at': datetime.now(pytz.utc),
                    'released_by': ObjectId(current_user_id)
                }
            }
        )
        
        if update_result.modified_count == 0:
            return jsonify({'success': False, 'message': 'Failed to release test results'}), 500
        
        # Get admin user details for logging
        admin_user = mongo_db.users.find_one({'_id': ObjectId(current_user_id)})
        admin_name = admin_user.get('name', 'Unknown Admin') if admin_user else 'Unknown Admin'
        
        current_app.logger.info(f"Test results released: {test.get('name')} by {admin_name}")
        
        return jsonify({
            'success': True,
            'message': f'Test results for "{test.get("name")}" have been released successfully',
            'data': {
                'test_id': test_id,
                'test_name': test.get('name'),
                'released_at': datetime.now(pytz.utc).isoformat(),
                'released_by': admin_name
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error releasing test results: {e}", exc_info=True)
        return jsonify({'success': False, 'message': str(e)}), 500

@results_management_bp.route('/unrelease/<test_id>', methods=['POST'])
@jwt_required()
def unrelease_test_results(test_id):
    """Unrelease test results (hide from students)"""
    try:
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)
        allowed_roles = ['superadmin', 'campus_admin']
        if not user or user.get('role') not in allowed_roles:
            return jsonify({
                'success': False,
                'message': 'Access denied. Admin privileges required.'
            }), 403
        
        # Find the test
        test = mongo_db.tests.find_one({'_id': ObjectId(test_id)})
        if not test:
            return jsonify({'success': False, 'message': 'Test not found'}), 404
        
        # Check if it's an online test
        if test.get('test_type') != 'online':
            return jsonify({'success': False, 'message': 'Only online test results can be unreleased'}), 400
        
        # Check if already unreleased
        if not test.get('is_released', False):
            return jsonify({'success': False, 'message': 'Test results are not released yet'}), 400
        
        # Update test to unrelease
        update_result = mongo_db.tests.update_one(
            {'_id': ObjectId(test_id)},
            {
                '$set': {
                    'is_released': False,
                    'unreleased_at': datetime.now(pytz.utc),
                    'unreleased_by': ObjectId(current_user_id)
                }
            }
        )
        
        if update_result.modified_count == 0:
            return jsonify({'success': False, 'message': 'Failed to unrelease test results'}), 500
        
        # Get admin user details for logging
        admin_user = mongo_db.users.find_one({'_id': ObjectId(current_user_id)})
        admin_name = admin_user.get('name', 'Unknown Admin') if admin_user else 'Unknown Admin'
        
        current_app.logger.info(f"Test results unreleased: {test.get('name')} by {admin_name}")
        
        return jsonify({
            'success': True,
            'message': f'Test results for "{test.get("name")}" have been unreleased successfully',
            'data': {
                'test_id': test_id,
                'test_name': test.get('name'),
                'unreleased_at': datetime.now(pytz.utc).isoformat(),
                'unreleased_by': admin_name
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error unreleasing test results: {e}", exc_info=True)
        return jsonify({'success': False, 'message': str(e)}), 500

@results_management_bp.route('/status/<test_id>', methods=['GET'])
@jwt_required()
def get_test_release_status(test_id):
    """Get the release status of a test"""
    try:
        # Check user permissions
        current_user_id = get_jwt_identity()
        user = mongo_db.find_user_by_id(current_user_id)
        allowed_roles = ['superadmin', 'campus_admin']
        if not user or user.get('role') not in allowed_roles:
            return jsonify({
                'success': False,
                'message': 'Access denied. Admin privileges required.'
            }), 403
        
        # Find the test
        test = mongo_db.tests.find_one({'_id': ObjectId(test_id)})
        if not test:
            return jsonify({'success': False, 'message': 'Test not found'}), 404
        
        # Get admin user details if released
        released_by_name = None
        if test.get('released_by'):
            admin_user = mongo_db.users.find_one({'_id': test.get('released_by')})
            released_by_name = admin_user.get('name', 'Unknown Admin') if admin_user else 'Unknown Admin'
        
        return jsonify({
            'success': True,
            'data': {
                'test_id': test_id,
                'test_name': test.get('name'),
                'test_type': test.get('test_type'),
                'is_released': test.get('is_released', False),
                'released_at': test.get('released_at').isoformat() if test.get('released_at') else None,
                'released_by': released_by_name,
                'can_release': test.get('test_type') == 'online' and not test.get('is_released', False),
                'can_unrelease': test.get('test_type') == 'online' and test.get('is_released', False)
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting test release status: {e}", exc_info=True)
        return jsonify({'success': False, 'message': str(e)}), 500

@results_management_bp.route('/bulk-release', methods=['POST'])
@jwt_required()
@require_superadmin
def bulk_release_test_results():
    """Release multiple test results at once"""
    try:
        current_user_id = get_jwt_identity()
        data = request.get_json()
        test_ids = data.get('test_ids', [])
        
        if not test_ids:
            return jsonify({'success': False, 'message': 'No test IDs provided'}), 400
        
        results = []
        success_count = 0
        error_count = 0
        
        for test_id in test_ids:
            try:
                # Find the test
                test = mongo_db.tests.find_one({'_id': ObjectId(test_id)})
                if not test:
                    results.append({'test_id': test_id, 'status': 'error', 'message': 'Test not found'})
                    error_count += 1
                    continue
                
                # Check if it's an online test
                if test.get('test_type') != 'online':
                    results.append({'test_id': test_id, 'status': 'error', 'message': 'Only online test results can be released'})
                    error_count += 1
                    continue
                
                # Check if already released
                if test.get('is_released', False):
                    results.append({'test_id': test_id, 'status': 'skipped', 'message': 'Already released'})
                    continue
                
                # Update test with release information
                update_result = mongo_db.tests.update_one(
                    {'_id': ObjectId(test_id)},
                    {
                        '$set': {
                            'is_released': True,
                            'released_at': datetime.now(pytz.utc),
                            'released_by': ObjectId(current_user_id)
                        }
                    }
                )
                
                if update_result.modified_count > 0:
                    results.append({'test_id': test_id, 'status': 'success', 'message': 'Released successfully'})
                    success_count += 1
                else:
                    results.append({'test_id': test_id, 'status': 'error', 'message': 'Failed to release'})
                    error_count += 1
                    
            except Exception as e:
                results.append({'test_id': test_id, 'status': 'error', 'message': str(e)})
                error_count += 1
        
        # Get admin user details for logging
        admin_user = mongo_db.users.find_one({'_id': ObjectId(current_user_id)})
        admin_name = admin_user.get('name', 'Unknown Admin') if admin_user else 'Unknown Admin'
        
        current_app.logger.info(f"Bulk release completed by {admin_name}: {success_count} successful, {error_count} errors")
        
        return jsonify({
            'success': True,
            'message': f'Bulk release completed: {success_count} successful, {error_count} errors',
            'data': {
                'total_tests': len(test_ids),
                'successful': success_count,
                'errors': error_count,
                'results': results
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error in bulk release: {e}", exc_info=True)
        return jsonify({'success': False, 'message': str(e)}), 500

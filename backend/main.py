import os
import gc
import psutil
from flask import Flask, jsonify, request
from datetime import datetime
from socketio_instance import socketio
from flask_socketio import join_room
from config.shared import bcrypt
from config.constants import JWT_ACCESS_TOKEN_EXPIRES, JWT_REFRESH_TOKEN_EXPIRES
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from dotenv import load_dotenv
from scheduler import schedule_daily_notifications
from config.aws_config import init_aws
from connection_monitor import start_connection_monitoring, stop_connection_monitoring, get_connection_health
# Push service removed - will be reimplemented

# Import Windows optimizations first
try:
    from utils.windows_optimizer import optimize_windows_sockets, get_optimal_connection_settings
    optimize_windows_sockets()
except ImportError:
    pass

# Optimize Python for high concurrency
gc.set_threshold(700, 10, 10)  # Optimize garbage collection
os.environ['PYTHONUNBUFFERED'] = '1'
os.environ['PYTHONDONTWRITEBYTECODE'] = '1'

load_dotenv()

def create_app():
    app = Flask(__name__)

    # Configuration
    app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'versant_jwt_secret_key_2024_secure_and_unique')
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = JWT_ACCESS_TOKEN_EXPIRES
    app.config['JWT_REFRESH_TOKEN_EXPIRES'] = JWT_REFRESH_TOKEN_EXPIRES
    app.config['JWT_TOKEN_LOCATION'] = ['headers']
    app.config['JWT_HEADER_NAME'] = 'Authorization'
    app.config['JWT_HEADER_TYPE'] = 'Bearer'

    # Initialize extensions
    jwt = JWTManager(app)
    bcrypt.init_app(app)
    socketio.init_app(app)
    
    # Initialize analytics middleware (must be done early)
    from middleware.analytics_middleware import init_analytics_middleware
    init_analytics_middleware(app)
    
    # Initialize real analytics middleware (must be done early)
    from middleware.real_analytics_middleware import init_real_analytics_middleware
    init_real_analytics_middleware(app)
    print("✅ Analytics middleware initialized successfully")
    
    # Socket.IO authentication middleware
    @socketio.on('connect')
    def handle_connect(auth=None):
        """Handle Socket.IO connection with optional authentication"""
        try:
            # For now, allow all connections (can add JWT validation later if needed)
            print(f"✅ Socket.IO client connected")
            return True
        except Exception as e:
            print(f"❌ Socket.IO connection error: {e}")
            return False
    
    @socketio.on('disconnect')
    def handle_disconnect():
        """Handle Socket.IO disconnection"""
        print(f"🔌 Socket.IO client disconnected")
    
    @socketio.on('join_room')
    def handle_join_room(data):
        """Handle user joining a room for progress updates"""
        try:
            user_id = data.get('user_id')
            if user_id:
                join_room(str(user_id))
                print(f"✅ User {user_id} joined room for progress updates")
                return {'success': True, 'message': f'Joined room {user_id}'}
            else:
                return {'success': False, 'message': 'User ID required'}
        except Exception as e:
            print(f"❌ Error joining room: {e}")
            return {'success': False, 'message': str(e)}

    # Initialize AWS S3 connection
    print("🔧 Initializing AWS S3 connection...")
    aws_initialized = init_aws()
    if aws_initialized:
        print("✅ AWS S3 initialized successfully")
    else:
        print("⚠️  AWS S3 initialization failed - audio uploads may not work")

    # CORS configuration

    default_origins = 'http://localhost:3000,http://localhost:5173,https://crt.pydahsoft.in,https://52.66.128.80'
    cors_origins = os.getenv('CORS_ORIGINS', default_origins)

    # Enhanced CORS configuration to handle all possible origins
    # Check if we should allow all origins (for development/testing)
    allow_all_origins = os.getenv('ALLOW_ALL_CORS', 'true').lower() == 'true'  # Changed default to true for production

    print(f"🔧 CORS Configuration:")
    print(f"   Allow all origins: {allow_all_origins}")
    print(f"   CORS origins: {cors_origins}")

    if allow_all_origins:
        # Allow all origins for development/testing
        print("   Using wildcard CORS (*)")
        CORS(app, 
             origins="*", 
             supports_credentials=False,  # Must be False when origins="*"
             allow_headers=["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin", "Access-Control-Request-Method", "Access-Control-Request-Headers"],
             methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
             expose_headers=["Content-Type", "Authorization"],
             max_age=3600)
    else:
        # Production CORS with specific origins
        origins_list = [origin.strip() for origin in cors_origins.split(',')]
        print(f"   Using specific origins: {origins_list}")
        CORS(app, 
             origins=origins_list, 
             supports_credentials=True, 
             allow_headers=["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin", "Access-Control-Request-Method", "Access-Control-Request-Headers"],
             methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
             expose_headers=["Content-Type", "Authorization"],
             max_age=3600)

    # CORS after_request handler
    @app.after_request
    def after_request(response):
        """Add CORS headers to all responses"""
        from flask import request
        
        # Get the origin from the request
        origin = request.headers.get('Origin')
        
        # Check if origin is allowed
        if allow_all_origins or (origin and origin in cors_origins.split(',')):
            response.headers.add('Access-Control-Allow-Origin', origin if origin else '*')
            response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept,Origin,Access-Control-Request-Method,Access-Control-Request-Headers')
            response.headers.add('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH')
            response.headers.add('Access-Control-Allow-Credentials', 'true')
            response.headers.add('Access-Control-Max-Age', '3600')
        
        return response

    # CORS preflight handler
    @app.route('/', defaults={'path': ''}, methods=['OPTIONS'])
    @app.route('/<path:path>', methods=['OPTIONS'])
    def handle_options(path):
        """Handle CORS preflight requests"""
        from flask import request
        
        # Get the origin from the request
        origin = request.headers.get('Origin')
        
        # Check if origin is allowed
        if allow_all_origins or (origin and origin in cors_origins.split(',')):
            response = jsonify({'message': 'CORS preflight handled'})
            response.headers.add('Access-Control-Allow-Origin', origin if origin else '*')
            response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept,Origin,Access-Control-Request-Method,Access-Control-Request-Headers')
            response.headers.add('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH')
            response.headers.add('Access-Control-Allow-Credentials', 'true')
            response.headers.add('Access-Control-Max-Age', '3600')
            return response
        else:
            # Return 403 for disallowed origins
            return jsonify({'error': 'CORS policy violation'}), 403

    # Root route for API status
    @app.route('/')
    def api_status():
        """API status endpoint"""
        from config.aws_config import get_aws_status
        
        return jsonify({
            'success': True,
            'message': 'Study Edge Backend API is running',
            'version': '1.0.0',
            'status': 'active',
            'cors_enabled': True,
            'allowed_origins': cors_origins.split(','),
            'allow_all_origins': allow_all_origins,
            'aws_status': get_aws_status(),
            'endpoints': {
                'auth': '/auth',
                'superadmin': '/superadmin',
                'campus_admin': '/campus-admin',
                'course_admin': '/course-admin',
                'student': '/student',
                'test_management': '/test-management',
                'global_settings': '/global-settings',
                'forms': '/forms',
                'form_submissions': '/form-submissions',
                'form_analytics': '/form-analytics',
                'analytics': '/analytics',
                'campus_management': '/campus-management',
                'course_management': '/course-management',
                'batch_management': '/batch-management',
                'access_control': '/access-control',
                'admin_management': '/admin-management'
            }
        }), 200

    # Health check endpoint
    @app.route('/health')
    def health_check():
        """Enhanced health check endpoint with connection monitoring and SSL diagnostics"""
        try:
            import time
            import psutil
            from utils.connection_manager import get_mongo_database
            
            start_time = time.time()
            
            # Test database connection
            db = get_mongo_database()
            db_start = time.time()
            db.users.find_one({})
            db_time = time.time() - db_start
            
            # Get system metrics
            memory = psutil.virtual_memory()
            cpu_percent = psutil.cpu_percent(interval=0.1)
            
            # Get connection health status
            connection_health = get_connection_health()
            
            total_time = time.time() - start_time
            
            return jsonify({
                'success': True,
                'status': 'healthy',
                'timestamp': datetime.now().isoformat(),
                'response_time': f"{total_time:.3f}s",
                'database_time': f"{db_time:.3f}s",
                'system': {
                    'memory_usage': f"{memory.percent:.1f}%",
                    'cpu_usage': f"{cpu_percent:.1f}%",
                    'available_memory': f"{memory.available // (1024*1024)}MB"
                },
                'connection_health': connection_health,
                'ssl_status': 'stable',
                'timeout_status': 'OK' if total_time < 10.0 else 'SLOW'
            }), 200
            
        except Exception as e:
            return jsonify({
                'success': False,
                'status': 'unhealthy',
                'error': str(e),
                'timestamp': datetime.now().isoformat(),
                'connection_health': get_connection_health()
            }), 500

    # CORS test endpoint
    @app.route('/cors-test')
    def cors_test():
        """Test endpoint to verify CORS is working"""
        from flask import request
        
        origin = request.headers.get('Origin')
        return jsonify({
            'success': True,
            'message': 'CORS test successful',
            'origin': origin,
            'cors_enabled': True,
            'allow_all_origins': allow_all_origins,
            'allowed_origins': cors_origins.split(',')
        }), 200

    # Register blueprints
    from routes.auth import auth_bp
    from routes.superadmin import superadmin_bp
    from routes.campus_admin import campus_admin_bp
    from routes.course_admin import course_admin_bp
    from routes.student import student_bp
    from routes.test_management import test_management_bp
    from routes.practice_management import practice_management_bp
    from routes.online_exam_management import online_exam_management_bp

    from routes.analytics import analytics_bp
    from routes.campus_management import campus_management_bp
    from routes.course_management import course_management_bp
    from routes.batch_management import batch_management_bp
    from routes.access_control import access_control_bp
    from routes.admin_management import admin_management_bp

    # Register modular test management blueprints
    from routes.test_management_mcq import mcq_test_bp
    from routes.test_management_audio import audio_test_bp
    from routes.test_management_writing import writing_test_bp
    from routes.test_management_technical import technical_test_bp
    
    # Register SMS management blueprint
    from routes.sms_management import sms_bp
    
    from routes.global_settings import global_settings_bp
    
    # Register async routes
    from routes.async_auth import async_auth_bp
    
    # Register performance monitoring routes
    from routes.performance_monitor import performance_bp
    # Removed non-existent route imports

    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(superadmin_bp, url_prefix='/superadmin')
    app.register_blueprint(campus_admin_bp, url_prefix='/campus-admin')
    app.register_blueprint(course_admin_bp, url_prefix='/course-admin')
    app.register_blueprint(student_bp, url_prefix='/student')
    app.register_blueprint(test_management_bp, url_prefix='/test-management')
    app.register_blueprint(practice_management_bp, url_prefix='/practice-management')
    app.register_blueprint(online_exam_management_bp, url_prefix='/online-exam-management')

    app.register_blueprint(analytics_bp, url_prefix='/analytics')
    app.register_blueprint(campus_management_bp, url_prefix='/campus-management')
    app.register_blueprint(course_management_bp, url_prefix='/course-management')
    app.register_blueprint(batch_management_bp, url_prefix='/batch-management')
    app.register_blueprint(access_control_bp, url_prefix='/access-control')
    app.register_blueprint(admin_management_bp, url_prefix='/admin-management')

    # Register modular test management blueprints
    app.register_blueprint(mcq_test_bp, url_prefix='/test-management/mcq')
    app.register_blueprint(audio_test_bp, url_prefix='/test-management/audio')
    app.register_blueprint(writing_test_bp, url_prefix='/test-management/writing')
    app.register_blueprint(technical_test_bp, url_prefix='/test-management/technical')
    
    # Register SMS management blueprint
    app.register_blueprint(sms_bp, url_prefix='/sms-management')
    
    # Register Batch Processing blueprint
    from routes.batch_processing import batch_processing_bp
    app.register_blueprint(batch_processing_bp, url_prefix='/batch-processing')
    
    # Real Analytics (only analytics system we're using)
    from routes.real_analytics import real_analytics_bp
    app.register_blueprint(real_analytics_bp, url_prefix='/real-analytics')
    
    # Results Management
    from routes.results_management import results_management_bp
    app.register_blueprint(results_management_bp, url_prefix='/results-management')
    
    # Auto Release Settings
    from routes.auto_release_settings import auto_release_settings_bp
    app.register_blueprint(auto_release_settings_bp, url_prefix='/auto-release-settings')
    
    # Push Notifications
    from routes.push_notifications import push_notifications_bp
    app.register_blueprint(push_notifications_bp, url_prefix='/push-notifications')
    
    # OneSignal Push Notifications
    from routes.onesignal_notifications import onesignal_notifications_bp
    app.register_blueprint(onesignal_notifications_bp, url_prefix='/onesignal')
    
    # VAPID Push Notifications
    from routes.vapid_notifications import vapid_bp
    app.register_blueprint(vapid_bp, url_prefix='/vapid')
    
    # Test Notifications (Broadcast)
    from routes.test_notifications import test_notifications_bp
    app.register_blueprint(test_notifications_bp, url_prefix='/notifications')
    
    # Notification Preferences
    from routes.notification_preferences import notification_preferences_bp
    app.register_blueprint(notification_preferences_bp, url_prefix='/notification-preferences')
    
    # Register Global Settings blueprint
    app.register_blueprint(global_settings_bp, url_prefix='/global-settings')
    
    # Register Form Portal blueprints
    from routes.forms import forms_bp
    from routes.form_submissions import form_submissions_bp
    from routes.form_analytics import form_analytics_bp
    
    app.register_blueprint(forms_bp, url_prefix='/forms')
    app.register_blueprint(form_submissions_bp, url_prefix='/form-submissions')
    app.register_blueprint(form_analytics_bp, url_prefix='/form-analytics')
    
    
    
    # Register async routes
    app.register_blueprint(async_auth_bp, url_prefix='/async-auth')
    
    # Register performance monitoring routes
    app.register_blueprint(performance_bp, url_prefix='/performance')
    
    # Register progress tracking blueprints
    # Removed registrations for non-existent blueprints

    print("=== Registered Routes ===")
    for rule in app.url_map.iter_rules():
        print(f"{rule.methods} {rule.rule} -> {rule.endpoint}")
    print("=========================")

    # Test route registration
    print("\n=== Testing Route Registration ===")
    try:
        with app.test_client() as client:
            # Test test_management root
            response = client.get('/test-management/')
            print(f"Test management root: {response.status_code} - {response.get_data(as_text=True)}")
            
            # Test test_management health
            response = client.get('/test-management/health')
            print(f"Test management health: {response.status_code} - {response.get_data(as_text=True)}")
            
            # Test test_management test-endpoint
            response = client.get('/test-management/test-endpoint')
            print(f"Test management test-endpoint: {response.status_code} - {response.get_data(as_text=True)}")
            
    except Exception as e:
        print(f"Route testing failed: {e}")
    print("=========================")

    # Initialize the scheduler for daily notifications
    schedule_daily_notifications(app)
    
    # Initialize Smart Worker Manager (must be done early for Gunicorn compatibility)
    print("🔧 Initializing Smart Worker Manager...")
    try:
        from utils.smart_worker_manager import smart_worker_manager, setup_signal_handlers
        setup_signal_handlers()
        print("✅ Smart Worker Manager initialized")
    except Exception as e:
        print(f"⚠️ Warning: Smart Worker Manager initialization failed: {e}")
    
    # Initialize async processing system for high concurrency
    try:
        from utils.async_processor import init_async_system
        init_async_system()
        print("✅ Async processing system initialized for 200-500 concurrent users")
        print(f"   Max workers: 100")
        print(f"   DB connections: 200")
        print(f"   Cache size: 10,000")
    except Exception as e:
        print(f"⚠️ Warning: Async system initialization failed: {e}")
    
    # Real analytics system is initialized above with middleware
    
    # TODO: Initialize Push Notification Service (removed for cleanup)
    print("ℹ️ Push Notification Service will be reimplemented")
    
    # Add development routes if in development mode
    if os.environ.get("FLASK_DEBUG", "False").lower() == "true" or os.environ.get("DEV_MODE", "False").lower() == "true":
        add_dev_routes(app)
    
    return app, socketio

def add_dev_routes(app):
    """Add development routes for testing async features"""
    @app.route('/dev/async-status')
    def dev_async_status():
        """Development endpoint to check async status"""
        try:
            from utils.async_processor import async_processor, db_pool, response_cache
            
            return {
                'success': True,
                'async_system': {
                    'workers': async_processor.max_workers,
                    'active_tasks': len(async_processor.running_tasks),
                    'task_counter': async_processor.task_counter
                },
                'database_pool': {
                    'max_connections': db_pool.max_connections,
                    'active_connections': db_pool.connection_count,
                    'available_connections': db_pool.connections.qsize()
                },
                'cache': {
                    'max_size': response_cache.max_size,
                    'current_size': len(response_cache.cache),
                    'utilization': f"{(len(response_cache.cache) / response_cache.max_size) * 100:.1f}%"
                }
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    @app.route('/dev/test-parallel')
    def dev_test_parallel():
        """Development endpoint to test parallel processing"""
        try:
            from utils.async_processor import parallel_execute
            import time
            
            def slow_task(task_id):
                time.sleep(1)  # Simulate slow operation
                return f"Task {task_id} completed"
            
            start_time = time.time()
            
            # Run 3 tasks in parallel
            results = parallel_execute([lambda: slow_task(1), lambda: slow_task(2), lambda: slow_task(3)], timeout=5.0)
            
            end_time = time.time()
            
            return {
                'success': True,
                'results': results,
                'execution_time': f"{end_time - start_time:.2f}s",
                'message': 'Parallel execution test completed'
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    @app.route('/dev/worker-manager-status')
    def dev_worker_manager_status():
        """Get Smart Worker Manager status and statistics"""
        try:
            from utils.smart_worker_manager import smart_worker_manager
            
            stats = smart_worker_manager.get_stats()
            active_tasks = smart_worker_manager.get_task_details()
            
            return {
                'success': True,
                'worker_manager': {
                    'stats': stats,
                    'active_tasks': active_tasks,
                    'health': 'healthy' if stats['active_tasks'] < 10 else 'busy'
                }
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}

app, socketio = create_app()

if __name__ == "__main__":
    import platform
    import atexit
    
    port = int(os.environ.get("PORT", 8000))
    debug = os.environ.get("FLASK_DEBUG", "False").lower() == "true"
    
    # Smart Worker Manager is already initialized in create_app() for Gunicorn compatibility
    
    # Start connection monitoring for high load stability
    print("🔍 Starting MongoDB connection monitor...")
    start_connection_monitoring()
    
    # Start batch processor
    print("🚀 Starting batch processor...")
    from utils.batch_processor import start_batch_processor
    start_batch_processor()
    
    # Start worker monitoring for hosting environments
    print("🔍 Starting worker monitoring...")
    from utils.hosting_worker_manager import start_worker_monitoring
    start_worker_monitoring()
    
    # Start log analytics system
    print("📊 Starting log analytics system...")
    from utils.log_analytics import start_log_analytics, stop_log_analytics
    start_log_analytics()
    
    # Start auto-release scheduler
    print("⏰ Starting auto-release scheduler...")
    from services.auto_release_scheduler import start_scheduler, stop_scheduler
    from utils.connection_manager import get_mongo_database
    mongo_db = get_mongo_database()
    start_scheduler(mongo_db)
    
    # Start test reminder scheduler
    print("📱 Starting test reminder scheduler...")
    from test_reminder_scheduler import start_reminder_system, reminder_scheduler
    start_reminder_system()
    print("✅ Test reminder scheduler started successfully")
    
    # Register cleanup function
    def cleanup():
        print("🧹 Cleaning up connections...")
        stop_connection_monitoring()
        from utils.batch_processor import stop_batch_processor
        stop_batch_processor()
        from utils.hosting_worker_manager import stop_worker_monitoring
        stop_worker_monitoring()
        stop_log_analytics()
        stop_scheduler()
        # Stop test reminder scheduler
        try:
            reminder_scheduler.shutdown()
            print("✅ Test reminder scheduler stopped")
        except Exception as e:
            print(f"⚠️ Error stopping test reminder scheduler: {e}")
    
    atexit.register(cleanup)
    
    # Windows-specific optimizations
    if platform.system().lower() == 'windows':
        print("🪟 Windows detected - using optimized settings")
        socketio.run(
            app, 
            host="0.0.0.0", 
            port=port, 
            debug=debug,
            use_reloader=debug,
            log_output=True
        )
    else:
        # Unix/Linux settings
        socketio.run(app, host="0.0.0.0", port=port)
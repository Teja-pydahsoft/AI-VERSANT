#!/usr/bin/env python3
"""
Hosting Worker Manager
Handles background task processing issues on hosting platforms
Provides solutions for common hosting worker problems
"""

import logging
import os
import signal
import threading
import time
import psutil
from typing import Dict, List, Optional
from utils.async_processor import get_all_background_tasks

# Configure logging
logger = logging.getLogger(__name__)

class HostingWorkerManager:
    """Manages background workers for hosting environments"""
    
    def __init__(self):
        self.worker_threads = []
        self.monitoring_thread = None
        self.running = False
        self.health_check_interval = 30  # seconds
        self.max_worker_restarts = 5
        self.worker_restart_count = 0
        
    def start_worker_monitoring(self):
        """Start monitoring background workers"""
        if self.monitoring_thread and self.monitoring_thread.is_alive():
            logger.info("🔄 Worker monitoring already running")
            return
            
        self.running = True
        self.monitoring_thread = threading.Thread(target=self._monitor_workers, daemon=True)
        self.monitoring_thread.start()
        logger.info("🚀 Worker monitoring started")
    
    def stop_worker_monitoring(self):
        """Stop monitoring background workers"""
        self.running = False
        if self.monitoring_thread:
            self.monitoring_thread.join(timeout=5)
        logger.info("🛑 Worker monitoring stopped")
    
    def _monitor_workers(self):
        """Monitor worker health and restart if needed"""
        while self.running:
            try:
                # Check processor status
                processor_status = get_all_background_tasks()
                
                # Check if processor is healthy (simple check based on task count)
                if processor_status.get('total_tasks', 0) > 1000:  # Arbitrary threshold
                    logger.warning("⚠️ Background processor has too many tasks")
                    self._restart_processor()
                
                # Check memory usage
                memory_usage = psutil.virtual_memory().percent
                if memory_usage > 90:
                    logger.warning(f"⚠️ High memory usage: {memory_usage}%")
                    self._handle_high_memory_usage()
                
                # Check if we're in a hosting environment
                if self._is_hosting_environment():
                    self._handle_hosting_limitations()
                
            except Exception as e:
                logger.error(f"❌ Error in worker monitoring: {e}")
            
            time.sleep(self.health_check_interval)
    
    def _restart_processor(self):
        """Restart the background processor"""
        try:
            if self.worker_restart_count >= self.max_worker_restarts:
                logger.error(f"❌ Max worker restarts ({self.max_worker_restarts}) reached")
                return
            
            logger.info("🔄 Restarting background processor...")
            
            # Import and restart processor
            from utils.async_processor import init_async_system
            init_async_system()
            
            self.worker_restart_count += 1
            logger.info(f"✅ Background processor restarted (attempt {self.worker_restart_count})")
            
        except Exception as e:
            logger.error(f"❌ Failed to restart processor: {e}")
    
    def _handle_high_memory_usage(self):
        """Handle high memory usage"""
        try:
            logger.info("🧹 Handling high memory usage...")
            
            # Force garbage collection
            import gc
            gc.collect()
            
            # Clear any cached data (if function exists)
            try:
                from utils.async_processor import clear_cache
                clear_cache()
            except ImportError:
                pass  # Function doesn't exist, skip
            
            logger.info("✅ Memory cleanup completed")
            
        except Exception as e:
            logger.error(f"❌ Failed to handle high memory usage: {e}")
    
    def _is_hosting_environment(self) -> bool:
        """Check if we're running in a hosting environment"""
        hosting_indicators = [
            'HEROKU_APP_NAME' in os.environ,
            'RAILWAY_PROJECT_ID' in os.environ,
            'VERCEL' in os.environ,
            'NETLIFY' in os.environ,
            'RENDER' in os.environ,
            'DIGITALOCEAN_APP_ID' in os.environ,
            'AWS_LAMBDA_FUNCTION_NAME' in os.environ,
            'FUNCTION_NAME' in os.environ,  # Google Cloud Functions
            'WEBSITE_SITE_NAME' in os.environ,  # Azure
        ]
        return any(hosting_indicators)
    
    def _handle_hosting_limitations(self):
        """Handle hosting platform limitations"""
        try:
            # Check for common hosting issues
            issues = self._detect_hosting_issues()
            
            for issue in issues:
                self._apply_hosting_fix(issue)
                
        except Exception as e:
            logger.error(f"❌ Failed to handle hosting limitations: {e}")
    
    def _detect_hosting_issues(self) -> List[str]:
        """Detect common hosting issues"""
        issues = []
        
        # Check for memory limits
        memory_usage = psutil.virtual_memory().percent
        if memory_usage > 80:
            issues.append('high_memory_usage')
        
        # Check for process limits
        process_count = len(psutil.pids())
        if process_count > 100:  # Arbitrary threshold
            issues.append('high_process_count')
        
        # Check for file descriptor limits
        try:
            import resource
            soft, hard = resource.getrlimit(resource.RLIMIT_NOFILE)
            if soft < 1000:
                issues.append('low_file_descriptor_limit')
        except:
            pass
        
        # Check for timeout issues
        if self._is_hosting_environment():
            issues.append('hosting_timeout_risk')
        
        return issues
    
    def _apply_hosting_fix(self, issue: str):
        """Apply fixes for specific hosting issues"""
        try:
            if issue == 'high_memory_usage':
                self._optimize_memory_usage()
            elif issue == 'high_process_count':
                self._optimize_process_count()
            elif issue == 'low_file_descriptor_limit':
                self._optimize_file_descriptors()
            elif issue == 'hosting_timeout_risk':
                self._optimize_for_hosting()
                
        except Exception as e:
            logger.error(f"❌ Failed to apply fix for {issue}: {e}")
    
    def _optimize_memory_usage(self):
        """Optimize memory usage"""
        logger.info("🧹 Optimizing memory usage...")
        
        # Force garbage collection
        import gc
        gc.collect()
        
        # Clear processor cache
        from utils.async_processor import clear_cache
        clear_cache()
        
        # Reduce batch sizes
        os.environ['BATCH_SIZE'] = '50'  # Reduce from 100 to 50
        
        logger.info("✅ Memory optimization completed")
    
    def _optimize_process_count(self):
        """Optimize process count"""
        logger.info("🔄 Optimizing process count...")
        
        # Reduce concurrent workers
        os.environ['MAX_WORKERS'] = '2'  # Reduce concurrent workers
        
        logger.info("✅ Process count optimization completed")
    
    def _optimize_file_descriptors(self):
        """Optimize file descriptor usage"""
        logger.info("📁 Optimizing file descriptors...")
        
        # Close unnecessary connections (if function exists)
        try:
            from utils.async_processor import close_idle_connections
            close_idle_connections()
        except ImportError:
            pass  # Function doesn't exist, skip
        
        logger.info("✅ File descriptor optimization completed")
    
    def _optimize_for_hosting(self):
        """Optimize for hosting platforms"""
        logger.info("☁️ Optimizing for hosting platform...")
        
        # Set hosting-friendly configurations
        os.environ['WORKER_TIMEOUT'] = '300'  # 5 minutes
        os.environ['BATCH_INTERVAL'] = '5'    # 5 minutes between batches
        os.environ['MAX_RETRIES'] = '2'       # Reduce retries
        
        # Enable graceful shutdown
        self._setup_graceful_shutdown()
        
        logger.info("✅ Hosting optimization completed")
    
    def _setup_graceful_shutdown(self):
        """Setup graceful shutdown for hosting platforms"""
        def signal_handler(signum, frame):
            logger.info(f"🛑 Received signal {signum}, shutting down gracefully...")
            self.stop_worker_monitoring()
            
            # Stop batch processor
            from utils.batch_processor import stop_batch_processor
            stop_batch_processor()
            
            # Stop async processor
            from utils.async_processor import stop_processor
            stop_processor()
            
            logger.info("✅ Graceful shutdown completed")
            exit(0)
        
        # Register signal handlers
        signal.signal(signal.SIGTERM, signal_handler)
        signal.signal(signal.SIGINT, signal_handler)
    
    def get_worker_health(self) -> Dict:
        """Get current worker health status"""
        try:
            processor_status = get_all_background_tasks()
            memory_usage = psutil.virtual_memory().percent
            process_count = len(psutil.pids())
            
            return {
                'healthy': processor_status.get('total_tasks', 0) < 1000,  # Simple health check
                'memory_usage_percent': memory_usage,
                'process_count': process_count,
                'worker_restart_count': self.worker_restart_count,
                'is_hosting_environment': self._is_hosting_environment(),
                'monitoring_active': self.running,
                'issues_detected': self._detect_hosting_issues(),
                'total_background_tasks': processor_status.get('total_tasks', 0)
            }
            
        except Exception as e:
            logger.error(f"❌ Error getting worker health: {e}")
            return {
                'healthy': False,
                'error': str(e)
            }

# Global worker manager instance
worker_manager = HostingWorkerManager()

def start_worker_monitoring():
    """Start worker monitoring"""
    worker_manager.start_worker_monitoring()

def stop_worker_monitoring():
    """Stop worker monitoring"""
    worker_manager.stop_worker_monitoring()

def get_worker_health():
    """Get worker health status"""
    return worker_manager.get_worker_health()

#!/usr/bin/env python3
"""
Robust Batch Processing System for Student Notifications
Handles both student credentials and test notifications efficiently
Divides large batches into smaller sub-batches for optimal performance
"""

import logging
import time
import threading
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from bson import ObjectId
from mongo import mongo_db
from utils.notification_queue import queue_sms, queue_email
from utils.async_processor import submit_background_task
from utils.smart_worker_manager import run_background_task_with_tracking
from utils.date_formatter import format_date_to_ist

# Configure logging
logger = logging.getLogger(__name__)

class BatchProcessor:
    """Manages robust batch processing of student notifications"""
    
    def __init__(self):
        self.active_batches = {}  # batch_id -> batch_info
        self.batch_lock = threading.Lock()
        self.processor_thread = None
        self.running = False
        self.max_retries = 3
        self.retry_delay = 30  # seconds
        
    def start_processor(self):
        """Start the batch processor thread"""
        if self.processor_thread and self.processor_thread.is_alive():
            logger.info("🔄 Batch processor already running")
            return
            
        self.running = True
        self.processor_thread = threading.Thread(target=self._process_batches, daemon=True)
        self.processor_thread.start()
        logger.info("🚀 Batch processor started")
    
    def stop_processor(self):
        """Stop the batch processor thread"""
        self.running = False
        if self.processor_thread:
            self.processor_thread.join(timeout=5)
        logger.info("🛑 Batch processor stopped")
    
    def create_credentials_batch_job(self, students: List[Dict], 
                                   batch_size: int = 100, 
                                   interval_minutes: int = 3) -> Dict:
        """Create a batch job for student credentials (both email and SMS)"""
        batch_id = f"credentials_{uuid.uuid4().hex[:8]}"
        return self._create_batch_job(
            batch_id=batch_id,
            students=students,
            notification_type='credentials',
            batch_size=batch_size,
            interval_minutes=interval_minutes
        )
    
    def create_email_only_batch_job(self, students: List[Dict], 
                                  batch_size: int = 100, 
                                  interval_minutes: int = 3) -> Dict:
        """Create a batch job for email-only notifications"""
        batch_id = f"email_only_{uuid.uuid4().hex[:8]}"
        return self._create_batch_job(
            batch_id=batch_id,
            students=students,
            notification_type='email_only',
            batch_size=batch_size,
            interval_minutes=interval_minutes
        )
    
    def create_test_notification_batch_job(self, test_id: str, object_id: str, test_name: str, 
                                         start_date: str, students: List[Dict],
                                         batch_size: int = 100, 
                                         interval_minutes: int = 3) -> Dict:
        """Create a batch job for test notifications"""
        batch_id = f"test_{test_id}_{uuid.uuid4().hex[:8]}"
        return self._create_batch_job(
            batch_id=batch_id,
            students=students,
            notification_type='test_notification',
            batch_size=batch_size,
            interval_minutes=interval_minutes,
            test_data={
                'test_id': test_id,  # Custom test_id for SMS
                'object_id': object_id,  # MongoDB _id for emails
                'test_name': test_name,
                'start_date': start_date
            }
        )
    
    def _create_batch_job(self, batch_id: str, students: List[Dict], 
                         notification_type: str, batch_size: int, 
                         interval_minutes: int, test_data: Dict = None) -> Dict:
        """Create a new batch job for processing"""
        
        with self.batch_lock:
            # Divide students into sub-batches
            sub_batches = self._divide_into_sub_batches(students, batch_size)
            
            batch_info = {
                'batch_id': batch_id,
                'original_batch_id': batch_id,
                'total_students': len(students),
                'sub_batches': sub_batches,
                'current_sub_batch': 0,
                'total_sub_batches': len(sub_batches),
                'notification_type': notification_type,
                'interval_minutes': interval_minutes,
                'created_at': datetime.now(),
                'last_processed': None,
                'status': 'pending',  # pending, processing, completed, failed
                'retry_count': 0,
                'test_data': test_data,
                'results': {
                    'sms_queued': 0,
                    'email_queued': 0,
                    'sms_failed': 0,
                    'email_failed': 0,
                    'total_processed': 0
                }
            }
            
            self.active_batches[batch_id] = batch_info
            logger.info(f"📦 Created {notification_type} batch job {batch_id} with {len(sub_batches)} sub-batches")
            
            return {
                'success': True,
                'batch_id': batch_id,
                'total_students': len(students),
                'sub_batches': len(sub_batches),
                'estimated_completion': self._calculate_estimated_completion(len(sub_batches), interval_minutes)
            }
    
    def _divide_into_sub_batches(self, students: List[Dict], batch_size: int) -> List[List[Dict]]:
        """Divide students into sub-batches of specified size"""
        sub_batches = []
        for i in range(0, len(students), batch_size):
            sub_batch = students[i:i + batch_size]
            sub_batches.append(sub_batch)
        return sub_batches
    
    def _calculate_estimated_completion(self, sub_batches: int, interval_minutes: int) -> str:
        """Calculate estimated completion time"""
        total_minutes = sub_batches * interval_minutes
        completion_time = datetime.now() + timedelta(minutes=total_minutes)
        return completion_time.strftime("%Y-%m-%d %H:%M:%S")
    
    def _process_batches(self):
        """Main processing loop - runs every 30 seconds"""
        while self.running:
            try:
                current_time = datetime.now()
                batches_to_process = []
                
                # Find batches ready for processing
                with self.batch_lock:
                    for batch_id, batch_info in self.active_batches.items():
                        if batch_info['status'] == 'pending':
                            # Check if it's time to process the next sub-batch
                            if (batch_info['last_processed'] is None or 
                                (current_time - batch_info['last_processed']).total_seconds() >= 
                                batch_info['interval_minutes'] * 60):
                                batches_to_process.append(batch_id)
                        elif batch_info['status'] == 'processing':
                            # Check if processing is taking too long (timeout after 10 minutes)
                            if (current_time - batch_info['last_processed']).total_seconds() > 600:
                                logger.warning(f"⚠️ Batch {batch_id} processing timeout - resetting to pending")
                                batch_info['status'] = 'pending'
                                batch_info['retry_count'] += 1
                                batches_to_process.append(batch_id)
                
                # Process ready batches
                for batch_id in batches_to_process:
                    self._process_next_sub_batch(batch_id)
                
                # Clean up completed batches
                self._cleanup_completed_batches()
                
            except Exception as e:
                logger.error(f"❌ Error in batch processor: {e}")
            
            # Wait 30 seconds before next check
            time.sleep(30)
    
    def _process_next_sub_batch(self, batch_id: str):
        """Process the next sub-batch for a given batch"""
        try:
            with self.batch_lock:
                batch_info = self.active_batches.get(batch_id)
                if not batch_info:
                    return
                
                if batch_info['current_sub_batch'] >= batch_info['total_sub_batches']:
                    batch_info['status'] = 'completed'
                    logger.info(f"✅ Batch {batch_id} completed")
                    return
                
                # Check retry limit
                if batch_info['retry_count'] >= self.max_retries:
                    batch_info['status'] = 'failed'
                    logger.error(f"❌ Batch {batch_id} failed after {self.max_retries} retries")
                    return
                
                # Mark as processing
                batch_info['status'] = 'processing'
                batch_info['last_processed'] = datetime.now()
                
                current_sub_batch = batch_info['current_sub_batch']
                students = batch_info['sub_batches'][current_sub_batch]
                
                logger.info(f"🔄 Processing batch {batch_id}, sub-batch {current_sub_batch + 1}/{batch_info['total_sub_batches']}")
            
            # Process students in background
            submit_background_task(
                self._process_students_sub_batch,
                batch_id=batch_id,
                sub_batch_index=current_sub_batch,
                students=students,
                notification_type=batch_info['notification_type'],
                test_data=batch_info.get('test_data')
            )
            
        except Exception as e:
            logger.error(f"❌ Error processing sub-batch for {batch_id}: {e}")
            with self.batch_lock:
                if batch_id in self.active_batches:
                    self.active_batches[batch_id]['status'] = 'failed'
    
    def _process_students_sub_batch(self, batch_id: str, sub_batch_index: int, 
                                   students: List[Dict], notification_type: str, test_data: Dict = None):
        """Process a sub-batch of students with smart worker tracking"""
        
        def process_sub_batch():
            try:
                logger.info(f"🔄 Processing {len(students)} students in batch {batch_id}, sub-batch {sub_batch_index + 1}")
                
                sms_queued = 0
                email_queued = 0
                sms_failed = 0
                email_failed = 0
                
                for student in students:
                    try:
                        # Extract student data
                        name = student.get('name', 'Student')
                        email = student.get('email')
                        phone = student.get('mobile_number') or student.get('mobile') or student.get('phone_number')
                        username = student.get('username')
                        password = student.get('password')
                        
                        if notification_type == 'credentials':
                            # Process student credentials (both email and SMS)
                            self._process_credentials_notification(
                                name, email, phone, username, password,
                                sms_queued, email_queued, sms_failed, email_failed
                            )
                        elif notification_type == 'email_only':
                            # Process email-only notifications
                            self._process_email_only_notification(
                                name, email, username, password,
                                email_queued, email_failed
                            )
                        elif notification_type == 'test_notification':
                            # Process test notification
                            self._process_test_notification(
                                name, email, phone, test_data,
                                sms_queued, email_queued, sms_failed, email_failed
                            )
                                
                    except Exception as e:
                        logger.error(f"❌ Error processing student {student.get('name', 'Unknown')}: {e}")
                        sms_failed += 1
                        email_failed += 1
                
                return {
                    'sms_queued': sms_queued,
                    'email_queued': email_queued,
                    'sms_failed': sms_failed,
                    'email_failed': email_failed,
                    'total_processed': len(students)
                }
                
            except Exception as e:
                logger.error(f"❌ Error processing sub-batch {sub_batch_index + 1} for batch {batch_id}: {e}")
                raise
        
        # Run with smart worker tracking
        try:
            result = run_background_task_with_tracking(
                process_sub_batch,
                task_type='batch_processing',
                description=f'Batch {batch_id} sub-batch {sub_batch_index + 1} ({len(students)} students)',
                estimated_duration=len(students) * 2  # 2 seconds per student estimate
            )
            
            # Update batch results
            with self.batch_lock:
                if batch_id in self.active_batches:
                    batch_info = self.active_batches[batch_id]
                    batch_info['results']['sms_queued'] += result['sms_queued']
                    batch_info['results']['email_queued'] += result['email_queued']
                    batch_info['results']['sms_failed'] += result['sms_failed']
                    batch_info['results']['email_failed'] += result['email_failed']
                    batch_info['results']['total_processed'] += result['total_processed']
                    batch_info['current_sub_batch'] += 1
                    batch_info['status'] = 'pending'  # Ready for next sub-batch
                    
                    logger.info(f"✅ Sub-batch {sub_batch_index + 1} completed for batch {batch_id}: "
                              f"SMS: {result['sms_queued']} queued, {result['sms_failed']} failed | "
                              f"Email: {result['email_queued']} queued, {result['email_failed']} failed")
        
        except Exception as e:
            logger.error(f"❌ Failed to process sub-batch {sub_batch_index + 1} for batch {batch_id}: {e}")
            with self.batch_lock:
                if batch_id in self.active_batches:
                    self.active_batches[batch_id]['status'] = 'failed'
    
    def _process_credentials_notification(self, name: str, email: str, phone: str, 
                                        username: str, password: str,
                                        sms_queued: int, email_queued: int, 
                                        sms_failed: int, email_failed: int):
        """Process student credentials notification (both email and SMS)"""
        # Queue SMS if phone exists
        if phone:
            sms_task_id = queue_sms(
                phone=phone,
                message="",  # Will use template from sms_service
                notification_type='student_credentials',
                student_name=name,
                username=username,
                password=password
            )
            if sms_task_id:
                sms_queued += 1
            else:
                sms_failed += 1
        
        # Queue email if email exists
        if email:
            email_task_id = queue_email(
                email=email,
                subject="Welcome to Campus Recruitment & Training - Your Student Credentials",
                content="",  # Will be generated from template
                template_name='student_credentials.html',
                template_params={
                    'name': name,
                    'username': username,
                    'email': email,
                    'password': password,
                    'login_url': "https://crt.pydahsoft.in/login"
                }
            )
            if email_task_id:
                email_queued += 1
            else:
                email_failed += 1
    
    def _process_email_only_notification(self, name: str, email: str, 
                                       username: str, password: str,
                                       email_queued: int, email_failed: int):
        """Process email-only notification (no SMS)"""
        # Queue email if email exists
        if email:
            email_task_id = queue_email(
                email=email,
                subject="Welcome to Study Edge - Your Student Credentials",
                content="",  # Will be generated from template
                template_name='student_credentials.html',
                template_params={
                    'name': name,
                    'username': username,
                    'email': email,
                    'password': password,
                    'login_url': "https://crt.pydahsoft.in/login"
                }
            )
            if email_task_id:
                email_queued += 1
            else:
                email_failed += 1
    
    def _process_test_notification(self, name: str, email: str, phone: str, 
                                 test_data: Dict, sms_queued: int, email_queued: int, 
                                 sms_failed: int, email_failed: int):
        """Process test notification"""
        test_id = test_data['test_id']  # Custom test_id for SMS
        object_id = test_data['object_id']  # MongoDB _id for emails
        test_name = test_data['test_name']
        start_date = test_data['start_date']
        
        # Queue SMS if phone exists (use custom test_id for URL)
        if phone:
            # Format start_date to IST readable format
            formatted_start_date = format_date_to_ist(start_date, 'readable')
            sms_message = f"A new test {test_name} has been scheduled at {formatted_start_date} for you. Please make sure to attempt it within 24hours. exam link: https://crt.pydahsoft.in/student/exam/ {test_id} - Pydah College"
            sms_task_id = queue_sms(
                phone=phone,
                message=sms_message,
                notification_type='test_notification',
                student_name=name
            )
            if sms_task_id:
                sms_queued += 1
            else:
                sms_failed += 1
        
        # Queue email if email exists (use MongoDB _id for URL)
        if email:
            email_task_id = queue_email(
                email=email,
                subject=f"New Test Scheduled: {test_name}",
                content="",  # Will be generated from template
                template_name='test_notification.html',
                template_params={
                    'name': name,
                    'test_name': test_name,
                    'test_id': test_id,  # Custom test_id for display
                    'object_id': object_id,  # MongoDB _id for URL
                    'start_date': format_date_to_ist(start_date, 'readable'),  # Format to IST
                    'test_url': f"https://crt.pydahsoft.in/student/exam/{object_id}"  # Use _id for URL
                }
            )
            if email_task_id:
                email_queued += 1
            else:
                email_failed += 1
    
    def _cleanup_completed_batches(self):
        """Clean up completed or failed batches older than 1 hour"""
        current_time = datetime.now()
        batches_to_remove = []
        
        with self.batch_lock:
            for batch_id, batch_info in self.active_batches.items():
                if batch_info['status'] in ['completed', 'failed']:
                    # Remove batches older than 1 hour
                    if (current_time - batch_info['created_at']).total_seconds() > 3600:
                        batches_to_remove.append(batch_id)
        
        for batch_id in batches_to_remove:
            del self.active_batches[batch_id]
            logger.info(f"🗑️ Cleaned up old batch {batch_id}")
    
    def get_batch_status(self, batch_id: str) -> Optional[Dict]:
        """Get status of a specific batch"""
        with self.batch_lock:
            batch_info = self.active_batches.get(batch_id)
            if not batch_info:
                return None
            
            return {
                'batch_id': batch_id,
                'status': batch_info['status'],
                'total_students': batch_info['total_students'],
                'current_sub_batch': batch_info['current_sub_batch'],
                'total_sub_batches': batch_info['total_sub_batches'],
                'progress_percentage': int((batch_info['current_sub_batch'] / batch_info['total_sub_batches']) * 100),
                'results': batch_info['results'],
                'created_at': batch_info['created_at'].isoformat(),
                'last_processed': batch_info['last_processed'].isoformat() if batch_info['last_processed'] else None,
                'retry_count': batch_info['retry_count']
            }
    
    def get_all_batches_status(self) -> Dict:
        """Get status of all active batches"""
        with self.batch_lock:
            return {
                'active_batches': len(self.active_batches),
                'batches': [
                    self.get_batch_status(batch_id) 
                    for batch_id in self.active_batches.keys()
                ]
            }

# Global batch processor instance
batch_processor = BatchProcessor()

def start_batch_processor():
    """Start the global batch processor"""
    batch_processor.start_processor()

def stop_batch_processor():
    """Stop the global batch processor"""
    batch_processor.stop_processor()

def create_credentials_batch_job(students: List[Dict], 
                               batch_size: int = 100, 
                               interval_minutes: int = 3) -> Dict:
    """Create a new credentials batch job (both email and SMS)"""
    return batch_processor.create_credentials_batch_job(students, batch_size, interval_minutes)

def create_email_only_batch_job(students: List[Dict], 
                              batch_size: int = 100, 
                              interval_minutes: int = 3) -> Dict:
    """Create a new email-only batch job (no SMS)"""
    return batch_processor.create_email_only_batch_job(students, batch_size, interval_minutes)

def create_test_notification_batch_job(test_id: str, object_id: str, test_name: str, 
                                     start_date: str, students: List[Dict],
                                     batch_size: int = 100, 
                                     interval_minutes: int = 3) -> Dict:
    """Create a new test notification batch job"""
    return batch_processor.create_test_notification_batch_job(
        test_id, object_id, test_name, start_date, students, batch_size, interval_minutes
    )

def get_batch_status(batch_id: str) -> Optional[Dict]:
    """Get batch status"""
    return batch_processor.get_batch_status(batch_id)

def get_all_batches_status() -> Dict:
    """Get all batches status"""
    return batch_processor.get_all_batches_status()

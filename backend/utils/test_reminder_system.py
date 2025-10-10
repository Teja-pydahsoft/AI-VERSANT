#!/usr/bin/env python3
"""
Test Reminder System for Study Edge Apex
Handles automated SMS reminders for unattempted tests
"""

import os
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from bson import ObjectId
from mongo import mongo_db
from utils.sms_service import send_test_reminder_sms, send_test_scheduled_sms
from utils.date_formatter import format_date_to_ist
from services.test_notification_service import test_notification_service
# Make email service import optional
try:
    from utils.email_service import send_test_notification_email
    EMAIL_AVAILABLE = True
except ImportError:
    EMAIL_AVAILABLE = False
    def send_test_notification_email(*args, **kwargs):
        logger.warning("Email service not available - skipping email notification")
        return False

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class TestReminderSystem:
    def __init__(self):
        self.db = mongo_db
        self.reminder_intervals = [6, 12, 24]  # Hours after test start
        self.reminder_frequency = 6  # Hours between reminders after 24h
        
    def get_students_for_test(self, test_id: str) -> List[Dict]:
        """Get all students assigned to a specific test"""
        try:
            # Get test details
            test = self.db.tests.find_one({'_id': ObjectId(test_id)})
            if not test:
                logger.error(f"Test {test_id} not found")
                return []
            
            # Get online exam details
            online_exam = self.db.online_exams.find_one({'test_id': ObjectId(test_id)})
            if not online_exam:
                logger.error(f"Online exam for test {test_id} not found")
                return []
            
            # Get students from assigned batches and courses
            students = []
            
            # Get students from batches
            if online_exam.get('batch_ids'):
                batch_students = self.db.students.find({
                    'batch_id': {'$in': online_exam['batch_ids']}
                })
                students.extend(list(batch_students))
            
            # Get students from courses
            if online_exam.get('course_ids'):
                course_students = self.db.students.find({
                    'course_id': {'$in': online_exam['course_ids']}
                })
                students.extend(list(course_students))
            
            # Remove duplicates
            unique_students = []
            seen_emails = set()
            for student in students:
                if student.get('email') not in seen_emails:
                    unique_students.append(student)
                    seen_emails.add(student.get('email'))
            
            logger.info(f"Found {len(unique_students)} students for test {test_id}")
            return unique_students
            
        except Exception as e:
            logger.error(f"Error getting students for test {test_id}: {e}")
            return []
    
    def get_unattempted_students(self, test_id: str) -> List[Dict]:
        """Get students who haven't attempted the test yet"""
        try:
            students = self.get_students_for_test(test_id)
            unattempted = []
            
            for student in students:
                # Check if student has attempted the test
                attempt = self.db.student_test_attempts.find_one({
                    'student_id': student['_id'],
                    'test_id': ObjectId(test_id),
                    'status': {'$in': ['completed', 'in_progress']}
                })
                
                if not attempt:
                    unattempted.append(student)
            
            logger.info(f"Found {len(unattempted)} unattempted students for test {test_id}")
            return unattempted
            
        except Exception as e:
            logger.error(f"Error getting unattempted students for test {test_id}: {e}")
            return []
    
    def send_test_scheduled_sms(self, test_id: str) -> Dict:
        """Send test scheduled SMS to all assigned students"""
        try:
            # Get test and online exam details
            test = self.db.tests.find_one({'_id': ObjectId(test_id)})
            online_exam = self.db.online_exams.find_one({'test_id': ObjectId(test_id)})
            
            if not test or not online_exam:
                return {'success': False, 'error': 'Test or online exam not found'}
            
            # Get students
            students = self.get_students_for_test(test_id)
            if not students:
                return {'success': False, 'error': 'No students found for test'}
            
            # Prepare test details
            test_name = test.get('name', 'Unknown Test')
            start_time = online_exam.get('start_date', datetime.now())
            if isinstance(start_time, str):
                start_time = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
            
            # Format start time to IST readable format
            start_time_str = format_date_to_ist(start_time, 'readable')
            
            # Send SMS to all students
            results = []
            for student in students:
                if student.get('mobile'):
                    try:
                        result = send_test_scheduled_sms(
                            phone_number=student['mobile'],
                            test_name=test_name,
                            start_time=start_time_str,
                            test_id=test_id
                        )
                        results.append({
                            'student_id': str(student['_id']),
                            'student_name': student.get('name', 'Unknown'),
                            'mobile': student['mobile'],
                            'sms_result': result
                        })
                    except Exception as e:
                        logger.error(f"Error sending SMS to {student.get('name')}: {e}")
                        results.append({
                            'student_id': str(student['_id']),
                            'student_name': student.get('name', 'Unknown'),
                            'mobile': student['mobile'],
                            'sms_result': {'success': False, 'error': str(e)}
                        })
            
            # Also send email notifications if available
            if EMAIL_AVAILABLE:
                try:
                    for student in students:
                        if student.get('email'):
                            send_test_notification_email(
                                student_email=student['email'],
                                student_name=student.get('name', 'Student'),
                                test_name=test_name,
                                test_type=test.get('test_type', 'Online Test'),
                                login_url=exam_link
                            )
                except Exception as e:
                    logger.error(f"Error sending email notifications: {e}")
            else:
                logger.info("Email service not available - skipping email notifications")
            
            successful_sms = sum(1 for r in results if r['sms_result'].get('success', False))
            
            return {
                'success': True,
                'total_students': len(students),
                'successful_sms': successful_sms,
                'results': results
            }
            
        except Exception as e:
            logger.error(f"Error sending test scheduled SMS: {e}")
            return {'success': False, 'error': str(e)}
    
    async def send_test_reminders(self, test_id: str) -> Dict:
        """Send test reminders to unattempted students through SMS and push notifications"""
        try:
            # Get test and online exam details
            test = self.db.tests.find_one({'_id': ObjectId(test_id)})
            online_exam = self.db.online_exams.find_one({'test_id': ObjectId(test_id)})
            
            if not test or not online_exam:
                return {'success': False, 'error': 'Test or online exam not found'}
                
            # Base URL for exam link
            exam_link = f"https://crt.pydahsoft.in/student/exam/{test_id}"
            
            # Check if test is still active
            now = datetime.now()
            start_time = online_exam.get('start_date', now)
            end_time = online_exam.get('end_date', now)
            
            if isinstance(start_time, str):
                start_time = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
            if isinstance(end_time, str):
                end_time = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
            
            # Check if test has ended
            if now > end_time:
                logger.info(f"Test {test_id} has ended, no reminders needed")
                return {'success': True, 'message': 'Test has ended'}
            
            # Get unattempted students
            unattempted_students = self.get_unattempted_students(test_id)
            if not unattempted_students:
                logger.info(f"All students have attempted test {test_id}")
                return {'success': True, 'message': 'All students have attempted the test'}
            
            # Prepare test details
            test_name = test.get('name', 'Unknown Test')
            exam_link = f"https://crt.pydahsoft.in/student/exam/{test_id}"
            
            # Send reminder SMS to unattempted students
            results = []
            for student in unattempted_students:
                if student.get('mobile'):
                    try:
                        result = send_test_reminder_sms(
                            phone_number=student['mobile'],
                            test_name=test_name,
                            test_id=test_id
                        )
                        results.append({
                            'student_id': str(student['_id']),
                            'student_name': student.get('name', 'Unknown'),
                            'mobile': student['mobile'],
                            'sms_result': result
                        })
                    except Exception as e:
                        logger.error(f"Error sending reminder SMS to {student.get('name')}: {e}")
                        results.append({
                            'student_id': str(student['_id']),
                            'student_name': student.get('name', 'Unknown'),
                            'mobile': student['mobile'],
                            'sms_result': {'success': False, 'error': str(e)}
                        })
            
            successful_sms = sum(1 for r in results if r['sms_result'].get('success', False))
            
            # Send push notifications through both OneSignal and VAPID
            student_ids = [str(student['_id']) for student in unattempted_students]
            
            # Send through OneSignal
            onesignal_result = test_notification_service.send_test_reminder(test, student_ids)
            
            # Send through VAPID
            from services.vapid_push_service import vapid_service
            vapid_result = await vapid_service.send_test_reminder(test, student_ids)
            
            return {
                'success': True,
                'total_unattempted': len(unattempted_students),
                'successful_sms': successful_sms,
                'onesignal': {
                    'success': onesignal_result.get('success', False),
                    'recipients': onesignal_result.get('recipients', 0)
                },
                'vapid': {
                    'success': vapid_result.get('success', False),
                    'recipients': vapid_result.get('successful', 0)
                },
                'results': results
            }
            
        except Exception as e:
            logger.error(f"Error sending test reminders: {e}")
            return {'success': False, 'error': str(e)}
    
    def should_send_reminder(self, test_id: str) -> bool:
        """Check if reminders should be sent for a test"""
        try:
            online_exam = self.db.online_exams.find_one({'test_id': ObjectId(test_id)})
            if not online_exam:
                return False
            
            now = datetime.now()
            start_time = online_exam.get('start_date', now)
            end_time = online_exam.get('end_date', now)
            
            if isinstance(start_time, str):
                start_time = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
            if isinstance(end_time, str):
                end_time = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
            
            # Check if test has started and not ended
            if now < start_time or now > end_time:
                return False
            
            # Check if enough time has passed since start
            time_since_start = now - start_time
            hours_since_start = time_since_start.total_seconds() / 3600
            
            # Send reminders at 6h, 12h, 24h, then every 6h
            if hours_since_start >= 6:
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Error checking reminder condition: {e}")
            return False
    
    def process_all_active_tests(self) -> Dict:
        """Process reminders for all active tests"""
        try:
            now = datetime.now()
            
            # Get all active online exams
            active_exams = self.db.online_exams.find({
                'start_date': {'$lte': now},
                'end_date': {'$gte': now},
                'status': 'active'
            })
            
            results = []
            for exam in active_exams:
                test_id = str(exam['test_id'])
                
                if self.should_send_reminder(test_id):
                    logger.info(f"Processing reminders for test {test_id}")
                    result = self.send_test_reminders(test_id)
                    results.append({
                        'test_id': test_id,
                        'test_name': exam.get('name', 'Unknown'),
                        'result': result
                    })
            
            return {
                'success': True,
                'processed_tests': len(results),
                'results': results
            }
            
        except Exception as e:
            logger.error(f"Error processing active tests: {e}")
            return {'success': False, 'error': str(e)}

# Global instance
reminder_system = TestReminderSystem()

def send_test_scheduled_notifications(test_id: str) -> Dict:
    """Send test scheduled notifications (SMS + Email)"""
    return reminder_system.send_test_scheduled_sms(test_id)

async def send_test_reminder_notifications(test_id: str) -> Dict:
    """Send test reminder notifications"""
    return await reminder_system.send_test_reminders(test_id)

def process_all_reminders() -> Dict:
    """Process all pending reminders"""
    return reminder_system.process_all_active_tests()

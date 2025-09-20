#!/usr/bin/env python3
"""
Manual Student Notifications Script
Comprehensive script to send credentials, test notifications, and reminders to students
based on campus, course, and batch selection.
"""

import os
import sys
import json
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
from bson import ObjectId
import secrets
import string

# Add the backend directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from mongo import mongo_db
from utils.email_service import send_email, render_template, check_email_configuration
from utils.sms_service import send_student_credentials_sms, send_test_reminder_sms, send_test_scheduled_sms

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('student_notifications.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class StudentNotificationManager:
    """Comprehensive student notification management system"""
    
    def __init__(self):
        self.db = mongo_db
        self.email_config_ok = check_email_configuration()
        self.login_url = "https://crt.pydahsoft.in/login"
        
    def get_campuses(self) -> List[Dict]:
        """Get all campuses"""
        try:
            campuses = list(self.db.campuses.find({}, {'name': 1, '_id': 1}))
            return [{'id': str(c['_id']), 'name': c['name']} for c in campuses]
        except Exception as e:
            logger.error(f"Error fetching campuses: {e}")
            return []
    
    def get_courses(self, campus_id: str = None) -> List[Dict]:
        """Get courses, optionally filtered by campus"""
        try:
            query = {}
            if campus_id:
                query['campus_id'] = ObjectId(campus_id)
            
            courses = list(self.db.courses.find(query, {'name': 1, '_id': 1, 'campus_id': 1}))
            return [{'id': str(c['_id']), 'name': c['name'], 'campus_id': str(c.get('campus_id', ''))} for c in courses]
        except Exception as e:
            logger.error(f"Error fetching courses: {e}")
            return []
    
    def get_batches(self, campus_id: str = None, course_id: str = None) -> List[Dict]:
        """Get batches, optionally filtered by campus and course"""
        try:
            query = {}
            if campus_id:
                query['campus_ids'] = ObjectId(campus_id)
            if course_id:
                query['course_ids'] = ObjectId(course_id)
            
            batches = list(self.db.batches.find(query, {
                'name': 1, '_id': 1, 'campus_ids': 1, 'course_ids': 1
            }))
            
            batch_list = []
            for batch in batches:
                # Get campus and course details
                campus_objs = list(self.db.campuses.find({'_id': {'$in': batch.get('campus_ids', [])}}))
                course_objs = list(self.db.courses.find({'_id': {'$in': batch.get('course_ids', [])}}))
                
                batch_list.append({
                    'id': str(batch['_id']), 
                    'name': batch['name'],
                    'campus_ids': [str(c['_id']) for c in campus_objs],
                    'course_ids': [str(c['_id']) for c in course_objs],
                    'campus_names': [c['name'] for c in campus_objs],
                    'course_names': [c['name'] for c in course_objs]
                })
            
            return batch_list
        except Exception as e:
            logger.error(f"Error fetching batches: {e}")
            return []
    
    def get_students(self, campus_id: str = None, course_id: str = None, batch_id: str = None) -> List[Dict]:
        """Get students filtered by campus, course, and batch"""
        try:
            query = {'role': 'student', 'is_active': True}
            
            if campus_id:
                query['campus_id'] = ObjectId(campus_id)
            if course_id:
                query['course_id'] = ObjectId(course_id)
            if batch_id:
                query['batch_id'] = ObjectId(batch_id)
            
            students = list(self.db.users.find(query, {
                'name': 1, 'email': 1, 'mobile_number': 1, 'phone_number': 1, 'username': 1, 
                'campus_id': 1, 'course_id': 1, 'batch_id': 1, '_id': 1
            }))
            
            # Get student profiles for roll numbers
            student_data = []
            for student in students:
                profile = self.db.students.find_one({'user_id': student['_id']})
                student['roll_number'] = profile.get('roll_number', '') if profile else ''
                student['id'] = str(student['_id'])
                
                # Ensure phone number is available in both field names for compatibility
                phone_number = student.get('mobile_number') or student.get('phone_number') or ''
                student['mobile_number'] = phone_number
                student['phone_number'] = phone_number
                
                student_data.append(student)
            
            return student_data
        except Exception as e:
            logger.error(f"Error fetching students: {e}")
            return []
    
    def get_student_tests(self, student_id: str) -> List[Dict]:
        """Get tests assigned to a specific student"""
        try:
            # Get tests where student is assigned
            tests = list(self.db.tests.find({
                'assigned_student_ids': ObjectId(student_id)
            }, {
                'name': 1, 'test_type': 1, 'module_id': 1, 'level_id': 1, 
                'startDateTime': 1, 'endDateTime': 1, '_id': 1
            }))
            
            # Get online exams for these tests
            test_data = []
            for test in tests:
                online_exam = self.db.online_exams.find_one({'test_id': test['_id']})
                test['online_exam'] = online_exam
                test['id'] = str(test['_id'])
                test_data.append(test)
            
            return test_data
        except Exception as e:
            logger.error(f"Error fetching student tests: {e}")
            return []
    
    def get_unattempted_tests(self, student_id: str) -> List[Dict]:
        """Get unattempted tests for a student"""
        try:
            # Get all tests assigned to student
            tests = self.get_student_tests(student_id)
            unattempted = []
            
            for test in tests:
                # Check if student has attempted this test
                attempt = self.db.test_attempts.find_one({
                    'student_id': ObjectId(student_id),
                    'test_id': ObjectId(test['id'])
                })
                
                if not attempt:
                    # Check if test is still active
                    online_exam = test.get('online_exam')
                    if online_exam:
                        now = datetime.now()
                        end_time = online_exam.get('end_date', now)
                        
                        if isinstance(end_time, str):
                            end_time = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
                        
                        if now <= end_time:
                            unattempted.append(test)
            
            return unattempted
        except Exception as e:
            logger.error(f"Error fetching unattempted tests: {e}")
            return []
    
    def generate_password(self, student_name: str, roll_number: str) -> str:
        """Generate password using consistent pattern"""
        try:
            if student_name and roll_number:
                first_name = student_name.split()[0] if student_name.split() else student_name
                return f"{first_name[:4].lower()}{roll_number[-4:]}"
            else:
                # Fallback to random password
                return ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(8))
        except Exception as e:
            logger.error(f"Error generating password: {e}")
            return ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(8))
    
    def send_welcome_email(self, student: Dict) -> Dict:
        """Send welcome email with credentials to student"""
        try:
            # Generate password using the same pattern as during upload
            password = self.generate_password(student['name'], student.get('roll_number', ''))
            username = student.get('username', student.get('roll_number', ''))
            
            # Log credentials before sending email
            print(f"📧 Sending to: {student['name']} ({student['email']})")
            print(f"   Username: {username}")
            print(f"   Password: {password}")
            print(f"   Roll Number: {student.get('roll_number', 'N/A')}")
            print("-" * 50)
            
            # Render email template
            html_content = render_template(
                'student_credentials.html',
                params={
                    'name': student['name'],
                    'username': username,
                    'email': student['email'],
                    'password': password,
                    'login_url': self.login_url
                }
            )
            
            # Send email
            email_sent = send_email(
                to_email=student['email'],
                to_name=student['name'],
                subject="Welcome to VERSANT - Your Student Credentials",
                html_content=html_content
            )
            
            if email_sent:
                print(f"✅ Email sent successfully to {student['name']}")
            else:
                print(f"❌ Failed to send email to {student['name']}")
            
            return {
                'success': email_sent,
                'password': password,
                'error': None if email_sent else 'Email sending failed'
            }
            
        except Exception as e:
            logger.error(f"Error sending welcome email to {student['email']}: {e}")
            print(f"❌ Error sending email to {student['name']}: {e}")
            return {
                'success': False,
                'password': None,
                'error': str(e)
            }
    
    def send_test_notification_email(self, student: Dict, test: Dict) -> Dict:
        """Send test notification email to student"""
        try:
            # Log test notification details
            print(f"📝 Test Notification to: {student['name']} ({student['email']})")
            print(f"   Test: {test['name']}")
            print(f"   Type: {test.get('test_type', 'Unknown')}")
            print(f"   Module: {test.get('module_id', 'Unknown')}")
            print(f"   Level: {test.get('level_id', 'Unknown')}")
            print("-" * 50)
            
            # Render test notification template
            html_content = render_template(
                'test_notification.html',
                student_name=student['name'],
                test_name=test['name'],
                test_id=test['id'],
                test_type=test.get('test_type', 'Unknown'),
                module=test.get('module_id', 'Unknown'),
                level=test.get('level_id', 'Unknown'),
                module_display_name=test.get('module_id', 'Unknown'),
                level_display_name=test.get('level_id', 'Unknown'),
                question_count=len(test.get('questions', [])),
                is_online=test.get('test_type') == 'online',
                start_dt=test.get('startDateTime', 'Not specified'),
                end_dt=test.get('endDateTime', 'Not specified')
            )
            
            # Send email
            email_sent = send_email(
                to_email=student['email'],
                to_name=student['name'],
                subject=f"New Test Assigned: {test['name']}",
                html_content=html_content
            )
            
            if email_sent:
                print(f"✅ Test notification sent successfully to {student['name']}")
            else:
                print(f"❌ Failed to send test notification to {student['name']}")
            
            return {
                'success': email_sent,
                'error': None if email_sent else 'Email sending failed'
            }
            
        except Exception as e:
            logger.error(f"Error sending test notification to {student['email']}: {e}")
            print(f"❌ Error sending test notification to {student['name']}: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def send_exam_reminder_email(self, student: Dict, test: Dict) -> Dict:
        """Send exam reminder email to student"""
        try:
            # Log exam reminder details
            print(f"⏰ Exam Reminder to: {student['name']} ({student['email']})")
            print(f"   Test: {test['name']} (Reminder)")
            print(f"   Type: {test.get('test_type', 'Unknown')}")
            print(f"   Module: {test.get('module_id', 'Unknown')}")
            print(f"   Level: {test.get('level_id', 'Unknown')}")
            print("-" * 50)
            
            # Use test notification template for reminders
            html_content = render_template(
                'test_notification.html',
                student_name=student['name'],
                test_name=f"{test['name']} (Reminder)",
                test_id=test['id'],
                test_type=test.get('test_type', 'Unknown'),
                module=test.get('module_id', 'Unknown'),
                level=test.get('level_id', 'Unknown'),
                module_display_name=test.get('module_id', 'Unknown'),
                level_display_name=test.get('level_id', 'Unknown'),
                question_count=len(test.get('questions', [])),
                is_online=test.get('test_type') == 'online',
                start_dt=test.get('startDateTime', 'Not specified'),
                end_dt=test.get('endDateTime', 'Not specified')
            )
            
            # Send email
            email_sent = send_email(
                to_email=student['email'],
                to_name=student['name'],
                subject=f"Reminder: Complete Your Test - {test['name']}",
                html_content=html_content
            )
            
            if email_sent:
                print(f"✅ Exam reminder sent successfully to {student['name']}")
            else:
                print(f"❌ Failed to send exam reminder to {student['name']}")
            
            return {
                'success': email_sent,
                'error': None if email_sent else 'Email sending failed'
            }
            
        except Exception as e:
            logger.error(f"Error sending exam reminder to {student['email']}: {e}")
            print(f"❌ Error sending exam reminder to {student['name']}: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def send_credentials_sms(self, student: Dict, password: str) -> Dict:
        """Send credentials SMS to student"""
        try:
            # Check for both possible field names
            phone_number = student.get('mobile_number') or student.get('phone_number')
            if not phone_number:
                return {'success': False, 'error': 'No mobile number available'}
            
            sms_result = send_student_credentials_sms(
                phone=phone_number,
                student_name=student['name'],
                username=student.get('username', student.get('roll_number', '')),
                password=password,
                login_url=self.login_url
            )
            
            return sms_result
            
        except Exception as e:
            logger.error(f"Error sending credentials SMS to {student.get('mobile_number', student.get('phone_number', 'N/A'))}: {e}")
            return {'success': False, 'error': str(e)}
    
    def send_sms_only_credentials(self, student: Dict) -> Dict:
        """Send SMS-only credentials to student (no email)"""
        try:
            # Generate password using the same pattern as during upload
            password = self.generate_password(student['name'], student.get('roll_number', ''))
            username = student.get('username', student.get('roll_number', ''))
            
            # Check for both possible field names
            phone_number = student.get('mobile_number') or student.get('phone_number')
            if not phone_number:
                return {
                    'success': False, 
                    'password': password,
                    'error': 'No mobile number available'
                }
            
            # Log credentials before sending SMS
            print(f"📱 Sending SMS to: {student['name']} ({phone_number})")
            print(f"   Username: {username}")
            print(f"   Password: {password}")
            print(f"   Roll Number: {student.get('roll_number', 'N/A')}")
            print("-" * 50)
            
            sms_result = send_student_credentials_sms(
                phone=phone_number,
                student_name=student['name'],
                username=username,
                password=password,
                login_url=self.login_url
            )
            
            if sms_result['success']:
                print(f"✅ SMS sent successfully to {student['name']}")
            else:
                print(f"❌ Failed to send SMS to {student['name']}: {sms_result.get('error', 'Unknown error')}")
            
            return {
                'success': sms_result['success'],
                'password': password,
                'error': sms_result.get('error') if not sms_result['success'] else None
            }
            
        except Exception as e:
            logger.error(f"Error sending SMS-only credentials to {student.get('mobile_number', student.get('phone_number', 'N/A'))}: {e}")
            print(f"❌ Error sending SMS to {student['name']}: {e}")
            return {
                'success': False,
                'password': password if 'password' in locals() else None,
                'error': str(e)
            }
    
    def send_test_scheduled_sms(self, student: Dict, test: Dict) -> Dict:
        """Send test scheduled SMS to student"""
        try:
            # Check for both possible field names
            phone_number = student.get('mobile_number') or student.get('phone_number')
            if not phone_number:
                return {'success': False, 'error': 'No mobile number available'}
            
            exam_link = f"{self.login_url}?redirect=/student/online-exams/{test['id']}"
            start_time = test.get('start_time', 'TBD')
            campus_name = "Campus"  # You can get this from student data if needed
            
            sms_result = send_test_scheduled_sms(
                phone_number=phone_number,
                test_name=test['name'],
                start_time=start_time,
                test_id=test['id']
            )
            
            return sms_result
            
        except Exception as e:
            logger.error(f"Error sending test scheduled SMS to {student.get('mobile_number', student.get('phone_number', 'N/A'))}: {e}")
            return {'success': False, 'error': str(e)}
    
    def send_test_reminder_sms(self, student: Dict, test: Dict) -> Dict:
        """Send test reminder SMS to student"""
        try:
            # Check for both possible field names
            phone_number = student.get('mobile_number') or student.get('phone_number')
            if not phone_number:
                return {'success': False, 'error': 'No mobile number available'}
            
            exam_link = f"{self.login_url}?redirect=/student/online-exams/{test['id']}"
            
            sms_result = send_test_reminder_sms(
                phone_number=phone_number,
                test_name=test['name'],
                test_id=test['id']
            )
            
            return sms_result
            
        except Exception as e:
            logger.error(f"Error sending test reminder SMS to {student.get('mobile_number', student.get('phone_number', 'N/A'))}: {e}")
            return {'success': False, 'error': str(e)}
    
    def process_students(self, students: List[Dict], action: str, test_id: str = None) -> Dict:
        """Process students for the specified action"""
        results = {
            'total_students': len(students),
            'successful': 0,
            'failed': 0,
            'results': []
        }
        
        print(f"\n🚀 Starting to process {len(students)} students...")
        print("=" * 60)
        
        for i, student in enumerate(students):
            logger.info(f"Processing student {i+1}/{len(students)}: {student['name']}")
            
            result = {
                'student_id': student['id'],
                'name': student['name'],
                'email': student['email'],
                'mobile_number': student.get('mobile_number') or student.get('phone_number', ''),
                'success': False,
                'error': None
            }
            
            try:
                if action == 'welcome_email':
                    # Check if student has email before sending welcome email
                    if not student.get('email'):
                        result['success'] = False
                        result['error'] = 'No email address available - skipping email'
                        result['skipped_email'] = True
                        print(f"⚠️  Skipping email for {student['name']} - no email address")
                    else:
                        email_result = self.send_welcome_email(student)
                        result['success'] = email_result['success']
                        result['error'] = email_result['error']
                        result['password'] = email_result['password']
                    
                    # Always try to send SMS if student has phone number (regardless of email success)
                    phone_number = student.get('mobile_number') or student.get('phone_number')
                    if phone_number:
                        # Use password from email if available, otherwise generate new one
                        password = result.get('password') or self.generate_password(student['name'], student.get('roll_number', ''))
                        sms_result = self.send_credentials_sms(student, password)
                        result['sms_sent'] = sms_result['success']
                        result['sms_error'] = sms_result.get('error')
                        if sms_result['success']:
                            print(f"📱 SMS sent to {student['name']} ({phone_number})")
                        else:
                            print(f"❌ SMS failed for {student['name']}: {sms_result.get('error', 'Unknown error')}")
                    else:
                        result['sms_sent'] = False
                        result['sms_error'] = 'No mobile number available'
                        print(f"⚠️  No mobile number for {student['name']} - skipping SMS")
                    
                elif action == 'sms_only_credentials':
                    sms_result = self.send_sms_only_credentials(student)
                    result['success'] = sms_result['success']
                    result['error'] = sms_result['error']
                    result['password'] = sms_result['password']
                    
                elif action == 'test_notification' and test_id:
                    test = self.db.tests.find_one({'_id': ObjectId(test_id)})
                    if test:
                        test['id'] = str(test['_id'])
                        email_result = self.send_test_notification_email(student, test)
                        result['success'] = email_result['success']
                        result['error'] = email_result['error']
                        
                        # Also send SMS if email was successful
                        if email_result['success'] and student.get('mobile_number'):
                            sms_result = self.send_test_scheduled_sms(student, test)
                            result['sms_sent'] = sms_result['success']
                            result['sms_error'] = sms_result.get('error')
                            if sms_result['success']:
                                print(f"📱 Test notification SMS sent to {student['name']} ({student['mobile_number']})")
                            else:
                                print(f"❌ Test notification SMS failed for {student['name']}: {sms_result.get('error', 'Unknown error')}")
                    else:
                        result['error'] = 'Test not found'
                        
                elif action == 'exam_reminder' and test_id:
                    test = self.db.tests.find_one({'_id': ObjectId(test_id)})
                    if test:
                        test['id'] = str(test['_id'])
                        email_result = self.send_exam_reminder_email(student, test)
                        result['success'] = email_result['success']
                        result['error'] = email_result['error']
                        
                        # Also send SMS if email was successful
                        if email_result['success'] and student.get('mobile_number'):
                            sms_result = self.send_test_reminder_sms(student, test)
                            result['sms_sent'] = sms_result['success']
                            result['sms_error'] = sms_result.get('error')
                            if sms_result['success']:
                                print(f"📱 Exam reminder SMS sent to {student['name']} ({student['mobile_number']})")
                            else:
                                print(f"❌ Exam reminder SMS failed for {student['name']}: {sms_result.get('error', 'Unknown error')}")
                    else:
                        result['error'] = 'Test not found'
                
                if result['success']:
                    results['successful'] += 1
                else:
                    results['failed'] += 1
                    
            except Exception as e:
                result['error'] = str(e)
                results['failed'] += 1
                logger.error(f"Error processing student {student['name']}: {e}")
                print(f"❌ Error processing {student['name']}: {e}")
            
            results['results'].append(result)
        
        # Print summary
        print("\n" + "=" * 60)
        print("📊 PROCESSING SUMMARY")
        print("=" * 60)
        print(f"Total Students: {results['total_students']}")
        print(f"Successful: {results['successful']}")
        print(f"Failed: {results['failed']}")
        
        # Count SMS statistics
        sms_sent = sum(1 for r in results['results'] if r.get('sms_sent', False))
        sms_failed = sum(1 for r in results['results'] if r.get('sms_sent') == False and (r.get('mobile_number') or r.get('phone_number')))
        
        if sms_sent > 0 or sms_failed > 0:
            print(f"\n📱 SMS STATISTICS:")
            print(f"SMS Sent: {sms_sent}")
            print(f"SMS Failed: {sms_failed}")
        
        if action == 'welcome_email' and results['successful'] > 0:
            print(f"\n📋 CREDENTIALS SENT:")
            print("-" * 40)
            for result in results['results']:
                if result['success'] and 'password' in result:
                    print(f"✅ {result['name']} ({result['email']})")
                    print(f"   Username: {result.get('username', 'N/A')}")
                    print(f"   Password: {result['password']}")
                    phone_number = result.get('mobile_number') or result.get('phone_number')
                    if phone_number:
                        sms_status = "📱 SMS Sent" if result.get('sms_sent') else f"❌ SMS Failed: {result.get('sms_error', 'Unknown error')}"
                        print(f"   {sms_status}")
                    print()
        
        return results

def display_menu():
    """Display the main menu"""
    print("\n" + "="*60)
    print("🎓 VERSANT Student Notification Manager")
    print("="*60)
    print("1. Send Welcome Emails + SMS (with credentials)")
    print("2. Send SMS Only - Credentials")
    print("3. Send Test Notifications + SMS")
    print("4. Send Exam Reminders + SMS")
    print("5. View Students by Filter")
    print("6. View Available Tests")
    print("7. Exit")
    print("="*60)

def get_user_selection(prompt: str, options: List[Dict], display_key: str = 'name') -> Optional[Dict]:
    """Get user selection from a list of options"""
    if not options:
        print("No options available.")
        return None
    
    print(f"\n{prompt}:")
    for i, option in enumerate(options, 1):
        print(f"{i}. {option[display_key]}")
    
    while True:
        try:
            choice = input(f"\nEnter your choice (1-{len(options)}): ").strip()
            if choice.lower() in ['q', 'quit', 'exit']:
                return None
            
            choice_num = int(choice)
            if 1 <= choice_num <= len(options):
                return options[choice_num - 1]
            else:
                print(f"Please enter a number between 1 and {len(options)}")
        except ValueError:
            print("Please enter a valid number")
        except KeyboardInterrupt:
            print("\nOperation cancelled.")
            return None

def main():
    """Main function"""
    print("🚀 Starting VERSANT Student Notification Manager...")
    
    # Initialize manager
    manager = StudentNotificationManager()
    
    # Check email configuration
    if not manager.email_config_ok:
        print("⚠️  Warning: Email service has configuration issues. Some features may not work.")
        print("   Please check your BREVO_API_KEY and SENDER_EMAIL environment variables.")
    
    while True:
        try:
            display_menu()
            choice = input("\nEnter your choice (1-7): ").strip()
            
            if choice == '1':
                # Send Welcome Emails
                print("\n📧 Welcome Email Sender")
                print("-" * 30)
                
                # Get filter criteria
                campuses = manager.get_campuses()
                if not campuses:
                    print("No campuses found.")
                    continue
                
                campus = get_user_selection("Select Campus", campuses)
                if not campus:
                    continue
                
                courses = manager.get_courses(campus['id'])
                if not courses:
                    print("No courses found for this campus.")
                    continue
                
                course = get_user_selection("Select Course", courses)
                if not course:
                    continue
                
                batches = manager.get_batches(campus['id'], course['id'])
                if not batches:
                    print("No batches found for this campus and course.")
                    continue
                
                batch = get_user_selection("Select Batch", batches)
                if not batch:
                    continue
                
                # Display batch details
                print(f"\nSelected Batch: {batch['name']}")
                print(f"Campus: {', '.join(batch.get('campus_names', []))}")
                print(f"Course: {', '.join(batch.get('course_names', []))}")
                
                # Get students
                students = manager.get_students(campus['id'], course['id'], batch['id'])
                if not students:
                    print("No students found for the selected criteria.")
                    continue
                
                print(f"\nFound {len(students)} students:")
                for student in students:
                    print(f"  - {student['name']} ({student['email']})")
                
                confirm = input(f"\nSend welcome emails to {len(students)} students? (y/N): ").strip().lower()
                if confirm == 'y':
                    print("\nSending welcome emails...")
                    results = manager.process_students(students, 'welcome_email')
                    
                    print(f"\n✅ Results:")
                    print(f"  Total: {results['total_students']}")
                    print(f"  Successful: {results['successful']}")
                    print(f"  Failed: {results['failed']}")
                    
                    if results['failed'] > 0:
                        print("\n❌ Failed emails:")
                        for result in results['results']:
                            if not result['success']:
                                print(f"  - {result['name']}: {result['error']}")
            
            elif choice == '2':
                # Send SMS Only - Credentials
                print("\n📱 SMS Only - Credentials Sender")
                print("-" * 30)
                
                # Get filter criteria
                campuses = manager.get_campuses()
                if not campuses:
                    print("No campuses found.")
                    continue
                
                campus = get_user_selection("Select Campus", campuses)
                if not campus:
                    continue
                
                courses = manager.get_courses(campus['id'])
                if not courses:
                    print("No courses found for this campus.")
                    continue
                
                course = get_user_selection("Select Course", courses)
                if not course:
                    continue
                
                batches = manager.get_batches(campus['id'], course['id'])
                if not batches:
                    print("No batches found for this campus and course.")
                    continue
                
                batch = get_user_selection("Select Batch", batches)
                if not batch:
                    continue
                
                # Display batch details
                print(f"\nSelected Batch: {batch['name']}")
                print(f"Campus: {', '.join(batch.get('campus_names', []))}")
                print(f"Course: {', '.join(batch.get('course_names', []))}")
                
                # Get students
                students = manager.get_students(campus['id'], course['id'], batch['id'])
                if not students:
                    print("No students found for the selected criteria.")
                    continue
                
                # Filter students who have mobile numbers
                students_with_mobile = [s for s in students if s.get('mobile_number') or s.get('phone_number')]
                students_without_mobile = [s for s in students if not (s.get('mobile_number') or s.get('phone_number'))]
                
                print(f"\nFound {len(students)} students:")
                print(f"  - {len(students_with_mobile)} students with mobile numbers")
                print(f"  - {len(students_without_mobile)} students without mobile numbers")
                
                if students_without_mobile:
                    print(f"\n⚠️  Students without mobile numbers (will be skipped):")
                    for student in students_without_mobile:
                        print(f"  - {student['name']} ({student['email']})")
                
                if not students_with_mobile:
                    print("No students with mobile numbers found.")
                    continue
                
                print(f"\nStudents with mobile numbers:")
                for student in students_with_mobile:
                    phone_display = student.get('mobile_number') or student.get('phone_number')
                    print(f"  - {student['name']} ({phone_display})")
                
                confirm = input(f"\nSend SMS credentials to {len(students_with_mobile)} students? (y/N): ").strip().lower()
                if confirm == 'y':
                    print("\nSending SMS credentials...")
                    results = manager.process_students(students_with_mobile, 'sms_only_credentials')
                    
                    print(f"\n✅ Results:")
                    print(f"  Total: {results['total_students']}")
                    print(f"  Successful: {results['successful']}")
                    print(f"  Failed: {results['failed']}")
                    
                    if results['failed'] > 0:
                        print("\n❌ Failed SMS:")
                        for result in results['results']:
                            if not result['success']:
                                print(f"  - {result['name']}: {result['error']}")
                    
                    if results['successful'] > 0:
                        print(f"\n📋 CREDENTIALS SENT VIA SMS:")
                        print("-" * 40)
                        for result in results['results']:
                            if result['success'] and 'password' in result:
                                print(f"✅ {result['name']} ({result['mobile_number']})")
                                print(f"   Username: {result.get('username', 'N/A')}")
                                print(f"   Password: {result['password']}")
                                print()
            
            elif choice == '3':
                # Send Test Notifications
                print("\n📝 Test Notification Sender")
                print("-" * 30)
                
                # Get students first
                campuses = manager.get_campuses()
                if not campuses:
                    print("No campuses found.")
                    continue
                
                campus = get_user_selection("Select Campus", campuses)
                if not campus:
                    continue
                
                courses = manager.get_courses(campus['id'])
                if not courses:
                    print("No courses found for this campus.")
                    continue
                
                course = get_user_selection("Select Course", courses)
                if not course:
                    continue
                
                batches = manager.get_batches(campus['id'], course['id'])
                if not batches:
                    print("No batches found for this campus and course.")
                    continue
                
                batch = get_user_selection("Select Batch", batches)
                if not batch:
                    continue
                
                # Display batch details
                print(f"\nSelected Batch: {batch['name']}")
                print(f"Campus: {', '.join(batch.get('campus_names', []))}")
                print(f"Course: {', '.join(batch.get('course_names', []))}")
                
                students = manager.get_students(campus['id'], course['id'], batch['id'])
                if not students:
                    print("No students found for the selected criteria.")
                    continue
                
                # Get tests for first student to show available tests
                if students:
                    student_tests = manager.get_student_tests(students[0]['id'])
                    if not student_tests:
                        print("No tests found for students in this batch.")
                        continue
                    
                    test = get_user_selection("Select Test to Notify", student_tests)
                    if not test:
                        continue
                    
                    # Filter students who have this test assigned
                    filtered_students = []
                    for student in students:
                        student_test_ids = [t['id'] for t in manager.get_student_tests(student['id'])]
                        if test['id'] in student_test_ids:
                            filtered_students.append(student)
                    
                    if not filtered_students:
                        print("No students have this test assigned.")
                        continue
                    
                    print(f"\nFound {len(filtered_students)} students with this test:")
                    for student in filtered_students:
                        print(f"  - {student['name']} ({student['email']})")
                    
                    confirm = input(f"\nSend test notifications to {len(filtered_students)} students? (y/N): ").strip().lower()
                    if confirm == 'y':
                        print("\nSending test notifications...")
                        results = manager.process_students(filtered_students, 'test_notification', test['id'])
                        
                        print(f"\n✅ Results:")
                        print(f"  Total: {results['total_students']}")
                        print(f"  Successful: {results['successful']}")
                        print(f"  Failed: {results['failed']}")
            
            elif choice == '3':
                # Send Exam Reminders
                print("\n⏰ Exam Reminder Sender")
                print("-" * 30)
                
                # Similar to test notifications but for unattempted tests
                campuses = manager.get_campuses()
                if not campuses:
                    print("No campuses found.")
                    continue
                
                campus = get_user_selection("Select Campus", campuses)
                if not campus:
                    continue
                
                courses = manager.get_courses(campus['id'])
                if not courses:
                    print("No courses found for this campus.")
                    continue
                
                course = get_user_selection("Select Course", courses)
                if not course:
                    continue
                
                batches = manager.get_batches(campus['id'], course['id'])
                if not batches:
                    print("No batches found for this campus and course.")
                    continue
                
                batch = get_user_selection("Select Batch", batches)
                if not batch:
                    continue
                
                # Display batch details
                print(f"\nSelected Batch: {batch['name']}")
                print(f"Campus: {', '.join(batch.get('campus_names', []))}")
                print(f"Course: {', '.join(batch.get('course_names', []))}")
                
                students = manager.get_students(campus['id'], course['id'], batch['id'])
                if not students:
                    print("No students found for the selected criteria.")
                    continue
                
                # Get unattempted tests for first student
                if students:
                    unattempted_tests = manager.get_unattempted_tests(students[0]['id'])
                    if not unattempted_tests:
                        print("No unattempted tests found for students in this batch.")
                        continue
                    
                    test = get_user_selection("Select Test for Reminder", unattempted_tests)
                    if not test:
                        continue
                    
                    # Filter students who have this test unattempted
                    filtered_students = []
                    for student in students:
                        unattempted_test_ids = [t['id'] for t in manager.get_unattempted_tests(student['id'])]
                        if test['id'] in unattempted_test_ids:
                            filtered_students.append(student)
                    
                    if not filtered_students:
                        print("No students have this test unattempted.")
                        continue
                    
                    print(f"\nFound {len(filtered_students)} students with unattempted test:")
                    for student in filtered_students:
                        print(f"  - {student['name']} ({student['email']})")
                    
                    confirm = input(f"\nSend exam reminders to {len(filtered_students)} students? (y/N): ").strip().lower()
                    if confirm == 'y':
                        print("\nSending exam reminders...")
                        results = manager.process_students(filtered_students, 'exam_reminder', test['id'])
                        
                        print(f"\n✅ Results:")
                        print(f"  Total: {results['total_students']}")
                        print(f"  Successful: {results['successful']}")
                        print(f"  Failed: {results['failed']}")
            
            elif choice == '4':
                # View Students by Filter
                print("\n👥 Student Viewer")
                print("-" * 30)
                
                campuses = manager.get_campuses()
                if not campuses:
                    print("No campuses found.")
                    continue
                
                campus = get_user_selection("Select Campus", campuses)
                if not campus:
                    continue
                
                courses = manager.get_courses(campus['id'])
                if not courses:
                    print("No courses found for this campus.")
                    continue
                
                course = get_user_selection("Select Course", courses)
                if not course:
                    continue
                
                batches = manager.get_batches(campus['id'], course['id'])
                if not batches:
                    print("No batches found for this campus and course.")
                    continue
                
                batch = get_user_selection("Select Batch", batches)
                if not batch:
                    continue
                
                # Display batch details
                print(f"\nSelected Batch: {batch['name']}")
                print(f"Campus: {', '.join(batch.get('campus_names', []))}")
                print(f"Course: {', '.join(batch.get('course_names', []))}")
                
                students = manager.get_students(campus['id'], course['id'], batch['id'])
                if not students:
                    print("No students found for the selected criteria.")
                    continue
                
                print(f"\n📊 Found {len(students)} students:")
                print("-" * 50)
                for i, student in enumerate(students, 1):
                    print(f"{i:2d}. {student['name']}")
                    print(f"     Email: {student['email']}")
                    phone_display = student.get('mobile_number') or student.get('phone_number') or 'N/A'
                    print(f"     Mobile: {phone_display}")
                    print(f"     Roll: {student.get('roll_number', 'N/A')}")
                    print()
            
            elif choice == '5':
                # View Available Tests
                print("\n📚 Test Viewer")
                print("-" * 30)
                
                # Get all tests
                tests = list(manager.db.tests.find({}, {
                    'name': 1, 'test_type': 1, 'module_id': 1, 'level_id': 1, '_id': 1
                }))
                
                if not tests:
                    print("No tests found.")
                    continue
                
                print(f"\n📊 Found {len(tests)} tests:")
                print("-" * 50)
                for i, test in enumerate(tests, 1):
                    print(f"{i:2d}. {test['name']}")
                    print(f"     Type: {test.get('test_type', 'N/A')}")
                    print(f"     Module: {test.get('module_id', 'N/A')}")
                    print(f"     Level: {test.get('level_id', 'N/A')}")
                    print(f"     ID: {test['_id']}")
                    print()
            
            elif choice == '7':
                print("\n👋 Goodbye!")
                break
            
            else:
                print("Invalid choice. Please enter 1-7.")
            
            input("\nPress Enter to continue...")
            
        except KeyboardInterrupt:
            print("\n\n👋 Goodbye!")
            break
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            print(f"An error occurred: {e}")
            input("Press Enter to continue...")

if __name__ == "__main__":
    main()

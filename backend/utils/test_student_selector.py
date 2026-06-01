#!/usr/bin/env python3
"""
Test Student Selection Utility
Handles selection of students for test notifications based on batch_ids and course_ids
"""

import logging
from typing import List, Dict, Optional, Set
from bson import ObjectId
from mongo import mongo_db
from config.mysql_rds import MySQLRDSConfig

# Configure logging
logger = logging.getLogger(__name__)

def get_students_for_test_notification(test_id: str, batch_ids: List[str], 
                                     course_ids: List[str] = None) -> List[Dict]:
    """
    Get students who should be notified about a test based on:
    - batch_ids: List of batch IDs the test is assigned to
    - course_ids: Optional list of course IDs to filter further
    
    Returns list of student dictionaries with required notification data
    """
    try:
        logger.info(f"🔍 Getting students for test notification: test_id={test_id}, batch_ids={batch_ids}, course_ids={course_ids}")
        
        # Convert string IDs to ObjectIds
        batch_object_ids = [ObjectId(bid) for bid in batch_ids]
        course_object_ids = [ObjectId(cid) for cid in course_ids] if course_ids else []
        
        # Build query for students
        query = {
            'batch_id': {'$in': batch_object_ids}
        }
        
        # Add course filter if specified
        if course_object_ids:
            query['course_id'] = {'$in': course_object_ids}
        
        logger.info(f"📋 Querying students with: {query}")
        
        # Get students from the specified batches and courses
        students_cursor = mongo_db.students.find(query)
        students = list(students_cursor)
        
        logger.info(f"📊 Found {len(students)} students matching criteria")
        
        # Process students and get their user details
        student_notifications = []
        processed_count = 0
        
        for student in students:
            try:
                # Get user details
                user = mongo_db.users.find_one({'_id': student.get('user_id')})
                if not user:
                    logger.warning(f"⚠️ User not found for student {student.get('_id')}")
                    continue
                
                # Extract notification data
                student_data = {
                    'student_id': str(student['_id']),
                    'name': student.get('name', user.get('name', 'Student')),
                    'email': user.get('email'),
                    'mobile_number': student.get('mobile_number') or student.get('mobile'),
                    'username': user.get('username'),
                    'user_id': str(student.get('user_id')),  # Add user_id for push notifications
                    'batch_id': str(student.get('batch_id')),
                    'course_id': str(student.get('course_id')),
                    'campus_id': str(student.get('campus_id'))
                }
                
                # Only include students who have email or mobile for notifications
                if student_data['email'] or student_data['mobile_number']:
                    student_notifications.append(student_data)
                    processed_count += 1
                else:
                    logger.warning(f"⚠️ Student {student_data['name']} has no email or mobile for notifications")
                    
            except Exception as e:
                logger.error(f"❌ Error processing student {student.get('_id')}: {e}")
                continue
        
        logger.info(f"✅ Successfully processed {processed_count} students for notifications")
        return student_notifications
        
    except Exception as e:
        logger.error(f"❌ Error getting students for test notification: {e}")
        return []

def get_rds_students_by_batch_branch_combination(
    batch_ids: List[str],
    branch_names: Optional[List[str]] = None,
) -> List[Dict]:
    """Get RDS students for test assignment filtered by batches and branches."""
    from services.rds_org_service import rds_org, parse_batch_id

    unique: Dict[str, Dict] = {}
    branches = [b for b in (branch_names or []) if b]

    for batch_id in batch_ids or []:
        parsed = parse_batch_id(str(batch_id))
        if not parsed:
            continue
        college_id, course_num, batch_year = parsed
        branch_queries = branches if branches else [None]

        for branch in branch_queries:
            students, _ = rds_org.list_students(
                page=1,
                limit=50000,
                college_id=college_id,
                course_id_num=course_num,
                batch_year=batch_year,
                branch=branch,
            )
            for student in students:
                sid = student.get('_id') or student.get('student_id')
                if not sid or sid in unique:
                    continue
                unique[sid] = {
                    'student_id': sid,
                    'name': student.get('name', ''),
                    'email': student.get('email', ''),
                    'mobile_number': student.get('mobile_number', ''),
                    'username': student.get('email', ''),
                    'user_id': sid,
                    'batch_id': student.get('batch_id', str(batch_id)),
                    'course_id': student.get('course_id', ''),
                    'campus_id': student.get('campus_id', ''),
                    'branch': student.get('branch', ''),
                    'roll_number': student.get('roll_number', ''),
                    'course_name': student.get('course_name', ''),
                }

    return list(unique.values())


def get_students_by_batch_course_combination(
    batch_ids: List[str],
    course_ids: List[str] = None,
    branch_names: Optional[List[str]] = None,
) -> List[Dict]:
    if MySQLRDSConfig.use_rds_org_data():
        return get_rds_students_by_batch_branch_combination(batch_ids, branch_names)
    """
    Get students based on batch and course combination
    This is a more flexible version that can handle various combinations
    """
    try:
        logger.info(f"🔍 Getting students by batch-course combination: batch_ids={batch_ids}, course_ids={course_ids}")
        
        # Convert string IDs to ObjectIds
        batch_object_ids = [ObjectId(bid) for bid in batch_ids]
        course_object_ids = [ObjectId(cid) for cid in course_ids] if course_ids else []
        
        # Build aggregation pipeline
        pipeline = [
            {
                '$match': {
                    'batch_id': {'$in': batch_object_ids}
                }
            }
        ]
        
        # Add course filter if specified
        if course_object_ids:
            pipeline[0]['$match']['course_id'] = {'$in': course_object_ids}
        
        # Join with users collection
        pipeline.extend([
            {
                '$lookup': {
                    'from': 'users',
                    'localField': 'user_id',
                    'foreignField': '_id',
                    'as': 'user'
                }
            },
            {
                '$unwind': '$user'
            },
            {
                '$project': {
                    'student_id': '$_id',
                    'name': '$name',
                    'email': '$user.email',
                    'mobile_number': '$mobile_number',
                    'username': '$user.username',
                    'user_id': '$user_id',  # Add user_id for push notifications
                    'batch_id': '$batch_id',
                    'course_id': '$course_id',
                    'campus_id': '$campus_id'
                }
            },
            {
                '$match': {
                    '$or': [
                        {'email': {'$exists': True, '$ne': None, '$ne': ''}},
                        {'mobile_number': {'$exists': True, '$ne': None, '$ne': ''}}
                    ]
                }
            }
        ])
        
        logger.info(f"📋 Running aggregation pipeline: {pipeline}")
        
        # Execute aggregation
        students_cursor = mongo_db.students.aggregate(pipeline)
        students = list(students_cursor)
        
        # Convert ObjectIds to strings
        for student in students:
            student['student_id'] = str(student['student_id'])
            student['batch_id'] = str(student['batch_id'])
            student['course_id'] = str(student['course_id'])
            student['campus_id'] = str(student['campus_id'])
        
        logger.info(f"✅ Found {len(students)} students with valid contact information")
        return students
        
    except Exception as e:
        logger.error(f"❌ Error getting students by batch-course combination: {e}")
        return []

def validate_test_assignment(test_id: str, batch_ids: List[str], 
                           course_ids: List[str] = None) -> Dict:
    """
    Validate that a test assignment is valid and return statistics
    """
    try:
        logger.info(f"🔍 Validating test assignment: test_id={test_id}")
        
        # Get students for this assignment
        students = get_students_by_batch_course_combination(batch_ids, course_ids)
        
        # Count students with different contact methods
        email_count = len([s for s in students if s.get('email')])
        mobile_count = len([s for s in students if s.get('mobile_number')])
        both_count = len([s for s in students if s.get('email') and s.get('mobile_number')])
        
        # Group by batch and course
        batch_stats = {}
        course_stats = {}
        
        for student in students:
            batch_id = student.get('batch_id')
            course_id = student.get('course_id')
            
            if batch_id not in batch_stats:
                batch_stats[batch_id] = 0
            batch_stats[batch_id] += 1
            
            if course_id not in course_stats:
                course_stats[course_id] = 0
            course_stats[course_id] += 1
        
        return {
            'valid': True,
            'total_students': len(students),
            'email_count': email_count,
            'mobile_count': mobile_count,
            'both_count': both_count,
            'batch_stats': batch_stats,
            'course_stats': course_stats,
            'students': students
        }
        
    except Exception as e:
        logger.error(f"❌ Error validating test assignment: {e}")
        return {
            'valid': False,
            'error': str(e),
            'total_students': 0,
            'email_count': 0,
            'mobile_count': 0,
            'both_count': 0,
            'batch_stats': {},
            'course_stats': {},
            'students': []
        }

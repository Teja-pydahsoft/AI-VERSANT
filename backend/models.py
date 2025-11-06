from datetime import datetime
from bson import ObjectId
from config.constants import ROLES, MODULES, LEVELS, TEST_TYPES, STATUS

class User:
    def __init__(self, username, email, password_hash, role, name, mobile, 
                 campus_id=None, course_id=None, batch_id=None, is_active=True):
        self.username = username
        self.email = email
        self.password_hash = password_hash
        self.role = role
        self.name = name
        self.mobile = mobile
        self.campus_id = ObjectId(campus_id) if campus_id else None
        self.course_id = ObjectId(course_id) if course_id else None
        self.batch_id = ObjectId(batch_id) if batch_id else None
        self.is_active = is_active
        self.created_at = datetime.utcnow()
    
    def to_dict(self):
        return {
            'username': self.username,
            'email': self.email,
            'password_hash': self.password_hash,
            'role': self.role,
            'name': self.name,
            'mobile': self.mobile,
            'campus_id': self.campus_id,
            'course_id': self.course_id,
            'batch_id': self.batch_id,
            'is_active': self.is_active,
            'created_at': self.created_at
        }

class Student:
    def __init__(self, name, email, batch_course_instance_id, roll_number=None, mobile=None, **kwargs):
        self.name = name
        self.email = email
        self.batch_course_instance_id = batch_course_instance_id
        self.roll_number = roll_number
        self.mobile = mobile
        self.created_at = datetime.utcnow()
        # Ignore course_id, use batch_course_instance_id only
        # ... other fields ...

    def to_dict(self):
        return {
            'name': self.name,
            'email': self.email,
            'batch_course_instance_id': self.batch_course_instance_id,
            'roll_number': self.roll_number,
            'mobile': self.mobile,
            'created_at': self.created_at
        }

class Module:
    def __init__(self, name, description, status='active'):
        self.name = name
        self.description = description
        self.status = status
    
    def to_dict(self):
        return {
            'name': self.name,
            'description': self.description,
            'status': self.status
        }

class Level:
    def __init__(self, name, description, status='active'):
        self.name = name
        self.description = description
        self.status = status
    
    def to_dict(self):
        return {
            'name': self.name,
            'description': self.description,
            'status': self.status
        }

class Test:
    def __init__(self, name, module_id, level_id, created_by, test_type='practice',
                 status='active', total_questions=0, time_limit=30, passing_score=70):
        self.name = name
        self.module_id = ObjectId(module_id)
        self.level_id = ObjectId(level_id)
        self.created_by = ObjectId(created_by)
        self.test_type = test_type
        self.status = status
        self.total_questions = total_questions
        self.time_limit = time_limit
        self.passing_score = passing_score
        self.created_at = datetime.utcnow()
    
    def to_dict(self):
        return {
            'name': self.name,
            'module_id': self.module_id,
            'level_id': self.level_id,
            'created_by': self.created_by,
            'test_type': self.test_type,
            'status': self.status,
            'total_questions': self.total_questions,
            'time_limit': self.time_limit,
            'passing_score': self.passing_score,
            'created_at': self.created_at
        }

class OnlineExam:
    def __init__(self, test_id, name, start_date, end_date, duration,
                 campus_ids, course_ids, batch_ids, status='scheduled', created_by=None):
        self.test_id = ObjectId(test_id)
        self.name = name
        self.start_date = start_date
        self.end_date = end_date
        self.duration = duration
        self.campus_ids = [ObjectId(cid) for cid in campus_ids]
        self.course_ids = [ObjectId(cid) for cid in course_ids]
        self.batch_ids = [ObjectId(bid) for bid in batch_ids]
        self.status = status
        self.created_by = ObjectId(created_by) if created_by else None
    
    def to_dict(self):
        return {
            'test_id': self.test_id,
            'name': self.name,
            'start_date': self.start_date,
            'end_date': self.end_date,
            'duration': self.duration,
            'campus_ids': self.campus_ids,
            'course_ids': self.course_ids,
            'batch_ids': self.batch_ids,
            'status': self.status,
            'created_by': self.created_by
        }

class StudentTestAttempt:
    def __init__(self, student_id, test_id, exam_id=None, module_id=None, level_id=None,
                 status='in_progress', score=0, total_questions=0, correct_answers=0,
                 time_taken=0, started_at=None, completed_at=None):
        self.student_id = ObjectId(student_id)
        self.test_id = ObjectId(test_id)
        self.exam_id = ObjectId(exam_id) if exam_id else None
        self.module_id = ObjectId(module_id) if module_id else None
        self.level_id = ObjectId(level_id) if level_id else None
        self.status = status
        self.score = score
        self.total_questions = total_questions
        self.correct_answers = correct_answers
        self.time_taken = time_taken
        self.started_at = started_at or datetime.utcnow()
        self.completed_at = completed_at
    
    def to_dict(self):
        return {
            'student_id': self.student_id,
            'test_id': self.test_id,
            'exam_id': self.exam_id,
            'module_id': self.module_id,
            'level_id': self.level_id,
            'status': self.status,
            'score': self.score,
            'total_questions': self.total_questions,
            'correct_answers': self.correct_answers,
            'time_taken': self.time_taken,
            'started_at': self.started_at,
            'completed_at': self.completed_at
        }

class StudentProgress:
    def __init__(self, student_id, module_id, level_id, total_tests=0, completed_tests=0,
                 average_score=0, highest_score=0, current_level='Beginner', last_test_date=None):
        self.student_id = ObjectId(student_id)
        self.module_id = ObjectId(module_id)
        self.level_id = ObjectId(level_id)
        self.total_tests = total_tests
        self.completed_tests = completed_tests
        self.average_score = average_score
        self.highest_score = highest_score
        self.current_level = current_level
        self.last_test_date = last_test_date
    
    def to_dict(self):
        return {
            'student_id': self.student_id,
            'module_id': self.module_id,
            'level_id': self.level_id,
            'total_tests': self.total_tests,
            'completed_tests': self.completed_tests,
            'average_score': self.average_score,
            'highest_score': self.highest_score,
            'current_level': self.current_level,
            'last_test_date': self.last_test_date
        }

class Course:
    def __init__(self, name, campus_id, admin_id, created_at=None):
        self.name = name
        self.campus_id = ObjectId(campus_id)
        self.admin_id = ObjectId(admin_id)
        self.created_at = created_at or datetime.utcnow()

    def to_dict(self):
        return {
            'name': self.name,
            'campus_id': self.campus_id,
            'admin_id': self.admin_id,
            'created_at': self.created_at
        }

# BatchCourseInstance model (MongoDB collection)
class BatchCourseInstance:
    def __init__(self, db):
        self.collection = db.batch_course_instances

    def find_or_create(self, batch_id, course_id):
        instance = self.collection.find_one({'batch_id': batch_id, 'course_id': course_id})
        if instance:
            return instance['_id']
        result = self.collection.insert_one({'batch_id': batch_id, 'course_id': course_id})
        return result.inserted_id

    def get_by_id(self, instance_id):
        return self.collection.find_one({'_id': instance_id})

# NotificationSettings model (MongoDB collection)
class NotificationSettings:
    def __init__(self, db):
        self.collection = db.notification_settings

    def find_one(self):
        """Get the notification settings document"""
        return self.collection.find_one({})

    def find_or_create(self):
        """Get settings or create default if none exist"""
        settings = self.collection.find_one({})
        if not settings:
            default_settings = {
                'pushEnabled': True,
                'smsEnabled': True,
                'mailEnabled': True,
                'created_at': datetime.utcnow(),
                'updated_at': datetime.utcnow()
            }
            result = self.collection.insert_one(default_settings)
            settings = self.collection.find_one({'_id': result.inserted_id})
        return settings

    def update_settings(self, push_enabled=None, sms_enabled=None, mail_enabled=None):
        """Update notification settings"""
        update_data = {'updated_at': datetime.utcnow()}

        if push_enabled is not None:
            update_data['pushEnabled'] = push_enabled
        if sms_enabled is not None:
            update_data['smsEnabled'] = sms_enabled
        if mail_enabled is not None:
            update_data['mailEnabled'] = mail_enabled

        result = self.collection.update_one(
            {},  # Update the first (and should be only) document
            {'$set': update_data},
            upsert=True  # Create if doesn't exist
        )

        # Return updated document
        return self.collection.find_one({})

    def create_default(self):
        """Create default notification settings"""
        default_settings = {
            'pushEnabled': True,
            'smsEnabled': True,
            'mailEnabled': True,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        return self.collection.insert_one(default_settings)

    def delete_all(self):
        """Delete all notification settings (for testing)"""
        return self.collection.delete_many({})

# Sub Superadmin Models
class SubSuperadmin:
   """Model for Sub Superadmin management with granular permissions"""

   @staticmethod
   def create_sub_superadmin_user_with_permissions(name, email, phone, username, password, role_name, permissions, created_by):
       """Create a new sub superadmin user with custom role and permissions"""
       import bcrypt
       from mongo import mongo_db
       now = datetime.utcnow()

       # Hash password using bcrypt (same as other users)
       password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

       # Create user account with permissions stored directly
       user_data = {
           'name': name,
           'email': email,
           'phone': phone,
           'username': username,
           'password_hash': password_hash,  # Use bcrypt hashed password
           'role': 'sub_superadmin',
           'role_name': role_name,  # Custom or template role name
           'permissions': permissions,  # Permissions stored on user
           'is_active': True,
           'created_by': created_by,
           'created_at': now,
           'updated_at': now
       }

       result = mongo_db.db.users.insert_one(user_data)
       return str(result.inserted_id)
   
   @staticmethod
   def create_sub_superadmin_user(name, email, phone, username, password, sub_role_id, created_by):
       """Create a new sub superadmin user with complete profile (legacy method)"""
       import bcrypt
       from mongo import mongo_db
       now = datetime.utcnow()

       # Hash password using bcrypt (same as other users)
       password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

       # Create user account
       user_data = {
           'name': name,
           'email': email,
           'phone': phone,
           'username': username,
           'password_hash': password_hash,  # Use bcrypt hashed password
           'role': 'sub_superadmin',
           'sub_role_id': sub_role_id,  # Reference to sub_roles collection
           'is_active': True,
           'created_by': created_by,
           'created_at': now,
           'updated_at': now
       }

       result = mongo_db.db.users.insert_one(user_data)
       return str(result.inserted_id)

   @staticmethod
   def get_sub_superadmin(user_id):
       """Get sub superadmin details by user_id"""
       from mongo import mongo_db
       return mongo_db.db.users.find_one({
           '_id': ObjectId(user_id),
           'role': 'sub_superadmin',
           'is_active': True
       })

   @staticmethod
   def get_all_sub_superadmins():
       """Get all active sub superadmins with their sub-role details"""
       from mongo import mongo_db
       sub_admins = list(mongo_db.db.users.find({
           'role': 'sub_superadmin',
           'is_active': True
       }))
       
       # Populate sub-role details
       for admin in sub_admins:
           admin['_id'] = str(admin['_id'])
           if 'sub_role_id' in admin and admin['sub_role_id']:
               sub_role = mongo_db.db.sub_roles.find_one({'_id': ObjectId(admin['sub_role_id'])})
               if sub_role:
                   admin['sub_role'] = {
                       'id': str(sub_role['_id']),
                       'name': sub_role['name'],
                       'permissions': sub_role['permissions']
                   }
       
       return sub_admins

   @staticmethod
   def update_sub_role(user_id, sub_role_id):
       """Update sub-role for a sub superadmin"""
       from mongo import mongo_db
       now = datetime.utcnow()
       result = mongo_db.db.users.update_one(
           {'_id': ObjectId(user_id), 'role': 'sub_superadmin', 'is_active': True},
           {
               '$set': {
                   'sub_role_id': sub_role_id,
                   'updated_at': now
               }
           }
       )
       return result.modified_count > 0

   @staticmethod
   def deactivate_sub_superadmin(user_id):
       """Deactivate a sub superadmin"""
       from mongo import mongo_db
       now = datetime.utcnow()
       result = mongo_db.db.users.update_one(
           {'_id': ObjectId(user_id), 'role': 'sub_superadmin'},
           {
               '$set': {
                   'is_active': False,
                   'updated_at': now
               }
           }
       )
       return result.modified_count > 0

   @staticmethod
   def get_user_permissions(user_id):
       """Get permissions for a specific user (from user document or sub-role)"""
       from mongo import mongo_db
       user = mongo_db.db.users.find_one({
           '_id': ObjectId(user_id),
           'role': 'sub_superadmin',
           'is_active': True
       })
       
       if not user:
           return {}
       
       # New approach: permissions stored directly on user
       if 'permissions' in user:
           return user.get('permissions', {})
       
       # Legacy approach: permissions from sub_role_id
       if 'sub_role_id' in user:
           sub_role = mongo_db.db.sub_roles.find_one({'_id': ObjectId(user['sub_role_id'])})
           if sub_role:
               return sub_role.get('permissions', {})
       
       return {}

   @staticmethod
   def has_permission(user_id, page, required_access='read'):
       """Check if user has required permission for a page"""
       permissions = SubSuperadmin.get_user_permissions(user_id)
       
       user_access = permissions.get(page, 'none')
       
       if user_access == 'none':
           return False
       if required_access == 'read' and user_access in ['read', 'write']:
           return True
       if required_access == 'write' and user_access == 'write':
           return True
       
       return False

# Sub-Role Models
class SubRole:
   """Model for managing sub-roles with permissions"""
   
   @staticmethod
   def create_sub_role(name, description, permissions, created_by):
       """Create a new sub-role"""
       from mongo import mongo_db
       now = datetime.utcnow()
       
       sub_role_data = {
           'name': name,
           'description': description,
           'permissions': permissions,  # Dict of module -> access (read/write/none)
           'is_active': True,
           'created_by': created_by,
           'created_at': now,
           'updated_at': now
       }
       
       result = mongo_db.db.sub_roles.insert_one(sub_role_data)
       return str(result.inserted_id)
   
   @staticmethod
   def get_all_sub_roles():
       """Get all active sub-roles"""
       from mongo import mongo_db
       roles = list(mongo_db.db.sub_roles.find({'is_active': True}))
       for role in roles:
           role['_id'] = str(role['_id'])
       return roles
   
   @staticmethod
   def get_sub_role(role_id):
       """Get sub-role by ID"""
       from mongo import mongo_db
       role = mongo_db.db.sub_roles.find_one({'_id': ObjectId(role_id), 'is_active': True})
       if role:
           role['_id'] = str(role['_id'])
       return role
   
   @staticmethod
   def update_sub_role(role_id, name=None, description=None, permissions=None):
       """Update sub-role"""
       from mongo import mongo_db
       now = datetime.utcnow()
       update_data = {'updated_at': now}
       
       if name:
           update_data['name'] = name
       if description:
           update_data['description'] = description
       if permissions:
           update_data['permissions'] = permissions
       
       result = mongo_db.db.sub_roles.update_one(
           {'_id': ObjectId(role_id), 'is_active': True},
           {'$set': update_data}
       )
       return result.modified_count > 0
   
   @staticmethod
   def delete_sub_role(role_id):
       """Soft delete sub-role"""
       from mongo import mongo_db
       now = datetime.utcnow()
       result = mongo_db.db.sub_roles.update_one(
           {'_id': ObjectId(role_id)},
           {'$set': {'is_active': False, 'updated_at': now}}
       )
       return result.modified_count > 0

# Permission Templates
class PermissionTemplate:
   """Predefined permission templates for common roles"""

   TEMPLATES = {
       'student_manager': {
           'student_management': 'write',
           'batch_management': 'read',
           'test_management': 'read',
           'question_bank': 'read',
           'analytics': 'read',
           'user_management': 'read',
           'campus_management': 'read',
           'course_management': 'read',
           'form_management': 'read',
           'results_management': 'write',
           'submission_viewer': 'write',
           'notification_settings': 'read',
           'global_settings': 'read'
       },
       'content_manager': {
           'student_management': 'read',
           'batch_management': 'read',
           'test_management': 'write',
           'question_bank': 'write',
           'analytics': 'read',
           'user_management': 'read',
           'campus_management': 'read',
           'course_management': 'read',
           'form_management': 'write',
           'results_management': 'read',
           'submission_viewer': 'read',
           'notification_settings': 'read',
           'global_settings': 'read'
       },
       'analytics_manager': {
           'student_management': 'read',
           'batch_management': 'read',
           'test_management': 'read',
           'question_bank': 'read',
           'analytics': 'write',
           'user_management': 'read',
           'campus_management': 'read',
           'course_management': 'read',
           'form_management': 'read',
           'results_management': 'read',
           'submission_viewer': 'read',
           'notification_settings': 'read',
           'global_settings': 'read'
       },
       'system_admin': {
           'student_management': 'write',
           'batch_management': 'write',
           'test_management': 'write',
           'question_bank': 'write',
           'analytics': 'write',
           'user_management': 'write',
           'campus_management': 'write',
           'course_management': 'write',
           'form_management': 'write',
           'results_management': 'write',
           'submission_viewer': 'write',
           'notification_settings': 'write',
           'global_settings': 'write'
       },
       'read_only': {
           'student_management': 'read',
           'batch_management': 'read',
           'test_management': 'read',
           'question_bank': 'read',
           'analytics': 'read',
           'user_management': 'read',
           'campus_management': 'read',
           'course_management': 'read',
           'form_management': 'read',
           'results_management': 'read',
           'submission_viewer': 'read',
           'notification_settings': 'read',
           'global_settings': 'read'
       }
   }

   @staticmethod
   def get_template(role_name):
       """Get permission template by role name"""
       return PermissionTemplate.TEMPLATES.get(role_name, {})

   @staticmethod
   def get_all_templates():
       """Get all available permission templates"""
       return {
           name: {
               'name': name,
               'permissions': template,
               'description': PermissionTemplate.get_template_description(name)
           }
           for name, template in PermissionTemplate.TEMPLATES.items()
       }

   @staticmethod
   def get_template_description(role_name):
       """Get description for a template"""
       descriptions = {
           'student_manager': 'Can manage students and view results',
           'content_manager': 'Can manage tests and questions',
           'analytics_manager': 'Can view and analyze all data',
           'system_admin': 'Full access to all features',
           'read_only': 'Read-only access to all features'
       }
       return descriptions.get(role_name, 'Custom permissions')
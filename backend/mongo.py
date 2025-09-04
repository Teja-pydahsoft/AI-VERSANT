from config.database_simple import DatabaseConfig
from bson import ObjectId
import json
from datetime import datetime
from models import BatchCourseInstance

class MongoDB:
    def __init__(self):
        self.db = DatabaseConfig.get_database()
        self.users = self.db.users
        self.students = self.db.students
        self.modules = self.db.modules
        self.levels = self.db.levels
        self.tests = self.db.tests
        self.online_exams = self.db.online_exams
        self.student_test_attempts = self.db.student_test_attempts
        self.student_progress = self.db.student_progress
        self.campuses = self.db.campuses
        self.batches = self.db.batches
        self.courses = self.db.courses
        self.batch_course_instances = BatchCourseInstance(self.db)
        self.question_bank = self.db.question_bank
        self.student_test_assignments = self.db.student_test_assignments
        self.crt_topics = self.db.crt_topics
        self.test_results = self.db.test_results
        
        # Create indexes for better performance (only once)
        self._create_indexes_once()
    
    def _create_indexes_once(self):
        """Create database indexes only once to avoid repeated operations"""
        import threading
        
        # Use a class variable to track if indexes have been created
        if not hasattr(MongoDB, '_indexes_created'):
            MongoDB._indexes_created = False
        
        if MongoDB._indexes_created:
            return  # Indexes already created
        
        # Use a lock to ensure only one thread creates indexes
        if not hasattr(MongoDB, '_index_lock'):
            MongoDB._index_lock = threading.Lock()
        
        with MongoDB._index_lock:
            if MongoDB._indexes_created:
                return  # Another thread already created them
            
            try:
                print("🔄 Creating MongoDB indexes (first time only)...")
                self._create_indexes()
                MongoDB._indexes_created = True
                print("✅ MongoDB indexes created successfully")
            except Exception as e:
                print(f"⚠️ Warning: Could not create some indexes: {e}")
                # Continue without failing the entire initialization
    
    def _create_indexes(self):
        """Create database indexes for better query performance"""
        try:
            # Users collection indexes
            self.users.create_index("username", unique=True)
            self.users.create_index("email", unique=True)
            self.users.create_index("role")
            self.users.create_index("campus_id")
            self.users.create_index("course_id")
            self.users.create_index("batch_id")
            
            # Students collection indexes
            self.students.create_index("user_id", unique=True)
            self.students.create_index("roll_number", unique=True)
            self.students.create_index("campus_id")
            self.students.create_index("course_id")
            self.students.create_index("batch_id")
            
            # Tests collection indexes
            self.tests.create_index("module_id")
            self.tests.create_index("level_id")
            self.tests.create_index("created_by")
            self.tests.create_index("test_type")
            self.tests.create_index("status")
            
            # Online exams collection indexes
            self.online_exams.create_index("test_id")
            self.online_exams.create_index("status")
            self.online_exams.create_index("start_date")
            self.online_exams.create_index("end_date")
            
            # Student test attempts indexes
            self.student_test_attempts.create_index("student_id")
            self.student_test_attempts.create_index("test_id")
            self.student_test_attempts.create_index("exam_id")
            self.student_test_attempts.create_index("status")
            self.student_test_attempts.create_index("started_at")
            
            # Student progress indexes
            self.student_progress.create_index("student_id")
            self.student_progress.create_index("module_id")
            self.student_progress.create_index("level_id")
            self.student_progress.create_index([("student_id", 1), ("module_id", 1), ("level_id", 1)], unique=True)
            
            # Test results indexes
            self.test_results.create_index("test_id")
            self.test_results.create_index("student_id")
            self.test_results.create_index("test_type")
            self.test_results.create_index("submitted_at")
            self.test_results.create_index([("test_id", 1), ("student_id", 1)])
            
        except Exception as e:
            print(f"⚠️ Warning: Could not create some indexes: {e}")
            # Continue without failing the entire initialization
    
    def insert_user(self, user_data):
        """Insert a new user"""
        try:
            result = self.users.insert_one(user_data)
            return str(result.inserted_id)
        except Exception as e:
            raise Exception(f"Error inserting user: {str(e)}")
    
    def find_user_by_username(self, username):
        """Find user by username"""
        return self.users.find_one({"username": username})
    
    def find_user_by_email(self, email):
        """Find user by email"""
        return self.users.find_one({"email": email})
    
    def find_user_by_id(self, user_id):
        """Find user by ID"""
        return self.users.find_one({"_id": ObjectId(user_id)})
    
    def update_user(self, user_id, update_data):
        """Update user data"""
        return self.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": update_data}
        )
    
    def insert_student(self, student_data):
        """Insert a new student"""
        try:
            result = self.students.insert_one(student_data)
            return str(result.inserted_id)
        except Exception as e:
            raise Exception(f"Error inserting student: {str(e)}")
    
    def find_student_by_user_id(self, user_id):
        """Find student by user ID"""
        return self.students.find_one({"user_id": ObjectId(user_id)})
    
    def find_students_by_campus(self, campus_id):
        """Find all students in a campus"""
        return list(self.students.find({"campus_id": ObjectId(campus_id)}))
    
    def find_students_by_course(self, course_id):
        """Find all students in a course"""
        return list(self.students.find({"course_id": ObjectId(course_id)}))
    
    def get_students_by_batch(self, batch_id):
        """Get all students for a specific batch with populated campus and course info."""
        try:
            batch_object_id = ObjectId(batch_id)
            pipeline = [
                {
                    '$match': {'batch_id': batch_object_id}
                },
                {
                    '$lookup': {
                        'from': 'campuses',
                        'localField': 'campus_id',
                        'foreignField': '_id',
                        'as': 'campus_info'
                    }
                },
                {
                    '$unwind': '$campus_info'
                },
                {
                    '$lookup': {
                        'from': 'courses',
                        'localField': 'course_id',
                        'foreignField': '_id',
                        'as': 'course_info'
                    }
                },
                {
                    '$unwind': {'path': '$course_info', 'preserveNullAndEmptyArrays': True}
                },
                {
                    '$project': {
                        '_id': 0,
                        'id': {'$toString': '$_id'},
                        'name': '$name',
                        'email': '$email',
                        'roll_number': '$roll_number',
                        'mobile_number': '$mobile_number',
                        'campus_name': '$campus_info.name',
                        'course_name': '$course_info.name',
                    }
                }
            ]
            students = list(self.students.aggregate(pipeline))
            return students
        except Exception as e:
            raise Exception(f"Error getting students by batch: {str(e)}")
    
    def insert_test(self, test_data):
        """Insert a new test"""
        try:
            result = self.tests.insert_one(test_data)
            return str(result.inserted_id)
        except Exception as e:
            raise Exception(f"Error inserting test: {str(e)}")
    
    def find_tests_by_module_level(self, module_id, level_id):
        """Find tests by module and level"""
        return list(self.tests.find({
            "module_id": ObjectId(module_id),
            "level_id": ObjectId(level_id),
            "status": "active"
        }))
    
    def insert_test_attempt(self, attempt_data):
        """Insert a new test attempt"""
        try:
            result = self.student_test_attempts.insert_one(attempt_data)
            return str(result.inserted_id)
        except Exception as e:
            raise Exception(f"Error inserting test attempt: {str(e)}")
    
    def update_test_attempt(self, attempt_id, update_data):
        """Update test attempt"""
        return self.student_test_attempts.update_one(
            {"_id": ObjectId(attempt_id)},
            {"$set": update_data}
        )
    
    def find_student_attempts(self, student_id):
        """Find all test attempts for a student"""
        return list(self.student_test_attempts.find({"student_id": ObjectId(student_id)}))
    
    def insert_progress(self, progress_data):
        """Insert or update student progress"""
        try:
            result = self.student_progress.update_one(
                {
                    "student_id": progress_data["student_id"],
                    "module_id": progress_data["module_id"],
                    "level_id": progress_data["level_id"]
                },
                {"$set": progress_data},
                upsert=True
            )
            return result
        except Exception as e:
            raise Exception(f"Error updating progress: {str(e)}")
    
    def find_student_progress(self, student_id):
        """Find all progress records for a student"""
        return list(self.student_progress.find({"student_id": ObjectId(student_id)}))
    
    def get_collection_stats(self, collection_name):
        """Get collection statistics"""
        collection = getattr(self, collection_name, None)
        if collection:
            return {
                "count": collection.count_documents({}),
                "name": collection_name
            }
        return None

    def insert_campus(self, campus_data):
        """Insert a new campus"""
        try:
            result = self.campuses.insert_one(campus_data)
            return str(result.inserted_id)
        except Exception as e:
            raise Exception(f"Error inserting campus: {str(e)}")

    def get_all_campuses(self):
        """Get all campuses"""
        return list(self.campuses.find())

    def get_courses_by_campus(self, campus_id):
        """Get all courses for a specific campus."""
        try:
            campus_object_id = ObjectId(campus_id)
            courses_cursor = self.courses.find({'campus_id': campus_object_id})
            
            courses_list = []
            for course in courses_cursor:
                course_data = {
                    'id': str(course['_id']),
                    'name': course.get('name'),
                    'campus_id': str(course.get('campus_id'))
                }
                
                # Optionally, fetch student count for each course
                student_count = self.users.count_documents({
                    'course_id': course['_id'],
                    'role': 'student'
                })
                course_data['student_count'] = student_count
                
                courses_list.append(course_data)
                
            return courses_list
        except Exception as e:
            raise Exception(f"Error getting courses by campus: {str(e)}")

    def get_batches_by_course(self, course_id):
        """Get all batches for a specific course with student counts."""
        try:
            course_object_id = ObjectId(course_id)
            # Find all batches where course_ids contains the course_id
            batches_cursor = self.batches.find({'course_ids': course_object_id})
            batches_list = []
            for batch in batches_cursor:
                batch_data = {
                    'id': str(batch['_id']),
                    'name': batch.get('name'),
                    'course_ids': [str(cid) for cid in batch.get('course_ids', [])]
                }
                # Get student count for each batch
                student_count = self.users.count_documents({
                    'batch_id': batch['_id'],
                    'role': 'student'
                })
                batch_data['student_count'] = student_count
                batches_list.append(batch_data)
            return batches_list
        except Exception as e:
            raise Exception(f"Error getting batches by course: {str(e)}")

    def update_campus(self, campus_id, update_data):
        """Update campus data (name or admin_id)"""
        allowed = {k: v for k, v in update_data.items() if k in ['name', 'admin_id']}
        return self.campuses.update_one(
            {"_id": ObjectId(campus_id)},
            {"$set": allowed}
        )

    def delete_campus(self, campus_id):
        """Delete a campus and all associated data (courses, batches, students, admins)."""
        try:
            campus_object_id = ObjectId(campus_id)
            campus = self.campuses.find_one({'_id': campus_object_id})

            if not campus:
                return {'success': False, 'message': 'Campus not found'}

            # 1. Find all courses in the campus
            courses = list(self.courses.find({'campus_id': campus_object_id}))
            course_ids = [c['_id'] for c in courses]

            # 2. Delete all batches in those courses
            if course_ids:
                self.batches.delete_many({'course_id': {'$in': course_ids}})

            # 3. Delete all course admins for those courses
            for course in courses:
                if 'admin_id' in course and course['admin_id']:
                    self.users.delete_one({'_id': course['admin_id']})

            # 4. Delete all courses in the campus
            if course_ids:
                self.courses.delete_many({'_id': {'$in': course_ids}})
            
            # 5. Delete all students in the campus
            self.users.delete_many({'campus_id': campus_object_id, 'role': 'student'})

            # 6. Delete the campus admin
            if 'admin_id' in campus and campus['admin_id']:
                self.users.delete_one({'_id': campus['admin_id']})
            
            # 7. Delete the campus itself
            result = self.campuses.delete_one({'_id': campus_object_id})
            
            return {'success': True, 'deleted_count': result.deleted_count}
        except Exception as e:
            raise Exception(f"Error deleting campus: {str(e)}")

    def insert_campus_with_admin(self, campus_name, admin_name, admin_email, admin_password_hash):
        """Create a campus and its admin user atomically"""
        from config.constants import ROLES
        campus_admin_user = {
            'username': admin_email,
            'email': admin_email,
            'password_hash': admin_password_hash,
            'role': ROLES['CAMPUS_ADMIN'],
            'name': admin_name,
            'is_active': True,
            'created_at': datetime.utcnow()
        }
        user_result = self.users.insert_one(campus_admin_user)
        admin_id = user_result.inserted_id
        campus_data = {
            'name': campus_name,
            'admin_id': admin_id,
            'created_at': datetime.utcnow()
        }
        campus_result = self.campuses.insert_one(campus_data)
        return str(campus_result.inserted_id), str(admin_id)

    def get_all_campuses_with_admin(self):
        """Get all campuses with admin info populated"""
        campuses = list(self.campuses.find())
        for campus in campuses:
            admin = self.users.find_one({'_id': campus.get('admin_id')})
            campus['admin'] = {
                'id': str(admin['_id']),
                'name': admin.get('name'),
                'email': admin.get('email')
            } if admin else None
        return campuses

    def insert_course_with_admin(self, course_name, campus_id, admin_name, admin_email, admin_password_hash):
        from config.constants import ROLES
        course_admin_user = {
            'username': admin_email,
            'email': admin_email,
            'password_hash': admin_password_hash,
            'role': ROLES['COURSE_ADMIN'],
            'name': admin_name,
            'campus_id': ObjectId(campus_id),
            'is_active': True,
            'created_at': datetime.utcnow()
        }
        user_result = self.users.insert_one(course_admin_user)
        admin_id = user_result.inserted_id
        course_data = {
            'name': course_name,
            'campus_id': ObjectId(campus_id),
            'admin_id': admin_id,
            'created_at': datetime.utcnow()
        }
        course_result = self.db.courses.insert_one(course_data)
        return str(course_result.inserted_id), str(admin_id)

    def get_courses_by_campus_with_admin(self, campus_id):
        courses = list(self.db.courses.find({'campus_id': ObjectId(campus_id)}))
        for course in courses:
            admin = self.users.find_one({'_id': course.get('admin_id')})
            course['admin'] = {
                'id': str(admin['_id']),
                'name': admin.get('name'),
                'email': admin.get('email')
            } if admin else None
        return courses

    def update_course(self, course_id, update_data):
        allowed = {k: v for k, v in update_data.items() if k in ['name', 'admin_id']}
        return self.db.courses.update_one(
            {"_id": ObjectId(course_id)},
            {"$set": allowed}
        )

    def delete_course(self, course_id):
        """Delete a course and all associated batches and student enrollments."""
        try:
            course_object_id = ObjectId(course_id)
            
            # 1. Delete all batches in the course
            self.batches.delete_many({'course_id': course_object_id})
            
            # 2. Unassign all students from the course
            self.users.update_many(
                {'course_id': course_object_id},
                {'$unset': {'course_id': ""}}
            )
            
            # 3. Delete the course itself
            result = self.courses.delete_one({'_id': course_object_id})
            
            return result
        except Exception as e:
            raise Exception(f"Error deleting course: {str(e)}")

    def get_user_counts_by_campus(self):
        pipeline = [
            {"$group": {
                "_id": {"campus_id": "$campus_id", "role": "$role"},
                "count": {"$sum": 1}
            }}
        ]
        result = list(self.users.aggregate(pipeline))
        # Convert ObjectId to string for campus_id
        for item in result:
            if isinstance(item['_id'].get('campus_id'), ObjectId):
                item['_id']['campus_id'] = str(item['_id']['campus_id'])
        return result

    def get_user_counts_by_course(self):
        pipeline = [
            {"$group": {
                "_id": {"course_id": "$course_id", "role": "$role"},
                "count": {"$sum": 1}
            }}
        ]
        result = list(self.users.aggregate(pipeline))
        # Convert ObjectId to string for course_id
        for item in result:
            if isinstance(item['_id'].get('course_id'), ObjectId):
                item['_id']['course_id'] = str(item['_id']['course_id'])
        return result

    def find_or_create_batch_course_instance(self, batch_id, course_id):
        return self.batch_course_instances.find_or_create(batch_id, course_id)

    def get_batch_course_instance(self, instance_id):
        return self.batch_course_instances.get_by_id(instance_id)

    def get_instance_ids_by_batch(self, batch_id):
        return [i['_id'] for i in self.db.batch_course_instances.find({'batch_id': batch_id})]

    def get_instance_ids_by_course(self, course_id):
        return [i['_id'] for i in self.db.batch_course_instances.find({'course_id': course_id})]

    def get_instance_ids_by_campus(self, campus_id):
        batch_ids = [b['_id'] for b in self.batches.find({'campus_id': campus_id})]
        return [i['_id'] for i in self.db.batch_course_instances.find({'batch_id': {'$in': batch_ids}})]

# Global MongoDB instance with lazy initialization
_mongo_db_instance = None

def get_mongo_db():
    """Get MongoDB instance with lazy initialization"""
    global _mongo_db_instance
    if _mongo_db_instance is None:
        _mongo_db_instance = MongoDB()
    return _mongo_db_instance

# For backward compatibility, create a property-like access
class MongoDBAccessor:
    def __getattr__(self, name):
        return getattr(get_mongo_db(), name)

mongo_db = MongoDBAccessor() 
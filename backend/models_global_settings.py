"""
Global Settings Models for Feature Control
"""
from datetime import datetime
from bson import ObjectId
from config.database import DatabaseConfig

mongo_db = DatabaseConfig.get_database()

class GlobalSettings:
    """Global Settings collection for feature control"""
    
    @staticmethod
    def get_collection():
        return mongo_db.global_settings
    
    @staticmethod
    def create_default_settings():
        """Create default feature settings for all roles"""
        default_settings = {
            'student': {
                'dashboard': {'enabled': True, 'required': True, 'name': 'Dashboard', 'description': 'Main dashboard view'},
                'online_tests': {'enabled': True, 'required': False, 'name': 'Online Tests', 'description': 'Take online exams and tests'},
                'practice_tests': {'enabled': True, 'required': False, 'name': 'Practice Tests', 'description': 'Practice with Versant modules'},
                'crt_modules': {'enabled': True, 'required': False, 'name': 'CRT Modules', 'description': 'Access CRT aptitude and technical modules'},
                '': {'enabled': True, 'required': False, 'name': 'Unified Tests', 'description': 'Take comprehensive unified tests with multiple sections'},
                'progress_tracking': {'enabled': True, 'required': False, 'name': 'Progress Tracking', 'description': 'View progress analytics and statistics'},
                'test_history': {'enabled': True, 'required': False, 'name': 'Test History', 'description': 'View past test attempts and results'},
                'profile': {'enabled': True, 'required': False, 'name': 'Profile', 'description': 'Manage user profile and settings'}
            },
            'campus_admin': {
                'dashboard': {'enabled': True, 'required': True, 'name': 'Dashboard', 'description': 'Main dashboard view'},
                'student_management': {'enabled': True, 'required': False, 'name': 'Student Management', 'description': 'Manage students in campus'},
                'test_management': {'enabled': True, 'required': False, 'name': 'Test Management', 'description': 'Create and manage tests'},
                'batch_management': {'enabled': True, 'required': False, 'name': 'Batch Management', 'description': 'Manage course batches'},
                'reports': {'enabled': True, 'required': False, 'name': 'Reports', 'description': 'View campus reports and analytics'},
                'profile': {'enabled': True, 'required': False, 'name': 'Profile', 'description': 'Manage admin profile and settings'}
            },
            'course_admin': {
                'dashboard': {'enabled': True, 'required': True, 'name': 'Dashboard', 'description': 'Main dashboard view'},
                'batch_management': {'enabled': True, 'required': False, 'name': 'Batch Management', 'description': 'Manage course batches'},
                'student_management': {'enabled': True, 'required': False, 'name': 'Student Management', 'description': 'Manage students in course'},
                'test_management': {'enabled': True, 'required': False, 'name': 'Test Management', 'description': 'Create and manage tests'},
                'reports': {'enabled': True, 'required': False, 'name': 'Reports', 'description': 'View course reports and analytics'},
                'profile': {'enabled': True, 'required': False, 'name': 'Profile', 'description': 'Manage admin profile and settings'}
            }
        }
        
        # Check if settings already exist
        existing_settings = list(mongo_db.global_settings.find({'setting_type': 'feature_control'}))
        
        if not existing_settings:
            # Create default settings for each role
            for role, features in default_settings.items():
                setting_doc = {
                    'setting_type': 'feature_control',
                    'role': role,
                    'features': features,
                    'created_at': datetime.now(),
                    'updated_at': datetime.now(),
                    'updated_by': None  # Will be set when superadmin makes changes
                }
                mongo_db.global_settings.insert_one(setting_doc)
                print(f"Created default feature settings for {role}")
        else:
            print("Feature settings already exist, skipping default creation")
    
    @staticmethod
    def get_feature_settings(role):
        """Get feature settings for a specific role"""
        setting = mongo_db.global_settings.find_one({
            'setting_type': 'feature_control',
            'role': role
        })
        
        if not setting:
            # Return default settings if not found
            return GlobalSettings.create_default_settings_for_role(role)
        
        return setting.get('features', {})
    
    @staticmethod
    def update_feature_settings(role, features, updated_by):
        """Update feature settings for a specific role"""
        result = mongo_db.global_settings.update_one(
            {
                'setting_type': 'feature_control',
                'role': role
            },
            {
                '$set': {
                    'features': features,
                    'updated_at': datetime.now(),
                    'updated_by': ObjectId(updated_by) if updated_by else None
                }
            },
            upsert=True
        )
        return result
    
    @staticmethod
    def get_all_feature_settings():
        """Get feature settings for all roles"""
        settings = list(mongo_db.global_settings.find({
            'setting_type': 'feature_control'
        }))
        
        result = {}
        for setting in settings:
            result[setting['role']] = setting.get('features', {})
        
        return result
    
    @staticmethod
    def create_default_settings_for_role(role):
        """Create default settings for a specific role if not found"""
        default_features = {
            'student': {
                'dashboard': {'enabled': True, 'required': True, 'name': 'Dashboard', 'description': 'Main dashboard view'},
                'online_tests': {'enabled': True, 'required': False, 'name': 'Online Tests', 'description': 'Take online exams and tests'},
                'practice_tests': {'enabled': True, 'required': False, 'name': 'Practice Tests', 'description': 'Practice with Versant modules'},
                'crt_modules': {'enabled': True, 'required': False, 'name': 'CRT Modules', 'description': 'Access CRT aptitude and technical modules'},
                '': {'enabled': True, 'required': False, 'name': 'Unified Tests', 'description': 'Take comprehensive unified tests with multiple sections'},
                'progress_tracking': {'enabled': True, 'required': False, 'name': 'Progress Tracking', 'description': 'View progress analytics and statistics'},
                'test_history': {'enabled': True, 'required': False, 'name': 'Test History', 'description': 'View past test attempts and results'},
                'profile': {'enabled': True, 'required': False, 'name': 'Profile', 'description': 'Manage user profile and settings'}
            },
            'campus_admin': {
                'dashboard': {'enabled': True, 'required': True, 'name': 'Dashboard', 'description': 'Main dashboard view'},
                'student_management': {'enabled': True, 'required': False, 'name': 'Student Management', 'description': 'Manage students in campus'},
                'test_management': {'enabled': True, 'required': False, 'name': 'Test Management', 'description': 'Create and manage tests'},
                'batch_management': {'enabled': True, 'required': False, 'name': 'Batch Management', 'description': 'Manage course batches'},
                'reports': {'enabled': True, 'required': False, 'name': 'Reports', 'description': 'View campus reports and analytics'},
                'profile': {'enabled': True, 'required': False, 'name': 'Profile', 'description': 'Manage admin profile and settings'}
            },
            'course_admin': {
                'dashboard': {'enabled': True, 'required': True, 'name': 'Dashboard', 'description': 'Main dashboard view'},
                'batch_management': {'enabled': True, 'required': False, 'name': 'Batch Management', 'description': 'Manage course batches'},
                'student_management': {'enabled': True, 'required': False, 'name': 'Student Management', 'description': 'Manage students in course'},
                'test_management': {'enabled': True, 'required': False, 'name': 'Test Management', 'description': 'Create and manage tests'},
                'reports': {'enabled': True, 'required': False, 'name': 'Reports', 'description': 'View course reports and analytics'},
                'profile': {'enabled': True, 'required': False, 'name': 'Profile', 'description': 'Manage admin profile and settings'}
            }
        }
        
        features = default_features.get(role, {})
        
        # Create the setting document
        setting_doc = {
            'setting_type': 'feature_control',
            'role': role,
            'features': features,
            'created_at': datetime.now(),
            'updated_at': datetime.now(),
            'updated_by': None
        }
        
        mongo_db.global_settings.insert_one(setting_doc)
        return features

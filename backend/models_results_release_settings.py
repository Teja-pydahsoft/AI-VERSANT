from datetime import datetime
from bson import ObjectId
from pymongo import MongoClient
import os

class ResultsReleaseSettings:
    def __init__(self, mongo_db):
        self.db = mongo_db
        self.collection = mongo_db.results_release_settings
        self.auto_release_jobs = mongo_db.auto_release_jobs
        self.release_history = mongo_db.release_history
        
    def create_default_settings(self):
        """Create default global settings if none exist"""
        existing = self.collection.find_one({"type": "global"})
        if not existing:
            default_settings = {
                "type": "global",
                "enabled": False,
                "rules": {
                    "immediate_release": False,
                    "days_after_creation": None,
                    "days_after_end_date": None,
                    "specific_time": None,
                    "timezone": "UTC"
                },
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            self.collection.insert_one(default_settings)
            return default_settings
        return existing
    
    def get_global_settings(self):
        """Get global release settings"""
        settings = self.collection.find_one({"type": "global"})
        if not settings:
            return self.create_default_settings()
        return settings
    
    def update_global_settings(self, settings_data):
        """Update global release settings"""
        # Remove _id from settings_data if present to avoid MongoDB immutable field error
        settings_data_copy = settings_data.copy()
        settings_data_copy.pop('_id', None)
        settings_data_copy["updated_at"] = datetime.utcnow()
        
        result = self.collection.update_one(
            {"type": "global"},
            {"$set": settings_data_copy},
            upsert=True
        )
        return result.modified_count > 0 or result.upserted_id is not None
    
    def create_test_schedule(self, test_id, test_type, created_at, end_date=None):
        """Create auto-release schedule for a specific test"""
        global_settings = self.get_global_settings()
        
        if not global_settings.get("enabled", False):
            return None
        
        rules = global_settings.get("rules", {})
        release_time = None
        
        # Calculate release time based on rules
        if rules.get("immediate_release"):
            release_time = created_at
        elif rules.get("days_after_creation"):
            from datetime import timedelta
            release_time = created_at + timedelta(days=rules["days_after_creation"])
        elif rules.get("days_after_end_date") and end_date:
            from datetime import timedelta
            release_time = end_date + timedelta(days=rules["days_after_end_date"])
        elif rules.get("specific_time"):
            # Schedule for specific time of day
            release_time = created_at.replace(
                hour=rules["specific_time"]["hour"],
                minute=rules["specific_time"]["minute"],
                second=0,
                microsecond=0
            )
            # If the time has passed today, schedule for tomorrow
            if release_time <= datetime.utcnow():
                from datetime import timedelta
                release_time += timedelta(days=1)
        
        if not release_time:
            return None
        
        job_data = {
            "test_id": ObjectId(test_id),
            "test_type": test_type,
            "scheduled_release_time": release_time,
            "status": "pending",
            "created_at": datetime.utcnow(),
            "processed_at": None,
            "error_message": None
        }
        
        result = self.auto_release_jobs.insert_one(job_data)
        return str(result.inserted_id)
    
    def get_pending_jobs(self):
        """Get all pending auto-release jobs"""
        return list(self.auto_release_jobs.find({
            "status": "pending",
            "scheduled_release_time": {"$lte": datetime.utcnow()}
        }))
    
    def mark_job_processed(self, job_id, success=True, error_message=None):
        """Mark a job as processed"""
        update_data = {
            "status": "completed" if success else "failed",
            "processed_at": datetime.utcnow()
        }
        if error_message:
            update_data["error_message"] = error_message
        
        self.auto_release_jobs.update_one(
            {"_id": ObjectId(job_id)},
            {"$set": update_data}
        )
    
    def log_release_action(self, test_id, action, admin_id=None, auto_released=False, job_id=None):
        """Log release actions for audit trail"""
        log_entry = {
            "test_id": ObjectId(test_id),
            "action": action,  # "released", "unreleased", "auto_released"
            "admin_id": ObjectId(admin_id) if admin_id else None,
            "auto_released": auto_released,
            "job_id": ObjectId(job_id) if job_id else None,
            "timestamp": datetime.utcnow()
        }
        self.release_history.insert_one(log_entry)
    
    def get_release_history(self, test_id=None, limit=50):
        """Get release history for audit trail"""
        query = {}
        if test_id:
            query["test_id"] = ObjectId(test_id)
        
        return list(self.release_history.find(query)
                   .sort("timestamp", -1)
                   .limit(limit))
    
    def get_test_schedule(self, test_id):
        """Get auto-release schedule for a specific test"""
        return self.auto_release_jobs.find_one({"test_id": ObjectId(test_id)})
    
    def cancel_test_schedule(self, test_id):
        """Cancel auto-release schedule for a test"""
        result = self.auto_release_jobs.update_one(
            {"test_id": ObjectId(test_id), "status": "pending"},
            {"$set": {"status": "cancelled", "processed_at": datetime.utcnow()}}
        )
        return result.modified_count > 0

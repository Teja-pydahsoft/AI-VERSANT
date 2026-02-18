from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime
import pytz
from pymongo import MongoClient
from routes.test_management import notify_students
from flask import current_app

from config.database_simple import DatabaseConfig

# Use central configuration for MongoDB
db = DatabaseConfig.get_database()

def send_daily_test_notifications():
    print(f"[Scheduler] Running daily test notification job at {datetime.now()}")
    # Find all active tests that need notification (customize as needed)
    # Example: Notify for all tests with status 'active' and not expired
    now = datetime.now(pytz.timezone('Asia/Kolkata'))
    tests = db.tests.find({
        'status': 'active',
        # Add more filters if needed, e.g., date range
    })
    for test in tests:
        test_id = str(test['_id'])
        try:
            # Call the notify_students logic (as a Flask test request context)
            with current_app.app_context():
                notify_students(test_id)
            print(f"[Scheduler] Notified students for test {test_id}")
            
            # TODO: Add push notification for daily reminders
        except Exception as e:
            print(f"[Scheduler] Failed to notify for test {test_id}: {e}")

def schedule_daily_notifications(app):
    scheduler = BackgroundScheduler(timezone=pytz.timezone('Asia/Kolkata'))
    scheduler.add_job(send_daily_test_notifications, 'cron', hour=18, minute=0)
    scheduler.start()
    print("[Scheduler] Started for daily test notifications at 6 PM IST")
    # Store scheduler in app for later access if needed
    app.scheduler = scheduler 
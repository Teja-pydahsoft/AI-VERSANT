const cron = require('node-cron');
const logger = require('../utils/logger');
const testNotificationService = require('./testNotificationService');

/**
 * Test Reminder Cron Jobs
 * Handles multiple cron jobs for different notification types
 */
class TestReminderCron {
  constructor() {
    this.jobs = new Map(); // Store multiple jobs
    this.isRunning = false;

    // Cron schedules for different notification types
    this.schedules = {
      push: process.env.TEST_REMINDER_PUSH_CRON || '0 */6 * * *', // Every 6 hours for push notifications
      smsEmail: process.env.TEST_REMINDER_SMS_EMAIL_CRON || '0 18 * * *' // 6 PM IST daily for SMS/Email
    };

    logger.info(`📅 Push reminder cron schedule: ${this.schedules.push}`);
    logger.info(`📅 SMS/Email reminder cron schedule: ${this.schedules.smsEmail}`);
  }

  /**
   * Start the cron jobs for different notification types
   */
  start() {
    if (this.isRunning) {
      logger.warn('⚠️ Test reminder cron jobs are already running');
      return;
    }

    try {
      logger.info('⏰ Starting test reminder cron jobs...');

      // 1. Push notifications every 6 hours
      const pushJob = cron.schedule(this.schedules.push, async () => {
        try {
          logger.info('🔔 Push notification reminder cron triggered (every 6 hours)');
          const result = await this.sendPushRemindersOnly();
          logger.info('✅ Push reminder cron completed:', result);
        } catch (error) {
          logger.error('❌ Push reminder cron failed:', error);
        }
      }, {
        scheduled: true,
        timezone: 'Asia/Kolkata'
      });

      // 2. SMS and Email at 6 PM IST daily
      const smsEmailJob = cron.schedule(this.schedules.smsEmail, async () => {
        try {
          logger.info('📧 SMS/Email reminder cron triggered (6 PM IST daily)');
          const result = await this.sendSmsEmailRemindersOnly();
          logger.info('✅ SMS/Email reminder cron completed:', result);
        } catch (error) {
          logger.error('❌ SMS/Email reminder cron failed:', error);
        }
      }, {
        scheduled: true,
        timezone: 'Asia/Kolkata'
      });

      // Store jobs
      this.jobs.set('push', pushJob);
      this.jobs.set('smsEmail', smsEmailJob);

      this.isRunning = true;
      logger.info('✅ Test reminder cron jobs started successfully');
      logger.info(`📅 Push reminders: ${this.schedules.push} IST`);
      logger.info(`📅 SMS/Email reminders: ${this.schedules.smsEmail} IST`);

    } catch (error) {
      logger.error('❌ Failed to start test reminder cron jobs:', error);
      throw error;
    }
  }

  /**
   * Send push notifications only (every 6 hours)
   */
  async sendPushRemindersOnly() {
    try {
      logger.info('🔔 Processing push notification reminders only...');
      
      // Use the centralized method from testNotificationService
      const result = await testNotificationService.sendTestRemindersPushOnly();
      
      logger.info('✅ Push reminder cron completed:', result);
      return result;

    } catch (error) {
      logger.error('❌ Error sending push reminders only:', error);
      throw error;
    }
  }

  /**
   * Send SMS and Email only (6 PM IST daily)
   */
  async sendSmsEmailRemindersOnly() {
    try {
      logger.info('📧 Processing SMS/Email reminders only...');

      // Check notification settings
      const notificationService = require('./notificationService');
      const settings = await notificationService.getNotificationSettings();

      if (!settings.mailEnabled && !settings.smsEnabled) {
        logger.info('⚠️ Both SMS and Email notifications disabled - skipping SMS/Email reminders');
        return { success: true, message: 'SMS and Email notifications disabled', skipped: true };
      }

      // Use the sendTestReminders method but only send SMS/Email
      const result = await testNotificationService.sendTestRemindersSmsEmailOnly();

      return {
        success: true,
        type: 'sms_email_only',
        data: result,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('❌ Error sending SMS/Email reminders only:', error);
      throw error;
    }
  }

  /**
   * Stop all cron jobs
   */
  stop() {
    let stoppedCount = 0;
    for (const [type, job] of this.jobs.entries()) {
      if (job) {
        job.stop();
        stoppedCount++;
        logger.info(`🛑 ${type} reminder cron job stopped`);
      }
    }

    if (stoppedCount > 0) {
      this.isRunning = false;
      logger.info(`🛑 Stopped ${stoppedCount} test reminder cron jobs`);
    }
  }

  /**
   * Get next scheduled run times for all jobs
   */
  getNextRuns() {
    const nextRuns = {};
    for (const [type, job] of this.jobs.entries()) {
      if (job) {
        nextRuns[type] = 'Scheduled'; // Simplified - would need actual next run calculation
      } else {
        nextRuns[type] = 'Not scheduled';
      }
    }
    return nextRuns;
  }

  /**
   * Get cron jobs status
   */
  getStatus() {
    return {
      running: this.isRunning,
      schedules: this.schedules,
      timezone: 'Asia/Kolkata',
      jobs: Array.from(this.jobs.keys()),
      nextRuns: this.getNextRuns()
    };
  }

  /**
   * Manually trigger push reminders (for testing)
   */
  async triggerPushReminders() {
    try {
      logger.info('🔧 Manually triggering push reminder job');
      const result = await this.sendPushRemindersOnly();
      logger.info('✅ Manual push trigger completed:', result);
      return result;
    } catch (error) {
      logger.error('❌ Manual push trigger failed:', error);
      throw error;
    }
  }

  /**
   * Manually trigger SMS/Email reminders (for testing)
   */
  async triggerSmsEmailReminders() {
    try {
      logger.info('🔧 Manually triggering SMS/Email reminder job');
      const result = await this.sendSmsEmailRemindersOnly();
      logger.info('✅ Manual SMS/Email trigger completed:', result);
      return result;
    } catch (error) {
      logger.error('❌ Manual SMS/Email trigger failed:', error);
      throw error;
    }
  }
}

module.exports = new TestReminderCron();

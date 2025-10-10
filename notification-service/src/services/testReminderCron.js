const cron = require('node-cron');
const logger = require('../utils/logger');
const testNotificationService = require('./testNotificationService');

/**
 * Test Reminder Cron Job
 * Runs periodically to send test reminder notifications
 */
class TestReminderCron {
  constructor() {
    this.job = null;
    this.isRunning = false;
    // Run every 30 minutes: '*/30 * * * *'
    // Run every hour: '0 * * * *'
    // Run every 6 hours: '0 */6 * * *'
    this.schedule = process.env.TEST_REMINDER_CRON_SCHEDULE || '0 */6 * * *'; // Every 6 hours by default
  }

  /**
   * Start the cron job
   */
  start() {
    if (this.isRunning) {
      logger.warn('⚠️ Test reminder cron job is already running');
      return;
    }

    try {
      logger.info(`⏰ Starting test reminder cron job with schedule: ${this.schedule}`);

      this.job = cron.schedule(this.schedule, async () => {
        try {
          logger.info('⏰ Test reminder cron job triggered');
          const result = await testNotificationService.sendTestReminders();
          logger.info('✅ Test reminder cron job completed:', result);
        } catch (error) {
          logger.error('❌ Test reminder cron job failed:', error);
        }
      }, {
        scheduled: true,
        timezone: 'Asia/Kolkata' // IST timezone
      });

      this.isRunning = true;
      logger.info('✅ Test reminder cron job started successfully');
      logger.info(`📅 Next run: ${this.getNextRun()}`);

    } catch (error) {
      logger.error('❌ Failed to start test reminder cron job:', error);
      throw error;
    }
  }

  /**
   * Stop the cron job
   */
  stop() {
    if (this.job) {
      this.job.stop();
      this.isRunning = false;
      logger.info('🛑 Test reminder cron job stopped');
    }
  }

  /**
   * Get next scheduled run time
   */
  getNextRun() {
    if (!this.job) {
      return 'Not scheduled';
    }
    // This is a simplified version - actual implementation would calculate next run
    return 'Check cron schedule: ' + this.schedule;
  }

  /**
   * Get cron job status
   */
  getStatus() {
    return {
      running: this.isRunning,
      schedule: this.schedule,
      timezone: 'Asia/Kolkata',
      nextRun: this.getNextRun()
    };
  }

  /**
   * Manually trigger the cron job (for testing)
   */
  async triggerManually() {
    try {
      logger.info('🔧 Manually triggering test reminder job');
      const result = await testNotificationService.sendTestReminders();
      logger.info('✅ Manual trigger completed:', result);
      return result;
    } catch (error) {
      logger.error('❌ Manual trigger failed:', error);
      throw error;
    }
  }
}

module.exports = new TestReminderCron();

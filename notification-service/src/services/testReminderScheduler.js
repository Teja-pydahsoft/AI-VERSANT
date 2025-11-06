const cron = require('node-cron');
const axios = require('axios');
const logger = require('../utils/logger');
const notificationService = require('./notificationService');

class TestReminderScheduler {
  constructor() {
    this.isRunning = false;
    this.job = null;
  }

  /**
   * Start the scheduler
   * Runs at 12 PM and 6 PM IST
   */
  start() {
    if (this.isRunning) {
      logger.warn('⚠️ Test reminder scheduler is already running');
      return;
    }

    // Schedule: 12 PM and 6 PM (18:00)
    this.job = cron.schedule('0 12,18 * * *', async () => {
      await this.sendTestReminders();
    }, {
      scheduled: true,
      timezone: "Asia/Kolkata" // Indian timezone
    });

    this.isRunning = true;
    logger.info('✅ Test reminder scheduler started');
    logger.info('📅 Schedule: 12 PM and 6 PM IST');
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.job) {
      this.job.stop();
      this.isRunning = false;
      logger.info('🛑 Test reminder scheduler stopped');
    }
  }

  /**
   * Send test reminders by calling the test-reminder endpoint
   */
  async sendTestReminders() {
    try {
      const now = new Date();
      const hour = now.getHours();

      // Check notification settings before proceeding
      const settings = await notificationService.getNotificationSettings();
      if (!settings.pushEnabled && !settings.mailEnabled && !settings.smsEnabled) {
        logger.info('⚠️ All notifications are disabled. Skipping scheduled test reminders.');
        return;
      }

      // Double-check time (12 PM or 6 PM)
      if (hour !== 12 && hour !== 18) {
        logger.info(`⏰ Skipping test reminders (current hour: ${hour}, outside 12 PM or 6 PM)`);
        return;
      }

      logger.info('🔔 Starting scheduled test reminders...');
      logger.info(`⏰ Current time: ${now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);

      // Call the test-reminder endpoint
      const response = await axios.post('http://localhost:3001/api/test-notifications/test-reminder', {}, {
        timeout: 60000 // 60 seconds timeout
      });

      if (response.status === 200) {
        const result = response.data;
        logger.info(`✅ Test reminders sent successfully`);
        logger.info(`📊 Results: ${result.data?.total_sent || 0} sent, ${result.data?.total_skipped || 0} skipped`);
      } else {
        logger.error(`❌ Test reminder endpoint returned status: ${response.status}`);
      }

    } catch (error) {
      logger.error('❌ Error sending scheduled test reminders:', error.message);
      if (error.response) {
        logger.error('Response data:', error.response.data);
      }
    }
  }

  /**
   * Manually trigger test reminders (for testing)
   */
  async triggerNow() {
    logger.info('🔔 Manually triggering test reminders...');
    await this.sendTestReminders();
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      schedule: '12 PM and 6 PM IST',
      timezone: 'Asia/Kolkata',
      nextRun: this.isRunning ? 'Check cron schedule' : 'Not scheduled'
    };
  }
}

// Export singleton instance
const scheduler = new TestReminderScheduler();
module.exports = scheduler;
const cron = require('node-cron');
const axios = require('axios');
const logger = require('../utils/logger');

class TestReminderScheduler {
  constructor() {
    this.isRunning = false;
    this.job = null;
  }

  /**
   * Start the scheduler
   * Runs every 3 hours between 9 AM and 9 PM
   * Schedule: 9 AM, 12 PM, 3 PM, 6 PM, 9 PM
   */
  start() {
    if (this.isRunning) {
      logger.warn('⚠️ Test reminder scheduler is already running');
      return;
    }

    // Run every 3 hours: 0 9,12,15,18,21 * * *
    // This means: At minute 0 of hours 9, 12, 15, 18, and 21
    this.job = cron.schedule('0 9,12,15,18,21 * * *', async () => {
      await this.sendTestReminders();
    }, {
      scheduled: true,
      timezone: "Asia/Kolkata" // Indian timezone
    });

    this.isRunning = true;
    logger.info('✅ Test reminder scheduler started');
    logger.info('📅 Schedule: Every 3 hours (9 AM, 12 PM, 3 PM, 6 PM, 9 PM IST)');
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

      // Double-check time (9 AM to 9 PM)
      if (hour < 9 || hour >= 21) {
        logger.info(`⏰ Skipping test reminders (current hour: ${hour}, outside 9 AM - 9 PM)`);
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
      schedule: 'Every 3 hours (9 AM, 12 PM, 3 PM, 6 PM, 9 PM IST)',
      timezone: 'Asia/Kolkata',
      nextRun: this.isRunning ? 'Check cron schedule' : 'Not scheduled'
    };
  }
}

// Export singleton instance
const scheduler = new TestReminderScheduler();
module.exports = scheduler;

const logger = require('../utils/logger');

// Simple in-memory queue system (no Redis needed)
class SimpleQueue {
  constructor(name, processor, concurrency = 5) {
    this.name = name;
    this.processor = processor;
    this.concurrency = concurrency;
    this.queue = [];
    this.processing = 0;
    this.stats = {
      total: 0,
      processed: 0,
      failed: 0
    };
  }

  async add(jobName, data, options = {}) {
    const job = {
      id: Date.now() + Math.random(),
      name: jobName,
      data,
      options,
      createdAt: new Date(),
      attempts: 0,
      maxAttempts: options.attempts || 3
    };
    
    this.queue.push(job);
    this.stats.total++;
    
    // Process immediately if not at concurrency limit
    if (this.processing < this.concurrency) {
      this.processNext();
    }
    
    return job;
  }

  async processNext() {
    if (this.processing >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const job = this.queue.shift();
    if (!job) return;

    this.processing++;
    
    try {
      await this.processor(job);
      this.stats.processed++;
      logger.info(`✅ ${this.name} job completed: ${job.id}`);
    } catch (error) {
      this.stats.failed++;
      job.attempts++;
      
      if (job.attempts < job.maxAttempts) {
        // Retry with exponential backoff
        const delay = Math.pow(2, job.attempts) * 1000;
        setTimeout(() => {
          this.queue.unshift(job);
          this.processing--;
          this.processNext();
        }, delay);
        logger.warn(`⚠️ ${this.name} job failed, retrying (${job.attempts}/${job.maxAttempts}): ${job.id}`);
      } else {
        logger.error(`❌ ${this.name} job failed permanently: ${job.id}`, error);
        this.processing--;
        this.processNext();
      }
    }
  }

  getJobCounts() {
    return {
      waiting: this.queue.length,
      active: this.processing,
      completed: this.stats.processed,
      failed: this.stats.failed
    };
  }
}

let emailQueue;
let smsQueue;
let pushQueue;

const initializeQueues = async () => {
  try {
    // Create simple queues
    emailQueue = new SimpleQueue('email', require('../processors/emailProcessor'), 10);
    smsQueue = new SimpleQueue('sms', require('../processors/smsProcessor'), 5);
    pushQueue = new SimpleQueue('push', require('../processors/pushProcessor'), 20);

    logger.info('✅ All queues initialized successfully (in-memory)');

  } catch (error) {
    logger.error('❌ Queue initialization failed:', error);
    throw error;
  }
};

// No setup needed for simple queues

const getEmailQueue = () => emailQueue;
const getSmsQueue = () => smsQueue;
const getPushQueue = () => pushQueue;

module.exports = { 
  initializeQueues, 
  getEmailQueue, 
  getSmsQueue, 
  getPushQueue 
};

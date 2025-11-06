#!/usr/bin/env node
/**
 * VERSANT Notification Service
 * Dedicated microservice for handling all types of notifications
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import modules
const logger = require('./utils/logger');
const { connectDatabase } = require('./config/database');
const errorHandler = require('./middleware/errorHandler');
const { validateApiKey } = require('./middleware/auth');

// Import routes
const notificationRoutes = require('./routes/notifications');
const notificationSettingsRoutes = require('./routes/notificationSettings');
const templateRoutes = require('./routes/templates');
const analyticsRoutes = require('./routes/analytics');
const healthRoutes = require('./routes/health');
const pushRoutes = require('./routes/push');
const subscriptionRoutes = require('./routes/subscriptions');
const testNotificationRoutes = require('./routes/testNotifications');
const emailRoutes = require('./routes/email');
const smsRoutes = require('./routes/sms');
const testNotificationRoutesNew = require('./routes/testNotificationRoutes');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(compression());

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:8000'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Logging
app.use(morgan('combined', {
  stream: { write: message => logger.info(message.trim()) }
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API Key validation for analytics endpoints only (notifications are public)
app.use('/api/analytics', validateApiKey);

// Routes
app.use('/api/notifications', testNotificationRoutesNew); // New test notification routes
app.use('/api/notification-settings', notificationSettingsRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/test-notifications', testNotificationRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/sms', smsRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'VERSANT Notification Service',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// Error handling
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.originalUrl
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
async function startServer() {
  try {
    // Connect to database
    await connectDatabase();
    logger.info('✅ Database connected');

    // Initialize test notification service
    const testNotificationService = require('./services/testNotificationService');
    await testNotificationService.initialize();
    logger.info('✅ Test Notification Service initialized');

    // Start test reminder scheduler (existing)
    try {
      const testReminderScheduler = require('./services/testReminderScheduler');
      testReminderScheduler.start();
    } catch (err) {
      logger.warn('⚠️ Old test reminder scheduler not found (expected)');
    }

    // Start test reminder cron jobs (new)
    const testReminderCron = require('./services/testReminderCron');
    testReminderCron.start();
    logger.info('✅ Test Reminder Cron Jobs started');

    // Start server
    app.listen(PORT, () => {
      logger.info(`🚀 Notification Service running on port ${PORT}`);
      logger.info(`📊 Health check: http://localhost:${PORT}/api/health`);
      logger.info(`📧 Email service: http://localhost:${PORT}/api/email/status`);
      logger.info(`📱 SMS service: http://localhost:${PORT}/api/sms/status`);
      logger.info(`📋 Test notifications: http://localhost:${PORT}/api/notifications/status`);
      logger.info(`🔔 Push reminders: Every 6 hours IST`);
      logger.info(`📧 SMS/Email reminders: 6 PM IST daily`);
    });

  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

module.exports = app;

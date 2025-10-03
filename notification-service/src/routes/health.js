const express = require('express');
const mongoose = require('mongoose');
const pushNotificationService = require('../services/pushNotificationService');
const logger = require('../utils/logger');

const router = express.Router();

// Health check endpoint
router.get('/', async (req, res) => {
  try {
    const health = {
      service: 'VERSANT Notification Service',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime(),
      checks: {}
    };

    // Database check
    try {
      await mongoose.connection.db.admin().ping();
      health.checks.database = { status: 'healthy', responseTime: Date.now() };
    } catch (error) {
      health.checks.database = { status: 'unhealthy', error: error.message };
      health.status = 'unhealthy';
    }

    // Service check
    const pushStatus = pushNotificationService.getStatus();
    health.checks.services = {
      status: 'healthy',
      email: process.env.BREVO_API_KEY ? 'configured' : 'not configured',
      sms: process.env.BULKSMS_API_KEY ? 'configured' : 'not configured',
      push: pushStatus.overall,
      pushDetails: pushStatus
    };


    // Memory usage
    const memUsage = process.memoryUsage();
    health.checks.memory = {
      status: 'healthy',
      usage: {
        rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
        external: Math.round(memUsage.external / 1024 / 1024) + ' MB'
      }
    };

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);

  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      service: 'VERSANT Notification Service',
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Detailed metrics endpoint
router.get('/metrics', async (req, res) => {
  try {
    const metrics = {
      timestamp: new Date().toISOString(),
      services: {
        email: process.env.BREVO_API_KEY ? 'configured' : 'not configured',
        sms: process.env.BULKSMS_API_KEY ? 'configured' : 'not configured',
        push: (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) ? 'configured' : 'not configured'
      },
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      }
    };

    res.json(metrics);

  } catch (error) {
    logger.error('Metrics collection failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to collect metrics',
      error: error.message
    });
  }
});

module.exports = router;

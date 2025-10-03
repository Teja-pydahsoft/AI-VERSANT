const express = require('express');
const { Notification } = require('../models/Notification');
const logger = require('../utils/logger');

const router = express.Router();

// Get analytics dashboard data
router.get('/dashboard', async (req, res) => {
  try {
    const { startDate, endDate, type } = req.query;
    
    const filter = {};
    if (type) filter.type = type;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    // Get basic stats
    const totalNotifications = await Notification.countDocuments(filter);
    const sentNotifications = await Notification.countDocuments({ ...filter, status: 'sent' });
    const failedNotifications = await Notification.countDocuments({ ...filter, status: 'failed' });
    const queuedNotifications = await Notification.countDocuments({ ...filter, status: 'queued' });

    // Get stats by type
    const statsByType = await Notification.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$type',
          total: { $sum: 1 },
          sent: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
          queued: { $sum: { $cond: [{ $eq: ['$status', 'queued'] }, 1, 0] } }
        }
      }
    ]);

    // Get hourly stats for the last 24 hours
    const hourlyStats = await Notification.aggregate([
      {
        $match: {
          ...filter,
          createdAt: {
            $gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        }
      },
      {
        $group: {
          _id: {
            hour: { $hour: '$createdAt' },
            type: '$type'
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.hour': 1 }
      }
    ]);

    // Get daily stats for the last 30 days
    const dailyStats = await Notification.aggregate([
      {
        $match: {
          ...filter,
          createdAt: {
            $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            type: '$type'
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.date': 1 }
      }
    ]);

    // Get top recipients
    const topRecipients = await Notification.aggregate([
      { $match: { ...filter, status: 'sent' } },
      {
        $group: {
          _id: '$recipient',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      }
    ]);

    // Calculate success rate
    const successRate = totalNotifications > 0 
      ? ((sentNotifications / totalNotifications) * 100).toFixed(2)
      : 0;

    res.json({
      success: true,
      data: {
        overview: {
          total: totalNotifications,
          sent: sentNotifications,
          failed: failedNotifications,
          queued: queuedNotifications,
          successRate: parseFloat(successRate)
        },
        byType: statsByType,
        hourlyStats,
        dailyStats,
        topRecipients,
        timestamp: new Date()
      }
    });

  } catch (error) {
    logger.error('Error getting analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get analytics',
      error: error.message
    });
  }
});

// Get notification trends
router.get('/trends', async (req, res) => {
  try {
    const { period = '7d', type } = req.query;
    
    let dateFilter = {};
    switch (period) {
      case '1d':
        dateFilter = { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) };
        break;
      case '7d':
        dateFilter = { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
        break;
      case '30d':
        dateFilter = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
        break;
      case '90d':
        dateFilter = { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) };
        break;
    }

    const filter = {
      createdAt: dateFilter
    };
    if (type) filter.type = type;

    const trends = await Notification.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            status: '$status'
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.date': 1 }
      }
    ]);

    res.json({
      success: true,
      data: {
        trends,
        period,
        type: type || 'all'
      }
    });

  } catch (error) {
    logger.error('Error getting trends:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get trends',
      error: error.message
    });
  }
});

// Get performance metrics
router.get('/performance', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const filter = {};
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    // Get average processing time
    const processingStats = await Notification.aggregate([
      { $match: { ...filter, status: 'sent', sentAt: { $exists: true } } },
      {
        $project: {
          processingTime: {
            $subtract: ['$sentAt', '$createdAt']
          },
          type: 1
        }
      },
      {
        $group: {
          _id: '$type',
          avgProcessingTime: { $avg: '$processingTime' },
          minProcessingTime: { $min: '$processingTime' },
          maxProcessingTime: { $max: '$processingTime' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Get error analysis
    const errorAnalysis = await Notification.aggregate([
      { $match: { ...filter, status: 'failed' } },
      {
        $group: {
          _id: '$error',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      }
    ]);

    res.json({
      success: true,
      data: {
        processingStats,
        errorAnalysis,
        timestamp: new Date()
      }
    });

  } catch (error) {
    logger.error('Error getting performance metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get performance metrics',
      error: error.message
    });
  }
});

module.exports = router;

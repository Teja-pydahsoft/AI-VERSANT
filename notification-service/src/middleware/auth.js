const logger = require('../utils/logger');

const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      message: 'API key required'
    });
  }

  // In production, you would validate against a database or environment variable
  const validApiKeys = process.env.NOTIFICATION_API_KEYS?.split(',') || ['default-api-key'];
  
  if (!validApiKeys.includes(apiKey)) {
    logger.warn(`Invalid API key attempt from ${req.ip}`);
    return res.status(401).json({
      success: false,
      message: 'Invalid API key'
    });
  }

  next();
};

module.exports = { validateApiKey };

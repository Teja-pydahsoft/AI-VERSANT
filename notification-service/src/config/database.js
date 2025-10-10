const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDatabase = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/versant_notifications';
    
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    };

    await mongoose.connect(mongoUri, options);
    
    logger.info(`✅ Connected to MongoDB: ${mongoUri.split('@')[1] || mongoUri}`);
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });

  } catch (error) {
    logger.error('❌ Database connection failed:', error);
    throw error;
  }
};

/**
 * Get database instance
 * Returns the native MongoDB driver database object from mongoose connection
 */
const getDatabase = () => {
  if (!mongoose.connection || mongoose.connection.readyState !== 1) {
    throw new Error('Database not connected. Call connectDatabase() first.');
  }
  return mongoose.connection.db;
};

module.exports = { connectDatabase, getDatabase };

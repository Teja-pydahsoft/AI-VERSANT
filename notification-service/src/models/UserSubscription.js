const mongoose = require('mongoose');

const userSubscriptionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  userEmail: {
    type: String,
    required: true,
    index: true
  },
  subscription: {
    endpoint: {
      type: String,
      required: true
    },
    keys: {
      p256dh: {
        type: String,
        required: true
      },
      auth: {
        type: String,
        required: true
      }
    }
  },
  deviceInfo: {
    userAgent: String,
    platform: String,
    browser: String,
    isMobile: Boolean
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastUsed: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for better performance
userSubscriptionSchema.index({ userId: 1, isActive: 1 });
userSubscriptionSchema.index({ userEmail: 1, isActive: 1 });
userSubscriptionSchema.index({ 'subscription.endpoint': 1 });

// Update the updatedAt field before saving
userSubscriptionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const UserSubscription = mongoose.model('UserSubscription', userSubscriptionSchema);

module.exports = { UserSubscription };

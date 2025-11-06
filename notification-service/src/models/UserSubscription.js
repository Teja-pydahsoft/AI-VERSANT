const mongoose = require('mongoose');

// OneSignal-only subscription model - matches backend schema
const userSubscriptionSchema = new mongoose.Schema({
  user_id: {
    type: String,
    required: true,
    index: true
  },
  userEmail: {
    type: String,
    index: true
  },
  // OneSignal player_id - unique identifier for the device/subscription
  player_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // Provider
  provider: {
    type: String,
    default: 'onesignal',
    index: true
  },
  tags: {
    type: [String],
    default: []
  },
  platform: {
    type: String
  },
  browser: {
    type: String
  },
  device_info: {
    type: mongoose.Schema.Types.Mixed
  },
  is_active: {
    type: Boolean,
    default: true,
    index: true
  },
  last_seen_at: {
    type: Date,
    default: Date.now
  },
  last_subscribed: {
    type: Date,
    default: Date.now
  },
  last_heartbeat: {
    type: Date,
    default: Date.now
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
}, { 
  collection: 'push_subscriptions'
});

// Indexes for better performance
userSubscriptionSchema.index({ user_id: 1, is_active: 1 });
userSubscriptionSchema.index({ player_id: 1 });
userSubscriptionSchema.index({ provider: 1, is_active: 1 });
userSubscriptionSchema.index({ user_id: 1, provider: 1, player_id: 1 });

// Update the updated_at field before saving
userSubscriptionSchema.pre('save', function(next) {
  this.updated_at = new Date();
  next();
});

const UserSubscription = mongoose.model('UserSubscription', userSubscriptionSchema);

module.exports = { UserSubscription };

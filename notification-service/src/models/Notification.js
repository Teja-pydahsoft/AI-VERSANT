const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['email', 'sms', 'push']
  },
  recipient: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  template: {
    type: String,
    default: null
  },
  priority: {
    type: Number,
    default: 3,
    min: 1,
    max: 5
  },
  status: {
    type: String,
    enum: ['queued', 'processing', 'sent', 'failed', 'cancelled'],
    default: 'queued'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  error: {
    type: String,
    default: null
  },
  sentAt: {
    type: Date,
    default: null
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

// Update the updatedAt field before saving
notificationSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Indexes for better performance
notificationSchema.index({ type: 1, status: 1 });
notificationSchema.index({ recipient: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ status: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = { Notification };

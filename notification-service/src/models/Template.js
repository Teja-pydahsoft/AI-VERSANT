const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  type: {
    type: String,
    required: true,
    enum: ['email', 'sms', 'push']
  },
  subject: {
    type: String,
    default: ''
  },
  content: {
    type: String,
    required: true
  },
  variables: [{
    name: String,
    description: String,
    required: Boolean,
    defaultValue: String
  }],
  isActive: {
    type: Boolean,
    default: true
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
templateSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Indexes
templateSchema.index({ type: 1, isActive: 1 });
templateSchema.index({ name: 1 });

const Template = mongoose.model('Template', templateSchema);

module.exports = { Template };

const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  plan: {
    type: String,
    enum: ['weekly', 'monthly', 'yearly', 'superlike', 'undo', 'boost'],
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'inactive', 'cancelled'],
    default: 'pending',
  },
  superLikes: {
    type: Number,
    default: 0,
  },
  undos: {
    type: Number,
    default: 0,
  },
  startDate: {
    type: Date,
    default: Date.now,
  },
  endDate: {
    type: Date,
  },
}, { timestamps: true });

module.exports = mongoose.model('Subscription', subscriptionSchema);
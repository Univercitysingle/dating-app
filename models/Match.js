const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
  user1Uid: { // UID of the first user
    type: String,
    required: true,
    index: true,
  },
  user2Uid: { // UID of the second user
    type: String,
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['pending', 'matched', 'declined_user1', 'declined_user2', 'unmatched'],
    required: true,
    default: 'pending',
  },
  likedBy: { // Array of UIDs who have liked. Max 2 UIDs.
    type: [String],
    default: [],
    validate: [val => val.length <= 2, 'likedBy array can contain at most 2 UIDs']
  }
}, { timestamps: true });

module.exports = mongoose.model('Match', matchSchema);

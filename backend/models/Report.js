const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  reporterUid: {
    type: String,
    required: true,
    index: true,
  },
  reportedUserUid: {
    type: String,
    required: true,
    index: true,
  },
  reason: { // Detailed text reason from the reporter
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  category: {
    type: String,
    required: true,
    enum: [
      'spam',
      'inappropriate_profile_content', // e.g., photos, bio
      'harassment_or_bullying',
      'hateful_conduct',
      'impersonation',
      'underage_user',
      'scam_or_fraud',
      'other'
    ]
  },
  status: {
    type: String,
    enum: [
      'pending_review',
      'under_investigation',
      'resolved_no_action',
      'resolved_warning_issued_to_reported_user',
      'resolved_reporter_notified', // If we notify reporter
      'resolved_content_removed',
      'resolved_user_suspended',
      'resolved_user_banned'
    ],
    default: 'pending_review',
    index: true,
  },
  adminNotes: { // Notes by an admin reviewing the report
    type: String,
    default: '',
    trim: true
  }
}, { timestamps: true });

// Compound index to quickly find reports by reporter or reported user
reportSchema.index({ reporterUid: 1, reportedUserUid: 1 });
// Index to help admins find pending reports
reportSchema.index({ status: 1, createdAt: -1 });


module.exports = mongoose.model('Report', reportSchema);

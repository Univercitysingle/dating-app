const express = require('express');
const router = express.Router();
const Report = require('../models/Report');
const User = require('../models/User'); // To verify users exist

// Submit a new report
router.post('/', async (req, res) => {
  const reporterUid = req.user.uid; // From authMiddleware
  const { reportedUserUid, reason, category } = req.body;

  if (!reportedUserUid || !reason || !category) {
    return res.status(400).json({ error: 'Missing required fields: reportedUserUid, reason, category.' });
  }

  if (reporterUid === reportedUserUid) {
    return res.status(400).json({ error: 'Cannot report yourself.' });
  }

  try {
    // Verify both reporter and reported user exist (optional but good practice)
    const [reporterExists, reportedUserExists] = await Promise.all([
      User.findOne({ uid: reporterUid }).select('_id').lean(),
      User.findOne({ uid: reportedUserUid }).select('_id').lean()
    ]);

    if (!reporterExists) {
      // This should ideally not happen if authMiddleware is working
      return res.status(404).json({ error: 'Reporter user not found.' });
    }
    if (!reportedUserExists) {
      return res.status(404).json({ error: 'Reported user not found.' });
    }

    // Validate category against schema enum (Mongoose will also do this on save)
    const validCategories = Report.schema.path('category').enumValues;
    if (!validCategories.includes(category)) {
        return res.status(400).json({ error: `Invalid category. Must be one of: ${validCategories.join(', ')}` });
    }

    const newReport = new Report({
      reporterUid,
      reportedUserUid,
      reason,
      category,
      // status defaults to 'pending_review'
    });

    await newReport.save();

    res.status(201).json({ message: 'Report submitted successfully.', reportId: newReport._id });

  } catch (error) {
    // Mongoose validation errors (like enum for category) will be caught here
    if (error.name === 'ValidationError') {
        return res.status(400).json({ error: error.message });
    }
    console.error("Error submitting report:", error);
    res.status(500).json({ error: 'Failed to submit report.' });
  }
});

module.exports = router;

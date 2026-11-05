const Report = require('../models/Report');
const User = require('../models/User'); // To verify users exist

const submitReport = async (req, res) => {
  const reporterUid = req.user && req.user.uid; // From authMiddleware
  const { reportedUserUid, reason, category } = req.body || {};
  if (typeof reporterUid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(reporterUid)) {
    return res.status(401).json({ error: 'Authenticated user identity is invalid.' });
  }

  if (typeof reportedUserUid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(reportedUserUid)) {
    return res.status(400).json({ error: 'A valid reportedUserUid is required.' });
  }
  if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 2000) {
    return res.status(400).json({ error: 'Reason must be a non-empty string of at most 2000 characters.' });
  }
  if (typeof category !== 'string') {
    return res.status(400).json({ error: 'A valid report category is required.' });
  }

  if (reporterUid === reportedUserUid) {
    return res.status(400).json({ error: 'Cannot report yourself.' });
  }

  try {
    const [reporterExists, reportedUserExists] = await Promise.all([
      User.findOne({ uid: reporterUid }).select('_id').lean(),
      User.findOne({ uid: reportedUserUid }).select('_id').lean()
    ]);

    if (!reporterExists) {
      return res.status(404).json({ error: 'Reporter user not found.' });
    }
    if (!reportedUserExists) {
      return res.status(404).json({ error: 'Reported user not found.' });
    }

    const validCategories = Report.schema.path('category').enumValues;
    if (!validCategories.includes(category)) {
        return res.status(400).json({ error: `Invalid category. Must be one of: ${validCategories.join(', ')}` });
    }

    const newReport = new Report({
      reporterUid,
      reportedUserUid,
      reason: reason.trim(),
      category,
    });

    await newReport.save();

    res.status(201).json({ message: 'Report submitted successfully.', reportId: newReport._id });
    console.log('Report submitted successfully.');

  } catch (error) {
    if (error.name === 'ValidationError') {
        // Log validation errors as well, as they are client input issues but good to monitor
        console.warn('Report validation failed.');
        return res.status(400).json({ error: error.message });
    }
    console.error('Report submission failed.');
    res.status(500).json({ error: 'An unexpected error occurred while submitting report.' });
  }
};

module.exports = {
  submitReport,
};

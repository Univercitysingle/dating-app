const Report = require('../models/Report');
const User = require('../models/User'); // To verify users exist

const submitReport = async (req, res) => {
  const reporterUid = req.user.uid; // From authMiddleware
  const { reportedUserUid, reason, category } = req.body;

  if (!reportedUserUid || !reason || !category) {
    return res.status(400).json({ error: 'Missing required fields: reportedUserUid, reason, category.' });
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
      reason,
      category,
    });

    await newReport.save();

    res.status(201).json({ message: 'Report submitted successfully.', reportId: newReport._id });
    console.log(`Report submitted successfully by UID: ${reporterUid} against UID: ${reportedUserUid}, Report ID: ${newReport._id}`);

  } catch (error) {
    if (error.name === 'ValidationError') {
        // Log validation errors as well, as they are client input issues but good to monitor
        console.error(`Validation error submitting report by UID ${reporterUid} against UID ${reportedUserUid}:`, error.message);
        return res.status(400).json({ error: error.message });
    }
    console.error(`Error submitting report by UID ${reporterUid} against UID ${reportedUserUid}:`, error);
    res.status(500).json({ error: 'An unexpected error occurred while submitting report.' });
  }
};

module.exports = {
  submitReport,
};

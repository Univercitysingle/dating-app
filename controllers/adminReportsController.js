const Report = require('../models/Report');
const User = require('../models/User');

// List all reports with pagination and filtering
const listReports = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;
    const { status, reportedUserUid } = req.query;

    let query = {};
    if (status) {
      query.status = status;
    }
    if (reportedUserUid) {
      query.reportedUserUid = reportedUserUid;
    }

    const reports = await Report.find(query)
      .populate({
        path: 'reporterUid',
        model: 'User',
        select: 'name email' // Populate with user's name and email
      })
      .populate({
        path: 'reportedUserUid',
        model: 'User',
        select: 'name email isProfileVisible role' // Populate with reported user's details
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalReports = await Report.countDocuments(query);

    res.json({
      reports,
      totalPages: Math.ceil(totalReports / limit),
      currentPage: page,
    });
  } catch (error) {
    console.error('Error listing reports:', error);
    res.status(500).json({ message: 'Error listing reports', error: error.message });
  }
};

// Perform a moderation action on a report
const performModerationAction = async (req, res) => {
  const { reportId } = req.params;
  // New payload can include duration for suspension, etc.
  const { action, adminNotes, durationDays } = req.body;
  const adminUserId = req.user._id;

  try {
    const report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ message: 'Report not found.' });
    }

    let reportedUser = await User.findOne({ uid: report.reportedUserUid });
    if (!reportedUser) {
      return res.status(404).json({ message: 'Reported user not found.' });
    }

    report.adminNotes = adminNotes || report.adminNotes;

    switch (action) {
      case 'dismiss':
        report.status = 'resolved_no_action';
        break;

      case 'suspend_user':
        if (!durationDays || isNaN(parseInt(durationDays, 10)) || durationDays <= 0) {
          return res.status(400).json({ message: 'Valid duration in days is required for suspension.' });
        }
        const suspensionEndDate = new Date();
        suspensionEndDate.setDate(suspensionEndDate.getDate() + parseInt(durationDays, 10));

        reportedUser.suspendedUntil = suspensionEndDate;
        reportedUser.isProfileVisible = false; // Also hide profile during suspension
        await reportedUser.save();
        report.status = 'resolved_user_suspended';
        req.log.info({
            message: 'User suspended',
            userId: reportedUser.uid,
            adminId: req.user.uid,
            reason: report.reason,
            durationDays: durationDays,
            reportId: reportId
        });
        break;

      case 'ban_user':
        // A "ban" could mean many things. Deleting the user is one option.
        // For now, we'll just mark them as banned and hide them permanently.
        // A more robust system might move them to a separate collection.
        reportedUser.role = 'user'; // Demote them
        reportedUser.isProfileVisible = false;
        // Set suspension to a far-future date to effectively ban them
        reportedUser.suspendedUntil = new Date('9999-12-31');
        await reportedUser.save();
        report.status = 'resolved_user_banned';
        req.log.info({
            message: 'User banned',
            userId: reportedUser.uid,
            adminId: req.user.uid,
            reason: report.reason,
            reportId: reportId
        });
        break;

      default:
        return res.status(400).json({ message: 'Invalid action specified.' });
    }

    await report.save();

    res.json({ message: `Action '${action}' performed successfully.`, report });

  } catch (error) {
    console.error(`Error performing action on report ${reportId}:`, error);
    res.status(500).json({ message: 'Error performing moderation action', error: error.message });
  }
};

const getReportById = async (req, res) => {
  try {
    const { reportId } = req.params;
    const report = await Report.findById(reportId)
      .populate({
        path: 'reporterUid',
        model: 'User',
        select: 'name email'
      })
      .populate({
        path: 'reportedUserUid',
        model: 'User',
        select: 'name email isProfileVisible role suspendedUntil'
      })
      .lean();

    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }
    res.json(report);
  } catch (error) {
    console.error('Error getting report by ID:', error);
    res.status(500).json({ message: 'Error getting report', error: error.message });
  }
};

module.exports = {
  listReports,
  performModerationAction,
  getReportById,
};

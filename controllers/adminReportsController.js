const Report = require('../models/Report');
const User = require('../models/User');

// List all reports with pagination and filtering
const listReports = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;
    const { status } = req.query;

    let query = {};
    if (status) {
      query.status = status;
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
  const { action, adminNotes } = req.body; // e.g., action: 'dismiss', 'suspend_user', 'ban_user'
  const adminUserId = req.user._id; // Assuming auth middleware provides the admin user

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
        reportedUser.isProfileVisible = false; // Example of suspension
        // You might have a specific 'status' field on the User model like 'active', 'suspended'
        await reportedUser.save();
        report.status = 'resolved_user_suspended';
        break;

      case 'ban_user':
        // A "ban" could mean many things. Deleting the user is one option.
        await User.findByIdAndDelete(reportedUser._id);
        report.status = 'resolved_user_banned';
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

module.exports = {
  listReports,
  performModerationAction,
};

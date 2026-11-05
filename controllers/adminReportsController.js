const Report = require('../models/Report');
const User = require('../models/User');

// List all reports with pagination and filtering
const listReports = async (req, res) => {
  try {
    const { page: rawPage, limit: rawLimit, status, search } = req.query;
    const page = rawPage === undefined ? 1 : Number(rawPage);
    const limit = rawLimit === undefined ? 10 : Number(rawLimit);
    if ((rawPage !== undefined && (typeof rawPage !== 'string' || !/^\\d{1,6}$/.test(rawPage))) ||
        (rawLimit !== undefined && (typeof rawLimit !== 'string' || !/^\\d{1,3}$/.test(rawLimit))) ||
        !Number.isSafeInteger(page) || page < 1 || page > 100000 ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({ message: 'Invalid pagination. Page must be 1-100000 and limit must be 1-100.' });
    }
    const skip = (page - 1) * limit;
    const validStatuses = Report.schema.path('status').enumValues;
    if (status !== undefined && (typeof status !== 'string' || !validStatuses.includes(status))) {
      return res.status(400).json({ message: 'Invalid report status.' });
    }
    if (search !== undefined && (typeof search !== 'string' || search.length > 100)) {
      return res.status(400).json({ message: 'Search must be a string of at most 100 characters.' });
    }

    let query = {};
    if (status !== undefined) {
      query.status = status;
    }

    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
      const searchRegex = new RegExp(escapedSearch, 'i');
      const users = await User.find({
        $or: [{ name: searchRegex }, { email: searchRegex }],
      }).select('uid');

      const userUids = users.map(user => user.uid);

      if (userUids.length > 0) {
        query.reportedUserUid = { $in: userUids };
      } else {
        // If no users match, return no reports
        return res.json({
          reports: [],
          totalPages: 0,
          currentPage: 1,
        });
      }
    }

    const reports = await Report.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Manually look up reporter and reported user info since UIDs are strings, not ObjectId refs
    const allUids = [...new Set(reports.flatMap(r => [r.reporterUid, r.reportedUserUid]))];
    const users = await User.find({ uid: { $in: allUids } }).select('uid name email isProfileVisible role').lean();
    const userMap = {};
    users.forEach(u => { userMap[u.uid] = u; });

    const enrichedReports = reports.map(r => ({
      ...r,
      reporter: userMap[r.reporterUid] || null,
      reportedUser: userMap[r.reportedUserUid] || null,
    }));

    const totalReports = await Report.countDocuments(query);

    res.json({
      reports: enrichedReports,
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
        req.log.info('Moderation action completed: user suspended.');
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
        req.log.info('Moderation action completed: user banned.');
        break;

      default:
        return res.status(400).json({ message: 'Invalid action specified.' });
    }

    await report.save();

    res.json({ message: `Action '${action}' performed successfully.`, report });

  } catch (error) {
    console.error('Error performing moderation action.');
    res.status(500).json({ message: 'Error performing moderation action', error: error.message });
  }
};

const getReportById = async (req, res) => {
  try {
    const { reportId } = req.params;
    const report = await Report.findById(reportId).lean();

    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    // Manually look up reporter and reported user since UIDs are strings, not ObjectId refs
    const [reporter, reportedUser] = await Promise.all([
      User.findOne({ uid: report.reporterUid }).select('uid name email').lean(),
      User.findOne({ uid: report.reportedUserUid }).select('uid name email isProfileVisible role suspendedUntil').lean(),
    ]);

    res.json({ ...report, reporter, reportedUser });
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

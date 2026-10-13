const Subscription = require('../models/Subscription');
const LoginHistory = require('../models/LoginHistory');
const AuditLog = require('../models/AuditLog');

// @desc    Get all payment logs
// @route   GET /api/admin/payment-logs
// @access  Private/Admin
const User = require('../models/User');

const getPaymentLogs = async (req, res) => {
  try {
    const { search } = req.query;
    let query = {};

    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escapedSearch, 'i');
      const users = await User.find({
        $or: [{ name: searchRegex }, { email: searchRegex }],
      }).select('_id');

      const userIds = users.map(user => user._id);

      if (userIds.length > 0) {
        query.userId = { $in: userIds };
      } else {
        return res.json([]);
      }
    }

    const payments = await Subscription.find(query)
      .populate('userId', 'name email')
      .sort({ createdAt: -1 });

    res.json(payments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

const getLoginHistory = async (req, res) => {
    try {
        const { search } = req.query;
        let query = {};

        if (search) {
            const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const searchRegex = new RegExp(escapedSearch, 'i');
            const users = await User.find({
                $or: [{ name: searchRegex }, { email: searchRegex }],
            }).select('_id');

            const userIds = users.map(user => user._id);

            if (userIds.length > 0) {
                query.userId = { $in: userIds };
            } else {
                return res.json([]);
            }
        }

        const loginHistory = await LoginHistory.find(query)
            .populate('userId', 'name email')
            .sort({ timestamp: -1 });

        res.json(loginHistory);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

const getAuditLogs = async (req, res) => {
    try {
        const { search } = req.query;
        let query = {};

        if (search) {
            const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const searchRegex = new RegExp(escapedSearch, 'i');
            // In AuditLog, the admin is referenced by adminId, which links to the User model.
            // We need to find the admin users first, then use their IDs to filter the audit logs.
            const admins = await User.find({
                $or: [{ name: searchRegex }, { email: searchRegex }],
                role: { $in: ['admin', 'superadmin'] } // Assuming admins have these roles
            }).select('_id');

            const adminIds = admins.map(admin => admin._id);

            if (adminIds.length > 0) {
                query.adminId = { $in: adminIds };
            } else {
                return res.json([]); // No admins found, so no logs to return
            }
        }

        const auditLogs = await AuditLog.find(query)
            .populate('adminId', 'name email')
            .sort({ timestamp: -1 });

        res.json(auditLogs);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
  getPaymentLogs,
  getLoginHistory,
  getAuditLogs,
};

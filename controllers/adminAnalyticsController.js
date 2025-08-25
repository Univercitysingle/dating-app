const User = require('../models/User');
const Report = require('../models/Report');
const Subscription = require('../models/Subscription');

const getAnalyticsSummary = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // 1. Total Users vs. Paid Users
    const totalUsersPromise = User.countDocuments();
    const paidUsersPromise = Subscription.countDocuments({ status: 'active' });

    // 2. Sign-ups over time (last 30 days)
    const signupsPromise = User.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // 3. User count by location (This is a placeholder, as location data might not be available/reliable)
    // For this example, we'll assume no reliable location data and return a placeholder.
    // A real implementation would require IP-to-location services or user-provided country data.
    const locationsPromise = Promise.resolve([
        {_id: 'USA', count: 100}, {_id: 'Canada', count: 50}, {_id: 'UK', count: 30}
    ]); // Placeholder data

    // 4. Total reported users
    const reportedUsersPromise = Report.distinct('reportedUserUid');

    // Execute all promises in parallel
    const [
      totalUsers,
      paidUsers,
      signups,
      locations,
      reportedUsersResult
    ] = await Promise.all([
      totalUsersPromise,
      paidUsersPromise,
      signupsPromise,
      locationsPromise,
      reportedUsersPromise
    ]);

    res.json({
      userStats: {
        total: totalUsers,
        paid: paidUsers,
        unpaid: totalUsers - paidUsers,
      },
      signupsPerDay: signups,
      locations: locations,
      reportedUsersCount: reportedUsersResult.length,
    });

  } catch (error) {
    console.error('Error fetching analytics summary:', error);
    res.status(500).json({ message: 'Error fetching analytics summary', error: error.message });
  }
};

module.exports = {
  getAnalyticsSummary,
};

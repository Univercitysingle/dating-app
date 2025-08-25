const User = require('../models/User');
const Report = require('../models/Report');
const Subscription = require('../models/Subscription');

const getAnalyticsSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Define the date range for filtering time-series data
    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = { createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) } };
    } else {
      // Default to last 30 days if no range is provided
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      dateFilter = { createdAt: { $gte: thirtyDaysAgo } };
    }

    // 1. Total Users vs. Paid Users (These are overall counts, not affected by date filter for now)
    const totalUsersPromise = User.countDocuments();
    const paidUsersPromise = Subscription.countDocuments({ status: 'active' });

    // 2. Sign-ups over time (filtered by date range)
    const signupsPromise = User.aggregate([
      { $match: dateFilter },
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

const Papa = require('papaparse');

const exportAnalyticsCsv = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = { createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) } };
    } else {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      dateFilter = { createdAt: { $gte: thirtyDaysAgo } };
    }

    // Fetch all necessary data
    const signups = await User.aggregate([
      { $match: dateFilter },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    // We can add more data to the CSV here if needed
    // For now, we will just export the signups data

    if (signups.length === 0) {
        res.setHeader('Content-Type', 'text/plain');
        res.send("No signup data available for the selected date range to export.");
        return;
    }

    const csvData = signups.map(item => ({
      date: item._id,
      new_signups: item.count,
    }));

    const csv = Papa.unparse(csvData);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="analytics_export.csv"');
    res.status(200).end(csv);

  } catch (error) {
    console.error('Error exporting analytics CSV:', error);
    res.status(500).json({ message: 'Error exporting analytics', error: error.message });
  }
};

module.exports = {
  getAnalyticsSummary,
  exportAnalyticsCsv,
};

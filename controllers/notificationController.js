const Notification = require('../models/Notification');

const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ recipientUid: req.user.uid, status: 'pending' })
      .sort({ createdAt: -1 })
      .lean();
    res.json(notifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'An unexpected error occurred.' });
  }
};

module.exports = {
  getNotifications,
};

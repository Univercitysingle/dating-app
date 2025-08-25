const Match = require('../models/Match');
const User = require('../models/User');

const recordSwipe = async (req, res) => {
  const { targetUserId, direction } = req.body;
  const currentUserUid = req.user.uid;
  const log = req.log;

  log.info(`Swipe recorded by ${currentUserUid} on ${targetUserId} with direction ${direction}`);

  if (!targetUserId || !direction) {
    return res.status(400).json({ message: 'targetUserId and direction are required.' });
  }

  if (direction !== 'left' && direction !== 'right') {
    return res.status(400).json({ message: 'Direction must be "left" or "right".' });
  }

  try {
    // Ensure the users are always in the same order to avoid duplicate match docs
    const user1Uid = currentUserUid < targetUserId ? currentUserUid : targetUserId;
    const user2Uid = currentUserUid < targetUserId ? targetUserId : currentUserUid;

    let match = await Match.findOne({ user1Uid, user2Uid });

    if (!match) {
      match = new Match({ user1Uid, user2Uid });
    }

    let isNewMatch = false;
    let matchedUser = null;

    if (direction === 'right') {
      // Add the current user to the likedBy array if they are not already in it
      if (!match.likedBy.includes(currentUserUid)) {
        match.likedBy.push(currentUserUid);
      }

      // Check for a match
      if (match.likedBy.length === 2) {
        match.status = 'matched';
        isNewMatch = true;
        // Fetch the other user's profile to return to the frontend
        matchedUser = await User.findOne({ uid: targetUserId }).select('uid name photos').lean();
      }
    } else { // direction === 'left'
      // Set the status to reflect the decline
      if (match.user1Uid === currentUserUid) {
        match.status = 'declined_user1';
      } else {
        match.status = 'declined_user2';
      }
    }

    await match.save();

    log.info(`Match document updated for ${user1Uid} and ${user2Uid}. Status: ${match.status}`);

    res.status(200).json({
      success: true,
      match: isNewMatch,
      matchedUser: isNewMatch ? matchedUser : null,
    });

  } catch (error) {
    log.error({ err: error }, `Error recording swipe for user ${currentUserUid} on ${targetUserId}`);
    res.status(500).json({ message: 'An error occurred while recording the swipe.' });
  }
};

module.exports = {
  recordSwipe,
};

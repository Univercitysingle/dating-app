const Match = require('../models/Match');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Subscription = require('../models/Subscription');
const { getIO } = require('../services/socket');
const { sanitizeUser } = require('../utils/userUtils');

const recordSwipe = async (currentUserUid, targetUserId, action, matchId) => {
  await User.findOneAndUpdate(
    { uid: currentUserUid },
    {
      lastSwipe: {
        action,
        targetUserId,
        matchId,
        timestamp: new Date(),
      },
    }
  );
};

const emitNotification = (userId, notification) => {
  try {
    getIO().to(userId).emit('new_notification', notification);
  } catch (err) {
    // Socket.io not initialized
  }
  try {
    const { syncNotificationToFirebase } = require('../services/firebaseRealtimeService');
    syncNotificationToFirebase(userId, notification);
  } catch (err) {
    // Firebase sync error ignored
  }
};


const like = async (req, res) => {
  const { userId } = req.body;
  const currentUserUid = req.user.uid;

  try {
    let match = await Match.findOne({
      $or: [
        { user1Uid: currentUserUid, user2Uid: userId },
        { user1Uid: userId, user2Uid: currentUserUid },
      ],
    });

    if (!match) {
      match = new Match({
        user1Uid: currentUserUid,
        user2Uid: userId,
      });
    }

    if (!match.likedBy.includes(currentUserUid)) {
      match.likedBy.push(currentUserUid);
    }

    if (match.likedBy.length === 2) {
      match.status = 'matched';
      // Create a match notification for the other user
      const notification = await Notification.create({
        recipientUid: userId,
        senderUid: currentUserUid,
        type: 'match',
      });
      emitNotification(userId, notification);

      // Delete the original like/superlike notification
      await Notification.findOneAndDelete({
          recipientUid: currentUserUid,
          senderUid: userId,
          type: { $in: ['like', 'superlike'] },
      });

    } else {
        const notification = await Notification.create({
            recipientUid: userId,
            senderUid: currentUserUid,
            type: 'like',
        });
        emitNotification(userId, notification);
    }

    await match.save();
    await recordSwipe(currentUserUid, userId, 'like', match._id);

    req.log.info({
        message: 'User liked another user',
        swiperId: currentUserUid,
        swipedId: userId,
        matchStatus: match.status
    });

    res.json(match);
  } catch (error) {
    req.log.error({ err: error }, "Error in 'like' controller");
    res.status(500).json({ error: 'An unexpected error occurred.' });
  }
};

const pass = async (req, res) => {
    const { userId } = req.body;
    const currentUserUid = req.user.uid;

    try {
      let match = await Match.findOne({
        $or: [
          { user1Uid: currentUserUid, user2Uid: userId },
          { user1Uid: userId, user2Uid: currentUserUid },
        ],
      });

      if (!match) {
        match = new Match({
          user1Uid: currentUserUid,
          user2Uid: userId,
        });
      }

      match.status = 'unmatched';

      await match.save();
      await recordSwipe(currentUserUid, userId, 'pass', match._id);

      // Delete the original like/superlike notification
      await Notification.findOneAndDelete({
        recipientUid: currentUserUid,
        senderUid: userId,
        type: { $in: ['like', 'superlike'] },
    });

    req.log.info({
        message: 'User passed on another user',
        swiperId: currentUserUid,
        swipedId: userId
    });

      res.json(match);
    } catch (error) {
      req.log.error({ err: error }, "Error in 'pass' controller");
      res.status(500).json({ error: 'An unexpected error occurred.' });
    }
  };

const superLike = async (req, res) => {
  const { userId } = req.body;
  const currentUserUid = req.user.uid;

  try {
    const user = await User.findOne({ uid: currentUserUid });

    if ((!user.superLikes || user.superLikes.count <= 0) && user.purchasedSuperLikes <= 0) {
      return res.status(400).json({ error: 'No super likes remaining.' });
    }

    let match = await Match.findOne({
      $or: [
        { user1Uid: currentUserUid, user2Uid: userId },
        { user1Uid: userId, user2Uid: currentUserUid },
      ],
    });

    if (!match) {
      match = new Match({
        user1Uid: currentUserUid,
        user2Uid: userId,
      });
    }

    if (!match.likedBy.includes(currentUserUid)) {
      match.likedBy.push(currentUserUid);
    }

    match.superLike = true;

    if (match.likedBy.length === 2) {
      match.status = 'matched';
      const notification = await Notification.create({
        recipientUid: userId,
        senderUid: currentUserUid,
        type: 'match',
      });
      emitNotification(userId, notification);
       // Delete the original like/superlike notification
       await Notification.findOneAndDelete({
        recipientUid: currentUserUid,
        senderUid: userId,
        type: { $in: ['like', 'superlike'] },
    });
    } else {
        const notification = await Notification.create({
            recipientUid: userId,
            senderUid: currentUserUid,
            type: 'superlike',
        });
        emitNotification(userId, notification);
    }

    if (user.purchasedSuperLikes > 0) {
      user.purchasedSuperLikes -= 1;
    } else {
      user.superLikes.count -= 1;
    }
    await user.save();

    await match.save();
    await recordSwipe(currentUserUid, userId, 'superlike', match._id);

    req.log.info({
        message: 'User superliked another user',
        swiperId: currentUserUid,
        swipedId: userId,
        matchStatus: match.status
    });

    res.json(match);
  } catch (error) {
    req.log.error({ err: error }, "Error in 'superLike' controller");
    res.status(500).json({ error: 'An unexpected error occurred.' });
  }
};

const undoSwipe = async (req, res) => {
  const currentUserUid = req.user.uid;

  try {
    const user = await User.findOne({ uid: currentUserUid });

    if ((!user.undoSwipes || user.undoSwipes.count <= 0) && user.purchasedUndoSwipes <= 0) {
      return res.status(400).json({ error: 'No undo swipes remaining.' });
    }

    if (!user.lastSwipe || !user.lastSwipe.action) {
      return res.status(404).json({ error: 'No swipe to undo.' });
    }

    const { action, matchId, targetUserId } = user.lastSwipe;

    const matchToUndo = await Match.findById(matchId);

    if (!matchToUndo) {
      return res.status(404).json({ error: 'Cannot find the match record for the swipe to undo.' });
    }

    if (action === 'like' || action === 'superlike') {
      matchToUndo.likedBy = matchToUndo.likedBy.filter(uid => uid !== currentUserUid);
      if (action === 'superlike') {
        matchToUndo.superLike = false;
        user.superLikes.count += 1;
      }
    }
    matchToUndo.status = 'pending';

    if (user.purchasedUndoSwipes > 0) {
      user.purchasedUndoSwipes -= 1;
    } else {
      user.undoSwipes.count -= 1;
    }
    user.lastSwipe = undefined;
    await user.save();
    await matchToUndo.save();

    const undoneUser = await User.findOne({ uid: targetUserId }).lean();

    req.log.info({
        message: 'User undid a swipe',
        userId: currentUserUid,
        undoneAction: action,
        undoneTargetId: targetUserId
    });

    res.json({ undoneUser: sanitizeUser(undoneUser, req.user) });

  } catch (error) {
    req.log.error({ err: error }, "Undo swipe error");
    res.status(500).json({ error: 'An unexpected error occurred during undo.' });
  }
};

module.exports = {
  like,
  pass,
  superLike,
  undoSwipe,
};

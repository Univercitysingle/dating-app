const Match = require('../models/Match');
const User = require('../models/User');

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
    }

    await match.save();
    await recordSwipe(currentUserUid, userId, 'like', match._id);

    res.json(match);
  } catch (error) {
    console.error("Error in 'like' controller:", error);
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

    res.json(match);
  } catch (error) {
    console.error("Error in 'pass' controller:", error);
    res.status(500).json({ error: 'An unexpected error occurred.' });
  }
};

const superLike = async (req, res) => {
  const { userId } = req.body;
  const currentUserUid = req.user.uid;

  try {
    const user = await User.findOne({ uid: currentUserUid });

    if (!user.superLikes) {
      user.superLikes = { count: 1, refreshesAt: new Date(Date.now() + 24 * 60 * 60 * 1000) };
    }
    if (user.superLikes.count <= 0) {
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
    }

    user.superLikes.count -= 1;

    if (!user.location || !user.location.type) {
      user.location = { type: 'Point', coordinates: [0, 0] };
    }

    await user.save();
    await match.save();
    await recordSwipe(currentUserUid, userId, 'superlike', match._id);

    res.json(match);
  } catch (error) {
    console.error("Error in 'superLike' controller:", error);
    res.status(500).json({ error: 'An unexpected error occurred.' });
  }
};

const undoSwipe = async (req, res) => {
  const currentUserUid = req.user.uid;

  try {
    const user = await User.findOne({ uid: currentUserUid });

    if (!user.undoSwipes) {
      user.undoSwipes = { count: 3, refreshesAt: new Date(Date.now() + 24 * 60 * 60 * 1000) };
    }
    if (user.undoSwipes.count <= 0) {
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
        if (!user.superLikes) {
            user.superLikes = { count: 0 };
        }
        user.superLikes.count += 1;
      }
    }
    matchToUndo.status = 'pending';

    user.undoSwipes.count -= 1;
    user.lastSwipe = undefined;

    if (!user.location || !user.location.type) {
      user.location = { type: 'Point', coordinates: [0, 0] };
    }

    await user.save();
    await matchToUndo.save();

    const undoneUser = await User.findOne({ uid: targetUserId }).lean();

    res.json({ undoneUser });

  } catch (error) {
    console.error("Undo swipe error:", error);
    res.status(500).json({ error: 'An unexpected error occurred during undo.' });
  }
};

module.exports = {
  like,
  pass,
  superLike,
  undoSwipe,
};

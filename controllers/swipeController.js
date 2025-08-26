const Match = require('../models/Match');
const User = require('../models/User');

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
    res.json(match);
  } catch (error) {
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
    res.json(match);
  } catch (error) {
    res.status(500).json({ error: 'An unexpected error occurred.' });
  }
};

const superLike = async (req, res) => {
  const { userId } = req.body;
  const currentUserUid = req.user.uid;

  try {
    const user = await User.findOne({ uid: currentUserUid });
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
    await user.save();
    await match.save();
    res.json(match);
  } catch (error) {
    res.status(500).json({ error: 'An unexpected error occurred.' });
  }
};

const undoSwipe = async (req, res) => {
  const currentUserUid = req.user.uid;

  try {
    const user = await User.findOne({ uid: currentUserUid });
    if (user.undoSwipes.count <= 0) {
      return res.status(400).json({ error: 'No undo swipes remaining.' });
    }

    const lastMatch = await Match.findOne({
      $or: [{ user1Uid: currentUserUid }, { user2Uid: currentUserUid }],
    }).sort({ updatedAt: -1 });

    if (!lastMatch) {
      return res.status(404).json({ error: 'No swipe to undo.' });
    }

    lastMatch.status = 'pending';
    lastMatch.likedBy = lastMatch.likedBy.filter(uid => uid !== currentUserUid);
    lastMatch.superLike = false;

    user.undoSwipes.count -= 1;
    await user.save();
    await lastMatch.save();
    res.json(lastMatch);
  } catch (error) {
    res.status(500).json({ error: 'An unexpected error occurred.' });
  }
};

module.exports = {
  like,
  pass,
  superLike,
  undoSwipe,
};

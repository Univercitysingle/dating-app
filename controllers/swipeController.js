const Match = require('../models/Match');

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

module.exports = {
  like,
  pass,
};

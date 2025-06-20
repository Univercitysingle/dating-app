const User = require("../models/User");
const Match = require('../models/Match');

const getPotentialMatches = async (req, res) => {
  try {
    const currentUser = await User.findOne({ uid: req.user.uid });
    if (!currentUser) return res.status(404).json({ error: "User not found" });

    const potentialMatches = await User.find({
      uid: {
        $ne: currentUser.uid,
        $nin: currentUser.blocked || []
      },
      gender: currentUser.preference,
      blocked: { $ne: currentUser.uid }
    }).limit(20).select('uid email name age gender bio photos videoProfile isVerified');

    res.json(potentialMatches);
    console.log(`Successfully retrieved potential matches for UID: ${currentUser.uid}`);
  } catch (error) {
    console.error(`Error in getPotentialMatches for UID ${req.user.uid}:`, error);
    res.status(500).json({ error: "An unexpected error occurred while fetching potential matches." });
  }
};

const likeUser = async (req, res) => {
  const currentUserUid = req.user.uid;
  const { targetUserId } = req.params;

  if (currentUserUid === targetUserId) {
    return res.status(400).json({ error: "Cannot like yourself." });
  }

  try {
    const [currentUserDoc, targetUserDoc] = await Promise.all([
      User.findOne({ uid: currentUserUid }).select('blocked'),
      User.findOne({ uid: targetUserId }).select('blocked')
    ]);

    if (!currentUserDoc) {
      return res.status(404).json({ error: "Current user not found." });
    }
    if (!targetUserDoc) {
      return res.status(404).json({ error: "Target user not found." });
    }

    if (currentUserDoc.blocked && currentUserDoc.blocked.includes(targetUserId)) {
      return res.status(403).json({ error: "You have blocked this user. Unblock them to like." });
    }

    if (targetUserDoc.blocked && targetUserDoc.blocked.includes(currentUserUid)) {
      return res.status(403).json({ error: "This user has blocked you." });
    }

    const user1Uid = currentUserUid < targetUserId ? currentUserUid : targetUserId;
    const user2Uid = currentUserUid < targetUserId ? targetUserId : currentUserUid;

    let match = await Match.findOneAndUpdate(
      { user1Uid, user2Uid },
      { $addToSet: { likedBy: currentUserUid } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const u1InLikedBy = match.likedBy.includes(user1Uid);
    const u2InLikedBy = match.likedBy.includes(user2Uid);

    let finalStatus = match.status;

    if (u1InLikedBy && u2InLikedBy) {
      finalStatus = 'matched';
    } else {
      finalStatus = 'pending';
    }

    if (match.status !== finalStatus) {
      match.status = finalStatus;
      await match.save();
    }

    res.status(200).json({
      status: match.status,
      likedBy: match.likedBy,
      matchId: match._id,
      user1Uid: match.user1Uid,
      user2Uid: match.user2Uid
    });
    console.log(`Like action processed for currentUser: ${currentUserUid}, targetUser: ${targetUserId}, match status: ${match.status}`);

  } catch (error) {
    console.error(`Error in likeUser (currentUser: ${currentUserUid}, targetUser: ${targetUserId}):`, error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "An unexpected error occurred while processing like." });
  }
};

const getConfirmedMatches = async (req, res) => {
  const currentUserUid = req.user.uid;

  try {
    const confirmedMatchesDocs = await Match.find({
      $or: [{ user1Uid: currentUserUid }, { user2Uid: currentUserUid }],
      status: 'matched'
    }).lean();

    if (!confirmedMatchesDocs || confirmedMatchesDocs.length === 0) {
      return res.status(200).json([]);
    }

    const matchedUserUids = confirmedMatchesDocs.map(match => {
      return match.user1Uid === currentUserUid ? match.user2Uid : match.user1Uid;
    });

    if (matchedUserUids.length === 0) {
        return res.status(200).json([]);
    }

    const matchedUsersProfiles = await User.find({
      uid: { $in: matchedUserUids }
    }).select('uid email name age gender bio photos videoProfile isVerified');

    res.status(200).json(matchedUsersProfiles);
    console.log(`Successfully retrieved confirmed matches for UID: ${currentUserUid}`);

  } catch (error) {
    console.error(`Error in getConfirmedMatches for UID ${currentUserUid}:`, error);
    res.status(500).json({ error: "An unexpected error occurred while fetching confirmed matches." });
  }
};

module.exports = {
  getPotentialMatches,
  likeUser,
  getConfirmedMatches,
};

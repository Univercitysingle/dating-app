const User = require("../models/User");
const Match = require('../models/Match');

const getPotentialMatches = async (req, res) => {
  try {
    const currentUser = await User.findOne({ uid: req.user.uid });
    if (!currentUser) return res.status(404).json({ error: "User not found" });

    // Build the query object dynamically
    let query = {
      uid: {
        $ne: currentUser.uid,
        $nin: currentUser.blocked || []
      },
      gender: currentUser.preference,
      blocked: { $ne: currentUser.uid }
      // Note: location-based filtering would be added here too if it were part of this subtask's scope for filtering
    };

    // Add filters from query parameters if they exist
    const { education, relationshipGoals, interests, personalityType } = req.query;

    if (education) {
      query.education = education; // Assumes exact match. Case-insensitivity can be added with $regex if needed.
    }

    if (relationshipGoals) {
      query.relationshipGoals = relationshipGoals; // Assumes exact match.
    }

    if (interests) {
      const interestsArray = interests.split(',').map(interest => interest.trim()).filter(interest => interest);
      if (interestsArray.length > 0) {
        query.interests = { $in: interestsArray }; // Match if user has any of the specified interests
      }
    }

    if (personalityType) {
      query['personalityQuizResults.type'] = personalityType; // Exact match for personality type
    }

    // TODO: Implement age range filter if provided in req.query (e.g., minAge, maxAge)
    // TODO: Implement distance filter using $nearSphere for location if provided in req.query

    const selection = 'uid email name age gender bio photos videoProfile isVerified education relationshipGoals location lastActiveAt interests personalityQuizResults';
    const potentialMatches = await User.find(query)
      .limit(20) // Consider making limit configurable or based on subscription tier
      .select(selection);

    res.json(potentialMatches);
    console.log(`Successfully retrieved potential matches for UID: ${currentUser.uid} with filters: ${JSON.stringify(req.query)}`);
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

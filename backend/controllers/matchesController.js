const User = require("../models/User");
const Match = require('../models/Match');
const { getRankedMatches } = require('../../services/matchAI'); // Corrected path

const getPotentialMatches = async (req, res) => {
  try {
    // req.user is populated by populateUserMiddleware and is the full Mongoose document
    const currentUser = req.user;
    if (!currentUser) {
      // This should technically be caught by auth middlewares, but as a safeguard:
      return res.status(401).json({ error: "Current user not available." });
    }

    // Build the query object dynamically for filtering candidates
    let queryOptions = {
      uid: {
        $ne: currentUser.uid, // Exclude current user
        $nin: currentUser.blocked || [] // Exclude users blocked by current user
      },
      gender: currentUser.preference, // Filter by current user's preference
      blocked: { $ne: currentUser.uid }, // Exclude users who have blocked current user
      isProfileVisible: true, // Only match with users whose profiles are visible
      // TODO: Add filter for users who have not been 'unmatched' or 'passed' by currentUser
    };

    // Add explicit filters from query parameters
    const { education, relationshipGoals, interests, personalityType } = req.query;

    if (education) {
      queryOptions.education = education;
    }
    if (relationshipGoals) {
      queryOptions.relationshipGoals = relationshipGoals;
    }
    if (interests) {
      const interestsArray = interests.split(',').map(interest => interest.trim()).filter(interest => interest);
      if (interestsArray.length > 0) {
        queryOptions.interests = { $in: interestsArray };
      }
    }
    if (personalityType) {
      queryOptions['personalityQuizResults.type'] = personalityType;
    }

    // Fields to select for candidate profiles
    const selection = 'uid email name age gender bio photos videoProfile isVerified education relationshipGoals location lastActiveAt interests personalityQuizResults';

    // Fetch all potential candidates matching the explicit filters
    // Do not limit here; ranking and pagination will be done on the full filtered set.
    const potentialCandidates = await User.find(queryOptions).select(selection).lean(); // Use .lean() for performance

    if (!potentialCandidates || potentialCandidates.length === 0) {
      return res.json({
        matches: [],
        currentPage: 1,
        totalPages: 0,
        totalMatches: 0,
      });
    }

    // Rank the filtered candidates using matchAI service
    // currentUser (req.user) is a Mongoose document. getRankedMatches expects plain objects or Mongoose docs.
    // potentialCandidates are now plain objects due to .lean()
    const rankedMatches = getRankedMatches(currentUser.toObject(), potentialCandidates); // Convert currentUser to plain object for matchAI

    // Paginate the ranked matches
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10; // Default limit to 10
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;

    const paginatedResults = rankedMatches.slice(startIndex, endIndex);
    const totalMatches = rankedMatches.length;
    const totalPages = Math.ceil(totalMatches / limit);

    res.json({
      matches: paginatedResults, // Array of { user: UserProfile, matchScore: Number }
      currentPage: page,
      totalPages: totalPages,
      totalMatches: totalMatches,
    });
    console.log(`Successfully retrieved and ranked potential matches for UID: ${currentUser.uid} with filters: ${JSON.stringify(req.query)}`);

  } catch (error) {
    console.error(`Error in getPotentialMatches for UID ${req.user ? req.user.uid : 'N/A'}:`, error);
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

const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Match = require('../models/Match'); // Import Match model

// Return a list of potential matches based on simple preference filtering
router.get("/", async (req, res) => {
  const currentUser = await User.findOne({ uid: req.user.uid });
  if (!currentUser) return res.status(404).json({ error: "User not found" });

  // Updated filter:
  // - Not the current user
  // - Not in the list of users I (currentUser) have blocked
  // - Matches my preference (gender)
  // - This user has not blocked me (currentUser)
  const potentialMatches = await User.find({
    uid: {
      $ne: currentUser.uid, // Not the current user
      $nin: currentUser.blocked || [] // And not in the list of users I have blocked
    },
    gender: currentUser.preference, // Matches my preference
    blocked: { $ne: currentUser.uid } // And this user has not blocked me
  }).limit(20).select('uid email name age gender bio photos videoProfile isVerified'); // Select fields

  res.json(potentialMatches);
});

// Like a user
router.post("/like/:targetUserId", async (req, res) => {
  const currentUserUid = req.user.uid;
  const { targetUserId } = req.params;

  if (currentUserUid === targetUserId) {
    return res.status(400).json({ error: "Cannot like yourself." });
  }

  try {
    // Fetch both users to check their blocked lists
    const [currentUserDoc, targetUserDoc] = await Promise.all([
      User.findOne({ uid: currentUserUid }).select('blocked'), // Only need 'blocked' field
      User.findOne({ uid: targetUserId }).select('blocked')   // Only need 'blocked' field
    ]);

    if (!currentUserDoc) { // Should not happen if auth is working
      return res.status(404).json({ error: "Current user not found." });
    }
    if (!targetUserDoc) {
      return res.status(404).json({ error: "Target user not found." });
    }

    // Check if current user has blocked the target user
    if (currentUserDoc.blocked && currentUserDoc.blocked.includes(targetUserId)) {
      return res.status(403).json({ error: "You have blocked this user. Unblock them to like." });
    }

    // Check if target user has blocked the current user
    if (targetUserDoc.blocked && targetUserDoc.blocked.includes(currentUserUid)) {
      return res.status(403).json({ error: "This user has blocked you." });
    }

    // Ensure consistent order for user UIDs in the Match document query
    const user1Uid = currentUserUid < targetUserId ? currentUserUid : targetUserId;
    const user2Uid = currentUserUid < targetUserId ? targetUserId : currentUserUid;

    // Find existing match or create a new one, and add current user to likedBy
    let match = await Match.findOneAndUpdate(
      { user1Uid, user2Uid },
      { $addToSet: { likedBy: currentUserUid } },
      { upsert: true, new: true, setDefaultsOnInsert: true } // setDefaultsOnInsert ensures 'status: pending' and 'likedBy: []' on creation before $addToSet
    );

    // After the above operation, 'match' is the document.
    // Its 'likedBy' array has been updated.
    // Its 'status' is 'pending' if it was just created (due to schema default and setDefaultsOnInsert).
    // If it existed, status is whatever it was.

    // Now, check if this like results in a match or updates status.
    const u1InLikedBy = match.likedBy.includes(user1Uid);
    const u2InLikedBy = match.likedBy.includes(user2Uid);

    let finalStatus = match.status; // Start with current/default status

    if (u1InLikedBy && u2InLikedBy) {
      finalStatus = 'matched';
    } else {
      // If not matched, it should be pending.
      // If it was 'declined_userX' or 'unmatched' before, a new like action might make it 'pending' again.
      // The schema default to 'pending' is good for new docs.
      // For existing docs, if not 'matched' now, it implies 'pending'.
      finalStatus = 'pending';
    }

    // Only update status if it has changed
    if (match.status !== finalStatus) {
      match.status = finalStatus;
      await match.save(); // Save the status update
    }

    res.status(200).json({
      status: match.status,
      likedBy: match.likedBy,
      matchId: match._id,
      user1Uid: match.user1Uid, // For clarity in response
      user2Uid: match.user2Uid  // For clarity in response
    });

  } catch (error) {
    console.error("Error liking user:", error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to process like." });
  }
});

// Get confirmed matches for the current user
router.get("/confirmed", async (req, res) => {
  const currentUserUid = req.user.uid;

  try {
    // Find matches where the current user is involved and status is 'matched'
    const confirmedMatchesDocs = await Match.find({
      $or: [{ user1Uid: currentUserUid }, { user2Uid: currentUserUid }],
      status: 'matched'
    }).lean(); // .lean() for faster queries if we don't need Mongoose full documents

    if (!confirmedMatchesDocs || confirmedMatchesDocs.length === 0) {
      return res.status(200).json([]); // No confirmed matches
    }

    const matchedUserUids = confirmedMatchesDocs.map(match => {
      return match.user1Uid === currentUserUid ? match.user2Uid : match.user1Uid;
    });

    if (matchedUserUids.length === 0) { // Should be redundant due to the earlier check, but good for safety
        return res.status(200).json([]);
    }

    // Fetch profile details for the matched users
    const matchedUsersProfiles = await User.find({
      uid: { $in: matchedUserUids }
    }).select('uid email name age gender bio photos videoProfile isVerified'); // Select relevant fields

    res.status(200).json(matchedUsersProfiles);

  } catch (error) {
    console.error("Error fetching confirmed matches:", error);
    res.status(500).json({ error: "Failed to retrieve confirmed matches." });
  }
});

module.exports = router;

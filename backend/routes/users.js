const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Match = require('../models/Match'); // Import Match model

// Get current user profile
router.get("/me", async (req, res) => {
  const user = await User.findOne({ uid: req.user.uid });
  res.json(user);
});

// Update profile
router.put("/me", async (req, res) => {
  const update = req.body;
  const allowedFields = ["name", "age", "gender", "preference", "bio", "photos"];
  const sanitizedUpdate = {};

  for (const key of allowedFields) {
    if (update[key] !== undefined) sanitizedUpdate[key] = update[key];
  }

  try {
    const user = await User.findOneAndUpdate({ uid: req.user.uid }, sanitizedUpdate, { new: true });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// Unblock a user
router.post("/unblock/:userIdToUnblock", async (req, res) => {
  const currentUserUid = req.user.uid;
  const { userIdToUnblock } = req.params;

  if (currentUserUid === userIdToUnblock) {
    return res.status(400).json({ error: "Cannot unblock yourself." });
  }

  try {
    // Remove userIdToUnblock from currentUser's blocked list
    const updatedUser = await User.findOneAndUpdate(
      { uid: currentUserUid },
      { $pull: { blocked: userIdToUnblock } },
      { new: true }
    );

    if (!updatedUser) { // Should not happen if authMiddleware ensures currentUserUid is valid
        return res.status(404).json({ error: "Current user not found." });
    }

    // No changes needed to the Match document status upon unblock.
    // If they were 'unmatched' due to a block, they remain so until new 'like' actions.

    res.status(200).json({ message: `User ${userIdToUnblock} successfully unblocked.` });

  } catch (error) {
    console.error("Error unblocking user:", error);
    res.status(500).json({ error: "Failed to unblock user." });
  }
});

// Block a user
router.post("/block/:userIdToBlock", async (req, res) => {
  const currentUserUid = req.user.uid;
  const { userIdToBlock } = req.params;

  if (currentUserUid === userIdToBlock) {
    return res.status(400).json({ error: "Cannot block yourself." });
  }

  try {
    // Verify target user exists
    const userToBlockDoc = await User.findOne({ uid: userIdToBlock }).select('_id'); // Renamed to avoid conflict
    if (!userToBlockDoc) {
      return res.status(404).json({ error: "User to block not found." });
    }

    // Add userIdToBlock to currentUser's blocked list
    const updatedUser = await User.findOneAndUpdate(
      { uid: currentUserUid },
      { $addToSet: { blocked: userIdToBlock } },
      { new: true } // Returns the updated document
    );

    if (!updatedUser) { // Should not happen if authMiddleware is working correctly
        return res.status(404).json({ error: "Current user not found during update." });
    }

    // Update any existing Match document between these two users
    // Ensure user1Uid and user2Uid are consistently ordered
    const u1 = currentUserUid < userIdToBlock ? currentUserUid : userIdToBlock;
    const u2 = currentUserUid < userIdToBlock ? userIdToBlock : currentUserUid;

    await Match.findOneAndUpdate(
      { user1Uid: u1, user2Uid: u2 },
      {
        $set: { status: 'unmatched', likedBy: [] } // Set status to unmatched and clear likedBy array
      },
      // { new: true } // Not strictly needed if we don't use the updated match doc directly
    );
    // If no match document exists, findOneAndUpdate will do nothing, which is fine.

    res.status(200).json({ message: `User ${userIdToBlock} successfully blocked.` });

  } catch (error)
 {
    console.error("Error blocking user:", error);
    res.status(500).json({ error: "Failed to block user." });
  }
});

module.exports = router;

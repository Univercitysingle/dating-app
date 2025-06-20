const User = require("../models/User");
const Match = require('../models/Match');

const getCurrentUserProfile = async (req, res) => {
  try {
    const user = await User.findOne({ uid: req.user.uid });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user);
    console.log(`Successfully retrieved profile for UID: ${req.user.uid}`);
  } catch (error) {
    console.error(`Error fetching user profile for UID ${req.user.uid}:`, error);
    res.status(500).json({ error: "An unexpected error occurred while fetching user profile." });
  }
};

const updateCurrentUserProfile = async (req, res) => {
  const update = req.body;
  const allowedFields = ["name", "age", "gender", "preference", "bio", "photos"];
  const sanitizedUpdate = {};

  for (const key of allowedFields) {
    if (update[key] !== undefined) sanitizedUpdate[key] = update[key];
  }

  try {
    const user = await User.findOneAndUpdate({ uid: req.user.uid }, sanitizedUpdate, { new: true });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user);
    console.log(`Successfully updated profile for UID: ${req.user.uid}`);
  } catch (err) {
    console.error(`Error updating profile for UID ${req.user.uid}:`, err);
    res.status(500).json({ error: "An unexpected error occurred while updating profile." });
  }
};

const unblockUser = async (req, res) => {
  const currentUserUid = req.user.uid;
  const { userIdToUnblock } = req.params;

  if (currentUserUid === userIdToUnblock) {
    return res.status(400).json({ error: "Cannot unblock yourself." });
  }

  try {
    const updatedUser = await User.findOneAndUpdate(
      { uid: currentUserUid },
      { $pull: { blocked: userIdToUnblock } },
      { new: true }
    );

    if (!updatedUser) {
        return res.status(404).json({ error: "Current user not found." });
    }
    res.status(200).json({ message: `User ${userIdToUnblock} successfully unblocked.` });
    console.log(`User ${userIdToUnblock} unblocked by UID: ${currentUserUid}`);

  } catch (error) {
    console.error(`Error unblocking user ${userIdToUnblock} by UID ${currentUserUid}:`, error);
    res.status(500).json({ error: "An unexpected error occurred while unblocking user." });
  }
};

const blockUser = async (req, res) => {
  const currentUserUid = req.user.uid;
  const { userIdToBlock } = req.params;

  if (currentUserUid === userIdToBlock) {
    return res.status(400).json({ error: "Cannot block yourself." });
  }

  try {
    const userToBlockDoc = await User.findOne({ uid: userIdToBlock }).select('_id');
    if (!userToBlockDoc) {
      return res.status(404).json({ error: "User to block not found." });
    }

    const updatedUser = await User.findOneAndUpdate(
      { uid: currentUserUid },
      { $addToSet: { blocked: userIdToBlock } },
      { new: true }
    );

    if (!updatedUser) {
        return res.status(404).json({ error: "Current user not found during update." });
    }

    const u1 = currentUserUid < userIdToBlock ? currentUserUid : userIdToBlock;
    const u2 = currentUserUid < userIdToBlock ? userIdToBlock : currentUserUid;

    await Match.findOneAndUpdate(
      { user1Uid: u1, user2Uid: u2 },
      {
        $set: { status: 'unmatched', likedBy: [] }
      },
    );
    res.status(200).json({ message: `User ${userIdToBlock} successfully blocked.` });
    console.log(`User ${userIdToBlock} blocked by UID: ${currentUserUid}`);

  } catch (error) {
    console.error(`Error blocking user ${userIdToBlock} by UID ${currentUserUid}:`, error);
    res.status(500).json({ error: "An unexpected error occurred while blocking user." });
  }
};

module.exports = {
  getCurrentUserProfile,
  updateCurrentUserProfile,
  unblockUser,
  blockUser,
};

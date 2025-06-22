const User = require("../models/User");
const Match = require('../models/Match');
const fs = require("fs");
const path = require("path");
const { uploadToS3 } = require("../services/awsS3");
const multer = require("multer");

const getCurrentUserProfile = async (req, res) => {
  console.log("UsersController: getCurrentUserProfile entered.");
  // Log the entire req.user object if it exists, otherwise indicate it's missing
  if (req.user) {
    console.log("UsersController: req.user object received:", JSON.stringify(req.user, null, 2));
  } else {
    console.warn("UsersController: req.user object is MISSING when getCurrentUserProfile was called. This should not happen if authMiddleware ran successfully.");
    // This case should ideally be caught by authMiddleware not calling next() or by it erroring out.
    // If it reaches here without req.user, it's a logic flaw somewhere or authMiddleware didn't run.
    return res.status(500).json({ error: "User information missing in request processing." });
  }

  const userUid = req.user.uid; // Get UID from the populated req.user
  console.log(`UsersController: Attempting to find user by UID: ${userUid}`);

  try {
    const user = await User.findOne({ uid: userUid });
    if (!user) {
      console.warn(`UsersController: User not found in database for UID: ${userUid}`);
      return res.status(404).json({ error: "User not found" });
    }
    console.log(`UsersController: Successfully retrieved profile for UID: ${userUid}. Sending user data as JSON.`);
    res.json(user);
  } catch (error) {
    console.error(`UsersController: Error fetching user profile for UID ${userUid}:`, error.message || error);
    if (process.env.NODE_ENV !== "production" && error.stack) {
      console.error("UsersController: Error stack:", error.stack);
    }
    res.status(500).json({ error: "An unexpected error occurred while fetching user profile." });
  }
};

const updateCurrentUserProfile = async (req, res) => {
  console.log("UsersController: updateCurrentUserProfile entered for UID:", req.user ? req.user.uid : "UNKNOWN_UID");
  const update = req.body;
  const allowedFields = [
    "name", "age", "gender", "preference", "bio", "photos",
    "interests", "profilePrompts", "audioBioUrl", "videoBioUrl",
    "personalityQuizResults", "socialMediaLinks",
    "education", "relationshipGoals", "location",
    "lastActiveAt"
  ];
  const sanitizedUpdate = {};

  for (const key of allowedFields) {
    if (update[key] !== undefined) sanitizedUpdate[key] = update[key];
  }
  console.log("UsersController: Sanitized update data:", JSON.stringify(sanitizedUpdate, null, 2));

  if (!req.user || !req.user.uid) {
    console.error("UsersController: updateCurrentUserProfile - req.user or req.user.uid is missing. Cannot proceed.");
    return res.status(401).json({ error: "Authentication details missing." });
  }

  try {
    const user = await User.findOneAndUpdate({ uid: req.user.uid }, sanitizedUpdate, { new: true });
    if (!user) {
      console.warn(`UsersController: User not found during update for UID: ${req.user.uid}`);
      return res.status(404).json({ error: "User not found" });
    }
    console.log(`UsersController: Successfully updated profile for UID: ${req.user.uid}. Sending updated user data.`);
    res.json(user);
  } catch (err) {
    console.error(`UsersController: Error updating profile for UID ${req.user.uid}:`, err.message || err);
    if (process.env.NODE_ENV !== "production" && err.stack) {
      console.error("UsersController: Update Error stack:", err.stack);
    }
    res.status(500).json({ error: "An unexpected error occurred while updating profile." });
  }
};

const unblockUser = async (req, res) => {
  const currentUserUid = req.user.uid;
  const { userIdToUnblock } = req.params;
  console.log(`UsersController: unblockUser entered. CurrentUser: ${currentUserUid}, UserToUnblock: ${userIdToUnblock}`);

  if (currentUserUid === userIdToUnblock) {
    console.warn(`UsersController: User ${currentUserUid} attempted to unblock themselves.`);
    return res.status(400).json({ error: "Cannot unblock yourself." });
  }

  try {
    const updatedUser = await User.findOneAndUpdate(
      { uid: currentUserUid },
      { $pull: { blocked: userIdToUnblock } },
      { new: true }
    );

    if (!updatedUser) {
      console.warn(`UsersController: Current user ${currentUserUid} not found during unblock operation.`);
      return res.status(404).json({ error: "Current user not found." });
    }
    console.log(`UsersController: User ${userIdToUnblock} successfully unblocked by UID: ${currentUserUid}.`);
    res.status(200).json({ message: `User ${userIdToUnblock} successfully unblocked.` });
  } catch (error) {
    console.error(`UsersController: Error unblocking user ${userIdToUnblock} by UID ${currentUserUid}:`, error.message || error);
    if (process.env.NODE_ENV !== "production" && error.stack) {
      console.error("UsersController: Unblock Error stack:", error.stack);
    }
    res.status(500).json({ error: "An unexpected error occurred while unblocking user." });
  }
};

const blockUser = async (req, res) => {
  const currentUserUid = req.user.uid;
  const { userIdToBlock } = req.params;
  console.log(`UsersController: blockUser entered. CurrentUser: ${currentUserUid}, UserToBlock: ${userIdToBlock}`);

  if (currentUserUid === userIdToBlock) {
    console.warn(`UsersController: User ${currentUserUid} attempted to block themselves.`);
    return res.status(400).json({ error: "Cannot block yourself." });
  }

  try {
    const userToBlockDoc = await User.findOne({ uid: userIdToBlock }).select('_id');
    if (!userToBlockDoc) {
      console.warn(`UsersController: User to block (${userIdToBlock}) not found.`);
      return res.status(404).json({ error: "User to block not found." });
    }
    console.log(`UsersController: User to block (${userIdToBlock}) found. Proceeding with block.`);

    const updatedUser = await User.findOneAndUpdate(
      { uid: currentUserUid },
      { $addToSet: { blocked: userIdToBlock } },
      { new: true }
    );

    if (!updatedUser) {
      console.warn(`UsersController: Current user ${currentUserUid} not found during block operation.`);
      return res.status(404).json({ error: "Current user not found during update." });
    }

    const u1 = currentUserUid < userIdToBlock ? currentUserUid : userIdToBlock;
    const u2 = currentUserUid < userIdToBlock ? userIdToBlock : currentUserUid;

    console.log(`UsersController: Updating match status for users ${u1} and ${u2} to 'unmatched'.`);
    await Match.findOneAndUpdate(
      { user1Uid: u1, user2Uid: u2 },
      { $set: { status: 'unmatched', likedBy: [] } }
    );
    console.log(`UsersController: User ${userIdToBlock} successfully blocked by UID: ${currentUserUid}.`);
    res.status(200).json({ message: `User ${userIdToBlock} successfully blocked.` });
  } catch (error) {
    console.error(`UsersController: Error blocking user ${userIdToBlock} by UID ${currentUserUid}:`, error.message || error);
    if (process.env.NODE_ENV !== "production" && error.stack) {
      console.error("UsersController: Block Error stack:", error.stack);
    }
    res.status(500).json({ error: "An unexpected error occurred while blocking user." });
  }
};

const handleFileUploadToS3 = async (req, res, fileTypePrefix) => {
  const userUidForLog = req.user ? req.user.uid : "UNKNOWN_UID_FILE_UPLOAD";
  console.log(`UsersController: handleFileUploadToS3 entered for ${fileTypePrefix}, User: ${userUidForLog}`);
  try {
    if (req.fileValidationError) {
      console.warn(`UsersController: File validation error for ${fileTypePrefix} by ${userUidForLog}: ${req.fileValidationError}`);
      return res.status(400).json({ message: req.fileValidationError });
    }
    if (!req.file) {
      console.warn(`UsersController: No file uploaded or rejected by filter for ${fileTypePrefix} by ${userUidForLog}.`);
      return res.status(400).json({ message: "No file uploaded or file was rejected by filter." });
    }
    console.log(`UsersController: File received for ${fileTypePrefix}: ${req.file.originalname}, size: ${req.file.size}, path: ${req.file.path}`);

    const fileContent = fs.readFileSync(req.file.path);
    const ext = path.extname(req.file.originalname);
    const s3Filename = `${fileTypePrefix}/${userUidForLog}-${Date.now()}${ext}`;
    console.log(`UsersController: Uploading to S3 as ${s3Filename}`);

    const result = await uploadToS3(fileContent, s3Filename, req.file.mimetype);
    console.log(`UsersController: S3 Upload successful for ${s3Filename}. Location: ${result.Location}`);

    fs.unlinkSync(req.file.path);
    console.log(`UsersController: Temporary file ${req.file.path} deleted.`);

    res.json({ success: true, fileUrl: result.Location });
  } catch (error) {
    console.error(`UsersController: Error in ${fileTypePrefix} upload for UID ${userUidForLog}:`, error.message || error);
    if (process.env.NODE_ENV !== "production" && error.stack) {
      console.error(`UsersController: ${fileTypePrefix} Upload Error stack:`, error.stack);
    }

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: `File too large. Max size for ${fileTypePrefix} is ${MAX_AUDIO_SIZE / (1024 * 1024)}MB.` });
      }
      return res.status(400).json({ message: `File upload error: ${error.message}` });
    }

    if (req.file && req.file.path) {
      try {
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
          console.log(`UsersController: Cleaned up temporary file ${req.file.path} after error.`);
        }
      } catch (cleanupError) {
        console.error(`UsersController: Failed to cleanup temporary ${fileTypePrefix} file after error:`, cleanupError);
      }
    }

    if (!res.headersSent) {
      return res.status(500).json({ message: error.message || `An unexpected error occurred during ${fileTypePrefix} upload.` });
    }
  }
};

const uploadAudioBio = async (req, res) => {
  await handleFileUploadToS3(req, res, "audio-bios");
};

const uploadVideoBioSnippet = async (req, res) => {
  await handleFileUploadToS3(req, res, "video-bio-snippets");
};

module.exports = {
  getCurrentUserProfile,
  updateCurrentUserProfile,
  unblockUser,
  blockUser,
  uploadAudioBio,
  uploadVideoBioSnippet,
};

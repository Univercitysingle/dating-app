const User = require("../models/User");
const Match = require('../models/Match');
const fs = require("fs");
const path = require("path");
const { uploadToS3 } = require("../services/awsS3");
const multer = require("multer");

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
      { $set: { status: 'unmatched', likedBy: [] } }
    );
    res.status(200).json({ message: `User ${userIdToBlock} successfully blocked.` });
    console.log(`User ${userIdToBlock} blocked by UID: ${currentUserUid}`);
  } catch (error) {
    console.error(`Error blocking user ${userIdToBlock} by UID ${currentUserUid}:`, error);
    res.status(500).json({ error: "An unexpected error occurred while blocking user." });
  }
};

// Generic file upload handler to S3
const handleFileUploadToS3 = async (req, res, fileTypePrefix) => {
  try {
    if (req.fileValidationError) {
      return res.status(400).json({ message: req.fileValidationError });
    }
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded or file was rejected by filter." });
    }

    const fileContent = fs.readFileSync(req.file.path);
    const ext = path.extname(req.file.originalname);
    const s3Filename = `${fileTypePrefix}/${req.user.uid}-${Date.now()}${ext}`;

    const result = await uploadToS3(fileContent, s3Filename, req.file.mimetype);

    fs.unlinkSync(req.file.path);

    res.json({ success: true, fileUrl: result.Location });
    console.log(`${fileTypePrefix} uploaded successfully for UID: ${req.user.uid}, URL: ${result.Location}`);
  } catch (error) {
    console.error(`Error in ${fileTypePrefix} upload for UID ${req.user.uid}:`, error);

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: `File too large. Max size for ${fileTypePrefix} is ${error.limit / (1024 * 1024)}MB.` });
      }
      return res.status(400).json({ message: `File upload error: ${error.message}` });
    }

    if (req.file && req.file.path) {
      try {
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      } catch (cleanupError) {
        console.error(`Failed to cleanup temporary ${fileTypePrefix} file:`, cleanupError);
      }
    }

    if (error.message && !res.headersSent) {
      return res.status(500).json({ message: error.message });
    } else if (!res.headersSent) {
      return res.status(500).json({ message: `An unexpected error occurred during ${fileTypePrefix} upload.` });
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

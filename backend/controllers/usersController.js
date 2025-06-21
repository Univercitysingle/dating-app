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
  const allowedFields = [
    "name", "age", "gender", "preference", "bio", "photos",
    "interests", "profilePrompts", "audioBioUrl", "videoBioUrl",
    "personalityQuizResults", "socialMediaLinks",
    "education", "relationshipGoals", "location",
    "lastActiveAt" // Ideally, lastActiveAt is updated by middleware on user activity
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
  uploadAudioBio,
  uploadVideoBioSnippet,
};

const fs = require("fs");
const path = require("path");
const { uploadToS3 } = require("../services/awsS3"); // Corrected path
const multer = require("multer"); // Import multer to check for MulterError

// Generic file upload handler to S3
const handleFileUploadToS3 = async (req, res, fileTypePrefix) => {
  try {
    // Check for validation errors from multer's fileFilter
    if (req.fileValidationError) {
      return res.status(400).json({ message: req.fileValidationError });
    }
    // Check if a file was actually uploaded. Multer might not set req.file if filter rejects.
    if (!req.file) {
      // If fileValidationError was set, it's handled above.
      // If not, but still no file, it's a general "no file" or other multer issue.
      return res.status(400).json({ message: "No file uploaded or file was rejected by filter." });
    }

    const fileContent = fs.readFileSync(req.file.path);
    const ext = path.extname(req.file.originalname);
    // Ensure filename uniqueness and appropriate folder structure in S3
    const s3Filename = `${fileTypePrefix}/${req.user.uid}-${Date.now()}${ext}`;

    const result = await uploadToS3(fileContent, s3Filename, req.file.mimetype);

    // Clean up temp upload from server's 'uploads/' directory
    fs.unlinkSync(req.file.path);

    // IMPORTANT: Only return the URL, do not save to User model here.
    res.json({ success: true, fileUrl: result.Location });
    console.log(`${fileTypePrefix} uploaded successfully for UID: ${req.user.uid}, URL: ${result.Location}`);

  } catch (error) {
    console.error(`Error in ${fileTypePrefix} upload for UID ${req.user.uid}:`, error);

    // Specific Multer error handling (e.g., file size limit)
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: `File too large. Max size for ${fileTypePrefix} is ${error.limit / (1024 * 1024)}MB.` });
        // Note: error.limit might not be available directly here, depends on multer version and how error is passed.
        // It's safer to pass the specific limit from the route config if possible, or use a generic message.
        // For now, using a generic part of the message. A more robust way would be to pass the specific limit to this handler.
        // Let's make it simpler:
        // return res.status(400).json({ message: `File too large for ${fileTypePrefix}.` });
      }
      // Handle other multer errors if needed
      return res.status(400).json({ message: `File upload error: ${error.message}` });
    }

    // Cleanup temp file if it exists, even on other errors
    if (req.file && req.file.path) {
      try {
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      } catch (cleanupError) {
        console.error(`Failed to cleanup temporary ${fileTypePrefix} file:`, cleanupError);
      }
    }

    // For non-multer errors during S3 upload or other processing
    if (error.message && !res.headersSent) { // Check if headers already sent
        return res.status(500).json({ message: error.message });
    } else if (!res.headersSent) {
        return res.status(500).json({ message: `An unexpected error occurred during ${fileTypePrefix} upload.` });
    }
    // If headers already sent, Express default error handler will take over or log.
  }
};

// Controller for audio bio upload
const uploadAudioBio = async (req, res) => {
  await handleFileUploadToS3(req, res, "audio-bios");
};

// Controller for video bio snippet upload
const uploadVideoBioSnippet = async (req, res) => {
  await handleFileUploadToS3(req, res, "video-bio-snippets");
};

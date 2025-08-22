const User = require("../models/User");
const Match = require('../models/Match');
const fs = require("fs");
const path = require("path");
const { uploadToS3 } = require("../services/awsS3");
const multer = require("multer");

const getCurrentUserProfile = async (req, res) => {
  const log = req.log;
  log.info("UsersController: getCurrentUserProfile entered.");
  if (!req.user) {
    log.error("UsersController: getCurrentUserProfile - req.user is not populated.");
    return res.status(500).json({ error: "User profile not available in request." });
  }

  log.info(`UsersController: Sending user profile for UID: ${req.user.uid}.`);
  res.json(req.user);
};

const updateCurrentUserProfile = async (req, res) => {
  const log = req.log;
  log.info("UsersController: updateCurrentUserProfile entered for UID:", req.user ? req.user.uid : "UNKNOWN_UID");
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
  log.info({ update: sanitizedUpdate }, "UsersController: Sanitized update data");

  if (!req.user || !req.user.uid) {
    log.error("UsersController: updateCurrentUserProfile - req.user or req.user.uid is missing.");
    return res.status(401).json({ error: "Authentication details missing." });
  }

  try {
    const user = await User.findOneAndUpdate({ uid: req.user.uid }, sanitizedUpdate, { new: true });
    if (!user) {
      log.warn(`UsersController: User not found during update for UID: ${req.user.uid}`);
      return res.status(404).json({ error: "User not found" });
    }
    log.info(`UsersController: Successfully updated profile for UID: ${req.user.uid}.`);
    res.json(user);
  } catch (err) {
    log.error({ err }, `UsersController: Error updating profile for UID ${req.user.uid}`);
    res.status(500).json({ error: "An unexpected error occurred while updating profile." });
  }
};

const unblockUser = async (req, res) => {
  const log = req.log;
  const currentUserUid = req.user.uid;
  const { userIdToUnblock } = req.params;
  log.info(`UsersController: unblockUser entered. CurrentUser: ${currentUserUid}, UserToUnblock: ${userIdToUnblock}`);

  if (currentUserUid === userIdToUnblock) {
    log.warn(`UsersController: User ${currentUserUid} attempted to unblock themselves.`);
    return res.status(400).json({ error: "Cannot unblock yourself." });
  }

  try {
    const updatedUser = await User.findOneAndUpdate(
      { uid: currentUserUid },
      { $pull: { blocked: userIdToUnblock } },
      { new: true }
    );

    if (!updatedUser) {
      log.warn(`UsersController: Current user ${currentUserUid} not found during unblock operation.`);
      return res.status(404).json({ error: "Current user not found." });
    }
    log.info(`UsersController: User ${userIdToUnblock} successfully unblocked by UID: ${currentUserUid}.`);
    res.status(200).json({ message: `User ${userIdToUnblock} successfully unblocked.` });
  } catch (error) {
    log.error({ err: error }, `UsersController: Error unblocking user ${userIdToUnblock} by UID ${currentUserUid}`);
    res.status(500).json({ error: "An unexpected error occurred while unblocking user." });
  }
};

const blockUser = async (req, res) => {
  const log = req.log;
  const currentUserUid = req.user.uid;
  const { userIdToBlock } = req.params;
  log.info(`UsersController: blockUser entered. CurrentUser: ${currentUserUid}, UserToBlock: ${userIdToBlock}`);

  if (currentUserUid === userIdToBlock) {
    log.warn(`UsersController: User ${currentUserUid} attempted to block themselves.`);
    return res.status(400).json({ error: "Cannot block yourself." });
  }

  try {
    const userToBlockDoc = await User.findOne({ uid: userIdToBlock }).select('_id');
    if (!userToBlockDoc) {
      log.warn(`UsersController: User to block (${userIdToBlock}) not found.`);
      return res.status(404).json({ error: "User to block not found." });
    }
    log.info(`UsersController: User to block (${userIdToBlock}) found. Proceeding with block.`);

    const updatedUser = await User.findOneAndUpdate(
      { uid: currentUserUid },
      { $addToSet: { blocked: userIdToBlock } },
      { new: true }
    );

    if (!updatedUser) {
      log.warn(`UsersController: Current user ${currentUserUid} not found during block operation.`);
      return res.status(404).json({ error: "Current user not found during update." });
    }

    const u1 = currentUserUid < userIdToBlock ? currentUserUid : userIdToBlock;
    const u2 = currentUserUid < userIdToBlock ? userIdToBlock : currentUserUid;

    log.info(`UsersController: Updating match status for users ${u1} and ${u2} to 'unmatched'.`);
    await Match.findOneAndUpdate(
      { user1Uid: u1, user2Uid: u2 },
      { $set: { status: 'unmatched', likedBy: [] } }
    );
    log.info(`UsersController: User ${userIdToBlock} successfully blocked by UID: ${currentUserUid}.`);
    res.status(200).json({ message: `User ${userIdToBlock} successfully blocked.` });
  } catch (error) {
    log.error({ err: error }, `UsersController: Error blocking user ${userIdToBlock} by UID ${currentUserUid}`);
    res.status(500).json({ error: "An unexpected error occurred while blocking user." });
  }
};

const handleFileUploadToS3 = async (req, res, fileTypePrefix) => {
  const log = req.log;
  const userUidForLog = req.user ? req.user.uid : "UNKNOWN_UID_FILE_UPLOAD";
  log.info(`UsersController: handleFileUploadToS3 entered for ${fileTypePrefix}, User: ${userUidForLog}`);
  try {
    if (req.fileValidationError) {
      log.warn(`UsersController: File validation error for ${fileTypePrefix} by ${userUidForLog}: ${req.fileValidationError}`);
      return res.status(400).json({ message: req.fileValidationError });
    }
    if (!req.file) {
      log.warn(`UsersController: No file uploaded or rejected by filter for ${fileTypePrefix} by ${userUidForLog}.`);
      return res.status(400).json({ message: "No file uploaded or file was rejected by filter." });
    }
    log.info(`UsersController: File received for ${fileTypePrefix}: ${req.file.originalname}, size: ${req.file.size}, path: ${req.file.path}`);

    const fileContent = fs.readFileSync(req.file.path);
    const ext = path.extname(req.file.originalname);
    const s3Filename = `${fileTypePrefix}/${userUidForLog}-${Date.now()}${ext}`;
    log.info(`UsersController: Uploading to S3 as ${s3Filename}`);

    const result = await uploadToS3(fileContent, s3Filename, req.file.mimetype);
    log.info(`UsersController: S3 Upload successful for ${s3Filename}. Location: ${result.Location}`);

    fs.unlinkSync(req.file.path);
    log.info(`UsersController: Temporary file ${req.file.path} deleted.`);

    res.json({ success: true, fileUrl: result.Location });
  } catch (error) {
    log.error({ err: error }, `UsersController: Error in ${fileTypePrefix} upload for UID ${userUidForLog}`);

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
          log.info(`UsersController: Cleaned up temporary file ${req.file.path} after error.`);
        }
      } catch (cleanupError) {
        log.error({ err: cleanupError }, `UsersController: Failed to cleanup temporary ${fileTypePrefix} file after error`);
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

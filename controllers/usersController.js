const User = require("../models/User");
const Match = require('../models/Match');
const fs = require("fs");
const path = require("path");
const { saveFile, deleteFile } = require("../services/localStore");
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
  const userUid = req.user ? req.user.uid : "UNKNOWN_UID";
  log.info({ userUid }, "UsersController: updateCurrentUserProfile entered.");
  const update = req.body;

  let allowedFields;
  if (req.user.isOnboardingComplete) {
    allowedFields = [
      "preference", "bio", "photos",
      "interests", "profilePrompts", "audioBioUrl",
      "personalityQuizResults", "socialMediaLinks",
      "education", "relationshipGoals", "location", "lifestyle", "badges",
      "lastActiveAt"
    ];
  } else {
    allowedFields = [
      "name", "birthday", "gender", "preference", "bio", "photos",
      "interests", "profilePrompts", "audioBioUrl",
      "personalityQuizResults", "socialMediaLinks",
      "education", "relationshipGoals", "location", "lifestyle", "badges",
      "lastActiveAt", "isOnboardingComplete"
    ];
  }

  const sanitizedUpdate = {};

  for (const key of allowedFields) {
    if (update[key] !== undefined) {
      if (typeof update[key] === 'object' && !Array.isArray(update[key]) && update[key] !== null) {
        // Merge objects instead of replacing them
        sanitizedUpdate[key] = { ...req.user[key], ...update[key] };
      } else {
        sanitizedUpdate[key] = update[key];
      }
    }
  }
  log.info({ update: sanitizedUpdate }, "UsersController: Sanitized update data");

  if (sanitizedUpdate.birthday) {
    const today = new Date();
    const birthDate = new Date(sanitizedUpdate.birthday);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    if (age < 18) {
      return res.status(400).json({ error: 'You must be at least 18 years old to register.' });
    }
  }

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

const handleFileUpload = async (req, res, fileTypePrefix) => {
  const log = req.log;
  const userUidForLog = req.user ? req.user.uid : "UNKNOWN_UID_FILE_UPLOAD";
  log.info(`UsersController: handleFileUpload entered for ${fileTypePrefix}, User: ${userUidForLog}`);
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
    const filename = `${fileTypePrefix}-${userUidForLog}-${Date.now()}${ext}`;
    log.info(`UsersController: Saving file as ${filename}`);

    const result = saveFile(fileContent, filename);
    log.info(`UsersController: File saved successfully. Location: ${result.Location}`);

    fs.unlinkSync(req.file.path);
    log.info(`UsersController: Temporary file ${req.file.path} deleted.`);

    res.json({ success: true, fileUrl: result.Location });
  } catch (error) {
    log.error({ err: error }, `UsersController: Error in ${fileTypePrefix} upload for UID ${userUidForLog}`);

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: `File too large. Max size for ${fileTypePrefix} is 5MB.` });
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
  await handleFileUpload(req, res, "audio-bios");
};

const uploadPhoto = async (req, res) => {
  const log = req.log;
  const userUidForLog = req.user ? req.user.uid : "UNKNOWN_UID_FILE_UPLOAD";
  log.info(`UsersController: uploadPhoto entered for User: ${userUidForLog}`);

  try {
    if (req.fileValidationError) {
      log.warn(`UsersController: File validation error for photo by ${userUidForLog}: ${req.fileValidationError}`);
      return res.status(400).json({ message: req.fileValidationError });
    }
    if (!req.file) {
      log.warn(`UsersController: No file uploaded or rejected by filter for photo by ${userUidForLog}.`);
      return res.status(400).json({ message: "No file uploaded or file was rejected by filter." });
    }

    const user = await User.findOne({ uid: req.user.uid });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Validation checks
    if (user.photos.length >= 6) {
      return res.status(400).json({ message: "You have reached the maximum of 6 photos." });
    }
    const MAX_TOTAL_SIZE = 25 * 1024 * 1024; // 25MB
    if (user.totalPhotoSize + req.file.size > MAX_TOTAL_SIZE) {
      return res.status(400).json({ message: "Uploading this photo would exceed your total storage limit of 25MB." });
    }

    log.info(`UsersController: File received for photo: ${req.file.originalname}, size: ${req.file.size}, path: ${req.file.path}`);

    const fileContent = fs.readFileSync(req.file.path);
    const ext = path.extname(req.file.originalname);
    const filename = `photos-${userUidForLog}-${Date.now()}${ext}`;
    log.info(`UsersController: Saving file as ${filename}`);

    const result = saveFile(fileContent, filename);
    log.info(`UsersController: File saved successfully. Location: ${result.Location}`);

    fs.unlinkSync(req.file.path);
    log.info(`UsersController: Temporary file ${req.file.path} deleted.`);

    const newPhoto = {
      url: result.Location,
      order: user.photos.length,
      size: req.file.size,
    };

    await User.findOneAndUpdate(
      { uid: req.user.uid },
      {
        $push: { photos: newPhoto },
        $inc: { totalPhotoSize: req.file.size },
      },
      { new: true }
    );

    res.json({ success: true, fileUrl: result.Location });
  } catch (error) {
    log.error({ err: error }, `UsersController: Error in photo upload for UID ${userUidForLog}`);
    if (req.file && req.file.path) {
      try {
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
          log.info(`UsersController: Cleaned up temporary file ${req.file.path} after error.`);
        }
      } catch (cleanupError) {
        log.error({ err: cleanupError }, `UsersController: Failed to cleanup temporary photo file after error`);
      }
    }
    if (!res.headersSent) {
      return res.status(500).json({ message: error.message || `An unexpected error occurred during photo upload.` });
    }
  }
};

const updatePhotoOrder = async (req, res) => {
  const log = req.log;
  const { photos } = req.body;
  log.info(`UsersController: updatePhotoOrder entered for UID: ${req.user.uid}`);

  try {
    const user = await User.findOneAndUpdate(
      { uid: req.user.uid },
      { photos: photos },
      { new: true }
    );
    if (!user) {
      log.warn(`UsersController: User not found during updatePhotoOrder for UID: ${req.user.uid}`);
      return res.status(404).json({ error: "User not found" });
    }
    log.info(`UsersController: Successfully updated photo order for UID: ${req.user.uid}.`);
    res.json(user);
  } catch (err) {
    log.error({ err }, `UsersController: Error updating photo order for UID ${req.user.uid}`);
    res.status(500).json({ error: "An unexpected error occurred while updating photo order." });
  }
};

const deletePhoto = async (req, res) => {
  const log = req.log;
  const { photoUrl } = req.body;
  log.info(`UsersController: deletePhoto entered for UID: ${req.user.uid}`);

  try {
    const user = await User.findOne({ uid: req.user.uid });

    if (!user) {
      log.warn(`UsersController: User not found during deletePhoto for UID: ${req.user.uid}`);
      return res.status(404).json({ error: "User not found" });
    }

    // Validation checks
    if (user.photos.length <= 1) {
      return res.status(400).json({ message: "You must have at least one photo." });
    }

    const photoToDelete = user.photos.find(p => p.url === photoUrl);
    if (!photoToDelete) {
      return res.status(404).json({ error: "Photo not found in user's profile." });
    }

    const sizeToDecrement = typeof photoToDelete.size === 'number' ? photoToDelete.size : 0;

    const updatedUser = await User.findOneAndUpdate(
      { uid: req.user.uid },
      {
        $pull: { photos: { url: photoUrl } },
        $inc: { totalPhotoSize: -sizeToDecrement },
      },
      { new: true }
    );

    const filename = path.basename(photoUrl);
    deleteFile(filename);

    log.info(`UsersController: Successfully deleted photo for UID: ${req.user.uid}.`);
    res.json(updatedUser);
  } catch (err) {
    log.error({ err }, `UsersController: Error deleting photo for UID ${req.user.uid}`);
    res.status(500).json({ error: "An unexpected error occurred while deleting photo." });
  }
};

const discoverUsers = async (req, res) => {
  const log = req.log;
  const currentUserUid = req.user.uid;
  log.info(`UsersController: discoverUsers entered for UID: ${currentUserUid}`);

  try {
    // Find users that the current user has already swiped on
    const swipedUsers = await Match.find({
      $or: [{ user1Uid: currentUserUid }, { user2Uid: currentUserUid }],
    }).select('user1Uid user2Uid');

    const swipedUserIds = swipedUsers.map(match => {
      return match.user1Uid === currentUserUid ? match.user2Uid : match.user1Uid;
    });

    const { minAge, maxAge, maxDistance, lifestyle } = req.query;

    const query = {
      uid: { $ne: currentUserUid, $nin: swipedUserIds },
    };

    if (minAge && maxAge) {
      query.age = { $gte: minAge, $lte: maxAge };
    }

    if (maxDistance) {
      const user = await User.findOne({ uid: currentUserUid }).select('location');
      if (user && user.location) {
        query.location = {
          $near: {
            $geometry: user.location,
            $maxDistance: maxDistance * 1000, // convert km to meters
          },
        };
      }
    }

    if (req.query.pets) {
      query['lifestyle.pets'] = req.query.pets;
    }
    if (req.query.workout) {
      query['lifestyle.workout'] = req.query.workout;
    }
    if (req.query.drinking) {
      query['lifestyle.drinking'] = req.query.drinking;
    }
    if (req.query.smoking) {
      query['lifestyle.smoking'] = req.query.smoking;
    }

    // Find users that are not the current user and not blocked by the current user
    const users = await User.find(query).sort({ lastActiveAt: -1 }).lean(); // Use .lean() for faster queries when you don't need Mongoose documents

    const superLikes = await Match.find({
      user2Uid: currentUserUid,
      superLike: true,
    }).select('user1Uid');

    const superLikedByUserIds = superLikes.map(match => match.user1Uid);

    users.forEach(user => {
      if (superLikedByUserIds.includes(user.uid)) {
        user.superLikedByCurrentUser = true;
      }
    });

    log.info(`UsersController: Found ${users.length} users to discover.`);
    res.json(users);
  } catch (error) {
    log.error({ err: error }, `UsersController: Error fetching users for discovery for UID ${currentUserUid}`);
    res.status(500).json({ error: "An unexpected error occurred while fetching users." });
  }
};

module.exports = {
  getCurrentUserProfile,
  updateCurrentUserProfile,
  unblockUser,
  blockUser,
  uploadAudioBio,
  uploadPhoto,
  updatePhotoOrder,
  deletePhoto,
  discoverUsers,
};

const User = require("../models/User");
const Match = require('../models/Match');
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { uploadFile, deleteFile } = require("../services/s3Service");
const multer = require("multer");
const { sanitizeUser } = require('../utils/userUtils');
const { CDN_HOSTNAME, convertKeysToCdnUrls } = require('../utils/cdnUtils');
const { getGeolocation } = require('../services/ipinfoService');

const getCurrentUserProfile = async (req, res) => {
  const log = req.log;
  log.info("UsersController: getCurrentUserProfile entered.");
  if (!req.user) {
    log.error("UsersController: getCurrentUserProfile - req.user is not populated.");
    return res.status(500).json({ error: "User profile not available in request." });
  }

  log.info(`UsersController: Sending user profile for UID: ${req.user.uid}.`);
  let user = req.user.toObject ? req.user.toObject() : { ...req.user };
  user = convertKeysToCdnUrls(user);
  res.json(sanitizeUser(user, req.user));
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
      "interests", "profilePrompts", "personalityType",
      "socialMediaLinks",
      "education", "relationshipGoals", "location", "lifestyle", "badges",
      "lastActiveAt"
    ];
  } else {
    allowedFields = [
      "name", "birthday", "gender", "preference", "bio", "photos",
      "interests", "profilePrompts", "personalityType",
      "socialMediaLinks",
      "education", "relationshipGoals", "location", "lifestyle", "badges", "mobileNumber",
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
    let user = await User.findOneAndUpdate({ uid: req.user.uid }, sanitizedUpdate, { new: true });
    if (!user) {
      log.warn(`UsersController: User not found during update for UID: ${req.user.uid}`);
      return res.status(404).json({ error: "User not found" });
    }
    log.info({
        message: 'User profile updated',
        userId: req.user.uid,
        updatedFields: Object.keys(sanitizedUpdate)
    });
    user = user.toObject();
    res.json(convertKeysToCdnUrls(user));
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

    if (user.photos.length >= 6) {
      return res.status(400).json({ message: "You have reached the maximum of 6 photos." });
    }
    const MAX_TOTAL_SIZE = 25 * 1024 * 1024;
    if (user.totalPhotoSize + req.file.size > MAX_TOTAL_SIZE) {
      return res.status(400).json({ message: "Uploading this photo would exceed your total storage limit of 25MB." });
    }

    log.info(`UsersController: File received for photo: ${req.file.originalname}, size: ${req.file.size}`);

    const resizedImageBuffer = await sharp(req.file.buffer)
      .resize({
        width: 600,
        withoutEnlargement: true,
      })
      .toBuffer();

    const ext = path.extname(req.file.originalname);
    const key = `photos-${userUidForLog}-${Date.now()}${ext}`;
    log.info(`UsersController: Uploading photo to S3 with key: ${key}`);

    await uploadFile(key, resizedImageBuffer, req.file.mimetype);
    log.info({ key }, "UsersController: Photo uploaded to S3 successfully.");

    const newPhoto = {
      url: key,
      order: user.photos.length,
      size: resizedImageBuffer.length,
    };

    await User.findOneAndUpdate(
      { uid: req.user.uid },
      {
        $push: { photos: newPhoto },
        $inc: { totalPhotoSize: resizedImageBuffer.length },
      },
      { new: true }
    );

    const cdnUrl = `https://${CDN_HOSTNAME}/${key}`;
    res.json({ success: true, fileUrl: key, cdnUrl });
  } catch (error) {
    log.error({ err: error }, `UsersController: Error in photo upload for UID ${userUidForLog}`);
    if (!res.headersSent) {
      res.status(500).json({ message: error.message || "An unexpected error occurred during photo upload." });
    }
  }
};

const updatePhotoOrder = async (req, res) => {
  const log = req.log;
  const { photos } = req.body;
  log.info(`UsersController: updatePhotoOrder entered for UID: ${req.user.uid}`);

  try {
    let user = await User.findOneAndUpdate(
      { uid: req.user.uid },
      { photos: photos },
      { new: true }
    );
    if (!user) {
      log.warn(`UsersController: User not found during updatePhotoOrder for UID: ${req.user.uid}`);
      return res.status(404).json({ error: "User not found" });
    }
    log.info(`UsersController: Successfully updated photo order for UID: ${req.user.uid}.`);
    user = user.toObject();
    res.json(convertKeysToCdnUrls(user));
  } catch (err) {
    log.error({ err }, `UsersController: Error updating photo order for UID ${req.user.uid}`);
    res.status(500).json({ error: "An unexpected error occurred while updating photo order." });
  }
};

const deletePhoto = async (req, res) => {
  const log = req.log;
  const { photoUrl } = req.body; // This is the full CDN URL of the photo to delete.
  log.info(`UsersController: deletePhoto entered for UID: ${req.user.uid}`);

  // Extract the base key from the incoming CDN URL.
  const keyToDelete = photoUrl.substring(photoUrl.lastIndexOf('/') + 1);

  try {
    const user = await User.findOne({ uid: req.user.uid });

    if (!user) {
      log.warn(`UsersController: User not found during deletePhoto for UID: ${req.user.uid}`);
      return res.status(404).json({ error: "User not found" });
    }

    if (user.photos.length <= 1) {
      return res.status(400).json({ message: "You must have at least one photo." });
    }

    // Find the photo by matching the end of the stored URL, to handle corrupted data.
    const photoToDelete = user.photos.find(p => p.url && p.url.endsWith(keyToDelete));

    if (!photoToDelete) {
      log.warn({ keyToDelete, photos: user.photos }, `Photo not found in user's profile.`);
      return res.status(404).json({ error: "Photo not found in user's profile." });
    }

    const sizeToDecrement = typeof photoToDelete.size === 'number' ? photoToDelete.size : 0;

    // Extract the actual key from the (potentially corrupted) URL in the DB for S3 deletion.
    const s3Key = photoToDelete.url.substring(photoToDelete.url.lastIndexOf('/') + 1);

    const updatedUser = await User.findOneAndUpdate(
      { uid: req.user.uid },
      {
        $pull: { photos: { _id: photoToDelete._id } }, // Pull by the photo's unique _id
        $inc: { totalPhotoSize: -sizeToDecrement },
      },
      { new: true }
    );

    await deleteFile(s3Key);
    log.info({ key: s3Key }, "UsersController: Successfully deleted photo from S3.");

    log.info(`UsersController: Successfully deleted photo for UID: ${req.user.uid}.`);
    res.json(convertKeysToCdnUrls(updatedUser.toObject()));
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

    const { minAge, maxAge, maxDistance, lifestyle, lookingFor } = req.query;

    const query = {
      uid: { $ne: currentUserUid, $nin: swipedUserIds },
    };

    if (lookingFor === 'Men') {
      query.gender = 'Male';
    } else if (lookingFor === 'Women') {
      query.gender = 'Female';
    } else if (lookingFor === 'Other') {
      query.gender = 'Other';
    }

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

    if (req.query.relationshipType) {
      query['lifestyle.lookingFor'] = req.query.relationshipType;
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

    const usersWithCdnUrls = users.map(user => convertKeysToCdnUrls(user));
    const sanitizedUsers = usersWithCdnUrls.map(user => sanitizeUser(user, req.user));

    log.info(`UsersController: Found ${sanitizedUsers.length} users to discover.`);
    res.json(sanitizedUsers);
  } catch (error) {
    log.error({ err: error }, `UsersController: Error fetching users for discovery for UID ${currentUserUid}`);
    res.status(500).json({ error: "An unexpected error occurred while fetching users." });
  }
};

const getUserProfile = async (req, res) => {
    const { userId } = req.params;
    const log = req.log;
    try {
        let user = await User.findOne({ uid: userId }).lean();
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        log.info({
            message: 'User profile viewed',
            viewerId: req.user.uid,
            viewedUserId: userId
        });
        user = convertKeysToCdnUrls(user);
        res.json(sanitizeUser(user, req.user));
    } catch (error) {
        log.error({ err: error }, `Error fetching user profile for UID ${userId}`);
        res.status(500).json({ error: 'An unexpected error occurred.' });
    }
};

const getLikes = async (req, res) => {
    const { uid, plan } = req.user;
    try {
        const matches = await Match.find({
            $or: [{ user1Uid: uid }, { user2Uid: uid }],
            status: 'pending',
        }).lean();

        const likedByUserIds = matches
            .filter(match => !match.likedBy.includes(uid))
            .map(match => (match.user1Uid === uid ? match.user2Uid : match.user1Uid));

        const users = await User.find({ uid: { $in: likedByUserIds } }).lean();

        const usersWithLikeType = users.map(user => {
            const match = matches.find(m =>
                (m.user1Uid === uid && m.user2Uid === user.uid) ||
                (m.user1Uid === user.uid && m.user2Uid === uid)
            );
            const userWithCdnUrls = convertKeysToCdnUrls(user);
            return {
                ...userWithCdnUrls,
                likeType: match ? (match.superLike ? 'superlike' : 'like') : 'like',
                isBlurred: req.user.plan !== 'premium',
            };
        });

        res.json(usersWithLikeType.map(user => sanitizeUser(convertKeysToCdnUrls(user), req.user)));
    } catch (error) {
        console.error('Error fetching users who liked you:', error);
        res.status(500).json({ error: 'An unexpected error occurred.' });
    }
};

const getGeolocationForCurrentUser = async (req, res) => {
    const log = req.log;
    try {
        const geo = await getGeolocation(req.ip);
        if (!geo) {
            return res.status(404).json({ error: 'Geolocation data not found.' });
        }
        res.json(geo);
    } catch (error) {
        log.error({ err: error }, 'Error fetching geolocation data');
        res.status(500).json({ error: 'An unexpected error occurred.' });
    }
};

module.exports = {
  getCurrentUserProfile,
  updateCurrentUserProfile,
  unblockUser,
  blockUser,
  uploadPhoto,
  updatePhotoOrder,
  deletePhoto,
  discoverUsers,
  getUserProfile,
  getLikes,
  getGeolocationForCurrentUser,
};

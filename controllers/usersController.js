const User = require("../models/User");
const Match = require('../models/Match');
const Subscription = require("../models/Subscription");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { uploadFile, deleteFile } = require("../services/s3Service");
const { getIO } = require("../services/socket");
const { get: getFromCache, set: setInCache, del: deleteFromCache } = require('../services/redisService');
const multer = require("multer");
const { v4: uuidv4 } = require('uuid');
const { sanitizeUser } = require('../utils/userUtils');
const { CDN_HOSTNAME, convertKeysToCdnUrls } = require('../utils/cdnUtils');
const { getGeolocation } = require('../services/ipinfoService');

// --- Configuration (Best Practice: Move to a separate config file or .env)
const MAX_PHOTOS = 6;
const MAX_TOTAL_PHOTO_SIZE = 25 * 1024 * 1024; // 25MB

const getCurrentUserProfile = async (req, res) => {
  const log = req.log;
  log.info("UsersController: getCurrentUserProfile entered.");
  if (!req.user) {
    log.error("UsersController: getCurrentUserProfile - req.user is not populated.");
    return res.status(500).json({ error: "User profile not available in request." });
  }

  const userUid = req.user.uid;
  const cacheKey = `user-profile-${userUid}`;

  try {
    // Check cache first
    const cachedUser = await getFromCache(cacheKey);
    if (cachedUser) {
      log.info({ message: 'Current user profile served from cache', userId: userUid });
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return res.json(sanitizeUser(cachedUser, req.user));
    }

    log.info(`UsersController: Cache miss for current user profile, UID: ${req.user.uid}.`);
    let user = req.user.toObject ? req.user.toObject() : { ...req.user };

    if (user.isOnboardingComplete === undefined) {
      user.isOnboardingComplete = true;
    }

    // Store the user object in the cache for next time
    await setInCache(cacheKey, user, 3600); // Cache for 1 hour

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.json(sanitizeUser(user, req.user));
  } catch (error) {
    log.error({ err: error }, `Error in getCurrentUserProfile for UID ${userUid}`);
    // Avoid sending error response if headers already sent
    if (!res.headersSent) {
        res.status(500).json({ error: "An unexpected error occurred." });
    }
  }
};

const updateCurrentUserProfile = async (req, res) => {
  const log = req.log;
  const userUid = req.user ? req.user.uid : "UNKNOWN_UID";
  log.info({ userUid }, "UsersController: updateCurrentUserProfile entered.");
  const update = req.body;

  let allowedFields;
  if (req.user.isOnboardingComplete) {
    allowedFields = [
      "sexualOrientation", "bio", "photos",
      "interests", "profilePrompts", "personalityType",
      "socialMediaLinks",
      "education", "relationshipGoals", "location", "lifestyle", "badges",
      "lastActiveAt"
    ];
  } else {
    allowedFields = [
      "name", "birthday", "gender", "sexualOrientation", "bio", "photos",
      "interests", "profilePrompts", "personalityType",
      "socialMediaLinks",
      "education", "relationshipGoals", "location", "lifestyle", "badges", "mobileNumber",
      "lastActiveAt", "isOnboardingComplete"
    ];
  }

  const sanitizedUpdate = {};

  // FIX: Safely handle nested objects to prevent NoSQL Injection / Prototype Pollution.
  const nestedAllowed = {
    lifestyle: ['drinking', 'smoking', 'exercise', 'diet', 'lookingFor'],
    badges: ['verified', 'premium', 'early_adopter'],
    socialMediaLinks: ['instagram', 'spotify', 'tiktok'],
    education: ['school', 'degree'],
  };

  for (const key of allowedFields) {
    if (update[key] !== undefined) {
      if (nestedAllowed[key] && typeof update[key] === 'object') {
        sanitizedUpdate[key] = {};
        for (const prop of nestedAllowed[key]) {
          if (update[key][prop] !== undefined) {
            sanitizedUpdate[key][prop] = update[key][prop];
          }
        }
      } else {
        sanitizedUpdate[key] = update[key];
      }
    }
  }

  log.info({ update: sanitizedUpdate }, "UsersController: Sanitized update data");

  if (sanitizedUpdate.mobileNumber) {
    const mobileNumber = sanitizedUpdate.mobileNumber;
    if (!/^\+\d{1,3}\d{6,14}$/.test(mobileNumber)) {
      return res.status(400).json({ error: 'Invalid mobile number format. Please use the format +[countrycode][number].' });
    }
    const digits = mobileNumber.replace(/^\+\d{1,3}/, '');
    if (/^(\d)\1{8,}$/.test(digits)) {
      return res.status(400).json({ error: 'Invalid mobile number pattern.' });
    }
  }

  if (sanitizedUpdate.birthday) {
    const birthDate = new Date(sanitizedUpdate.birthday);

    // FIX: Add check for invalid date strings.
    if (isNaN(birthDate.getTime())) {
      return res.status(400).json({ error: 'Invalid birthday format.' });
    }

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    if (age < 18) {
      return res.status(400).json({ error: 'You must be at least 18 years old to register.' });
    }
  }

  if (
    sanitizedUpdate.lifestyle &&
    sanitizedUpdate.lifestyle.lookingFor === 'Casual (FWB)' &&
    !sanitizedUpdate.sexualOrientation
  ) {
    return res.status(400).json({
      error: 'Sexual orientation is required when looking for "Casual (FWB)".',
    });
  }

  if (!req.user || !req.user.uid) {
    log.error("UsersController: updateCurrentUserProfile - req.user or req.user.uid is missing.");
    return res.status(401).json({ error: "Authentication details missing." });
  }

  try {
    let user = await User.findOneAndUpdate({ uid: req.user.uid }, { $set: sanitizedUpdate }, { new: true });
    if (!user) {
      log.warn(`UsersController: User not found during update for UID: ${req.user.uid}`);
      return res.status(404).json({ error: "User not found" });
    }
    log.info({
        message: 'User profile updated',
        userId: req.user.uid,
        updatedFields: Object.keys(sanitizedUpdate)
    });

    const sanitizedProfile = sanitizeUser(user, req.user);
    const io = getIO();
    io.to(`profile-${user.uid}`).emit('profileUpdated', sanitizedProfile);
    log.info({
        message: 'profileUpdated event emitted',
        room: `profile-${user.uid}`
    });

    // Invalidate the cache for this user
    const cacheKey = `user-profile-${req.user.uid}`;
    await deleteFromCache(cacheKey);
    log.info({ message: 'User profile cache invalidated', userId: req.user.uid });

    res.json(sanitizedProfile);
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
    const userToBlockDoc = await User.findOne({ uid: userIdToBlock }).select('_id').lean();
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
      { $set: { status: 'unmatched' }, $unset: { likedBy: "" } } // Clear likedBy array
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

    if (user.photos.length >= MAX_PHOTOS) {
      return res.status(400).json({ message: `You have reached the maximum of ${MAX_PHOTOS} photos.` });
    }

    if (user.totalPhotoSize + req.file.size > MAX_TOTAL_PHOTO_SIZE) {
      return res.status(400).json({ message: "Uploading this photo would exceed your total storage limit." });
    }

    log.info(`UsersController: File received for photo: ${req.file.originalname}, size: ${req.file.size}`);

    // Convert image to WebP format for optimization and standardization
    const webpImageBuffer = await sharp(req.file.buffer)
      .resize({
        width: 600,
        withoutEnlargement: true,
      })
      .webp({ quality: 80 }) // Convert to WebP with 80% quality
      .toBuffer();

    // Use .webp extension for the file key
    const key = `photos-${userUidForLog}-${Date.now()}.webp`;
    log.info(`UsersController: Uploading photo to B2 with key: ${key}`);

    // Upload the WebP image
    await uploadFile(key, webpImageBuffer, 'image/webp');
    log.info({ key }, "UsersController: Photo uploaded to B2 successfully.");

    const newPhoto = {
      url: key,
      order: user.photos.length,
      size: webpImageBuffer.length, // Use the size of the converted image
    };

    await User.findOneAndUpdate(
      { uid: req.user.uid },
      {
        $push: { photos: newPhoto },
        $inc: { totalPhotoSize: webpImageBuffer.length },
      },
      { new: true }
    );

    const cdnUrl = `https://${CDN_HOSTNAME}/${key}`;
    res.json({ success: true, fileUrl: key, cdnUrl });
  } catch (error) {
    log.error(`Error in photo upload for UID ${userUidForLog}`, error);
    if (!res.headersSent) {
      res.status(500).json({
          message: "An unexpected error occurred during photo upload.",
          error: process.env.NODE_ENV === 'development' ? error.message : "Internal Server Error"
      });
    }
  }
};

const updatePhotoOrder = async (req, res) => {
  const log = req.log;
  const { photos } = req.body;
  log.info(`UsersController: updatePhotoOrder entered for UID: ${req.user.uid}`);

  if (!Array.isArray(photos)) {
      return res.status(400).json({ error: "Invalid payload. 'photos' must be an array." });
  }

  try {
    let user = await User.findOneAndUpdate(
      { uid: req.user.uid },
      { $set: { photos: photos } },
      { new: true }
    );
    if (!user) {
      log.warn(`UsersController: User not found during updatePhotoOrder for UID: ${req.user.uid}`);
      return res.status(404).json({ error: "User not found" });
    }
    log.info(`UsersController: Successfully updated photo order for UID: ${req.user.uid}.`);
    res.json(sanitizeUser(user, req.user));
  } catch (err) {
    log.error({ err }, `UsersController: Error updating photo order for UID ${req.user.uid}`);
    res.status(500).json({ error: "An unexpected error occurred while updating photo order." });
  }
};

const deletePhoto = async (req, res) => {
  const log = req.log;
  const { photoUrl } = req.body;
  log.info(`UsersController: deletePhoto entered for UID: ${req.user.uid}`);

  if (!photoUrl) {
      return res.status(400).json({ error: "photoUrl is required." });
  }

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

      const photoToDelete = user.photos.find(p => p.url && p.url.endsWith(keyToDelete));

      if (!photoToDelete) {
          log.warn({ keyToDelete, photos: user.photos }, `Photo not found in user's profile.`);
          return res.status(404).json({ error: "Photo not found in user's profile." });
      }

      // FIX: Resolve race condition by separating the pull and the size decrement.
      // First, atomically pull the photo from the array.
      const userBeforeUpdate = await User.findOneAndUpdate(
          { uid: req.user.uid },
          { $pull: { photos: { _id: photoToDelete._id } } }
      );

      if (!userBeforeUpdate) {
          // This should be rare if the initial user find succeeded, but it's a good safeguard.
          return res.status(404).json({ error: "Failed to update user profile during photo deletion." });
      }

      // Now, safely decrement the total size.
      const sizeToDecrement = typeof photoToDelete.size === 'number' ? photoToDelete.size : 0;
      const updatedUser = await User.findOneAndUpdate(
          { uid: req.user.uid },
          { $inc: { totalPhotoSize: -sizeToDecrement } },
          { new: true }
      );

      // Now delete from S3
      await deleteFile(keyToDelete);
      log.info({ key: keyToDelete }, "UsersController: Successfully deleted photo from S3.");

      log.info(`UsersController: Successfully deleted photo for UID: ${req.user.uid}.`);
      res.json(sanitizeUser(updatedUser, req.user));
  } catch (err) {
    log.error(`UsersController: Error deleting photo for UID ${req.user.uid}`, err);
    res.status(500).json({ error: "An unexpected error occurred while deleting photo." });
  }
};

const discoverUsers = async (req, res) => {
  const log = req.log;
  const currentUser = req.user;

  // Add a defensive check to ensure currentUser exists
  if (!currentUser) {
    log.error("discoverUsers called but req.user is not populated. This indicates an upstream middleware issue.");
    return res.status(500).json({ error: "An internal server error occurred." });
  }

  const currentUserUid = currentUser.uid;
  log.info(`UsersController: discoverUsers entered for UID: ${currentUserUid}`);

  try {
    const { minAge, maxAge, maxDistance, ...filters } = req.query;

    const baseMatchQuery = {
      uid: { $ne: currentUserUid },
      isProfileVisible: true,
      // Exclude users who have blocked the current user
      blocked: { $ne: currentUserUid },
    };

    // Defensively check for preference before adding to query
    if (currentUser && currentUser.preference && currentUser.preference !== 'everyone') {
      baseMatchQuery.gender = currentUser.preference;
    }

    // Apply filters from query params
    ['sexualOrientation', 'familyStatus', 'relationshipGoals'].forEach(key => {
        if (filters[key]) baseMatchQuery[key] = filters[key];
    });

    for (const key in filters) {
        if (Object.prototype.hasOwnProperty.call(filters, key) && !['minAge', 'maxAge', 'maxDistance', 'sexualOrientation', 'familyStatus', 'relationshipGoals'].includes(key)) {
            baseMatchQuery[`lifestyle.${key}`] = filters[key];
        }
    }

    if (minAge && maxAge) {
      const today = new Date();
      const maxDate = new Date(today.getFullYear() - parseInt(minAge), today.getMonth(), today.getDate());
      const minDate = new Date(today.getFullYear() - parseInt(maxAge) - 1, today.getMonth(), today.getDate());
      baseMatchQuery.birthday = { $gte: minDate, $lte: maxDate };
    }

    // Defensively check for location before adding to query
    if (maxDistance && currentUser && currentUser.location && currentUser.location.coordinates) {
      baseMatchQuery.location = {
        $near: {
          $geometry: currentUser.location,
          $maxDistance: parseInt(maxDistance) * 1000, // convert km to meters
        },
      };
    }

    // REFACTORED: Use a single aggregation with $facet for performance.
    const discoveryPipeline = [
        { $match: baseMatchQuery },
        {
            $lookup: { // Filter out users already interacted with
                from: 'matches',
                let: { userId: '$uid' },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $or: [
                                    { $and: [{ $eq: ['$user1Uid', '$$userId'] }, { $eq: ['$user2Uid', currentUserUid] }] },
                                    { $and: [{ $eq: ['$user1Uid', currentUserUid] }, { $eq: ['$user2Uid', '$$userId'] }] }
                                ]
                            }
                        }
                    },
                    { $limit: 1 }
                ],
                as: 'interaction'
            }
        },
        { $match: { interaction: { $eq: [] } } },
        {
            $facet: {
                boostedUsers: [
                    { $match: { boostExpiresAt: { $gt: new Date() } } },
                    { $limit: 10 }
                ],
                regularUsers: [
                    { $match: { $or: [{ boostExpiresAt: { $lte: new Date() } }, { boostExpiresAt: { $exists: false } }] } },
                    { $sort: { lastActiveAt: -1 } },
                    { $limit: 20 }
                ]
            }
        },
        {
            $project: {
                // Combine results, ensuring no duplicates and respecting limits
                combinedUsers: {
                    $let: {
                        vars: {
                            boostedIds: "$boostedUsers.uid",
                        },
                        in: {
                            $concatArrays: [
                                "$boostedUsers",
                                {
                                    $slice: [
                                        {
                                            $filter: {
                                                input: "$regularUsers",
                                                as: "regularUser",
                                                cond: { $not: { $in: ["$$regularUser.uid", "$$boostedIds"] } }
                                            }
                                        },
                                        { $max: [0, { $subtract: [20, { $size: "$boostedUsers" }] }] }
                                    ]
                                }
                            ]
                        }
                    }
                }
            }
        },
        { $unwind: "$combinedUsers" },
        { $replaceRoot: { newRoot: "$combinedUsers" } },
        { $project: { uid: 1, name: 1, age: 1, photos: 1, bio: 1, interests: 1, lifestyle: 1, badges: 1, personalityType: 1 } }
    ];

    log.info("UsersController:discoverUsers: Running combined discovery pipeline.");
    // Step 1: Get UIDs from the aggregation pipeline.
    // We modify the pipeline to only return UIDs to keep it lightweight.
    const discoveryPipelineWithUidsOnly = [...discoveryPipeline];
    discoveryPipelineWithUidsOnly.push({ $project: { uid: 1, _id: 0 } });
    const userDocs = await User.aggregate(discoveryPipelineWithUidsOnly);
    const userUids = userDocs.map(doc => doc.uid);

    if (userUids.length === 0) {
        log.info("UsersController: No users found to discover.");
        return res.json([]);
    }

    // Step 2: Try to fetch users from cache
    const cacheKeys = userUids.map(uid => `user-profile-${uid}`);
    const cachedUsers = (await Promise.all(cacheKeys.map(key => getFromCache(key)))).filter(Boolean);
    const cachedUserUids = new Set(cachedUsers.map(user => user.uid));
    log.info({ message: 'Discovery cache stats', total: userUids.length, hits: cachedUsers.length });

    // Step 3: Fetch users not found in cache from DB
    const uidsToFetchFromDB = userUids.filter(uid => !cachedUserUids.has(uid));
    let dbUsers = [];
    if (uidsToFetchFromDB.length > 0) {
        log.info({ message: 'Fetching missing discovery users from DB', uids: uidsToFetchFromDB });
        dbUsers = await User.find({ uid: { $in: uidsToFetchFromDB } }).lean(); // Use lean() for performance

        // Step 4: Cache the newly fetched users
        await Promise.all(dbUsers.map(user => {
            const cacheKey = `user-profile-${user.uid}`;
            // No need for toObject() because of lean()
            return setInCache(cacheKey, user, 3600); // Cache for 1 hour
        }));
    }

    let users = [...cachedUsers, ...dbUsers];

    // The aggregation pipeline already handles sorting, but MGET from Redis doesn't preserve order.
    // We need to re-order the combined list to match the original order from the aggregation.
    const orderMap = new Map(userUids.map((uid, index) => [uid, index]));
    users.sort((a, b) => orderMap.get(a.uid) - orderMap.get(b.uid));

    const superLikeMatches = await Match.find({ user2Uid: currentUserUid, superLike: true }).select('user1Uid').lean();
    const superLikedByUserIds = new Set(superLikeMatches.map(m => m.user1Uid));

    users = users.map(user => ({
      ...user,
      superLikedByCurrentUser: superLikedByUserIds.has(user.uid)
    }));

    const sanitizedUsers = users.map(user => sanitizeUser(user, currentUser));

    log.info(`UsersController: Found ${sanitizedUsers.length} users to discover.`);
    res.json(sanitizedUsers);
  } catch (error) {
    log.error({
      message: `UsersController: Error fetching users for discovery for UID ${currentUserUid}`,
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: "An unexpected error occurred while fetching users." });
  }
};

const getUserProfile = async (req, res) => {
    const { userId } = req.params;
    const log = req.log;
    const cacheKey = `user-profile-${userId}`;

    try {
        // 1. Check cache first
        const cachedUser = await getFromCache(cacheKey);
        if (cachedUser) {
            log.info({ message: 'User profile served from cache', userId });
            // Note: Deserialization from cache means it's a plain object, not a Mongoose doc.
            // Ensure sanitization works correctly with plain objects.
            return res.json(sanitizeUser(cachedUser, req.user));
        }

        log.info({ message: 'Cache miss for user profile', userId });
        // 2. If not in cache, fetch from DB
        let user = await User.findOne({ uid: userId });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        log.info({
            message: 'User profile viewed (from DB)',
            viewerId: req.user.uid,
            viewedUserId: userId
        });

        // 3. Store in cache for future requests
        // Use .toObject() to get a plain JS object for caching
        await setInCache(cacheKey, user.toObject(), 3600); // Cache for 1 hour

        res.json(sanitizeUser(user, req.user));
    } catch (error) {
        log.error({ err: error }, `Error fetching user profile for UID ${userId}`);
        res.status(500).json({ error: 'An unexpected error occurred.' });
    }
};

const getLikes = async (req, res) => {
    const { uid } = req.user;
    const log = req.log;
    try {
        const matches = await Match.find({
            user2Uid: uid, // Only find users who liked the current user
            status: 'pending',
        }).lean();

        const likedByUserIds = matches.map(match => match.user1Uid);

        if (likedByUserIds.length === 0) {
            return res.json([]);
        }

        const users = await User.find({ uid: { $in: likedByUserIds } }).lean();

        const usersWithLikeType = users.map(user => {
            const match = matches.find(m => m.user1Uid === user.uid);
            const sanitizedUserObject = sanitizeUser(user, req.user);
            return {
                ...sanitizedUserObject,
                likeType: match && match.superLike ? 'superlike' : 'like',
                isBlurred: req.user.plan !== 'premium',
            };
        });

        res.json(usersWithLikeType);
    } catch (error) {
        log.error({ err: error }, `Error fetching users who liked UID: ${uid}`);
        res.status(500).json({ error: 'An unexpected error occurred.' });
    }
};

const getGeolocationForCurrentUser = async (req, res) => {
    const log = req.log;
    const ip = req.ip;
    const isPrivateIp = /^(::1|127\.0\.0\.1|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/.test(ip);

    if (isPrivateIp) {
        log.info(`Private/localhost IP detected (${ip}), skipping public geolocation lookup.`);
        return res.json({ ip: ip, city: 'Private Network', country: 'N/A' });
    }

    try {
        const geo = await getGeolocation(ip);
        if (!geo) {
            log.warn(`Geolocation data not found for public IP: ${ip}`);
            return res.status(404).json({ error: 'Geolocation data not found.' });
        }
        res.json(geo);
    } catch (error) {
        log.error({ err: error, ip: ip }, 'Error fetching geolocation data');
        res.status(500).json({ error: 'An unexpected error occurred.' });
    }
};

const uploadBankSlip = async (req, res) => {
  const log = req.log;
  const userUidForLog = req.user ? req.user.uid : "UNKNOWN_UID_BANK_SLIP_UPLOAD";
  log.info(`UsersController: uploadBankSlip entered for User: ${userUidForLog}`);

  try {
    if (req.fileValidationError) {
      log.warn(`File validation error for bank slip by ${userUidForLog}: ${req.fileValidationError}`);
      return res.status(400).json({ message: req.fileValidationError });
    }
    if (!req.file) {
      log.warn(`No file uploaded or rejected by filter for bank slip by ${userUidForLog}.`);
      return res.status(400).json({ message: "No file uploaded or file was rejected by filter." });
    }

    const user = await User.findOne({ uid: req.user.uid });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    log.info(`File received for bank slip: ${req.file.originalname}, size: ${req.file.size}`);

    const resizedImageBuffer = await sharp(req.file.buffer)
      .resize({
        width: 800,
        withoutEnlargement: true,
      })
      .toBuffer();

    const ext = path.extname(req.file.originalname) || '.jpg';
    const key = `bank-slips-${userUidForLog}-${Date.now()}${ext}`;
    log.info(`Uploading bank slip to S3 with key: ${key}`);

    await uploadFile(key, resizedImageBuffer, req.file.mimetype);
    log.info({ key }, "Bank slip uploaded to S3 successfully.");

    // FIX: Prevent parameter tampering by using a server-side map for plan details.
    const { planId } = req.body;

    // Server-side definition of subscription plans
    const planDetails = {
      'basic_1m': { name: 'basic', durationDays: 30, superLikes: 5, undos: 10 },
      'premium_1m': { name: 'premium', durationDays: 30, superLikes: 25, undos: 50 },
      'premium_3m': { name: 'premium', durationDays: 90, superLikes: 75, undos: 150 },
    };

    const selectedPlan = planDetails[planId];
    if (!selectedPlan) {
      return res.status(400).json({ message: "Invalid planId provided." });
    }

    const newSubscription = new Subscription({
      userId: user._id,
      plan: selectedPlan.name,
      bankSlipUrl: key,
      status: 'pending',
      superLikes: selectedPlan.superLikes,
      undos: selected_plan.undos,
    });

    await newSubscription.save();

    res.json({ success: true, message: "Bank slip uploaded successfully. Your subscription is pending review." });
  } catch (error) {
    log.error({ err: error }, `Error in bank slip upload for UID ${userUidForLog}`);
    if (!res.headersSent) {
      res.status(500).json({ message: error.message || "An unexpected error occurred during bank slip upload." });
    }
  }
};

const getSubscriptionHistory = async (req, res) => {
    const log = req.log;
    try {
        const subscriptions = await Subscription.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(10).lean();
        res.json(subscriptions);
    } catch (error) {
        log.error({ err: error }, 'Error fetching subscription history');
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
  uploadBankSlip,
  getSubscriptionHistory,
};

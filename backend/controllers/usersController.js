const User = require("../models/User");
const Match = require('../models/Match');
const fs = require("fs");
const path = require("path");
const { uploadToS3 } = require("../services/awsS3");
const multer = require("multer");

const getCurrentUserProfile = async (req, res) => {
  console.log("UsersController: getCurrentUserProfile entered.");
  // authMiddleware should have populated req.user with the full DB user profile.
  // If req.user is not present, authMiddleware likely failed and already sent a response.
  // However, as a safeguard:
  if (!req.user) {
    console.error("UsersController: getCurrentUserProfile - req.user is not populated. This indicates an issue upstream from the controller, possibly in authMiddleware not sending a response on failure or not populating req.user correctly.");
    return res.status(500).json({ error: "User profile not available in request." });
  }

  // The req.user object is now the full user profile from our database.
  console.log(`UsersController: Sending user profile for UID: ${req.user.uid} (already fetched by authMiddleware).`);
  res.json(req.user);
};

// New function to find/update/create user based on Firebase decoded token
const findAndUpdateUserByTokenDetails = async (decodedToken) => {
  console.log("UsersController: findAndUpdateUserByTokenDetails entered for UID from token:", decodedToken.uid, "Email from token:", decodedToken.email);

  // Step 1: Try to find user by Firebase UID
  let user = await User.findOne({ uid: decodedToken.uid });

  if (user) {
    console.log(`UsersController: User found by UID: ${decodedToken.uid}.`);
    // Optionally, update email or other details if they can change in Firebase and you want to sync them
    // For example, if user.email !== decodedToken.email && decodedToken.email_verified
    // await User.updateOne({ uid: decodedToken.uid }, { $set: { email: decodedToken.email } });
    return user;
  }

  console.log(`UsersController: User not found by UID ${decodedToken.uid}. Trying by email: ${decodedToken.email}`);

  // Step 2: If not found by UID, try to find by email, but only if email is verified
  if (!decodedToken.email) {
    console.warn(`UsersController: Firebase token for UID ${decodedToken.uid} does not contain an email. Cannot find by email or create new user based on email.`);
    return null; // Or throw an error indicating inability to provision
  }

  if (!decodedToken.email_verified) {
    console.warn(`UsersController: Email ${decodedToken.email} from Firebase token (UID: ${decodedToken.uid}) is not verified. Will not link to existing email or create new user based on this unverified email.`);
    // Check if an account with this UID exists but maybe with a different (old/unverified) email from token - already handled by findOne by UID above
    // If we strictly require email verification for account linking/creation based on email:
    return null; // Indicate user cannot be provisioned due to unverified email
  }

  user = await User.findOne({ email: decodedToken.email });

  if (user) {
    // User found by email. Link Firebase UID to this existing account.
    console.log(`UsersController: User found by email ${decodedToken.email}. Current UID in DB: ${user.uid}. Linking to Firebase UID: ${decodedToken.uid}.`);
    user.uid = decodedToken.uid;
    // Potentially update other fields from token if necessary, e.g., name
    if (decodedToken.name && !user.name) { // Example: set name if not already set
        user.name = decodedToken.name;
    }
    await user.save();
    console.log(`UsersController: User UID updated for email ${decodedToken.email} to ${decodedToken.uid}.`);
    return user;
  }

  // Step 3: If not found by UID or email, and email is verified, create a new user
  console.log(`UsersController: No user found by UID or email. Creating new user with UID: ${decodedToken.uid} and Email: ${decodedToken.email}.`);

  const newUser = new User({
    uid: decodedToken.uid,
    email: decodedToken.email,
    name: decodedToken.name || '', // Use name from token if available, else empty string or default
    // Set other default fields as necessary based on your User model
    // e.g., photos: [], interests: [], bio: '', etc.
  });
  await newUser.save();
  console.log(`UsersController: New user created successfully with UID: ${decodedToken.uid}.`);
  return newUser;
};


const updateCurrentUserProfile = async (req, res) => {
  // req.user here will be the full user profile from DB after authMiddleware changes
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
  findAndUpdateUserByTokenDetails, // Export the new function
};

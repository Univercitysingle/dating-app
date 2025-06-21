const User = require("../models/User");
const { uploadToS3 } = require("../services/awsS3"); // Corrected path to S3 service
const fs = require("fs");
const path = require("path");
const multer = require("multer"); // Import multer

const getJitsiToken = (req, res) => {
  try {
    // The subscriptionCheck middleware already validated the user.
    // req.user.uid is available from the auth middleware (assumed to be run before subscriptionCheck).
    const roomName = `dating-room-${req.user.uid}-${Date.now()}`;
    const jitsiURL = `https://meet.jit.si/${roomName}`;
    res.json({ url: jitsiURL });
    console.log(`Jitsi token generated for UID: ${req.user.uid}`);
  } catch (error) {
    console.error(`Error in getJitsiToken for UID ${req.user.uid}:`, error);
    res.status(500).json({ error: "An unexpected error occurred while generating Jitsi token." });
  }
};

const uploadProfileVideo = async (req, res) => {
  try {
    // Check for validation errors from multer's fileFilter
    if (req.fileValidationError) {
      return res.status(400).json({ message: req.fileValidationError });
    }
    // Check if a file was actually uploaded
    if (!req.file) {
      return res.status(400).json({ message: "No profile video uploaded or file was rejected by filter." });
    }

    const fileContent = fs.readFileSync(req.file.path);
    const ext = path.extname(req.file.originalname);
    const s3Filename = `videos/${req.user.uid}-${Date.now()}${ext}`;

    const result = await uploadToS3(fileContent, s3Filename, req.file.mimetype);

    // Clean up temp upload
    fs.unlinkSync(req.file.path);

    await User.findOneAndUpdate({ uid: req.user.uid }, { videoProfile: result.Location });

    res.json({ success: true, url: result.Location });
    console.log(`Profile video uploaded successfully for UID: ${req.user.uid}, URL: ${result.Location}`);
  } catch (error) {
    console.error(`Error in uploadProfileVideo for UID ${req.user ? req.user.uid : 'N/A'}:`, error);

    // Specific Multer error handling
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        // Consider making the message more dynamic if MAX_PROFILE_VIDEO_SIZE is accessible here
        return res.status(400).json({ message: "Profile video file is too large." });
      }
      return res.status(400).json({ message: `Profile video upload error: ${error.message}` });
    }

    // Cleanup temp file if it exists, even on other errors
    if (req.file && req.file.path) {
      try {
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      } catch (cleanupError) {
        console.error("Failed to cleanup temporary profile video file:", cleanupError);
      }
    }

    // For non-multer errors (e.g., S3 upload, DB update)
    if (error.message && !res.headersSent) {
        return res.status(500).json({ message: error.message });
    } else if (!res.headersSent) {
        res.status(500).json({ message: "An unexpected error occurred during profile video upload." });
    }
  }
};

module.exports = {
  getJitsiToken,
  uploadProfileVideo,
};

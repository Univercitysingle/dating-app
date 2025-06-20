const User = require("../models/User");
const { uploadToS3 } = require("../services/s3");
const fs = require("fs");
const path = require("path");

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
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
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
    console.error(`Error in uploadProfileVideo for UID ${req.user.uid}:`, error);
    // It's good practice to ensure the temporary file is deleted even if an error occurs after it's read.
    // However, if fs.readFileSync fails, req.file.path might not be valid or the file might not exist.
    // If uploadToS3 or User.findOneAndUpdate fails, then fs.unlinkSync should be called.
    if (req.file && req.file.path) {
      try {
        if (fs.existsSync(req.file.path)) { // Check if file exists before trying to delete
          fs.unlinkSync(req.file.path);
        }
      } catch (cleanupError) {
        console.error("Failed to cleanup temporary video file:", cleanupError);
      }
    }
    res.status(500).json({ error: "An unexpected error occurred during video upload." });
  }
};

module.exports = {
  getJitsiToken,
  uploadProfileVideo,
};

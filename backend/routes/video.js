const express = require("express");
const multer = require("multer");
const router = express.Router();
const subscriptionCheck = require("../middleware/subscriptionCheck");
const User = require("../models/User");
const { uploadToS3 } = require("../services/s3");
const fs = require("fs");
const path = require("path");

const upload = multer({ dest: "uploads/" });

router.get("/jitsi-token", subscriptionCheck, (req, res) => {
  const roomName = `dating-room-${req.user.uid}-${Date.now()}`;
  const jitsiURL = `https://meet.jit.si/${roomName}`;
  res.json({ url: jitsiURL });
});

router.post("/upload-profile-video", upload.single("video"), subscriptionCheck, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const fileContent = fs.readFileSync(req.file.path);
    const ext = path.extname(req.file.originalname);
    const s3Filename = `videos/${req.user.uid}-${Date.now()}${ext}`;

    const result = await uploadToS3(fileContent, s3Filename, req.file.mimetype);

    // Clean up temp upload
    fs.unlinkSync(req.file.path);

    await User.findOneAndUpdate({ uid: req.user.uid }, { videoProfile: result.Location });

    res.json({ success: true, url: result.Location });
  } catch (error) {
    console.error("Video upload failed", error);
    res.status(500).json({ error: "Upload failed" });
  }
});

module.exports = router;

const User = require("../models/User");
const { uploadToS3 } = require("../services/s3");
const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
ffmpeg.setFfmpegPath(ffmpegPath);

const getJitsiToken = (req, res) => {
  try {
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
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    // Accept only video files
    if (!req.file.mimetype.startsWith("video/")) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Only video files are allowed." });
    }

    const inputPath = req.file.path;
    const outputPath = inputPath + "-converted.mp4";

    // Get video duration
    const getDuration = () =>
      new Promise((resolve, reject) => {
        ffmpeg.ffprobe(inputPath, (err, metadata) => {
          if (err) reject(err);
          else resolve(metadata.format.duration);
        });
      });
    const duration = await getDuration();
    if (duration > 30) {
      fs.unlinkSync(inputPath);
      return res.status(400).json({ error: "Video must be 30 seconds or less." });
    }

    // Convert to mp4 (H.264/AAC)
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoCodec("libx264")
        .audioCodec("aac")
        .outputOptions([
          "-t 30", // enforce max duration
          "-preset veryfast",
          "-movflags faststart"
        ])
        .toFormat("mp4")
        .on("end", resolve)
        .on("error", reject)
        .save(outputPath);
    });

    // Upload the mp4 to S3
    const fileContent = fs.readFileSync(outputPath);
    const s3Filename = `videos/${req.user.uid}-${Date.now()}.mp4`;
    const result = await uploadToS3(fileContent, s3Filename, "video/mp4");

    // Clean up temp files
    fs.unlinkSync(inputPath);
    fs.unlinkSync(outputPath);

    await User.findOneAndUpdate({ uid: req.user.uid }, { videoProfile: result.Location });

    res.json({ success: true, url: result.Location });
    console.log(`Profile video uploaded and converted for UID: ${req.user.uid}, URL: ${result.Location}`);
  } catch (error) {
    // Cleanup
    try {
      if (req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      if (req.file && fs.existsSync(req.file.path + "-converted.mp4")) fs.unlinkSync(req.file.path + "-converted.mp4");
    } catch (cleanupErr) {
      console.error("Failed to cleanup temporary video file:", cleanupErr);
    }
    res.status(500).json({ error: "An unexpected error occurred during video upload." });
  }
};

module.exports = {
  getJitsiToken,
  uploadProfileVideo,
};

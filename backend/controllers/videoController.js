const User = require("../models/User");
const { uploadToS3 } = require("../services/awsS3");
const fs = require('fs').promises; // Use promise version for async/await
const path = require("path");
const multer = require("multer");
const ffmpeg = require('fluent-ffmpeg');

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

    const MAX_VIDEO_DURATION = 30; // seconds
    const originalFilePath = req.file.path;
    // Output filename will be based on user and timestamp, ensuring .mp4 extension
    const processedFileNameBase = `${req.user.uid}-${Date.now()}`;
    const s3ObjectKey = `videos/${processedFileNameBase}.mp4`; // Key for S3, includes "folder"
    const processedFilePath = path.join(req.file.destination, `${processedFileNameBase}.mp4`);


    try {
      // 1. Get Duration
      const metadata = await new Promise((resolve, reject) => {
        ffmpeg.ffprobe(originalFilePath, (err, data) => {
          if (err) return reject(new Error(`FFprobe error: ${err.message}`));
          resolve(data);
        });
      });

      if (metadata.format && metadata.format.duration > MAX_VIDEO_DURATION) {
        // No need to await fs.unlink for originalFilePath here, finally block will handle it.
        return res.status(400).json({ message: `Video exceeds maximum duration of ${MAX_VIDEO_DURATION} seconds.` });
      }

      // 2. Convert to MP4 (H.264/AAC)
      await new Promise((resolve, reject) => {
        ffmpeg(originalFilePath)
          .videoCodec('libx264')
          .audioCodec('aac')
          .toFormat('mp4')
          .outputOptions('-preset fast') // Balance quality and speed
          .on('error', (err_ffmpeg) => {
            console.error('FFMPEG conversion error:', err_ffmpeg.message);
            reject(new Error('Failed to process video.'));
          })
          .on('end', () => {
            console.log('FFMPEG processing finished for user:', req.user.uid);
            resolve();
          })
          .save(processedFilePath);
      });

      // 3. Upload Processed File to S3
      const processedFileBuffer = await fs.readFile(processedFilePath);
      // For the processed MP4, the mimetype should be 'video/mp4'
      const s3Result = await uploadToS3(processedFileBuffer, s3ObjectKey, 'video/mp4');

      // 4. Update User Profile
      // req.user is the full Mongoose document from populateUserMiddleware
      req.user.videoProfile = s3Result.Location;
      await req.user.save();

      // Send back the updated user object (excluding sensitive fields, if any were populated)
      // Or just the URL and success message. For consistency with other uploads, just URL.
      const userResponse = req.user.toObject();
      delete userResponse.password; // Ensure password (if ever populated on req.user) is not sent
      // Remove other sensitive fields from userResponse if necessary

      res.status(200).json({
        message: "Profile video uploaded and processed successfully.",
        videoUrl: s3Result.Location,
        // user: userResponse // Optionally return updated user object
      });

    } catch (processingError) {
      // This catch block handles errors from ffprobe, ffmpeg conversion, S3 upload, or DB save.
      console.error(`Video processing or S3 upload error for UID ${req.user ? req.user.uid : 'N/A'}:`, processingError);
      // Ensure response is only sent if headers haven't already been sent by Multer error handling
      if (!res.headersSent) {
         res.status(500).json({ message: processingError.message || 'Error processing video.' });
      }
    } finally {
      // 5. Cleanup ALL temp files
      try { await fs.unlink(originalFilePath); } catch (e) { console.warn(`Failed to delete original temp file: ${originalFilePath}`, e.message); }
      try { await fs.unlink(processedFilePath); } catch (e) { console.warn(`Failed to delete processed temp file: ${processedFilePath}`, e.message); }
    }

  } catch (error) { // This outer catch handles errors from multer or initial file checks
    console.error(`Outer error in uploadProfileVideo for UID ${req.user ? req.user.uid : 'N/A'}:`, error);

    // Specific Multer error handling
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: "Profile video file is too large." });
      }
      return res.status(400).json({ message: `Profile video upload error: ${error.message}` });
    }

    // Cleanup temp file if multer passed but something else failed before ffmpeg try block
    if (req.file && req.file.path && !res.headersSent) { // Check originalFilePath existence?
        try {
            // Check if fs.existsSync is available with fs.promises, or use standard fs for this check
            const standardFs = require('fs');
            if (standardFs.existsSync(req.file.path)) {
              await fs.unlink(req.file.path);
            }
        } catch (cleanupError) {
            console.error("Failed to cleanup temporary profile video file (outer catch):", cleanupError);
        }
    }

    // For non-multer errors (e.g., S3 upload, DB update)
    if (!res.headersSent) { // Check if headers already sent
        if (error.message) {
            return res.status(500).json({ message: error.message });
        } else {
            return res.status(500).json({ message: "An unexpected error occurred during profile video upload." });
        }
    }
  }
};

module.exports = {
  getJitsiToken,
  uploadProfileVideo,
};

const express = require("express");
const multer = require("multer");
const router = express.Router();
const subscriptionCheck = require("../middleware/subscriptionCheck");
const { getJitsiToken, uploadProfileVideo } = require("../controllers/videoController");

// Allowed video MIME types
const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-flv',
  'video/webm',
  'video/x-matroska',
  'video/avi'
];
const MAX_PROFILE_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB

// File filter for video validation
const profileVideoFileFilter = (req, file, cb) => {
  if (ALLOWED_VIDEO_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    req.fileValidationError = 'Invalid video file type for profile. Allowed types: ' + ALLOWED_VIDEO_TYPES.join(', ');
    cb(new Error(req.fileValidationError), false);
  }
};

// Multer config for profile video
const uploadProfileVideoMulter = multer({
  dest: "uploads/",
  fileFilter: profileVideoFileFilter,
  limits: { fileSize: MAX_PROFILE_VIDEO_SIZE },
});

router.get("/jitsi-token", subscriptionCheck, getJitsiToken);

// Notice: subscriptionCheck comes after multer, so req.user is available for controller
router.post(
  "/upload-profile-video",
  (req, res, next) => {
    uploadProfileVideoMulter.single("video")(req, res, function (err) {
      if (req.fileValidationError) {
        return res.status(400).json({ error: req.fileValidationError });
      }
      if (err instanceof multer.MulterError) {
        // A Multer error occurred when uploading.
        return res.status(400).json({ error: err.message });
      } else if (err) {
        // An unknown error occurred when uploading.
        return res.status(400).json({ error: err.message });
      }
      // Everything went fine.
      next();
    });
  },
  subscriptionCheck,
  uploadProfileVideo
);

module.exports = router;

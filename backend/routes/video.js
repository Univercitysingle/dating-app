const express = require("express");
const multer = require("multer");
const router = express.Router();
const subscriptionCheck = require("../middleware/subscriptionCheck");
const { getJitsiToken, uploadProfileVideo } = require("../controllers/videoController");

const upload = multer({ dest: "uploads/" });

router.get("/jitsi-token", subscriptionCheck, getJitsiToken);

router.post("/upload-profile-video", upload.single("video"), subscriptionCheck, uploadProfileVideo);

module.exports = router;

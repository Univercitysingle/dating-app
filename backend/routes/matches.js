const express = require("express");
const router = express.Router();
const {
  getPotentialMatches,
  likeUser,
  getConfirmedMatches,
} = require("../controllers/matchesController");

// Return a list of potential matches
router.get("/", getPotentialMatches);

// Like a user
router.post("/like/:targetUserId", likeUser);

// Get confirmed matches for the current user
router.get("/confirmed", getConfirmedMatches);

module.exports = router;

const express = require('express');
const router = express.Router();
const { connect, callback } = require('../controllers/spotifyController');
const authMiddleware = require('../middleware/authentication');

// @route   GET /api/spotify/connect
// @desc    Redirects user to Spotify for authorization
// @access  Private
router.get('/connect', authMiddleware, connect);

// @route   GET /api/spotify/callback
// @desc    Callback URL for Spotify to redirect to after authorization
// @access  Public
router.get('/callback', callback);

// @route   GET /api/spotify/top-artists
// @desc    Get the current user's top artists from Spotify
// @access  Private
router.get('/top-artists', authMiddleware, require('../controllers/spotifyController').getTopArtists);

module.exports = router;

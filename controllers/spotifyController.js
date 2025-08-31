const querystring = require('querystring');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const User = require('../models/User');

const generateState = (userId) => {
  const state = {
    userId,
    // Add a random component to ensure the state is not guessable
    random: Math.random().toString(36).substring(7)
  };
  // Sign the state with a secret to prevent tampering
  return jwt.sign(state, process.env.SPOTIFY_STATE_SECRET, { expiresIn: '5m' });
};

const connect = (req, res) => {
  const log = req.log;
  log.info('Spotify connect endpoint hit');

  const scope = 'user-top-read';
  const state = generateState(req.user.uid);

  res.cookie('spotify_auth_state', state, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });

  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: process.env.SPOTIFY_CLIENT_ID,
      scope: scope,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
      state: state
    }));
};

const callback = async (req, res) => {
  const log = req.log;
  log.info('Spotify callback endpoint hit');

  const { code, state } = req.query;
  const storedState = req.cookies ? req.cookies['spotify_auth_state'] : null;

  if (state === null || state !== storedState) {
    log.warn('State mismatch in Spotify callback');
    return res.status(400).send('State mismatch');
  }

  res.clearCookie('spotify_auth_state');

  try {
    const decodedState = jwt.verify(state, process.env.SPOTIFY_STATE_SECRET);
    const userId = decodedState.userId;

    const response = await axios({
      method: 'post',
      url: 'https://accounts.spotify.com/api/token',
      data: querystring.stringify({
        code: code,
        redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
        grant_type: 'authorization_code'
      }),
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + (new Buffer.from(process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET).toString('base64'))
      }
    });

    const { access_token, refresh_token } = response.data;

    await User.findOneAndUpdate({ uid: userId }, {
      spotifyRefreshToken: refresh_token,
      // We could also store the access token and its expiry time if we want to optimize
    });

    log.info(`Successfully connected Spotify for user ${userId}`);
    // Redirect user to their profile page or a success page
    res.redirect('/profile');

  } catch (error) {
    log.error({ err: error }, 'Error in Spotify callback');
    res.status(500).send('An error occurred during Spotify authentication.');
  }
};

const getTopArtists = async (req, res) => {
  const log = req.log;
  log.info('Get top artists endpoint hit');

  try {
    const user = await User.findOne({ uid: req.user.uid });

    if (!user || !user.spotifyRefreshToken) {
      return res.status(400).json({ error: 'Spotify not connected for this user.' });
    }

    // First, try to get a new access token from the refresh token
    const tokenResponse = await axios({
      method: 'post',
      url: 'https://accounts.spotify.com/api/token',
      data: querystring.stringify({
        grant_type: 'refresh_token',
        refresh_token: user.spotifyRefreshToken
      }),
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + (new Buffer.from(process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET).toString('base64'))
      }
    });

    const { access_token } = tokenResponse.data;

    // Now, use the new access token to get the user's top artists
    const artistsResponse = await axios.get('https://api.spotify.com/v1/me/top/artists', {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });

    const topArtists = artistsResponse.data.items.map(artist => ({
      artistName: artist.name,
      artistImage: artist.images[0]?.url
    }));

    // Cache the top artists in the user's document
    user.spotifyTopArtists = topArtists;
    await user.save();

    res.json(topArtists);

  } catch (error) {
    log.error({ err: error }, 'Error getting top artists from Spotify');
    res.status(500).json({ error: 'An error occurred while fetching top artists from Spotify.' });
  }
};

module.exports = {
  connect,
  callback,
  getTopArtists,
};

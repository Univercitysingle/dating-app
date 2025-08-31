const request = require('supertest');
const express = require('express');
const spotifyRouter = require('../routes/spotify');
const authMiddleware = require('../middleware/authentication');

// Mock the auth middleware to simulate a logged-in user
jest.mock('../middleware/authentication', () => (req, res, next) => {
  req.user = { uid: 'test-user-id' };
  next();
});

const app = express();
app.use('/api/spotify', spotifyRouter);

const axios = require('axios');
const User = require('../models/User');

jest.mock('axios');
jest.mock('../models/User');

describe('Spotify Routes', () => {
  describe('GET /api/spotify/connect', () => {
    it('should redirect to the Spotify authorization page', async () => {
      const response = await request(app).get('/api/spotify/connect');
      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('https://accounts.spotify.com/authorize');
    });
  });

  describe('GET /api/spotify/callback', () => {
    it('should handle the callback and save the refresh token', async () => {
      axios.post.mockResolvedValue({
        data: {
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
        },
      });
      User.findOneAndUpdate.mockResolvedValue({});

      const response = await request(app)
        .get('/api/spotify/callback?code=test-code&state=some-random-state')
        .set('Cookie', ['spotify_auth_state=some-random-state']);

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/profile');
      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        { uid: 'test-user-id' },
        { spotifyRefreshToken: 'test-refresh-token' }
      );
    });
  });

  describe('GET /api/spotify/top-artists', () => {
    it('should fetch and return the user\'s top artists', async () => {
      const mockUser = {
        uid: 'test-user-id',
        spotifyRefreshToken: 'test-refresh-token',
        save: jest.fn().mockResolvedValue({}),
      };
      User.findOne.mockResolvedValue(mockUser);

      axios.post.mockResolvedValue({
        data: { access_token: 'new-access-token' },
      });

      axios.get.mockResolvedValue({
        data: {
          items: [
            { name: 'Artist 1', images: [{ url: 'image1.jpg' }] },
            { name: 'Artist 2', images: [{ url: 'image2.jpg' }] },
          ],
        },
      });

      const response = await request(app).get('/api/spotify/top-artists');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        { artistName: 'Artist 1', artistImage: 'image1.jpg' },
        { artistName: 'Artist 2', artistImage: 'image2.jpg' },
      ]);
      expect(mockUser.save).toHaveBeenCalled();
    });
  });
});

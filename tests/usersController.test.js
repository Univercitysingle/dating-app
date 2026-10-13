const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const httpMocks = require('node-mocks-http');
const {
  updateCurrentUserProfile,
  updatePhotoOrder,
  deletePhoto,
  getUserProfile,
} = require('../controllers/usersController');
const User = require('../models/User');

jest.mock('../services/s3Service', () => ({
    deleteFile: jest.fn(),
    uploadFile: jest.fn(),
}));

jest.mock('../services/socket', () => ({
    getIO: jest.fn(() => ({
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
    })),
}));

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Users Controller', () => {
  let user;

  beforeEach(async () => {
    await User.deleteMany({});
    user = await User.create({
      uid: 'test-user',
      name: 'Test User',
      email: 'user@test.com',
      photos: [{ url: 'photo1.jpg' }, { url: 'photo2.jpg' }],
    });
  });

  const mockLog = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  };

  describe('updateCurrentUserProfile', () => {
    it('should return the full photo URL after updating the profile', async () => {
      const req = httpMocks.createRequest({
        method: 'PUT',
        url: '/api/users/me',
        body: {
          bio: 'New bio',
        },
        user: user,
        log: mockLog,
      });
      const res = httpMocks.createResponse();

      await updateCurrentUserProfile(req, res);

      const responseData = res._getJSONData();
      expect(res.statusCode).toBe(200);
      expect(responseData.photos[0].url).toContain('https://');
    });
  });

  describe('updatePhotoOrder', () => {
    it('should return the full photo URL after updating photo order', async () => {
        const req = httpMocks.createRequest({
            method: 'PUT',
            url: '/api/users/photos/order',
            body: {
                photos: [{ url: 'photo2.jpg' }, { url: 'photo1.jpg' }],
            },
            user: user,
            log: mockLog,
        });
        const res = httpMocks.createResponse();

        await updatePhotoOrder(req, res);

        const responseData = res._getJSONData();
        expect(res.statusCode).toBe(200);
        expect(responseData.photos[0].url).toContain('https://');
    });
  });

  describe('deletePhoto', () => {
    it('should return the full photo URL after deleting a photo', async () => {
        const req = httpMocks.createRequest({
            method: 'DELETE',
            url: '/api/users/photos',
            body: {
                photoUrl: 'photo1.jpg',
            },
            user: user,
            log: mockLog,
        });
        const res = httpMocks.createResponse();

        await deletePhoto(req, res);

        const responseData = res._getJSONData();
        expect(res.statusCode).toBe(200);
        expect(responseData.photos[0].url).toContain('https://');
    });
  });

  describe('getUserProfile', () => {
    it('should return the full photo URL when getting a user profile', async () => {
        const req = httpMocks.createRequest({
            method: 'GET',
            url: `/api/users/${user.uid}`,
            params: {
                userId: user.uid,
            },
            user: user,
            log: mockLog,
        });
        const res = httpMocks.createResponse();

        await getUserProfile(req, res);

        const responseData = res._getJSONData();
        expect(res.statusCode).toBe(200);
        expect(responseData.photos[0].url).toContain('https://');
    });
  });
});

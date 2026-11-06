const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const httpMocks = require('node-mocks-http');
const {
  updateUserById,
  deleteUserById,
  listUsers,
} = require('../controllers/adminUsersController');
const User = require('../models/User');

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
  if (mongoServer) {
    await mongoServer.stop();
  }
});

describe('Admin Users Controller', () => {
  let superadmin, admin, user;

  beforeEach(async () => {
    await User.deleteMany({});
    superadmin = await User.create({
      name: 'Super Admin',
      email: 'superadmin@test.com',
      role: 'superadmin',
    });
    admin = await User.create({
      name: 'Admin',
      email: 'admin@test.com',
      role: 'admin',
    });
    user = await User.create({
      name: 'Test User',
      email: 'user@test.com',
      role: 'user',
      photos: [{ url: 'photo1.jpg' }],
    });
  });

  describe('updateUserById', () => {
    it('should prevent updating a superadmin account', async () => {
      const req = httpMocks.createRequest({
        method: 'PUT',
        url: `/api/admin/users/${superadmin._id}`,
        params: {
          userId: String(superadmin._id),
        },
        body: {
          name: 'New Superadmin Name',
        },
        user: { role: 'superadmin' },
      });
      const res = httpMocks.createResponse();

      await updateUserById(req, res);

      expect(res.statusCode).toBe(403);
      expect(res._getJSONData().message).toBe('Superadmin accounts cannot be modified.');
    });
  });

  describe('deleteUserById', () => {
    it('should prevent deleting a superadmin account', async () => {
      const req = httpMocks.createRequest({
        method: 'DELETE',
        url: `/api/admin/users/${superadmin._id}`,
        params: {
          userId: superadmin._id,
        },
        user: { role: 'superadmin' },
      });
      const res = httpMocks.createResponse();

      await deleteUserById(req, res);

      expect(res.statusCode).toBe(403);
      expect(res._getJSONData().message).toBe('Superadmin accounts cannot be deleted.');
    });
  });

  describe('listUsers', () => {
    it('should return full photo URLs for users', async () => {
      const req = httpMocks.createRequest({
        method: 'GET',
        url: '/api/admin/users',
        user: { role: 'admin' },
      });
      const res = httpMocks.createResponse();

      await listUsers(req, res);

      const responseData = res._getJSONData();
      expect(res.statusCode).toBe(200);
      const testUser = responseData.users.find(u => u.name === 'Test User');
      expect(testUser.photos[0].url).toContain('https://');
    });
  });
});

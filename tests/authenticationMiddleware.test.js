jest.mock('../services/firebaseAdmin', () => ({
  auth: jest.fn(() => ({
    verifyIdToken: jest.fn(),
  })),
}));

jest.mock('../utils/userUtils', () => ({
  findOrCreateUserFromToken: jest.fn(),
}));

jest.mock('../models/Subscription', () => ({
  findOne: jest.fn(),
}));

const admin = require('../services/firebaseAdmin');
const { findOrCreateUserFromToken } = require('../utils/userUtils');
const Subscription = require('../models/Subscription');
const authentication = require('../middleware/authentication');

const makeResponse = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

const makeRequest = (authorization) => ({
  headers: authorization === undefined ? {} : { authorization },
  log: { info: jest.fn(), error: jest.fn() },
});

describe('Firebase authentication middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects malformed bearer headers before token verification', async () => {
    const req = makeRequest('Bearer token extra');
    const res = makeResponse();
    const next = jest.fn();

    await authentication(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(admin.auth().verifyIdToken).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('checks Firebase token revocation for protected requests', async () => {
    const req = makeRequest('Bearer valid-token');
    const res = makeResponse();
    const next = jest.fn();
    const dbUser = { uid: 'firebase-user', _id: 'user-id' };

    admin.auth().verifyIdToken.mockResolvedValue({ uid: 'firebase-user' });
    findOrCreateUserFromToken.mockResolvedValue(dbUser);
    Subscription.findOne.mockResolvedValue(null);

    await authentication(req, res, next);

    expect(admin.auth().verifyIdToken).toHaveBeenCalledWith('valid-token', true);
    expect(req.user.isPremium).toBe(false);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects revoked Firebase tokens with HTTP 401', async () => {
    const req = makeRequest('Bearer revoked-token');
    const res = makeResponse();
    const next = jest.fn();
    const error = new Error('Token revoked');
    error.code = 'auth/id-token-revoked';
    admin.auth().verifyIdToken.mockRejectedValue(error);

    await authentication(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

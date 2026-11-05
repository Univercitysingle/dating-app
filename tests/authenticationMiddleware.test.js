jest.mock('../services/firebaseAdmin', () => {
  const auth = { verifyIdToken: jest.fn() };
  return { auth: jest.fn(() => auth) };
});

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

  it('accepts only the fixed UID with the server-signed superadmin role claim', async () => {
    const req = makeRequest('Bearer superadmin-token');
    const res = makeResponse();
    const next = jest.fn();
    admin.auth().verifyIdToken.mockResolvedValue({
      uid: 'superadmin_uid',
      role: 'superadmin',
    });

    await authentication(req, res, next);

    expect(req.user).toEqual(expect.objectContaining({
      uid: 'superadmin_uid',
      role: 'superadmin',
      isPremium: true,
    }));
    expect(findOrCreateUserFromToken).not.toHaveBeenCalled();
    expect(Subscription.findOne).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does not grant superadmin access from the role claim on another UID', async () => {
    const req = makeRequest('Bearer forged-role-token');
    const res = makeResponse();
    const next = jest.fn();
    admin.auth().verifyIdToken.mockResolvedValue({
      uid: 'ordinary-user',
      role: 'superadmin',
      email_verified: true,
      email: 'ordinary@example.com',
    });
    findOrCreateUserFromToken.mockResolvedValue(null);

    await authentication(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
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

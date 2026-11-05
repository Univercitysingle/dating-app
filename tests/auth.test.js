jest.mock('../services/firebaseAdmin', () => ({
  auth: jest.fn(),
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

const makeRequest = (authorization) => ({
  headers: authorization === undefined ? {} : { authorization },
  log: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
});
const makeResponse = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

describe('Firebase authentication middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('verifies a bearer token with revocation checking enabled', async () => {
    const decodedToken = { uid: 'verified-user', email_verified: true };
    const user = { uid: 'verified-user', _id: 'user-object-id' };
    const verifyIdToken = jest.fn().mockResolvedValue(decodedToken);
    admin.auth.mockReturnValue({ verifyIdToken });
    findOrCreateUserFromToken.mockResolvedValue(user);
    Subscription.findOne.mockResolvedValue(null);

    const req = makeRequest('Bearer firebase.id.token');
    const res = makeResponse();
    const next = jest.fn();

    await authentication(req, res, next);

    expect(verifyIdToken).toHaveBeenCalledWith('firebase.id.token', true);
    expect(findOrCreateUserFromToken).toHaveBeenCalledWith(decodedToken);
    expect(req.user).toBe(user);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects malformed authorization headers before Firebase verification', async () => {
    const req = makeRequest('Basic not-a-bearer-token');
    const res = makeResponse();
    const next = jest.fn();

    await authentication(req, res, next);

    expect(admin.auth).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects revoked Firebase tokens with HTTP 401', async () => {
    const revokedError = new Error('Token has been revoked');
    revokedError.code = 'auth/id-token-revoked';
    const verifyIdToken = jest.fn().mockRejectedValue(revokedError);
    admin.auth.mockReturnValue({ verifyIdToken });

    const req = makeRequest('Bearer revoked.firebase.token');
    const res = makeResponse();
    const next = jest.fn();

    await authentication(req, res, next);

    expect(verifyIdToken).toHaveBeenCalledWith('revoked.firebase.token', true);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

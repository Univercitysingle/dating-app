jest.mock('../models/User', () => {
  const MockUser = jest.fn(function (data) {
    Object.assign(this, data);
    this.save = jest.fn().mockResolvedValue(this);
  });
  MockUser.findOne = jest.fn();
  return MockUser;
});

const User = require('../models/User');
const { findOrCreateUserFromToken, sanitizeUser } = require('../utils/userUtils');

describe('findOrCreateUserFromToken email identity linking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns an existing UID match without attempting email linking', async () => {
    const existing = { uid: 'firebase-uid' };
    User.findOne.mockResolvedValueOnce(existing);

    await expect(findOrCreateUserFromToken({
      uid: 'firebase-uid',
      email: 'person@example.com',
      email_verified: false,
    })).resolves.toBe(existing);

    expect(User.findOne).toHaveBeenCalledTimes(1);
  });

  it('does not link an existing account when the Firebase email is unverified', async () => {
    User.findOne.mockResolvedValueOnce(null);

    await expect(findOrCreateUserFromToken({
      uid: 'attacker-uid',
      email: 'admin@example.com',
      email_verified: false,
    })).resolves.toBeNull();

    expect(User.findOne).toHaveBeenCalledTimes(1);
  });

  it('links an existing account only when the Firebase email is verified', async () => {
    const existing = { email: 'person@example.com', save: jest.fn().mockResolvedValue(true) };
    User.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(existing);

    await expect(findOrCreateUserFromToken({
      uid: 'verified-uid',
      email: 'person@example.com',
      email_verified: true,
    })).resolves.toBe(existing);

    expect(existing.uid).toBe('verified-uid');
    expect(existing.save).toHaveBeenCalledTimes(1);
  });

  it('does not provision a new account for an unverified email', async () => {
    User.findOne.mockResolvedValueOnce(null);

    await expect(findOrCreateUserFromToken({
      uid: 'unverified-uid',
      email: 'new@example.com',
      email_verified: false,
    })).resolves.toBeNull();

    expect(User).not.toHaveBeenCalled();
  });

  it('provisions a new account for a verified email', async () => {
    User.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    const result = await findOrCreateUserFromToken({
      uid: 'verified-new-uid',
      email: 'new@example.com',
      email_verified: true,
      name: 'New User',
    });

    expect(result.uid).toBe('verified-new-uid');
    expect(result.email).toBe('new@example.com');
    expect(result.save).toHaveBeenCalledTimes(1);
  });
});

describe('sanitizeUser sensitive data handling', () => {
  const privateFields = {
    uid: 'profile-owner',
    email: 'owner@example.com',
    mobileNumber: '+12345678901',
    password: '$2b$12$example-hash',
    lastLoginIp: '203.0.113.10',
    lastLoginDevice: 'private-device',
    mustSetPassword: true,
    blocked: ['other-user'],
    suspendedUntil: new Date('2030-01-01T00:00:00Z'),
    name: 'Profile Owner',
  };

  it('never returns password hashes, including to owners and superadmins', () => {
    const owner = sanitizeUser({ ...privateFields }, { uid: 'profile-owner', role: 'user' });
    const superadmin = sanitizeUser({ ...privateFields }, { uid: 'admin', role: 'superadmin' });

    expect(owner).not.toHaveProperty('password');
    expect(superadmin).not.toHaveProperty('password');
  });

  it('hides email and mobile number from profile owners but exposes them to superadmins', () => {
    const owner = sanitizeUser({ ...privateFields }, { uid: 'profile-owner', role: 'user' });
    const superadmin = sanitizeUser({ ...privateFields }, { uid: 'admin', role: 'superadmin' });

    expect(owner).not.toHaveProperty('email');
    expect(owner).not.toHaveProperty('mobileNumber');
    expect(superadmin.email).toBe('owner@example.com');
    expect(superadmin.mobileNumber).toBe('+12345678901');
  });

  it('removes contact and internal security metadata from public profiles', () => {
    const publicProfile = sanitizeUser({ ...privateFields }, { uid: 'viewer', role: 'user' });

    for (const field of [
      'email', 'mobileNumber', 'password', 'lastLoginIp',
      'lastLoginDevice', 'mustSetPassword', 'blocked', 'suspendedUntil',
    ]) {
      expect(publicProfile).not.toHaveProperty(field);
    }
    expect(publicProfile.name).toBe('Profile Owner');
  });
});

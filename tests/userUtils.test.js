jest.mock('../models/User', () => {
  const MockUser = jest.fn(function (data) {
    Object.assign(this, data);
    this.save = jest.fn().mockResolvedValue(this);
  });
  MockUser.findOne = jest.fn();
  return MockUser;
});

const User = require('../models/User');
const { findOrCreateUserFromToken } = require('../utils/userUtils');

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

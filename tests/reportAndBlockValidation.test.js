const { submitReport } = require('../controllers/reportsController');
const { blockUser, unblockUser } = require('../controllers/usersController');
const User = require('../models/User');

const makeResponse = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

const makeLog = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

describe('Report and block endpoint input validation', () => {
  afterEach(() => jest.restoreAllMocks());

  it('rejects a missing report body without throwing', async () => {
    const res = makeResponse();
    const findOneSpy = jest.spyOn(User, 'findOne');

    await submitReport({ user: { uid: 'reporter-uid' }, body: undefined }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'A valid reportedUserUid is required.' });
    expect(findOneSpy).not.toHaveBeenCalled();
  });

  it('rejects malformed authenticated reporter identities', async () => {
    const res = makeResponse();
    const findOneSpy = jest.spyOn(User, 'findOne');

    await submitReport({ user: { uid: 'bad\r\nuid' }, body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(findOneSpy).not.toHaveBeenCalled();
  });

  it('rejects malformed block targets before database access', async () => {
    const res = makeResponse();
    const findOneSpy = jest.spyOn(User, 'findOne');
    const updateSpy = jest.spyOn(User, 'findOneAndUpdate');

    await blockUser({
      user: { uid: 'current-user' },
      params: { userIdToBlock: { $ne: null } },
      log: makeLog(),
    }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(findOneSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('rejects malformed unblock targets before database access', async () => {
    const res = makeResponse();
    const updateSpy = jest.spyOn(User, 'findOneAndUpdate');

    await unblockUser({
      user: { uid: 'current-user' },
      params: { userIdToUnblock: 'bad\nuid' },
      log: makeLog(),
    }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(updateSpy).not.toHaveBeenCalled();
  });
});

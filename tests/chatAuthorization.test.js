jest.mock('../models/ChatMessage', () => ({ findOne: jest.fn() }));
jest.mock('../models/Match', () => ({ findOne: jest.fn() }));

const ChatMessage = require('../models/ChatMessage');
const Match = require('../models/Match');
const { authorizeRoom } = require('../services/chatAuthorization');

function queryResult(value) {
  return { select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(value) };
}

describe('chat authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ChatMessage.findOne.mockReturnValue(queryResult(null));
    Match.findOne.mockReturnValue(queryResult(null));
  });

  it('rejects empty and malformed room IDs', async () => {
    await expect(authorizeRoom('user-a', '', 'user-b')).resolves.toBe(false);
    await expect(authorizeRoom('user-a', 'x'.repeat(257), 'user-b')).resolves.toBe(false);
  });

  it('rejects sending to yourself', async () => {
    await expect(authorizeRoom('user-a', 'user-a-user-a', 'user-a')).resolves.toBe(false);
  });

  it('rejects an unmatched pair even when the room ID looks valid', async () => {
    await expect(authorizeRoom('user-a', 'user-a-user-b', 'user-b')).resolves.toBe(false);
    expect(Match.findOne).toHaveBeenCalled();
  });

  it('allows a matched pair to use its conversation room', async () => {
    Match.findOne.mockReturnValue(queryResult({ _id: 'match-1' }));
    await expect(authorizeRoom('user-a', 'user-a-user-b', 'user-b')).resolves.toBe(true);
  });

  it('rejects a room ID that does not match the supplied participants', async () => {
    await expect(authorizeRoom('user-a', 'user-a-user-c', 'user-b')).resolves.toBe(false);
    expect(Match.findOne).not.toHaveBeenCalled();
  });
});

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
    await expect(authorizeRoom('uidA', '', 'uidB')).resolves.toBe(false);
    await expect(authorizeRoom('uidA', 'x'.repeat(257), 'uidB')).resolves.toBe(false);
  });

  it('rejects sending to yourself', async () => {
    await expect(authorizeRoom('uidA', 'uidA-uidA', 'uidA')).resolves.toBe(false);
  });

  it('rejects an unmatched pair even when the room ID looks valid', async () => {
    await expect(authorizeRoom('uidA', 'uidA-uidB', 'uidB')).resolves.toBe(false);
    expect(Match.findOne).toHaveBeenCalled();
  });

  it('allows a matched pair to use its conversation room', async () => {
    Match.findOne.mockReturnValue(queryResult({ _id: 'match-1' }));
    await expect(authorizeRoom('uidA', 'uidA-uidB', 'uidB')).resolves.toBe(true);
  });

  it('rejects a room ID that does not match the supplied participants', async () => {
    await expect(authorizeRoom('uidA', 'uidA-uidC', 'uidB')).resolves.toBe(false);
    expect(Match.findOne).not.toHaveBeenCalled();
  });
});

import { collectPendingDeliveryMessages, getChatPeerUidFromRoomId, getVisibleChatMessageIds } from './chat';

const entry = (id, ratio, isIntersecting = true) => ({
  isIntersecting,
  intersectionRatio: ratio,
  target: {
    getAttribute: name => name === 'data-chat-message-id' ? id : null,
  },
});

describe('getVisibleChatMessageIds', () => {
  test('only returns valid message IDs at or above the visibility threshold', () => {
    expect(getVisibleChatMessageIds([
      entry('6729a0000000000000000001', 0.59),
      entry('6729a0000000000000000002', 0.6),
      entry('6729a0000000000000000003', 0.95),
    ])).toEqual([
      '6729a0000000000000000002',
      '6729a0000000000000000003',
    ]);
  });

  test('ignores non-intersecting entries and malformed message IDs', () => {
    expect(getVisibleChatMessageIds([
      entry('6729a0000000000000000001', 1, false),
      entry('not-an-object-id', 1),
      entry(null, 1),
    ])).toEqual([]);
  });

  test('clamps a supplied threshold and safely handles invalid entries', () => {
    expect(getVisibleChatMessageIds([
      entry('6729a0000000000000000001', 0.5),
      null,
    ], 2)).toEqual([]);
    expect(getVisibleChatMessageIds(null)).toEqual([]);
  });
});

describe('collectPendingDeliveryMessages', () => {
  const message = (id, status = 'sent') => ({
    _id: id,
    receiverUid: 'recipient-uid',
    status,
  });

  test('retains failed receipts for retry when a later history page is empty', () => {
    const pending = new Map();
    const first = message('6729a0000000000000000001');

    expect(collectPendingDeliveryMessages([first], pending, 'recipient-uid')).toEqual([first]);
    expect(collectPendingDeliveryMessages([], pending, 'recipient-uid')).toEqual([first]);
  });

  test('removes a queued receipt when persisted status advances', () => {
    const pending = new Map();
    const first = message('6729a0000000000000000001');

    collectPendingDeliveryMessages([first], pending, 'recipient-uid');
    expect(collectPendingDeliveryMessages([
      message('6729a0000000000000000001', 'delivered'),
    ], pending, 'recipient-uid')).toEqual([]);
    expect(pending.size).toBe(0);
  });

  test('ignores other recipients and invalid message identifiers', () => {
    const pending = new Map();
    expect(collectPendingDeliveryMessages([
      message('invalid-id'),
      { ...message('6729a0000000000000000002'), receiverUid: 'someone-else' },
    ], pending, 'recipient-uid')).toEqual([]);
    expect(pending.size).toBe(0);
  });
});


describe('getChatPeerUidFromRoomId', () => {
  test('resolves a peer when the authenticated UID is at either room boundary', () => {
    expect(getChatPeerUidFromRoomId('alice-bob', 'alice')).toBe('bob');
    expect(getChatPeerUidFromRoomId('alice-bob', 'bob')).toBe('alice');
  });

  test('handles hyphens inside either participant UID without splitting ambiguously', () => {
    expect(getChatPeerUidFromRoomId('user-with-hyphens-peer-id', 'user-with-hyphens')).toBe('peer-id');
    expect(getChatPeerUidFromRoomId('peer-id-user-with-hyphens', 'user-with-hyphens')).toBe('peer-id');
  });

  test('rejects unrelated, empty, self, and oversized room identities', () => {
    expect(getChatPeerUidFromRoomId('alice-bob', 'charlie')).toBeNull();
    expect(getChatPeerUidFromRoomId('alice-alice', 'alice')).toBeNull();
    expect(getChatPeerUidFromRoomId('alice-', 'alice')).toBeNull();
    expect(getChatPeerUidFromRoomId('x'.repeat(261), 'alice')).toBeNull();
    expect(getChatPeerUidFromRoomId(null, 'alice')).toBeNull();
  });
});

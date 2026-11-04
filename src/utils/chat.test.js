import { getVisibleChatMessageIds } from './chat';

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

import { shouldBePolitePeer } from './webrtcNegotiation';

describe('shouldBePolitePeer', () => {
  test('selects exactly one polite peer when receiver ID sorts after caller ID', () => {
    expect(shouldBePolitePeer('user-b', 'user-a', 'user-b')).toBe(true);
    expect(shouldBePolitePeer('user-a', 'user-a', 'user-b')).toBe(false);
  });

  test('selects exactly one polite peer when receiver ID sorts before caller ID', () => {
    expect(shouldBePolitePeer('user-a', 'user-b', 'user-a')).toBe(false);
    expect(shouldBePolitePeer('user-b', 'user-b', 'user-a')).toBe(true);
  });

  test('rejects unknown participants and malformed call identities', () => {
    expect(shouldBePolitePeer('user-x', 'user-a', 'user-b')).toBe(false);
    expect(shouldBePolitePeer('user-a', 'user-a', 'user-a')).toBe(false);
    expect(shouldBePolitePeer('', 'user-a', 'user-b')).toBe(false);
  });
});

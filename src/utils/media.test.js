import { extractPhotoKey, resolvePhotoUrl, resolveWorkerPhotoUrl, PLACEHOLDER_IMAGE } from './media';

const PHOTO_KEY = 'photos-user_123-550e8400-e29b-41d4-a716-446655440000.jpg';
const WORKER_URL = `https://dating-app-api-staging.enadoctemp.workers.dev/api/media/${PHOTO_KEY}`;

describe('shared photo URL resolver', () => {
  test.each([
    PHOTO_KEY,
    `/${PHOTO_KEY}`,
    `/api/media/${PHOTO_KEY}`,
    `/media/${PHOTO_KEY}`,
    `https://legacy.example.test/${PHOTO_KEY}`,
    `https://legacy.example.test/api/media/${PHOTO_KEY}`,
  ])('extracts the canonical key from %s', (value) => {
    expect(extractPhotoKey(value)).toBe(PHOTO_KEY);
  });

  test('routes a recognized photo key through the media Worker when no build-time CDN is configured', () => {
    expect(resolvePhotoUrl(PHOTO_KEY)).toBe(WORKER_URL);
    expect(resolveWorkerPhotoUrl(`https://legacy.example.test/${PHOTO_KEY}`)).toBe(WORKER_URL);
  });

  test('returns a placeholder when no photo is available', () => {
    expect(resolvePhotoUrl('')).toBe(PLACEHOLDER_IMAGE);
  });

  test('does not rewrite unrelated external image URLs', () => {
    expect(resolvePhotoUrl('https://images.example.test/avatar.png')).toBe('https://images.example.test/avatar.png');
  });
});

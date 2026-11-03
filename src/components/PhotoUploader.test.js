import { convertPhotoToWebP } from './PhotoUploader';

describe('convertPhotoToWebP', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete global.createImageBitmap;
  });

  test('converts JPEG to WebP without changing image dimensions', async () => {
    const close = jest.fn();
    global.createImageBitmap = jest.fn().mockResolvedValue({ width: 1200, height: 800, close });
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: jest.fn()
    });
    jest.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type, quality) => {
      expect(type).toBe('image/webp');
      expect(quality).toBe(1);
      callback(new Blob(['webp-image-data'], { type: 'image/webp' }));
    });

    const source = new File(['jpeg-image-data'], 'profile-photo.jpg', {
      type: 'image/jpeg',
      lastModified: 123
    });
    const result = await convertPhotoToWebP(source);

    expect(result).toBeInstanceOf(File);
    expect(result.name).toBe('profile-photo.webp');
    expect(result.type).toBe('image/webp');
    expect(result.lastModified).toBe(123);
    expect(close).toHaveBeenCalledTimes(1);
  });

  test('preserves animated GIF files instead of flattening their animation', async () => {
    const gif = new File(['gif-data'], 'animated.gif', { type: 'image/gif' });
    await expect(convertPhotoToWebP(gif)).resolves.toBe(gif);
    expect(global.createImageBitmap).toBeUndefined();
  });

  test('keeps the original file when browser WebP encoding is unavailable', async () => {
    const png = new File(['png-data'], 'photo.png', { type: 'image/png' });
    await expect(convertPhotoToWebP(png)).resolves.toBe(png);
  });

  test('keeps the original file if the WebP result exceeds the upload limit', async () => {
    global.createImageBitmap = jest.fn().mockResolvedValue({
      width: 100,
      height: 100,
      close: jest.fn()
    });
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: jest.fn()
    });
    jest.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callback(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/webp' }));
    });

    const png = new File(['small-png'], 'photo.png', { type: 'image/png' });
    await expect(convertPhotoToWebP(png)).resolves.toBe(png);
  });
});

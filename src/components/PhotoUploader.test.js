import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PhotoUploader, { convertPhotoToWebP } from './PhotoUploader';
import apiClient from '../api/apiClient';

jest.mock('../api/apiClient', () => ({
  __esModule: true,
  default: { post: jest.fn() }
}));

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


describe('PhotoUploader authenticated API handoff', () => {
  test('posts the selected image through the API client and returns the CDN response', async () => {
    const onUploadComplete = jest.fn();
    const uploadResponse = {
      fileUrl: 'https://dateme.enadoctemp.workers.dev/photos-synthetic-user-123.webp'
    };

    apiClient.post.mockResolvedValue(uploadResponse);

    render(React.createElement(PhotoUploader, { onUploadComplete }));

    const file = new File(['synthetic-image-data'], 'registration-photo.jpg', {
      type: 'image/jpeg'
    });
    fireEvent.change(screen.getByLabelText(/upload photo/i), {
      target: { files: [file] }
    });

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledTimes(1);
      expect(onUploadComplete).toHaveBeenCalledWith(uploadResponse);
    });

    const [path, formData] = apiClient.post.mock.calls[0];
    expect(path).toBe('/users/photos');
    expect(formData).toBeInstanceOf(FormData);
    expect(formData.get('photo')).toBeInstanceOf(File);
    expect(formData.get('photo').name).toBe('registration-photo.jpg');
  });

  test('shows a clear error when the upload API omits the photo reference', async () => {
    const onUploadComplete = jest.fn();
    apiClient.post.mockResolvedValue({ message: 'Uploaded' });
    render(React.createElement(PhotoUploader, { onUploadComplete }));

    const file = new File(['synthetic-image-data'], 'registration-photo.jpg', {
      type: 'image/jpeg'
    });
    fireEvent.change(screen.getByLabelText(/upload photo/i), {
      target: { files: [file] }
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/did not return a usable photo reference/i);
    expect(onUploadComplete).not.toHaveBeenCalled();
  });

  test('announces upload progress and disables selection while uploading', async () => {
    let resolveUpload;
    apiClient.post.mockReturnValue(new Promise(resolve => { resolveUpload = resolve; }));
    render(React.createElement(PhotoUploader, { onUploadComplete: jest.fn() }));

    const input = screen.getByLabelText(/upload photo/i);
    fireEvent.change(input, {
      target: { files: [new File(['image'], 'photo.jpg', { type: 'image/jpeg' })] }
    });

    expect(await screen.findByRole('status')).toHaveTextContent(/uploading and securing/i);
    expect(input).toBeDisabled();

    resolveUpload({ fileUrl: 'photos-test-user-123.webp' });
    await waitFor(() => expect(input).not.toBeDisabled());
  });

});

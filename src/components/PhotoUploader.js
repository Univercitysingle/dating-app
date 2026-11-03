import React, { useState } from 'react';
import apiClient from '../api/apiClient';
import { getUserFriendlyError } from '../utils/apiErrors';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_PHOTO_SIZE = 5 * 1024 * 1024;

// Convert still JPEG/PNG images without resizing. The browser's WebP encoder
// uses its highest-quality setting. Animated GIFs are kept unchanged so their
// animation is not lost. If WebP encoding is unavailable or produces a file
// over the API limit, retain the validated original instead.
export const convertPhotoToWebP = async (file) => {
  if (!file || (file.type !== 'image/jpeg' && file.type !== 'image/png')) return file;
  if (typeof createImageBitmap !== 'function') return file;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) return file;

    context.drawImage(bitmap, 0, 0);
    const webpBlob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/webp', 1);
    });

    if (!webpBlob || webpBlob.type !== 'image/webp' ||
        webpBlob.size < 1 || webpBlob.size > MAX_PHOTO_SIZE) {
      return file;
    }

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([webpBlob], baseName + '.webp', {
      type: 'image/webp',
      lastModified: file.lastModified
    });
  } catch {
    // Encoding is an optimization, not a reason to block a valid upload.
    return file;
  } finally {
    if (bitmap && typeof bitmap.close === 'function') bitmap.close();
  }
};

const PhotoUploader = ({ onUploadComplete, isDisabled }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileChange = async (e) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    setError(null);
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setError('Choose a JPEG, PNG, GIF, or WebP image.');
      input.value = '';
      return;
    }
    if (file.size < 1 || file.size > MAX_PHOTO_SIZE) {
      setError('Photo must be 5 MB or smaller.');
      input.value = '';
      return;
    }

    setIsUploading(true);
    try {
      const uploadFile = await convertPhotoToWebP(file);
      const formData = new FormData();
      formData.append('photo', uploadFile, uploadFile.name);

      const response = await apiClient.post('/users/photos', formData);
      onUploadComplete(response);
    } catch (err) {
      setError(getUserFriendlyError(err, 'Your photo could not be uploaded. Please try again.'));
    } finally {
      setIsUploading(false);
      input.value = '';
    }
  };

  return (
    <div className="my-4">
      <label
        htmlFor="photo-upload"
        className={`block px-4 py-2 text-sm font-medium text-white rounded-md ${
          isDisabled
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-green-600 cursor-pointer hover:bg-green-700'
        }`}
      >
        {isUploading ? 'Uploading...' : 'Upload Photo'}
      </label>
      <input
        id="photo-upload"
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={handleFileChange}
        className="hidden"
        disabled={isUploading || isDisabled}
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {isDisabled && <p className="mt-2 text-sm text-gray-500">You have reached the maximum of 6 photos.</p>}
    </div>
  );
};

export default PhotoUploader;

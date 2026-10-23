import React, { useState } from 'react';
import apiClient from '../api/apiClient';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif']);
const MAX_PHOTO_SIZE = 5 * 1024 * 1024;
const MAX_IMAGE_WIDTH = 600;
const WEBP_QUALITY = 0.8;

async function normalizePhotoForUpload(file) {
  if (typeof createImageBitmap !== 'function') {
    throw new Error('This browser cannot optimize photos. Please try a current version of Chrome, Edge, Firefox, or Safari.');
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_IMAGE_WIDTH / bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Photo optimization is not available in this browser.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => {
        if (!result) reject(new Error('Could not optimize this photo.'));
        else resolve(result);
      }, 'image/webp', WEBP_QUALITY);
    });
    if (blob.type !== 'image/webp') {
      throw new Error('This browser could not convert the photo to WebP.');
    }
    if (blob.size < 1 || blob.size > MAX_PHOTO_SIZE) {
      throw new Error('Optimized photo must be smaller than 5 MB.');
    }
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], baseName + '.webp', { type: 'image/webp', lastModified: Date.now() });
  } finally {
    bitmap.close?.();
  }
}

const PhotoUploader = ({ onUploadComplete, isDisabled }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileChange = async (e) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    setError(null);
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setError('Choose a JPEG, PNG, or GIF image.');
      input.value = '';
      return;
    }
    if (file.size < 1 || file.size > MAX_PHOTO_SIZE) {
      setError('Photo must be smaller than 5 MB.');
      input.value = '';
      return;
    }

    setIsUploading(true);
    try {
      // Match the legacy Sharp pipeline: max width 600px, no enlargement,
      // WebP output, and quality 80 before the API writes the object to B2.
      const optimizedPhoto = await normalizePhotoForUpload(file);
      const formData = new FormData();
      formData.append('photo', optimizedPhoto);

      const response = await apiClient.post('/users/photos', formData);
      onUploadComplete(response);
    } catch (err) {
      setError(err.data?.message || err.message || 'Failed to upload photo.');
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
        accept="image/jpeg,image/png,image/gif"
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

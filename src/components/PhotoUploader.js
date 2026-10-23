import React, { useState } from 'react';
import apiClient from '../api/apiClient';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif']);
const MAX_PHOTO_SIZE = 5 * 1024 * 1024;

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
    const formData = new FormData();
    formData.append('photo', file);

    try {
      const response = await apiClient.post('/users/photos', formData);
      onUploadComplete(response);
    } catch (err) {
      setError(err.data?.message || 'Failed to upload photo.');
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

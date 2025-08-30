import React, { useState } from 'react';
import apiClient from '../api/apiClient';

const PhotoUploader = ({ onUploadComplete, isDisabled }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('photo', file);

    try {
      const response = await apiClient.post('/api/users/photos', formData);
      onUploadComplete(response.fileUrl);
    } catch (err) {
      setError(err.data?.message || 'Failed to upload photo.');
    } finally {
      setIsUploading(false);
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
        accept="image/*"
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

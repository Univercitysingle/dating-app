import React, { useState, useEffect } from 'react';
import apiClient from '../api/apiClient';
import PhotoUploader from './PhotoUploader';
import { rewriteCdnUrl } from '../utils/helpers';

const PhotoEditor = ({ photos, onSave, onCancel }) => {
  const [localPhotos, setLocalPhotos] = useState(photos);

  useEffect(() => {
    setLocalPhotos(photos);
  }, [photos]);

  const handleReorder = (newPhotos) => {
    setLocalPhotos(newPhotos);
  };

  const handleDelete = async (photoUrl) => {
    try {
      // Pass photoUrl as a query parameter, which is a more common pattern for DELETE requests.
      const updatedUser = await apiClient.delete(`/api/users/photos?photoUrl=${encodeURIComponent(photoUrl)}`);
      setLocalPhotos(updatedUser.photos);
    } catch (err) {
      console.error('Failed to delete photo:', err);
    }
  };

  const handleSave = async () => {
    try {
      const updatedUser = await apiClient.put('/api/users/photos/order', { photos: localPhotos });
      onSave(updatedUser);
    } catch (err) {
      console.error('Failed to save photo order:', err);
    }
  };

  const handleUploadComplete = (newPhotoUrl) => {
    // The API returns just the filename, so we prepend the known path to construct
    // a relative URL that our rewriteCdnUrl helper can process.
    const fullPath = `/uploads/${newPhotoUrl}`;
    const newPhoto = { url: fullPath, order: localPhotos.length };
    setLocalPhotos([...localPhotos, newPhoto]);
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow-md">
      <h3 className="text-lg font-semibold mb-4">Edit Photos</h3>
      <PhotoUploader
        onUploadComplete={handleUploadComplete}
        isDisabled={localPhotos.length >= 6}
      />
      <div className="grid grid-cols-3 gap-4">
        {localPhotos.map((photo, index) => (
          <div key={index} className="relative">
            <img
              src={rewriteCdnUrl(photo.url)}
              alt={`User photo ${index + 1}`}
              className="object-cover w-full h-32 rounded-lg"
            />
            <button
              onClick={() => handleDelete(photo.url)}
              className="absolute top-1 right-1 px-2 py-1 text-xs font-medium text-white bg-red-600 rounded-full hover:bg-red-700 disabled:bg-gray-400"
              disabled={localPhotos.length <= 1}
            >
              X
            </button>
          </div>
        ))}
      </div>
      <div className="flex justify-end mt-4">
        <button
          onClick={onCancel}
          className="px-4 py-2 mr-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          Save
        </button>
      </div>
    </div>
  );
};

export default PhotoEditor;

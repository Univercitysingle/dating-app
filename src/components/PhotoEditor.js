import React, { useState } from 'react';
import apiClient from '../api/apiClient';
import PhotoUploader from './PhotoUploader';

const PhotoEditor = ({ photos, onSave, onCancel }) => {
  const [localPhotos, setLocalPhotos] = useState(photos);

  const handleReorder = (newPhotos) => {
    setLocalPhotos(newPhotos);
  };

  const handleDelete = async (photoUrl) => {
    try {
      const updatedUser = await apiClient.delete('/api/users/photos', { data: { photoUrl } });
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

  return (
    <div className="p-4 bg-white rounded-lg shadow-md">
      <h3 className="text-lg font-semibold mb-4">Edit Photos</h3>
      <PhotoUploader onUploadComplete={(updatedUser) => setLocalPhotos(updatedUser.photos)} />
      <div className="grid grid-cols-3 gap-4">
        {localPhotos.map((photo, index) => (
          <div key={index} className="relative">
            <img
              src={photo.url}
              alt={`User photo ${index + 1}`}
              className="object-cover w-full h-32 rounded-lg"
            />
            <button
              onClick={() => handleDelete(photo.url)}
              className="absolute top-1 right-1 px-2 py-1 text-xs font-medium text-white bg-red-600 rounded-full hover:bg-red-700"
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

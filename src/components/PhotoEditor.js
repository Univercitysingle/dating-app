import React, { useState, useEffect } from 'react';
import apiClient from '../api/apiClient';
import PhotoUploader from './PhotoUploader';
import { resolvePhotoUrl, resolveWorkerPhotoUrl, PLACEHOLDER_IMAGE } from '../utils/media';

const PhotoEditor = ({ photos, onSave, onCancel }) => {
  const [localPhotos, setLocalPhotos] = useState(Array.isArray(photos) ? photos : []);
  const [actionError, setActionError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const getPhotosFromResponse = (response) => {
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.photos)) return response.photos;
    if (Array.isArray(response?.user?.photos)) return response.user.photos;
    if (Array.isArray(response?.data?.photos)) return response.data.photos;
    if (Array.isArray(response?.profile?.photos)) return response.profile.photos;
    return null;
  };

  useEffect(() => {
    setLocalPhotos(Array.isArray(photos) ? photos : []);
  }, [photos]);

  const handleReorder = (newPhotos) => {
    setLocalPhotos(newPhotos);
  };

  const handleDelete = async (photoUrl) => {
    if (isDeleting || localPhotos.length <= 1) return;
    setActionError('');
    setIsDeleting(true);
    try {
      // The backend can extract the object key from the full CDN URL.
      const response = await apiClient.delete('/users/photos', { photoUrl });
      const responsePhotos = getPhotosFromResponse(response);
      // Some successful API responses contain only a status/message. In that
      // case, update the editor locally instead of assigning undefined state.
      setLocalPhotos(responsePhotos || localPhotos.filter(photo => photo?.url !== photoUrl));
    } catch (err) {
      console.error('Failed to delete photo:', err);
      setActionError(err?.data?.message || err?.message || 'Unable to delete this photo. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSave = async () => {
    try {
      // Before saving, we need to convert any full CDN URLs back to raw keys for storage.
      const photosToSave = localPhotos.map(p => ({
        ...p,
        url: p.url.substring(p.url.lastIndexOf('/') + 1)
      }));
      const updatedUser = await apiClient.put('/users/photos/order', { photos: photosToSave });
      const savedPhotos = getPhotosFromResponse(updatedUser);
      onSave(savedPhotos ? { ...updatedUser, photos: savedPhotos } : { photos: localPhotos });
    } catch (err) {
      console.error('Failed to save photo order:', err);
    }
  };

  const handleUploadComplete = (uploadResponse) => {
    // The API response now includes the final CDN URL.
    const key = uploadResponse.fileUrl || uploadResponse.photo?.url || '';
    const cdnUrl = uploadResponse.cdnUrl || (key.startsWith('https://') || key.startsWith('http://') ? key : '');
    if (!cdnUrl) return;
    const newPhoto = { url: cdnUrl, order: localPhotos.length, size: uploadResponse.size || uploadResponse.photo?.size || 0 };
    setLocalPhotos(currentPhotos => [...currentPhotos, newPhoto]);
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow-md">
      <h3 className="text-lg font-semibold mb-4">Edit Photos</h3>
      <PhotoUploader
        onUploadComplete={handleUploadComplete}
        isDisabled={localPhotos.length >= 6}
      />
      {actionError && <p role="alert" className="mt-3 text-sm text-red-600">{actionError}</p>}
      <div className="grid grid-cols-3 gap-4">
        {(Array.isArray(localPhotos) ? localPhotos : []).map((photo, index) => (
          <div key={index} className="relative">
            <img
              src={resolvePhotoUrl(photo.url)}
              alt={`User photo ${index + 1}`}
              className="object-cover w-full h-32 rounded-lg"
              onError={(event) => {
                const image = event.currentTarget;
                const fallback = resolveWorkerPhotoUrl(photo.url);
                if (fallback && image.src !== fallback) {
                  image.src = fallback;
                  return;
                }
                if (image.src !== PLACEHOLDER_IMAGE) image.src = PLACEHOLDER_IMAGE;
              }}
            />
            <button
              onClick={() => handleDelete(photo.url)}
              className="absolute top-1 right-1 px-2 py-1 text-xs font-medium text-white bg-red-600 rounded-full hover:bg-red-700 disabled:bg-gray-400"
              disabled={localPhotos.length <= 1 || isDeleting}
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

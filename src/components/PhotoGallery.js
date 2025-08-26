import React from 'react';

const PhotoGallery = ({ photos, onEdit }) => {
  return (
    <div className="p-4 bg-white rounded-lg shadow-md">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Photos</h3>
        <button
          onClick={onEdit}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          Edit
        </button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {photos.map((photo, index) => (
          <div key={index} className="relative">
            <img
              src={photo.url}
              alt={`User photo ${index + 1}`}
              className="object-cover w-full h-32 rounded-lg"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default PhotoGallery;

import React, { useState } from 'react';

const PhotoGallery = ({ photos, onEdit }) => {
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  const handleNext = () => {
    setCurrentPhotoIndex((prevIndex) => (prevIndex + 1) % photos.length);
  };

  const handlePrev = () => {
    setCurrentPhotoIndex((prevIndex) => (prevIndex - 1 + photos.length) % photos.length);
  };

  if (!photos || photos.length === 0) {
    return (
      <div className="relative w-full h-96 bg-neutral-200 dark:bg-neutral-800 rounded-lg flex items-center justify-center">
        <p className="text-neutral-500">No photos to display.</p>
        <button
          onClick={onEdit}
          className="absolute top-4 right-4 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          Add Photos
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-96 rounded-lg overflow-hidden shadow-lg">
      {/* Image Indicators */}
      <div className="absolute top-2 left-2 right-2 flex space-x-1 z-10">
        {photos.map((_, index) => (
          <div
            key={index}
            className={`h-1 flex-1 rounded-full ${
              index === currentPhotoIndex ? 'bg-white' : 'bg-white/50'
            }`}
          />
        ))}
      </div>

      {/* Main Image */}
      <img
        src={photos[currentPhotoIndex].url}
        alt={`User photo ${currentPhotoIndex + 1}`}
        className="w-full h-full object-cover"
      />

      {/* Navigation Overlays */}
      <div className="absolute inset-0 flex">
        <div className="w-1/2 h-full" onClick={handlePrev} />
        <div className="w-1/2 h-full" onClick={handleNext} />
      </div>

      {/* Edit Button */}
      <button
        onClick={onEdit}
        className="absolute top-4 right-4 px-4 py-2 text-sm font-medium text-white bg-black/50 rounded-md hover:bg-black/75"
      >
        Edit
      </button>
    </div>
  );
};

export default PhotoGallery;

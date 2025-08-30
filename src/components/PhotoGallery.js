import React from 'react';

const PhotoGallery = ({ photos, prompts: promptsProp, onEdit }) => {
  const items = [];
  const prompts = promptsProp || [];
  photos.forEach((photo, index) => {
    items.push(
      <div key={`photo-${index}`} className="relative">
        <img
          src={photo.url}
          alt={`User photo ${index + 1}`}
          className="object-cover w-full h-32 rounded-lg"
        />
      </div>
    );
    if ((index + 1) % 2 === 0 && prompts[(index + 1) / 2 - 1]) {
      const prompt = prompts[(index + 1) / 2 - 1];
      items.push(
        <div key={`prompt-${index}`} className="p-4 bg-gray-100 rounded-lg">
          <h4 className="font-semibold">{prompt.prompt}</h4>
          <p>{prompt.answer}</p>
        </div>
      );
    }
  });

  return (
    <div className="p-4 bg-white rounded-lg shadow-md">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Photos & Prompts</h3>
        <button
          onClick={onEdit}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          Edit
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items}
      </div>
    </div>
  );
};

export default PhotoGallery;

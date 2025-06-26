import React from 'react';

const SwipeCard = ({ user }) => {
  if (!user) {
    return null; // Or some placeholder/loading state if preferred
  }

  const { name, age, images, bio } = user;
  const primaryImage = images && images.length > 0 ? images[0] : 'https://via.placeholder.com/400x600?text=No+Image'; // Fallback image

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden shadow-xl bg-gray-300">
      <img
        src={primaryImage}
        alt={name || 'User profile'}
        className="w-full h-full object-cover"
      />
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
        <h3 className="text-2xl font-bold text-white">{name || 'Unknown User'}</h3>
        {age && <p className="text-xl text-gray-200">{age}</p>}
        {/*
          Optionally, display a snippet of bio here if desired:
          {bio && <p className="text-sm text-gray-300 mt-1 truncate">{bio}</p>}
        */}
      </div>
    </div>
  );
};

export default SwipeCard;

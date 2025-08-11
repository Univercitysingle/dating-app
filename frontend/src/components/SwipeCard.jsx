import React from 'react';
import PropTypes from 'prop-types';

const SwipeCard = ({ user }) => {
  if (!user) {
    return null;
  }

  const { name, age, images } = user;
  const primaryImage =
    images && images.length > 0
      ? images[0]
      : 'https://via.placeholder.com/400x600?text=No+Image';

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden shadow-xl bg-gray-300">
      <img
        src={primaryImage}
        alt={name || 'User profile'}
        className="w-full h-full object-cover"
      />
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
        <h3 className="text-2xl font-bold text-white">
          {name || 'Unknown User'}
        </h3>
        {age && <p className="text-xl text-gray-200">{age}</p>}
      </div>
    </div>
  );
};

SwipeCard.propTypes = {
  user: PropTypes.shape({
    name: PropTypes.string,
    age: PropTypes.number,
    images: PropTypes.arrayOf(PropTypes.string),
    bio: PropTypes.string,
  }),
};

export default SwipeCard;

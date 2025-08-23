import React from 'react';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';

const SwipeCard = ({ user, onVote, onSwipe }) => {
  if (!user) {
    return null;
  }

  const { name, age, images } = user;
  const primaryImage =
    images && images.length > 0
      ? images[0]
      : 'https://via.placeholder.com/400x600?text=Profile+Image';

  const handleDragEnd = (event, info) => {
    if (info.offset.x > 100) {
      onVote(user._id, 'right');
    } else if (info.offset.x < -100) {
      onVote(user._id, 'left');
    }
  };

  return (
    <motion.div
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={handleDragEnd}
      onAnimationComplete={onSwipe}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 300, opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="absolute w-full h-full"
    >
      <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-card bg-neutral-300 border border-neutral-200 dark:border-neutral-700">
        <img
          src={primaryImage}
          alt={name || 'User profile'}
          className="w-full h-full object-cover"
        />
        <div className="absolute top-4 right-4">
          <button className="text-neutral-50 opacity-80 hover:opacity-100">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
          </button>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-neutral-900/80 to-transparent h-1/2 flex flex-col justify-end">
          <h3 className="text-3xl font-extrabold text-neutral-50">
            {name || 'Unknown User'}
          </h3>
          {age && <p className="text-2xl text-neutral-100">{age}</p>}
        </div>
      </div>
    </motion.div>
  );
};

SwipeCard.propTypes = {
  user: PropTypes.shape({
    _id: PropTypes.string.isRequired,
    name: PropTypes.string,
    age: PropTypes.number,
    images: PropTypes.arrayOf(PropTypes.string),
    bio: PropTypes.string,
  }),
  onVote: PropTypes.func.isRequired,
  onSwipe: PropTypes.func.isRequired,
};

export default SwipeCard;

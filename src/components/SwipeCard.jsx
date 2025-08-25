import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';

const SwipeCard = ({ user, onVote, onSwipe, style }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  if (!user) {
    return null;
  }

  const { name, age, images, bio, interests } = user;
  const imageSources =
    images && images.length > 0
      ? images
      : ['https://placehold.co/400x600?text=Profile+Image'];

  const handleDragEnd = (event, info) => {
    if (info.offset.x > 100) {
      onVote(user._id, 'right');
    } else if (info.offset.x < -100) {
      onVote(user._id, 'left');
    }
  };

  const changeImage = (direction) => {
    // Prevent image change when details are expanded
    if (isExpanded) return;

    setCurrentImageIndex((prevIndex) => {
      if (direction === 'next') {
        return (prevIndex + 1) % imageSources.length;
      } else {
        return (prevIndex - 1 + imageSources.length) % imageSources.length;
      }
    });
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
      style={style}
    >
      <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-card bg-neutral-800 border border-neutral-700">
        {/* Scrollable container for details */}
        <motion.div
          className="w-full h-full overflow-y-auto"
          animate={{ scrollTop: isExpanded ? 100 : 0 }}
        >
          {/* Image and Navigation */}
          <div className="absolute inset-0 h-full">
            <img
              src={imageSources[currentImageIndex]}
              alt={name || 'User profile'}
              className="w-full h-full object-cover"
            />

            {/* Navigation Areas */}
            <div className="absolute inset-0 flex">
              <div
                className="w-1/2 h-full"
                onClick={() => changeImage('prev')}
              />
              <div
                className="w-1/2 h-full"
                onClick={() => changeImage('next')}
              />
            </div>
          </div>

          {/* Image Indicators */}
          <div className="absolute top-2 left-2 right-2 flex space-x-1 z-10">
            {imageSources.map((_, index) => (
              <div key={index} className="h-1 flex-1 rounded-full bg-neutral-50/50">
                <div
                  className={`h-full rounded-full ${
                    index === currentImageIndex ? 'bg-neutral-50' : ''
                  }`}
                  style={{
                    width: '100%',
                    transform: `scaleX(${index === currentImageIndex ? 1 : 0})`,
                    transformOrigin: 'left',
                    transition: 'transform 0.3s ease-in-out',
                  }}
                />
              </div>
            ))}
          </div>

          {/* Info button */}
          <div className="absolute top-4 right-4 z-10">
            <button onClick={() => setIsExpanded(!isExpanded)} className="text-neutral-50 opacity-80 hover:opacity-100">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </button>
          </div>

          {/* Basic Info Overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-neutral-900/80 to-transparent h-1/2 flex flex-col justify-end">
            <h3 className="text-3xl font-extrabold text-neutral-50">
              {name || 'Unknown User'}
            </h3>
            {age && <p className="text-2xl text-neutral-100">{age}</p>}
          </div>

          {/* Expanded Details Section */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="relative top-full bg-neutral-800 text-neutral-100 p-6"
              >
                <h4 className="font-bold text-lg">About Me</h4>
                <p className="mb-4">{bio || 'No bio yet.'}</p>
                <h4 className="font-bold text-lg">Interests</h4>
                <div className="flex flex-wrap gap-2">
                  {(interests || []).map((interest) => (
                    <span key={interest} className="px-3 py-1 bg-primary/20 text-primary-light rounded-full text-sm">
                      {interest}
                    </span>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
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
    interests: PropTypes.arrayOf(PropTypes.string),
  }),
  onVote: PropTypes.func.isRequired,
  onSwipe: PropTypes.func.isRequired,
  style: PropTypes.object,
};

export default SwipeCard;

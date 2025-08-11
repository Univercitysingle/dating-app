import React from 'react';

const MatchModal = ({ matchInfo, onClose }) => {
  if (!matchInfo) {
    return null;
  }

  return (
    <div className="absolute inset-0 bg-black bg-opacity-75 flex flex-col justify-center items-center z-50">
      <p className="text-4xl font-bold text-white mb-4">It's a Match!</p>
      <p className="text-xl text-yellow-300">
        You matched with {matchInfo.name || 'someone'}
      </p>
      <button
        onClick={onClose}
        className="mt-8 px-6 py-2 bg-pink-500 text-white rounded-full text-lg hover:bg-pink-600"
      >
        Keep Swiping
      </button>
    </div>
  );
};

export default MatchModal;

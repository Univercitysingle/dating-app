import React from 'react';

const InterstitialAd = ({ isVisible, onClose }) => {
  if (!isVisible) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
      aria-modal="true"
      role="dialog"
    >
      <div className="bg-white p-8 rounded-lg shadow-xl text-center w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">Advertisement</h2>
        <div className="my-6 h-48 bg-gray-200 flex items-center justify-center rounded">
          <p className="text-gray-500">Ad Content Placeholder</p>
        </div>
        <button
          onClick={onClose}
          className="mt-4 px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
          aria-label="Close Ad"
        >
          Close Ad
        </button>
      </div>
    </div>
  );
};

export default InterstitialAd;

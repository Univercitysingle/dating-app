import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

const SocialMediaLinksEditor = ({
  currentLinks,
  onSave,
  statusMessage,
  setStatusMessage,
}) => {
  const [instagram, setInstagram] = useState('');
  const [spotify, setSpotify] = useState('');

  useEffect(() => {
    const linksMap =
      currentLinks instanceof Map
        ? currentLinks
        : new Map(Object.entries(currentLinks || {}));
    setInstagram(linksMap.get('instagram') || '');
    setSpotify(linksMap.get('spotify') || '');
  }, [currentLinks]);

  const handleSave = () => {
    const newLinks = {
      instagram: instagram.trim(),
      spotify: spotify.trim(),
    };

    if (!newLinks.instagram) delete newLinks.instagram;
    if (!newLinks.spotify) delete newLinks.spotify;

    if (onSave) {
      onSave(newLinks);
    }
  };

  return (
    <div className="my-4 p-4 border border-gray-300 rounded-lg shadow-sm">
      <h4 className="text-md font-semibold mb-3 text-gray-700">
        Edit Social Media Links
      </h4>

      <div className="mb-3">
        <label
          htmlFor="instagram-url"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Instagram Profile URL or Username
        </label>
        <input
          type="text"
          id="instagram-url"
          value={instagram}
          onChange={(e) => {
            setInstagram(e.target.value);
            if (setStatusMessage) setStatusMessage('');
          }}
          placeholder="e.g., your_username or full URL"
          className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-pink-500 focus:border-pink-500"
        />
      </div>

      <div className="mb-4">
        <label
          htmlFor="spotify-url"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Spotify Profile URL or User ID
        </label>
        <input
          type="text"
          id="spotify-url"
          value={spotify}
          onChange={(e) => {
            setSpotify(e.target.value);
            if (setStatusMessage) setStatusMessage('');
          }}
          placeholder="e.g., your_user_id or full URL"
          className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500"
        />
      </div>

      <button
        onClick={handleSave}
        className="bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded-md"
      >
        Save Social Links
      </button>
      {statusMessage && (
        <p className="mt-2 text-sm text-gray-600">{statusMessage}</p>
      )}
    </div>
  );
};

SocialMediaLinksEditor.propTypes = {
  currentLinks: PropTypes.oneOfType([
    PropTypes.instanceOf(Map),
    PropTypes.object,
  ]),
  onSave: PropTypes.func.isRequired,
  statusMessage: PropTypes.string,
  setStatusMessage: PropTypes.func,
};

export default SocialMediaLinksEditor;

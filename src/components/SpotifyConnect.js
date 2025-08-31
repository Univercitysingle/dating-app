import React from 'react';

const SpotifyConnect = () => {
  return (
    <div className="text-center">
      <h3 className="text-lg font-semibold mb-2">Connect Your Spotify</h3>
      <p className="text-neutral-600 dark:text-neutral-400 mb-4">
        Showcase your top artists on your profile and see who shares your taste in music.
      </p>
      <a
        href={`${process.env.REACT_APP_API_BASE_URL}/api/spotify/connect`}
        className="inline-block bg-green-500 text-white font-bold py-2 px-4 rounded-full hover:bg-green-600 transition-colors"
      >
        Connect to Spotify
      </a>
    </div>
  );
};

export default SpotifyConnect;

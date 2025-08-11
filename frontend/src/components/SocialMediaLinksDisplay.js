import React from 'react';
import PropTypes from 'prop-types';

const InstagramIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4.318 6.318a4.5 4.5 0 000 11.364L12 17.364l7.682-4.682a4.5 4.5 0 000-11.364L12 6.318 4.318 6.318z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 12.318V12a2.318 2.318 0 012.318 2.318H9.682A2.318 2.318 0 0112 12z"
    />
    <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
  </svg>
);

const SpotifyIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-4c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 7c0 1.105-1.343 2-3 2S3 8.105 3 7s1.343-2 3-2 3 .895 3 2zm11.588 2.137a.5.5 0 01.412.488V10a2 2 0 01-2 2H13V6.066A3.988 3.988 0 0116.988 2c1.806 0 3.306 1.073 3.856 2.562l-1.952.65A2.002 2.002 0 0016.988 4C16.008 4 15 4.86 15 6v4h4a.5.5 0 01.5.5v.125a3.51 3.51 0 01-2.656 3.375M9 12H5"
    />
  </svg>
);

const SocialMediaLinksDisplay = ({ socialMediaLinks }) => {
  const links =
    socialMediaLinks instanceof Map
      ? socialMediaLinks
      : new Map(Object.entries(socialMediaLinks || {}));

  const instagramUrl = links.get('instagram');
  const spotifyUrl = links.get('spotify');

  const hasLinks = instagramUrl || spotifyUrl;

  if (!hasLinks) {
    return (
      <p className="text-gray-500 italic text-sm">
        No social media links added.
      </p>
    );
  }

  return (
    <div className="my-4">
      <h4 className="text-md font-semibold mb-2 text-gray-700">Find me on</h4>
      <div className="flex space-x-4">
        {instagramUrl && (
          <a
            href={
              instagramUrl.startsWith('http')
                ? instagramUrl
                : `https://instagram.com/${instagramUrl}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="text-pink-600 hover:text-pink-700"
            aria-label="Instagram Profile"
          >
            <InstagramIcon />
          </a>
        )}
        {spotifyUrl && (
          <a
            href={
              spotifyUrl.startsWith('http')
                ? spotifyUrl
                : `https://open.spotify.com/user/${spotifyUrl}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-600 hover:text-green-700"
            aria-label="Spotify Profile"
          >
            <SpotifyIcon />
          </a>
        )}
      </div>
    </div>
  );
};

SocialMediaLinksDisplay.propTypes = {
  socialMediaLinks: PropTypes.oneOfType([
    PropTypes.instanceOf(Map),
    PropTypes.object,
  ]).isRequired,
};

export default SocialMediaLinksDisplay;

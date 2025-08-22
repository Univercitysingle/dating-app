import React from 'react';
import PropTypes from 'prop-types';

const VideoBioSnippetPlayer = ({ videoUrl }) => {
  if (!videoUrl) {
    return (
      <p className="text-gray-500 italic text-sm">
        No video bio snippet available.
      </p>
    );
  }

  return (
    <div className="my-4">
      <h4 className="text-md font-semibold mb-1 text-gray-700">
        Video Bio Snippet
      </h4>
      <video
        controls
        src={videoUrl}
        className="w-full rounded-md max-w-xs"
        style={{ maxHeight: '300px' }}
      >
        Your browser does not support the video tag.
      </video>
    </div>
  );
};

VideoBioSnippetPlayer.propTypes = {
  videoUrl: PropTypes.string,
};

export default VideoBioSnippetPlayer;

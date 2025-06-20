import React from 'react';

const AudioBioPlayer = ({ audioUrl }) => {
  if (!audioUrl) {
    return <p className="text-gray-500 italic text-sm">No audio bio available.</p>;
  }

  return (
    <div className="my-4">
      <h4 className="text-md font-semibold mb-1 text-gray-700">Audio Bio</h4>
      <audio controls src={audioUrl} className="w-full">
        Your browser does not support the audio element.
      </audio>
    </div>
  );
};

export default AudioBioPlayer;

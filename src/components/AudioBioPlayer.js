import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';

const AudioBioPlayer = ({ audioUrl }) => {
  const waveformRef = useRef(null);
  const wavesurfer = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (waveformRef.current) {
      wavesurfer.current = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: '#A0A0A0', // A neutral gray
        progressColor: '#3B82F6', // A nice blue from the theme
        cursorWidth: 2,
        barWidth: 3,
        barRadius: 3,
        height: 60,
        responsive: true,
      });

      if (audioUrl) {
        wavesurfer.current.load(audioUrl);
      }

      wavesurfer.current.on('play', () => setIsPlaying(true));
      wavesurfer.current.on('pause', () => setIsPlaying(false));
      wavesurfer.current.on('finish', () => setIsPlaying(false));

      return () => wavesurfer.current.destroy();
    }
  }, [audioUrl]);

  const handlePlayPause = () => {
    wavesurfer.current.playPause();
  };

  if (!audioUrl) {
    return (
      <p className="text-gray-500 italic text-sm">No audio bio available.</p>
    );
  }

  return (
    <div className="flex items-center space-x-4">
      <button
        onClick={handlePlayPause}
        className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        aria-label={isPlaying ? 'Pause audio bio' : 'Play audio bio'}
      >
        {isPlaying ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          </svg>
        )}
      </button>
      <div ref={waveformRef} className="flex-grow" />
    </div>
  );
};

export default AudioBioPlayer;

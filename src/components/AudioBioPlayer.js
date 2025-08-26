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
        waveColor: 'violet',
        progressColor: 'purple',
        cursorWidth: 1,
        barWidth: 2,
        barHeight: 1,
        barGap: 2,
        height: 100,
        responsive: true,
      });

      if (audioUrl) {
        wavesurfer.current.load(audioUrl);
      }

      wavesurfer.current.on('play', () => setIsPlaying(true));
      wavesurfer.current.on('pause', () => setIsPlaying(false));

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
    <div className="my-4">
      <div ref={waveformRef} />
      <button
        onClick={handlePlayPause}
        className="mt-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
      >
        {isPlaying ? 'Pause' : 'Play'}
      </button>
    </div>
  );
};

export default AudioBioPlayer;

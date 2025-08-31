import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';

const AudioBioPlayer = ({ audioUrl }) => {
  const waveformRef = useRef(null);
  const wavesurfer = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [waveformReady, setWaveformReady] = useState(false);

  useEffect(() => {
    if (!waveformRef.current || !audioUrl) return;

    const ws = WaveSurfer.create({
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

    wavesurfer.current = ws;

    try {
      ws.load(audioUrl);
    } catch (err) {
      console.warn('WaveSurfer could not load audio:', err);
    }

    ws.on('ready', () => setWaveformReady(true));
    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));

    return () => {
      if (wavesurfer.current) {
        try {
          // Guard against double destroy in React StrictMode
          if (!wavesurfer.current.isDestroyed) {
            wavesurfer.current.destroy();
          }
        } catch (err) {
          console.warn('WaveSurfer destroy skipped:', err);
        } finally {
          wavesurfer.current = null;
        }
      }
    };
  }, [audioUrl]);

  const handlePlayPause = () => {
    if (wavesurfer.current) {
      wavesurfer.current.playPause();
    }
  };

  if (!audioUrl) {
    return (
      <p className="text-gray-500 italic text-sm">No audio bio available.</p>
    );
  }

  return (
    <div className="my-4">
      {/* Waveform */}
      <div ref={waveformRef} />

      {/* Controls */}
      {waveformReady ? (
        <button
          onClick={handlePlayPause}
          className="mt-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
      ) : (
        // Fallback if waveform not ready
        <audio controls src={audioUrl} className="mt-2 w-full">
          Your browser does not support this audio format.
        </audio>
      )}
    </div>
  );
};

export default AudioBioPlayer;

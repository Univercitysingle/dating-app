import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';

const AudioBioPlayer = ({ audioUrl }) => {
  const waveformRef = useRef(null);
  const wavesurfer = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [waveformReady, setWaveformReady] = useState(false);

  useEffect(() => {
    if (!waveformRef.current || !audioUrl) return;

    let ws;

    try {
      ws = WaveSurfer.create({
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
      console.log('WaveSurfer instance created');
    } catch (err) {
      console.error('Failed to create WaveSurfer:', err);
      return;
    }

    try {
      ws.load(audioUrl);
      console.log('WaveSurfer loading audio:', audioUrl);
    } catch (err) {
      console.error('Failed to load audio:', err);
    }

    ws.on('ready', () => {
      setWaveformReady(true);
      console.log('WaveSurfer ready');
    });

    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));

    return () => {
      if (wavesurfer.current) {
        try {
          if (!wavesurfer.current.isDestroyed) {
            wavesurfer.current.destroy();
            console.log('WaveSurfer destroyed');
          }
        } catch (err) {
          if (err.name === 'AbortError') {
            console.log('WaveSurfer destroy aborted (expected in StrictMode)');
          } else {
            console.error('WaveSurfer destroy error:', err);
          }
        } finally {
          wavesurfer.current = null;
        }
      }
    };
  }, [audioUrl]);

  const handlePlayPause = () => {
    if (wavesurfer.current) {
      try {
        wavesurfer.current.playPause();
      } catch (err) {
        console.error('PlayPause error:', err);
      }
    }
  };

  if (!audioUrl) {
    return <p className="text-gray-500 italic text-sm">No audio bio available.</p>;
  }

  return (
    <div className="my-4">
      <div ref={waveformRef} />
      {waveformReady ? (
        <button
          onClick={handlePlayPause}
          className="mt-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
      ) : (
        <audio controls src={audioUrl} className="mt-2 w-full">
          Your browser does not support this audio format.
        </audio>
      )}
    </div>
  );
};

export default AudioBioPlayer;

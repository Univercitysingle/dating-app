import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import logger from '../utils/logger';

function VideoCall() {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    fetch('/api/video/jitsi-token')
      .then((res) => {
        if (!res.ok) {
          throw new Error('Failed to fetch Jitsi token');
        }
        return res.json();
      })
      .then((data) => setUrl(data.url))
      .catch((err) => {
        logger.error('Error fetching Jitsi token:', err);
        setError(err.message);
      });
  }, [user]);

  if (error) return <p className="text-red-500">{error}</p>;
  if (!url) return <p>Loading video call...</p>;

  return (
    <iframe
      title="Video Call"
      src={url}
      allow="camera; microphone"
      style={{ width: '100%', height: '600px', border: 0 }}
    />
  );
}

export default VideoCall;

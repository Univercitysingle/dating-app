import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import logger from '../utils/logger';

function VideoProfileUpload() {
  const [video, setVideo] = useState(null);
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();

  const handleFileChange = (e) => {
    setVideo(e.target.files[0]);
    setStatus('');
  };

  const uploadVideo = async () => {
    if (!video) {
      setStatus('Select a video first');
      return;
    }
    if (!user) {
      setStatus('You must be logged in to upload a video.');
      return;
    }

    const formData = new FormData();
    formData.append('video', video);

    setIsLoading(true);
    setStatus('Uploading...');

    try {
      const res = await fetch('/api/video/upload-profile-video', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus('Uploaded successfully');
      } else {
        setStatus(`Upload failed: ${data.message || 'Server error'}`);
      }
    } catch (err) {
      logger.error('Upload failed:', err);
      setStatus(`Upload failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="my-4 p-4 border rounded">
      <h3 className="text-lg font-semibold mb-2">Upload Video Profile</h3>
      <div className="flex items-center space-x-4">
        <input
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          className="p-2 border rounded"
          disabled={isLoading}
        />
        <button
          onClick={uploadVideo}
          className="bg-blue-500 text-white px-4 py-2 rounded disabled:bg-gray-400"
          disabled={isLoading || !video}
        >
          {isLoading ? 'Uploading...' : 'Upload Video'}
        </button>
      </div>
      {status && <p className="mt-2 text-sm">{status}</p>}
    </div>
  );
}

export default VideoProfileUpload;

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import logger from '../utils/logger';
import apiClient from '../api/apiClient';

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
      const data = await apiClient.post('/api/video/upload-profile-video', formData);
      // The apiClient will throw an error on non-OK responses, so we just check for success.
      // Assuming the backend returns a `success` field in the JSON body.
      if (data.videoUrl) {
        setStatus('Uploaded successfully');
        // Optionally, you can pass the new video URL to a parent component
        // onUploadSuccess(data.videoUrl);
      } else {
        setStatus(`Upload failed: ${data.message || 'An unknown error occurred.'}`);
      }
    } catch (err) {
      logger.error('Upload failed:', err);
      setStatus(`Upload failed: ${err.message || 'Please try again.'}`);
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

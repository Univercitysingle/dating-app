import React, { useState } from 'react';
import PropTypes from 'prop-types';
import apiClient from '../api/apiClient';
import logger from '../utils/logger';

const VideoBioSnippetUpload = ({ currentVideoUrl, onUploadComplete }) => {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
    setStatus('');
  };

  const handleUpload = async () => {
    if (!file) {
      setStatus('Please select a video file first.');
      return;
    }

    setLoading(true);
    setStatus('Uploading video snippet...');

    const formData = new FormData();
    formData.append('video-bio-snippet', file);

    try {
      const data = await apiClient.post(
        '/api/users/upload-video-bio-snippet',
        formData,
        {
          headers: {
            'Content-Type': null, // Let the browser set the correct content type for FormData
          },
        }
      );

      setStatus('Video snippet uploaded successfully! URL received.');
      if (onUploadComplete) {
        onUploadComplete(data.fileUrl, 'videoBioUrl');
      }
      setFile(null);
    } catch (error) {
      setStatus(`Error: ${error.message}`);
      logger.error('Video snippet upload error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="my-4 p-4 border border-gray-300 rounded-lg shadow-sm">
      <h4 className="text-md font-semibold mb-2 text-gray-700">
        Upload Video Bio Snippet
      </h4>
      {currentVideoUrl && (
        <p className="text-xs text-gray-500 mb-2">
          Current video snippet exists. Uploading a new one will allow you to
          save it, replacing the current one.
        </p>
      )}
      <input
        type="file"
        accept="video/*"
        onChange={handleFileChange}
        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100 mb-2"
      />
      {file && (
        <p className="text-sm text-gray-600 mb-2">Selected: {file.name}</p>
      )}
      <button
        onClick={handleUpload}
        disabled={loading || !file}
        className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-md disabled:bg-gray-400"
      >
        {loading ? 'Uploading...' : 'Upload Video Snippet'}
      </button>
      {status && <p className="mt-2 text-sm text-gray-600">{status}</p>}
    </div>
  );
};

VideoBioSnippetUpload.propTypes = {
  currentVideoUrl: PropTypes.string,
  onUploadComplete: PropTypes.func.isRequired,
};

export default VideoBioSnippetUpload;

import React, { useState } from 'react';

const AudioBioUpload = ({ currentAudioUrl, onUploadComplete }) => {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
    setStatus(''); // Clear previous status
  };

  const handleUpload = async () => {
    if (!file) {
      setStatus('Please select an audio file first.');
      return;
    }

    setLoading(true);
    setStatus('Uploading audio...');

    const formData = new FormData();
    formData.append('audio-bio', file); // Field name must match backend (multer)

    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || !user.token) {
      setStatus('Error: Not authenticated.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/users/upload-audio-bio', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user.token}`,
          // 'Content-Type': 'multipart/form-data' is set automatically by browser for FormData
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Audio upload failed.');
      }

      setStatus('Audio uploaded successfully! URL received.');
      if (onUploadComplete) {
        onUploadComplete(data.fileUrl, 'audioBioUrl');
      }
      setFile(null); // Clear the file input after successful upload
    } catch (error) {
      setStatus(`Error: ${error.message}`);
      console.error('Audio upload error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="my-4 p-4 border border-gray-300 rounded-lg shadow-sm">
      <h4 className="text-md font-semibold mb-2 text-gray-700">Upload Audio Bio</h4>
      {currentAudioUrl && (
        <p className="text-xs text-gray-500 mb-2">
          Current audio bio exists. Uploading a new one will allow you to save it, replacing the current one.
        </p>
      )}
      <input
        type="file"
        accept="audio/*"
        onChange={handleFileChange}
        className="block w-full text-sm text-gray-500
                   file:mr-4 file:py-2 file:px-4
                   file:rounded-full file:border-0
                   file:text-sm file:font-semibold
                   file:bg-blue-50 file:text-blue-700
                   hover:file:bg-blue-100 mb-2"
      />
      {file && <p className="text-sm text-gray-600 mb-2">Selected: {file.name}</p>}
      <button
        onClick={handleUpload}
        disabled={loading || !file}
        className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md disabled:bg-gray-400"
      >
        {loading ? 'Uploading...' : 'Upload Audio'}
      </button>
      {status && <p className="mt-2 text-sm text-gray-600">{status}</p>}
    </div>
  );
};

export default AudioBioUpload;

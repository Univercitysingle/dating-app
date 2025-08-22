import { useState } from 'react';

const ProfilePhotoUpload = () => {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<
    'idle' | 'uploading' | 'success' | 'error'
  >('idle');
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setFile(files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      return;
    }

    setStatus('uploading');

    try {
      // 1. Get a signed URL from our API
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get signed URL.');
      }

      const { url, key } = await response.json();

      // 2. Upload the file to Backblaze B2 using the signed URL
      const uploadResponse = await fetch(url, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Upload failed.');
      }

      const bucketName = process.env.NEXT_PUBLIC_AWS_S3_BUCKET_NAME;
      const region = process.env.NEXT_PUBLIC_AWS_REGION;
      // Note: The public URL for Backblaze B2 is different from the S3 endpoint.
      // You might need to construct this URL based on your B2 bucket settings.
      // Example format: `https://<your-bucket-name>.s3.<your-region>.backblazeb2.com/<object-key>`
      const publicUrl = `https://${bucketName}.s3.${region}.backblazeb2.com/${key}`;
      setUploadedFileUrl(publicUrl);
      setStatus('success');
    } catch (error) {
      console.error(error);
      setStatus('error');
    }
  };

  return (
    <div className="p-4 border rounded-lg">
      <h2 className="text-xl font-semibold mb-4">Upload Profile Photo</h2>
      <div className="flex items-center space-x-4">
        <input
          type="file"
          accept="image/jpeg, image/png, image/gif"
          onChange={handleFileChange}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
        />
        <button
          onClick={handleUpload}
          disabled={!file || status === 'uploading'}
          className="px-4 py-2 font-semibold text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed"
        >
          {status === 'uploading' ? 'Uploading...' : 'Upload'}
        </button>
      </div>
      {status === 'error' && (
        <p className="text-red-500 mt-2">Upload failed. Please try again.</p>
      )}
      {status === 'success' && (
        <div className="mt-4">
          <p className="text-green-500">Upload successful!</p>
          {uploadedFileUrl && (
            <a
              href={uploadedFileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-500 hover:underline"
            >
              View uploaded file
            </a>
          )}
        </div>
      )}
    </div>
  );
};

export default ProfilePhotoUpload;

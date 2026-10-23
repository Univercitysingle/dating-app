import React, { useState } from 'react';

const MEDIA_API_ORIGIN =
  process.env.REACT_APP_MEDIA_API_ORIGIN ||
  'https://dating-app-api-staging.enadoctemp.workers.dev';
const PLACEHOLDER_IMAGE = 'https://placehold.co/100x100';

const isPhotoKey = (value) =>
  /^photos-[A-Za-z0-9_-]{1,128}-(?:[0-9a-f-]{36}|[0-9]{10,16})\.(?:jpg|jpeg|png|gif|webp)$/i.test(value);

const extractPhotoKey = (value) => {
  if (!value) return '';
  let path = String(value).trim();

  try {
    if (/^https?:\/\//i.test(path)) {
      const parsed = new URL(path);
      const apiPrefix = '/api/media/';
      const mediaPrefix = '/media/';
      if (parsed.pathname.startsWith(apiPrefix)) {
        path = decodeURIComponent(parsed.pathname.slice(apiPrefix.length));
      } else if (parsed.pathname.startsWith(mediaPrefix)) {
        path = decodeURIComponent(parsed.pathname.slice(mediaPrefix.length));
      } else {
        path = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
      }
    } else if (path.startsWith('/api/media/')) {
      path = decodeURIComponent(path.slice('/api/media/'.length));
    } else if (path.startsWith('api/media/')) {
      path = decodeURIComponent(path.slice('api/media/'.length));
    } else if (path.startsWith('/media/')) {
      path = decodeURIComponent(path.slice('/media/'.length));
    } else {
      path = decodeURIComponent(path.replace(/^\/+/, ''));
    }
  } catch {
    return '';
  }

  return isPhotoKey(path) ? path : '';
};

const CDN_HOST_URL = (
  process.env.REACT_APP_CDN_HOSTURL ||
  process.env.REACT_APP_CDN_HOSTNAME ||
  'https://dateme.enadoctemp.workers.dev/'
 ).trim().replace(/\/+$/, '');

const resolvePhotoUrl = (value) => {
  if (!value) return PLACEHOLDER_IMAGE;
  const key = extractPhotoKey(value);
  if (!key) return value;
  return `${CDN_HOST_URL}/${encodeURIComponent(key)}`;
};

const resolveWorkerPhotoUrl = (value) => {
  const key = extractPhotoKey(value);
  return key ? `${MEDIA_API_ORIGIN}/api/media/${encodeURIComponent(key)}` : '';
};

const PhotoGallery = ({ photos, onEdit }) => {
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [useWorkerFallback, setUseWorkerFallback] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const handleNext = () => {
    setCurrentPhotoIndex((prevIndex) => (prevIndex + 1) % photos.length);
    setUseWorkerFallback(false);
    setImageFailed(false);
  };

  const handlePrev = () => {
    setCurrentPhotoIndex((prevIndex) => (prevIndex - 1 + photos.length) % photos.length);
    setUseWorkerFallback(false);
    setImageFailed(false);
  };

  if (!photos || photos.length === 0) {
    return (
      <div className="relative w-full h-96 bg-neutral-200 dark:bg-neutral-800 rounded-lg flex items-center justify-center">
        <p className="text-neutral-500">No photos to display.</p>
        <button
          onClick={onEdit}
          className="absolute top-4 right-4 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          Add Photos
        </button>
      </div>
    );
  }

  const photoValue = photos[currentPhotoIndex]?.url || '';
  const photoUrl = useWorkerFallback
    ? resolveWorkerPhotoUrl(photoValue)
    : resolvePhotoUrl(photoValue);

  const handleImageError = () => {
    if (!useWorkerFallback && resolveWorkerPhotoUrl(photoValue)) {
      setUseWorkerFallback(true);
      return;
    }
    setImageFailed(true);
  };

  return (
    <div className="relative w-full h-96 rounded-lg overflow-hidden shadow-lg">
      <div className="absolute top-2 left-2 right-2 flex space-x-1 z-10">
        {photos.map((_, index) => (
          <div
            key={index}
            className={`h-1 flex-1 rounded-full ${
              index === currentPhotoIndex ? 'bg-white' : 'bg-white/50'
            }`}
          />
        ))}
      </div>

      <img
        src={imageFailed ? PLACEHOLDER_IMAGE : photoUrl}
        alt={`User photo ${currentPhotoIndex + 1}`}
        className="w-full h-full object-cover"
        onError={handleImageError}
      />

      <div className="absolute inset-0 flex">
        <div className="w-1/2 h-full" onClick={handlePrev} />
        <div className="w-1/2 h-full" onClick={handleNext} />
      </div>

      <button
        onClick={onEdit}
        className="absolute top-4 right-4 px-4 py-2 text-sm font-medium text-white bg-black/50 rounded-md hover:bg-black/75"
      >
        Edit
      </button>
    </div>
  );
};

export default PhotoGallery;

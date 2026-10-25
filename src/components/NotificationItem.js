import React from 'react';
import { Link } from 'react-router-dom';
import { resolvePhotoUrl, resolveWorkerPhotoUrl, PLACEHOLDER_IMAGE } from '../utils/media';

const NotificationItem = ({ notification }) => {
  const { sender, type } = notification;
  const photoValue = Array.isArray(sender?.photos) ? (sender.photos[0]?.url || sender.photos[0]) : '';
  const avatarUrl = resolvePhotoUrl(photoValue);
  const workerFallbackUrl = resolveWorkerPhotoUrl(photoValue);

  const message = () => {
    switch (type) {
      case 'like':
        return `${sender.name} liked you!`;
      case 'superlike':
        return `${sender.name} super liked you!`;
      case 'match':
        return `You matched with ${sender.name}!`;
      default:
        return 'New notification';
    }
  };

  return (
    <Link to={`/profile/${sender.uid}`} className="block p-4 bg-white shadow-md rounded-lg mb-4 hover:bg-gray-100">
      <div className="flex items-center">
        <img src={avatarUrl} alt={sender?.name || 'Profile photo'} className="w-12 h-12 rounded-full mr-4 object-cover" onError={(event) => { const image = event.currentTarget; if (workerFallbackUrl && image.src !== workerFallbackUrl) { image.src = workerFallbackUrl; return; } if (image.src !== PLACEHOLDER_IMAGE) image.src = PLACEHOLDER_IMAGE; }} />
        <div>
          <p className="font-semibold">{message()}</p>
          <p className="text-sm text-gray-500">Click to view profile</p>
        </div>
      </div>
    </Link>
  );
};

export default NotificationItem;

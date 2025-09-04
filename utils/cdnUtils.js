const CDN_HOSTNAME = process.env.CDN_HOSTNAME || 'dateme.enadoctemp.workers.dev';

const convertKeysToCdnUrls = (user) => {
  if (!user) return user;

  const isFullUrl = (url) => url && url.startsWith('http');

  if (user.photos && user.photos.length > 0) {
    user.photos.forEach(photo => {
      if (photo.url && !isFullUrl(photo.url)) {
        photo.url = `https://${CDN_HOSTNAME}/${photo.url}`;
      }
    });
  }
  return user;
};

module.exports = { convertKeysToCdnUrls };

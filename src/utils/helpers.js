export const rewriteCdnUrl = (originalUrl) => {
  if (!originalUrl || typeof originalUrl !== 'string') {
    return '';
  }
  const cdnHostname = 'dateme.enadoctemp.workers.dev';
  try {
    const url = new URL(originalUrl);
    const path = url.pathname;
    // Reconstruct the URL with the new CDN hostname and clean up any double slashes
    return `https://${cdnHostname}${path}`.replace(/(?<!:)\/\//g, '/');
  } catch (error) {
    // If the originalUrl is not a valid URL, it could be a relative path or a bare key.
    if (originalUrl.startsWith('/')) {
      // It's a relative path
      return `https://${cdnHostname}${originalUrl}`.replace(/(?<!:)\/\//g, '/');
    }
    // Assume it's a bare key and construct the URL.
    return `https://${cdnHostname}/${originalUrl}`.replace(/(?<!:)\/\//g, '/');
  }
};

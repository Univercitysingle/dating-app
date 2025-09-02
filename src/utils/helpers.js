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
    // If the originalUrl is not a valid URL (e.g., a relative path already),
    // we can assume it's a path and construct the URL.
    // This handles cases where the URL might already be a relative path.
    if (originalUrl.startsWith('/')) {
      return `https://${cdnHostname}${originalUrl}`.replace(/(?<!:)\/\//g, '/');
    }
    // If it's not a valid URL and not a relative path, return it as is or handle error.
    console.error(`Invalid URL encountered in rewriteCdnUrl: ${originalUrl}`);
    return originalUrl;
  }
};

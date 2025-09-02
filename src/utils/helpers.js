export const rewriteCdnUrl = (originalUrl) => {
  if (!originalUrl || typeof originalUrl !== 'string') {
    return '';
  }
  const cdnHostname = 'dateme.enadoctemp.workers.dev';

  // Extract the key, which is the last part of the path, regardless of URL format.
  let key;
  try {
    // This will handle full URLs, including signed or CDN URLs.
    // It correctly parses the pathname, ignoring host, port, and query params.
    const url = new URL(originalUrl);
    const pathParts = url.pathname.split('/');
    key = pathParts[pathParts.length - 1];
  } catch (error) {
    // This will handle bare keys or simple relative paths that fail the URL constructor.
    const pathParts = originalUrl.split('/');
    key = pathParts[pathParts.length - 1];
  }

  // Reconstruct a clean, canonical CDN URL from the extracted key.
  return `https://${cdnHostname}/${key}`;
};

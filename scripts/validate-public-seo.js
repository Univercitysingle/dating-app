const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sitemap = fs.readFileSync(path.join(root, 'public/sitemap.xml'), 'utf8');
const robots = fs.readFileSync(path.join(root, 'public/robots.txt'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/App.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

const siteOrigin = 'https://dating-app-staging.pages.dev';
const allowedPaths = ['/', '/faq', '/safety', '/terms', '/cookies', '/privacy-settings'];
const allowedUrls = new Set(allowedPaths.map((route) => new URL(route, siteOrigin).href));
const sitemapUrls = sitemap.split('<loc>').slice(1).map((part) => part.split('</loc>')[0].trim());

if (sitemapUrls.length === 0) throw new Error('Sitemap contains no URLs.');
if (new Set(sitemapUrls).size !== sitemapUrls.length) throw new Error('Sitemap contains duplicate URLs.');
for (const url of sitemapUrls) {
  if (!allowedUrls.has(url)) throw new Error('Unexpected or non-public sitemap URL: ' + url);
}
for (const url of allowedUrls) {
  if (!sitemapUrls.includes(url)) throw new Error('Required public URL is missing from sitemap: ' + url);
}

function getAttribute(tag, attribute) {
  const marker = attribute + '="';
  const start = tag.indexOf(marker);
  if (start === -1) return null;
  return tag.slice(start + marker.length).split('"')[0];
}
const metaTags = html.split('<meta').slice(1).map((part) => '<meta' + part.split('>')[0] + '>');
function getMeta(attribute, value) {
  const tag = metaTags.find((item) => getAttribute(item, attribute) === value);
  return tag ? getAttribute(tag, 'content') : null;
}
function assertPresent(value, label) {
  if (!value || !value.trim()) throw new Error('Missing or empty SEO metadata: ' + label);
}

const titlePart = html.split('<title>')[1];
const title = titlePart ? titlePart.split('</title>')[0].trim() : null;
assertPresent(title, 'title');
if (title.length < 20 || title.length > 70) {
  throw new Error('Title should be between 20 and 70 characters (currently ' + title.length + ').');
}
const description = getMeta('name', 'description');
assertPresent(description, 'meta description');
if (description.length < 70 || description.length > 170) {
  throw new Error('Meta description should be between 70 and 170 characters (currently ' + description.length + ').');
}

const canonicalPart = html.split('<link').slice(1).find((part) => part.includes('rel="canonical"'));
const canonical = canonicalPart ? getAttribute(canonicalPart.split('>')[0], 'href') : null;
if (canonical !== siteOrigin + '/') throw new Error('Unexpected canonical URL: ' + (canonical || 'missing'));

[
  ['property', 'og:title'],
  ['property', 'og:description'],
  ['property', 'og:image'],
  ['property', 'og:url'],
  ['name', 'twitter:card'],
  ['name', 'twitter:title'],
  ['name', 'twitter:description'],
  ['name', 'twitter:image'],
].forEach((item) => assertPresent(getMeta(item[0], item[1]), item[1]));
if (getMeta('property', 'og:url') !== siteOrigin + '/') {
  throw new Error('Open Graph URL must match the staging homepage.');
}

const jsonLdPart = html.split('<script type="application/ld+json">')[1];
const jsonLdText = jsonLdPart ? jsonLdPart.split('</script>')[0].trim() : null;
if (!jsonLdText) throw new Error('Homepage JSON-LD structured data is missing.');
let structuredData;
try {
  structuredData = JSON.parse(jsonLdText);
} catch (error) {
  throw new Error('Homepage JSON-LD is invalid JSON: ' + error.message);
}
if (structuredData['@context'] !== 'https://schema.org' || !Array.isArray(structuredData['@graph'])) {
  throw new Error('Homepage JSON-LD must use schema.org and an @graph array.');
}
for (const requiredType of ['Organization', 'WebSite', 'SoftwareApplication']) {
  if (!structuredData['@graph'].some((item) => item['@type'] === requiredType)) {
    throw new Error('Homepage JSON-LD is missing required type: ' + requiredType);
  }
}

const privatePaths = [
  '/discover', '/likes', '/conversations', '/matches', '/chat/',
  '/profile', '/admin', '/onboarding',
  '/set-initial-password', '/unauthorized', '/premium',
  '/manage-subscription', '/support', '/store', '/dark-fantasy',
  '/debug-swipe', '/api/',
];
const robotLines = robots.split(/\r?\n/).map((line) => line.trim());
for (const route of privatePaths) {
  if (!robotLines.includes('Disallow: ' + route)) {
    throw new Error('robots.txt must disallow ' + route);
  }
}
for (const route of ['/login', '/register']) {
  if (robotLines.includes('Disallow: ' + route)) {
    throw new Error(route + ' must remain crawlable so search engines can read its noindex response header.');
  }
}
const headers = fs.readFileSync(path.join(root, 'public/_headers'), 'utf8');
const headerLines = headers.split(/\r?\n/).map((line) => line.trim());
for (const route of ['/login', '/register']) {
  const routeIndex = headerLines.indexOf(route);
  if (routeIndex === -1 || headerLines[routeIndex + 1] !== 'X-Robots-Tag: noindex, nofollow, noarchive') {
    throw new Error('Cloudflare Pages _headers must set X-Robots-Tag noindex for ' + route);
  }
}

for (const route of allowedPaths) {
  const registered = route === '/'
    ? app.includes('path="/"')
    : app.includes('path="' + route + '"');
  if (!registered) throw new Error('Sitemap URL has no matching application route: ' + route);
}
if (app.includes('DebugSwipeCardPage') || app.includes('/debug-swipe')) {
  throw new Error('Temporary /debug-swipe route must not be registered in the application.');
}

console.log('Public SEO validation passed: ' + sitemapUrls.length + ' public URLs, metadata and JSON-LD, ' + privatePaths.length + ' crawler exclusions, matching public routes, and no public debug route.');

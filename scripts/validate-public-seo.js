const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sitemap = fs.readFileSync(path.join(root, 'public/sitemap.xml'), 'utf8');
const robots = fs.readFileSync(path.join(root, 'public/robots.txt'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/App.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

const siteOrigin = 'https://dating-app-staging.pages.dev';
const allowedPaths = ['/', '/faq', '/safety', '/terms', '/cookies', '/privacy-settings'];
const allowedUrls = new Set(allowedPaths.map(function (route) {
  return new URL(route, siteOrigin).href;
}));
const sitemapUrls = Array.from(sitemap.matchAll(/<loc>(.*?)<\/loc>/g), function (match) {
  return match[1].trim();
});

if (sitemapUrls.length === 0) throw new Error('Sitemap contains no URLs.');
if (new Set(sitemapUrls).size !== sitemapUrls.length) throw new Error('Sitemap contains duplicate URLs.');
sitemapUrls.forEach(function (url) {
  if (!allowedUrls.has(url)) throw new Error('Unexpected or non-public sitemap URL: ' + url);
});
allowedUrls.forEach(function (url) {
  if (!sitemapUrls.includes(url)) throw new Error('Required public URL is missing from sitemap: ' + url);
});

function getAttribute(tag, attribute) {
  const pattern = new RegExp('\\\\b' + attribute + '=["\\x27]([^"\\x27]*)["\\x27]', 'i');
  const match = tag.match(pattern);
  return match ? match[1] : null;
}
const metaTags = Array.from(html.matchAll(/<meta\\b[^>]*>/gi), function (match) {
  return match[0];
});
function getMeta(attribute, value) {
  const tag = metaTags.find(function (item) {
    return getAttribute(item, attribute) === value;
  });
  return tag ? getAttribute(tag, 'content') : null;
}
function assertPresent(value, label) {
  if (!value || !value.trim()) throw new Error('Missing or empty SEO metadata: ' + label);
}

const titleMatch = html.match(/<title>(.*?)<\\/title>/i);
const title = titleMatch ? titleMatch[1].trim() : null;
assertPresent(title, 'title');
if (title.length < 20 || title.length > 70) {
  throw new Error('Title should be between 20 and 70 characters (currently ' + title.length + ').');
}
const description = getMeta('name', 'description');
assertPresent(description, 'meta description');
if (description.length < 70 || description.length > 170) {
  throw new Error('Meta description should be between 70 and 170 characters (currently ' + description.length + ').');
}

const canonicalMatch = html.match(/<link\\b[^>]*rel=["\\x27]canonical["\\x27][^>]*>/i);
const canonical = canonicalMatch ? getAttribute(canonicalMatch[0], 'href') : null;
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
].forEach(function (item) {
  assertPresent(getMeta(item[0], item[1]), item[1]);
});
if (getMeta('property', 'og:url') !== siteOrigin + '/') {
  throw new Error('Open Graph URL must match the staging homepage.');
}

const jsonLdMatch = html.match(/<script\\b[^>]*type=["\\x27]application\\/ld\\+json["\\x27][^>]*>([\\s\\S]*?)<\\/script>/i);
if (!jsonLdMatch) throw new Error('Homepage JSON-LD structured data is missing.');
let structuredData;
try {
  structuredData = JSON.parse(jsonLdMatch[1]);
} catch (error) {
  throw new Error('Homepage JSON-LD is invalid JSON: ' + error.message);
}
if (structuredData['@context'] !== 'https://schema.org' || !Array.isArray(structuredData['@graph'])) {
  throw new Error('Homepage JSON-LD must use schema.org and an @graph array.');
}
['Organization', 'WebSite', 'SoftwareApplication'].forEach(function (requiredType) {
  if (!structuredData['@graph'].some(function (item) { return item['@type'] === requiredType; })) {
    throw new Error('Homepage JSON-LD is missing required type: ' + requiredType);
  }
});

const privatePaths = [
  '/discover', '/likes', '/conversations', '/matches', '/chat/',
  '/profile', '/admin', '/login', '/register', '/onboarding',
  '/set-initial-password', '/unauthorized', '/premium',
  '/manage-subscription', '/support', '/store', '/dark-fantasy',
  '/debug-swipe', '/api/',
];
const robotLines = robots.split(/\\r?\\n/).map(function (line) { return line.trim(); });
privatePaths.forEach(function (route) {
  if (!robotLines.includes('Disallow: ' + route)) {
    throw new Error('robots.txt must disallow ' + route);
  }
});

allowedPaths.forEach(function (route) {
  const registered = route === '/'
    ? app.includes('path="/"')
    : app.includes('path="' + route + '"');
  if (!registered) throw new Error('Sitemap URL has no matching application route: ' + route);
});
if (app.includes('DebugSwipeCardPage') || app.includes('/debug-swipe')) {
  throw new Error('Temporary /debug-swipe route must not be registered in the application.');
}

console.log('Public SEO validation passed: ' + sitemapUrls.length + ' public URLs, metadata and JSON-LD, ' + privatePaths.length + ' crawler exclusions, matching public routes, and no public debug route.');

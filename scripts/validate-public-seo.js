const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sitemap = fs.readFileSync(path.join(root, 'public/sitemap.xml'), 'utf8');
const robots = fs.readFileSync(path.join(root, 'public/robots.txt'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/App.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

const siteOrigin = 'https://dating-app-staging.pages.dev';
const allowedPaths = [
  '/', '/faq', '/safety', '/terms', '/cookies', '/privacy-settings',
];
const allowedUrls = new Set(allowedPaths.map((route) => new URL(route, siteOrigin).href));
const sitemapUrls = [...sitemap.matchAll(/<loc>(.*?)<\\/loc>/g)].map((match) => match[1].trim());

if (sitemapUrls.length === 0) throw new Error('Sitemap contains no URLs.');
if (new Set(sitemapUrls).size !== sitemapUrls.length) {
  throw new Error('Sitemap contains duplicate URLs.');
}
for (const url of sitemapUrls) {
  if (!allowedUrls.has(url)) throw new Error(`Unexpected or non-public sitemap URL: ${url}`);
}
for (const url of allowedUrls) {
  if (!sitemapUrls.includes(url)) throw new Error(`Required public URL is missing from sitemap: ${url}`);
}

function getMeta(attribute, value) {
  const escaped = value.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
  const tag = html.match(new RegExp(`<meta\\\\s+[^>]*${attribute}=["']${escaped}["'][^>]*>`, 'i'));
  if (!tag) return null;
  return tag[0].match(/\\\\content=["']([^"']*)["']/i)?.[1] || null;
}

function assertPresent(value, label) {
  if (!value || !value.trim()) throw new Error(`Missing or empty SEO metadata: ${label}`);
}

const title = html.match(/<title>(.*?)<\\/title>/i)?.[1]?.trim();
assertPresent(title, 'title');
if (title.length < 20 || title.length > 70) {
  throw new Error(`Title should be between 20 and 70 characters (currently ${title.length}).`);
}
const description = getMeta('name', 'description');
assertPresent(description, 'meta description');
if (description.length < 70 || description.length > 170) {
  throw new Error(`Meta description should be between 70 and 170 characters (currently ${description.length}).`);
}

const canonical = html.match(/<link\\\\s+rel=["']canonical["']\\\\s+href=["']([^"']+)["']/i)?.[1];
if (canonical !== `${siteOrigin}/`) {
  throw new Error(`Unexpected canonical URL: ${canonical || 'missing'}`);
}
for (const [attribute, key] of [
  ['property', 'og:title'],
  ['property', 'og:description'],
  ['property', 'og:image'],
  ['property', 'og:url'],
  ['name', 'twitter:card'],
  ['name', 'twitter:title'],
  ['name', 'twitter:description'],
  ['name', 'twitter:image'],
]) {
  assertPresent(getMeta(attribute, key), key);
}
if (getMeta('property', 'og:url') !== `${siteOrigin}/`) {
  throw new Error('Open Graph URL must match the staging homepage.');
}

const jsonLdMatch = html.match(/<script\\\\s+type=["']application\\/ld\\+json["']>([\\s\\S]*?)<\\/script>/i);
if (!jsonLdMatch) throw new Error('Homepage JSON-LD structured data is missing.');
let structuredData;
try {
  structuredData = JSON.parse(jsonLdMatch[1]);
} catch (error) {
  throw new Error(`Homepage JSON-LD is invalid JSON: ${error.message}`);
}
if (structuredData['@context'] !== 'https://schema.org' || !Array.isArray(structuredData['@graph'])) {
  throw new Error('Homepage JSON-LD must use schema.org and an @graph array.');
}
for (const requiredType of ['Organization', 'WebSite', 'SoftwareApplication']) {
  if (!structuredData['@graph'].some((item) => item['@type'] === requiredType)) {
    throw new Error(`Homepage JSON-LD is missing required type: ${requiredType}`);
  }
}

const privatePaths = [
  '/discover', '/likes', '/conversations', '/matches', '/chat/',
  '/profile', '/admin', '/login', '/register', '/onboarding',
  '/set-initial-password', '/unauthorized', '/premium',
  '/manage-subscription', '/support', '/store', '/dark-fantasy',
  '/debug-swipe', '/api/',
];
const robotLines = robots.split(/\\r?\\n/).map((line) => line.trim());
for (const route of privatePaths) {
  if (!robotLines.includes(`Disallow: ${route}`)) {
    throw new Error(`robots.txt must disallow ${route}`);
  }
}

for (const route of allowedPaths) {
  const routePattern = route === '/'
    ? /<Route\\\\s+path=["']\\/["']/
    : new RegExp(`<Route\\\\s+path=["']${route.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}["']`);
  if (!routePattern.test(app)) {
    throw new Error(`Sitemap URL has no matching application route: ${route}`);
  }
}
if (app.includes('DebugSwipeCardPage') || app.includes('/debug-swipe')) {
  throw new Error('Temporary /debug-swipe route must not be registered in the application.');
}

console.log(`Public SEO validation passed: ${sitemapUrls.length} public URLs, metadata and JSON-LD, ${privatePaths.length} crawler exclusions, matching public routes, and no public debug route.`);

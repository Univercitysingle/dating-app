const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sitemap = fs.readFileSync(path.join(root, 'public/sitemap.xml'), 'utf8');
const robots = fs.readFileSync(path.join(root, 'public/robots.txt'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/App.js'), 'utf8');

const allowedUrls = new Set([
  'https://dating-app-staging.pages.dev/',
  'https://dating-app-staging.pages.dev/faq',
  'https://dating-app-staging.pages.dev/safety',
  'https://dating-app-staging.pages.dev/terms',
  'https://dating-app-staging.pages.dev/cookies',
  'https://dating-app-staging.pages.dev/privacy-settings',
]);
const sitemapUrls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1].trim());
if (sitemapUrls.length === 0) throw new Error('Sitemap contains no URLs.');
for (const url of sitemapUrls) {
  if (!allowedUrls.has(url)) throw new Error(`Unexpected or non-public sitemap URL: ${url}`);
}
for (const url of allowedUrls) {
  if (!sitemapUrls.includes(url)) throw new Error(`Required public URL is missing from sitemap: ${url}`);
}

const privatePaths = [
  '/discover', '/likes', '/conversations', '/matches', '/chat/',
  '/profile', '/admin', '/login', '/register', '/onboarding',
  '/set-initial-password', '/unauthorized', '/premium',
  '/manage-subscription', '/support', '/store', '/dark-fantasy',
  '/debug-swipe', '/api/',
];
const robotLines = robots.split(/\r?\n/).map((line) => line.trim());
for (const route of privatePaths) {
  if (!robotLines.includes(`Disallow: ${route}`)) {
    throw new Error(`robots.txt must disallow ${route}`);
  }
}
if (app.includes('DebugSwipeCardPage') || app.includes('/debug-swipe')) {
  throw new Error('Temporary /debug-swipe route must not be registered in the application.');
}
console.log(`Public SEO validation passed: ${sitemapUrls.length} public URLs, ${privatePaths.length} crawler exclusions, and no public debug route.`);

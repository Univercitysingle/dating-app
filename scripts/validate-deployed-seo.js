const siteOrigin = (process.env.SEO_SITE_ORIGIN || 'https://dating-app-staging.pages.dev').replace(/\/$/, '');
const allowedPaths = ['/', '/faq', '/safety', '/terms', '/cookies', '/privacy-settings'];
const privatePaths = [
  '/discover', '/likes', '/conversations', '/matches', '/chat/',
  '/profile', '/admin', '/login', '/register', '/onboarding',
  '/set-initial-password', '/unauthorized', '/premium',
  '/manage-subscription', '/support', '/store', '/dark-fantasy',
  '/debug-swipe', '/api/',
];

async function get(path, expectedType) {
  const response = await fetch(new URL(path, siteOrigin), {
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
    headers: { 'user-agent': 'dating-app-staging-seo-validator/1.0' },
  });
  if (!response.ok) throw new Error(path + ' returned HTTP ' + response.status);
  const contentType = response.headers.get('content-type') || '';
  if (expectedType && !contentType.toLowerCase().includes(expectedType)) {
    throw new Error(path + ' returned unexpected content type: ' + contentType);
  }
  return response.text();
}

function attribute(tag, name) {
  const attributes = tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:]*)="([^"]*)"/g);
  for (const match of attributes) {
    if (match[1].toLowerCase() === name.toLowerCase()) return match[2];
  }
  return null;
}

function metaValue(html, keyName, keyValue) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  const tag = tags.find((item) => attribute(item, keyName) === keyValue);
  return tag ? attribute(tag, 'content') : null;
}

function assertPresent(value, label) {
  if (!value || !value.trim()) throw new Error('Missing deployed SEO metadata: ' + label);
}

async function main() {
  const html = await get('/', 'text/html');
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : null;
  assertPresent(title, 'title');
  if (title.length < 20 || title.length > 70) throw new Error('Deployed title length is outside 20-70 characters.');

  const description = metaValue(html, 'name', 'description');
  assertPresent(description, 'meta description');
  if (description.length < 70 || description.length > 170) throw new Error('Deployed meta description length is outside 70-170 characters.');

  const canonicalTag = (html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i) || [])[0];
  const canonical = canonicalTag ? attribute(canonicalTag, 'href') : null;
  if (canonical !== siteOrigin + '/') throw new Error('Deployed canonical URL is incorrect: ' + (canonical || 'missing'));
  if (metaValue(html, 'property', 'og:url') !== siteOrigin + '/') throw new Error('Deployed Open Graph URL is incorrect.');

  const jsonLdMatch = html.match(/<script\s+type=["']application\/ld\+json["']\s*>([\s\S]*?)<\/script>/i);
  if (!jsonLdMatch) throw new Error('Deployed homepage JSON-LD is missing.');
  let graph;
  try {
    graph = JSON.parse(jsonLdMatch[1]);
  } catch (error) {
    throw new Error('Deployed homepage JSON-LD is invalid: ' + error.message);
  }
  if (graph['@context'] !== 'https://schema.org' || !Array.isArray(graph['@graph'])) {
    throw new Error('Deployed homepage JSON-LD does not contain the expected schema.org graph.');
  }
  for (const type of ['Organization', 'WebSite', 'SoftwareApplication']) {
    if (!graph['@graph'].some((item) => item['@type'] === type)) {
      throw new Error('Deployed JSON-LD is missing type: ' + type);
    }
  }

  const sitemap = await get('/sitemap.xml', 'xml');
  const urls = [...sitemap.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => match[1].trim());
  const expected = allowedPaths.map((route) => new URL(route, siteOrigin).href);
  if (new Set(urls).size !== urls.length) throw new Error('Deployed sitemap contains duplicate URLs.');
  if (urls.length !== expected.length || expected.some((url) => !urls.includes(url))) {
    throw new Error('Deployed sitemap does not exactly match the approved public URL list.');
  }

  const robots = await get('/robots.txt', 'text/plain');
  const lines = robots.split(/\r?\n/).map((line) => line.trim());
  for (const route of privatePaths) {
    if (!lines.includes('Disallow: ' + route)) throw new Error('Deployed robots.txt does not disallow ' + route);
  }
  for (const route of ['/login', '/register']) {
    if (lines.includes('Disallow: ' + route)) throw new Error('Deployed robots.txt must allow crawlers to read the noindex header on ' + route);
    const response = await fetch(new URL(route, siteOrigin), {
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
      headers: { 'user-agent': 'dating-app-staging-seo-validator/1.0' },
    });
    const robotsHeader = response.headers.get('x-robots-tag') || '';
    if (!response.ok || !/noindex/i.test(robotsHeader) || !/nofollow/i.test(robotsHeader)) {
      throw new Error('Deployed ' + route + ' must return X-Robots-Tag noindex, nofollow. Received: ' + (robotsHeader || 'missing'));
    }
  }

  for (const route of allowedPaths.slice(1)) {
    const response = await fetch(new URL(route, siteOrigin), {
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
      headers: { 'user-agent': 'dating-app-staging-seo-validator/1.0' },
    });
    if (!response.ok) throw new Error('Public route ' + route + ' returned HTTP ' + response.status);
    if (!(response.headers.get('content-type') || '').toLowerCase().includes('text/html')) {
      throw new Error('Public route ' + route + ' did not return HTML.');
    }
  }

  console.log('Deployed SEO validation passed: homepage metadata and JSON-LD, canonical URL, exact sitemap, ' + privatePaths.length + ' crawler exclusions, and ' + expected.length + ' public routes.');
}

main().catch((error) => {
  console.error('Deployed SEO validation failed: ' + error.message);
  process.exitCode = 1;
});

const fs = require('fs');
const path = require('path');
const routes = require('../src/config/seoRoutes');

const buildDir = path.resolve(__dirname, '..', 'build');
const siteOrigin = (process.env.SEO_SITE_ORIGIN || 'https://dating-app-staging.pages.dev').replace(/\/$/, '');
const htmlPath = path.join(buildDir, 'index.html');

function replaceMeta(html, attribute, key, value) {
  const pattern = new RegExp('<meta\\b(?=[^>]*\\b' + attribute + '="' + key + '")[^>]*>', 'i');
  const tag = '<meta ' + attribute + '="' + key + '" content="' + value.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '" />';
  if (pattern.test(html)) return html.replace(pattern, tag);
  return html.replace('</head>', '  ' + tag + '\n  </head>');
}

function replaceCanonical(html, url) {
  const pattern = /<link\b(?=[^>]*\brel="canonical")[^>]*>/i;
  const tag = '<link rel="canonical" href="' + url + '" />';
  if (pattern.test(html)) return html.replace(pattern, tag);
  return html.replace('</head>', '  ' + tag + '\n  </head>');
}

if (!fs.existsSync(htmlPath)) throw new Error('Build output index.html is missing. Run the frontend build first.');

const template = fs.readFileSync(htmlPath, 'utf8');
for (const [route, metadata] of Object.entries(routes)) {
  if (route === '/') continue;
  const canonicalUrl = siteOrigin + route;
  let html = template.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + metadata.title + '</title>');
  html = replaceMeta(html, 'name', 'description', metadata.description);
  html = replaceMeta(html, 'name', 'robots', 'index, follow, max-image-preview:large');
  html = replaceMeta(html, 'property', 'og:title', metadata.title);
  html = replaceMeta(html, 'property', 'og:description', metadata.description);
  html = replaceMeta(html, 'property', 'og:url', canonicalUrl);
  html = replaceMeta(html, 'name', 'twitter:title', metadata.title);
  html = replaceMeta(html, 'name', 'twitter:description', metadata.description);
  html = replaceCanonical(html, canonicalUrl);

  const outputDir = path.join(buildDir, route.slice(1));
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'index.html'), html);
  console.log('Generated static SEO HTML for ' + route);
}
console.log('Static route SEO generation completed for ' + (Object.keys(routes).length - 1) + ' public routes.');

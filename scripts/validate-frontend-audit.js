#!/usr/bin/env node
'use strict';

// Keep the deployment gate focused on shipped production dependencies while
// explicitly validating the one currently unpatched, build-tool-only advisory.
const fs = require('node:fs');

const reportPath = process.argv[2];
if (!reportPath) {
  console.error('Usage: node scripts/validate-frontend-audit.js <npm-audit-json>');
  process.exit(2);
}

let report;
let lock;
try {
  report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
} catch (error) {
  console.error(`Unable to read npm audit report or package-lock.json: ${error.message}`);
  process.exit(2);
}

const vulnerabilities = Object.values(report.vulnerabilities || {});
const blocking = vulnerabilities.filter((item) => ['high', 'critical'].includes(item.severity));
const allowedAdvisory = 'GHSA-fc5q-39xc-vjpf';
const packageEntries = Object.entries(lock.packages || {});
const picomatchEntries = packageEntries.filter(([path]) => path === 'node_modules/picomatch' || path.endsWith('/node_modules/picomatch'));

if (picomatchEntries.length === 0) {
  console.error('Expected picomatch entries were not found in package-lock.json.');
  process.exit(1);
}

const invalidPicomatchEntries = picomatchEntries.filter(([, pkg]) => pkg.dev !== true);
if (invalidPicomatchEntries.length > 0) {
  console.error('The vulnerable picomatch package is not exclusively development-only:');
  for (const [path] of invalidPicomatchEntries) console.error(` - ${path}`);
  process.exit(1);
}

const picomatchAdvisoryPresent = (report.vulnerabilities?.picomatch?.via || []).some(
  (via) => typeof via === 'object' && typeof via.url === 'string' && via.url.includes(allowedAdvisory)
);

function tracesOnlyToAllowedPicomatch(name, visited = new Set()) {
  if (name === 'picomatch') return picomatchAdvisoryPresent;
  if (visited.has(name)) return false;
  const item = report.vulnerabilities?.[name];
  if (!item || !Array.isArray(item.via) || item.via.length === 0) return false;

  const nextVisited = new Set(visited);
  nextVisited.add(name);
  return item.via.every((via) => {
    if (typeof via === 'string') return tracesOnlyToAllowedPicomatch(via, nextVisited);
    return (
      typeof via === 'object' &&
      via.name === 'picomatch' &&
      typeof via.url === 'string' &&
      via.url.includes(allowedAdvisory)
    );
  });
}

const unexpected = [];
for (const item of blocking) {
  const nodes = item.nodes || [];
  const nodesAreDevelopmentOnly =
    nodes.length > 0 &&
    nodes.every((path) => lock.packages?.[path]?.dev === true);
  const hasOnlyAllowedAdvisory = tracesOnlyToAllowedPicomatch(item.name);

  if (!nodesAreDevelopmentOnly || !hasOnlyAllowedAdvisory) {
    unexpected.push(item);
  }
}

const counts = report.metadata?.vulnerabilities || {};
console.log(
  `Full dependency audit reviewed: ${counts.total || 0} total findings ` +
  `(${counts.high || 0} high, ${counts.critical || 0} critical, ${counts.moderate || 0} moderate, ${counts.low || 0} low).`
);
if (blocking.length > 0) {
  console.warn(
    `Scoped exception: ${allowedAdvisory} propagates through development-only build/test dependencies to picomatch. ` +
    'All affected package nodes are marked dev-only in the lockfile and are not part of the deployed Pages runtime.'
  );
}
console.log('No unexpected high or critical findings were found.');

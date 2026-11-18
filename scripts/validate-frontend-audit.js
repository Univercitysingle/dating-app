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

const unexpected = [];
for (const item of blocking) {
  const advisoryMatches = (item.via || []).some((via) =>
    typeof via === 'object' && typeof via.url === 'string' && via.url.includes(allowedAdvisory)
  );
  const nodes = item.nodes || [];
  const nodesAreDevelopmentOnly =
    item.name === 'picomatch' &&
    nodes.length > 0 &&
    nodes.every((path) => lock.packages?.[path]?.dev === true);

  if (item.name !== 'picomatch' || !advisoryMatches || !nodesAreDevelopmentOnly) {
    unexpected.push(item);
  }
}

if (unexpected.length > 0) {
  console.error('Unexpected high or critical frontend dependency findings:');
  for (const item of unexpected) {
    console.error(` - ${item.name}: ${item.severity}; nodes: ${(item.nodes || []).join(', ')}`);
  }
  process.exit(1);
}

const counts = report.metadata?.vulnerabilities || {};
console.log(
  `Full dependency audit reviewed: ${counts.total || 0} total findings ` +
  `(${counts.high || 0} high, ${counts.critical || 0} critical, ${counts.moderate || 0} moderate, ${counts.low || 0} low).`
);
if (blocking.length > 0) {
  console.warn(
    `Scoped exception: ${allowedAdvisory} affects only picomatch packages marked dev-only ` +
    'in the lockfile. These packages are used by the frontend build/test toolchain and are not part of the deployed Pages runtime.'
  );
}
console.log('No unexpected high or critical findings were found.');

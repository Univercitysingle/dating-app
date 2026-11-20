#!/usr/bin/env node
'use strict';

// Validate npm's machine-readable audit output. Moderate findings are reported
// separately; deployment and remediation jobs apply their own scope-specific threshold.
const fs = require('node:fs');

const reportPath = process.argv[2];
if (!reportPath) {
  console.error('Usage: node scripts/validate-frontend-audit.js <npm-audit-json>');
  process.exit(2);
}

let report;
try {
  report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
} catch (error) {
  console.error(`Unable to read npm audit report: ${error.message}`);
  process.exit(2);
}

if (!report || typeof report !== 'object' || Array.isArray(report)) {
  console.error('npm audit returned an invalid report object.');
  process.exit(2);
}
if (report.error || report.errors || report.code || (report.message && !report.metadata)) {
  console.error('npm audit returned an error response; refusing to treat it as a clean scan.');
  process.exit(2);
}

const counts = report.metadata?.vulnerabilities;
if (!counts || typeof counts !== 'object' ||
    !report.vulnerabilities || typeof report.vulnerabilities !== 'object' ||
    Array.isArray(report.vulnerabilities)) {
  console.error('npm audit report is missing required vulnerability metadata; refusing to pass.');
  process.exit(2);
}

for (const key of ['total', 'low', 'moderate', 'high', 'critical']) {
  if (!Number.isInteger(counts[key]) || counts[key] < 0) {
    console.error(`npm audit report has invalid metadata.vulnerabilities.${key}.`);
    process.exit(2);
  }
}

const entries = Object.entries(report.vulnerabilities);
const malformed = entries.filter(([, item]) =>
  !item || typeof item !== 'object' ||
  !['low', 'moderate', 'high', 'critical'].includes(item.severity) ||
  !Array.isArray(item.via) ||
  !Array.isArray(item.nodes)
);
if (malformed.length > 0) {
  console.error('npm audit report contains malformed vulnerability entries.');
  process.exit(2);
}

console.log(
  `Full dependency audit reviewed: ${counts.total} total findings ` +
  `(${counts.high} high, ${counts.critical} critical, ${counts.moderate} moderate, ${counts.low} low).`
);

const blocking = entries.filter(([, item]) => ['high', 'critical'].includes(item.severity));
if (blocking.length > 0) {
  console.error('Unexpected high or critical vulnerabilities were found:');
  for (const [name, item] of blocking) {
    console.error(` - ${name}: ${item.severity}; direct=${Boolean(item.isDirect)}; range=${item.range || 'unknown'}`);
  }
  process.exit(1);
}

console.log('No high or critical vulnerabilities were found.');

#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const validator = path.join(__dirname, 'validate-frontend-audit.js');
const baseReport = {
  auditReportVersion: 2,
  vulnerabilities: {},
  metadata: { vulnerabilities: { total: 0, low: 0, moderate: 0, high: 0, critical: 0 } }
};
const lock = {
  name: 'fixture',
  lockfileVersion: 3,
  packages: {
    '': { name: 'fixture' },
    'node_modules/picomatch': { version: '4.0.2', dev: true }
  }
};

function run(report) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-audit-gate-'));
  const reportPath = path.join(dir, 'audit.json');
  const lockPath = path.join(dir, 'package-lock.json');
  fs.writeFileSync(reportPath, JSON.stringify(report));
  fs.writeFileSync(lockPath, JSON.stringify(lock));
  const result = spawnSync(process.execPath, [validator, reportPath, lockPath], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  return result;
}

test('accepts a structurally valid clean npm audit report', () => {
  const result = run(baseReport);
  assert.equal(result.status, 0, result.stderr);
});

test('fails closed when npm audit returns a registry error', () => {
  const result = run({ error: { code: 'EAI_AGAIN', summary: 'registry unavailable' } });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /error response/i);
});

test('fails closed when vulnerability metadata is missing', () => {
  const result = run({ vulnerabilities: {} });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing required vulnerability metadata/i);
});

test('blocks unexpected high-severity findings', () => {
  const report = structuredClone(baseReport);
  report.vulnerabilities.example = {
    name: 'example',
    severity: 'high',
    isDirect: true,
    via: [{ name: 'example', url: 'https://example.test/advisory' }],
    nodes: ['node_modules/picomatch'],
    range: '<1.0.0'
  };
  report.metadata.vulnerabilities = { total: 1, low: 0, moderate: 0, high: 1, critical: 0 };
  const result = run(report);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unexpected high or critical vulnerabilities/i);
});

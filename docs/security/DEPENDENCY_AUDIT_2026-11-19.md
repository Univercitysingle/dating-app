# Dependency security findings: 19 November 2026

**Status:** Open. The staging build completed, but the dependency audit identified moderate-severity transitive findings that still require lockfile remediation.

## Evidence

GitHub Actions run [Pages staging #44596670894](https://github.com/Univercitysingle/dating-app/actions/runs/44596670894) completed successfully on 19 November 2026. Its frontend and legacy backend audit steps each reported seven findings: zero critical, zero high, seven moderate, and zero low. The audit validator allowed the build to continue because the configured deployment threshold is high severity.

The npm audit output identified these advisories:

| Advisory | Package | Finding | Dependency path |
|---|---|---|---|
| [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) | glob | AbortSignal cancellation bypass can permit post-timeout filesystem traversal | glob, rimraf, gaxios, gcp-metadata and google-gax under the Google Cloud Firestore dependency tree |
| [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) | minimatch | Potential denial of service through globparts amplification | nested minimatch dependency under glob |

The Worker dependency audit in [Worker staging #44598481067](https://github.com/Univercitysingle/dating-app/actions/runs/44598481067) reported **zero vulnerabilities**.

## Scope and impact

- The findings are transitive dependencies reported in the root frontend and legacy backend npm audit runs.
- The same advisory family appears in both audit runs. Do not add the finding counts together as if they were unique vulnerabilities.
- The Worker dependency tree was clean in the recorded Worker staging audit.
- These are moderate-severity advisories. The available CI evidence did not report high or critical findings.
- A successful staging deployment does not mean the moderate findings have been fixed.

## Required remediation

1. Refresh the root and backend lockfiles using the supported Node.js/npm version in a controlled branch workspace.
2. Confirm that the resolved glob and minimatch versions are outside the affected ranges in both lockfiles.
3. Review the resulting dependency diff. Avoid broad forced upgrades or unreviewed major-version changes.
4. Run `npm ci` followed by `npm audit --json` in the root and backend directories.
5. Run frontend tests, backend tests, production build, and staging deployment checks.
6. Confirm the audit output contains no remaining instances of the two advisories, or record a documented exception with owner and expiry.
7. Keep the Worker audit as a separate gate because it uses its own lockfile.

## Acceptance criteria

- [ ] Root lockfile updated and reproducible with `npm ci`.
- [ ] Backend lockfile updated and reproducible with `npm ci`.
- [ ] Both advisories absent from root and backend audit output.
- [ ] Frontend and backend regression suites pass.
- [ ] Cloudflare Pages staging deployment passes from `migrate-to-serverless`.
- [ ] Final audit report and commit SHA recorded.

No dependency manifest or lockfile was changed as part of this finding record. A lockfile-only or manifest-only edit without a reproducible install and test run would not be a safe remediation.

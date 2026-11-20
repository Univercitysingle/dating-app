# Dependency security findings: 19 November 2026

**Status:** Resolved on `migrate-to-serverless`, verified 20 November 2026 by clean npm audits and reproducible installs.

## Original finding

The Pages staging audit on 19 November 2026 reported seven moderate findings in each of the frontend and legacy backend dependency trees. The identified advisories were:

| Advisory | Package | Finding |
|---|---|---|
| [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) | glob | AbortSignal cancellation bypass can permit post-timeout filesystem traversal |
| [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) | minimatch | Potential denial of service through globparts amplification |

The earlier Worker audit was already clean. The original findings were moderate severity, not high or critical. The counts from root and backend audits were not unique vulnerability counts.

## Remediation

The migration branch contains semver-compatible dependency floors and overrides for the affected transitive packages, with regenerated root and backend lockfiles. The security remediation workflow verifies clean installs before auditing. The final dependency remediation was merged into `migrate-to-serverless` as commit `f921014f5263c757895e8ace160f1ae4c40b239e`. It did not modify `main`.

The automated remediation workflow also attempted to regenerate lockfiles from the already patched manifests. It reported that no additional semver-safe changes were needed, confirming that the committed manifests and lockfiles were already aligned.

## Verification evidence

[Dependency audit run #44703705089](https://github.com/Univercitysingle/dating-app/actions/runs/44703705089) completed successfully on 20 November 2026. The job performed `npm ci` for root, backend and Worker dependency trees, then ran production and full-tree audits.

| Dependency tree | Result |
|---|---:|
| Root production | 0 vulnerabilities |
| Root full tree | 0 vulnerabilities |
| Backend production | 0 vulnerabilities |
| Backend full tree | 0 vulnerabilities |
| Cloudflare Worker | 0 vulnerabilities |

[Remediation validation run #44703606851](https://github.com/Univercitysingle/dating-app/actions/runs/44703606851) completed successfully. It ran the complete application test command, `npm test`, after clean installs and audits.

The Pages staging deployment [#44703606773](https://github.com/Univercitysingle/dating-app/actions/runs/44703606773) and Worker staging deployment [#44703606866](https://github.com/Univercitysingle/dating-app/actions/runs/44703606866) also completed successfully after the dependency remediation merge.

## Closure decision

- [x] Root lockfile installs reproducibly with `npm ci`.
- [x] Backend lockfile installs reproducibly with `npm ci`.
- [x] Both original advisories absent from root and backend audit results.
- [x] Root and backend full-tree audits report zero findings.
- [x] Worker audit reports zero findings.
- [x] Application regression suite passes.
- [x] Cloudflare Pages staging deployment passes.
- [x] Cloudflare Worker staging deployment passes.
- [x] Evidence and commit recorded.

**Conclusion:** The original glob/minimatch dependency finding is closed for the audited migration-branch revision. Continue running the dependency audit on every relevant manifest or lockfile change. This closure does not imply that future dependency vulnerabilities cannot occur.

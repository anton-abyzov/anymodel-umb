# Verify — 0019-hosted-compatibility-studio-boundary

PASS · 2026-10-09T09:18:36.001Z · commands from explicit

## Commands

### `npm --prefix repositories/antonoly/anymodel test` → exit 0 (1s)

```

> anymodel@2.0.0 test
> node scripts/verification/offline-tests.mjs

{
  "report": "/var/folders/js/x0hbrvjj2rl7hsgjy5955_r40000gn/T/anymodel-offline-q5c0vS/report.json",
  "testsExitCode": 0,
  "testFiles": 53,
  "networkViolations": 0,
  "coverage": {
    "lines": 87.65,
    "branches": 83.99,
    "functions": 85.29
  },
  "unobservedSourceFiles": [],
  "passed": true
}
```

### `node .specweave/increments/0019-hosted-compatibility-studio-boundary/reports/release/verify-release.mjs` → exit 0 (0s)

```
{
  "passed": true,
  "at": "2026-10-09T09:18:35.996Z",
  "version": "2.0.0",
  "gitHead": "7a8b470c8525550de7f3bf0420a310d8f6b9d0b2",
  "registryRechecked": true,
  "registryIntegrity": "sha512-NgYWvRYvaHYOhEMaGqVhrGDJW5dHUv/9wpkhfJ/xUvLpDpIqFndXXiKyYnMuOCTAkp+2yjQxA/uQU/QEK3zOXQ==",
  "deploymentEvidence": "Recorded at release; timestamps are retained in individual receipts.",
  "checks": [
    "registry artifact and SHA-512",
    "isolated CLI",
    "registry installation",
    "publish workflow",
    "worker bundle and public auth",
    "site asset hashes",
    "production alias",
    "six headless viewport/theme checks",
    "independent review"
  ],
  "localInference": false
}
```

## Acceptance criteria

7/7 met

| AC | Met | Text |
|---|---|---|
| AC-01 | x (tasks) | Provider credentials never cross provider boundaries; every proxy route applies required auth, rate/body limits, and explicit route policy. Cloud OpenAI-wire requests use the intended supported provider or explicit unsupported errors, never Anthropic fallback or fabricated success. |
| AC-02 | x (tasks) | Hosted reasoning effort and valid tool dictionaries survive; native reasoning output-limit fields are correct; stream failures remain errors; supported streaming usage is requested and unavailable values remain explicit. |
| AC-03 | x (tasks) | Worker missing/wrong configured tokens cannot spend its server key; BYOK and server-funded policies are explicit and tested at the real handler. |
| AC-04 | x (tasks) | CLI/docs/site define AnyModel as optional compatibility, native frontier Studio remains default, API catalog does not imply subscription entitlement; stale presets fail clearly with no surprise paid substitution; catalog availability is observable. |
| AC-05 | x (tasks) | Bundled client receives no new feature/branding work and is excluded from the 2.0 npm artifact; installed native-client/proxy use is primary, explicit externally supplied legacy clients remain possible, license scope and migration requirements are clear without unverified legal claims. |
| AC-06 | x (tasks) | Complete offline suite and coverage run without contacting local inference or live credentials; all audited defect regressions pass; focused hosted tool/stream/error task evidence and a representative bounded repository evaluation distinguish compatibility, artifact success and agent completion. |
| AC-07 | x (tasks) | Independent review has no unresolved high/critical issues; release source, npm integrity/isolated install, website and worker runtime readbacks prove exactly what shipped, retaining external blockers honestly. |

## Tasks (ledger)

| Task | State | By | Evidence | Note |
|---|---|---|---|---|
| T-01 | done | anymodel-runtime | cd /Users/antonabyzov/Projects/github/anymodel-0019-runtime… |  |
| T-02 | done | anymodel-worker | cd /Users/antonabyzov/Projects/github/anymodel-0019-worker … |  |
| T-03 | done | anymodel-product | cd /Users/antonabyzov/Projects/github/anymodel-0019-product… |  |
| T-04 | done | anymodel-worker | cd /Users/antonabyzov/Projects/github/anymodel-compatibilit… |  |
| T-05 | done | anymodel-release | node .specweave/increments/0019-hosted-compatibility-studio… |  |
| T-06 | done | anymodel-product | cd /Users/antonabyzov/Projects/github/anymodel-0019-product… |  |
| T-07 | done | anymodel-free-policy | cd /Users/antonabyzov/Projects/github/anymodel-0019-free-po… |  |

7/7 done · 0 skipped · 0 claimed · 0 blocked · 0 stale · 0 open

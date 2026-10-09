# 0019 AnyModel hosted compatibility and Studio boundary

## Problem
The 2026-10-09 CodeReviewer audit of published AnyModel 1.17.0 confirmed ten defects across credentials, routing, authentication, reasoning control, stream failures, usage and schemas. Product claims overlap maintained native Studio runtimes and overstate what translation proves. Anton authorized completing all recommended fixes, evaluation and release on 2026-10-09.

## Scope
In: all ten audited defects; safe full offline regression execution; live hosted-model verification and bounded task evaluation; current model availability and truthful presets; optional compatibility positioning, explicit Studio/API/subscription boundary, bundled-client maintenance freeze/provenance clarity; npm, source and website/worker release with readback.
Out: local model inference/discovery/warmup, duplicate Studio native-model discovery, unrelated active Studio sessions or fleet installs, a new AnyModel Studio driver, new coding-agent runtime, automatic model downgrade, social publication, paid acquisition. Existing user-owned local configuration and history stay intact.

## Acceptance Criteria
- [ ] AC-01: Provider credentials never cross provider boundaries; every proxy route applies required auth, rate/body limits, and explicit route policy. Cloud OpenAI-wire requests use the intended supported provider or explicit unsupported errors, never Anthropic fallback or fabricated success.
- [ ] AC-02: Hosted reasoning effort and valid tool dictionaries survive; native reasoning output-limit fields are correct; stream failures remain errors; supported streaming usage is requested and unavailable values remain explicit.
- [ ] AC-03: Worker missing/wrong configured tokens cannot spend its server key; BYOK and server-funded policies are explicit and tested at the real handler.
- [ ] AC-04: CLI/docs/site define AnyModel as optional compatibility, native frontier Studio remains default, API catalog does not imply subscription entitlement; stale presets fail clearly with no surprise paid substitution; catalog availability is observable.
- [ ] AC-05: Bundled client receives no new feature/branding work, maintained native-client/proxy use is primary, license scope and legacy-bundle status are explicit without unverified legal claims.
- [ ] AC-06: Complete offline suite and coverage run without contacting local inference or live credentials; all audited defect regressions pass; focused hosted tool/stream/error task evidence and a representative bounded repository evaluation distinguish compatibility, artifact success and agent completion.
- [ ] AC-07: Independent review has no unresolved high/critical issues; release source, npm integrity/isolated install, website and worker runtime readbacks prove exactly what shipped, retaining external blockers honestly.

## Approach
Latest product base is f0639894c85408bb1d81143f2ca63530d3a1c324; npm 1.17.0 runtime is a0fe2077fbc28602c0f0e0d308355daff8b4d1c0. Current umbrella main bb457e0 owns completed 0018 benchmark; legacy 0008 local-model tasks are already done and 0004 is local caching. No active ledger claims were found. Preserve those increments and all original checkouts. Use one new hosted-focused increment, separate runtime/worker/product worktrees with exclusive files, and merge into the owned integration worktree.

Read ADR-0002 and ADR-0003. Promote the pure-proxy/native-client direction while freezing the legacy bundle; do not assert license rights not established by evidence. Never infer capability parity from model names or a smoke response. Keep original benchmark evidence and correct its interpretation instead of deleting it.

All runtime/browser work uses Node 22.20; browser automation explicitly headless with PWDEBUG=0 and PLAYWRIGHT_HTML_OPEN=never. Offline tests may use in-process HTTP fixture servers but must not contact local inference. Kill only owned PIDs. No shared installation changes. Existing Studio native catalog c3079a42 and fleet work remain with their active owners.

Reviewer evidence: /Users/antonabyzov/Projects/research/anymodel-studio-review-2026-10-09/code-review-report.json. Retain release/evaluation reports beside this spec, with portable relative source paths and no secrets.

## Tasks

### T-01 Repair proxy routing and provider fidelity
- AC: AC-01, AC-02 | Files: repositories/antonoly/anymodel/proxy.mjs, repositories/antonoly/anymodel/providers/, repositories/antonoly/anymodel/test/ | Test: cd /Users/antonabyzov/Projects/github/anymodel-0019-runtime && /Users/antonabyzov/.nvm/versions/node/v22.20.0/bin/node --test test/hosted-compatibility.test.mjs

### T-02 Enforce worker authentication and request policies
- AC: AC-03 | Files: repositories/antonoly/anymodel/worker/ | Test: cd /Users/antonabyzov/Projects/github/anymodel-0019-worker && /Users/antonabyzov/.nvm/versions/node/v22.20.0/bin/node --test worker/test/*.test.mjs

### T-03 Narrow product scope and refresh model selection
- AC: AC-04, AC-05 | Files: repositories/antonoly/anymodel/cli.mjs, repositories/antonoly/anymodel/catalog/, repositories/antonoly/anymodel/catalog-test/, repositories/antonoly/anymodel/README.md, repositories/antonoly/anymodel/KNOWLEDGE-BASE.md, repositories/antonoly/anymodel/LOCAL_SETUP.md, repositories/antonoly/anymodel/NOTICE.md, repositories/antonoly/anymodel/site/, repositories/antonoly/anymodel/docs/ | Test: cd /Users/antonabyzov/Projects/github/anymodel-0019-product && /Users/antonabyzov/.nvm/versions/node/v22.20.0/bin/node --test catalog-test/*.test.mjs

### T-04 Build safe offline and hosted evaluation evidence
- AC: AC-06 | Files: repositories/antonoly/anymodel/scripts/verification/, repositories/antonoly/anymodel/evaluation/, .specweave/increments/0019-hosted-compatibility-studio-boundary/reports/ | Test: cd /Users/antonabyzov/Projects/github/anymodel-compatibility-20261009/repositories/antonoly/anymodel && /Users/antonabyzov/.nvm/versions/node/v22.20.0/bin/node scripts/verification/offline-tests.mjs
**Dependencies**: T-01, T-02, T-03

### T-05 Independently review, release and verify installed/public artifacts
- AC: AC-07 | Files: repositories/antonoly/anymodel/package.json, repositories/antonoly/anymodel/package-lock.json, repositories/antonoly/anymodel/CHANGELOG.md, .specweave/increments/0019-hosted-compatibility-studio-boundary/reports/ | Test: cd /Users/antonabyzov/Projects/github/anymodel-compatibility-20261009/repositories/antonoly/anymodel && /Users/antonabyzov/.nvm/versions/node/v22.20.0/bin/node scripts/verification/release-receipt.mjs
**Dependencies**: T-04

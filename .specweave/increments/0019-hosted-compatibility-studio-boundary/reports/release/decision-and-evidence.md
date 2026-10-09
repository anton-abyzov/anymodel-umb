# AnyModel 2.0 release decision

AnyModel is a small, optional API compatibility adapter. SpecWeave Studio's default remains a maintained native frontier agent. Studio owns sessions, workspaces, approvals and checkpoints; SpecWeave owns portable intent, task ownership and acceptance evidence. AnyModel adapts a connection only where a verified protocol mismatch warrants it.

The old bundled-client product direction is retired from distribution. Version 2.0 excludes the frozen modified client, requires Node 22+, uses a separately installed maintained client or explicit authorized path, and makes model/API/subscription boundaries explicit. This reduces duplicated runtime maintenance and avoids treating a translated API as equivalent agent capability. Existing local setup/history is preserved, but no local model was run in this work.

Cheaper hosted delegation is useful only for bounded tasks with independent checks and a clear escalation path. This pilot does not justify making it the default, silently downgrading a frontier session, or adding another Studio runtime. Native Studio integration work remains with its existing owners; no competing driver or catalog was added.

## Source and release identity

- Reviewed product commit: `b7ae0b5dedb970bc1e7101121f1b8cbc60b81fe0`.
- Merged product commit and npm gitHead: `7a8b470c8525550de7f3bf0420a310d8f6b9d0b2`.
- Both commits have tree `a4ef908ac1424ff1abd002d00425d21a667e0a0d`.
- [Product PR #5](https://github.com/anton-abyzov/anymodel/pull/5), [release v2.0.0](https://github.com/anton-abyzov/anymodel/releases/tag/v2.0.0), [trusted publish workflow](https://github.com/anton-abyzov/anymodel/actions/runs/37909733510), [npm package](https://www.npmjs.com/package/anymodel/v/2.0.0), [production site](https://anymodel.dev).
- npm SHA-512: `sha512-NgYWvRYvaHYOhEMaGqVhrGDJW5dHUv/9wpkhfJ/xUvLpDpIqFndXXiKyYnMuOCTAkp+2yjQxA/uQU/QEK3zOXQ==`.

## Task evidence map

The task ledger records the umbrella HEAD at execution; the nested product commits below identify the actual implementation. Every fix is included in the reviewed and published tree above.

| Task | Product implementation | Verification |
|---|---|---|
| T-01 credentials, routing, reasoning, schemas, errors, usage | `9a87028` | `../task-T-01.txt`, final 642-test receipt |
| T-02 worker gateway auth and policy | `1c0308e` | `../task-T-02.txt`, worker public/code readback |
| T-03 optional adapter, catalog, migration and website | `47a1f46`, `13d7f89`, `2fe2439`, `b7ae0b5` | `../task-T-03.txt`, public-site/report.json, package receipts |
| T-04 offline guard and bounded hosted evaluation | `8d70375`, `e213bff`, `5891efc`, `91b1611`, `f50f9ac` | `../validation/offline-final-receipt.json`, hosted-pilot, native-pilot, hosted-protocol |
| T-05 review, release, install and deployment | `13d7f89`, `638a406`, merge `7a8b470` | `../code-review-report.json`, release-contracts.json and receipts in this directory |
| T-06 stream framing and premature termination | `6a35676` | `../task-T-06.txt`, final suite, independent review |
| T-07 whole-request free-only policy | `685fec6` (agent commit `0179971`) | `../task-T-07.txt`, final suite, exact deployed worker bundle |

## Validation and interpretation

Final offline execution: **642/642 tests pass**, zero skips and zero network violations, **87.65% aggregate runtime line coverage**. The suite uses Node's runner and mock HTTP integration. This is not a claim of separate 95% unit, 90% integration or 100% E2E coverage from the legacy generated instructions. Current project configuration remains unchanged. Independent CodeReviewer review has zero unresolved findings.

| Bounded coding arm | Correct artifacts | Accepted completion | Boundary |
|---|---:|---:|---|
| Native Codex, requested frontier model | 3/3 | 3/3 | Server model identity and monetary cost unknown |
| OpenCode + hosted frontier directly | 3/3 | 3/3 | Three small tasks, one repetition |
| Same hosted frontier through AnyModel | 3/3 | 2/3 | Final response in one cell stopped by conservative shared budget |
| OpenCode + hosted Qwen directly | 1/3 | 0/3 | Two request-censored runs; one completed security repair failed checks |

Hosted pilot receipts report **$0.24970722** across 47 responses. Reservations were **$4.68959280/$4.75**; reserved amounts are not actual charges. A separate ten-request protocol check reports $0.0015114 known cost, with invalid-key calls unpriced. Qwen's native Messages tool stop reason fails identically direct and proxied. Preserve that compatibility boundary. These results support bounded, verified delegation; they do not establish general model parity, quality rankings, long-context performance or session-resume behavior.

## Deployment proof and limits

Both the extracted registry artifact and a separate `npm install anymodel@2.0.0` into an isolated global prefix report 2.0.0; all 27 installed files match the reviewed source. The legacy `cli.js` is absent. Shared global installations were not changed. Registry metadata initially returned 404 during npm processing, then version lookup, latest lookup and installation succeeded.

Production Vercel deployment `dpl_J6k6hahKdKH1RjdoKt7FmuEBB1RQ` is READY with `anymodel.dev` attached. Public HTML/CSS/JS/benchmark hashes equal source. Headless 390/768/1440 checks in both themes passed layout, theme persistence, FAQ, copy, anchors and page-error checks; screenshots were inspected. Rollback deployment is `dpl_4DncYmxUhGTodTqpPZ27ai38C663`. Initial promotion needed an explicit team scope; the scoped promotion succeeded.

Worker version `ad43917d-8b9f-4f7b-bbdd-a684da0c3df5` receives 100% of traffic. Downloaded deployed code matches the tested bundle SHA-256 `3237b7377b68ef7b6891be1cb8214f39d137c1a57a54ce04d5d703a0b954761d`. Both public hosts return health 200 and missing/wrong-token 401. Wrangler's route-management step failed after code activation because the existing token lacks that scope; existing routes were retained and independently verified. Authenticated free-only rejection is proven by exact deployed-code identity and independent handler tests, not a live valid-token request: the existing gateway secret is unreadable and was not rotated.

The maintained Claude client on this Mac has a separate pre-existing installation problem owned by another session. Launcher fixtures and actual Codex/OpenCode pilots passed; no claim is made that this Mac's native Claude installation was repaired or exercised successfully.

The SpecWeave 3 CLI auto-migrated configuration while recording tasks. That unrelated configuration rewrite is restored before commit. Closure uses the current SpecWeave 3.0.6 ledger/verify/review/complete workflow, with exact project commands documented in AGENTS.md.

`specweave complete 0019` succeeded after verify reported 7/7 tasks and ACs. Its generic coverage discovery did not recognize the Node coverage receipt and emitted a nonblocking missing-data warning; it does not replace the measured 87.65% result. The independent review already existed as CodeReviewer JSON; its original Markdown was also copied to the CLI's expected `reports/review.md`. Automatic rewrites of older increments and the shared state timestamp were restored in this owned checkout and preserved externally for diagnosis. See `closure.json` for exact scope.

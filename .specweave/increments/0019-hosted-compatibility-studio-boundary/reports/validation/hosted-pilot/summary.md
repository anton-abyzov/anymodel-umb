# Hosted coding pilot — 2026-10-09

Five of nine cells were accepted. Two other artifacts passed but final completion was blocked by declared resource limits. Resource-censored outcomes are separate from model failures.

| Arm | Task | Artifact checks | Runtime outcome |
|---|---|---|---|
| frontier-direct | dictionary | 7/7 | accepted |
| frontier-direct | worker-auth | 10/10 | accepted |
| frontier-direct | reasoning-budget | 14/14 | accepted |
| frontier-proxy | dictionary | 7/7 | accepted |
| frontier-proxy | worker-auth | 10/10 | accepted |
| frontier-proxy | reasoning-budget | 14/14 | budget-censored |
| qwen-direct | dictionary | 7/7 | request-censored |
| qwen-direct | worker-auth | 5/10 | artifact-failed |
| qwen-direct | reasoning-budget | 10/14 | request-censored |

Provider receipts report $0.24970722 across 47 responses (0 missing cost receipts). The unchanged shared ledger reserved $4.68959280 of its $4.75 cap; reservations are not actual charges.

Qwen’s cleanly completed worker-auth repair failed five checks: four authorized paths referenced undefined effectiveKey, and the arbitrary route bypassed gateway authentication. Do not promote that artifact. No repair retry was attempted.

Each valid cell, target source, patch, redacted events and receipt is retained beside this summary. Nine earlier no-inference harness rejections are recorded in harness-rejections.json.

- Three small source-repair fixtures with one attempt; not a model-quality ranking or parity claim.
- Native Codex uses different tools and subscription billing; no causal speed or cost comparison.
- OpenCode auxiliary requests consume the six-request cap. Resource-censored cells are not model failures.
- Nine earlier strict-gate harness rejections reached no upstream; retained separately and excluded from model outcomes.
- No local model requests or local inference processes.
- Cost totals use provider receipts; conservative nonrefunded reservations are not actual cost.

Keep native frontier Studio agents as default. Optional hosted delegates need task-specific tests and escalation; this pilot does not justify automatic downgrade.

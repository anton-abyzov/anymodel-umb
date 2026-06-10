# Tasks — 0018 AnyModel vs OpenCode Benchmark

### T-001: Build benchmark harness (runner + verifiers)
**User Story**: US-001 | **Satisfies ACs**: AC-US1-01, AC-US1-02, AC-US1-03 | **Status**: [x] completed
**Test**: Given 6 seeded tasks → When `node scripts/run-bench.mjs --arms opencode,anymodel --reps 3` → Then results JSON contains per-run success/walltime/toolcalls for every arm×task×rep

### T-002: Run v1.16.2 baseline comparison
**User Story**: US-001 | **Satisfies ACs**: AC-US1-02 | **Status**: [x] completed
**Test**: Given proxy v1.16.2 on :9090 → When full benchmark runs → Then results-baseline.json saved under reports/

### T-003: Fix Ollama provider text tool-call recovery (non-streaming + streaming + flush)
**User Story**: US-002 | **Satisfies ACs**: AC-US2-01, AC-US2-02, AC-US2-03 | **Status**: [x] completed
**Test**: Given a Qwen-XML text emission via /api/chat → When translated → Then Anthropic response contains tool_use with parsed input and stop_reason tool_use

### T-004: Re-run AnyModel arm on fixed build, generate HTML report
**User Story**: US-001, US-002 | **Satisfies ACs**: AC-US1-04, AC-US2-04 | **Status**: [x] completed
**Test**: Given baseline + fixed results → When report generator runs → Then side-by-side report served at localhost link with before/after deltas

### T-005: Ship — version bump, push, deploy
**User Story**: US-002 | **Satisfies ACs**: AC-US2-04 | **Status**: [x] completed
**Test**: Given green tests → When release pushed → Then GitHub main updated; npm publish via CI; site deploy intact

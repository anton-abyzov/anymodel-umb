# Tasks: Local Backend Providers — LMStudio + llama.cpp

## Stream A: LMStudio Provider

### T-001: Create `providers/lmstudio.mjs`
**User Story**: US-001 | **Satisfies ACs**: AC-US1-01, AC-US1-03, AC-US1-05 | **Status**: [x] completed
**Test Plan**: Given a fresh import of `providers/lmstudio.mjs` → When module is loaded → Then `default.name === 'lmstudio'`, `default.buildRequest(url, payload)` returns hostname=`localhost`, port=`1234`, path=`/v1/chat/completions`; and setting `LMSTUDIO_BASE_URL=http://example.com:9999/v1` changes hostname/port accordingly.

### T-002: Create `test/lmstudio.test.mjs`
**User Story**: US-001 | **Satisfies ACs**: AC-US1-01, AC-US1-03, AC-US1-04, AC-US1-05 | **Status**: [x] completed
**Test Plan**:
- `buildRequest` — default `:1234`, `LMSTUDIO_BASE_URL` override, correct path
- `transformRequest`/`transformResponse` — delegates to openai.mjs (smoke test)
- `name`, `displayInfo` formatting
- `detect()` — returns `true` when mock HTTP server at :1234 responds to `/v1/models`, `false` when nothing listening

## Stream B: llama.cpp Provider

### T-003: Create `providers/llamacpp.mjs`
**User Story**: US-002 | **Satisfies ACs**: AC-US2-01, AC-US2-03, AC-US2-05 | **Status**: [x] completed
**Test Plan**: Given a fresh import → When loaded → Then `name === 'llamacpp'`, `buildRequest` returns hostname=`localhost`, port=`8080`, path=`/v1/chat/completions`; `LLAMACPP_BASE_URL` override works.

### T-004: Create `test/llamacpp.test.mjs`
**User Story**: US-002 | **Satisfies ACs**: AC-US2-01, AC-US2-03, AC-US2-04, AC-US2-05 | **Status**: [x] completed
**Test Plan**: Mirror of T-002 with `:8080` and `LLAMACPP_BASE_URL`.

## Stream C: CLI Integration

### T-005: Extend `PROVIDERS` array + `parseArgs` in `cli.mjs`
**User Story**: US-001, US-002 | **Satisfies ACs**: AC-US1-01, AC-US1-02, AC-US2-01, AC-US2-02 | **Status**: [x] completed
**Test Plan**: Given `parseArgs(['lmstudio'])` → Then `opts.provider === 'lmstudio'`. Given `parseArgs(['--lmstudio'])` → Then `opts.provider === 'lmstudio'`. Same for `llamacpp`.

### T-006: Extend `detectProvider()` priority chain
**User Story**: US-003 | **Satisfies ACs**: AC-US3-01, AC-US3-02, AC-US3-03, AC-US3-04, AC-US3-05 | **Status**: [x] completed
**Test Plan**: Given no API keys and only LMStudio running → When `detectProvider()` called → Then returns `'lmstudio'`. Given Ollama AND LMStudio running → returns `'ollama'` (priority). Given `OPENROUTER_API_KEY` set AND all three local backends running → returns `'openrouter'`.

### T-007: Add `/v1/models` probe in `startProxyOnly` for lmstudio/llamacpp
**User Story**: US-001, US-002 | **Satisfies ACs**: AC-US1-04, AC-US2-04 | **Status**: [x] completed
**Test Plan**: Given LMStudio running with model `qwen2.5-coder-7b` loaded AND `--model` not provided → When proxy starts → Then first available model is auto-selected and printed in banner. (Manual smoke — no headless mock needed; unit test covers the `listModels()` helper.)

### T-008: Extend `test/cli.test.mjs` + `test/providers.test.mjs`
**User Story**: US-001, US-002 | **Satisfies ACs**: AC-US1-02, AC-US2-02 | **Status**: [x] completed
**Test Plan**: parseArgs tests for new positionals + flags, combined with `--model`/`--port`. Provider-interface parity tests for lmstudio + llamacpp in `providers.test.mjs`.

## Stream D: Docs (serial after A+B+C)

### T-009: Update `README.md` with "Local backends" section
**User Story**: US-004 | **Satisfies ACs**: AC-US4-01, AC-US4-03 | **Status**: [x] completed
**Test Plan**: Given a reader of README.md → When they scroll to local backends → Then they see Ollama/LMStudio/llama.cpp each with CLI command, port, env var override, and a portability note about GGUF.

### T-010: Update `site/index.html` (anymodel.dev)
**User Story**: US-004 | **Satisfies ACs**: AC-US4-02 | **Status**: [x] completed
**Test Plan**: Given a visitor to anymodel.dev → When they look at the backends section → Then all three (Ollama, LMStudio, llama.cpp) are shown.

## Gate: Test Suite Green

### T-011: Run full test suite
**Status**: [x] completed
**Test Plan**: `cd repositories/antonoly/anymodel && npm test` → all pre-existing tests remain green, new lmstudio + llamacpp tests green, providers + cli extensions green.
**Result**: 239/239 tests pass (44 suites, 115ms). No regressions. New tests: 12 lmstudio + 12 llamacpp + 5 cli flags + 4 providers interface.

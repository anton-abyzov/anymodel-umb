# Tasks: Lean AnyModel — 1.12.0 simplification pass

TDD mode active. Every task: **RED → GREEN → REFACTOR**.

Execution order (smallest → biggest refactor): US-005 → US-006 → US-004 → US-001 → US-003 → US-002.

---

## US-005: Prune FREE_MODELS (warmup)

### T-001: RED — write failing test for `:free`-suffix trust
**User Story**: US-005 | **Satisfies ACs**: AC-US5-01, AC-US5-04 | **Status**: [ ] pending
**Test Plan**: Given a model id `some/random-model:free` NOT in the current `FREE_MODELS` array → When `--free-only` is active AND this model is requested → Then request succeeds (proxy accepts it). Given `some/paid-model` → When `--free-only` + request → Then rejected with appropriate error.

### T-002: GREEN — implement `isFreeTierModel` by suffix
**User Story**: US-005 | **Satisfies ACs**: AC-US5-01, AC-US5-02, AC-US5-05 | **Status**: [ ] pending
**Test Plan**: After change — T-001 passes. Also existing tests in `test/cli.test.mjs` and `test/openai.test.mjs` touching `FREE_MODELS` are updated to not depend on specific model names.

### T-003: REFACTOR — clean help text + README
**User Story**: US-005 | **Satisfies ACs**: AC-US5-03 | **Status**: [ ] pending
**Test Plan**: `anymodel proxy --help` output no longer enumerates specific free models; mentions `:free` suffix convention. README's free-model table replaced by one-liner.

---

## US-006: Fix output_tokens=0 SSE bug

### T-004: RED — regression test for usage forwarding
**User Story**: US-006 | **Satisfies ACs**: AC-US6-01, AC-US6-02 | **Status**: [ ] pending
**Test Plan**: Given a mock OpenAI upstream that streams `completion_tokens: 42` in its final chunk → When AnyModel's `createStreamTranslator` processes the stream → Then the final emitted `message_delta` event carries `usage.output_tokens: 42`. Currently this test FAILS (output_tokens = 0).

### T-005: GREEN — accumulate + forward usage in stream translator
**User Story**: US-006 | **Satisfies ACs**: AC-US6-01, AC-US6-04 | **Status**: [ ] pending
**Test Plan**: Fix `createStreamTranslator` in `providers/openai.mjs` to accumulate `completion_tokens` across all chunks and emit in final `message_delta`. Handle upstream that never emits usage (stay 0, don't throw). Run existing streaming tests — all green.

### T-006: REFACTOR — non-streaming regression check
**User Story**: US-006 | **Satisfies ACs**: AC-US6-03 | **Status**: [ ] pending
**Test Plan**: Run `test/openai.test.mjs::translateResponse` tests — assert non-streaming usage reporting unchanged.

---

## US-004: Remove `_unused` placeholder hack

### T-007: RED — regression test for tool param named `_unused`
**User Story**: US-004 | **Satisfies ACs**: AC-US4-03 | **Status**: [ ] pending
**Test Plan**: Given a tool definition `{name:"x", input_schema:{properties:{_unused:{type:"string"},other:{type:"int"}}, required:["_unused"]}}` → When request passes through `sanitizeBody` and response through the translators → Then `_unused` param is preserved in both directions. Currently FAILS because proxy strips it.

### T-008: GREEN — fix empty-schema handling at source
**User Story**: US-004 | **Satisfies ACs**: AC-US4-01 | **Status**: [ ] pending
**Test Plan**: Update `sanitizeBody` to use `{type:"object", additionalProperties:false}` for empty-properties schemas. T-007 passes.

### T-009: GREEN — remove 4 strip sites
**User Story**: US-004 | **Satisfies ACs**: AC-US4-02 | **Status**: [ ] pending
**Test Plan**: Delete placeholder stripping from: `sanitizeToolUseResponse`, response JSON parse, streaming regex in proxy.mjs, response translators in openai.mjs + ollama.mjs. All existing tests still green.

### T-010: REFACTOR — integration smoke matrix
**User Story**: US-004 | **Satisfies ACs**: AC-US4-04, AC-US4-05 | **Status**: [ ] pending
**Test Plan**: Quick smoke: proxy request with empty-properties tool schema against LMStudio (local), Ollama (if running), mock OpenAI. All return 200. LOC delta validated: `wc -l proxy.mjs providers/openai.mjs providers/ollama.mjs` shows ≥35 total reduction.

---

## US-001: Unified openai-local factory

### T-011: RED — failing test for factory signature
**User Story**: US-001 | **Satisfies ACs**: AC-US1-01 | **Status**: [ ] pending
**Test Plan**: New test file `test/openai-local.test.mjs`. Given `makeOpenAILocalProvider({ name:"lmstudio", defaultPort:1234, envVar:"LMSTUDIO_BASE_URL", bearerStub:"lm-studio", v0Probe: true })` → When module imported → Then returns an object with `name`, `buildRequest`, `transformRequest`, `transformResponse`, `createStreamTranslator`, `displayInfo`, `detect`, `listModels`. Fails because factory doesn't exist yet.

### T-012: GREEN — implement factory
**User Story**: US-001 | **Satisfies ACs**: AC-US1-01 | **Status**: [ ] pending
**Test Plan**: Create `providers/openai-local.mjs` exporting the factory. Delegates `transformRequest`/`transformResponse`/`createStreamTranslator` to `openai.mjs`. T-011 passes.

### T-013: REFACTOR — shrink lmstudio.mjs to ≤ 20 LOC
**User Story**: US-001 | **Satisfies ACs**: AC-US1-02 | **Status**: [ ] pending
**Test Plan**: Replace lmstudio.mjs with factory call + LMStudio-specific config. `test/lmstudio.test.mjs` passes unchanged. `wc -l providers/lmstudio.mjs` ≤ 20.

### T-014: REFACTOR — shrink llamacpp.mjs to ≤ 20 LOC
**User Story**: US-001 | **Satisfies ACs**: AC-US1-03 | **Status**: [ ] pending
**Test Plan**: Replace llamacpp.mjs with factory call. `test/llamacpp.test.mjs` passes unchanged. `wc -l providers/llamacpp.mjs` ≤ 20.

### T-015: REFACTOR — suite green, interface parity
**User Story**: US-001 | **Satisfies ACs**: AC-US1-04 | **Status**: [ ] pending
**Test Plan**: Full suite `npm test` green. `test/providers.test.mjs` interface-parity tests still pass (same shape exposed).

---

## US-003: Extract LocalOptimizer module

### T-016: RED — unit tests for each optimization pass
**User Story**: US-003 | **Satisfies ACs**: AC-US3-03 | **Status**: [ ] pending
**Test Plan**: New `test/local-optimizer.test.mjs` — direct unit tests for: (a) tool-compression (90 tools → 25 after compression, measured token delta), (b) strip `thinking:{enabled:true}`, (c) system prompt condensation (15KB → ≤4KB, preserves CLAUDE.md), (d) XML-boilerplate strip, (e) message history condense when over budget. All tests fail because module doesn't exist.

### T-017: GREEN — implement optimizeForLocal function
**User Story**: US-003 | **Satisfies ACs**: AC-US3-01 | **Status**: [ ] pending
**Test Plan**: Create `providers/local-optimizer.mjs`. Signature `optimizeForLocal(parsed, ctx) → { parsed, telemetry }`. Imports `optimizeTools` from tool-compressor, `shouldSendTools` from ollama-tools. T-016 passes.

### T-018: GREEN — wire optimizer into proxy.mjs
**User Story**: US-003 | **Satisfies ACs**: AC-US3-02 | **Status**: [ ] pending
**Test Plan**: Replace the 180-line `isLocal` block in `handleMessages` with single call to `optimizeForLocal(parsed, { providerName, numCtx })`. Preserve logging (use returned `telemetry` to emit same banner lines). Existing integration tests continue passing.

### T-019: REFACTOR — full suite + LOC check
**User Story**: US-003 | **Satisfies ACs**: AC-US3-04, AC-US3-05 | **Status**: [ ] pending
**Test Plan**: `npm test` — all 260+ green. `wc -l proxy.mjs` drops ~180. `wc -l providers/local-optimizer.mjs` ~200.

---

## US-002: Native Anthropic mode for LMStudio 0.3+

### T-020: RED — test for native-mode probe
**User Story**: US-002 | **Satisfies ACs**: AC-US2-01 | **Status**: [ ] pending
**Test Plan**: Given a mock LMStudio server that returns Anthropic-shape body on POST /v1/messages → When proxy starts → Then `provider.nativeAnthropic = true`. Given a mock server that returns OpenAI-shape → Then `nativeAnthropic = false`. Given timeout → `false` (safe fallback).

### T-021: GREEN — implement native-mode probe
**User Story**: US-002 | **Satisfies ACs**: AC-US2-01, AC-US2-04 | **Status**: [ ] pending
**Test Plan**: Add probe logic in `cli.mjs` or `proxy.mjs` startup. Honor `LMSTUDIO_NATIVE=0` env override. T-020 passes.

### T-022: RED — test for translation skip when native
**User Story**: US-002 | **Satisfies ACs**: AC-US2-02, AC-US2-03 | **Status**: [ ] pending
**Test Plan**: Given `provider.nativeAnthropic = true` → When `handleMessages` processes a request → Then `transformRequest`/`transformResponse`/`createStreamTranslator` are NOT called. AND optimizer passes (tool-compress etc.) STILL run before the skip.

### T-023: GREEN — implement translation skip
**User Story**: US-002 | **Satisfies ACs**: AC-US2-02, AC-US2-03 | **Status**: [ ] pending
**Test Plan**: In `proxy.mjs` `handleMessages`, after optimizer pass, check `provider.nativeAnthropic` — if true, skip transforms; send body verbatim. T-022 passes.

### T-024: GREEN — banner line
**User Story**: US-002 | **Satisfies ACs**: AC-US2-05 | **Status**: [ ] pending
**Test Plan**: Banner includes "LMStudio native Anthropic mode" (green) when active. Visual check by test harness or string assertion on banner output.

### T-025: VERIFY — performance bench
**User Story**: US-002 | **Satisfies ACs**: AC-US2-06 | **Status**: [ ] pending
**Test Plan**: Run `Projects/TestLab/focus-timer/comparison/bench-realistic.mjs` (S5 scenario, 30 tools, 10KB system prompt) with proxy in native mode vs translation mode. Native mode ≤ translation mode on TTFT and total.

---

## Closure gate

### T-026: Full test suite green
**Status**: [ ] pending
**Test Plan**: `npm test` → all tests green (target: 260 pre-existing + ~40 new). `node --check` passes on all .mjs files.

### T-027: End-to-end smoke
**Status**: [ ] pending
**Test Plan**:
- `anymodel proxy lmstudio` (native mode) — banner mentions native mode
- `LMSTUDIO_NATIVE=0 anymodel proxy lmstudio` — translation mode banner
- `anymodel proxy ollama` — still works (no regression)
- `anymodel proxy qwen --free-only` — still works (no regression)
- Quick bench run showing output_tokens non-zero

### T-028: Publish 1.12.0
**Status**: [ ] pending
**Test Plan**: `package.json` version bump 1.11.1 → 1.12.0. `npm publish --dry-run` valid. `/sw:done 0007` all gates green. Then `npm publish` live.

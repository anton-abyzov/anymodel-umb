# Tasks — 0008 AnyModel local-model reliability

> Full detail (file paths, code, effort, risk, tests) in
> `docs/prep-2026-05-30/anymodel-improvement-plan.md` (P-ids) and `anymodel-code-review.md` (C/H/M-ids).
> Baseline before increment: 280 pass. After Tier 0: 306 pass / 0 fail.

## Tier 0 — DONE (commit 6138f16)

### T-001: Flush stream translator on upstream end (P0.1 / C1)
**User Story**: US-1 | **Satisfies ACs**: AC-US1-01, AC-US1-02, AC-US1-03 | **Status**: [x] completed
**Test**: Given a stream with no `[DONE]` → When upstream ends → Then `message_delta` + `message_stop` emitted exactly once.

### T-002: Recover text-channel tool calls (P0.2 / C2)
**User Story**: US-2 | **Satisfies ACs**: AC-US2-01, AC-US2-02, AC-US2-03 | **Status**: [x] completed
**Test**: Given a Hermes/Qwen-XML/fenced tool call in text + no structured tool_calls → When local + auto → Then a `tool_use` block + `stop_reason:tool_use`; prose-only is not converted.

### T-003: Upstream socket/idle timeout (P0.3 / H3)
**User Story**: US-3 | **Satisfies ACs**: AC-US3-01, AC-US3-02 | **Status**: [x] completed
**Test**: Given a black-hole upstream → When request stalls past `ANYMODEL_UPSTREAM_TIMEOUT_MS` → Then 502 within bounded time, not an infinite hang.

## Tier 1 — TODO (the work for the next session)

### T-004: Per-tc.index map for streamed tool calls (P1.1 / H1)
**User Story**: US-4 | **Satisfies ACs**: AC-US4-01, AC-US4-02, AC-US4-03 | **Status**: [x] completed
**Test**: Given two interleaved streamed tool calls (index 0 & 1) → When translated → Then each block accumulates only its own JSON; text-then-tool indices stay correct.
**Evidence**: `toolBlockByIndex` Map in `providers/openai.mjs` createStreamTranslator (commit fffc770); `test/stream-parallel-toolcalls.test.mjs` (3 cases).

### T-005: Canonical Anthropic error envelope via sendError (P1.6 / M8)
**User Story**: US-5 | **Satisfies ACs**: AC-US5-01, AC-US5-02 | **Status**: [x] completed
**Test**: Given each error path → When triggered → Then `{type:"error",error:{type,message}}` with a canonical `error.type`.
**Evidence**: `sendError()` in `proxy.mjs`; 6 flat sites + 2 already-canonical routed through it (commit fffc770); `test/send-error.test.mjs` (4 cases).

### T-006: Translate image/document content blocks (P1.2 / H2)
**User Story**: US-6 | **Satisfies ACs**: AC-US6-01 | **Status**: [x] completed
**Test**: Given image (base64/url), image-in-tool_result, document → When translated → Then OpenAI vision parts / markers, never silent `''`.
**Evidence**: `blocksToOpenAIContent` + `extractToolResultParts` + `imageBlockToUrl` in `providers/openai.mjs` (commit c85e098); `test/content-translation.test.mjs` (7 P1.2 cases). Text-only turns kept as strings (no array regression).

### T-007: Preserve tool_result.is_error (P1.3 / M1)
**User Story**: US-6 | **Satisfies ACs**: AC-US6-02 | **Status**: [x] completed
**Test**: Given `tool_result{is_error:true}` → When translated → Then an error marker survives in openai/ollama.
**Evidence**: `[tool_error]` prefix in `extractToolResultParts` (commit c85e098); ollama inherits via shared `translateRequest`. (Note: no `gemini.mjs` exists in this repo — prep-doc reference was stale.) `test/content-translation.test.mjs` (3 P1.3 cases).

### T-008: Forward top_p / stop_sequences / max_output_tokens (P1.4 / M11)
**User Story**: US-6 | **Satisfies ACs**: AC-US6-03 | **Status**: [x] completed
**Test**: Given these fields set → When translated → Then `body.top_p` / `body.stop` mapped; `max_tokens` falls back to `max_output_tokens`.
**Evidence**: `translateRequest` forwards top_p + stop_sequences→stop + max_output_tokens fallback; ollama mirrors into `options` (commit c85e098). Verified `sanitizeBody` does NOT bridge max_output_tokens→max_tokens, so the fallback is required (not redundant). `test/sampling-and-finish.test.mjs`.

### T-009: Unify finish_reason map; content_filter → refusal (P1.5 / M2)
**User Story**: US-6 | **Satisfies ACs**: AC-US6-04 | **Status**: [x] completed
**Test**: Given `content_filter` → Then `stop_reason:refusal` (not end_turn); streaming and non-streaming agree.
**Evidence**: `mapFinishReason()` applied at all 3 sites; `content_filter`→`refusal`; legacy `function_call` intentionally falls to end_turn (payload never extracted) — commit c85e098. `test/sampling-and-finish.test.mjs`.

### T-010: Default loopback bind; expose requires opt-in (P1.7 / M5)
**User Story**: US-7 | **Satisfies ACs**: AC-US7-01 | **Status**: [x] completed
**Test**: Given no `--host` → Then bind `127.0.0.1`; given exposed + no token → Then warn/refuse. (Verify listen/checkAuth first.)
**Evidence**: VERIFIED `server.listen(tryPort, ()=>{})` had no host arg. Added `resolveBindHost`/`isLoopbackHost`, `--host` flag, LAN-exposed+no-token warning (commit 52c4490). `test/security-defaults.test.mjs`.

### T-011: No real Anthropic key on local passthrough (P1.8 / H4)
**User Story**: US-7 | **Satisfies ACs**: AC-US7-02 | **Status**: [x] completed
**Test**: Given local provider + real `ANTHROPIC_API_KEY` → When passthrough route → Then no auth header reaches the mocked upstream.
**Evidence**: `stripAuthHeaders` threaded via `isLocalProvider` into `proxyToAnthropic({stripAuth})`; cloud (openrouter) still forwards auth (commit 52c4490). `test/security-defaults.test.mjs`.

### T-012: Cap buffered bodies + guard upstream JSON.parse (P1.9 / M7,M9)
**User Story**: US-7 | **Satisfies ACs**: AC-US7-03 | **Status**: [x] completed
**Test**: Given oversized inbound → 413; non-JSON upstream 200 → `api_error` (not generic 502).
**Evidence**: `readCappedBody` (ANYMODEL_MAX_BODY_BYTES, 64MB default, content-length fast-fail) on inbound→413; `safeJsonParse` guards both upstream parses→api_error 502 (commit 52c4490). `test/security-defaults.test.mjs`.

## Tier 2 — TODO (nice-to-have, P2.x)

### T-013: Tier 2 polish bundle (P2.1–P2.9)
**User Story**: US-8 | **Satisfies ACs**: AC-US8-01 | **Status**: [x] completed
**Test**: streaming `input_tokens` populated; TTFT `ping` heartbeat; malformed-arg `{}`-fallback; base-URL trailing-slash normalize; log hygiene. (Pick by remaining budget.)
**Evidence** (commit 968c3f4): P2.1 streaming `input_tokens` in message_delta; P2.2 TTFT `ping` heartbeat (15s, unref'd, cleared on all terminal paths); P2.4 `console.warn` on unparseable non-streaming tool args; P2.6 `/\/+$/` trailing-slash normalize; P2.7 `crypto.randomUUID()` tool_use ids. `test/tier2-polish.test.mjs`.
**Deferred** (out of scope, lower value/higher risk): P2.3 streaming malformed-arg `{}`-fallback (defers arg streaming to stop-time — behavioral change), P2.5 system-budget scaling, P2.8 full log hygiene/redaction, P2.9 .env opt-in. Tracked for a follow-up.

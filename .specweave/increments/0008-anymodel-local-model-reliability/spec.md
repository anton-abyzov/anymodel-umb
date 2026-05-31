# Increment 0008 — AnyModel local-model reliability

## Problem

AnyModel v1.12.0 is the Anthropic↔OpenAI translation proxy that lets Claude Code drive a LOCAL
Qwen3-Coder served by LM Studio (`http://localhost:1234`). A verified code review + live baseline
(2026-05-30) found the happy path GREEN but every real failure mode unhandled: the agentic loop
hangs, drops tool calls, or corrupts arguments under realistic local-model conditions.

**Source of truth for this increment** (read these first; full detail with `path:line`):
- `docs/prep-2026-05-30/anymodel-improvement-plan.md` — the prioritized plan (P0/P1/P2)
- `docs/prep-2026-05-30/anymodel-code-review.md` — verified findings with `path:line` + fixes
- `docs/prep-2026-05-30/anymodel-baseline-test.md` — live before-state + repro commands
- `docs/prep-2026-05-30/START-HERE-anymodel-handoff.md` — entry point

**Target package:** `repositories/antonoly/anymodel` (anymodel@1.12.0). Test stack:
`node --test test/*.test.mjs` (`npm test`). Baseline before this increment: 280 pass / 0 fail.
After Tier 0 (commit 6138f16): **306 pass / 0 fail**.

## User stories & acceptance criteria

### US-1 — Streaming never hangs (Tier 0) ✅ DONE (commit 6138f16)
As Claude Code, when a local server closes the stream without `data: [DONE]`, I still receive a
terminal `message_stop` so the turn finalizes.
- [x] AC-US1-01 — `flush()` called on upstream `end`; emits `content_block_stop`×N + `message_delta` + `message_stop`.
- [x] AC-US1-02 — idempotent when `[DONE]` already arrived (exactly one `message_stop`).
- [x] AC-US1-03 — preserves `tool_use` stop_reason when `finish_reason` was `tool_calls`.

### US-2 — Text-channel tool calls recovered (Tier 0) ✅ DONE (commit 6138f16)
As Claude Code, when the local model emits a tool call as text (Hermes/Qwen-XML/fenced JSON) instead
of structured `tool_calls`, the proxy recovers it into a real `tool_use` block.
- [x] AC-US2-01 — Hermes `<tool_call>{...}`, Qwen `<function=>` XML, and fenced ```json recovered.
- [x] AC-US2-02 — gated by `ANYMODEL_PARSE_TEXT_TOOLCALLS=auto|on|off` (auto = local-only).
- [x] AC-US2-03 — false-positive guards (prose mentioning the tags is not converted); structured calls take precedence.

### US-3 — Upstream never hangs forever (Tier 0) ✅ DONE (commit 6138f16)
As Claude Code, when a local model stalls, I get a bounded error instead of an infinite hang.
- [x] AC-US3-01 — request + socket idle timeout via `ANYMODEL_UPSTREAM_TIMEOUT_MS` (default 300s).
- [x] AC-US3-02 — timeout throws → existing retry loop fires → 502 (verified live: 502 in ~4.8s).

### US-4 — Parallel streamed tool calls are not corrupted (Tier 1) ✅ DONE (commit fffc770)
As Claude Code, when I batch independent tool calls, each `tool_use` accumulates only its own args.
- [x] AC-US4-01 — `createStreamTranslator` routes argument fragments by `tc.index` (Map<index,blockIndex>), not `blockIndex-1`.
- [x] AC-US4-02 — block-index accounting correct when text precedes tools (no `blockIndex++`-per-text-delta inflation).
- [x] AC-US4-03 — test: two interleaved streamed tool calls; each block gets only its own JSON.

### US-5 — Canonical Anthropic error envelope (Tier 1) ✅ DONE (commit fffc770)
- [x] AC-US5-01 — one `sendError(res,status,type,message)` helper emits `{type:"error",error:{type,message}}`.
- [x] AC-US5-02 — all flat-shape error sites routed through it with canonical `error.type` strings.

### US-6 — Multimodal + sampling + status fidelity (Tier 1) ✅ DONE (commit c85e098)
- [x] AC-US6-01 — image/document content blocks translated to OpenAI vision parts (no silent drop).
- [x] AC-US6-02 — `tool_result.is_error` preserved (marker) in openai + ollama (no `gemini.mjs` in repo — prep ref stale).
- [x] AC-US6-03 — `top_p`, `stop_sequences`, `max_output_tokens` forwarded.
- [x] AC-US6-04 — unified `finish_reason` map; `content_filter` → `refusal`.

### US-7 — Secure defaults (Tier 1) ✅ DONE (commit 52c4490)
- [x] AC-US7-01 — default bind loopback (`127.0.0.1`); expose requires `ANYMODEL_HOST`/`--host`.
- [x] AC-US7-02 — local-mode passthrough does not forward a real Anthropic key.
- [x] AC-US7-03 — buffered bodies capped (`ANYMODEL_MAX_BODY_BYTES`); the two unguarded `JSON.parse` guarded.

### US-8 — Tier 2 polish (nice-to-have) ✅ DONE (commit 968c3f4)
- [x] AC-US8-01 — streaming `input_tokens`, TTFT `ping` heartbeat, malformed-arg observability warn, base-URL trailing-slash normalize, `crypto.randomUUID` tool ids. (Deferred: P2.3 streaming `{}`-fallback, P2.5/P2.8/P2.9 — see tasks.md.)

## Definition of done
- Every AC's test added under `test/`; `npm test` green (≥306 pass / 0 fail).
- After each fix, the 4-case live baseline (`anymodel-baseline-test.md`) still PASSES against LM Studio
  + `qwen/qwen3-coder-30b` on a temp port (streaming asserts exactly one `message_stop`).
- End-to-end: Claude Code → proxy → local Qwen drives a multi-step task with parallel tool calls,
  an MCP server, and `ssh <alias> '<cmd>'` without hangs or dropped calls.

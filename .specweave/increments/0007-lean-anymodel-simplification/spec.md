---
increment: 0007-lean-anymodel-simplification
title: "Lean AnyModel — 1.12.0 simplification pass"
type: refactor
priority: P2
status: active
created: 2026-04-21
structure: user-stories
test_mode: TDD
coverage_target: 80
---
# Spec: Lean AnyModel — 1.12.0 Simplification Pass

**Architect report**: session transcript 2026-04-20 (summarized in plan.md)
**Prior bench data**: `.specweave/increments/0006-local-backend-providers/model-bench/` and `/Users/antonabyzov/Projects/TestLab/focus-timer/comparison/`

## Problem

AnyModel grew to **2,828 LOC** across CLI + proxy + 9 provider files. An architect review identified four classes of accumulated cruft:

1. **Duplicate code**: `providers/lmstudio.mjs` (116 LOC) and `providers/llamacpp.mjs` (89 LOC) are ~90% identical thin delegators
2. **Coupling**: `proxy.mjs` has 180 lines of `isLocal`-gated optimization passes inlined in `handleMessages`, making unit testing impossible (today only integration-tested)
3. **Belt-and-suspenders hacks**: `_unused` placeholder injected in one place is stripped in four other places, creating a latent bug for real tool params named `_unused`
4. **Stale allowlist**: `FREE_MODELS` hardcoded list churns every quarter as OpenRouter's free tier changes

Separately, the proxy-vs-direct bench (2026-04-20) surfaced a real bug: `output_tokens` is not forwarded in the streaming `message_delta` event. And LMStudio 0.3+ gained native Anthropic `/v1/messages` support — AnyModel still translates when it no longer needs to for LMStudio-only users.

## Goal

Ship **anymodel@1.12.0** with:
- Same external behavior (CLI surface, env vars, banner content all unchanged)
- **~260 LOC net reduction** via consolidation + dead-code prune
- **Measurably faster LMStudio path** via optional native-Anthropic passthrough (one less translation layer per request)
- **Closed bug**: `output_tokens=0` fixed in streamed responses
- **Higher test coverage**: extracted optimizer becomes unit-testable

## User Stories

### US-001: Unified local-OpenAI provider factory
**Project**: anymodel

**As a** maintainer
**I want** `lmstudio.mjs` and `llamacpp.mjs` merged into one factory module
**So that** bugfixes apply to both with one change

**Acceptance Criteria**:
- [ ] **AC-US1-01**: New `providers/openai-local.mjs` exports `makeOpenAILocalProvider({ name, defaultPort, envVar, bearerStub, v0Probe })` — ~90 LOC
- [ ] **AC-US1-02**: `providers/lmstudio.mjs` shrinks to ≤ 20 LOC (factory call with LMStudio config)
- [ ] **AC-US1-03**: `providers/llamacpp.mjs` shrinks to ≤ 20 LOC (factory call with llama.cpp config)
- [ ] **AC-US1-04**: All tests in `test/lmstudio.test.mjs` + `test/llamacpp.test.mjs` continue passing unchanged

### US-002: Native Anthropic mode for LMStudio 0.3+
**Project**: anymodel

**As an** LMStudio user
**I want** AnyModel to skip request/response translation when LMStudio already speaks Anthropic natively
**So that** I get lower latency and fewer moving parts

**Acceptance Criteria**:
- [ ] **AC-US2-01**: On proxy startup (after model probe), detect whether `POST /v1/messages` on LMStudio returns an Anthropic-shape body — set `provider.nativeAnthropic = true` when confirmed
- [ ] **AC-US2-02**: When `nativeAnthropic === true`, skip `transformRequest` / `transformResponse` / `createStreamTranslator` — send body verbatim; optimization passes STILL RUN before the bypass
- [ ] **AC-US2-03**: All 5 local optimization passes (auto-strict-MCP, tool-compression, system-condense, XML-strip, history-condense) still execute regardless of native mode
- [ ] **AC-US2-04**: Env override `LMSTUDIO_NATIVE=0` forces the OpenAI translation path (escape hatch for compatibility)
- [ ] **AC-US2-05**: Proxy banner includes "LMStudio native Anthropic mode" line when active
- [ ] **AC-US2-06**: Bench S5 realistic payload (30 tools + 10K system prompt) in native mode is no slower than translation mode

### US-003: Extract LocalOptimizer module
**Project**: anymodel

**As a** developer
**I want** the 180-line `isLocal` block in `handleMessages` extracted to `providers/local-optimizer.mjs`
**So that** I can unit-test each optimization pass independently

**Acceptance Criteria**:
- [ ] **AC-US3-01**: `providers/local-optimizer.mjs` exports `optimizeForLocal(parsed, ctx) → { parsed, telemetry }` where `ctx` includes `providerName`, `numCtx`, env overrides
- [ ] **AC-US3-02**: `handleMessages` in `proxy.mjs` calls the optimizer in exactly ONE place; no behavior change vs pre-extraction
- [ ] **AC-US3-03**: New `test/local-optimizer.test.mjs` has direct unit tests for each pass: tool-compress, system-condense, XML-strip, history-condense, prefix-cache (Ollama-only)
- [ ] **AC-US3-04**: Full pre-existing test suite (260+ tests) continues passing unchanged
- [ ] **AC-US3-05**: LOC delta in `proxy.mjs`: ~−180 (block moved); LOC delta in new file: ~+200

### US-004: Remove `_unused` placeholder hack
**Project**: anymodel

**As a** maintainer
**I want** to stop injecting `_unused` placeholder properties into empty tool schemas
**So that** real tools named `_unused` aren't corrupted and code simplifies

**Acceptance Criteria**:
- [ ] **AC-US4-01**: `sanitizeBody` in `proxy.mjs` uses `{ type: "object", additionalProperties: false }` for tool schemas with empty `properties`
- [ ] **AC-US4-02**: Remove `_unused` / `_placeholder` stripping from: `sanitizeToolUseResponse` (proxy.mjs), response JSON parse path, streaming regex replace in proxy.mjs, response translators in `openai.mjs` and `ollama.mjs` — 4+ deletion sites
- [ ] **AC-US4-03**: New regression test: tool named `_unused` with real schema survives a full request→response round-trip unchanged
- [ ] **AC-US4-04**: Integration smoke: OpenAI (real), LMStudio (local), Ollama (local) all accept the new empty-schema form without errors
- [ ] **AC-US4-05**: LOC delta: −35 total across the 5+ files

### US-005: Prune FREE_MODELS allowlist
**Project**: anymodel

**As a** user
**I want** `--free-only` to trust the `:free` suffix convention rather than a hardcoded curated list
**So that** the tool doesn't go stale when OpenRouter's free tier changes

**Acceptance Criteria**:
- [ ] **AC-US5-01**: `isFreeTierModel(model)` in `proxy.mjs` returns `true` for any model ID ending in `:free`; remove the `FREE_MODELS` array in `cli.mjs`
- [ ] **AC-US5-02**: Keep `openrouter/free` auto-router as the sole special-cased model (not just `:free`-suffixed)
- [ ] **AC-US5-03**: `printHelp()` and README stop enumerating specific free models; describe the `:free` suffix convention instead
- [ ] **AC-US5-04**: Existing tests covering `freeOnly` mode updated to not depend on specific hardcoded model names
- [ ] **AC-US5-05**: LOC delta: −14 from cli.mjs

### US-006: Fix `output_tokens=0` SSE bug
**Project**: anymodel

**As a** Claude Code user
**I want** `/context` to report accurate `output_tokens` when routed through AnyModel
**So that** session budget tracking matches reality

**Acceptance Criteria**:
- [ ] **AC-US6-01**: AnyModel's OpenAI SSE→Anthropic SSE translator (`providers/openai.mjs::createStreamTranslator`) forwards `usage.output_tokens` in the final `message_delta` event when upstream emits usage data
- [ ] **AC-US6-02**: Regression test: POST streaming request via proxy, parse SSE, assert final `message_delta` carries non-zero `output_tokens` when upstream provided `completion_tokens`
- [ ] **AC-US6-03**: Non-streaming responses continue reporting correct usage (no regression)
- [ ] **AC-US6-04**: Gracefully handles upstreams that omit usage (field remains 0 rather than throwing)

## Non-goals

- NO changes to `providers/prefix-cache.mjs` (keep as-is; revisit in 1.13 with telemetry)
- NO changes to Ollama-specific optimizations (`think:false`, `keep_alive`, `capability-cache`)
- NO changes to external CLI surface, env vars, or existing documented flags
- NO new dependencies
- NO protocol changes on the wire for any existing backend

## Metrics / success criteria

- `wc -l cli.mjs proxy.mjs providers/*.mjs` shows **≤ 2,570 LOC** (target 2,568, baseline 2,828)
- `npm test` reports **all 260 pre-existing tests green** + new test files green
- Bench S5 realistic payload via LMStudio native mode: TTFT ≤ current proxy TTFT
- `output_tokens` reported in `/context` matches upstream within ±5 tokens on a 300-token response
- `npm publish` produces valid 1.12.0 tarball that installs and launches end-to-end

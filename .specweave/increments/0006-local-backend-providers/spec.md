---
status: completed
---
# Spec: Local Backend Providers — LMStudio + llama.cpp

**Status**: active | **Type**: feature | **Priority**: P2
**Brainstorm**: [`.specweave/docs/brainstorms/2026-04-20-lmstudio-llamacpp-providers.md`](../../docs/brainstorms/2026-04-20-lmstudio-llamacpp-providers.md) (Approach D)

## Problem

AnyModel advertises "local model support" via Ollama only. LMStudio and llama.cpp — the other two widely-used local inference stacks — *technically* work via the generic `openai` provider + `OPENAI_BASE_URL`, but that path is:

- **Undiscoverable** — users have no way to know without reading the source
- **Misleading** — the banner says `openai` when the user is actually running LMStudio
- **Invisible to search** — GitHub / Google searches for "lmstudio proxy claude code" or "llama.cpp claude code" never surface AnyModel

## Goal

First-class CLI flags, auto-detection, and banner recognition for LMStudio (`:1234`) and llama.cpp (`:8080`) — **without duplicating** the OpenAI translator layer.

## User Stories

### US-001: LMStudio as first-class provider
**Project**: anymodel

**As a** developer running LMStudio locally
**I want** `anymodel proxy lmstudio` to just work
**So that** I don't have to configure `OPENAI_BASE_URL` manually or read the source to discover support.

**Acceptance Criteria**:
- [x] **AC-US1-01**: `anymodel proxy lmstudio` starts the proxy pointed at `http://localhost:1234/v1` by default
- [x] **AC-US1-02**: `anymodel proxy --lmstudio` (flag form) works identically
- [x] **AC-US1-03**: `LMSTUDIO_BASE_URL` env var overrides the default base URL
- [x] **AC-US1-04**: When `--model` is not specified, the proxy queries `GET /v1/models` and picks the first available model
- [x] **AC-US1-05**: Banner shows `lmstudio` as the provider name and the detected model

### US-002: llama.cpp (`llama-server`) as first-class provider
**Project**: anymodel

**As a** developer running `llama-server` (raw llama.cpp)
**I want** `anymodel proxy llamacpp` to just work
**So that** I can drive the lightest local inference stack from Claude Code without wiring env vars.

**Acceptance Criteria**:
- [x] **AC-US2-01**: `anymodel proxy llamacpp` starts the proxy pointed at `http://localhost:8080/v1` by default
- [x] **AC-US2-02**: `anymodel proxy --llamacpp` (flag form) works identically
- [x] **AC-US2-03**: `LLAMACPP_BASE_URL` env var overrides the default base URL
- [x] **AC-US2-04**: When `--model` is not specified, the proxy queries `GET /v1/models` and picks the first available model
- [x] **AC-US2-05**: Banner shows `llamacpp` as the provider name and the detected model

### US-003: Auto-detection falls through to local backends
**Project**: anymodel

**As a** developer with no API keys set but a local backend running
**I want** `anymodel proxy` to auto-pick the running backend
**So that** the zero-config path works for all three local stacks, not just Ollama.

**Acceptance Criteria**:
- [x] **AC-US3-01**: `detectProvider()` priority chain: `openrouter` (key) → `openai` (key) → `ollama` (probe) → `lmstudio` (probe) → `llamacpp` (probe) → `null`
- [x] **AC-US3-02**: When Ollama is the only running backend, it still wins (no regression)
- [x] **AC-US3-03**: When only LMStudio is running, it is auto-selected
- [x] **AC-US3-04**: When only llama-server is running, it is auto-selected
- [x] **AC-US3-05**: Priority is deterministic — Ollama beats LMStudio beats llama.cpp when multiple are up

### US-004: Docs — README + website reflect all three backends
**Project**: anymodel

**As a** visitor to the README or anymodel.dev
**I want** to see LMStudio and llama.cpp listed as first-class backends alongside Ollama
**So that** I can evaluate the tool for my preferred stack without digging.

**Acceptance Criteria**:
- [x] **AC-US4-01**: `README.md` has a "Local backends" section listing all three with ports, CLI, and env vars
- [x] **AC-US4-02**: `site/index.html` (anymodel.dev) mentions LMStudio + llama.cpp alongside Ollama
- [x] **AC-US4-03**: Note about GGUF portability (same weights run across all three)

## Non-goals

- NO duplication of `translateRequest`/`translateResponse`/`createStreamTranslator` — delegate to `providers/openai.mjs`
- NO backend-specific knobs (`cache_prompt`, `mirostat`, `n_predict`) yet — promotion path documented in brainstorm
- NO changes to `proxy.mjs` — new providers use `name !== 'ollama'` so they fall through to the OpenAI code path
- NO new dependencies

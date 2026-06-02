---
increment: 0013-local-agentic-hardening
title: "Local agentic reliability hardening (post-1.15.0)"
type: bug
priority: P1
status: planned
created: 2026-06-02
structure: user-stories
test_mode: TDD
coverage_target: 80
---

# Feature: Local agentic reliability hardening (post-1.15.0)

## Overview

Root-cause diagnosis (2026-06-02, `docs/2026-06-02-qwen-local-agentic-diagnosis.md`) found that local
Qwen "isn't usable" for agentic coding was **primarily** a version skew: the published/global
`anymodel@1.14.1` strips Claude Code's system prompt + skill catalog + behavioral rules but has **no
re-injection**; the restore half (`skill-catalog.mjs`, increment 0010) shipped only in `1.15.0`. That
dominant cause is **already fixed** in 1.15.0 (now installed globally). The single-turn translation path
(P0.1 flush, P0.2 text-channel recovery, P0.3 timeout, P1.1 per-index routing) is verified sound
(444/444 tests + live probes).

This increment closes the **second-order residual gaps** that remain even in 1.15.0, ranked by the
diagnosis. Goal: make a local Qwen session survive a *long, multi-turn* agentic task without losing
skill state, dropping screenshots, mis-parsing tool calls, or dead-ending on a refusal.

**Backend under test:** LM Studio MLX `qwen/qwen3-coder-30b` (+ `qwen3-coder-next` 80B), M4 Max 128GB.

## User Stories

### US-001: Skill catalog survives the whole session
**Project**: anymodel

**As a** developer driving Claude Code through a local-provider proxy
**I want** the skill catalog re-injected on every turn (not just turn 1) and a loud warning when re-injection is missing
**So that** the model can keep triggering SpecWeave/project skills across a long task instead of looping or hedging

**Acceptance Criteria**:
- [ ] **AC-US1-01**: When a turn-2+ request arrives with no `<system-reminder>` skill catalog, the proxy re-injects the catalog harvested and cached on turn 1 (per-session, stable key).
- [ ] **AC-US1-02**: `buildBehavioralCore` no longer emits the dangling "available skills listed below" reference when no catalog is available for that turn.
- [ ] **AC-US1-03**: On the first request, if the incoming request contains a Skill tool + skill catalog but re-injection is absent or disabled (the 1.14.1 trim-without-restore state), the proxy logs a single explicit WARNING naming the condition and the fix.

### US-002: 80B text-channel tool calls are recovered
**Project**: anymodel

**As a** user running `qwen3-coder-next` (80B)
**I want** the text-channel recovery parser to handle the paren-variant call form
**So that** an 80B tool call isn't mis-captured as a tool named `web_fetch(url="...")` with empty input

**Acceptance Criteria**:
- [x] **AC-US2-01**: `<function=name(arg="v", ...)>` (paren-variant, including an unclosed `<tool_call>` wrapper) parses to `name` + `input{arg:"v",...}`.
- [x] **AC-US2-02**: Canonical Qwen-XML and Hermes JSON forms continue to parse (no regression).
- [x] **AC-US2-03**: A prose mention of `<function=...>` that is not a real call is NOT converted (false-positive guard).

### US-003: Tool-result images are not silently dropped
**Project**: anymodel

**As a** user whose task includes a Playwright screenshot or image tool result
**I want** image/document blocks in `tool_result` represented instead of dropped
**So that** the model doesn't reason over a partial turn and hallucinate state

**Acceptance Criteria**:
- [x] **AC-US3-01**: An image block in a `tool_result` is emitted as `[image omitted: <N> bytes, <mime>]` for non-vision backends (never silent `''`).
- [x] **AC-US3-02**: Where the backend supports vision, the image is forwarded as an image part.
- [x] **AC-US3-03**: Document blocks get an analogous `[document omitted]` marker.

### US-004: Refusal loops are recoverable
**Project**: anymodel

**As a** user whose local model emits an "I can't browse/deploy" refusal mid-task
**I want** an opt-in single retry that nudges the model to use its tools
**So that** a prose capability-disclaimer doesn't dead-end the loop

**Acceptance Criteria**:
- [ ] **AC-US4-01**: When `LOCAL_REFUSAL_RETRY=on`, a local-provider response that is a capability-disclaimer refusal with `stop_reason:end_turn` AND tools were attached triggers exactly one re-issue with an injected "you have tools; do not disclaim, call a tool" system line.
- [ ] **AC-US4-02**: Default (`off`) preserves current behavior; the retry never fires more than once per turn; non-local providers are untouched.

### US-005: Plan state survives history condensing
**Project**: anymodel

**As a** user on a long task that exceeds the local context budget
**I want** the message-history condenser to preserve plan-mode state and summarize dropped turns
**So that** the model doesn't re-enter plan mode repeatedly and loop

**Acceptance Criteria**:
- [ ] **AC-US5-01**: The condenser never drops the turn that established plan mode nor the most recent `ExitPlanMode`-relevant assistant turn.
- [ ] **AC-US5-02**: Dropped middle turns are replaced with a short structured summary, not the empty `[Earlier conversation condensed]` filler.
- [ ] **AC-US5-03**: A scripted 10-turn task regression gate: turn-2+ skill-trigger rate ≥ 60% and plan-mode re-entry count ≤ 1.

### US-006: A local-agentic profile relaxes over-constrained hooks
**Project**: anymodel

**As a** user running a local model inside a SpecWeave (or similarly hook-heavy) repo
**I want** a documented "local agentic" preset that relaxes mandatory-plan-mode / blocking-SKILL-FIRST directives
**So that** the model isn't commanded to do things that are structurally impossible under `--strict-mcp-config`

**Acceptance Criteria**:
- [ ] **AC-US6-01**: A preset/flag (and `LOCAL_SETUP.md` docs) lets local sessions disable mandatory plan-mode and blocking SKILL-FIRST language, and surfaces guidance to prefer `--full-mcp` when the project depends on the Skill tool.
- [ ] **AC-US6-02**: Default behavior is unchanged unless the preset/flag is opted into.

## Out of scope
- Publishing 1.15.0 to npm (release task, tracked separately; requires OTP).
- Resolving the duplicate `0011` increment (`sw:fix-duplicates`).
- Changing the local condensing strategy wholesale (only plan-state-awareness here).

## References
- `docs/2026-06-02-qwen-local-agentic-diagnosis.md` — full diagnosis + ranked root causes + evidence.
- Increment 0010 (local-skill-fidelity), 0008 (local-model-reliability), 0009 (streaming tool-call recovery).

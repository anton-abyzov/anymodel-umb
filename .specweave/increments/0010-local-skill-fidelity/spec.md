---
increment: 0010-local-skill-fidelity
title: 'Local skill-fidelity: restore skill auto-trigger on local models'
type: feature
priority: P1
status: completed
created: 2026-06-02T00:00:00.000Z
structure: user-stories
test_mode: TDD
coverage_target: 80
---

# Feature: Local skill-fidelity — restore skill auto-trigger on local models

## Problem

Driving a local model (qwen3-coder via LM Studio/Ollama) through AnyModel, **skills don't auto-trigger** the way they do on cloud Opus. Root cause (verified against source): Claude Code injects the skill catalog as a `<system-reminder>` inside the **first user message** (`"The following skills are available for use with the Skill tool:\n\n- name: desc - whenToUse"`). AnyModel's local-provider transform strips that block (`proxy.mjs:544-565`) and condenses `body.system` to CLAUDE.md+date only (`proxy.mjs:502-538`), so the model never learns which skills exist or that matching one is a blocking precondition. The Skill **tool** survives, so the model *can* call it — it just never knows to. The predecessor repo `antonoly/claude-code-anymodel` pins the **same** CC 2.1.88 and simply never trimmed, so this is AnyModel's own regression from increments 0008/0009 — the fix is fresh, not a port.

## Overview

Restore skill auto-trigger + a minimal Claude Code behavioral core on local providers via curated, budgeted, **prefix-cacheable** re-injection — without reintroducing the multi-minute TTFT the trim was built to avoid.

## User Stories

### US-001: Skill catalog re-injection (P1)
**Project**: anymodel

**As a** developer running Claude Code against a local model through AnyModel
**I want** the skill catalog re-injected (compactly) into the request
**So that** the local model knows which skills exist and auto-calls the Skill tool when a request matches.

**Acceptance Criteria**:
- [x] **AC-US1-01**: On a local provider with `LOCAL_FIDELITY=balanced` (default), a request whose user message contains the `"The following skills are available for use with the Skill tool:"` system-reminder results in `parsed.system` containing an `"Available skills (call the Skill tool when a request matches"` block listing the harvested skill names.
- [x] **AC-US1-02**: The re-injected index drops the ` - whenToUse` tail and clamps each description to `LOCAL_SKILL_DESC_CHARS` (default 140) chars per line.
- [x] **AC-US1-03**: The Skill tool definition remains present in `body.tools` after all local transforms, even at minimal tool budget (Skill + ToolSearch never-evict guard).
- [x] **AC-US1-04**: The raw verbose `<system-reminder>` block is still stripped from `parsed.messages` (catalog lives only in system now — no duplication).

---

### US-002: Fidelity dial (P1)
**Project**: anymodel

**As a** latency-sensitive user
**I want** a dial to control how much fidelity is restored
**So that** I can choose working-skills (default) or zero-overhead (lean).

**Acceptance Criteria**:
- [x] **AC-US2-01**: With `LOCAL_FIDELITY=lean`, output is byte-identical to current behavior — no skill block, no behavioral core, no measurable latency change.
- [x] **AC-US2-02**: With `LOCAL_SKILL_INDEX=off`, the harvest/re-inject code path is skipped entirely regardless of fidelity tier.

---

### US-003: Prefix-cache determinism (P1)
**Project**: anymodel

**As a** user on a local MLX model
**I want** the re-injected block to be a one-time cost
**So that** turn-2+ stays fast via KV-cache reuse.

**Acceptance Criteria**:
- [x] **AC-US3-01**: `parsed.system` is byte-identical across 3 consecutive identical requests (date-normalized) — `computePrefixHash` returns the same hash all 3 times.
- [x] **AC-US3-02**: `prefix-cache.getOrStore` is invoked for `lmstudio` and `llamacpp` providers (gate widened from ollama-only), reporting `hit=true` on the 2nd identical request.

---

### US-004: Budget safety (P2)
**Project**: anymodel

**As a** user with many installed skills/plugins
**I want** the index bounded
**So that** a large catalog never blows the context budget.

**Acceptance Criteria**:
- [x] **AC-US4-01**: For ≤70 harvested skills the index is ≤1000 tokens (~4000 chars); above that, relevance filtering keeps `sw:*` + project skills first, caps total index chars at the derived budget, and degrades to names-only under pressure.
- [x] **AC-US4-02**: The curated CC behavioral core in balanced mode is ≤900 tokens and includes the compressed "when a skill matches, call Skill FIRST (blocking requirement)" rule verbatim.

---

### US-005: Edge cases & CLI (P2)
**Project**: anymodel

**As a** user
**I want** re-injection to work on short prompts and from the CLI flag
**So that** the feature is reliable and ergonomic.

**Acceptance Criteria**:
- [x] **AC-US5-01**: Re-injection ALSO runs when the incoming flattened system is already ≤ the cap (short-prompt turn-1), not only when it exceeds the cap.
- [x] **AC-US5-02**: `--local-fidelity full` at the CLI exports `LOCAL_FIDELITY=full` to the proxy and produces a richer index (whenToUse retained) than balanced; MCP suppression behavior is unchanged by the flag.

---

### US-006: Capability eval (regression gate) (P1)
**Project**: anymodel

**As a** maintainer
**I want** a measured floor on real skill triggering
**So that** the feature demonstrably works on the target local model.

**Acceptance Criteria**:
- [x] **AC-US6-01**: For a curated set of 10-20 prompts each designed to match a known skill, qwen3-coder-30b on the local path calls the Skill tool with a valid skill name on **≥60%** of prompts (regression gate vs the current 0% auto-trigger).

## Functional Requirements

- **FR-001**: New `providers/skill-catalog.mjs` exposes pure functions `harvestSkillCatalog`, `selectSkills`, `buildBehavioralCore`.
- **FR-002**: `proxy.mjs` harvests the catalog before stripping, re-injects a curated block into `parsed.system`, and gates everything behind the fidelity knobs.
- **FR-003**: Prefix-cache coverage extends from ollama-only to all local providers.
- **FR-004**: `tool-compressor.mjs` guarantees `Skill` + `ToolSearch` survive budget pressure.
- **FR-005**: `cli.mjs` exposes `--local-fidelity` mirroring `--full-mcp`.

## Success Criteria

- Balanced (default) restores auto-trigger at ≤1/10th the original system-reminder size.
- Cold turn-1 TTFT rises ≤~1.5s on qwen3-coder-30b MLX @32K; turn-2+ ~0ms via KV reuse.
- AC-US6-01 ≥60% live skill-trigger rate on qwen3-coder-30b.

## Out of Scope

Global MCP tool/instruction suppression (handled upstream in cli.mjs; `--full-mcp` already exists). This increment restores skills + behavioral framing only.

## Dependencies

- Increment 0004 (prefix-aware caching) — the re-injected block relies on `prefix-cache.mjs` for byte-stable KV reuse.
- Increments 0008/0009 — the trim being modified; tool translation must remain intact.

## Risks

- Local trigger reliability ~60-85%, not ~100% — keep the blocking rule in BOTH the Skill tool description and the re-injected header; AC-US6-01 gates at ≥60%.
- Prefix-cache determinism is fragile: any per-request variation = every-turn re-prefill (silent multi-second cost). Mitigated by name-sort + date-free block + the 3-turn hash AC.
- Harvest regex brittle to future CC header changes — log a warning when `isLocal && Skill in tools` but harvest is empty.
- Widening prefix-cache touches a hot path — validate with a real two-turn TTFT measurement, not just unit `hit=true`.

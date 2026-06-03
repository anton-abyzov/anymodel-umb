---
increment: 0016-project-scoped-local-skills
title: Project-scoped local skill index
type: feature
priority: P1
status: completed
created: 2026-06-02T00:00:00.000Z
structure: user-stories
test_mode: TDD
coverage_target: 80
---

# Feature: Project-scoped local skill index (context economy + stability)

## Problem

0010 (shipped in `anymodel@1.15.0`) re-injects the harvested skill catalog on local providers. On a real project with many installed skills it injects ~33 mostly-irrelevant **global** skills (~1,147 tok) of prefill every turn. Measured token breakdown of a realistic local request (100 skills, 90 tools, 6.7 KB system) on qwen3-coder-30b MLX: tool schemas 7,757 tok (79%), system 917 tok (9%), **skill index 1,147 tok (12%)**. The skill index is wasted prefill — the model only needs the project's own skills + the SpecWeave workflow. Naive query-relevance gating is a trap: it changes the prefix per turn → busts the KV cache → re-prefills all 7,757 tool tokens every turn. The scoped set must be **stable** (cacheable) and **small**.

## Overview

Add a **scope** dimension to the 0010 re-injection: `balanced` (default) → a small, stable, project-scoped index (project `.claude/skills` names + a curated workflow-core), `full` → the whole catalog (= 0010 behavior), `lean` → nothing. Isolated to `providers/skill-catalog.mjs` + `proxy.mjs` (no `cli.mjs` change — uses `LOCAL_PROJECT_DIR`/cwd to avoid colliding with parallel `cli.mjs` work). Tool handling untouched.

## User Stories

### US-001: Project-scoped default (P1)
**Project**: anymodel

**As a** developer running a local model through AnyModel on a project
**I want** the default skill index restricted to my project's skills + workflow essentials
**So that** I don't pay prefill for ~30 irrelevant global skills every turn.

**Acceptance Criteria**:
- [x] **AC-US1-01**: With `LOCAL_FIDELITY=balanced` (default) the re-injected index contains ONLY harvested skills whose name is a project `.claude/skills` folder OR in the workflow-core/`LOCAL_SKILL_ALWAYS` set; unrelated global skills are dropped.
- [x] **AC-US1-02**: `LOCAL_FIDELITY=full` reproduces 0010 behavior exactly (whole harvested catalog, 4000-char cap, query relevance) — regression guard.
- [x] **AC-US1-03**: On the realistic 100-skill payload, balanced injects ≤ ~500 tok of skills (vs ~1,147 in `full`) — measured via the bench.

### US-002: Stable & cacheable (P1)
**Project**: anymodel

**As a** user on a local MLX model
**I want** the project-scoped index to be query-independent
**So that** it stays in the cacheable prefix and never busts the KV cache.

**Acceptance Criteria**:
- [x] **AC-US2-01**: In project scope, `buildFidelityAddition` produces byte-identical output for two different user queries with the same project + catalog (`computePrefixHash` equal).

### US-003: Project-dir sourcing (P1)
**Project**: anymodel

**As a** user
**I want** the proxy to find my project's skills from a configurable directory
**So that** scoping works without a client change.

**Acceptance Criteria**:
- [x] **AC-US3-01**: `readProjectSkillNames(dir)` returns the subdir names under `<dir>/.claude/skills/` that contain `SKILL.md`, is memoized per dir, and returns `[]` (no throw) on a missing/unreadable dir.
- [x] **AC-US3-02**: The proxy resolves the project dir from `LOCAL_PROJECT_DIR`, falling back to `process.cwd()`.

### US-004: Stability / backward-compat (P1)
**Project**: anymodel

**As a** maintainer
**I want** no regression to existing behavior
**So that** the change is safe to ship.

**Acceptance Criteria**:
- [x] **AC-US4-01**: `LOCAL_FIDELITY=lean` is byte-identical to pre-0016; `tool-compressor.mjs` has no diff (tools untouched); `cli.mjs` has no diff (no flag added here).
- [x] **AC-US4-02**: Full `npm test` suite stays green; live skill-trigger eval stays ≥60% in project scope for in-scope skills.

## New knobs

| Knob | Values | Default | Effect |
|---|---|---|---|
| `LOCAL_PROJECT_DIR` | path | `process.cwd()` | where the proxy reads `.claude/skills/` |
| `LOCAL_SKILL_SCOPE` | `project` \| `all` | derived (`balanced`→project, `full`→all) | override scope independent of tier |
| `LOCAL_SKILL_ALWAYS` | comma list | workflow-core (sw:* essentials) | skills always kept in project scope |

## Out of Scope

- Tool-schema reduction (the 79% elephant) — left untouched for stability; documented + existing `LOCAL_TOOL_BUDGET_PCT`/`LOCAL_MAX_TOOLS` surfaced.
- `--project-dir` CLI flag — deferred (cli.mjs has uncommitted parallel work); `LOCAL_PROJECT_DIR` env covers it.
- 0013 long-session reliability (separate planned increment).

## Dependencies

- Increment 0010 (`skill-catalog.mjs` re-injection) — this refines it.

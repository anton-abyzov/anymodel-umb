---
id: US-001
feature: FS-016
title: "Project-scoped default (P1)"
status: completed
priority: P1
created: 2026-06-02T00:00:00.000Z
tldr: "**As a** developer running a local model through AnyModel on a project."
project: anymodel
---

# US-001: Project-scoped default (P1)

**Feature**: [FS-016](./FEATURE.md)

**As a** developer running a local model through AnyModel on a project
**I want** the default skill index restricted to my project's skills + workflow essentials
**So that** I don't pay prefill for ~30 irrelevant global skills every turn.

---

## Acceptance Criteria

- [x] **AC-US1-01**: With `LOCAL_FIDELITY=balanced` (default) the re-injected index contains ONLY harvested skills whose name is a project `.claude/skills` folder OR in the workflow-core/`LOCAL_SKILL_ALWAYS` set; unrelated global skills are dropped.
- [x] **AC-US1-02**: `LOCAL_FIDELITY=full` reproduces 0010 behavior exactly (whole harvested catalog, 4000-char cap, query relevance) — regression guard.
- [x] **AC-US1-03**: On the realistic 100-skill payload, balanced injects ≤ ~500 tok of skills (vs ~1,147 in `full`) — measured via the bench.

---

## Implementation

**Increment**: [0016-project-scoped-local-skills](../../../../../increments/0016-project-scoped-local-skills/spec.md)

**Tasks**: See increment tasks.md for implementation details.


## Tasks

- [x] **T-002**: scope filter in buildFidelityAddition
- [x] **T-004**: update 0010 integration tests for the new default

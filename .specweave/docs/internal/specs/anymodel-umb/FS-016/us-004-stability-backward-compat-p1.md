---
id: US-004
feature: FS-016
title: "Stability / backward-compat (P1)"
status: completed
priority: P1
created: 2026-06-02T00:00:00.000Z
tldr: "**As a** maintainer."
project: anymodel
---

# US-004: Stability / backward-compat (P1)

**Feature**: [FS-016](./FEATURE.md)

**As a** maintainer
**I want** no regression to existing behavior
**So that** the change is safe to ship.

---

## Acceptance Criteria

- [x] **AC-US4-01**: `LOCAL_FIDELITY=lean` is byte-identical to pre-0016; `tool-compressor.mjs` has no diff (tools untouched); `cli.mjs` has no diff (no flag added here).
- [x] **AC-US4-02**: Full `npm test` suite stays green; live skill-trigger eval stays ≥60% in project scope for in-scope skills.

---

## Implementation

**Increment**: [0016-project-scoped-local-skills](../../../../../increments/0016-project-scoped-local-skills/spec.md)

**Tasks**: See increment tasks.md for implementation details.


## Tasks

_No tasks defined for this user story_

---
id: US-002
feature: FS-016
title: "Stable & cacheable (P1)"
status: completed
priority: P1
created: 2026-06-02T00:00:00.000Z
tldr: "**As a** user on a local MLX model."
project: anymodel
---

# US-002: Stable & cacheable (P1)

**Feature**: [FS-016](./FEATURE.md)

**As a** user on a local MLX model
**I want** the project-scoped index to be query-independent
**So that** it stays in the cacheable prefix and never busts the KV cache.

---

## Acceptance Criteria

- [x] **AC-US2-01**: In project scope, `buildFidelityAddition` produces byte-identical output for two different user queries with the same project + catalog (`computePrefixHash` equal).

---

## Implementation

**Increment**: [0016-project-scoped-local-skills](../../../../../increments/0016-project-scoped-local-skills/spec.md)

**Tasks**: See increment tasks.md for implementation details.


## Tasks

_No tasks defined for this user story_

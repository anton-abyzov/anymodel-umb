---
id: US-004
feature: FS-010
title: "Budget safety (P2)"
status: completed
priority: P1
created: 2026-06-02T00:00:00.000Z
tldr: "**As a** user with many installed skills/plugins."
project: anymodel
---

# US-004: Budget safety (P2)

**Feature**: [FS-010](./FEATURE.md)

**As a** user with many installed skills/plugins
**I want** the index bounded
**So that** a large catalog never blows the context budget.

---

## Acceptance Criteria

- [x] **AC-US4-01**: For ≤70 harvested skills the index is ≤1000 tokens (~4000 chars); above that, relevance filtering keeps `sw:*` + project skills first, caps total index chars at the derived budget, and degrades to names-only under pressure.
- [x] **AC-US4-02**: The curated CC behavioral core in balanced mode is ≤900 tokens and includes the compressed "when a skill matches, call Skill FIRST (blocking requirement)" rule verbatim.

---

## Implementation

**Increment**: [0010-local-skill-fidelity](../../../../../increments/0010-local-skill-fidelity/spec.md)

**Tasks**: See increment tasks.md for implementation details.


## Tasks

_No tasks defined for this user story_

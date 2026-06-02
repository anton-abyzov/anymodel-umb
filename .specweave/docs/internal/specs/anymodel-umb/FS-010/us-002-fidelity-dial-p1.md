---
id: US-002
feature: FS-010
title: "Fidelity dial (P1)"
status: completed
priority: P1
created: 2026-06-02T00:00:00.000Z
tldr: "**As a** latency-sensitive user."
project: anymodel
---

# US-002: Fidelity dial (P1)

**Feature**: [FS-010](./FEATURE.md)

**As a** latency-sensitive user
**I want** a dial to control how much fidelity is restored
**So that** I can choose working-skills (default) or zero-overhead (lean).

---

## Acceptance Criteria

- [x] **AC-US2-01**: With `LOCAL_FIDELITY=lean`, output is byte-identical to current behavior — no skill block, no behavioral core, no measurable latency change.
- [x] **AC-US2-02**: With `LOCAL_SKILL_INDEX=off`, the harvest/re-inject code path is skipped entirely regardless of fidelity tier.

---

## Implementation

**Increment**: [0010-local-skill-fidelity](../../../../../increments/0010-local-skill-fidelity/spec.md)

**Tasks**: See increment tasks.md for implementation details.


## Tasks

- [x] **T-010**: Integration test suite
- [x] **T-011**: Docs — LOCAL_SETUP.md

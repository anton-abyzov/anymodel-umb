---
id: US-005
feature: FS-013
title: "Plan state survives history condensing"
status: not_started
priority: P1
created: 2026-06-02
tldr: "**As a** user on a long task that exceeds the local context budget."
project: anymodel
---

# US-005: Plan state survives history condensing

**Feature**: [FS-013](./FEATURE.md)

**As a** user on a long task that exceeds the local context budget
**I want** the message-history condenser to preserve plan-mode state and summarize dropped turns
**So that** the model doesn't re-enter plan mode repeatedly and loop

---

## Acceptance Criteria

- [ ] **AC-US5-01**: The condenser never drops the turn that established plan mode nor the most recent `ExitPlanMode`-relevant assistant turn.
- [ ] **AC-US5-02**: Dropped middle turns are replaced with a short structured summary, not the empty `[Earlier conversation condensed]` filler.
- [ ] **AC-US5-03**: A scripted 10-turn task regression gate: turn-2+ skill-trigger rate ≥ 60% and plan-mode re-entry count ≤ 1.

---

## Implementation

**Increment**: [0013-local-agentic-hardening](../../../../../increments/0013-local-agentic-hardening/spec.md)

**Tasks**: See increment tasks.md for implementation details.


## Tasks

_No tasks defined for this user story_

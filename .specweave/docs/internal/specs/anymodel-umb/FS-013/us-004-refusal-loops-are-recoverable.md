---
id: US-004
feature: FS-013
title: "Refusal loops are recoverable"
status: not_started
priority: P1
created: 2026-06-02
tldr: "**As a** user whose local model emits an 'I can't browse/deploy' refusal mid-task."
project: anymodel
---

# US-004: Refusal loops are recoverable

**Feature**: [FS-013](./FEATURE.md)

**As a** user whose local model emits an "I can't browse/deploy" refusal mid-task
**I want** an opt-in single retry that nudges the model to use its tools
**So that** a prose capability-disclaimer doesn't dead-end the loop

---

## Acceptance Criteria

- [ ] **AC-US4-01**: When `LOCAL_REFUSAL_RETRY=on`, a local-provider response that is a capability-disclaimer refusal with `stop_reason:end_turn` AND tools were attached triggers exactly one re-issue with an injected "you have tools; do not disclaim, call a tool" system line.
- [ ] **AC-US4-02**: Default (`off`) preserves current behavior; the retry never fires more than once per turn; non-local providers are untouched.

---

## Implementation

**Increment**: [0013-local-agentic-hardening](../../../../../increments/0013-local-agentic-hardening/spec.md)

**Tasks**: See increment tasks.md for implementation details.


## Tasks

_No tasks defined for this user story_
